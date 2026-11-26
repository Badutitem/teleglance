import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { Store } from '../src/store.mjs'
import { seed } from '../src/seed.mjs'
import { buildDigest } from '../src/scoring.mjs'

const TOKEN = 'teleglance-dev'

// --- Store-level: markDone + digest exclusion (pure, no HTTP) ---
test('Store.markDone flags the row and recentMessages excludes it', () => {
  const store = new Store(':memory:')
  seed(store)
  assert.equal(buildDigest(store.recentMessages()).counts.urgent, 1)
  assert.equal(store.markDone(1), true) // seed item 1: the one urgent item
  assert.equal(store.getMessage(1).done, 1)
  assert.ok(store.getMessage(1).done_at > 0)
  const digest = buildDigest(store.recentMessages())
  assert.equal(digest.counts.urgent, 0)
  assert.equal(digest.items.some(i => i.id === 1), false)
  // The other counts are untouched.
  assert.equal(digest.counts.fyi, 6)
  assert.equal(digest.counts.noise, 40)
})

test('Store.markDone is idempotent and honest about unknown ids', () => {
  const store = new Store(':memory:')
  seed(store)
  assert.equal(store.markDone(1), true)
  assert.equal(store.markDone(1), true) // already done: still true, no error
  assert.equal(store.markDone(999), false)
  assert.equal(store.markDone(-3), false)
})

// --- HTTP integration tests against the real server ---
let server
const SERVER_PORT = 18789
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

async function post(path, body, token = TOKEN) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers['x-pairing-token'] = token
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  return fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
}

test('/done rejects unauthenticated requests', async () => {
  const r = await post('/done', { itemId: 1 }, null)
  assert.equal(r.status, 401)
})

test('/done rejects a missing or invalid itemId', async () => {
  for (const body of [{}, { itemId: 'x' }, { itemId: 0 }, { itemId: -2 }]) {
    const r = await post('/done', body)
    assert.equal(r.status, 400, JSON.stringify(body))
  }
})

test('/done answers 404 honestly for an unknown item', async () => {
  const r = await post('/done', { itemId: 999 })
  assert.equal(r.status, 404)
  assert.match((await r.json()).error, /not found/i)
})

test('/done marks the item and the digest drops it with updated counts', async () => {
  const before = await (await fetch(`${BASE}/digest`)).json()
  assert.equal(before.counts.urgent, 1)
  assert.equal(before.items[0].id, 1)

  const r = await post('/done', { itemId: 1 })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { done: true, itemId: 1 })

  const after = await (await fetch(`${BASE}/digest`)).json()
  assert.equal(after.counts.urgent, 0)
  assert.equal(after.items.some(i => i.id === 1), false)

  // Done is a digest dismissal, not a delete: the row is still readable.
  const item = await (await fetch(`${BASE}/item/1`)).json()
  assert.equal(item.id, 1)
  assert.equal(item.done, true)
})

test('/done needs no write gate, while /send still enforces it', async () => {
  // A real (non-demo) chat with writes OFF, built in a temp file DB:
  // /done must succeed (nothing is posted to Telegram) while /send
  // must still refuse with 403. This is the whole point of the gate split.
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'iris-done-test-'))
  const dbPath = join(dir, 'test.sqlite')
  const store = new Store(dbPath)
  store.addMessage({
    updateKey: 'real-chat-1',
    chatId: 'real-123',
    tgMessageId: 7,
    chatTitle: 'Real Group',
    sender: 'Waka',
    text: 'Meeting besok pindah ke jam 10, tolong confirm hari ini ya',
    dateUnix: Math.floor(Date.now() / 1000) - 600,
    canReply: true,
  })
  const itemId = store.recentMessages()[0].id
  store.db.close()

  const realPort = 18790
  const real = spawn('node', ['src/server.mjs'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, PORT: String(realPort), TELEGLANCE_DB: dbPath },
    stdio: 'pipe',
  })
  try {
    await waitHealth(`http://127.0.0.1:${realPort}/health`)
    const base = `http://127.0.0.1:${realPort}`
    const doneRes = await post(`${base}/done`, { itemId })
    assert.equal(doneRes.status, 200)
    // And the send gate still holds for the same chat: re-mark a fresh
    // copy is not possible (already done), so check /send on the done
    // item — the write gate fires before any send logic runs.
    const sendRes = await post(`${base}/send`, { itemId, draftIndex: 0 })
    assert.equal(sendRes.status, 403)
    assert.match((await sendRes.json()).error, /writes are disabled/i)
  } finally {
    real.kill()
  }
})
