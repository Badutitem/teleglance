import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import { nextSelected, nextDraftIndex } from './nav'

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
let page: 'digest' | 'detail' | 'sent' | 'pair' = 'digest'
let selected = 0
let draftIndex = 0
let statusLine = ''
let pairCode = ''

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
    await upgrade(3, 'action', `Draft ${draftIndex + 1}/3: ${item.drafts[draftIndex]}\nTap: SEND · Scroll: other draft · 2xTap: back`)
  }
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
  try {
    const res = await fetch(`${BACKEND_URL}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pairing-token': PAIRING_TOKEN },
      body: JSON.stringify({ itemId: item.id, draftIndex }),
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

// CLICK_EVENT is 0 and protobuf omits zero-value fields, so a tap arrives
// with eventType undefined — resolve the default INSIDE the envelope check
// (pattern carried over from the official minimal template).
function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  if (!envelope) return null
  return envelope.eventType ?? OsEventTypeList.CLICK_EVENT
}

const unsubscribe = bridge.onEvenHubEvent(async event => {
  const types = [eventTypeOf(event.sysEvent), eventTypeOf(event.textEvent), eventTypeOf(event.listEvent)]
  const has = (t: OsEventTypeList) => types.includes(t)

  if (has(OsEventTypeList.SYSTEM_EXIT_EVENT) || has(OsEventTypeList.ABNORMAL_EXIT_EVENT)) {
    unsubscribe()
    return
  }

  // Double-tap: exit from the digest page, "back" everywhere else.
  if (has(OsEventTypeList.DOUBLE_CLICK_EVENT)) {
    if (page === 'digest') await bridge.shutDownPageContainer(1)
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
        draftIndex = nextDraftIndex(draftIndex, dir, item.drafts.length)
        await upgrade(3, 'action',
          `Draft ${draftIndex + 1}/3: ${item.drafts[draftIndex]}\nTap: SEND · Scroll: other draft · 2xTap: back`)
      }
    }
    return
  }

  if (has(OsEventTypeList.CLICK_EVENT)) {
    if (page === 'digest') {
      if (selected === digest.items.length) await renderPair()
      else await renderDetail()
    }
    else if (page === 'detail') {
      const item = digest.items[selected]
      if (item && writesOff(item)) await enableWrites()
      else if (item && digest.readOnly && item.canReply) {
        statusLine = 'Read-only mode is on — sending is disabled.'
        await renderSent(false)
      }
      else await sendSelected()
    }
    else if (page === 'sent') {
      await loadDigest()
      await renderDigest()
    }
  }
})
