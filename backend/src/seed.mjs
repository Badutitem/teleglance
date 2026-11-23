// Demo seed: 1 urgent · 6 FYI · 40 noise across 3 chats — the exact shape of
// the concept digest. Seed chats are labelled demo-* and pre-enabled for
// writes so the tap-to-send path can be rehearsed in the simulator; real
// Telegram chats always start with writes OFF (see /chats/write).

const FYI = [
  ['News Channel', 'Desk', 'Even Realities published the Heads Up kickoff recap and the judging tips for this week.'],
  ['News Channel', 'Desk', 'Side-event list for the conference is out — 12 meetups added for Friday, full post in the channel.'],
  ['Alpha Group', 'Rani', 'Design review notes are in the shared doc — the link is pinned at the top of the chat.'],
  ['Alpha Group', 'Bimo', 'Reminder: the rehearsal notes thread is pinned, please read it before tomorrow morning.'],
  ['Crypto Indonesia', 'Admin', 'BTC dominance update: 54.2% this morning — full chart and thread are posted in the channel.'],
  ['Crypto Indonesia', 'Admin', 'Community call recap is published: new moderator rotation starts next week, details inside.'],
]

const NOISE_WORDS = [
  'gm', 'gm all', 'thanks!', '+1', 'lol', 'nice', 'ok', 'noted', 'same',
  'wagmi', 'ser', 'go', '👍', '🚀', '👀', '🔥', 'based', 'real', 'fr', 'this',
]
const NOISE_CHATS = ['Alpha Group', 'Crypto Indonesia', 'News Channel']
const NOISE_SENDERS = ['Bimo', 'Sari', 'Dimas', 'Putri', 'Agus', 'Rani']

export function seed(store) {
  const now = Math.floor(Date.now() / 1000)
  let n = 0
  const add = (chatTitle, sender, text, minutesAgo, canReply = true) => {
    store.addMessage({
      updateKey: `seed-${n++}`,
      chatId: `demo-${chatTitle.toLowerCase().replace(/\s+/g, '-')}`,
      tgMessageId: null,
      chatTitle,
      sender,
      text,
      dateUnix: now - minutesAgo * 60,
      canReply,
    })
  }

  // The one urgent item.
  add('Alpha Group', 'Rani', 'Team call moved to 15:00 — ok with you? Need a yes before 13:00.', 12)

  // Six FYI items.
  FYI.forEach(([chat, sender, text], i) => add(chat, sender, text, 20 + i * 9))

  // Forty noise items.
  for (let i = 0; i < 40; i++) {
    add(
      NOISE_CHATS[i % NOISE_CHATS.length],
      NOISE_SENDERS[i % NOISE_SENDERS.length],
      NOISE_WORDS[i % NOISE_WORDS.length],
      5 + i * 2,
    )
  }

  // Demo chats: writes pre-enabled, clearly namespaced as demo-*.
  for (const title of ['Alpha Group', 'News Channel', 'Crypto Indonesia']) {
    store.setWriteEnabled(`demo-${title.toLowerCase().replace(/\s+/g, '-')}`, true)
  }
  return store.countMessages()
}
