import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { nextSelected, nextDraftIndex, voiceReplyAvailable, detailOptionCount, detailRowKind } from './nav'
import { UndoGuard } from './undo'
import { PcmRecorder, pcmToBase64 } from './audio'

// TeleGlance talks ONLY to its own origin: Vite (dev) proxies /api to the
// user's backend on 127.0.0.1:8787 — see vite.config.ts and app.json.
// The pairing token below is a local development placeholder — the real
// pairing flow (Nov 25) binds the app via a 6-digit code sent to the bot.
const BACKEND_URL = '/api'
const PAIRING_TOKEN = 'teleglance-dev'

// Rendering strategy: ONE startup page with three text containers
// (header / main / action), updated in place via textContainerUpgrade —
// the pattern the official templates prove against this host.
// (rebuildPageContainer calls were accepted by the simulator but never
// changed the displayed page, verified 2026-11-23; do not reintroduce.)

type DigestItem = {
  id: number
  chatId?: string
  chatTitle: string
  sender: string
  text: string
  bucket: 'urgent' | 'fyi' | 'noise'
  canReply: boolean
  writeEnabled?: boolean
  timeLabel: string
  drafts: string[]
  line: string
  sentReply: string | null
}

type Digest = {
  generatedAtLabel: string
  counts: { urgent: number; fyi: number; noise: number; chats: number }
  items: DigestItem[]
  readOnly?: boolean
}

// Offline fallback so the simulator demo never shows a dead screen. Clearly
// labelled in the header when in use; the live path is the backend digest.
const FALLBACK: Digest = {
  generatedAtLabel: '--:--',
  counts: { urgent: 1, fyi: 6, noise: 40, chats: 3 },
  items: [
    {
      id: 1,
      chatTitle: 'Alpha Group',
      sender: 'Rani',
      text: 'Team call moved to 15:00 — ok with you? Need a yes before 13:00.',
      bucket: 'urgent',
      canReply: true,
      timeLabel: '14:02',
      drafts: [
        'Works for me — see you at 15:00.',
        'Can we keep the original time instead? 15:00 is tight for me.',
        'Got it — updating my calendar to 15:00.',
      ],
      line: 'Alpha Group: "Team call moved to 15:00 — ok with you?…"',
      sentReply: null,
    },
  ],
}

const bridge = await waitForEvenAppBridge()

let digest: Digest = FALLBACK
let offline = false
let page: 'digest' | 'detail' | 'sent' | 'pair' | 'voice' | 'sending' = 'digest'
let selected = 0
let draftIndex = 0
let statusLine = ''
let pairCode = ''

// Undo guard: after the user picks SEND, the app holds the send for 3 s
// ("Sending… tap to undo") and only then fires the /send request once.
// A tap inside the window cancels it — nothing is ever sent. Client-side
// only; the backend is untouched. The snapshot is captured at arm time so
// a later selection change cannot retarget the send, and the return target
// is remembered so a cancel lands back on the right screen.
type PendingSend =
  | { kind: 'draft'; itemId: number; draftIndex: number; text: string; returnTo: 'detail' }
  | { kind: 'voice'; itemId: number; text: string; returnTo: 'voice' }
let pendingSend: PendingSend | null = null
const undoGuard = new UndoGuard()
let undoTicker: ReturnType<typeof setInterval> | null = null

function stopUndoTicker() {
  if (undoTicker !== null) {
    clearInterval(undoTicker)
    undoTicker = null
  }
}

async function renderSending() {
  if (!pendingSend) return
  page = 'sending'
  const seconds = undoGuard.secondsLeft(Date.now())
  await upgrade(1, 'header', 'Sending…')
  await upgrade(2, 'main', `"${pendingSend.text}"`)
  await upgrade(3, 'action', `Sending in ${seconds}s — Tap: UNDO · 2xTap: back`)
}

async function armUndoGuard(pending: PendingSend) {
  pendingSend = pending
  undoGuard.onFire = async () => {
    stopUndoTicker()
    const toSend = pendingSend
    pendingSend = null
    if (toSend) await doSend(toSend)
  }
  if (!undoGuard.arm(Date.now())) {
    // A guard is already pending; the second SEND is dropped, never queued.
    pendingSend = null
    return
  }
  await renderSending()
  undoTicker = setInterval(() => {
    // Refresh the countdown; the guard's own timer fires the send.
    void renderSending()
  }, 500)
}

async function cancelPendingSend() {
  if (!undoGuard.cancel()) return
  stopUndoTicker()
  const to = pendingSend?.returnTo ?? 'detail'
  pendingSend = null
  if (to === 'voice') await renderVoice()
  else await renderDetail()
}

// The one and only /send call. Runs once, only when the undo window
// expires untouched. The draft and voice paths share it.
async function doSend(pending: PendingSend) {
  const body = pending.kind === 'draft'
    ? { itemId: pending.itemId, draftIndex: pending.draftIndex }
    : { itemId: pending.itemId, text: pending.text }
  try {
    const res = await fetch(`${BACKEND_URL}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pairing-token': PAIRING_TOKEN },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    statusLine = data.mode === 'telegram'
      ? `To ${data.chatTitle}: "${data.text}"`
      : `Logged in demo mode: "${data.text}"`
    await renderSent(true)
  } catch (e) {
    statusLine = e instanceof Error ? e.message : 'backend unreachable'
    await renderSent(false)
  }
}
const recorder = new PcmRecorder()
let voicePhase: 'idle' | 'recording' | 'working' | 'menu' | 'error' = 'idle'
let voiceTranscript = ''
let voiceError = ''
let voiceMs = 0

const bucketTag = (b: string) => (b === 'urgent' ? '[URGENT]' : b === 'fyi' ? '[FYI]' : '[noise]')

function container(id: number, name: string, y: number, height: number, content: string, capture = 0) {
  return new TextContainerProperty({
    xPosition: 0, yPosition: y, width: 576, height,
    borderWidth: 0, borderColor: 5, paddingLength: 6,
    containerID: id, containerName: name, content, isEventCapture: capture,
  })
}

async function upgrade(id: number, name: string, content: string) {
  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: id, containerName: name, content,
  }))
}

async function renderDigest() {
  page = 'digest'
  draftIndex = 0
  const c = digest.counts
  const header = `${digest.generatedAtLabel} · ${c.chats} chats · ${c.urgent} urgent · ${c.fyi} FYI · ${c.noise} noise`
    + (offline ? '\n(backend offline — demo data)' : '')
  const lines = digest.items.map((i, idx) =>
    `${idx === selected ? '>' : ' '} ${bucketTag(i.bucket)} ${i.line}`)
  if (digest.items.length === 0) {
    lines.push('  No messages in the last 24h.')
    lines.push('  Add the bot to a group, or forward')
    lines.push('  a message to it in Telegram.')
  }
  // The last selectable row is always the pairing entry.
  lines.push(`${selected === digest.items.length ? '>' : ' '} [Pair this app]`)
  await upgrade(1, 'header', header)
  await upgrade(2, 'main', lines.join('\n'))
  await upgrade(3, 'action', 'Tap: open · Scroll: choose · 2xTap: exit')
}

async function renderPair() {
  page = 'pair'
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${BACKEND_URL}/pairing-code`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    pairCode = ((await res.json()) as { code: string }).code
  } catch {
    pairCode = ''
  }
  await upgrade(1, 'header', 'Pair TeleGlance')
  await upgrade(2, 'main', pairCode
    ? `Your code: ${pairCode}\nSend to the TeleGlance bot\nin Telegram:\n/link ${pairCode}\nExpires in 10 minutes.`
    : 'Could not reach the backend.\nCheck it is running, then try again.')
  await upgrade(3, 'action', '2xTap: back')
}

// Writes to a real chat are a deliberate two-step: the chat starts with
// writes OFF, the first tap on its detail page enables them, and only then
// can a draft be sent. Read-only mode disables sending entirely.
function writesOff(item: DigestItem) {
  return item.canReply && item.writeEnabled === false && !digest.readOnly
}

async function renderDetail() {
  const item = digest.items[selected]
  if (!item) return renderDigest()
  page = 'detail'
  await upgrade(1, 'header', `${bucketTag(item.bucket)} ${item.chatTitle} · ${item.timeLabel}`)
  await upgrade(2, 'main', `${item.sender}: ${item.text}`)
  if (!item.canReply) {
    await upgrade(3, 'action', `Draft (copy-ready): ${item.drafts[0]}\nA bot cannot post into a private DM. 2xTap: back`)
  } else if (digest.readOnly) {
    await upgrade(3, 'action', `Draft (copy-ready): ${item.drafts[0]}\nRead-only mode — sending is off. 2xTap: back`)
  } else if (writesOff(item)) {
    await upgrade(3, 'action', `Writes are OFF for ${item.chatTitle}.\nTap: ENABLE writes · 2xTap: back`)
  } else {
    // Rows: the text drafts, then [Voice reply] when available, then
    // [Done] last. Done is local triage (no Telegram post), so it is
    // offered here without the write gate.
    const kind = detailRowKind(draftIndex, item.drafts.length, voiceReplyAvailable(item, !!digest.readOnly))
    if (kind === 'voice') {
      await upgrade(3, 'action', 'Voice reply — Tap: RECORD · Scroll: other draft · 2xTap: back')
    } else if (kind === 'done') {
      await upgrade(3, 'action', '[Done] — Tap: mark done · Scroll: other draft · 2xTap: back')
    } else {
      await upgrade(3, 'action', `Draft ${draftIndex + 1}/3: ${item.drafts[draftIndex]}\nTap: SEND · Scroll: other draft · 2xTap: back`)
    }
  }
}

async function renderVoice() {
  const item = digest.items[selected]
  if (!item) return renderDigest()
  page = 'voice'
  if (voicePhase === 'recording') {
    await upgrade(1, 'header', `Voice reply · ${item.chatTitle}`)
    await upgrade(2, 'main', 'Recording… speak now.')
    await upgrade(3, 'action', 'Tap: STOP & transcribe · 2xTap: cancel')
  } else if (voicePhase === 'working') {
    await upgrade(2, 'main', 'Transcribing…')
    await upgrade(3, 'action', 'Please wait — taps ignored.')
  } else if (voicePhase === 'menu') {
    await upgrade(1, 'header', `Voice reply · ${item.chatTitle}`)
    await upgrade(2, 'main', `You said:\n"${voiceTranscript}"`)
    await upgrade(3, 'action', 'Tap: SEND · Scroll: REWRITE · 2xTap: cancel')
  } else if (voicePhase === 'error') {
    await upgrade(1, 'header', `Voice reply · ${item.chatTitle}`)
    await upgrade(2, 'main', voiceError)
    await upgrade(3, 'action', 'Tap: record again · 2xTap: back')
  }
}

async function startVoiceReply() {
  voicePhase = 'recording'
  voiceTranscript = ''
  voiceError = ''
  await renderVoice()
  await recorder.start(on => bridge.audioControl(on))
}

async function finishVoiceReply() {
  const pcm = await recorder.stop(on => bridge.audioControl(on))
  if (pcm.length === 0) {
    // No frames arrived (the simulator has no live mic): an honest error,
    // never a scripted or invented transcript.
    voicePhase = 'error'
    voiceError = 'No audio captured — the simulator\nhas no live mic. On real G2,\nrecord again and speak clearly.'
    await renderVoice()
    return
  }
  voicePhase = 'working'
  await renderVoice()
  const started = Date.now()
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30000)
    const item = digest.items[selected]
    const res = await fetch(`${BACKEND_URL}/stt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pairing-token': PAIRING_TOKEN },
      body: JSON.stringify({ audio: pcmToBase64(pcm), itemId: item?.id }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    voiceTranscript = data.transcript
    voiceMs = Date.now() - started
    console.log('[Iris] voice stt ms:', voiceMs, 'transcript:', voiceTranscript)
    voicePhase = 'menu'
  } catch (e) {
    voicePhase = 'error'
    voiceError = e instanceof Error ? e.message : 'transcription failed'
  }
  await renderVoice()
}

async function sendVoiceReply() {
  const item = digest.items[selected]
  if (!item || !voiceTranscript) return
  // The send itself is held by the undo guard for 3 s; nothing is posted yet.
  await armUndoGuard({ kind: 'voice', itemId: item.id, text: voiceTranscript, returnTo: 'voice' })
}

async function cancelVoiceReply() {
  if (recorder.isRecording) await recorder.stop(on => bridge.audioControl(on))
  voicePhase = 'idle'
  await renderDetail()
}

async function enableWrites() {
  const item = digest.items[selected]
  if (!item?.chatId) return
  try {
    const res = await fetch(`${BACKEND_URL}/chats/write`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pairing-token': PAIRING_TOKEN },
      body: JSON.stringify({ chatId: item.chatId, enabled: true }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    item.writeEnabled = true
  } catch {
    statusLine = 'Could not enable writes — backend unreachable.'
    await renderSent(false)
    return
  }
  await renderDetail()
}

async function renderSent(ok: boolean) {
  page = 'sent'
  await upgrade(1, 'header', ok ? 'Sent ✓' : 'Not sent')
  await upgrade(2, 'main', statusLine)
  await upgrade(3, 'action', 'Tap: back to digest · 2xTap: exit')
}

async function loadDigest() {
  try {
    // Hard timeout: a hung backend must never freeze the boot screen.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(`${BACKEND_URL}/digest`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    digest = (await res.json()) as Digest
    offline = false
  } catch {
    digest = FALLBACK
    offline = true
  }
  selected = 0
}

async function sendSelected() {
  const item = digest.items[selected]
  if (!item || !item.canReply) return
  const text = item.drafts[draftIndex]
  if (!text) return
  // The send itself is held by the undo guard for 3 s; nothing is posted yet.
  await armUndoGuard({ kind: 'draft', itemId: item.id, draftIndex, text, returnTo: 'detail' })
}

// Mark-as-done: local triage only — POST /done, then reload the digest
// (the item is gone from it). Nothing is posted to Telegram, so there is
// no write gate here; the endpoint still needs the pairing token.
async function markDone() {
  const item = digest.items[selected]
  if (!item) return
  try {
    const res = await fetch(`${BACKEND_URL}/done`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pairing-token': PAIRING_TOKEN },
      body: JSON.stringify({ itemId: item.id }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch {
    // Same failure pattern as enableWrites: the status line carries the
    // real message and the item stays put so the user can retry.
    statusLine = 'Could not mark done — backend unreachable.'
    await renderSent(false)
    return
  }
  await loadDigest()
  await renderDigest()
}

// Boot: create the single page, then fill it with the live digest.
const bootResult = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer({
  containerTotalNum: 3,
  textObject: [
    container(1, 'header', 0, 40, 'TeleGlance'),
    // Exactly ONE event-capture container per page (the official templates
    // all do this; three capture containers made createStartUp return
    // "invalid" and rendered a black page — verified 2026-11-23).
    container(2, 'main', 44, 164, 'Loading your Telegram digest…', 1),
    container(3, 'action', 212, 76, ''),
  ],
}))
console.log('[TeleGlance] startup page result:', bootResult)
await loadDigest()
console.log('[TeleGlance] digest loaded, offline =', offline, 'items =', digest.items.length)
await renderDigest()

// Simulator-test hook (dev only): ?test=voice boots straight into the
// voice recording screen for the first digest item. The packaged .ehpk
// loads index.html with no query string, so this can never trigger on
// real hardware. It exists because simulator automation cannot deliver
// scroll events to a text-container app (verified 2026-11-23), so the
// voice row is otherwise unreachable in the simulator.
if (new URLSearchParams(location.search).get('test') === 'voice' && digest.items.length > 0) {
  selected = 0
  draftIndex = digest.items[0].drafts.length
  await startVoiceReply()
}

// Simulator-test hook (dev only): ?test=voice-menu boots straight into
// the voice menu with a clearly labelled TEST transcript, so the voice
// undo-guard path can be exercised in the simulator (no live mic exists
// there). Same rule as ?test=voice: the packaged .ehpk loads index.html
// with no query string, so this can never trigger on real hardware, and
// the text is only ever sent to a demo chat in tests — never a real
// Telegram chat (the live stack is never pointed at this hook).
if (new URLSearchParams(location.search).get('test') === 'voice-menu' && digest.items.length > 0) {
  selected = 0
  voicePhase = 'menu'
  voiceTranscript = 'TEST VOICE UNDO — simulator test string, not a real transcript.'
  await renderVoice()
}

// Simulator-test hook (dev only): ?test=done boots straight into the
// detail page of the first digest item with the [Done] row selected, so
// the mark-as-done path can be exercised in the simulator (automation
// cannot deliver scroll events to a text-container app, verified
// 2026-11-23). Same rule as ?test=voice: the packaged .ehpk loads
// index.html with no query string, so this can never trigger on real
// hardware.
if (new URLSearchParams(location.search).get('test') === 'done' && digest.items.length > 0) {
  selected = 0
  const first = digest.items[0]
  draftIndex = detailOptionCount(first.drafts.length, voiceReplyAvailable(first, !!digest.readOnly)) - 1
  await renderDetail()
}

// CLICK_EVENT is 0 and protobuf omits zero-value fields, so a tap arrives
// with eventType undefined — resolve the default INSIDE the envelope check
// (pattern carried over from the official minimal template).
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

const unsubscribe = bridge.onEvenHubEvent(async event => {
  // Audio frames arrive on their own branch and carry no sys/text/list
  // event — check FIRST, before the click default below, or every frame
  // would look like a tap.
  if (event.audioEvent?.audioPcm !== undefined) {
    recorder.push(event.audioEvent.audioPcm)
    return
  }

  const types = [eventTypeOf(event.sysEvent), eventTypeOf(event.textEvent), eventTypeOf(event.listEvent)]
  const has = (t: OsEventTypeList) => types.includes(t)

  if (has(OsEventTypeList.SYSTEM_EXIT_EVENT) || has(OsEventTypeList.ABNORMAL_EXIT_EVENT)) {
    if (recorder.isRecording) await recorder.stop(on => bridge.audioControl(on))
    // A pending send must never fire after the app exits.
    undoGuard.cancel()
    stopUndoTicker()
    pendingSend = null
    unsubscribe()
    return
  }

  // Double-tap: exit from the digest page, "back" everywhere else.
  if (has(OsEventTypeList.DOUBLE_CLICK_EVENT)) {
    if (page === 'digest') await bridge.shutDownPageContainer(1)
    else if (page === 'sending') await cancelPendingSend()
    else if (page === 'voice') await cancelVoiceReply()
    else await renderDigest()
    return
  }

  if (has(OsEventTypeList.FOREGROUND_ENTER_EVENT)) {
    // Coming back to the app refreshes the digest (stale data is timestamped).
    if (page === 'digest') {
      await loadDigest()
      await renderDigest()
    }
    return
  }

  if (has(OsEventTypeList.SCROLL_TOP_EVENT) || has(OsEventTypeList.SCROLL_BOTTOM_EVENT)) {
    const dir = has(OsEventTypeList.SCROLL_TOP_EVENT) ? -1 : 1
    if (page === 'digest') {
      // Selection range includes the trailing [Pair this app] row.
      selected = nextSelected(selected, dir, digest.items.length)
      await renderDigest()
    } else if (page === 'detail') {
      const item = digest.items[selected]
      if (item?.canReply && !writesOff(item) && !digest.readOnly) {
        // Drafts plus the trailing [Voice reply] and [Done] rows.
        const voice = voiceReplyAvailable(item, !!digest.readOnly)
        const count = detailOptionCount(item.drafts.length, voice)
        const prev = draftIndex
        draftIndex = nextDraftIndex(draftIndex, dir, count)
        // Draft-to-draft scrolls only refresh the action line; moving
        // onto or off a voice/done row re-renders the whole detail page.
        if (detailRowKind(prev, item.drafts.length, voice) === 'draft'
          && detailRowKind(draftIndex, item.drafts.length, voice) === 'draft') {
          await upgrade(3, 'action',
            `Draft ${draftIndex + 1}/3: ${item.drafts[draftIndex]}\nTap: SEND · Scroll: other draft · 2xTap: back`)
        } else {
          await renderDetail()
        }
      }
    } else if (page === 'voice' && voicePhase === 'menu') {
      // Scroll on the voice menu means REWRITE: record again.
      await startVoiceReply()
    }
    return
  }

  if (has(OsEventTypeList.CLICK_EVENT)) {
    if (page === 'digest') {
      if (selected === digest.items.length) await renderPair()
      else await renderDetail()
    }
    else if (page === 'sending') {
      // A tap inside the 3 s window cancels the send — nothing is posted.
      await cancelPendingSend()
    }
    else if (page === 'voice') {
      if (voicePhase === 'recording') await finishVoiceReply()
      else if (voicePhase === 'menu') await sendVoiceReply()
      else if (voicePhase === 'error') await startVoiceReply()
      // 'working': taps ignored until STT resolves.
    }
    else if (page === 'detail') {
      const item = digest.items[selected]
      if (item && writesOff(item)) await enableWrites()
      else if (item && digest.readOnly && item.canReply) {
        statusLine = 'Read-only mode is on — sending is disabled.'
        await renderSent(false)
      }
      else if (item && detailRowKind(draftIndex, item.drafts.length, voiceReplyAvailable(item, !!digest.readOnly)) === 'done') await markDone()
      else if (item && voiceReplyAvailable(item, !!digest.readOnly) && draftIndex === item.drafts.length) await startVoiceReply()
      else await sendSelected()
    }
    else if (page === 'sent') {
      await loadDigest()
      await renderDigest()
    }
  }
})
