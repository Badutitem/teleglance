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
