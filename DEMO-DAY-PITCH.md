# DEMO DAY PITCH — Iris (3 minutes, live remote, Dec 3)

Finalists are announced Nov 30 – Dec 1. If Iris is one, a human presents live.
Presenter: Hayate. Language: English, short simple sentences, easy to deliver.

## Script (with timing)

### 0:00 – Hook (15s)
Iris is the Greek messenger goddess. We put her on your glasses.

### 0:15 – Problem (25s)
On Telegram, one important message drowns under forty greetings and stickers.
You open your phone just to find one sentence.
We built Iris so you never have to.

### 0:40 – Live demo (70s)
Show the digest on the simulator. One urgent item from our own group.
Open it. Three short reply drafts, in the original language.
Now the new part. Speak the reply on the glasses.
The transcript becomes your answer. Transcription runs locally. No cloud. No API key.
Tap send. Every send waits three seconds. Tap to undo.
Let it go through. Sent.

### 1:50 – How it works (35s)
Your own bot pulls messages with long polling.
A dependency-free backend scores every message with transparent rules.
Mentions, questions, moved meetings, deadlines score high. Greetings score low.
The scorer is bilingual. Tested: 26 of 26 cases.
Writing is off by default. Read-only mode keeps the digest alive while sending is always refused.

### 2:25 – Proof (20s)
Proven live twice with our own Telegram group.
A real message entered the digest. Its reply went back through the bot.
Repeated after a full rebuild.

### 2:45 – Ask (15s)
We ask the APIs for five things. A read-only digest scope. An assistant identity badge.
A scroll event distinct from click. A documented localhost whitelist. A record button in the simulator.

### 3:00 – Close (10s)
Iris is your personal courier. She reads everything. She hands you only what matters.

## Slides (5, minimal text)

1. Title: Iris + tagline + logo.
2. Problem: one urgent message under 40 greetings.
3. Live demo: simulator on screen, no slides, just the glasses flow.
4. How it works: READ / WRITE / VOICE / UNDO, four boxes.
5. Proof + Ask: Nov 23 + Nov 26 live proof, the five feature requests.

## Demo checklist (before going live)

- Stack running: backend :8787, STT sidecar :8791, vite :5173, simulator on Xvfb.
- Digest shows the real Siluman item #52 (1 urgent).
- Voice demo uses the ?test=voice hook (transcript labeled TEST). Do NOT claim live mic.
- Do NOT send a second real message to the group on stage. Use the demo backend if a send must be shown.
- Backup: video v3 (https://youtu.be/urmp4rsGhBg) ready to play if the live demo fails.
- Repo + release v1.2 links ready in chat for the judges.

## Honest limits (say them if asked, do not volunteer)

- No G2 device here. Tested in the official simulator and on live Telegram.
- Scroll on real hardware is untested. Live mic on real hardware is untested.
- On real G2 the backend must be hosted somewhere reachable. Today it runs on our own server.
