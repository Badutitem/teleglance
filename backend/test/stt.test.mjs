import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { detectLanguage } from '../src/scoring.mjs'

const TOKEN = 'teleglance-dev'
const PCM_B64 = Buffer.alloc(3200).toString('base64') // 100 ms of silence, s16le 16 kHz mono

// --- language detection (pure unit tests) ---
test('detectLanguage: Indonesian markers -> id', () => {
  assert.equal(detectLanguage('Meeting besok pindah ke jam 10, tolong confirm hari ini ya'), 'id')
  assert.equal(detectLanguage('Rapat diundur, mohon konfirmasi segera'), 'id')
})

test('detectLanguage: English -> en', () => {
  assert.equal(detectLanguage('Team call moved to 15:00 — ok with you?'), 'en')
  assert.equal(detectLanguage(''), 'en')
})

// --- HTTP integration tests against the real server + a stub sidecar ---
let stub
let stubPort
let server
const SERVER_PORT = 18787
const BASE = `http://127.0.0.1:${SERVER_PORT}`

async function waitHealth(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return true
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error(`never healthy: ${url}`)
}

before(async () => {
  // Stub sidecar: echoes a canned transcript + the requested language.
  stub = createServer((req, res) => {
    let body = ''
    req.on('data', c => { body += c })
    req.on('end', () => {
      const { language } = JSON.parse(body || '{}')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ transcript: 'Oke, jam sepuluh bisa.', language, durationSec: 0.1, transcribeMs: 5 }))
    })
  })
  await new Promise(r => stub.listen(0, '127.0.0.1', r))
  stubPort = stub.address().port

  server = spawn('node', ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      TELEGLANCE_DB: ':memory:',
      STT_SIDECAR_URL: `http://127.0.0.1:${stubPort}`,
    },
    stdio: 'pipe',
  })
  await waitHealth(`${BASE}/health`)
})

after(async () => {
  server.kill()
  await new Promise(r => stub.close(r))
})

async function post(path, body, token = TOKEN) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers['x-pairing-token'] = token
  return fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
}

test('/stt rejects unauthenticated requests', async () => {
  const r = await post('/stt', { audio: PCM_B64 }, null)
  assert.equal(r.status, 401)
})

test('/stt rejects an empty buffer with an honest error, never a fake transcript', async () => {
  for (const audio of ['', undefined, 'AAAA']) { // '' / missing / 3 bytes (odd length)
    const body = audio === undefined ? {} : { audio }
    const r = await post('/stt', body)
    assert.equal(r.status, 400)
    const data = await r.json()
    assert.match(data.error, /no audio/i)
    assert.equal(data.transcript, undefined)
  }
})

test('/stt transcribes via the sidecar and detects language from the item', async () => {
  const r = await post('/stt', { audio: PCM_B64, itemId: 1 }) // seed item 1: English urgent
  assert.equal(r.status, 200)
  const data = await r.json()
  assert.equal(data.transcript, 'Oke, jam sepuluh bisa.')
  assert.equal(data.language, 'en')
  assert.equal(typeof data.sttMs, 'number')
})

test('/stt honours an explicit language override', async () => {
  const r = await post('/stt', { audio: PCM_B64, language: 'id' })
  assert.equal(r.status, 200)
  assert.equal((await r.json()).language, 'id')
})

test('/stt answers 503 honestly when the sidecar is down', async () => {
  const dead = spawn('node', ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: '18788', TELEGLANCE_DB: ':memory:', STT_SIDECAR_URL: 'http://127.0.0.1:9' },
    stdio: 'pipe',
  })
  try {
    await waitHealth('http://127.0.0.1:18788/health')
    const r = await fetch('http://127.0.0.1:18788/stt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pairing-token': TOKEN },
      body: JSON.stringify({ audio: PCM_B64 }),
    })
    assert.equal(r.status, 503)
    assert.match((await r.json()).error, /sidecar/i)
  } finally {
    dead.kill()
  }
})

test('/send accepts custom voice text on a demo chat (regression: draftIndex still works)', async () => {
  const r = await post('/send', { itemId: 1, text: 'Oke, jam sepuluh bisa.' })
  assert.equal(r.status, 200)
  const data = await r.json()
  assert.equal(data.sent, true)
  assert.equal(data.text, 'Oke, jam sepuluh bisa.')
  const item = await (await fetch(`${BASE}/item/1`)).json()
  assert.equal(item.sentReply, 'Oke, jam sepuluh bisa.')

  const r2 = await post('/send', { itemId: 1, draftIndex: 0 })
  assert.equal(r2.status, 200)
  assert.equal((await r2.json()).text, 'Works for me — see you at 15:00.')
})

test('/send rejects empty or over-long custom text', async () => {
  const r = await post('/send', { itemId: 1, text: '   ' })
  assert.equal(r.status, 400)
  const r2 = await post('/send', { itemId: 1, text: 'x'.repeat(501) })
  assert.equal(r2.status, 400)
})
