import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const TOKEN = 'teleglance-dev'
const WRONG = 'definitely-not-the-token'

// --- HTTP integration tests against the real server ---
// Own port: each test file spawns its own server, so the in-memory
// /pairing-code rate-limit buckets never leak across files.
let server
const SERVER_PORT = 18791
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
  server = spawn('node', ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(SERVER_PORT), TELEGLANCE_DB: ':memory:' },
    stdio: 'pipe',
  })
  await waitHealth(`${BASE}/health`)
})

after(async () => {
  server.kill()
})

function get(path, token = TOKEN) {
  const headers = {}
  if (token) headers['x-pairing-token'] = token
  return fetch(`${BASE}${path}`, { headers })
}

test('/digest requires the pairing token', async () => {
  const noToken = await get('/digest', null)
  assert.equal(noToken.status, 401)
  assert.match((await noToken.json()).error, /pairing token/i)

  const wrongToken = await get('/digest', WRONG)
  assert.equal(wrongToken.status, 401)

  const ok = await get('/digest')
  assert.equal(ok.status, 200)
  const data = await ok.json()
  assert.equal(data.counts.urgent, 1) // seed demo digest still intact
})

test('/item/:id requires the pairing token', async () => {
  assert.equal((await get('/item/1', null)).status, 401)
  assert.equal((await get('/item/1', WRONG)).status, 401)

  const ok = await get('/item/1')
  assert.equal(ok.status, 200)
  assert.equal((await ok.json()).id, 1)

  const missing = await get('/item/999')
  assert.equal(missing.status, 404)
})

test('/drafts/:id requires the pairing token', async () => {
  assert.equal((await get('/drafts/1', null)).status, 401)
  assert.equal((await get('/drafts/1', WRONG)).status, 401)

  const ok = await get('/drafts/1')
  assert.equal(ok.status, 200)
  const data = await ok.json()
  assert.equal(data.itemId, 1)
  assert.equal(data.drafts.length, 3)

  const missing = await get('/drafts/999')
  assert.equal(missing.status, 404)
})

test('/pairing-code rate limit: 5 codes, then an honest 429', async () => {
  // This is the ONLY test in this file that calls /pairing-code, so the
  // per-IP bucket starts empty here.
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${BASE}/pairing-code`)
    assert.equal(r.status, 200, `call ${i + 1} should succeed`)
    const data = await r.json()
    assert.match(data.code, /^\d{6}$/)
    assert.equal(data.expiresInSec, 600)
  }
  const limited = await fetch(`${BASE}/pairing-code`)
  assert.equal(limited.status, 429)
  assert.match((await limited.json()).error, /too many/i)
})

test('/health stays open (healthchecks need no token)', async () => {
  const r = await fetch(`${BASE}/health`)
  assert.equal(r.status, 200)
  assert.equal((await r.json()).ok, true)
})
