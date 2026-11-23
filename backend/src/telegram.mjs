// Telegram Bot API client + long-polling ingest.
// Bot API only: the bot sees chats it belongs to and messages forwarded to it.
// It can never read a user's private DMs — that boundary is by design.

export class TelegramBot {
  constructor(token, store) {
    this.token = token
    this.store = store
    this.base = `https://api.telegram.org/bot${token}`
  }

  async api(method, body = {}) {
    const res = await fetch(`${this.base}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description || res.status}`)
    return data.result
  }

  senderName(from) {
    if (!from) return 'Unknown'
    return [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || 'Unknown'
  }

  /** Map one Bot API update into a stored message. Returns true if stored. */
  handleUpdate(update) {
    const msg = update.message || update.channel_post
    if (!msg) return false
    const text = (msg.text || msg.caption || '').trim()
    if (!text) return false
    const chat = msg.chat || {}

    // Pairing: "/link 123456" sent to the bot binds that Telegram user.
    // A bare "/link" gets the usage reply instead of landing in the digest.
    if (text === '/link' || text.startsWith('/link ')) {
      const code = text.split(/\s+/)[1]
      const ok = code && this.store.redeemPairingCode(code, msg.from?.id ?? chat.id)
      this.api('sendMessage', {
        chat_id: chat.id,
        text: !code
          ? 'Usage: /link <6-digit code> — generate the code in the TeleGlance app under [Pair this app].'
          : ok
            ? 'TeleGlance linked. Your glasses app can now read the digest from chats this bot belongs to.'
            : 'That pairing code is invalid or expired. Generate a new one in the TeleGlance app.',
      }).catch(() => {})
      return false
    }
    if (text === '/start') {
      this.api('sendMessage', {
        chat_id: chat.id,
        text: 'TeleGlance bot is live. Add me to a group (or make me admin of a channel) and I will build your glasses digest. Send /link <code> to pair the app.',
      }).catch(() => {})
      return false
    }

    const forwarded = !!(msg.forward_origin || msg.forward_from || msg.forward_from_chat)
    const isGroupLike = ['group', 'supergroup', 'channel'].includes(chat.type)
    return this.store.addMessage({
      updateKey: `tg-${update.update_id}`,
      chatId: forwarded ? `inbox-${chat.id}` : chat.id,
      tgMessageId: msg.message_id,
      chatTitle: forwarded ? 'Forwarded inbox' : (chat.title || 'Private chat'),
      sender: this.senderName(msg.from),
      text,
      dateUnix: msg.date || Math.floor(Date.now() / 1000),
      // A bot cannot post into a private DM it is not part of, so forwarded
      // inbox items are draft-only. Group/channel items can be replied to.
      canReply: isGroupLike && !forwarded,
    })
  }

  async pollOnce() {
    const offset = Number(this.store.getSetting('tg_offset') || 0)
    const updates = await this.api('getUpdates', {
      offset,
      timeout: 25,
      allowed_updates: ['message', 'channel_post'],
    })
    for (const u of updates) {
      try { this.handleUpdate(u) } catch (e) { console.error('ingest error', e.message) }
      this.store.setSetting('tg_offset', u.update_id + 1)
    }
    return updates.length
  }

  async pollLoop() {
    console.log('Telegram long-polling ingest started')
    for (;;) {
      try { await this.pollOnce() }
      catch (e) {
        console.error('poll error', e.message)
        await new Promise(r => setTimeout(r, 3000))
      }
    }
  }

  async sendReply(item, text) {
    return this.api('sendMessage', {
      chat_id: item.chat_id,
      text,
      reply_to_message_id: item.tg_message_id || undefined,
    })
  }
}
