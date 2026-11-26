import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePcm, pcmToBase64, PcmRecorder } from '../src/audio.ts'

test('normalizePcm accepts Uint8Array, number[] and base64, rejects the rest', () => {
  const bytes = new Uint8Array([0, 1, 2, 255])
  assert.deepEqual(normalizePcm(bytes), bytes)
  assert.deepEqual(normalizePcm([0, 1, 2, 255]), bytes)
  assert.deepEqual(normalizePcm(Buffer.from(bytes).toString('base64')), bytes)
  assert.equal(normalizePcm('!!!not-base64!!!'), null)
  assert.equal(normalizePcm({ audioPcm: bytes }), null)
  assert.equal(normalizePcm(null), null)
  assert.equal(normalizePcm(undefined), null)
})

test('pcmToBase64 round-trips a long clip', () => {
  const pcm = new Uint8Array(100_000)
  for (let i = 0; i < pcm.length; i++) pcm[i] = i % 256
  assert.equal(pcmToBase64(pcm), Buffer.from(pcm).toString('base64'))
})

test('PcmRecorder batches frames in order across all three input forms', async () => {
  const calls = []
  const control = async (on) => { calls.push(on); return true }
  const rec = new PcmRecorder()
  assert.equal(rec.isRecording, false)
  await rec.start(control)
  assert.equal(rec.isRecording, true)
  rec.push(new Uint8Array([1, 2]))
  rec.push([3, 4])
  rec.push(Buffer.from([5, 6]).toString('base64'))
  rec.push(null) // ignored
  rec.push(new Uint8Array([])) // ignored
  assert.equal(rec.frameCount, 3)
  assert.equal(rec.byteCount, 6)
  const out = await rec.stop(control)
  assert.deepEqual(out, new Uint8Array([1, 2, 3, 4, 5, 6]))
  assert.equal(rec.isRecording, false)
  assert.deepEqual(calls, [true, false])
})

test('PcmRecorder ignores pushes when not recording and survives a failing audioControl', async () => {
  const failing = async () => { throw new Error('no mic') }
  const rec = new PcmRecorder()
  rec.push(new Uint8Array([9]))
  assert.equal(rec.byteCount, 0)
  await rec.start(failing) // must not throw: simulator has no live mic
  assert.equal(rec.isRecording, true)
  const out = await rec.stop(failing)
  assert.equal(out.length, 0) // empty buffer: the honest empty path
})

test('PcmRecorder stop() resets state for the next recording', async () => {
  const ok = async () => true
  const rec = new PcmRecorder()
  await rec.start(ok)
  rec.push(new Uint8Array([7, 8]))
  await rec.stop(ok)
  await rec.start(ok)
  assert.equal(rec.byteCount, 0)
  rec.push(new Uint8Array([9]))
  assert.deepEqual(await rec.stop(ok), new Uint8Array([9]))
})
