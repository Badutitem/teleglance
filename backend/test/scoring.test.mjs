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

test('drafts are always 3, distinct, and fit the glasses line', () => {
  const samples = [
    'Team call moved to 15:00 — ok with you?',
    'Meeting besok pindah ke jam 10, tolong confirm hari ini ya',
    'Rapat jam 14.30 di ruang 3, jangan telat ya',
    'Deadline laporan malam ini jam 23.59, yang belum submit tolong segera ya',
    'Can you send the signed contract today? Deadline is 17:00',
    'Pengumuman: jadwal maintenance hari Minggu jam 02.00–04.00',
    'Community call recap is published: new moderator rotation starts Monday',
    'wkwkwk iya bener banget',
    'Halo semua, selamat pagi',
  ]
  for (const text of samples) {
    const drafts = buildDrafts({ text })
    assert.equal(drafts.length, 3, text)
    assert.equal(new Set(drafts).size, 3, text)
    for (const d of drafts) assert.ok(d.length <= 90, `${d} (${d.length})`)
  }
})

test('Indonesian moved meeting gets Indonesian drafts with the new time', () => {
  const drafts = buildDrafts({ text: 'Meeting besok pindah ke jam 10, tolong confirm hari ini ya' })
  assert.match(drafts[0], /10:00/)
  assert.match(drafts.join(' '), /Oke|Siap/)
  assert.doesNotMatch(drafts.join(' '), /Works for me/)
})

test('meeting invite (not moved) drafts carry the time', () => {
  const drafts = buildDrafts({ text: 'Rapat jam 14.30 di ruang 3, jangan telat ya' })
  assert.match(drafts[0], /14:30/)
  const en = buildDrafts({ text: 'Standup at 09:30 tomorrow, please be on time' })
  assert.match(en[0], /09:30/)
})

test('question drafts answer in the message language', () => {
  const id = buildDrafts({ text: 'Bisa hadir jam 10 besok?' })
  assert.match(id.join(' '), /Ya|Saya/)
  const en = buildDrafts({ text: 'Can you join the call at 15:00?' })
  assert.match(en[0], /15:00/)
})

test('FYI gets acknowledgement drafts, not question drafts', () => {
  const drafts = buildDrafts({ text: 'Pengumuman: jadwal maintenance hari Minggu jam 02.00–04.00' })
  assert.match(drafts.join(' '), /Makasih|dicatat/)
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
