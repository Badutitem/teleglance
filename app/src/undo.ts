// Undo guard: after the user picks SEND (a text draft or a voice reply),
// the app holds the send for UNDO_WINDOW_MS and shows a countdown. A tap
// inside the window cancels it — no request is ever sent. When the window
// expires untouched, the send fires exactly once.
//
// Pure logic, no SDK imports, so it can be unit-tested in plain Node like
// nav.ts. The scheduler is injectable so tests can drive the timer by hand
// instead of waiting on real time.

export const UNDO_WINDOW_MS = 3000

/** Whole seconds left on the countdown, clamped to [0, 3]. */
export function undoSecondsLeft(deadlineMs: number, nowMs: number): number {
  return Math.max(0, Math.min(3, Math.ceil((deadlineMs - nowMs) / 1000)))
}

export type UndoState = 'idle' | 'pending' | 'fired' | 'cancelled'

export type Scheduler = (fn: () => void, ms: number) => unknown
export type Unscheduler = (handle: unknown) => void

export class UndoGuard {
  state: UndoState = 'idle'
  deadlineMs = 0
  /** Called exactly once when the window expires without a cancel. */
  onFire: (() => void) | null = null
  private handle: unknown = null
  private schedule: Scheduler
  private unschedule: Unscheduler

  constructor(
    schedule: Scheduler = setTimeout,
    // clearTimeout takes a number in the DOM lib; wrap it so the stored
    // handle (unknown) stays type-safe at the call site.
    unschedule: Unscheduler = (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  ) {
    this.schedule = schedule
    this.unschedule = unschedule
  }

  /** Arm the guard. Returns false (and does nothing) if one is already pending. */
  arm(nowMs: number): boolean {
    if (this.state === 'pending') return false
    this.state = 'pending'
    this.deadlineMs = nowMs + UNDO_WINDOW_MS
    this.handle = this.schedule(() => {
      if (this.state !== 'pending') return
      this.state = 'fired'
      this.handle = null
      this.onFire?.()
    }, UNDO_WINDOW_MS)
    return true
  }

  /** Cancel a pending guard. Returns false unless one was pending. */
  cancel(): boolean {
    if (this.state !== 'pending') return false
    this.unschedule(this.handle)
    this.handle = null
    this.state = 'cancelled'
    return true
  }

  secondsLeft(nowMs: number): number {
    return this.state === 'pending' ? undoSecondsLeft(this.deadlineMs, nowMs) : 0
  }
}
