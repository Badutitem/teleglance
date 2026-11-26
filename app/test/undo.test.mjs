import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UNDO_WINDOW_MS, undoSecondsLeft, UndoGuard } from '../src/undo.ts'

test('UNDO_WINDOW_MS is 3 seconds', () => {
  assert.equal(UNDO_WINDOW_MS, 3000)
})

test('undoSecondsLeft counts down in whole seconds, clamped to [0, 3]', () => {
  assert.equal(undoSecondsLeft(3000, 0), 3)
  assert.equal(undoSecondsLeft(3000, 900), 3)
  assert.equal(undoSecondsLeft(3000, 1000), 2)
  assert.equal(undoSecondsLeft(3000, 2001), 1)
  assert.equal(undoSecondsLeft(3000, 2999), 1)
  assert.equal(undoSecondsLeft(3000, 3000), 0)
  assert.equal(undoSecondsLeft(3000, 5000), 0)
})

// Fake scheduler: the test drives the timer by hand, so no real waiting.
function fakeScheduler() {
  let fn = null
  let scheduledMs = -1
  let cleared = false
  return {
    schedule: (f, ms) => {
      fn = f
      scheduledMs = ms
      return 1
    },
    unschedule: (_h) => {
      cleared = true
    },
    fire: () => fn?.(),
    get scheduledMs() {
      return scheduledMs
    },
    get cleared() {
      return cleared
    },
  }
}

test('UndoGuard fires exactly once when the window expires', () => {
  const fake = fakeScheduler()
  const guard = new UndoGuard(fake.schedule, fake.unschedule)
  let fires = 0
  guard.onFire = () => fires++
  assert.equal(guard.arm(1000), true)
  assert.equal(guard.state, 'pending')
  assert.equal(guard.deadlineMs, 4000)
  assert.equal(fake.scheduledMs, 3000)
  assert.equal(guard.secondsLeft(1500), 3)
  assert.equal(guard.secondsLeft(2500), 2)
  fake.fire()
  assert.equal(fires, 1)
  assert.equal(guard.state, 'fired')
  assert.equal(guard.secondsLeft(5000), 0)
  // A second fire of the same callback is a no-op.
  fake.fire()
  assert.equal(fires, 1)
})

test('UndoGuard cancel stops the fire and reports it', () => {
  const fake = fakeScheduler()
  const guard = new UndoGuard(fake.schedule, fake.unschedule)
  let fires = 0
  guard.onFire = () => fires++
  assert.equal(guard.arm(0), true)
  assert.equal(guard.cancel(), true)
  assert.equal(guard.state, 'cancelled')
  assert.equal(fake.cleared, true)
  fake.fire()
  assert.equal(fires, 0)
  // Cancel twice: the second is a no-op.
  assert.equal(guard.cancel(), false)
})

test('UndoGuard rejects a second arm while pending, allows re-arm after cancel', () => {
  const fake = fakeScheduler()
  const guard = new UndoGuard(fake.schedule, fake.unschedule)
  assert.equal(guard.arm(0), true)
  assert.equal(guard.arm(0), false)
  assert.equal(guard.cancel(), true)
  assert.equal(guard.arm(5000), true)
  assert.equal(guard.deadlineMs, 8000)
})

test('UndoGuard cancel on an idle guard is a no-op', () => {
  const guard = new UndoGuard()
  assert.equal(guard.cancel(), false)
  assert.equal(guard.state, 'idle')
})
