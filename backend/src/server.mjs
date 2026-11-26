// TeleGlance backend — Node stdlib only (http + node:sqlite + fetch).
// Endpoints: /health /digest /item/:id /drafts/:id /send /done /pairing-code /link /chats/write /stt
// /stt forwards PCM to the STT sidecar (backend/stt-sidecar.py, free local
// faster-whisper) — the one deliberate exception to "stdlib-only": Node
// cannot run Whisper in-process. If the sidecar is down, /stt answers 503
// honestly; it never invents a transcript.
import { createServer } from 'node:http'
import { Store } from './store.mjs'
import { TelegramBot } from './telegram.mjs'
import { buildDigest, buildDrafts, detectLanguage, toDigestItem } from './scoring.mjs'
import { seed } from './seed.mjs'

const PORT = Number(process.env.PORT || 8787)
const STT_SIDECAR_URL = (process.env.STT_SIDECAR_URL || 'http://127.0.0.1:8791').replace(/\/$/, '')
const STT_MAX_B64 = 8 * 1024 * 1024 // ~6 MB PCM ≈ 3 min of 16 kHz s16le mono
const DB_PATH = process.env.TELEGLANCE_DB || new URL('../data/teleglance.sqlite', import.meta.url).pathname
// Read-only mode: the digest still builds, but /send always refuses.
// Operator-controlled via env so a demo can run hands-off safely.
const READ_ONLY = process.env.TELEGLANCE_READ_ONLY === '1'
const PAIRING_TOKEN = process.env.PAIRING_TOKEN || 'teleglance-dev' // dev default; pairing flow replaces this
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || ''

const store = new Store(DB_PATH)
if (store.countMessages() === 0) {
  const n = seed(store)
  console.log(`Seeded demo digest (${n} messages)`)
}

const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN, store) : null
if (bot) bot.pollLoop()

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-pairing-token',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  })
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  if (!chunks.length) return {}
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
}

function authed(req, body) {
  const token = req.headers['x-pairing-token'] || body.token
  return token === PAIRING_TOKEN
}

// Rate limit for GET /pairing-code: a 6-digit code is brute-forceable on a
// public host. Max 5 codes per IP per 10 minutes, then an honest 429.
// In-memory only; a restart resets the buckets (acceptable for a demo).
const PAIRING_CODE_WINDOW_MS = 10 * 60 * 1000
const PAIRING_CODE_MAX = 5
const pairingCodeHits = new Map() // ip -> [epochMs, ...]

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim()
  return req.socket.remoteAddress || 'unknown'
}

function pairingCodeAllowed(req) {
  const ip = clientIp(req)
  const now = Date.now()
  const hits = (pairingCodeHits.get(ip) || []).filter(t => now - t < PAIRING_CODE_WINDOW_MS)
  if (hits.length >= PAIRING_CODE_MAX) {
    pairingCodeHits.set(ip, hits)
    return false
  }
  hits.push(now)
  pairingCodeHits.set(ip, hits)
  // Prune stale buckets so the map does not grow forever.
  for (const [key, times] of pairingCodeHits) {
    if (times.every(t => now - t >= PAIRING_CODE_WINDOW_MS)) pairingCodeHits.delete(key)
  }
  return true
}

// Validate a base64 PCM payload (s16le 16 kHz mono, as the G2 mic emits).
// Returns the decoded Buffer, or null when there is nothing to transcribe.
function decodePcm(audio) {
  if (typeof audio !== 'string' || !audio) return null
  let buf
  try { buf = Buffer.from(audio, 'base64') } catch { return null }
  if (!buf.length || buf.length % 2 !== 0) return null
  return buf
}

async function transcribeViaSidecar(audioB64, language) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60000)
  try {
    const res = await fetch(`${STT_SIDECAR_URL}/transcribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audio: audioB64, language }),
      signal: ctrl.signal,
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  } finally {
    clearTimeout(timer)
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {})

    if (path === '/health') {
      return json(res, 200, { ok: true, telegramIngest: !!bot, readOnly: READ_ONLY, messages: store.countMessages() })
    }

    if (path === '/digest' && req.method === 'GET') {
      // Read endpoints are gated too: on a public host anyone who knows
      // the URL could otherwise read the whole digest. The app sends the
      // pairing token on this fetch (see app/src/main.ts loadDigest).
      if (!authed(req, {})) return json(res, 401, { error: 'bad pairing token' })
      const digest = buildDigest(store.recentMessages())
      digest.readOnly = READ_ONLY
      // Demo chats bypass the toggle in /send, so report them as enabled.
      for (const item of digest.items) {
        item.writeEnabled = store.isWriteEnabled(item.chatId) || String(item.chatId).startsWith('demo-')
      }
      return json(res, 200, digest)
    }

    const itemMatch = path.match(/^\/item\/(\d+)$/)
    if (itemMatch && req.method === 'GET') {
      if (!authed(req, {})) return json(res, 401, { error: 'bad pairing token' })
      const row = store.getMessage(Number(itemMatch[1]))
      if (!row) return json(res, 404, { error: 'item not found' })
      const item = toDigestItem(row)
      item.writeEnabled = store.isWriteEnabled(row.chat_id) || String(row.chat_id || '').startsWith('demo-')
      item.readOnly = READ_ONLY
      return json(res, 200, item)
    }

    const draftsMatch = path.match(/^\/drafts\/(\d+)$/)
    if (draftsMatch && req.method === 'GET') {
      if (!authed(req, {})) return json(res, 401, { error: 'bad pairing token' })
      const row = store.getMessage(Number(draftsMatch[1]))
      if (!row) return json(res, 404, { error: 'item not found' })
      return json(res, 200, { itemId: row.id, drafts: buildDrafts(row) })
    }

    if (path === '/pairing-code' && req.method === 'GET') {
      if (!pairingCodeAllowed(req)) return json(res, 429, { error: 'too many pairing codes — try again in a few minutes' })
      return json(res, 200, { code: store.createPairingCode(), expiresInSec: 600 })
    }

    if (path === '/link' && req.method === 'POST') {
      const body = await readBody(req)
      const ok = body.code && body.telegramUserId
        ? store.redeemPairingCode(String(body.code), body.telegramUserId)
        : false
      return json(res, ok ? 200 : 400, { linked: ok })
    }

    if (path === '/chats/write' && req.method === 'POST') {
      const body = await readBody(req)
      if (!authed(req, body)) return json(res, 401, { error: 'bad pairing token' })
      store.setWriteEnabled(body.chatId, !!body.enabled)
      return json(res, 200, { chatId: String(body.chatId), writeEnabled: !!body.enabled })
    }

    if (path === '/done' && req.method === 'POST') {
      const body = await readBody(req)
      // Mark-as-done is local triage, not a send: it needs the pairing
      // token (only the paired user may dismiss items) but deliberately
      // needs NO per-chat write gate and is NOT blocked by read-only mode
      // — nothing is posted to Telegram.
      if (!authed(req, body)) return json(res, 401, { error: 'bad pairing token' })
      const itemId = Number(body.itemId)
      if (!Number.isInteger(itemId) || itemId <= 0) return json(res, 400, { error: 'itemId required' })
      if (!store.markDone(itemId)) return json(res, 404, { error: 'item not found' })
      return json(res, 200, { done: true, itemId })
    }

    if (path === '/stt' && req.method === 'POST') {
      const body = await readBody(req)
      if (!authed(req, body)) return json(res, 401, { error: 'bad pairing token' })
      if (typeof body.audio === 'string' && body.audio.length > STT_MAX_B64) {
        return json(res, 413, { error: 'audio too long (max ~3 minutes)' })
      }
      const pcm = decodePcm(body.audio)
      if (!pcm) {
        // Empty buffer (e.g. simulator with no live mic): an honest error,
        // never a scripted or invented transcript.
        return json(res, 400, { error: 'no audio captured — nothing to transcribe' })
      }
      // STT language follows the message being answered (bilingual, like
      // the drafts); an explicit body.language overrides it.
      let language = body.language === 'id' || body.language === 'en' ? body.language : null
      if (!language && body.itemId) {
        const row = store.getMessage(Number(body.itemId))
        if (row) language = detectLanguage(row.text || '')
      }
      language = language || 'en'
      const t0 = Date.now()
      let stt
      try {
        stt = await transcribeViaSidecar(body.audio, language)
      } catch {
        return json(res, 503, { error: 'speech service unavailable — start the STT sidecar (backend/start-stt-sidecar.sh)' })
      }
      if (stt.status !== 200) {
        return json(res, stt.status === 422 ? 422 : 502, {
          error: stt.data.error || `speech service failed (HTTP ${stt.status})`,
        })
      }
      if (!stt.data.transcript) {
        return json(res, 422, { error: 'no speech detected in the recording' })
      }
      return json(res, 200, {
        transcript: stt.data.transcript,
        language: stt.data.language || language,
        durationSec: stt.data.durationSec,
        sttMs: Date.now() - t0,
      })
    }

    if (path === '/send' && req.method === 'POST') {
      const body = await readBody(req)
      if (!authed(req, body)) return json(res, 401, { error: 'bad pairing token' })
      if (READ_ONLY) return json(res, 403, { error: 'read-only mode is on — sending is disabled' })
      const row = store.getMessage(Number(body.itemId))
      if (!row) return json(res, 404, { error: 'item not found' })
      if (!row.can_reply) {
        return json(res, 422, { error: 'draft-only item: a bot cannot post into a private DM it is not part of' })
      }
      const isDemoChat = String(row.chat_id || '').startsWith('demo-')
      if (!isDemoChat && !store.isWriteEnabled(row.chat_id)) {
        return json(res, 403, { error: 'writes are disabled for this chat (enable per-chat writes first)' })
      }
      // Voice replies send the spoken transcript as custom text; typed
      // drafts keep the existing draftIndex path. Same checks either way.
      let draft
      if (typeof body.text === 'string') {
        draft = body.text.trim()
        if (!draft) return json(res, 400, { error: 'empty reply text' })
        if (draft.length > 500) return json(res, 400, { error: 'reply text too long (max 500 chars)' })
      } else {
        const drafts = buildDrafts(row)
        draft = drafts[Number(body.draftIndex || 0)]
        if (!draft) return json(res, 400, { error: 'draft index out of range' })
      }

      let mode = 'demo-log'
      if (bot && row.chat_id && !isDemoChat) {
        await bot.sendReply(row, draft)
        mode = 'telegram'
      }
      store.markSent(row.id, draft, mode)
      return json(res, 200, { sent: true, mode, text: draft, chatTitle: row.chat_title })
    }

    return json(res, 404, { error: 'not found' })
  } catch (e) {
    return json(res, 500, { error: e.message })
  }
})

server.listen(PORT, () => {
  console.log(`TeleGlance backend on http://127.0.0.1:${PORT} (telegram ingest: ${bot ? 'on' : 'off — set TELEGRAM_BOT_TOKEN'})`)
})
