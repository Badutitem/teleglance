# TeleGlance — your Telegram backlog in one glance on Even G2

TeleGlance turns a noisy Telegram backlog into a **3-line glance** on the Even
G2 smart glasses — counts by urgency plus the one line that matters — and lets
you answer that message with **a single tap on an AI-drafted reply**, without
touching your phone.

- **Event:** Even Realities "Heads Up" hackathon (DoraHacks), Nov 23–29, 2026
- **Track:** 01 · Messaging & News (Telegram) — also entered for the
  ⭐ Best Telegram Integration special prize
- **Stack:** TypeScript web app (Vite + `@evenrealities/even_hub_sdk`) + a
  dependency-free Node backend (Bot API ingest, SQLite, rules-first scoring)

## How it works

```
Telegram chats ──Bot API──▶ Backend (Node + SQLite) ──REST──▶ G2 web app
   (bot is a member /          ingest · priority score          digest page
    channel admin, or          digest builder · draft gen       detail page
    you forward to the bot)    /send (explicit tap only)        reply chooser
```

1. **Read.** The backend long-polls the Telegram Bot API for groups the bot
   belongs to, channels where it is an admin, and anything you forward to the
   bot (your "glasses inbox"). Every message gets a rules-first priority score
   (mentions, questions, moved meetings, deadlines score high; greetings and
   reactions score as noise). The glasses show a digest: `1 urgent · 6 FYI ·
   40 noise` plus the top lines.
2. **Write.** On an urgent item the backend prepares 3 short draft replies.
   Scroll to pick one, **one tap sends it** via the Bot API. Nothing is ever
   sent without that physical tap. Replies are posted by the bot into the chat
   the message came from; forwarded inbox items are draft-only, because a bot
   cannot post into a private DM it is not part of.
3. **Pairing.** The app shows a 6-digit code; you send `/link 123456` to the
   bot; the backend binds your Telegram user to the app session. (No Google
   sign-in — it does not work inside the G2 WebView.)

## Safety by construction

- **Bot API only** — no user-account automation (MTProto), no scraping of
  chats the user did not explicitly connect.
- **Writes are explicit** — a send needs a physical tap; per-chat writes are
  **off by default** for real chats and must be enabled deliberately. In the
  app this is a two-step gesture: the detail page first shows "Writes are
  OFF — Tap: ENABLE writes", and only after that tap can a draft be sent.
- **Read-only mode** — with `TELEGLANCE_READ_ONLY=1` the backend still builds
  the digest but `/send` always refuses; the app shows drafts as copy-ready
  text only.
- **No money surface at all** — no funds, trading, payments, or advice.
- **Secrets stay in the backend env** — the app and this repo contain no keys.
- Messages are stored only in your own backend's SQLite file.

## Setup

Prerequisites: Node.js 20+ (backend uses the built-in `node:sqlite`), a
Telegram bot token from [@BotFather](https://t.me/BotFather) for live data.

```bash
# 1. Backend (terminal 1)
cd backend
cp .env.example .env        # set TELEGRAM_BOT_TOKEN for live ingest (optional)
npm start                   # http://127.0.0.1:8787 — seeds a demo digest if empty

# 2. G2 app (terminal 2)
cd app
npm install
npm run dev                 # Vite on http://localhost:5173

# 3. Simulator (terminal 3) — or use real G2 glasses via `npx evenhub qr`
npm run simulate
```

Without a bot token the backend serves a clearly-labelled demo digest
(1 urgent · 6 FYI · 40 noise) and sends are recorded as `demo-log` instead of
being posted — the full glasses flow still works end to end. With a token,
add the bot to a group and its messages flow into the digest live; enable
writes per chat with `POST /chats/write` before any reply can be sent.

Backend tests: `cd backend && npm test` (scoring, drafts, digest shape).

## What existed before Nov 23, 2026 (hackathon disclosure)

1. A toolchain smoke test on **Nov 21, 2026**: the official
   `@evenrealities/evenhub-cli` / `@evenrealities/evenhub-simulator` packages
   were installed and the unmodified official minimal template was run in the
   simulator to verify the headless demo-capture path. No project code was
   written.
2. A concept/design document dated Nov 21, 2026.
3. The official `even-realities/evenhub-templates` minimal template, used as
   the scaffold for `app/` (open source, by Even Realities).

All TeleGlance code was written Nov 23–29, 2026, inside the hackathon window.

## Feature requests for the APIs we used (hackathon deliverable)

1. **Telegram Bot API:** a read-only "digest scope" for bots — message counts
   and metadata for chats the user consents to, without the bot needing to be
   a full member of every group.
2. **Telegram Bot API:** a first-class "assistant identity" badge, so a reply
   posted by a bot on the user's behalf is visually distinct from a bot
   announcement.
3. **Even Hub SDK:** a list-container "selected index changed" event that is
   guaranteed distinct from click, so scroll-to-choose never needs inference
   from click envelopes.
4. **Even Hub SDK:** a documented network-whitelist entry for `localhost`
   development backends, so local-first apps do not need a public tunnel.
5. **Even Hub Simulator:** a built-in "record MP4 of the glasses pane" button
   in the automation API, instead of x11grab + manual cropping.
