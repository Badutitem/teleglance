import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextSelected,
  nextDraftIndex,
  voiceReplyAvailable,
  detailOptionCount,
} from '../src/nav.ts'

test('nextSelected clamps into [0, maxIndex]', () => {
  assert.equal(nextSelected(0, -1, 3), 0)
  assert.equal(nextSelected(3, 1, 3), 3)
  assert.equal(nextSelected(1, 1, 3), 2)
})

test('nextDraftIndex wraps around the draft list', () => {
  assert.equal(nextDraftIndex(2, 1, 3), 0)
  assert.equal(nextDraftIndex(0, -1, 3), 2)
  assert.equal(nextDraftIndex(1, 1, 4), 2)
  // 3 drafts + voice row: index 3 is the voice row, then wraps to 0.
  assert.equal(nextDraftIndex(3, 1, 4), 0)
  assert.equal(nextDraftIndex(0, -1, 4), 3)
})

test('voiceReplyAvailable follows the same gates as sending', () => {
  // Demo chat, writes on: available.
  assert.equal(voiceReplyAvailable({ canReply: true, writeEnabled: true }, false), true)
  // Offline fallback item (writeEnabled undefined): available, like drafts.
  assert.equal(voiceReplyAvailable({ canReply: true }, false), true)
  // Real chat, writes still OFF: not available.
  assert.equal(voiceReplyAvailable({ canReply: true, writeEnabled: false }, false), false)
  // Draft-only item (private DM) and read-only mode: not available.
  assert.equal(voiceReplyAvailable({ canReply: false, writeEnabled: true }, false), false)
  assert.equal(voiceReplyAvailable({ canReply: true, writeEnabled: true }, true), false)
})

test('detailOptionCount adds the voice row only when available', () => {
  assert.equal(detailOptionCount(3, true), 4)
  assert.equal(detailOptionCount(3, false), 3)
})
