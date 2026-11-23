# BUILD LOG — TeleGlance

## 2026-11-23 (Day 1) — core loop PROVEN in the simulator

**Exit state reached:** app + backend run locally; the full read→write loop
works end to end in the official simulator with live backend data:

1. **Digest page** — header `16:47 · 3 chats · 1 urgent · 6 FYI · 40 noise`,
   top item selected: `[URGENT] Alpha Group: "Team call moved to 15:00…"`
   (evidence: `evidence/shot-6-digest-view.png`)
2. **Tap → detail page** — full message text + `Draft 1/3: Works for me —
   see you at 15:00.` with scroll-to-choose drafts
   (evidence: `evidence/shot-7-detail-view.png`)
3. **Tap → sent page** — `Logged in demo mode: "Works for me — see you at
   15:00."` and the backend persisted the send on the item
   (evidence: `evidence/shot-8-sent-view.png`)

Backend unit tests: **5/5 pass** (`cd backend && npm test`) — scoring buckets,
draft generation, and the seed digest shape (1 urgent · 6 FYI · 40 noise ·
3 chats). Endpoint smoke: `/health`, `/digest`, `/item/:id`, `/pairing-code`
OK; `/send` returns 401 without the pairing token, 200 with it.

Telegram ingest is implemented (long-polling `getUpdates`, `/link` pairing,
`/start` help) and activates when `TELEGRAM_BOT_TOKEN` is set — not yet
exercised against a live bot; that is the Nov 24 real-data day.

### Quirks found today (do not rediscover these)

- **VM rebuild wiped the simulator libs again.** `libwebkit2gtk-4.1.so.0`,
  `libsoup-3.0`, `libjavascriptcoregtk-4.1` missing → reinstall:
  `apt-get install -y libwebkit2gtk-4.1-0`. `apt-get update` first needs the
  cogentco mirror removed from `/etc/apt/sources.list.d/ubuntu.sources`
  (backup: `teleglance/ubuntu.sources.bak`), exactly as in SMOKE-TEST.md.
- **Cross-origin fetch from the WebView hangs.** The app fetching
  `http://127.0.0.1:8787` directly froze the boot screen forever (WebKit
  network process + VM egress proxy). Fix: the app only talks to its own
  origin; Vite proxies `/api` → backend with a path rewrite
  (`vite.config.ts`). A 4 s AbortController timeout in `loadDigest` is the
  second line of defence.
- **`rebuildPageContainer` does not change the displayed page** in this
  simulator/host (calls are accepted, screen never updates). All rendering
  uses the template-proven pattern: ONE startup page, updated in place via
  `textContainerUpgrade`.
- **Exactly one `isEventCapture: 1` container per page.** Three capture
  containers made `createStartUpPageContainer` return `1` (invalid) and
  rendered a black page. The official text-heavy template confirms the
  pattern (body captures, pager does not).
- Raw glasses screenshots encode brightness in the alpha channel; composite
  alpha→green-on-black before viewing (see `evidence/*-view.png`).

### Running stack (this VM, dev)

- Backend: `cd backend && npm start` → http://127.0.0.1:8787
- App: `cd app && npm run dev` → http://localhost:5173 (proxies /api)
- Simulator: `xvfb-run -a ./node_modules/@evenrealities/sim-linux-x64/bin/evenhub-simulator http://localhost:5173 --automation-port 9898`

## 2026-11-23 (evening, pulled forward on the user's "gas sekarang")

- **Pairing page in the app — PROVEN.** The digest's last selectable row is
  `[Pair this app]`; opening it fetches a live code from `/pairing-code` and
  shows `Your code: 831460 / Send to the TeleGlance bot in Telegram:
  /link 831460 / Expires in 10 minutes.` (evidence:
  `evidence/shot-11-pair-view.png`, code fetched live during the test).
- **Empty state — PROVEN** against a temporary empty backend:
  `0 chats · 0 urgent · 0 FYI · 0 noise` + "No messages in the last 24h.
  Add the bot to a group, or forward a message to it in Telegram."
  (evidence: `evidence/shot-10-empty-view.png`).
- **Foreground refresh:** `FOREGROUND_ENTER_EVENT` reloads the digest.
- **Simulator limitation (honest note):** the simulator's automation
  `up`/`down` actions deliver NO event to a text-container app (verified:
  handler never fired; clicks work). Scroll selection therefore follows the
  official text-heavy template's event contract (SCROLL_TOP/BOTTOM via
  `textEvent`) but could not be exercised in the simulator; the pairing page
  was reached in tests via the empty state, where it is the only row.
  Re-verify scroll on a real device or a list-container layout if the demo
  needs it.

## 2026-11-23 (evening) — LIVE Telegram data proven + scorer fixed

- Bot **@teleglance_hayate_bot** created by the user via BotFather; token in
  `backend/.env` (0600, never committed); backend restarted with ingest ON
  (`/health` → `telegramIngest: true`).
- The user's real traffic landed within minutes: a DM invite link (FYI), a
  bare `/link`, and his test message in the real group **"Siluman"**:
  "Meeting besok pindah ke jam 10, tolong confirm hari ini ya".
- **Bug found by the live test:** the rules scorer was English-only — that
  Indonesian urgent message scored **12/noise**. Fixed the same evening:
  ID keywords (pindah/digeser/diundur/dimajukan, rapat, hari ini, besok,
  tolong/mohon + confirm/konfirmasi, penting/segera/darurat/tenggat), ID
  draft generation ("…pindah ke jam 10" → "Works for me — see you at
  10:00."). Item 50 rescored **12/noise → 70/urgent**; digest now ranks the
  real group #2 with urgent=2, chats=5. Backend tests still 5/5.
- Bare `/link` (no code) no longer lands in the digest as noise — the bot
  replies with usage text instead.

- **WRITE PATH PROVEN LIVE (2026-11-23 17:11, on the user's "Kirim"):**
  `/send` for item 50 first refused correctly — writes are OFF by default
  for real chats — then the per-chat toggle was enabled for Siluman
  (`/chats/write` → writeEnabled: true) and the send went through the real
  Bot API: `{sent: true, mode: "telegram", text: "Works for me — see you
  at 10:00.", chatTitle: "Siluman"}`, persisted as the item's sentReply.
  **The full loop is now proven with 100% real data: group message →
  ingest → urgent digest + drafts → one-tap send → bot posts in the group.**

## 2026-11-23 (night) — Nov 24+25 work pulled into today; FEATURE FREEZE

On the user's "Gak bisa hari ini aja", the remaining build items were done
today instead of Nov 24–25:

- **Scorer tuning round 2:** a 26-case EN+ID eval set
  (`backend/test/eval-set.mjs`) started at 19/26; fixes (ID loose times
  "jam 10", move-without-meeting +16, incidents, overdue/consequence words,
  polite-ask + action-verb, "malam ini/sekarang") brought it to **26/26**;
  unit tests still 5/5.
- **Per-chat write toggle in the app:** digest items now carry
  `writeEnabled`; a real chat's detail page shows "Writes are OFF — Tap:
  ENABLE writes" and only after that deliberate tap shows the drafts.
  Proven in the simulator (evidence: `shot-12-writesoff-view.png`,
  `shot-13-enabled-view.png`; DB confirmed write_enabled flipped to 1).
- **Read-only mode:** `TELEGLANCE_READ_ONLY=1` — digest carries `readOnly`,
  `/send` refuses ("read-only mode is on"), the app shows copy-ready drafts
  only. Verified against a temp instance on a DB copy.
- **FEATURE FREEZE declared 2026-11-23** (moved up from Nov 25). From here:
  polish, README/submission package, demo rehearsal and the final video
  only — no new features.

## 2026-11-23 (night) — submission package + rehearsal video (pulled forward)

- **SUBMISSION.md written:** every DoraHacks BUIDL field ready to paste
  (name, tagline, Track 01 + Best Telegram, full description, the 5 API
  feature requests, judging map, disclosure). Still open by design: the
  public GitHub repo link (user creates the repo, Shiina pushes) and the
  final video link.
- **Rehearsal demo video recorded:** `evidence/rehearsal-demo.mp4` (24 s,
  x11grab of the live simulator, cropped to the glasses pane) — digest with
  the real Siluman urgent item → detail + Draft 1/3 → send → back to
  digest. Frames verified (`evidence/frame-2/8/15.png`). The final video
  re-records the same flow.
- DoraHacks gate check (BUIDL existence + login state + form fields) run
  read-only via the browser on the user's "Gas".

## Next

- On the user's word: GitHub repo push, final video (Nov 29 flow), BUIDL
  fill + submit. Deadline **Nov 30 02:59 WIB**.
- Optional: port the bot backend to the user's 24/7 server slot.
