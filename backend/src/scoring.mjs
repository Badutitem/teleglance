// Rules-first priority scoring, digest building and draft generation.
// Zero API keys, zero dependencies: an optional LLM can replace buildDrafts
// later, but the whole read/write path must work without one.

const NOISE_EXACT = new Set([
  'gm', 'gn', 'lol', 'lmao', 'nice', 'thanks', 'thank you', 'ok', 'okay',
  'noted', '+1', 'same', 'this', 'real', 'fr', 'based', 'wagmi', 'wen',
  'ser', 'go', 'yes', 'yep', 'cool', 'great', 'wow', '👍', '🚀', '👀', '🔥',
])

const TIME_RE = /\b\d{1,2}[:.]\d{2}\b/
// Bilingual EN + ID: the user's real chats are Indonesian, and an ID urgent
// message scored as noise in the first live test (2026-11-23, item 50).
const MEETING_RE = /\b(call|meeting|standup|sync|demo|interview|briefing|rapat|zoom|gmeet|presentasi)\b/i
const MOVE_RE = /\b(moved|rescheduled|shifted|postponed|pindah|dipindah|digeser|diundur|dimajukan|dibatalkan)\b/i
const PRESSURE_RE = /\b(urgent|asap|deadline|today|tonight|before|need|please|pls|hari ini|besok|segera|penting|tolong|mohon|konfirmasi|confirm)\b/i
const FYI_RE = /\b(announcement|update|released?|launch|notes|recap|reminder|pinned|published|report|results?|pengumuman|info|jadwal|hasil|upload|diupload|kupload|terlampir)\b/i

export function scoreMessage({ text = '', isMention = false } = {}) {
  const clean = text.trim()
  const lower = clean.toLowerCase()

  // Short reactions and greetings are noise by construction.
  if (clean.length <= 14 && NOISE_EXACT.has(lower.replace(/[!.\s]+$/g, ''))) {
    return { score: 3, bucket: 'noise' }
  }
  if (clean.length <= 3) return { score: 2, bucket: 'noise' }

  let score = 12
  const hasQuestion = clean.includes('?')
  // Indonesian "jam 10" (no minutes) counts as a stated time too.
  const hasTime = TIME_RE.test(clean) || /\bjam\s?\d{1,2}\b/i.test(clean)
  const hasMeeting = MEETING_RE.test(clean)

  if (hasMeeting && MOVE_RE.test(clean)) score += 34
  else if (MOVE_RE.test(clean) && hasTime) score += 16
  else if (hasMeeting && hasTime) score += 20
  if (hasQuestion) score += 22
  if (hasQuestion && PRESSURE_RE.test(clean)) score += 14
  if (/\burgent\b|\basap\b|\bdeadline\b|\bpenting\b|\bsegera\b|\bdarurat\b|\btenggat\b|\boverdue\b|jatuh tempo/i.test(clean)) score += 24
  // Imperative ask for confirmation ("tolong confirm hari ini") is pressure
  // even without a question mark.
  if (/\b(tolong|mohon|please|pls)\b/i.test(clean) && /\b(confirm|konfirmasi)\b/i.test(clean)) score += 16
  // A polite ask + an action verb ("tolong cek", "please pay") is a request
  // directed at the reader, not chatter.
  if (/\b(tolong|mohon|please|pls)\b/i.test(clean) && /\b(confirm|konfirmasi|pay|bayar|send|kirim|submit|cek|check)\b/i.test(clean)) score += 12
  // Incidents and account consequences carry their own weight.
  if (/\b(outage|incident|server down|service down)\b/i.test(clean)) score += 14
  if (/\b(suspended|terminated|diblokir|ditutup|dinonaktifkan)\b/i.test(clean)) score += 16
  if (/\b(hari ini|besok|malam ini|sekarang|nanti malam)\b/i.test(clean)) score += 8
  if (hasTime) score += 8
  if (isMention) score += 16
  if (/https?:\/\//.test(clean) || FYI_RE.test(clean)) score += 14
  if (clean.length > 60) score += 10
  if (clean.length > 90) score += 6

  const bucket = score >= 58 ? 'urgent' : score >= 26 ? 'fyi' : 'noise'
  return { score, bucket }
}

// Drafts are rules-first, zero-API-key, and bilingual: the user's real
// chats are Indonesian, so an Indonesian message gets Indonesian drafts.
// Each branch returns exactly 3 drafts in 3 tones: (1) accept/confirm,
// (2) push back or ask, (3) acknowledge + act. All drafts stay under 90
// characters so they fit the glasses action line.
const ID_RE = /\b(pindah|dipindah|digeser|diundur|dimajukan|dibatalkan|besok|hari ini|tolong|mohon|rapat|konfirmasi|segera|penting|jam|jadwal|hadir|siap|makasih|terima kasih|bisa|nggak|tidak)\b/i

// Language of a message, for STT: the voice reply is transcribed in the
// language of the message being answered (drafts are bilingual the same
// way). Same ID markers as the draft branches above.
export function detectLanguage(text = '') {
  return ID_RE.test(text) ? 'id' : 'en'
}

function pickTime(text) {
  const m = text.match(/\b\d{1,2}[:.]\d{2}\b/) || text.match(/\bjam\s?(\d{1,2}(?:[:.]\d{2})?)\b/i)
  if (!m) return null
  const raw = (m[1] || m[0]).replace('.', ':').replace(/^jam\s?/i, '')
  return raw.includes(':') ? raw : `${raw}:00`
}

export function buildDrafts(item) {
  const text = item.text || ''
  const id = ID_RE.test(text)
  const t = pickTime(text)
  const moved = text.match(/\b(?:moved|rescheduled|shifted)(?:\s+\w+){0,3}?\s+(?:to\s+)?(\d{1,2}[:.]\d{2})\b/i)
    || text.match(/\b(?:pindah|dipindah|digeser|diundur|dimajukan)(?:\s+\w+){0,3}?\s+(?:ke\s+)?(?:jam\s+)?(\d{1,2}(?:[:.]\d{2})?)\b/i)
  const time = moved ? (() => {
    const raw = moved[1].replace('.', ':')
    return raw.includes(':') ? raw : `${raw}:00`
  })() : t
  const hasMeeting = MEETING_RE.test(text)

  let drafts
  if (moved && time) {
    drafts = id ? [
      `Oke, jam ${time} bisa.`,
      `Jam ${time} mepet buat saya, bisa tetap jam semula?`,
      `Siap, saya update kalender ke jam ${time}.`,
    ] : [
      `Works for me — see you at ${time}.`,
      `Can we keep the original time instead? ${time} is tight for me.`,
      `Got it — updating my calendar to ${time}.`,
    ]
  } else if (hasMeeting && time) {
    drafts = id ? [
      `Saya hadir jam ${time}.`,
      `Jam ${time} saya nggak bisa, bisa digeser?`,
      `Saya catat jam ${time} di kalender.`,
    ] : [
      `I'll be there at ${time}.`,
      `Can't make ${time} — can we move it?`,
      `Adding ${time} to my calendar.`,
    ]
  } else if (/\bdeadline\b|\bsubmit\b|\bdue\b|\btenggat\b/i.test(text)) {
    drafts = id ? [
      'Siap, saya kirim sebelum deadline.',
      'Butuh waktu lebih — bisa diperpanjang sehari?',
      'Oke, ini prioritas saya hari ini.',
    ] : [
      'On it — I will send it before the deadline.',
      'I need a bit more time — can we extend by a day?',
      'Got it, it is at the top of my list today.',
    ]
  } else if (text.includes('?')) {
    drafts = id ? [
      time ? `Ya, jam ${time} bisa.` : 'Ya, bisa.',
      'Saya cek dulu, segera saya konfirmasi di sini.',
      time ? `Jam ${time} nggak bisa buat saya, maaf.` : 'Maaf, yang itu nggak bisa.',
    ] : [
      time ? `Yes, ${time} works for me.` : 'Yes, that works for me.',
      'Let me check first — I will confirm here soon.',
      time ? `${time} doesn't work for me, sorry.` : 'That does not work for me, sorry.',
    ]
  } else if (FYI_RE.test(text) || /https?:\/\//.test(text)) {
    drafts = id ? [
      'Makasih infonya, dicatat.',
      'Bisa share link atau dokumennya di sini?',
      'Oke, saya baca hari ini.',
    ] : [
      'Thanks for the update — noted.',
      'Can you share the link or doc here?',
      'Got it — I will read it today.',
    ]
  } else {
    drafts = id ? [
      'Oke, makasih.',
      'Saya cek dulu lalu balas dengan benar.',
      'Boleh share detail kuncinya di sini?',
    ] : [
      'Got it — thanks for the update.',
      'I will take a look and reply properly soon.',
      'Can you share the key details here?',
    ]
  }
  // Glasses action line fits ~90 chars; never ship a draft that overflows it.
  return drafts.map(d => d.length > 90 ? d.slice(0, 89) + '…' : d)
}

function timeLabel(dateUnix) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
  }).format(new Date(dateUnix * 1000))
}

export function toDigestItem(row) {
  const item = {
    id: row.id,
    chatId: row.chat_id,
    chatTitle: row.chat_title,
    sender: row.sender,
    text: row.text,
    bucket: row.bucket,
    score: row.score,
    canReply: !!row.can_reply,
    timeLabel: timeLabel(row.date_unix),
    sentReply: row.sent_reply || null,
    done: !!row.done,
  }
  item.drafts = buildDrafts(item)
  item.line = `${row.chat_title}: "${truncate(row.text, 44)}"`
  return item
}

export function truncate(s, n) {
  const flat = String(s).replace(/\s+/g, ' ').trim()
  return flat.length <= n ? flat : flat.slice(0, n - 1) + '…'
}

export function buildDigest(rows, now = new Date()) {
  const counts = { urgent: 0, fyi: 0, noise: 0, chats: 0 }
  const chats = new Set()
  for (const r of rows) {
    counts[r.bucket] = (counts[r.bucket] || 0) + 1
    chats.add(r.chat_title)
  }
  counts.chats = chats.size
  const items = [...rows]
    .sort((a, b) => b.score - a.score || b.date_unix - a.date_unix)
    .slice(0, 8)
    .map(toDigestItem)
  return {
    generatedAt: now.toISOString(),
    generatedAtLabel: new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
    }).format(now),
    counts,
    items,
  }
}
