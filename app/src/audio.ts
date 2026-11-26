// PCM capture for voice replies — written from the Even Hub SDK 0.0.10
// docs (bridge.audioControl + event.audioEvent), not copied from any
// other app. The G2 mic emits PCM s16le @ 16 kHz, mono; the host pushes
// frames through the bridge and the app batches them, then POSTs the whole
// clip to /stt when the user stops recording. No browser mic APIs are
// involved: getUserMedia is not the path here, the SDK is.
//
// The headless simulator has no live mic: audioControl is a no-op there
// and no frames arrive, so stop() yields an empty buffer and the app
// reports that honestly instead of inventing a transcript.

export type AudioControlFn = (on: boolean) => Promise<boolean> | boolean

/** Normalize one audioEvent payload chunk. The SDK types say Uint8Array,
 * but the .d.ts notes the host may deliver number[] or a base64 string
 * after JSON transport — accept all three, reject anything else. */
export function normalizePcm(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) return raw
  if (typeof raw === 'string') {
    try {
      const bin = atob(raw)
      const out = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
      return out
    } catch {
      return null
    }
  }
  if (Array.isArray(raw) && raw.every(n => typeof n === 'number')) {
    return new Uint8Array(raw as number[])
  }
  return null
}

/** Base64-encode a PCM buffer for the /stt JSON body (chunked so a long
 * clip never blows the argument stack). */
export function pcmToBase64(pcm: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < pcm.length; i += CHUNK) {
    binary += String.fromCharCode(...pcm.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export class PcmRecorder {
  private frames: Uint8Array[] = []
  private bytes = 0
  private recording = false

  /** Begin capture. A failing audioControl (no mic in the simulator) is
   * not fatal: recording proceeds and stop() simply yields an empty
   * buffer, which the caller must report honestly. */
  async start(audioControl: AudioControlFn): Promise<void> {
    this.frames = []
    this.bytes = 0
    this.recording = true
    try {
      await audioControl(true)
    } catch {
      // No live mic (simulator): frames just never arrive.
    }
  }

  push(raw: unknown): void {
    if (!this.recording) return
    const chunk = normalizePcm(raw)
    if (!chunk || chunk.length === 0) return
    this.frames.push(chunk)
    this.bytes += chunk.length
  }

  /** Stop capture and return the batched PCM (possibly empty). */
  async stop(audioControl: AudioControlFn): Promise<Uint8Array> {
    this.recording = false
    try {
      await audioControl(false)
    } catch {
      // Ignore: stopping must never throw.
    }
    const out = new Uint8Array(this.bytes)
    let offset = 0
    for (const f of this.frames) {
      out.set(f, offset)
      offset += f.length
    }
    this.frames = []
    this.bytes = 0
    return out
  }

  get isRecording(): boolean {
    return this.recording
  }

  get frameCount(): number {
    return this.frames.length
  }

  get byteCount(): number {
    return this.bytes
  }
}
