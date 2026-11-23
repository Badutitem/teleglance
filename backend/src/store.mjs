// SQLite store (Node built-in node:sqlite — no external dependencies).
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { scoreMessage } from './scoring.mjs'

export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        update_key TEXT UNIQUE,
        chat_id TEXT,
        tg_message_id INTEGER,
        chat_title TEXT NOT NULL,
        sender TEXT,
        text TEXT NOT NULL,
        date_unix INTEGER NOT NULL,
        bucket TEXT NOT NULL,
        score INTEGER NOT NULL,
        can_reply INTEGER NOT NULL DEFAULT 0,
        sent_reply TEXT,
        sent_mode TEXT
      );
      CREATE TABLE IF NOT EXISTS chat_settings (
        chat_id TEXT PRIMARY KEY,
        write_enabled INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS pairings (
        code TEXT PRIMARY KEY,
        telegram_user_id TEXT,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `)
  }

  addMessage(m) {
    const { score, bucket } = scoreMessage(m)
    const info = this.db.prepare(`
      INSERT OR IGNORE INTO messages
        (update_key, chat_id, tg_message_id, chat_title, sender, text, date_unix, bucket, score, can_reply)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      m.updateKey ?? null,
      m.chatId != null ? String(m.chatId) : null,
      m.tgMessageId ?? null,
      m.chatTitle,
      m.sender ?? '',
      m.text,
      m.dateUnix,
      bucket,
      score,
      m.canReply ? 1 : 0,
    )
    return info.changes > 0
  }

  recentMessages(hours = 24) {
    const since = Math.floor(Date.now() / 1000) - hours * 3600
    return this.db.prepare(
      'SELECT * FROM messages WHERE date_unix >= ? ORDER BY date_unix DESC',
    ).all(since)
  }

  getMessage(id) {
    return this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
  }

  markSent(id, reply, mode) {
    this.db.prepare('UPDATE messages SET sent_reply = ?, sent_mode = ? WHERE id = ?')
      .run(reply, mode, id)
  }

  countMessages() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM messages').get().n
  }

  setWriteEnabled(chatId, enabled) {
    this.db.prepare(`
      INSERT INTO chat_settings (chat_id, write_enabled) VALUES (?, ?)
      ON CONFLICT(chat_id) DO UPDATE SET write_enabled = excluded.write_enabled
    `).run(String(chatId), enabled ? 1 : 0)
  }

  isWriteEnabled(chatId) {
    if (chatId == null) return false
    const row = this.db.prepare('SELECT write_enabled FROM chat_settings WHERE chat_id = ?')
      .get(String(chatId))
    return !!row?.write_enabled
  }

  createPairingCode() {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expires = Math.floor(Date.now() / 1000) + 10 * 60
    this.db.prepare('INSERT OR REPLACE INTO pairings (code, expires_at) VALUES (?, ?)')
      .run(code, expires)
    return code
  }

  redeemPairingCode(code, telegramUserId) {
    const row = this.db.prepare('SELECT * FROM pairings WHERE code = ?').get(code)
    if (!row || row.used_at || row.expires_at < Math.floor(Date.now() / 1000)) return false
    this.db.prepare('UPDATE pairings SET telegram_user_id = ?, used_at = ? WHERE code = ?')
      .run(String(telegramUserId), Math.floor(Date.now() / 1000), code)
    return true
  }

  getSetting(key) {
    return this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null
  }

  setSetting(key, value) {
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value))
  }
}
