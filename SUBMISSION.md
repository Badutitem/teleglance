# SUBMISSION PACKAGE — Iris (DoraHacks BUIDL, siap tempel)

Event: Even Realities "Heads Up" — deadline **30 Nov 02:59 WIB**.
Submit tetap menunggu kata user. Nama resmi **Iris** diputuskan user 26 Nov
14:00 WIB (rename dari TeleGlance — 4 rival pakai nama sama). Repo + bot
tetap pakai slug `teleglance` (ganti itu mutusin link); yang berubah cuma
nama tampilan, logo, dan deskripsi.

## Fields

**Project name:** Iris

**One-line intro (tagline):**
Telegram's urgent messages, handed to you at a glance on Even G2.

**Tracks:** 01 · Messaging & News — plus the ⭐ Best Telegram Integration
special prize (one cash prize per project; we enter Track 01 only).

**Description (paste as-is):**

Iris is the Greek messenger goddess and we integrate her into the technology we built. Think of her as your personal courier. She reads your Telegram groups and hands you only what matters on your glasses. Want to reply, one tap is all it takes.

The problem is real. On Telegram an important message like meeting moved to 10:00 confirm today drowns under 40 plus greetings and stickers. You open your phone just to find one sentence.

Iris itself is an app for Even Realities G2 and it runs on it.

READ. Your own bot pulls messages from the Bot API with long polling. A dependency-free Node backend scores every message with a transparent rules model. Mentions, questions, moved meetings, and deadlines score high. Greetings and reactions score low. The scorer is bilingual because important messages are not always in English. On Nov 23 an important message in another language landed as noise. The model was fixed the same day. 26 of 26 cases on the eval set.

WRITE. For urgent messages the backend writes 3 short reply drafts in the original message's language. The chosen draft only sends with one physical tap on the glasses. Nothing sends by itself. Writing is off by default. Read-only mode keeps the digest alive while sending is always refused. Zero API keys. Everything lives only in your own SQLite file.

Proven live with our own Telegram group. A real message entered the digest, then its reply went back to the group through the bot. Repeated on Nov 26 after a full rebuild.

Not yet proven. No G2 device here. Everything was tested in the official simulator and on live Telegram. Scroll on real hardware is untested.

What we ask from the APIs we use. 1. A read-only digest scope in the Telegram Bot API. A bot can see counts and metadata for chats the user allows without joining every group as a full member. 2. An assistant identity badge. A message sent on the user's behalf should look different from a bot announcement. 3. A selected index changed event in the Even Hub SDK that is clearly distinct from click. Scroll to choose needs a reliable signal. 4. A documented localhost whitelist for dev backends. A local-first app should not need a public tunnel. 5. A built-in MP4 record button for the lens panel in the Even Hub Simulator. Not x11grab plus manual cropping.

(English version of the Indonesian draft the user approved 26 Nov 15:29. Indonesian source draft lives in this chat, 14:24 message.)

**Demo video:** https://www.youtube.com/watch?v=TZjN9Ppy3-o (UNLISTED, channel
"Badut aja") — video baru Iris 26 Nov, 30 detik, narasi Inggris, pesan asli
Siluman #52 jadi bintang, kartu judul/akhir biru putih. Video lama
PZGwLfOcSRE masih ada (Unlisted, tidak dihapus).

**GitHub:** https://github.com/Badutitem/teleglance (repo publik).
**Release v1.1:** https://github.com/Badutitem/teleglance/releases/tag/v1.1
(video bersuara v2 + .ehpk baru) — sudah ditautkan di BUIDL sebagai link
"Other" 26 Nov 15:45 (tanpa label, kolom Other cuma kotak URL).

**Voice reply (built 26 Nov, NOT yet on BUIDL):** speak the reply on the
glasses — a "[Voice reply]" row on the detail page records via the G2 mic
(`g2-microphone`, SDK `audioControl` + `audioEvent`), transcribes locally
with faster-whisper `tiny` on the user's own backend (sidecar, no API key,
no cloud), and offers Send / Rewrite / Cancel. STT language follows the
message being answered (ID/EN). Proven: backend 20/20 tests, app 9/9,
HTTP end-to-end with real speech clips (ID 1.060 ms, EN 677 ms for ~2.5 s
clips), simulator flow with the honest empty-buffer error (no fake
transcript). NOT proven: live mic on real G2 (no device here); tiny model
sometimes mishears Indonesian words. The BUIDL description above (installed
15:31) does NOT mention voice, and the current video does not show it —
decide with the user whether to add a voice line to the description and
re-record. The voice .ehpk (33.774 bytes, EHPK magic OK) is local only —
superseded 26 Nov by the 34.421-byte .ehpk that also includes the undo
guard; release v1.1 still carries the pre-voice .ehpk. Run the sidecar with
`backend/start-stt-sidecar.sh` (port 8791; the backend answers 503 honestly
if it is down).

**Undo guard, 3 detik (built 26 Nov, NOT yet on BUIDL):** sesudah user
memilih SEND (draf teks maupun balasan suara), aplikasi menahan kirim
selama 3 detik dan menampilkan "Sending… tap to undo" dengan hitung
mundur. Tap di dalam jendela membatalkan — TIDAK ADA request yang
dikirim. Kalau 3 detik habis tanpa batal, POST /send yang sudah ada
jalan tepat sekali. Client-side saja, backend TIDAK berubah; gerbang
kirim yang sama tetap berlaku (writes ON + bukan read-only). Ide ini
diambil dari Cue (build 51858) — satu-satunya keunggulan keamanan
rival yang Iris tidak punya. Proven: unit test logika 6/6 (app 15/15
total), simulator 4 skenario lawan backend demo + proxy penghitung
(backend demo 8790, tanpa token bot — TIDAK ADA pesan Telegram yang
terkirim selama tes): batal draf → 0 /send; habis draf → tepat 1 /send;
batal suara → 0 /send; habis suara → tepat 1 /send (teks uji). Bukti
layar: evidence/undo-shot-*.png. Hook dev baru `?test=voice-menu`
(boot ke menu suara dengan transkrip TEST berlabel, sama aturannya
dengan `?test=voice`: .ehpk tidak pernah bawa query). .ehpk baru
34.421 byte (magic EHPK OK, sudah termasuk voice + undo guard),
lokal saja; release v1.1 masih berisi .ehpk pra-voice. Video dan
deskripsi BUIDL belum menampilkan/menyebut undo guard — sama seperti
voice, putuskan dengan user sebelum submit.

**Feature requests (deliverable, up to 5):**1. Telegram Bot API: a read-only "digest scope" for bots — message counts
   and metadata for chats the user consents to, without the bot needing to
   be a full member of every group.
2. Telegram Bot API: a first-class "assistant identity" badge, so a reply
   posted by a bot on the user's behalf is visually distinct from a bot
   announcement.
3. Even Hub SDK: a list-container "selected index changed" event that is
   guaranteed distinct from click, so scroll-to-choose never needs
   inference from click envelopes.
4. Even Hub SDK: a documented network-whitelist entry for localhost
   development backends, so local-first apps do not need a public tunnel.
5. Even Hub Simulator: a built-in "record MP4 of the glasses pane" button
   in the automation API, instead of x11grab + manual cropping.

## Judging map (from the official page, re-verified 2026-11-23)

- Usefulness 25% — a daily pain (Telegram backlog) solved in one glance.
- Read/write 20% — both paths proven live with real data, not mocks.
- Technical 20% — zero-dependency backend, bilingual rules scorer with an
  eval set, pairing + per-chat write toggles + read-only mode.
- UX 15% — 3 containers, ≤2 taps to send, deliberate enable step.
- Business & safety 20% — Bot API only, explicit writes, no money surface.

## Gate check (read-only, verified 2026-11-23 17:32–17:34 WIB)

- DoraHacks session IS logged in as **Badutitem** — no login wall.
- **Registration: DONE 2026-11-23 17:50 WIB** (user: "Gas" + "Semuanya
  kerjain"). Answers sent: Demo Day = remote; G2 glasses = no; Telegram
  handle = mask_laugh (his own username, from the bot pairing); heard
  from = DoraHacks; teammates = No. Verified 4 ways: congratulations
  pop-up, Register button flipped to "Unregister", hacker count
  404 → 405, Badutitem listed in the Hackers tab. (The home dashboard's
  Participated Hackathons still lags — shows only Reactive.) The same 4
  answers are reused in the Build Submission modal.
- **BUIDL 51712 exists** (created 23 Nov as TeleGlance, renamed to Iris +
  logo + deskripsi baru 26 Nov). Submit for Review BELUM diklik — klik
  terakhir tetap jatah user, deadline 30 Nov 02:59 WIB.
- **Hard requirements from the form:** a GitHub/GitLab/Bitbucket link AND
  a demo video (YouTube, Vimeo, Loom, or a direct .mp4 file) are REQUIRED.
- Build Submission modal also requires: Track*, "Will you attend Demo Day
  in Dubai on Dec 3? (in person / remote / not sure)*", "Do you have Even
  Realities G2 glasses? (yes / no)*", "Your Telegram handle*", "How did
  you hear about this hackathon?*", Looking for teammates (Yes/No), terms
  checkbox → final button "Submit for Review".
- Create-Build form: Logo, Name, Brief description, Tags, Team Info,
  Website URL, links (GitHub/Video/Website/X/LinkedIn/Other), Markdown
  description; Contact Info: Telegram (primary)* + Backup contact*
  (Discord mr.clown. is available). **Tags are preset-only (26 Nov
  15:33): the form offers 7 single-choice categories (Crypto/Web3,
  Quantum, Space, AI, Robotics, Biotechnology, Other) — no custom tags.
  The 6 requested tags (Telegram, Even Realities, G2, Smart Glasses,
  AI Agent, Digest) cannot be entered; "AI" is the fitting preset if
  the user wants one.**

## Remaining steps before the user presses submit

1. Repo publik https://github.com/Badutitem/teleglance — sudah ada, head
   234b0624 (26 Nov). Push berikutnya: logo-iris.png saja (binary, rute
   web UI). Catatan: kode voice reply + undo guard (26 Nov, belum di-push)
   + .ehpk baru (34.421 byte, lokal) belum masuk repo/release.
2. Final demo video — SELESAI 26 Nov 15:28. Video baru v2 bersuara
   https://youtu.be/TZjN9Ppy3-o, link BUIDL sudah diganti, release GitHub
   v1.1 https://github.com/Badutitem/teleglance/releases/tag/v1.1 (video
   + .ehpk baru). SISA: video belum menampilkan voice reply dan undo guard
   (rekam ulang bila mau), deskripsi BUIDL belum menyebut voice/undo guard
   (tambah baris bila mau), release baru buat .ehpk suara + undo guard.
3. User klik Submit for Review (deadline 30 Nov 02:59 WIB).
