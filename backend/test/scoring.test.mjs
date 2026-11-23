import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreMessage, buildDrafts, buildDigest } from '../src/scoring.mjs'
import { Store } from '../src/store.mjs'
import { seed } from '../src/seed.mjs'

test('moved team call with a question scores urgent', () => {
  const r = scoreMessage({ text: 'Team call moved to 15:00 — ok with you? Need a yes before 13:00.' })
  assert.equal(r.bucket, 'urgent')
})

test('short reactions score noise', () => {
  assert.equal(scoreMessage({ text: 'gm' }).bucket, 'noise')
  assert.equal(scoreMessage({ text: 'thanks!' }).bucket, 'noise')
  assert.equal(scoreMessage({ text: '👍' }).bucket, 'noise')
})

test('announcement scores fyi', () => {
  const r = scoreMessage({ text: 'Community call recap is published: new moderator rotation starts next week, details inside.' })
  assert.equal(r.bucket, 'fyi')
})

test('moved-call drafts carry the new time', () => {
  const drafts = buildDrafts({ text: 'Team call moved to 15:00 — ok with you?' })
  assert.equal(drafts.length, 3)
  assert.match(drafts[0], /15:00/)
})

test('seed builds the concept digest shape: 1 urgent, 6 fyi, 40 noise', () => {
  const store = new Store(':memory:')
  seed(store)
  const digest = buildDigest(store.recentMessages())
  assert.equal(digest.counts.urgent, 1)
  assert.equal(digest.counts.fyi, 6)
  assert.equal(digest.counts.noise, 40)
  assert.equal(digest.counts.chats, 3)
  assert.equal(digest.items[0].bucket, 'urgent')
  assert.equal(digest.items[0].drafts.length, 3)
})
