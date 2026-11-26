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
  shows `Your code: [redacted] / Send to the TeleGlance bot in Telegram:
  /link [redacted] / Expires in 10 minutes.` (evidence:
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

## 2026-11-23 evening — registration, repo, pack, logo
- DoraHacks registration COMPLETED 17:50 WIB (answers: remote / no G2 /
  mask_laugh / DoraHacks / teammates No) — verified: congratulations
  pop-up, Register→Unregister, hackers 404→405, Badutitem listed.
- Repo created via web UI: github.com/Badutitem/teleglance (public);
  code pushed via connector push_files, commit 8a1a0625 (19 files).
  create_repository via the connector API still 403s (App scope).
- App packed: teleglance.ehpk (32,528 bytes) via evenhub pack; packer
  stamped min_app_version 2.0.0 → 2.2.10 (SDK 0.0.16 floor).
- Logo drawn programmatically (logo.png, 1024×1024): eye outline +
  paper-plane pupil in G2 green on black. Upload via BUIDL form (binary;
  not pushed through the text file API).
- Competitor scan: 3 other "TeleGlance" repos in this hackathon
  (buahrasa01-hub — demo-mode + proxy contract, 1 commit; backburner036-prog
  — simulator pass + final video done, no backend; nmorestd/teleglance-g2 —
  README claims only, stale since 20 Nov).

## 2026-11-23 night — final demo video
- Stack restarted after VM replacement (webkit reinstalled; backend ran
  on port 8790 because ARTEX holds 8787+8788; vite proxy pointed at 8790
  for the recording, restored to 8787 after).
- Final video recorded from the live simulator (x11grab): digest with the
  REAL Siluman urgent item visible -> detail + Draft 1/3 -> send -> back.
  Composed: evidence/teleglance-demo-final.mp4 (30.5 s, title card,
  bottom-band captions, end card). Flow frames verified.
- Logo variants drawn (logo-v2 plane, logo-v3 TG, logo-v4 bubble,
  logo-v5 eye-minimal) — user's pick pending; v1 remains the default.

## 2026-11-23 21:31 — BUIDL created
- GitHub Release v1.0 published (video mp4 + teleglance.ehpk assets).
- DoraHacks REJECTED the GitHub-release .mp4 as the video link (domain
  classification: both links counted as GitHub). Workaround: video
  uploaded to YouTube UNLISTED — https://www.youtube.com/watch?v=PZGwLfOcSRE
  — accepted by the form.
- BUIDL created: https://dorahacks.io/build/51712 (logo v1, full
  description + 5 feature requests, GitHub link, YouTube embed, contacts
  Telegram @mask_laugh / Discord mr.clown).
- Submission modal staged: Track = Messaging & News, teammates = No,
  terms ticked, "Submit for Review" NOT clicked (user's click). The 4
  organizer questions do not appear in the current modal — already
  recorded at registration (17:50 WIB).

## 2026-11-23 21:42 — final logo chosen by user
- User picked the V2 paper-plane in PURPLE GRADIENT (logo-v2-grad3.png:
  continuous 3-stop violet gradient across the plane, no crease line,
  gradient arc, dark violet gradient background) after rejecting the
  flat green, flat purple and dark-crease variants.
- Set as the BUIDL 51712 logo (verified live) and copied to logo.png.

## 2026-11-26 — Pematangan produk (perintah user "Kerjakan kekurangan kita")
User menantang klaim "siap" (13:25). Kekurangan yang diakui: (1) loop live cuma dibuktikan 1× (23 Nov); (2) draft template generik; (3) scroll pilih draft tak teruji; (4) video kirim pakai item demo; (5) .ehpk tak pernah diinstal di hardware.
Yang dikerjakan hari ini:
- Stack dinyalakan ulang pasca-VM-replacement: webkit apt fix diulang (cogentco token), backend 8787 + vite 5173 nyala, ingest Telegram aktif, DB lama (50 pesan) utuh. Digest KOSONG — semua pesan >24 jam, perilaku benar (jendela 24 jam).
- Draft generator ditulis ulang (scoring.mjs): 6 cabang topik (pindah-jadwal / undangan rapat+jam / deadline / pertanyaan / FYI / default), bilingual ID↔EN mengikuti bahasa pesan, 3 nada (setuju / tolak-tanya / akui+aksi), semua ≤90 karakter. Bukti: eval 26/26 + unit test 10/10 (5 baru). API live: /drafts/50 → ["Oke, jam 10:00 bisa.", "Jam 10:00 mepet buat saya, bisa tetap jam semula?", "Siap, saya update kalender ke jam 10:00."].
- Logika scroll diekstrak ke app/src/nav.ts (nextSelected clamp + nextDraftIndex wrap), diuji Node 10/10; main.ts pakai fungsi itu; npm run build bersih. Catatan jujur: pengiriman event scroll oleh SDK di hardware asli tetap belum teruji (tak ada G2).
- .ehpk di-pack ulang dari build baru: 32.552 byte, magic EHPK OK. app.json TIDAK punya field logo — .ehpk tidak pernah berisi logo; logo cuma hidup di halaman BUIDL.
- Kode di-push ke GitHub commit 530bcd3d (4 file). Sync record disimpan.
BELUM SELESAI (butuh tangan user): (a) pesan tes baru di grup Siluman — digest kosong sampai ada pesan <24 jam; (b) pilihan judul (tiga opsi ditawarkan 13:29, belum dijawab); (c) rekam ulang video pakai pesan asli + kirim asli; (d) klik Submit for Review.

## 2026-11-26 — Arah branding rename (perintah user)
- Nama TeleGlance diganti (4 rival pakai nama sama); opsi Sekilas/Selintas/Tilik DITOLAK user ("Gak ada yang bagus"), opsi Kedip/Sorot/Sekejap/Blink ditawarkan, belum dijawab. User minta list dewa pesan berbagai mitologi (Hermes, Iris, Thoth, Narada, Hanuman, Hermod, Ratatoskr, Gna, Huginn & Muninn, Nabu, Ninshubur, Ogma, Eshu/Legba, Jibril, Yatagarasu).
- Gambar Dewi Iris dibuat (gaya anime Naruto preset): v1 pelangi → user minta hilangkan pelangi (alasan: LGBT) → v2 jubah emas polos, tanpa pelangi → v3 patung marmer → v4 line-art hitam di kuning mustard full badan tanpa kacamata (referensi: David line-art user) — v4 disetujui arahnya.
- PERINTAH USER 13:44: "Jangan pakai referensi anime fiturnya" — branding/fitur produk JANGAN pakai referensi anime; arah yang dipakai = klasik line-art (David), bukan anime.

## 2026-11-26 — Nama resmi: Iris + logo final (perintah user)
- Nama **Iris** diputuskan user 14:00 WIB (jawaban "Iya" atas tawaran pasang logo + nama + deskripsi ke BUIDL). Alasan rename: 4 build lain bernama TeleGlance (buahrasa01, backburner036, nmorestd, jepee build 51776).
- Logo final: line-art Dewi Iris full badan (gaya David line-art dari referensi user), ikonografi BENAR dari patung asli Gaetano Matteo Monti (KHM Wina, KK 5503) — TANPA sayap, selendang melengkung di atas kepala, kendi → diganti gulungan surat era Yunani di tangan yang disodorkan ke depan, diadem bintang, tanpa pijakan/alas. Warna dari logo Hermes Agent Nous Research (terukur dari file logo asli: background #141414, gradasi kuning-oranye #ffd701 → #ffbf01 → #ce7e33). Background hitam polos. File: `teleglance/logo-iris.png` (1232×1664). Versi perantara: kuning mustard → gradasi senja (warna dari foto Pexels asli, tanpa langitnya) → hitam → Hermes.
- Deskripsi BUIDL ditulis ulang dari draf 13:33 (bukan template): masalah nyata grup ID, scorer bilingual yang diperbaiki live 23 Nov (eval 26/26), safety-by-design, bukti live 23 + 26 Nov. Tagline baru: "Telegram's urgent messages, handed to you at a glance on Even G2." Draf direvisi lagi 14:02 dari referensi mitologi (Iris pembawa pesan) + teknologi kita — menunggu OK user sebelum dipasang ke BUIDL.
- Repo + bot tetap slug `teleglance` (ganti itu mutusin link).
- MASIH NUNGGU: (a) pesan tes baru di grup Siluman (digest kosong); (b) rekam ulang video pakai pesan asli + kartu judul Iris; (c) klik Submit for Review (deadline 30 Nov 02:59 WIB).
