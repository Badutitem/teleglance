// TeleGlance backend — Node stdlib only (http + node:sqlite + fetch).
// Endpoints: /health /digest /item/:id /drafts/:id /send /pairing-code /link /chats/write
import { createServer } from 'node:http'
import { Store } from './store.mjs'
import { TelegramBot } from './telegram.mjs'
import { buildDigest, buildDrafts, toDigestItem } from './scoring.mjs'
import { seed } from './seed.mjs'

const PORT = Number(process.env.PORT || 8787)
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const path = url.pathname
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {})

    if (path === '/health') {
      return json(res, 200, { ok: true, telegramIngest: !!bot, readOnly: READ_ONLY, messages: store.countMessages() })
    }

    if (path === '/digest' && req.method === 'GET') {
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
      const row = store.getMessage(Number(itemMatch[1]))
      if (!row) return json(res, 404, { error: 'item not found' })
      const item = toDigestItem(row)
      item.writeEnabled = store.isWriteEnabled(row.chat_id) || String(row.chat_id || '').startsWith('demo-')
      item.readOnly = READ_ONLY
      return json(res, 200, item)
    }

    const draftsMatch = path.match(/^\/drafts\/(\d+)$/)
    if (draftsMatch && req.method === 'GET') {
      const row = store.getMessage(Number(draftsMatch[1]))
      if (!row) return json(res, 404, { error: 'item not found' })
      return json(res, 200, { itemId: row.id, drafts: buildDrafts(row) })
    }

    if (path === '/pairing-code' && req.method === 'GET') {
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
      const drafts = buildDrafts(row)
      const draft = drafts[Number(body.draftIndex || 0)]
      if (!draft) return json(res, 400, { error: 'draft index out of range' })

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
