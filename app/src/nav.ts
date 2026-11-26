// Pure navigation math for the glasses UI — no SDK imports, so it can be
// unit-tested in plain Node. The SDK scroll events themselves cannot be
// exercised without real G2 hardware (the simulator automation does not
// deliver scroll events to a text-container app, verified 2026-11-23), so
// this is the part of the scroll path that CAN be proven locally.

/** Digest selection: clamp into [0, maxIndex]. maxIndex includes the
 *  trailing "[Pair this app]" row (items.length). */
export function nextSelected(selected: number, dir: number, maxIndex: number): number {
  return Math.min(Math.max(selected + dir, 0), maxIndex)
}

/** Draft cycling: wrap around the draft list (dir +1 = next, -1 = prev). */
export function nextDraftIndex(draftIndex: number, dir: number, count: number): number {
  return (draftIndex + dir + count) % count
}

/** Voice reply is a send, so it follows the same gates as the text drafts:
 * the chat must accept replies, writes must be on (demo chats are on by
 * default; real chats start OFF), and the app must not be read-only. */
export function voiceReplyAvailable(
  item: { canReply: boolean; writeEnabled?: boolean },
  readOnly: boolean,
): boolean {
  if (!item.canReply || readOnly) return false
  return item.writeEnabled !== false
}

/** Selectable rows on a detail page: the text drafts, the trailing
 * [Voice reply] row when it is available, and the trailing [Done] row.
 * Done is always last — marking done is local triage, not a send, so it
 * needs no write gate and is offered on every detail page. */
export function detailOptionCount(draftCount: number, voiceAvailable: boolean): number {
  return draftCount + (voiceAvailable ? 1 : 0) + 1
}

export type DetailRowKind = 'draft' | 'voice' | 'done'

/** Which row draftIndex points at: drafts first, then voice, then done. */
export function detailRowKind(draftIndex: number, draftCount: number, voiceAvailable: boolean): DetailRowKind {
  if (draftIndex < draftCount) return 'draft'
  if (voiceAvailable && draftIndex === draftCount) return 'voice'
  return 'done'
}
