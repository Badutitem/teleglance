// Scorer eval set — realistic EN + ID chat messages with expected buckets.
// Run: node test/eval-set.mjs  (exit 1 if any case misses its expected bucket)
import { scoreMessage } from '../src/scoring.mjs'

export const CASES = [
  // --- urgent: schedule moves, deadlines, direct asks with pressure ---
  { text: 'Team call moved to 15:00 — ok with you? Need a yes before 13:00.', expect: 'urgent' },
  { text: 'Meeting besok pindah ke jam 10, tolong confirm hari ini ya', expect: 'urgent' },
  { text: 'Rapat digeser ke jam 14.30, mohon konfirmasi kehadiran hari ini', expect: 'urgent' },
  { text: 'Deadline laporan malam ini jam 23.59, yang belum submit tolong segera ya', expect: 'urgent' },
  { text: 'URGENT: server down, semua tim tolong cek sekarang', expect: 'urgent' },
  { text: 'Deploy postponed to tomorrow 09:00 — please confirm you saw this', expect: 'urgent' },
  { text: 'Zoom jam 3 sore ini dibatalkan, diganti besok pagi', expect: 'urgent' },
  { text: 'Can you send the signed contract today? Deadline is 17:00', expect: 'urgent' },
  { text: 'Presentasi dimajukan jadi besok jam 9, materinya tolong disiapkan malam ini', expect: 'urgent' },
  { text: 'Invoice overdue — please pay before Friday or the account is suspended', expect: 'urgent' },

  // --- fyi: announcements, recaps, links, reminders without hard pressure ---
  { text: 'Community call recap is published: new moderator rotation starts Monday', expect: 'fyi' },
  { text: 'Pengumuman: jadwal maintenance hari Minggu jam 02.00–04.00', expect: 'fyi' },
  { text: 'BTC dominance update: 54.2% this morning — full chart in the doc', expect: 'fyi' },
  { text: 'Notes from the design review are in the shared doc', expect: 'fyi' },
  { text: 'Release v2.4 is out — changelog: https://example.com/changelog', expect: 'fyi' },
  { text: 'Reminder: the rehearsal notes thread is pinned for everyone', expect: 'fyi' },
  { text: 'Hasil rapat kemarin sudah kupload ke drive, silakan dicek', expect: 'fyi' },
  { text: 'https://t.me/+P_iCihr-l2ozNDc1', expect: 'fyi' },

  // --- noise: greetings, reactions, chatter ---
  { text: 'gm all', expect: 'noise' },
  { text: 'wkwkwk iya bener banget', expect: 'noise' },
  { text: 'mantap 🔥', expect: 'noise' },
  { text: 'ok siap', expect: 'noise' },
  { text: 'lol same', expect: 'noise' },
  { text: 'gas terus pokoknya', expect: 'noise' },
  { text: 'siap bang', expect: 'noise' },
  { text: 'wkwk', expect: 'noise' },
]

let misses = 0
for (const c of CASES) {
  const { score, bucket } = scoreMessage({ text: c.text })
  const ok = bucket === c.expect
  if (!ok) misses++
  console.log(`${ok ? 'PASS' : 'MISS'}  expect=${c.expect} got=${bucket} (${score})  ${c.text.slice(0, 64)}`)
}
console.log(`\n${CASES.length - misses}/${CASES.length} in the expected bucket`)
if (misses) process.exit(1)
