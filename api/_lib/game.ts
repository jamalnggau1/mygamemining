// Actions for ASTRA MINING (Dalam Tanah P2E).
//
// All balances are server-authoritative: scan/mining outcomes, ore
// sales, upgrade purchases and withdrawals are computed here against
// the Neon Postgres database (api/_lib/store.ts). The client never sets
// a balance — it only sends intents (start a scan, mine vein N, collect
// a finished job, request WD).
//
// Core loop (exploration, NOT a tile grid):
//   The player orbits one procedurally generated asteroid at a time.
//   1. SCAN — a timed spectrometer operation (real seconds, stored
//      server-side) that reveals the asteroid's mineral veins.
//   2. MINE — each vein is a timed drilling operation whose duration
//      depends on the mineral's hardness and the vein's size. Jobs are
//      stored with start/end timestamps, so they keep running (and
//      finish) while the page is closed — nobody can dig instantly or
//      spam-click their way through an asteroid.
//   3. COLLECT — when a job's time is up, the player collects the
//      result. Mining every vein completes the expedition: bonus KT,
//      sector +1, warp to a fresh asteroid.
//
// Maps & challenges:
//   The five zones are selectable mining MAPS. A map unlocks once the
//   player's sector reaches its minimum; unlocked maps can be revisited
//   freely (travel costs energy, free for Premium). Each map has its
//   own gemstone loot table and its own challenge profile — drill-jam
//   chance, hull-damage chance + repair fee, extra radiation energy
//   drain, scan/mining time multipliers and vein counts. Map 1 is the
//   gentle starter; the Kuiper Belt is the brutal endgame.
//
// Premium (owner monetization, sold in Telegram Stars):
//   The game launches on Telegram, so the Premium Pass is priced in
//   Telegram Stars — NOT KT (buying premium with the withdrawable coin
//   made premium a money printer, not a sink). Two tiers:
//     - Standard (300 Stars / 7 hari): energy regen twice as fast,
//       scan & mining 25% faster, sell prices +15%, map travel free.
//     - Pro (1000 Stars / 30 hari): everything in Standard PLUS the
//       dual drill — two drill arms work the vein at once, halving
//       mining time.
//   Purchase flow mirrors the manual WD model: the player creates an
//   order in-game, pays Stars to the owner in Telegram, and the owner
//   confirms the order from the Kendali tab, which activates the pass.
//   The owner can also grant a tier directly (grantPremium) after any
//   off-platform payment. Premium never changes the KT→USDT ratio or
//   the WD rules.
//
// Energy economy (owner-requested rebalance, finishing pass):
//   Ship energy ("daya") is the game's pacing brake and its main
//   anti-bankruptcy lever, because every KT a player can ever earn
//   costs energy to produce. Base regen is deliberately SLOW: 1 energy
//   per 4 minutes, so a full 30-energy tank takes ~2 hours to refill
//   and a free player can sustain at most ~7-8 expeditions per day even
//   playing around the clock (realistically far fewer). Two distinct
//   upgrades act on it, and the UI now spells out the difference:
//     - Tangki O₂ & Baterai Surya ("tangki") raises CAPACITY only:
//       +6 max energy per level (30 → 90). A bigger tank does NOT speed
//       regen; it banks more energy while the player is away (regen
//       stops at the cap) and allows longer mining sessions per visit.
//     - Reaktor Fusi Mini ("bor") is the regen-SPEED upgrade: each
//       level charges the same tank faster (-10% regen time per level,
//       240s → ~84s per energy at max level 10).
//   Premium halves regen time on top of that (fastest possible:
//   ~42s per energy, still ~1 hour for a full maxed tank). KT sinks
//   (upgrade costs with steeper growth, hull repair fees) drain KT
//   back out of circulation, and the free daily faucet was cut
//   150 → 50 → 25 → 2,5 KT (rebalance #5, 2026-11-19: ALL income
//   ÷10). NOTE (rebalance #5): the faucet floor is now bonus 2,5 +
//   iklan maks 15 = 17,5 KT/hari — it needs ~29 days to reach the
//   FIRST WD (500 KT) on its own and ~286 days for a REPEAT WD
//   (5.000 KT), so the faucet can no longer shortcut any WD.
//   NOTE (2026-11-19, first WD lowered to 100 KT): the faucet floor
//   is now 8,75 KT/hari (rebalance #6), so it needs ~12 days to
//   reach the FIRST WD (100 KT) on its own and ~571 days for a
//   REPEAT WD (5.000 KT).
//
// Economy (fixed by the owner):
//   Coin A = Kredit Tambang Antariksa (KT), earned by selling space-mined minerals.
//   1000 KT = 1 USDT. The WD minimum has TWO TIERS, no ladder: the
//   FIRST WD needs only 100 KT (0,1 USDT) — small change (receh), a
//   cheap first payout as a hook (owner 2026-11-19: 0,5 USDT is too
//   expensive to pay per new player); every WD after that needs at
//   least 5.000 KT (5 USDT), FLAT — it never climbs again. Amounts
//   move in 100 KT (0,1 USDT) steps, so a repeat WD can be 5.000,
//   5.100, 5.200 KT, ... — 5.000 KT is the MINIMUM, not the exact
//   amount. The minimum is computed HERE from the paid-WD history in
//   the database — the client can display it but can never lower it.
//   Withdrawals are paid MANUALLY by the owner — a request deducts and
//   locks the KT, lands in the admin queue, and is marked paid only
//   after the owner sends the USDT outside the game. Rejection or
//   cancellation refunds the locked KT in full.
//
// Anti-cheat (owner requirement — never trust the frontend):
//   EVERY number that matters is computed in this file from the Neon database:
//   balances, energy, job start/end timestamps and durations, challenge
//   rolls (decided when a job starts, hidden until collect), sell
//   prices, upgrade costs, the two-tier WD minimum and the locked KT
//   amount. Actions accept only intents and small validated inputs
//   (a vein index, an ore id + quantity, a wallet string, a KT amount
//   that is re-checked against the server-computed minimum and the
//   server-side balance). A tampered client can at most ask politely;
//   it cannot mint KT, shorten a job, or withdraw below the minimum.
//
// Per-player sessions (Telegram, 2026-11-18):
//   Every request carries the caller's Telegram WebApp initData
//   (or nothing, for a plain browser). dispatchGameAction resolves
//   the session FIRST — initData is validated in api/_lib/telegram.ts
//   (HMAC-SHA256 against BOT_TOKEN, auth_date max 24h) and the
//   validated Telegram user id maps to that player's OWN player row
//   (player.telegram_id, UNIQUE). Balances, inventory, upgrades, WD
//   history, premium orders and the activity log are all scoped by
//   player_id, so two players can never see or spend each other's KT.
//   The only cross-player reads are the admin (Kendali) queue in
//   getGameState and the admin actions, which are gated in
//   dispatchGameAction to ADMIN_TELEGRAM_ID only (validated Telegram
//   initData). The legacy web player (no initData) is a REGULAR
//   player with no admin rights — opening the URL in a plain browser
//   never shows or grants Kendali.
//   Admin actions that move KT/premium always target the WD/order
//   OWNER's row, never the admin's own row.
//
// Economy rebalance #2 (2026-11-18, owner asked whether the economy
// still leaks — it did):
//   The previous pass only slowed energy regen; at ~370 KT per tank on
//   Map 1 a casual player still reached 1 USDT in under a day, and one
//   Map 5 tank paid out more than 1 USDT by itself. This pass attacks
//   the faucet from three sides at once (estimates, expected values —
//   individual expeditions vary with the loot roll):
//     - Sell prices cut 40% across every mineral and gemstone.
//     - Energy costs up: scan 3 → 5 daya, drilling 3+kekerasan →
//       4+kekerasan daya, so a tank buys fewer expeditions.
//     - Free faucets shrunk: daily bonus 50 → 25 KT, expedition
//       completion bonus 25+5×sektor → 10+2×sektor KT.
//   Net effect (expected value): Map 1 pays ~130–150 KT per full tank
//   (was ~370), so the first 500 KT WD takes ~3–4 days of casual play
//   instead of <1 day, and Map 5 drops from >1.300 KT to roughly
//   ~500–600 KT per tank — under the first-WD minimum per tank, with
//   far longer real-time operations on top. The escalating WD minimum
//   then stretches every later payout further (2nd WD ≥ 1.000 KT,
//   6th+ ≥ 10.000 KT ≈ 3+ weeks of casual Map 1 play).
//   Distance scaling (same pass): the farther the map, the longer
//   EVERY operation takes — map time factors now run ×1 / ×1.3 / ×1.6 /
//   ×2.0 / ×2.5 for scan and drilling alike, and flying to a farther
//   map costs more energy (4 + 2 per map step).
//
// Economy rebalance #3 (2026-11-19, owner: first WD must take 10+
//   days; "boleh mahal asal langka" — cheap commons, expensive rares).
//   SUPERSEDED by rebalance #4 below (2026-11-19): the WD ladder
//   (75.000 → 1.500.000 KT) is ABOLISHED — first WD 500 KT, repeat
//   WDs 5.000 KT flat. The #3 PRICE cuts below STAY; only the ladder
//   numbers in this comment are history now.
//   Only the small-tier sell prices were cut, so the rarity curve is
//   much steeper: Regolith 2 → 1, Kondrit 6 → 2, Besi-Nikel 14 → 5,
//   Kobalt 30 → 10, Platinum 66 → 45 KT; Iridium 144, Helium-3 360 and
//   all map gems (Opal 39 … Voidium 1.440) stay exactly as-is.
//   And the WD ladder was raised to old x150: first WD 75.000 KT.
//   Monte Carlo (real loot generator, 40k expeditions/map) with the new
//   prices — expected KT per full 30-energy tank: Map 1 ~142, Map 2
//   ~160, Map 3 ~245, Map 4 ~481, Map 5 ~716. Day-by-day progression
//   sim (sector +1 per completed expedition, best unlocked map, all
//   tanks + bonus + all ads): first WD takes ~14 days for a realistic
//   max-effort player (8 tanks/day), ~10 days at the theoretical
//   12-tank/day ceiling, ~21 days active (6 tanks), ~82 days casual
//   (1,5 tanks), and ~4 days mid-upgraded (Negosiator/Ransel/Bor/
//   Pemindai/Tangki/Beliung 5) — upgrades are the way out, as intended.
//   Ads (+15 KT, max 10/day) and daily bonus (25 KT) unchanged: their
//   175 KT/day floor alone needs 429 days to reach 75.000 KT.
//
// Economy rebalance #4 (2026-11-19, owner: takut bangkrut — WD tiap
//   beberapa hari terlalu cepat; tangga DIHAPUS):
//   WD minimum sekarang DUA TINGKAT, tanpa tangga: WD pertama 500 KT
//   (0,5 USDT), WD kedua dan seterusnya minimum 5.000 KT (5 USDT),
//   FLAT. Harga jual TIDAK berubah dari rebalance #3 (Regolith 1 …
//   Helium-3 360 KT, batu map tidak berubah). Recalculation (Monte
//   Carlo, generator loot asli, 20k ekspedisi/map + simulasi
//   hari-demi-hari dengan progresi sektor, 2 run — angka dibulatkan):
//   WD pertama 500 KT dicapai hari ke-1 (max-effort, aktif,
//   mid-upgrade) dan hari ke-2–3 (kasual). Jeda antar WD ulang
//   5.000 KT: ~0,4 hari (max-effort), ~0,9 hari (aktif), ~4 hari
//   (kasual), ~0,1 hari (mid-upgrade). USDT yang harus dibayar
//   pemilik per pemain: bulan pertama ~330 / ~147 / ~29 / ~1.175
//   USDT, dan di kondisi mapan (hari 46–60) ~524 / ~200 / ~40 /
//   ~1.790 USDT per 30 hari. Penyebab utamanya BUKAN threshold WD —
//   bonus penyelesaian ekspedisi (10 + 2×sektor KT) tumbuh TANPA
//   BATAS mengikuti sektor dan menyumbang 24–38% penghasilan pemain
//   aktif — threshold ulang saja tidak membatasi total payout,
//   yang membatasi adalah penghasilan (daya + bonus sektor) pemain.
//   Opsi rem yang TIDAK diterapkan: cooldown WD 7 hari (maks 1 WD
//   per 7 hari per pemain) — dengan asumsi tiap WD tepat 5.000 KT,
//   payout mentok di ~21 USDT/bulan untuk semua profil; TAPI tanpa
//   batas MAKSIMUM per WD, pemain tinggal menabung seminggu lalu WD
//   sekaligus, jadi total USDT tidak berubah (hanya jumlah WD turun
//   ke ~4/bulan). Cooldown baru benar-benar membatasi payout bila
//   dipasangkan dengan batas maksimum per WD. Lihat PORT_NOTES.md
//   untuk tabel lengkapnya; pemilik yang memutuskan.
//
// Economy rebalance #5 (2026-11-19, owner: "tinggal kurangi saja
//   pendapatan KT mereka, beres" — just cut KT income, keep it
//   simple; NO cooldown, NO per-WD max, NO bonus cap):
//   ALL KT income ÷10, nothing else changes. Ore prices: Regolith
//   1 → 0,1, Kondrit 2 → 0,2, Besi-Nikel 5 → 0,5, Kobalt 10 → 1,
//   Platinum 45 → 4,5, Iridium 144 → 14,4, Helium-3 360 → 36 KT;
//   map gems ÷10 too (Opal 39 → 3,9 … Voidium 1.440 → 144 KT).
//   Expedition bonus 10 + 2×sektor → 1 + 0,2×sektor KT, daily bonus
//   25 → 2,5 KT, ads reward 15 → 1,5 KT (cap 10/day + 60s cooldown
//   unchanged). WD rule from #4 STAYS: first WD 500 KT, repeat WDs
//   5.000 KT flat, amounts in 500 KT multiples, ratio 1.000 KT =
//   1 USDT. Upgrade costs UNCHANGED (they are sinks, not income) —
//   at the new rates every upgrade takes ~10× longer to afford,
//   which itself brakes the upgraded-player payout problem.
//   Balances are fractional now (0,1 KT steps): player.kt_balance,
//   player.total_kt_earned and activity.amount_kt are DOUBLE
//   PRECISION (migration-0003), and every credit/debit is rounded
//   to 1 decimal at the point it touches the balance (roundKt) so
//   float dust can never accumulate. WD amounts stay integers.
//   Simulation (same Monte Carlo + day-by-day model as #4, real
//   constants, 2 runs agreeing within a few percent — numbers below
//   are the verified results, see PORT_NOTES.md for the full table):
//   first WD day 2 (max-effort), day 5 (active), day 16 (casual),
//   day 1 (mid-upgrade); repeat WDs every ~2 days (max-effort),
//   ~7 days (active), ~32 days (casual), ~1 day (mid-upgrade);
//   USDT per 30 days at days 46–60: ~108 / ~28 / ~2,3 / ~262 —
//   i.e. 100 active players ≈ 2.800 USDT/month (was ~20.000).
//   An ACTIVE player needs ~50 days of earnings to afford all
//   level-5 upgrades (23.430 KT); max-effort ~25 days, casual
//   >180 days. HONEST CAVEAT: the cut is NOT a clean ÷10 on payout
//   (it is ~5× for max-effort, ~7× active, ~17× casual at days
//   46–60), because the completion bonus (1 + 0,2×sektor) still
//   grows WITHOUT LIMIT with sector and is now 86–93% of earnings
//   — and a rational player farms cheap Map 1 for it (most bonus
//   per energy). There is no true steady state: at days 166–180
//   the same profiles pay ~349 / ~88 / ~6 / ~935 USDT per 30 days
//   and keep climbing. Maps 4–5 are net-NEGATIVE on ore minus hull
//   fees alone (Map 5: 80 KT ore vs ~100 KT fees per tank) — only
//   the sector bonus makes them pay, and Map 1 pays more bonus per
//   energy, so a KT-maximising player never mines the far maps.
//   The faucet floor (2,5 + 15 = 17,5 KT/day) needs ~29 days for
//   a first WD and ~286 days for a repeat WD on its own.
//
// Economy rebalance #6 (2026-11-19, owner chose: "Potong
//   penghasilan lagi (÷20)" + cap the bonus — first WD at 5 days
//   broke the original >10-day agreement, and a weekly WD is
//   bankruptcy in the owner's words): ALL KT income halved AGAIN
//   from #5 (÷20 total vs the original economy), AND the
//   expedition completion bonus is CAPPED at
//   MAX_COMPLETION_BONUS_KT (35 KT — chosen from the simulation so
//   an ACTIVE player's repeat-WD interval holds at ~14 days,
//   stable from days 46–60 through days 166–180; see
//   PORT_NOTES.md). Ore prices: Regolith 0,1 → 0,05, Kondrit 0,2 →
//   0,1, Besi-Nikel 0,5 → 0,25, Kobalt 1 → 0,5, Platinum 4,5 →
//   2,25, Iridium 14,4 → 7,2, Helium-3 36 → 18 KT; map gems halved
//   too (Opal 3,9 → 1,95 … Voidium 144 → 72 KT). Expedition bonus
//   1 + 0,2×sektor → 0,5 + 0,1×sektor, CAPPED at 35 KT (binds at
//   sector 345). Daily bonus 2,5 → 1,25 KT, ads reward 1,5 → 0,75
//   KT (cap 10/day + 60s cooldown unchanged). WD rule from #4
//   STAYS (first WD 500 KT, repeat WDs 5.000 KT flat). Upgrade
//   costs UNCHANGED. Prices now need 2 decimals: roundKt and the
//   client formatter round/show 2 decimals; no DB migration
//   (balance is already DOUBLE PRECISION). Simulation (same Monte
//   Carlo + day-by-day model, real constants — verified numbers in
//   PORT_NOTES.md): first WD day ~7 (active) — HONEST NOTE: still
//   ≤10 days, because the cap only binds from sector 345 (day
//   ~38) and the early bonus is small; the ÷20 cut alone cannot
//   reach >10 days for the first WD. Repeat WDs hold at ~14 days
//   for the active profile at BOTH horizons (days 46–60 and
//   166–180) — that stability is what the cap buys.
//
// Economy rebalance #7 + WD cooldown REMOVED (2026-11-19, owner:
// "buat agar KT-nya terkumpul sampai bisa di-WD, jangan 14 hari"
// — NO time limit on WD, pacing by slow accumulation, not a
// timer): the 14-day, then 30-day, WD cooldown
// (WD_COOLDOWN_DAYS + getWdCooldownStatus + the getGameState
// cooldown fields + the WD tab banner) is DELETED entirely; the
// per-WD maximum 5.000 KT (5 USDT) STAYS. ALL KT income halved
// AGAIN from #6 (÷40 total vs the original economy): Regolith
// 0,05 → 0,025, Kondrit 0,1 → 0,05, Besi-Nikel 0,25 → 0,125,
// Kobalt 0,5 → 0,25, Platinum 2,25 → 1,125, Iridium 7,2 → 3,6,
// Helium-3 18 → 9 KT; map gems halved too (Opal 1,95 → 0,975 …
// Voidium 72 → 36 KT). Expedition bonus 0,5 + 0,1×sektor → 0,25 +
// 0,05×sektor, CAPPED at 17,5 KT — the cap is halved WITH the
// slope so it still binds at sector 345 (~day 38 active); keeping
// the cap at 35 was measured in the sim to hold the active
// interval at ~15 days at days 166–180, which fails the ~30-day
// target. Daily bonus 1,25 → 0,625 KT, ads reward 0,75 → 0,375 KT
// (cap 10/day + 60s cooldown unchanged). WD rule STAYS (first WD
// 100 KT = 0,1 USDT, repeat WDs 5.000 KT flat, max 5.000 KT).
// Upgrade costs UNCHANGED. Prices now need 3 decimals: roundKt
// and the client formatter round/show 3 decimals; no DB migration
// (balance is already DOUBLE PRECISION). Simulation (same Monte
// Carlo + day-by-day model, real constants — verified numbers in
// PORT_NOTES.md): ACTIVE free player accumulates 5.000 KT in
// ~28 days at BOTH horizons (28,1 at 46–60, 27,9 at 166–180),
// ~5,3 USDT/month; max-effort ~14 days (~10,7 USDT/month),
// casual ~265 → ~111 days, mid-upgrade ~7,6 days (~19,7
// USDT/month). HONEST NOTE: without any cooldown there is NO hard
// ceiling — the fastest profiles (Premium mid-upgrade ~3,7 days,
// ~40 USDT/month) still accumulate 5.000 KT in days, not weeks.
// That is inherent to accumulation-based pacing and the owner
// was told so plainly.
//
// Economy rebalance #8 (2026-11-19, owner: "kurangi bonusnya" —
// the bonus is 85–89% of ALL earnings at #7, so it is the biggest
// lever and the main leak; ore is only ~10%): expedition bonus
// halved AGAIN, 0,25 + 0,05×sektor → 0,125 + 0,025×sektor, cap
// 17,5 → 8,75 KT (still binds at sector 345, so the pace stays
// stable). Simulation (same Monte Carlo, verified numbers in
// PORT_NOTES.md): ACTIVE free player now accumulates 5.000 KT in
// ~50 days at BOTH horizons (~3 USDT/month); max-effort ~25 days
// (~5,9 USDT/month), casual ~399 → ~192 days, mid-upgrade ~12,8
// days (~11,7 USDT/month). Bonus share falls to ~66–80% of
// earnings (was 85–89%). HONEST NOTE: still NO hard ceiling —
// Premium mid-upgrade still accumulates 5.000 KT in ~6,2 days
// (~24 USDT/month; 100 such players ≈ 2.400 USDT/month). An
// ACTIVE player now needs >180 days to afford all level-5
// upgrades (was ~149 days at #7).
//
// Sponsored ads (owner monetization slot):
//   A "Tonton Iklan" button pays AD_REWARD_KT (0,375 KT) per view — the
//   slot where the owner plugs in a real ad provider later. The
//   reward is capped server-side: at most AD_DAILY_CAP (10) views per
//   calendar day (= 3,75 KT/day max) and a
//   AD_COOLDOWN_SECONDS (1h) gap between views, both recomputed in
//   watchAd from the ad_reward rows in the activity log. No new table
//   or migration: the activity log IS the claim history, and ad_reward
//   classifies as an economy event in the split log.

import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import * as schema from "../../deploy/neon/schema.pg.js";
import { getDb, type Db } from "./store.js";
import { resolveSession, type Session } from "./telegram.js";
import {
  ANOMALIES_EN,
  ASTEROID_CLASSES_EN,
  ASTEROID_NICKNAMES_EN,
  fmtDateLang,
  fmtNum,
  normalizeLang,
  serverStrings,
  type Lang,
} from "./i18n.js";
import {
  clearPlayerFlag,
  evaluateAntiCheat,
  listFlaggedPlayers,
  recordCollectLatency,
  recordTamperAttempt,
} from "./anticheat.js";
import {
  buildInvoicePayload,
  createInvoiceLink,
  parseInvoicePayload,
  setWebhook,
  STARS_WEBHOOK_URL,
} from "./stars.js";
import {
  GRAM_RECEIVER_ADDRESS,
  NANO_TON_PER_GRAM,
  verifyGramTransaction,
} from "./ton.js";

// ---------------------------------------------------------------------------
// Game design constants
// ---------------------------------------------------------------------------

export const KT_PER_USDT = 1000;
export const DAILY_BONUS_KT = 0.625;
export const AD_REWARD_KT = 0.375;
export const AD_DAILY_CAP = 10;
const AD_COOLDOWN_SECONDS = 3600; // 1 jam antar-iklan (owner 2026-11-19: cegah farming iklan)

// Hadiah referral (2026-11-20): 10 KT ke PENGUNDANG saat pemain yang
// diundangnya menyelesaikan ekspedisi PERTAMANYA. Jumlah TETAP —
// pemilik mendelegasikan angkanya ke Muse: 10 KT ≈ 2–3 jam main
// aktif gratis (~100 KT/hari), jadi 10 referral = satu WD pertama
// (100 KT) — layak dibagikan, tidak layak di-farming (tiap akun
// palsu butuh akun Telegram sendiri + main sungguhan, dan anti-cheat
// menandai >3 akun/IP). Tidak ada bonus untuk yang diundang di fase
// ini (hanya pengundang). Satu-satunya tempat angka ini dipakai:
// payReferralRewardIfPending di bawah.
export const REFERRAL_REWARD_KT = 10;
export const BASE_MAX_ENERGY = 30;
export const BASE_REGEN_SECONDS = 240; // 1 energy per 4 minutes — deliberately slow (see economy note above)
const REGEN_MIN_SECONDS = 60; // hard floor for the Reaktor upgrade curve (pre-Premium)
const SCAN_ENERGY_COST = 5;
const ABANDON_ENERGY_COST = 2;
const BASE_SCAN_SECONDS = 150; // base scan is deliberately slow (2,5 menit) — the Spektrometer upgrade is what speeds it up
const TRAVEL_ENERGY_COST = 4; // base hop to the nearest map; +2 per extra map step (distance)

// WD minimum (anti-bangkrut): DUA TINGKAT, tanpa tangga.
//   - WD pertama: 100 KT (0,1 USDT) — receh, hook murah. 0,5 USDT
//     terlalu mahal dibayar pemilik per pemain baru (owner
//     2026-11-19). Target WD pertama >10 hari DIGUGURKAN dengan
//     sengaja oleh pemilik — WD pertama ~1–2 hari untuk pemain aktif.
//   - WD kedua dan seterusnya: 5.000 KT (5 USDT) — FLAT, tidak naik lagi.
// Jumlah WD tetap kelipatan 100 KT (0,1 USDT), jadi WD ulang bisa
// 5.000, 5.100, 5.200 KT, dst. — 5.000 KT adalah MINIMUM, bukan
// jumlah pasti. Sumber kebenaran: riwayat WD terbayar (paidCount==0
// → 100 KT, paidCount>=1 → 5.000 KT). Zod floor tetap WD_STEP_KT
// (100): granularitas, bukan minimum — minimum ditegakkan di handler
// requestWithdrawal dengan pesan detail yang menyebut minimumnya.
const WD_STEP_KT = 100;
export const WD_FIRST_MIN_KT = 100;
export const WD_REPEAT_MIN_KT = 5000;
export function wdMinKtForPaidCount(paidCount: number): number {
  return paidCount >= 1 ? WD_REPEAT_MIN_KT : WD_FIRST_MIN_KT;
}

// WD MAXIMUM per WD (anti-bangkrut): MAKSIMUM 5.000 KT (5 USDT)
// per WD — repeat WD praktis selalu tepat 5.000 KT: min = max =
// 5.000. WD pertama: min 100 KT, max 5.000 KT. TIDAK ADA jeda
// waktu antar-WD (cooldown DIHAPUS 2026-11-19 atas perintah
// pemilik: "buat agar KT-nya terkumpul sampai bisa di-WD, jangan
// 14 hari" — pacing harus datang dari AKUMULASI KT yang lambat,
// bukan dari timer). Dulu ada ceiling 14 hari lalu 30 hari
// (WD_COOLDOWN_DAYS + getWdCooldownStatus); keduanya dihapus
// total — tidak ada konstanta, helper, pengecekan, atau field
// state cooldown yang tersisa. Konsekuensi yang JUJUR: tanpa
// cooldown tidak ada langit-langit keras — pemain tercepat
// (Premium + upgrade penuh) tetap mengumpulkan 5.000 KT dalam
// hitungan hari, bukan minggu; yang membatasi mereka hanyalah
// kecepatan akumulasi KT (lihat rebalance #7 di PORT_NOTES.md).
export const WD_MAX_KT = 5000;

// Premium Pass plans — priced in Telegram Stars AND in GRAM (TON),
// two payment methods for the same pass. Stars: paid via a real
// Stars invoice; Premium activates automatically on the webhook —
// the Kendali confirm button is only a fallback for missed
// payments. Prices raised 2026-11-20 (Standard 150→300, Pro
// 500→1000) so the owner profits on every player profile: at the
// old prices a fully-upgraded (lvl 5) player cost the owner more
// in extra USDT withdrawals than the Stars were worth.
// GRAM: paid via TON Connect (wallet) — the player approves ONE
// transaction sending X GRAM to the owner's public wallet; the
// server verifies it on-chain (api/_lib/ton.ts) and activates
// Premium automatically, no hash copying by the player. GRAM
// prices are FIXED amounts (Standard 4 GRAM ≈ $4.08, Pro 13 GRAM
// ≈ $13.26 at ~$1.02/GRAM) — slightly above the Stars USD value,
// and the owner keeps 100% instantly (no Fragment 21-day hold,
// no 1.000 minimum). GRAM's USD price MOVES, so these fixed
// amounts need a periodic check against the GRAM price.
const PREMIUM_PLANS = {
  standard: { days: 7, stars: 300, gram: 4, gramNanoTon: 4 * NANO_TON_PER_GRAM, tier: "standard" as const, label: "Standard · 7 hari", labelEn: "Standard · 7 days" },
  pro: { days: 30, stars: 1000, gram: 13, gramNanoTon: 13 * NANO_TON_PER_GRAM, tier: "pro" as const, label: "Pro · 30 hari", labelEn: "Pro · 30 days" },
} as const;
type PremiumPlanId = keyof typeof PREMIUM_PLANS;
type PremiumTier = "standard" | "pro";
const PREMIUM_TIME_FACTOR = 0.75; // scan & mining 25% faster
const PREMIUM_SELL_BONUS = 0.15; // +15% sell prices
const PREMIUM_REGEN_DIVISOR = 2; // energy regen twice as fast
const DUAL_DRILL_FACTOR = 0.5; // Pro tier: two drill arms — mining takes half the time

type OreDef = {
  id: string;
  name: string;
  /** English display name (i18n) — same ore, same price. */
  nameEn: string;
  price: number; // base KT per unit
  color: string;
  icon: string; // client-side SVG icon id (matches the ore id)
  hardness: number; // 1 (soft regolith) .. 4 (helium-3 crystal lattice)
  // Drop weight per zone index (0..4). Index order matches ORES.
  weights: number[];
};

export const ORES: OreDef[] = [
  { id: "regolith", name: "Regolith Asteroid", nameEn: "Asteroid Regolith", price: 0.025, color: "#9a9186", icon: "regolith", hardness: 1, weights: [34, 20, 12, 8, 5] },
  { id: "kondrit", name: "Kondrit Karbon", nameEn: "Carbonaceous Chondrite", price: 0.05, color: "#4b4f5e", icon: "kondrit", hardness: 1, weights: [26, 34, 18, 10, 6] },
  { id: "besinikel", name: "Besi-Nikel", nameEn: "Iron-Nickel", price: 0.125, color: "#c97a3a", icon: "besinikel", hardness: 2, weights: [14, 16, 28, 15, 9] },
  { id: "kobalt", name: "Kobalt Antariksa", nameEn: "Space Cobalt", price: 0.25, color: "#5b8cff", icon: "kobalt", hardness: 2, weights: [8, 8, 17, 17, 11] },
  { id: "platinum", name: "Platinum", nameEn: "Platinum", price: 1.125, color: "#e6ebf2", icon: "platinum", hardness: 3, weights: [4, 3, 8, 18, 15] },
  { id: "iridium", name: "Iridium", nameEn: "Iridium", price: 3.6, color: "#f2b705", icon: "iridium", hardness: 3, weights: [2, 1, 4, 12, 18] },
  { id: "helium3", name: "Kristal Helium-3", nameEn: "Helium-3 Crystal", price: 9, color: "#6ee7ff", icon: "helium3", hardness: 4, weights: [0, 0, 1, 3, 9] },
  // Batu mulia khas tiap peta — dua permata unggulan per map, hanya
  // muncul di map-nya (weight di zone lain 0).
  { id: "opal", name: "Opal Pelangi", nameEn: "Rainbow Opal", price: 0.975, color: "#f9a8d4", icon: "opal", hardness: 2, weights: [7, 0, 0, 0, 0] },
  { id: "topaz", name: "Topaz Emas", nameEn: "Golden Topaz", price: 1.275, color: "#fbbf24", icon: "topaz", hardness: 2, weights: [5, 0, 0, 0, 0] },
  { id: "turkuois", name: "Turkuois Orbit", nameEn: "Orbital Turquoise", price: 1.95, color: "#2dd4bf", icon: "turkuois", hardness: 2, weights: [0, 6, 0, 0, 0] },
  { id: "ametis", name: "Ametis Sabuk", nameEn: "Belt Amethyst", price: 2.625, color: "#a78bfa", icon: "ametis", hardness: 3, weights: [0, 4, 0, 0, 0] },
  { id: "zamrud", name: "Zamrud Bulan", nameEn: "Moon Emerald", price: 4.8, color: "#34d399", icon: "zamrud", hardness: 3, weights: [0, 0, 5, 0, 0] },
  { id: "rubi", name: "Rubi Mare", nameEn: "Mare Ruby", price: 6.3, color: "#f87171", icon: "rubi", hardness: 3, weights: [0, 0, 3, 0, 0] },
  { id: "safir", name: "Safir Bintang", nameEn: "Star Sapphire", price: 10.5, color: "#60a5fa", icon: "safir", hardness: 4, weights: [0, 0, 0, 5, 0] },
  { id: "berlian", name: "Berlian Psyche", nameEn: "Psyche Diamond", price: 14.25, color: "#f8fafc", icon: "berlian", hardness: 4, weights: [0, 0, 0, 3, 0] },
  { id: "opales", name: "Opal Es Hitam", nameEn: "Black Ice Opal", price: 22.5, color: "#c084fc", icon: "opales", hardness: 4, weights: [0, 0, 0, 0, 4] },
  { id: "voidium", name: "Kristal Voidium", nameEn: "Voidium Crystal", price: 36, color: "#818cf8", icon: "voidium", hardness: 4, weights: [0, 0, 0, 0, 2] },
];
const RARE_IDS = new Set([
  "platinum", "iridium", "helium3",
  "zamrud", "rubi", "safir", "berlian", "opales", "voidium",
]);

type MapDef = {
  name: string;
  /** English display strings (i18n) — same map, same rules. */
  nameEn: string;
  tagline: string;
  taglineEn: string;
  desc: string;
  descEn: string;
  minLayer: number; // sector needed to unlock this map
  image: string; // client asset key
  distanceLabel: string; // how far this map is from Earth — farther = slower ops
  distanceLabelEn: string;
  // Challenge profile — map 1 is the gentle starter, map 5 the endgame.
  jamChance: number; // 0..1 — drill jams mid-job: vein lost, energy lost
  damageChance: number; // 0..1 — hull hit while mining: repair fee in KT
  damageFeeKt: number; // repair fee per hull hit (capped at KT balance)
  radiation: number; // extra energy drained by every scan & mining job
  timeFactor: number; // multiplies scan & mining durations — grows with distance
  veinCount: [number, number]; // min/max veins per asteroid
};

export const MAPS: MapDef[] = [
  {
    name: "Orbit Rendah — Pos Tambang LEO",
    nameEn: "Low Orbit — LEO Mining Post",
    tagline: "Peta pemula · aman & ramah",
    taglineEn: "Starter map · safe & friendly",
    desc: "Asteroid kecil dekat Bumi, jauh dari bahaya. Regolith dan kondrit karbon mendominasi, dengan kilau Opal Pelangi dan Topaz Emas di sela batuan. Tempat belajar terbaik untuk penambang baru.",
    descEn: "Small asteroids near Earth, far from danger. Regolith and carbonaceous chondrite dominate, with flashes of Rainbow Opal and Golden Topaz between the rocks. The best place for new miners to learn.",
    minLayer: 1,
    image: "hero",
    distanceLabel: "±0,01 SA dari Bumi — halaman belakang stasiun",
    distanceLabelEn: "±0.01 AU from Earth — the station's backyard",
    jamChance: 0,
    damageChance: 0,
    damageFeeKt: 0,
    radiation: 0,
    timeFactor: 1,
    veinCount: [3, 4],
  },
  {
    name: "Sabuk Asteroid Utama",
    nameEn: "Main Asteroid Belt",
    tagline: "Peta menengah · serpihan beterbangan",
    taglineEn: "Mid map · flying debris",
    desc: "Di antara Mars dan Jupiter, jutaan serpihan batu beterbangan. Kondrit melimpah, besi-nikel mulai muncul dari inti asteroid purba — dan Turkuois Orbit serta Ametis Sabuk bersembunyi di kawah-kawah tua. Serpihan kadang menyumbat mata bor.",
    descEn: "Between Mars and Jupiter, millions of rock fragments fly around. Chondrite is abundant, iron-nickel starts showing up from the cores of ancient asteroids — and Orbital Turquoise and Belt Amethyst hide in old craters. Debris sometimes clogs the drill bit.",
    minLayer: 3,
    image: "asteroid",
    distanceLabel: "±2,8 SA dari Bumi — di antara Mars dan Jupiter",
    distanceLabelEn: "±2.8 AU from Earth — between Mars and Jupiter",
    jamChance: 0.06,
    damageChance: 0,
    damageFeeKt: 0,
    radiation: 0,
    timeFactor: 1.3,
    veinCount: [3, 5],
  },
  {
    name: "Permukaan Bulan — Mare Tenang",
    nameEn: "Moon Surface — Mare Tranquillitatis",
    tagline: "Peta lanjutan · radiasi & debu tajam",
    taglineEn: "Advanced map · radiation & sharp dust",
    desc: "Regolith bulan yang keras dan berdebu tajam. Besi-nikel dan kobalt jadi buruan utama, Zamrud Bulan berkilau hijau dari singkapan batuan, dan Rubi Mare yang langka menunggu penambang tekun. Radiasi permukaan menguras daya setiap operasi, dan debu bulan sesekali membuat bor macet.",
    descEn: "Hard lunar regolith and sharp dust. Iron-nickel and cobalt are the main prize, Moon Emerald glints green from rock outcrops, and the rare Mare Ruby waits for patient miners. Surface radiation drains energy on every operation, and moon dust occasionally jams the drill.",
    minLayer: 6,
    image: "moon",
    distanceLabel: "384 ribu km dari Bumi — tetangga terdekat, batuan kerasnya yang bikin lama",
    distanceLabelEn: "384 thousand km from Earth — the closest neighbour, its hard rock is what slows you down",
    jamChance: 0.08,
    damageChance: 0.05,
    damageFeeKt: 60,
    radiation: 1,
    timeFactor: 1.6,
    veinCount: [4, 5],
  },
  {
    name: "Asteroid Logam 16 Psyche",
    nameEn: "Metal Asteroid 16 Psyche",
    tagline: "Peta sulit · inti logam raksasa",
    taglineEn: "Hard map · giant metal core",
    desc: "Asteroid raksasa yang hampir seluruhnya logam padat. Platinum dan iridium jauh lebih sering terlihat, Safir Bintang dan Berlian Psyche tertanam di inti besinya. Batuan sekeras ini membuat bor sering macet, dan serpihan logam tajam bisa merobek lambung kapal — siapkan KT untuk biaya perbaikan.",
    descEn: "A giant asteroid made almost entirely of solid metal. Platinum and iridium show up far more often, Star Sapphire and Psyche Diamond are embedded in its iron core. Rock this hard jams drills often, and sharp metal shards can tear the hull — keep KT ready for repair fees.",
    minLayer: 10,
    image: "psyche",
    distanceLabel: "±3,3 SA dari Bumi — jauh di sabuk utama luar",
    distanceLabelEn: "±3.3 AU from Earth — deep in the outer main belt",
    jamChance: 0.12,
    damageChance: 0.1,
    damageFeeKt: 150,
    radiation: 1,
    timeFactor: 2,
    veinCount: [4, 6],
  },
  {
    name: "Sabuk Kuiper — Inti Es Antariksa",
    nameEn: "Kuiper Belt — Deep-Space Ice Core",
    tagline: "Peta tersulit · ujung tata surya",
    taglineEn: "Hardest map · edge of the solar system",
    desc: "Ujung tata surya: gelap, membeku, dan bermandikan radiasi kosmik. Iridium dan kristal Helium-3 menunggu di sini, bersama Opal Es Hitam dan Kristal Voidium — permata termahal yang dikenal stasiun. Bor membeku dan macet, lambung kapal rapuh diterpa puing es, dan setiap operasi menguras daya jauh lebih besar. Hanya penambang paling sabar yang pulang kaya dari sini.",
    descEn: "The edge of the solar system: dark, freezing, and bathed in cosmic radiation. Iridium and Helium-3 crystals wait here, along with Black Ice Opal and Voidium Crystal — the most expensive gems the station knows. Drills freeze and jam, the hull grows brittle under ice debris, and every operation drains far more energy. Only the most patient miners come home rich from here.",
    minLayer: 15,
    image: "kuiper",
    distanceLabel: "±40 SA dari Bumi — ujung tata surya, sinyal saja butuh berjam-jam",
    distanceLabelEn: "±40 AU from Earth — the edge of the solar system, even a signal takes hours",
    jamChance: 0.16,
    damageChance: 0.14,
    damageFeeKt: 300,
    radiation: 2,
    timeFactor: 2.5,
    veinCount: [4, 6],
  },
];

const ASTEROID_CLASSES: string[][] = [
  ["Tipe C — Karbonan", "Tipe S — Silikat"],
  ["Tipe S — Silikat", "Tipe C — Karbonan", "Tipe M — Metalik"],
  ["Silikat Padat Bulan", "Tipe S — Silikat"],
  ["Tipe M — Metalik Murni"],
  ["Tipe D — Es Gelap", "Objek Kuiper — Inti Es"],
];
const ASTEROID_NICKNAMES = [
  "Kawah Bisu", "Pilar Senja", "Bara Dingin", "Saksi Bisu", "Pelita Jauh",
  "Gema Karbon", "Tanduk Besi", "Rimba Sunyi", "Cermin Retak", "Penjaga Orbit",
  "Lentera Mati", "Bukit Nikel", "Sungai Debu", "Menara Es", "Jangkar Langit",
  "Taman Karat", "Suara Jauh", "Kubah Retak", "Lorong Angin", "Benteng Sunyi",
];
const ANOMALIES: { text: string; factor: number }[] = [
  { text: "Struktur batuan rapuh — pengeboran 20% lebih cepat di asteroid ini.", factor: 0.8 },
  { text: "Medan magnet kuat mengganggu lengan bor — pengeboran 25% lebih lambat di asteroid ini.", factor: 1.25 },
  { text: "Pantulan sensor aneh dari inti asteroid — teknisi bilang itu cuma gangguan biasa.", factor: 1.0 },
];

type UpgradeDef = {
  id: string;
  name: string;
  /** English display strings (i18n) — same upgrade, same cost. */
  nameEn: string;
  desc: string;
  descEn: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
};

export const UPGRADES: UpgradeDef[] = [
  { id: "beliung", name: "Lengan Bor Laser", nameEn: "Laser Drill Arm", desc: "Pengeboran setiap urat mineral 6% lebih cepat per level — mata bor laser memotong batuan lebih efisien.", descEn: "Drilling each mineral vein is 6% faster per level — the laser bit cuts through rock more efficiently.", baseCost: 150, growth: 1.6, maxLevel: 10 },
  { id: "tangki", name: "Tangki O₂ & Baterai Surya", nameEn: "O₂ Tank & Solar Battery", desc: "KAPASITAS daya: +6 daya maksimum per level (30 → 90). Tangki O₂ yang lebih besar memperpanjang napas misi di permukaan, dan baterai surya menyimpan cadangan daya lebih banyak — jadi kamu bisa menjalankan lebih banyak scan & bor dalam satu sesi, dan daya yang terisi saat kamu tidak bermain tidak terbuang karena tangki cepat penuh. Upgrade ini TIDAK mempercepat isi ulang; kecepatan isi ulang diatur Reaktor Fusi Mini.", descEn: "Energy CAPACITY: +6 max energy per level (30 → 90). A bigger O₂ tank stretches your mission breath on the surface, and the solar battery banks more reserve energy — so you can run more scans & drills in one session, and energy gained while you're away isn't wasted by a tank that fills up too fast. This upgrade does NOT speed up recharge; recharge speed is set by the Mini Fusion Reactor.", baseCost: 120, growth: 1.6, maxLevel: 10 },
  { id: "bor", name: "Reaktor Fusi Mini", nameEn: "Mini Fusion Reactor", desc: "KECEPATAN isi ulang daya: waktu isi ulang berkurang 10% per level — dari 4 menit per daya di level 0 menjadi sekitar 1 menit 24 detik per daya di level 10. Inilah upgrade yang membuat daya kapal pulih lebih cepat; tanpa upgrade ini isi ulang sengaja dibuat lambat.", descEn: "Energy recharge SPEED: recharge time drops 10% per level — from 4 minutes per energy at level 0 to about 1 minute 24 seconds per energy at level 10. This is the upgrade that makes ship energy recover faster; without it, recharge is deliberately slow.", baseCost: 200, growth: 1.7, maxLevel: 10 },
  { id: "ransel", name: "Drone Kargo Otomatis", nameEn: "Automated Cargo Drone", desc: "+7% peluang hasil ganda saat mengambil hasil tambang (drone mengangkut 2× lipat) per level.", descEn: "+7% chance of a double haul when collecting mining results (the drone carries 2× as much) per level.", baseCost: 180, growth: 1.6, maxLevel: 10 },
  { id: "negosiator", name: "Negosiator Stasiun Orbital", nameEn: "Orbital Station Negotiator", desc: "+5% harga jual semua mineral di Stasiun Orbital per level.", descEn: "+5% sell price for all minerals at the Orbital Station per level.", baseCost: 250, growth: 1.65, maxLevel: 10 },
  { id: "pemindai", name: "Spektrometer Inti", nameEn: "Core Spectrometer", desc: "Scan asteroid 7% lebih cepat per level, dan +25% peluang urat Iridium & Kristal Helium-3 muncul di asteroid berikutnya.", descEn: "Asteroid scans 7% faster per level, and +25% chance that Iridium & Helium-3 crystal veins appear on the next asteroid.", baseCost: 400, growth: 1.75, maxLevel: 8 },
];

function oreById(id: string): OreDef | undefined {
  return ORES.find((o) => o.id === id);
}
function upgradeById(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}
export function upgradeCost(def: UpgradeDef, level: number): number {
  return Math.round((def.baseCost * Math.pow(def.growth, level)) / 5) * 5;
}
function mapByIndex(idx: number): MapDef {
  return MAPS[Math.min(Math.max(idx, 0), MAPS.length - 1)] ?? MAPS[0]!;
}
function isPremium(p: { premiumUntil: Date | null }): boolean {
  return p.premiumUntil != null && p.premiumUntil.getTime() > Date.now();
}
function premiumTierOf(p: { premiumUntil: Date | null; premiumTier: PremiumTier | null }): PremiumTier | null {
  return isPremium(p) ? p.premiumTier : null;
}
function hasDualDrill(p: { premiumUntil: Date | null; premiumTier: PremiumTier | null }): boolean {
  return premiumTierOf(p) === "pro";
}
function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Expedition (current asteroid) + timed jobs
// ---------------------------------------------------------------------------

type Vein = {
  oreId: string;
  qty: number;
  richness: number; // 45..98 percent; >= 85 yields a +1 bonus unit
  mined: boolean;
};

type Expedition = {
  name: string;
  klass: string;
  diameterKm: number;
  zone: number; // map index this asteroid belongs to
  scanned: boolean;
  anomalyText: string | null;
  timeFactor: number;
  veins: Vein[];
};

type Job = {
  kind: "scan" | "mine";
  veinIndex: number | null;
  oreId: string | null;
  startedAt: number; // ms epoch
  endsAt: number; // ms epoch
  durationSec: number;
  // Map challenge rolls, decided server-side when the job STARTS and
  // revealed only when the result is collected — a jammed drill loses
  // the vein, a hull hit charges a repair fee. Null on legacy jobs.
  jammed?: boolean;
  hullHit?: boolean;
};

export function generateExpedition(zoneIdx: number, levels: Record<string, number>): Expedition {
  const map = mapByIndex(zoneIdx);
  const pemindai = levels["pemindai"] ?? 0;
  const weights = ORES.map((o) => {
    let w = o.weights[zoneIdx] ?? 0;
    if (o.id === "iridium" || o.id === "helium3") w *= 1 + 0.25 * pemindai;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const pickOre = (): OreDef => {
    let roll = Math.random() * total;
    let chosen: OreDef | undefined;
    ORES.forEach((ore, i) => {
      if (chosen) return;
      roll -= weights[i] ?? 0;
      if (roll <= 0) chosen = ore;
    });
    if (!chosen) chosen = ORES[ORES.length - 1];
    if (!chosen) throw new Error("Daftar mineral kosong.");
    return chosen;
  };

  const veinCount = randInt(map.veinCount[0], map.veinCount[1]);
  const byOre = new Map<string, Vein>();
  for (let i = 0; i < veinCount; i++) {
    const ore = pickOre();
    const tier = ORES.indexOf(ore);
    const qty = tier <= 1 ? randInt(2, 4) : tier <= 3 ? randInt(1, 3) : tier <= 6 ? randInt(1, 2) : 1;
    const richness = randInt(45, 98);
    const existing = byOre.get(ore.id);
    if (existing) {
      existing.qty += qty;
      existing.richness = Math.max(existing.richness, richness);
    } else {
      byOre.set(ore.id, { oreId: ore.id, qty, richness, mined: false });
    }
  }

  const classes = ASTEROID_CLASSES[zoneIdx] ?? ASTEROID_CLASSES[0] ?? ["Tipe S — Silikat"];
  const klass = classes[randInt(0, classes.length - 1)] ?? classes[0] ?? "Tipe S — Silikat";
  const nick = ASTEROID_NICKNAMES[randInt(0, ASTEROID_NICKNAMES.length - 1)] ?? "Tanpa Nama";
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const code = `${letters[randInt(0, letters.length - 1)] ?? "A"}${letters[randInt(0, letters.length - 1)] ?? "B"}-${randInt(100, 9999)}`;
  const diameterRanges: [number, number][] = [[0.3, 2.5], [1, 8], [2, 12], [8, 30], [5, 45]];
  const range = diameterRanges[zoneIdx] ?? diameterRanges[0] ?? [0.3, 2.5];
  const diameterKm = Math.round((range[0] + Math.random() * (range[1] - range[0])) * 10) / 10;
  const anomaly = Math.random() < 0.3 ? ANOMALIES[randInt(0, ANOMALIES.length - 1)] : undefined;

  return {
    name: `Asteroid ${code} — ${nick}`,
    klass,
    diameterKm,
    zone: zoneIdx,
    scanned: false,
    anomalyText: anomaly ? anomaly.text : null,
    timeFactor: anomaly ? anomaly.factor : 1,
    veins: [...byOre.values()],
  };
}

function parseExpedition(raw: string): Expedition | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" && parsed !== null &&
      "name" in parsed && "veins" in parsed && Array.isArray((parsed as Expedition).veins) &&
      (parsed as Expedition).veins.length > 0
    ) {
      return parsed as Expedition;
    }
  } catch {
    // fall through — regenerate
  }
  return null;
}

function parseJob(raw: string | null): Job | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "kind" in parsed && "endsAt" in parsed) {
      return parsed as Job;
    }
  } catch {
    // fall through
  }
  return null;
}

function expeditionZone(exp: Expedition, fallback: number): number {
  return typeof exp.zone === "number" ? exp.zone : fallback;
}
function scanDurationForZone(zoneIdx: number, levels: Record<string, number>, premium: boolean): number {
  const map = mapByIndex(zoneIdx);
  const base = BASE_SCAN_SECONDS * (1 - 0.07 * (levels["pemindai"] ?? 0));
  return Math.max(45, Math.round(base * map.timeFactor * (premium ? PREMIUM_TIME_FACTOR : 1)));
}
export function scanDurationSec(exp: Expedition, levels: Record<string, number>, premium: boolean): number {
  return scanDurationForZone(expeditionZone(exp, 0), levels, premium);
}
export function mineDurationSec(vein: Vein, exp: Expedition, levels: Record<string, number>, premium: boolean, dualDrill: boolean): number {
  const ore = oreById(vein.oreId);
  const hardness = ore?.hardness ?? 1;
  const map = mapByIndex(expeditionZone(exp, 0));
  const base = 30 + hardness * 25 + vein.qty * 8;
  const sped = base * exp.timeFactor * map.timeFactor * (1 - 0.06 * (levels["beliung"] ?? 0)) * (premium ? PREMIUM_TIME_FACTOR : 1) * (dualDrill ? DUAL_DRILL_FACTOR : 1);
  return Math.max(25, Math.round(sped));
}
export function scanEnergyCost(exp: Expedition): number {
  return SCAN_ENERGY_COST + mapByIndex(expeditionZone(exp, 0)).radiation;
}
export function mineEnergyCost(vein: Vein, exp: Expedition): number {
  const ore = oreById(vein.oreId);
  return 4 + (ore?.hardness ?? 1) + mapByIndex(expeditionZone(exp, 0)).radiation;
}
// Expedition completion bonus (anti-bangkrut, rebalance #6): the
// bonus grows with sector, but it is CAPPED — without the cap it
// grew without limit (1 + 0,2×sektor in #5) and became 86–93% of
// earnings, so the WD pace kept accelerating the longer someone
// Rebalance #7 (2026-11-19): the formula is halved AGAIN
// (0,25 + 0,05×sektor) AND the cap is halved with it (35 → 17,5
// KT). Halving ONLY the slope while keeping the cap at 35 does
// NOT halve the steady-state bonus — the bonus is 86–93% of
// earnings, and at sector 695+ it would still pay the full 35 KT
// per expedition, so the active repeat-WD interval would stick at
// ~15 days at days 166–180 no matter how much the ore/faucet
// were cut (measured in the sim: 21,1 hari at 46–60 → 14,8 hari
// at 166–180 with cap 35 — not 30 days, not stable). Halving the
// cap keeps it binding at the SAME sector 345
// (0,25 + 0,05×345 = 17,5), i.e. the same ~day 38 for an active
// player as #6 — that is what keeps the pace stable across
// horizons. The cap value is chosen from the simulation (see
// PORT_NOTES.md, rebalance #7): it is the value that holds an
// ACTIVE player's repeat-WD interval at ~28 days, stable from days
// 46–60 through days 166–180.
//
// Rebalance #8 (2026-11-19, owner: "kurangi bonusnya" — the bonus
// is 85–89% of ALL earnings at #7, so it is the biggest lever and
// the main leak; ore mining is only ~10%): formula halved AGAIN
// (0,125 + 0,025×sektor) AND the cap halved with it (17,5 → 8,75
// KT). The cap still binds at the SAME sector 345
// (0,125 + 0,025×345 = 8,75), so the pace stays stable across
// horizons. Everything else is unchanged (ore, gems, daily bonus,
// ads, power, timings, upgrade costs, WD rule, Premium).
export const MAX_COMPLETION_BONUS_KT = 8.75;
export function completionBonusKt(layer: number): number {
  return roundKt(Math.min(0.125 + layer * 0.025, MAX_COMPLETION_BONUS_KT));
}

/** Ekspedisi yang dibutuhkan untuk naik dari sektor L ke L+1.
 *  Aturan progres sektor (2026-11-20, perintah pemilik — naik map
 *  harus susah): Sektor 1→2 butuh 1 ekspedisi, 2→3 butuh 2, 3→4
 *  butuh 3, dst. Total ekspedisi untuk membuka peta: Peta 2
 *  (Sektor 3) = 3, Peta 3 (Sektor 6) = 15, Peta 4 (Sektor 10) =
 *  45, Peta 5 (Sektor 15) = 105. Bonus ekspedisinya TIDAK berubah
 *  (masih 0,125 + 0,025×sektor, cap 8,75) — ia hanya tumbuh lebih
 *  lambat karena sektornya naik lebih lambat. */
export function expeditionsToAdvance(layer: number): number {
  return layer;
}

/** KT is fractional since rebalance #5 (Regolith 0,1 KT),
 *  2-decimal since rebalance #6 (Regolith 0,05 KT), and
 *  3-decimal since rebalance #7 (Regolith 0,025 KT). Every KT
 *  credit AND debit is rounded to 3 decimals at the point it
 *  touches the balance, so the stored balance is always a clean
 *  3-decimal double and binary float dust (0.30000000000000004)
 *  can never accumulate. The DB column is DOUBLE PRECISION (see
 *  schema.pg.ts + migration-0003): Drizzle maps it to a JS number,
 *  unlike NUMERIC which comes back as a string and would break
 *  every `p.ktBalance + x` (string concat) and every `z.number()`
 *  check. */
export function roundKt(n: number): number {
  return Math.round(n * 1000) / 1000;
}
/** Locale-aware KT formatting for server-written activity messages
 *  (raw `${n}` would print a dot, e.g. "1.2 KT"). Indonesian prints
 *  "5.000" / "0,025", English prints "5,000" / "0.025". Default "id"
 *  keeps every existing test and log message byte-identical. */
export function fmtKt(n: number, lang: Lang = "id"): string {
  return fmtNum(n, lang);
}

/** Localized display helpers — pick the English field when the
 *  player's session language is "en", else the Indonesian original. */
export function oreName(ore: OreDef, lang: Lang): string {
  return lang === "en" ? ore.nameEn : ore.name;
}
/** Localized ore name by id (null when the ore id is unknown). */
export function oreNameById(id: string, lang: Lang): string | null {
  const ore = oreById(id);
  return ore ? oreName(ore, lang) : null;
}
export function mapName(map: MapDef, lang: Lang): string {
  return lang === "en" ? map.nameEn : map.name;
}
export function mapTagline(map: MapDef, lang: Lang): string {
  return lang === "en" ? map.taglineEn : map.tagline;
}
export function mapDesc(map: MapDef, lang: Lang): string {
  return lang === "en" ? map.descEn : map.desc;
}
export function mapDistanceLabel(map: MapDef, lang: Lang): string {
  return lang === "en" ? map.distanceLabelEn : map.distanceLabel;
}
export function upgradeName(def: UpgradeDef, lang: Lang): string {
  return lang === "en" ? def.nameEn : def.name;
}
export function upgradeDesc(def: UpgradeDef, lang: Lang): string {
  return lang === "en" ? def.descEn : def.desc;
}
export function premiumPlanLabel(plan: { label: string; labelEn: string }, lang: Lang): string {
  return lang === "en" ? plan.labelEn : plan.label;
}
/** Expedition names are stored as "Asteroid CODE — Nickname" (see
 *  generateExpedition). Translate the nickname part by index; the
 *  code and the word "Asteroid" stay the same in both languages. */
export function localizeExpeditionName(name: string, lang: Lang): string {
  if (lang !== "en") return name;
  const parts = name.split(" — ");
  const nick = parts[parts.length - 1] ?? "";
  const idx = ASTEROID_NICKNAMES.indexOf(nick);
  if (idx === -1) return name;
  parts[parts.length - 1] = ASTEROID_NICKNAMES_EN[idx] ?? nick;
  return parts.join(" — ");
}
/** Asteroid class strings ("Tipe C — Karbonan") are stored in the
 *  expedition; translate by (zone, index) lookup. */
export function localizeKlass(klass: string, zone: number, lang: Lang): string {
  if (lang !== "en") return klass;
  const classes = ASTEROID_CLASSES[zone] ?? [];
  const idx = classes.indexOf(klass);
  if (idx === -1) return klass;
  return ASTEROID_CLASSES_EN[zone]?.[idx] ?? klass;
}
/** Anomaly text is stored in the expedition; translate by exact match. */
export function localizeAnomaly(text: string | null, lang: Lang): string | null {
  if (text == null || lang !== "en") return text;
  const idx = ANOMALIES.findIndex((a) => a.text === text);
  if (idx === -1) return text;
  return ANOMALIES_EN[idx] ?? text;
}
/** Energy to fly to a map: the base hop plus 2 per map step of distance. */
function travelCostFor(zoneIdx: number, premium: boolean): number {
  return premium ? 0 : TRAVEL_ENERGY_COST + zoneIdx * 2;
}

// ---------------------------------------------------------------------------
// Player loading + energy regeneration
// ---------------------------------------------------------------------------

async function loadLevels(db: Db, playerId: number): Promise<Record<string, number>> {
  const rows = await db
    .select()
    .from(schema.upgrades)
    .where(eq(schema.upgrades.playerId, playerId));
  const levels: Record<string, number> = {};
  for (const def of UPGRADES) levels[def.id] = 0;
  for (const row of rows) levels[row.upgradeId] = row.level;
  return levels;
}

export function maxEnergy(levels: Record<string, number>): number {
  return BASE_MAX_ENERGY + 6 * (levels["tangki"] ?? 0);
}
export function regenSeconds(levels: Record<string, number>, premium: boolean): number {
  // Reaktor Fusi Mini ("bor") is the regen-speed upgrade: -10% per level.
  const base = Math.max(REGEN_MIN_SECONDS, Math.round(BASE_REGEN_SECONDS * Math.pow(0.9, levels["bor"] ?? 0)));
  return premium ? Math.max(30, Math.round(base / PREMIUM_REGEN_DIVISOR)) : base;
}
export function sellMultiplier(levels: Record<string, number>, premium: boolean): number {
  return 1 + 0.05 * (levels["negosiator"] ?? 0) + (premium ? PREMIUM_SELL_BONUS : 0);
}

type PlayerRow = typeof schema.player.$inferSelect;

/** Menyisipkan baris player baru dengan saldo/aturan awal yang sama
 *  untuk semua pemain. `id` eksplisit hanya untuk pemain web lama
 *  (id=1); pemain Telegram dibuat tanpa id (IDENTITY memberi nomor)
 *  dan dicatat telegram_id-nya. Mengembalikan id internal baris. */
async function insertFreshPlayer(
  db: Db,
  id: number | null,
  telegramId: number | null,
): Promise<number> {
  const exp = generateExpedition(0, {});
  const base = {
    ktBalance: 0,
    energy: BASE_MAX_ENERGY,
    energyUpdatedAt: new Date(),
    layer: 1,
    currentZone: 0,
    // NB: null eksplisit bertipe — tanpa strictNullChecks, `null`
    // polos melebar jadi implicit any (TS7018, pernah menggagalkan
    // build Vercel).
    premiumUntil: null as Date | null,
    premiumTier: null as "standard" | "pro" | null,
    grid: "[]",
    expedition: JSON.stringify(exp),
    job: null as string | null,
    totalScans: 0,
    asteroidsDone: 0,
    totalDigs: 0,
    totalKtEarned: 0,
    totalWdPaidUsdt: 0,
  };
  const inserted =
    id !== null
      ? await db
          .insert(schema.player)
          .values({ ...base, id })
          .returning({ id: schema.player.id })
      : await db
          .insert(schema.player)
          .values({ ...base, telegramId })
          .returning({ id: schema.player.id });
  const row = inserted[0];
  if (!row) throw new Error("player init failed");
  return row.id;
}

/** Memuat satu baris player berdasarkan id internal, atau null bila
 *  tidak ada. Dipakai aksi admin yang menyentuh pemain lain (WD /
 *  Premium milik pemain X) — tanpa regen/expedition, karena aksi
 *  admin tidak menyentuh daya atau asteroid. */
async function loadPlayerRowOrNull(
  db: Db,
  playerId: number,
): Promise<PlayerRow | null> {
  const rows = await db
    .select()
    .from(schema.player)
    .where(eq(schema.player.id, playerId))
    .limit(1);
  return rows[0] ?? null;
}

/** Loads (or creates) the player for one session, applies timed
 *  energy regen, and makes sure the player is orbiting a valid
 *  asteroid.
 *  - Sesi web lama (tanpa initData): pemain id=1 (telegram_id NULL).
 *  - Sesi Telegram: baris dicari lewat telegram_id yang SUDAH
 *    divalidasi di resolveSession; pemain baru dibuat dengan
 *    saldo/aturan awal yang sama persis. */
async function loadPlayer(db: Db, session: Session): Promise<PlayerRow> {
  let playerId: number;
  if (session.telegramId === null) {
    playerId = 1;
    const legacy = await db
      .select()
      .from(schema.player)
      .where(eq(schema.player.id, 1))
      .limit(1);
    if (!legacy[0]) {
      playerId = await insertFreshPlayer(db, 1, null);
    }
  } else {
    const byTelegram = await db
      .select()
      .from(schema.player)
      .where(eq(schema.player.telegramId, session.telegramId))
      .limit(1);
    if (byTelegram[0]) {
      playerId = byTelegram[0].id;
    } else {
      try {
        playerId = await insertFreshPlayer(db, null, session.telegramId);
      } catch {
        // Balapan dengan request pertama lain untuk pemain yang sama:
        // UNIQUE telegram_id menolak insert kedua — pakai baris yang
        // sudah tercipta.
        const retry = await db
          .select()
          .from(schema.player)
          .where(eq(schema.player.telegramId, session.telegramId))
          .limit(1);
        if (!retry[0]) throw new Error("player init failed");
        playerId = retry[0].id;
      }
    }
  }
  const levels = await loadLevels(db, playerId);
  const rows = await db
    .select()
    .from(schema.player)
    .where(eq(schema.player.id, playerId))
    .limit(1);
  let p = rows[0];
  if (!p) throw new Error("player init failed");
  // Energy regeneration: 1 energy per regenSeconds, capped at max.
  // Premium captains recharge twice as fast.
  const premium = isPremium(p);
  const cap = maxEnergy(levels);
  const intervalMs = regenSeconds(levels, premium) * 1000;
  const now = Date.now();
  const elapsed = now - p.energyUpdatedAt.getTime();
  if (p.energy < cap && elapsed >= intervalMs) {
    const gained = Math.floor(elapsed / intervalMs);
    const newEnergy = Math.min(cap, p.energy + gained);
    const newUpdated =
      newEnergy >= cap
        ? new Date(now)
        : new Date(p.energyUpdatedAt.getTime() + gained * intervalMs);
    await db
      .update(schema.player)
      .set({ energy: newEnergy, energyUpdatedAt: newUpdated })
      .where(eq(schema.player.id, playerId));
    p = { ...p, energy: newEnergy, energyUpdatedAt: newUpdated };
  } else if (p.energy >= cap && elapsed > 0) {
    await db
      .update(schema.player)
      .set({ energyUpdatedAt: new Date(now) })
      .where(eq(schema.player.id, playerId));
    p = { ...p, energyUpdatedAt: new Date(now) };
  }
  // Ensure a valid current asteroid (first visit after the expedition
  // rework, or a corrupted value, generates a fresh one on the current
  // map). Legacy expeditions without a stored map are adopted into the
  // player's current map.
  const parsedExp = parseExpedition(p.expedition);
  if (!parsedExp) {
    const exp = generateExpedition(p.currentZone, levels);
    await db
      .update(schema.player)
      .set({ expedition: JSON.stringify(exp) })
      .where(eq(schema.player.id, playerId));
    p = { ...p, expedition: JSON.stringify(exp) };
  } else if (typeof parsedExp.zone !== "number") {
    parsedExp.zone = p.currentZone;
    await db
      .update(schema.player)
      .set({ expedition: JSON.stringify(parsedExp) })
      .where(eq(schema.player.id, playerId));
    p = { ...p, expedition: JSON.stringify(parsedExp) };
  }
  // Username Telegram terakhir (hanya untuk dikenali admin di daftar
  // pemain mencurigakan — identitas tetap telegram_id).
  if (session.username && session.username !== p.username) {
    await db
      .update(schema.player)
      .set({ username: session.username })
      .where(eq(schema.player.id, playerId));
    p = { ...p, username: session.username };
  }
  // Anti-cheat otomatis: evaluasi berkala aturan nonstop +
  // multi-akun (max 1×/jam/pemain, di dalam fungsi). Tidak pernah
  // melempar — deteksi gagal = flag sekadar tidak naik, game tetap
  // jalan.
  await evaluateAntiCheat(db, p, session);
  return p;
}

/** Spends energy, restarting the regen clock if the tank was full. */
function energyAfterSpend(p: PlayerRow, levels: Record<string, number>, cost: number) {
  const energy = p.energy - cost;
  return {
    energy,
    energyUpdatedAt:
      energy < maxEnergy(levels) && p.energy >= maxEnergy(levels)
        ? new Date()
        : p.energyUpdatedAt,
  };
}

async function logActivity(
  db: Db,
  playerId: number,
  kind: string,
  message: string,
  amountKt: number | null,
): Promise<void> {
  await db
    .insert(schema.activity)
    .values({ playerId, kind, message, amountKt });
}

// The activity log is split into two streams for the UI: MISSION events
// (what happened out at the asteroid) and ECONOMY events (everything
// that moves KT, upgrades or Premium). Selling belongs to the economy
// stream, expeditions to the mission stream — classified here from the
// stored kind so old rows split correctly too.
const MISSION_KINDS = new Set(["scan", "jam", "rare_find", "expedition_bonus", "travel", "hull_damage"]);
function activityCategory(kind: string): "mission" | "economy" {
  return MISSION_KINDS.has(kind) ? "mission" : "economy";
}

/** How many WDs the owner has actually PAID — drives the two-tier
 *  WD minimum. Counted from the database on every relevant call, never
 *  taken from the client. */
async function countPaidWithdrawals(db: Db, playerId: number): Promise<number> {
  const rows = await db
    .select({ id: schema.wdRequests.id })
    .from(schema.wdRequests)
    .where(
      and(
        eq(schema.wdRequests.status, "paid"),
        eq(schema.wdRequests.playerId, playerId),
      ),
    );
  return rows.length;
}

// --- Referral (2026-11-20) --------------------------------------------
// Atribusi: pemain baru yang membuka Mini App pertama kali lewat
// link `?start=ref_<telegramId>` dicatat sebagai undangan pemain
// itu. Satu pemain yang diundang = satu baris, selamanya
// (UNIQUE di referrals.referred_player_id) — atribusi ulang tidak
// mungkin, dan pemain yang bergabung SEBELUM logika ini ada tidak
// bisa diatribusikan mundur (start_param mereka sudah hilang).
// Aturan: pengundang harus SUDAH jadi pemain, tidak bisa mengundang
// diri sendiri. Kegagalan apa pun (termasuk tabel referrals yang
// belum ada karena migrasi 0005 belum dijalankan) ditelan —
// atribusi tidak pernah merusak login / getGameState.
async function recordReferralAttribution(
  db: Db,
  newPlayerId: number,
  newTelegramId: number,
  startParam: string,
): Promise<void> {
  try {
    const m = /^ref_(\d+)$/.exec(startParam.trim());
    if (!m) return;
    const referrerTelegramId = Number(m[1]);
    if (!Number.isSafeInteger(referrerTelegramId) || referrerTelegramId <= 0)
      return;
    if (referrerTelegramId === newTelegramId) return; // tidak bisa mengundang diri sendiri
    const referrer = await db
      .select({ id: schema.player.id })
      .from(schema.player)
      .where(eq(schema.player.telegramId, referrerTelegramId))
      .limit(1);
    if (!referrer[0]) return; // pengundang harus sudah jadi pemain
    await db
      .insert(schema.referrals)
      .values({
        referrerPlayerId: referrer[0].id,
        referredPlayerId: newPlayerId,
        status: "pending",
      })
      .onConflictDoNothing({ target: schema.referrals.referredPlayerId });
  } catch {
    // Atribusi gagal = referral sekadar tidak tercatat; game tetap jalan.
  }
}

/** Statistik referral untuk satu pemain (tab Komunitas): berapa
 *  teman yang bergabung lewat link-nya, berapa yang sudah memberi
 *  hadiah, dan total KT yang sudah diterima dari referral. */
async function getReferralStats(
  db: Db,
  playerId: number,
): Promise<{ invited: number; rewarded: number; earnedKt: number }> {
  try {
    const rows = await db
      .select({ status: schema.referrals.status })
      .from(schema.referrals)
      .where(eq(schema.referrals.referrerPlayerId, playerId));
    const rewarded = rows.filter((r) => r.status === "rewarded").length;
    return {
      invited: rows.length,
      rewarded,
      earnedKt: roundKt(rewarded * REFERRAL_REWARD_KT),
    };
  } catch {
    // Tabel referrals belum ada (migrasi 0005 belum dijalankan):
    // statistik tampil 0, game tetap jalan.
    return { invited: 0, rewarded: 0, earnedKt: 0 };
  }
}

/** Membayar hadiah referral saat pemain yang diundang menyelesaikan
 *  ekspedisi PERTAMANYA: 10 KT masuk ke saldo PENGUNDANG (bukan ke
 *  yang diundang), baris referral berubah pending → rewarded, dan
 *  entri Log Ekonomi ditulis untuk pengundang. Hanya ekspedisi
 *  pertama yang membayar — setelah status "rewarded", ekspedisi
 *  berikutnya tidak menemukan baris pending lagi. Klaimnya atomik
 *  (UPDATE ... WHERE status='pending' + cek baris yang kena), jadi
 *  dua penyelesaian bersamaan tidak bisa membayar ganda. Pesan log
 *  ditulis dalam bahasa pemain YANG DIUNDANG saat itu (bahasa
 *  pengundang tidak disimpan per pemain — konvensi yang sama dengan
 *  entri log yang ditulis admin). Kegagalan apa pun ditelan —
 *  hadiah referral tidak pernah merusak penyelesaian ekspedisi. */
async function payReferralRewardIfPending(
  db: Db,
  referredPlayerId: number,
  lang: Lang,
): Promise<void> {
  try {
    const pending = await db
      .select()
      .from(schema.referrals)
      .where(
        and(
          eq(schema.referrals.referredPlayerId, referredPlayerId),
          eq(schema.referrals.status, "pending"),
        ),
      )
      .limit(1);
    const ref = pending[0];
    if (!ref) return;
    const claimed = await db
      .update(schema.referrals)
      .set({ status: "rewarded", rewardedAt: new Date() })
      .where(
        and(
          eq(schema.referrals.id, ref.id),
          eq(schema.referrals.status, "pending"),
        ),
      )
      .returning({ id: schema.referrals.id });
    if (!claimed[0]) return; // sudah diklaim (balapan) — jangan bayar ganda
    const referrer = await loadPlayerRowOrNull(db, ref.referrerPlayerId);
    if (!referrer) return; // tidak mungkin terjadi (FK), tapi jangan rusak ekspedisi
    await db
      .update(schema.player)
      .set({
        ktBalance: roundKt(referrer.ktBalance + REFERRAL_REWARD_KT),
        totalKtEarned: roundKt(referrer.totalKtEarned + REFERRAL_REWARD_KT),
      })
      .where(eq(schema.player.id, referrer.id));
    await logActivity(
      db,
      referrer.id,
      "referral_reward",
      serverStrings(lang).logReferralReward(REFERRAL_REWARD_KT),
      REFERRAL_REWARD_KT,
    );
  } catch {
    // Hadiah gagal = referral sekadar tidak terbayar kali ini;
    // ekspedisi si yang diundang tetap selesai seperti biasa.
  }
}

async function canClaimDailyBonus(db: Db, playerId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.activity)
    .where(
      and(
        eq(schema.activity.playerId, playerId),
        eq(schema.activity.kind, "daily_bonus"),
      ),
    )
    .orderBy(desc(schema.activity.id))
    .limit(1);
  const last = rows[0];
  if (!last) return true;
  const a = last.createdAt;
  const b = new Date();
  return (
    a.getFullYear() !== b.getFullYear() ||
    a.getMonth() !== b.getMonth() ||
    a.getDate() !== b.getDate()
  );
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type AdStats = {
  watchedToday: number;
  remainingToday: number;
  cooldownRemainingSec: number;
  canWatch: boolean;
  lastWatchedAt: Date | null;
};

/** Server-authoritative ad reward stats: counts today's ad_reward
 *  activity rows and enforces the cooldown from the most recent one.
 *  The client can display these numbers but can never bypass them —
 *  watchAd re-checks them on every claim. */
async function getAdStats(db: Db, playerId: number): Promise<AdStats> {
  const rows = await db
    .select()
    .from(schema.activity)
    .where(
      and(
        eq(schema.activity.playerId, playerId),
        eq(schema.activity.kind, "ad_reward"),
      ),
    )
    .orderBy(desc(schema.activity.id))
    .limit(100);
  const now = new Date();
  const watchedToday = rows.filter((r) => isSameCalendarDay(r.createdAt, now)).length;
  const last = rows[0] ?? null;
  let cooldownRemainingSec = 0;
  if (last) {
    const elapsedSec = Math.floor((now.getTime() - last.createdAt.getTime()) / 1000);
    cooldownRemainingSec = Math.max(0, AD_COOLDOWN_SECONDS - elapsedSec);
  }
  const remainingToday = Math.max(0, AD_DAILY_CAP - watchedToday);
  return {
    watchedToday,
    remainingToday,
    cooldownRemainingSec,
    canWatch: remainingToday > 0 && cooldownRemainingSec === 0,
    lastWatchedAt: last ? last.createdAt : null,
  };
}

// ---------------------------------------------------------------------------
// Telegram Stars (XTR) Premium — aktivasi + webhook
// ---------------------------------------------------------------------------
// Aturan perpanjangan Premium yang SAMA untuk konfirmasi manual admin
// (confirmPremiumOrder) dan pembayaran otomatis via webhook Stars
// (applyStarsPayment): basis = premium_until saat ini bila masih di
// masa depan, kalau tidak sekarang; pesanan Pro selalu menetapkan
// Pro; pesanan Standard tidak pernah menurunkan Pro yang masih aktif.
// ---------------------------------------------------------------------------

type PremiumOrderRow = typeof schema.premiumOrders.$inferSelect;

/** Mengaktifkan (atau memperpanjang) Premium dari sebuah baris
 *  premium_orders yang sudah dibayar/dikonfirmasi — menulis
 *  premiumUntil + premiumTier pemain dan entri Log Ekonomi
 *  (premium_confirm). Mengembalikan tanggal akhir Premium yang baru. */
async function activatePremiumOrder(
  db: Db,
  order: PremiumOrderRow,
  target: PlayerRow,
  lang: Lang,
): Promise<Date> {
  const base =
    target.premiumUntil && target.premiumUntil.getTime() > Date.now()
      ? target.premiumUntil.getTime()
      : Date.now();
  const until = new Date(base + order.days * 24 * 60 * 60 * 1000);
  // Tier: a Pro order always sets Pro; a Standard order never
  // downgrades an active Pro pass.
  const tier: PremiumTier =
    order.tier === "pro" ||
    (isPremium(target) && target.premiumTier === "pro")
      ? "pro"
      : "standard";
  await db
    .update(schema.player)
    .set({ premiumUntil: until, premiumTier: tier })
    .where(eq(schema.player.id, target.id));
  // Log Ekonomi memakai mata uang pesanan yang sebenarnya: GRAM
  // untuk pesanan TON Connect, Stars untuk pesanan XTR.
  const tierLabel =
    tier === "pro"
      ? lang === "en"
        ? "Pro (dual drill)"
        : "Pro (bor ganda)"
      : "Standard";
  await logActivity(
    db,
    order.playerId,
    "premium_confirm",
    order.method === "gram"
      ? serverStrings(lang).logPremiumConfirmGram(
          order.gramAmount ?? 0,
          tierLabel,
          order.days,
          fmtDateLang(until, lang),
        )
      : serverStrings(lang).logPremiumConfirm(
          order.stars,
          tierLabel,
          order.days,
          fmtDateLang(until, lang),
        ),
    null,
  );
  return until;
}

export type StarsPreCheckoutQuery = {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
};

/** Memvalidasi pre_checkout_query Telegram terhadap pesanan yang
 *  tersimpan: currency harus XTR, payload harus terurai, pesanan
 *  harus ada dan masih pending, pemilik pesanan harus sama dengan
 *  pembayar, dan jumlah harus sama persis dengan Stars paketnya.
 *  Mengembalikan ok:false dengan pesan singkat bila ada yang tidak
 *  cocok — Telegram menampilkan pesan itu di lembar bayar, jadi
 *  pesannya harus pendek. */
export async function validateStarsPreCheckout(
  db: Db,
  query: StarsPreCheckoutQuery,
  lang: Lang,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const S = serverStrings(lang);
  const invalid = {
    ok: false as const,
    errorMessage: S.starsPrecheckoutInvalid,
  };
  if (query.currency !== "XTR") return invalid;
  const payload = parseInvoicePayload(query.invoice_payload);
  if (!payload) return invalid;
  const rows = await db
    .select()
    .from(schema.premiumOrders)
    .where(eq(schema.premiumOrders.id, payload.orderId))
    .limit(1);
  const order = rows[0];
  if (!order || order.status !== "pending") return invalid;
  if (order.playerId !== payload.playerId) return invalid;
  if (order.tier !== payload.tier) return invalid;
  if (order.stars !== query.total_amount) return invalid;
  const owner = await loadPlayerRowOrNull(db, order.playerId);
  if (!owner || owner.telegramId !== query.from.id) return invalid;
  return { ok: true };
}

export type StarsSuccessfulPayment = {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
};

/** Menerapkan successful_payment Telegram: idempotent — hanya
 *  pesanan yang masih pending yang diaktifkan (update ganda dari
 *  Telegram retry menemukan pesanan sudah paid dan tidak melakukan
 *  apa-apa). Klaim atomik dulu (pending → paid, bukti bayar +
 *  jumlah tersimpan), lalu aktifkan Premium dengan aturan yang sama
 *  seperti confirmPremiumOrder. Kegagalan apa pun (termasuk kolom
 *  charge belum ada karena migrasi 0006 belum dijalankan) membiarkan
 *  pesanan tetap pending untuk konfirmasi manual di Kendali — masalah
 *  webhook tidak pernah menghilangkan pesanan yang sudah dibayar. */
export async function applyStarsPayment(
  db: Db,
  payment: StarsSuccessfulPayment,
  fromTelegramId: number,
  lang: Lang,
): Promise<{ applied: boolean }> {
  try {
    if (payment.currency !== "XTR") return { applied: false };
    const payload = parseInvoicePayload(payment.invoice_payload);
    if (!payload) return { applied: false };
    const rows = await db
      .select()
      .from(schema.premiumOrders)
      .where(eq(schema.premiumOrders.id, payload.orderId))
      .limit(1);
    const order = rows[0];
    if (!order || order.status !== "pending") return { applied: false };
    if (order.playerId !== payload.playerId || order.tier !== payload.tier)
      return { applied: false };
    if (order.stars !== payment.total_amount) return { applied: false };
    const target = await loadPlayerRowOrNull(db, order.playerId);
    if (!target || target.telegramId !== fromTelegramId)
      return { applied: false };
    // Klaim atomik: hanya baris yang masih pending yang berubah —
    // pengiriman ganda (Telegram retry) tidak bisa membayar dua kali.
    const claimed = await db
      .update(schema.premiumOrders)
      .set({
        status: "paid",
        processedAt: new Date(),
        telegramPaymentChargeId: payment.telegram_payment_charge_id,
        totalAmount: payment.total_amount,
      })
      .where(
        and(
          eq(schema.premiumOrders.id, order.id),
          eq(schema.premiumOrders.status, "pending"),
        ),
      )
      .returning({ id: schema.premiumOrders.id });
    if (!claimed[0]) return { applied: false };
    await activatePremiumOrder(db, order, target, lang);
    return { applied: true };
  } catch {
    // Gagal apa pun → pesanan tetap pending; admin bisa mengonfirmasi
    // manual dari Kendali. Webhook tidak pernah merusak apa pun.
    return { applied: false };
  }
}

// ---------------------------------------------------------------------------
// Shared response shapes
// ---------------------------------------------------------------------------

const wdShape = z.object({
  id: z.number(),
  walletAddress: z.string(),
  amountKt: z.number(),
  amountUsdt: z.number(),
  status: z.enum(["pending", "approved", "paid", "rejected", "cancelled"]),
  adminNote: z.string().nullable(),
  txRef: z.string().nullable(),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
  // Anti-cheat: true bila pemilik WD sedang berisiko (risk_score > 0)
  // — dihitung server dari flag TERKINI pemiliknya, bukan dari data
  // saat WD dibuat, supaya flag yang menyala belakangan (atau sudah
  // dibersihkan) langsung tercermin di antrean Kendali.
  needsReview: z.boolean(),
});

type WdRow = typeof schema.wdRequests.$inferSelect;
function toWd(row: WdRow, needsReview: boolean): z.infer<typeof wdShape> {
  return {
    id: row.id,
    walletAddress: row.walletAddress,
    amountKt: row.amountKt,
    amountUsdt: row.amountUsdt,
    status: row.status,
    adminNote: row.adminNote,
    txRef: row.txRef,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt ? row.processedAt.toISOString() : null,
    needsReview,
  };
}

const resultShape = z.object({
  ok: z.boolean(),
  error: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Typed action wrapper (replaces the Muse SDK's defineAction):
 *  keeps the handler's `args` typed as z.infer of its request schema
 *  and preserves the handler's exact response type, so the client can
 *  derive fully typed calls from `typeof gameActions`. The `response`
 *  schema is documentation only in this deployment (responses are
 *  plain objects, not re-validated at runtime). */
function defineGameAction<Req extends z.ZodTypeAny, Res>(def: {
  description: string;
  request: Req;
  response: z.ZodTypeAny;
  handler: (args: z.infer<Req>, session: Session) => Promise<Res>;
}): {
  description: string;
  request: Req;
  response: z.ZodTypeAny;
  handler: (args: z.infer<Req>, session: Session) => Promise<Res>;
} {
  return def;
}

export const gameActions = {
  getGameState: defineGameAction({
    description:
      "Returns the full game state: player balances and energy, the two-tier WD minimum computed server-side from the paid-WD history (first WD 100 KT, repeat WDs 5.000 KT flat) and the per-WD maximum of 5.000 KT (5 USDT) — there is NO time limit between WDs; how fast a player can WD depends only on how fast they accumulate KT — premium pass status (tier, dual-drill flag, Telegram Stars plans) and Stars purchase orders, the five mining maps with unlock state, per-map distance, scan duration and challenge profiles, per-map gemstone loot, the asteroid currently being explored (identity, map, scan status, mineral veins), any timed scan/mining job in progress with its remaining seconds (finished jobs also reveal map challenge outcomes: drill jam / hull hit), ore inventory with live sell prices, upgrade levels and costs, recent withdrawals, the sponsored-ad reward state (reward per view, daily cap, views used today, remaining views and cooldown seconds — all computed server-side), and the activity log split into mission and economy categories.",
    request: z.object({}),
    response: z.object({
      player: z.object({
        ktBalance: z.number(),
        usdtEquivalent: z.number(),
        energy: z.number(),
        maxEnergy: z.number(),
        regenSeconds: z.number(),
        layer: z.number(),
        // Progres sektor: ekspedisi selesai di sektor ini + syarat
        // naiknya (L ekspedisi untuk naik dari sektor L).
        sectorProgress: z.object({
          current: z.number(),
          needed: z.number(),
        }),
        depthMeters: z.number(),
        zoneName: z.string(),
        zoneDesc: z.string(),
        currentZone: z.number(),
        premium: z.object({
          active: z.boolean(),
          tier: z.enum(["standard", "pro"]).nullable(),
          dualDrill: z.boolean(),
          until: z.string().nullable(),
          /** Alamat dompet GRAM pemilik (publik) — tujuan
           *  pembayaran TON Connect; klien tidak pernah
           *  meng-hardcode alamat ini. */
          gramReceiverAddress: z.string(),
          plans: z.array(
            z.object({
              id: z.string(),
              label: z.string(),
              days: z.number(),
              stars: z.number(),
              /** Harga paket dalam GRAM + nanoTON (jumlah
               *  transaksi TON Connect). */
              gram: z.number(),
              gramNanoTon: z.number(),
              tier: z.enum(["standard", "pro"]),
            }),
          ),
        }),
        totalDigs: z.number(),
        totalScans: z.number(),
        asteroidsDone: z.number(),
        totalKtEarned: z.number(),
        totalWdPaidUsdt: z.number(),
        canClaimDailyBonus: z.boolean(),
        dailyBonusKt: z.number(),
        ktPerUsdt: z.number(),
        wdPaidCount: z.number(),
        wdMinKt: z.number(),
        wdMinUsdt: z.number(),
        wdNextMinKt: z.number(),
        wdStepKt: z.number(),
        // WD maximum (anti-bangkrut): maksimum 5.000 KT (5 USDT)
        // per WD. TIDAK ADA jeda waktu antar-WD — cooldown
        // dihapus 2026-11-19 atas perintah pemilik; kecepatan WD
        // hanya dibatasi kecepatan akumulasi KT.
        wdMaxKt: z.number(),
        wdMaxUsdt: z.number(),
        isAdmin: z.boolean(),
        ads: z.object({
          rewardKt: z.number(),
          dailyCap: z.number(),
          watchedToday: z.number(),
          remainingToday: z.number(),
          canWatch: z.boolean(),
          cooldownSeconds: z.number(),
          cooldownRemainingSec: z.number(),
        }),
        // Referral: statistik pengundang untuk tab Komunitas — berapa
        // teman yang bergabung lewat link-nya, berapa yang sudah
        // memberi hadiah, dan total KT yang sudah diterima.
        referrals: z.object({
          invited: z.number(),
          rewarded: z.number(),
          earnedKt: z.number(),
        }),
      }),
      maps: z.array(
        z.object({
          index: z.number(),
          name: z.string(),
          tagline: z.string(),
          desc: z.string(),
          minLayer: z.number(),
          image: z.string(),
          unlocked: z.boolean(),
          isCurrent: z.boolean(),
          travelCost: z.number(),
          distanceLabel: z.string(),
          scanSeconds: z.number(),
          jamChancePct: z.number(),
          damageChancePct: z.number(),
          damageFeeKt: z.number(),
          radiation: z.number(),
          timeFactor: z.number(),
          gems: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              price: z.number(),
              color: z.string(),
              icon: z.string(),
            }),
          ),
        }),
      ),
      expedition: z.object({
        name: z.string(),
        klass: z.string(),
        diameterKm: z.number(),
        zoneIndex: z.number(),
        zoneName: z.string(),
        scanned: z.boolean(),
        anomalyText: z.string().nullable(),
        veinCount: z.number(),
        minedCount: z.number(),
        allMined: z.boolean(),
        completionBonusKt: z.number(),
        scanEnergyCost: z.number(),
        scanDurationSec: z.number(),
        abandonEnergyCost: z.number(),
        veins: z.array(
          z.object({
            index: z.number(),
            oreId: z.string(),
            name: z.string(),
            color: z.string(),
            icon: z.string(),
            qty: z.number(),
            richness: z.number(),
            hardness: z.number(),
            mined: z.boolean(),
            durationSec: z.number(),
            energyCost: z.number(),
          }),
        ),
      }),
      job: z
        .object({
          kind: z.enum(["scan", "mine"]),
          veinIndex: z.number().nullable(),
          oreName: z.string().nullable(),
          startedAt: z.string(),
          endsAt: z.string(),
          durationSec: z.number(),
          remainingSec: z.number(),
          ready: z.boolean(),
          jammed: z.boolean(),
          hullHit: z.boolean(),
        })
        .nullable(),
      ores: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          basePrice: z.number(),
          sellPrice: z.number(),
          color: z.string(),
          icon: z.string(),
          qty: z.number(),
        }),
      ),
      upgrades: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          desc: z.string(),
          level: z.number(),
          maxLevel: z.number(),
          nextCost: z.number().nullable(),
        }),
      ),
      withdrawals: z.array(wdShape),
      premiumOrders: z.array(
        z.object({
          id: z.number(),
          plan: z.string(),
          stars: z.number(),
          days: z.number(),
          tier: z.enum(["standard", "pro"]),
          /** Cara bayar: "stars" (invoice XTR) atau "gram"
           *  (TON Connect). gramAmount = GRAM yang dibayar
           *  (null untuk Stars); txHash = hash transaksi TON
           *  (null sampai pembayaran GRAM terverifikasi). */
          method: z.enum(["stars", "gram"]),
          gramAmount: z.number().nullable(),
          txHash: z.string().nullable(),
          status: z.enum(["pending", "confirmed", "rejected", "paid"]),
          createdAt: z.string(),
          processedAt: z.string().nullable(),
        }),
      ),
      activity: z.array(
        z.object({
          id: z.number(),
          kind: z.string(),
          category: z.enum(["mission", "economy"]),
          message: z.string(),
          amountKt: z.number().nullable(),
          createdAt: z.string(),
        }),
      ),
      // Ringkasan Kendali untuk admin (null untuk pemain biasa):
      // total USDT yang sudah dibayar ke semua pemain.
      adminStats: z
        .object({ totalWdPaidUsdt: z.number() })
        .nullable(),
      // Anti-cheat: daftar pemain mencurigakan untuk Kendali (null
      // untuk pemain biasa) — telegram id, username, skor risiko,
      // alasan, kapan di-flag, saldo KT, jumlah WD terbayar.
      flaggedPlayers: z
        .array(
          z.object({
            playerId: z.number(),
            telegramId: z.number().nullable(),
            username: z.string().nullable(),
            riskScore: z.number(),
            flagReason: z.string().nullable(),
            flaggedAt: z.string().nullable(),
            ktBalance: z.number(),
            paidWdCount: z.number(),
          }),
        )
        .nullable(),
    }),
    async handler(_args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      // Referral: atribusi hanya saat getGameState PERTAMA yang
      // membuat baris pemain baru — pemain lama yang membuka lagi
      // dengan start_param tidak pernah diatribusikan ulang (dan
      // UNIQUE di referrals membuat atribusi ganda mustahil).
      let isNewPlayer = false;
      if (session.telegramId !== null) {
        const existing = await db
          .select({ id: schema.player.id })
          .from(schema.player)
          .where(eq(schema.player.telegramId, session.telegramId))
          .limit(1);
        isNewPlayer = existing.length === 0;
      }
      const p = await loadPlayer(db, session);
      if (
        isNewPlayer &&
        session.telegramId !== null &&
        session.startParam
      ) {
        await recordReferralAttribution(
          db,
          p.id,
          session.telegramId,
          session.startParam,
        );
      }
      const levels = await loadLevels(db, p.id);
      const premium = isPremium(p);
      const exp = parseExpedition(p.expedition) ?? generateExpedition(p.currentZone, levels);
      const job = parseJob(p.job);
      const invRows = await db
        .select()
        .from(schema.inventory)
        .where(eq(schema.inventory.playerId, p.id));
      const invMap = new Map(invRows.map((r) => [r.oreId, r.qty]));
      const mult = sellMultiplier(levels, premium);
      const zoneIdx = expeditionZone(exp, p.currentZone);
      const zone = mapByIndex(zoneIdx);
      // Kendali (admin) melihat antrean WD semua pemain; pemain
      // biasa hanya melihat WD-nya sendiri.
      const wdRows = await db
        .select()
        .from(schema.wdRequests)
        .where(
          session.isAdmin
            ? undefined
            : eq(schema.wdRequests.playerId, p.id),
        )
        .orderBy(desc(schema.wdRequests.id))
        .limit(30);
      // Sama seperti WD: admin melihat pesanan Premium semua
      // pemain, pemain biasa hanya pesanannya sendiri.
      const orderRows = await db
        .select()
        .from(schema.premiumOrders)
        .where(
          session.isAdmin
            ? undefined
            : eq(schema.premiumOrders.playerId, p.id),
        )
        .orderBy(desc(schema.premiumOrders.id))
        .limit(20);
      const actRows = await db
        .select()
        .from(schema.activity)
        .where(eq(schema.activity.playerId, p.id))
        .orderBy(desc(schema.activity.id))
        .limit(30);
      const wdPaidCount = await countPaidWithdrawals(db, p.id);
      const wdMinKt = wdMinKtForPaidCount(wdPaidCount);
      const adStats = await getAdStats(db, p.id);
      // Anti-cheat: skor risiko pemilik tiap WD di antrean — WD
      // pemilik yang sedang berisiko ditandai needsReview.
      const riskByOwner = new Map<number, number>();
      if (wdRows.length > 0) {
        const ownerIds = [...new Set(wdRows.map((w) => w.playerId))];
        const riskRows = await db
          .select({ id: schema.player.id, risk: schema.player.riskScore })
          .from(schema.player)
          .where(inArray(schema.player.id, ownerIds));
        for (const r of riskRows) riskByOwner.set(r.id, r.risk);
      }
      // Anti-cheat: daftar pemain mencurigakan — hanya untuk admin.
      const flaggedPlayers = session.isAdmin
        ? await listFlaggedPlayers(db)
        : null;
      // Kendali: total USDT yang sudah dibayar ke SEMUA pemain (hanya
      // untuk admin; pemain biasa mendapat null).
      const adminStats = session.isAdmin
        ? {
            totalWdPaidUsdt: Number(
              (
                await db
                  .select({
                    total: sql<number>`coalesce(sum(${schema.player.totalWdPaidUsdt}), 0)`,
                  })
                  .from(schema.player)
              )[0]?.total ?? 0,
            ),
          }
        : null;
      const now = Date.now();
      const remainingSec = job ? Math.max(0, Math.ceil((job.endsAt - now) / 1000)) : 0;
      return {
        player: {
          ktBalance: p.ktBalance,
          usdtEquivalent: p.ktBalance / KT_PER_USDT,
          energy: p.energy,
          maxEnergy: maxEnergy(levels),
          regenSeconds: regenSeconds(levels, premium),
          layer: p.layer,
          sectorProgress: {
            current: p.sectorProgress,
            needed: expeditionsToAdvance(p.layer),
          },
          depthMeters: p.layer * 12500,
          zoneName: mapName(zone, lang),
          zoneDesc: mapDesc(zone, lang),
          currentZone: p.currentZone,
          premium: {
            active: premium,
            tier: premiumTierOf(p),
            dualDrill: hasDualDrill(p),
            until: p.premiumUntil ? p.premiumUntil.toISOString() : null,
            gramReceiverAddress: GRAM_RECEIVER_ADDRESS,
            plans: (Object.keys(PREMIUM_PLANS) as PremiumPlanId[]).map((id) => ({
              id,
              label: premiumPlanLabel(PREMIUM_PLANS[id], lang),
              days: PREMIUM_PLANS[id].days,
              stars: PREMIUM_PLANS[id].stars,
              gram: PREMIUM_PLANS[id].gram,
              gramNanoTon: PREMIUM_PLANS[id].gramNanoTon,
              tier: PREMIUM_PLANS[id].tier,
            })),
          },
          totalDigs: p.totalDigs,
          totalScans: p.totalScans,
          asteroidsDone: p.asteroidsDone,
          totalKtEarned: p.totalKtEarned,
          totalWdPaidUsdt: p.totalWdPaidUsdt,
          canClaimDailyBonus: await canClaimDailyBonus(db, p.id),
          dailyBonusKt: DAILY_BONUS_KT,
          ktPerUsdt: KT_PER_USDT,
          wdPaidCount,
          wdMinKt,
          wdMinUsdt: wdMinKt / KT_PER_USDT,
          wdNextMinKt: wdMinKtForPaidCount(wdPaidCount + 1),
          wdStepKt: WD_STEP_KT,
          wdMaxKt: WD_MAX_KT,
          wdMaxUsdt: WD_MAX_KT / KT_PER_USDT,
          isAdmin: session.isAdmin,
          ads: {
            rewardKt: AD_REWARD_KT,
            dailyCap: AD_DAILY_CAP,
            watchedToday: adStats.watchedToday,
            remainingToday: adStats.remainingToday,
            canWatch: adStats.canWatch,
            cooldownSeconds: AD_COOLDOWN_SECONDS,
            cooldownRemainingSec: adStats.cooldownRemainingSec,
          },
          referrals: await getReferralStats(db, p.id),
        },
        maps: MAPS.map((m, i) => ({
          index: i,
          name: mapName(m, lang),
          tagline: mapTagline(m, lang),
          desc: mapDesc(m, lang),
          minLayer: m.minLayer,
          image: m.image,
          unlocked: p.layer >= m.minLayer,
          isCurrent: p.currentZone === i,
          travelCost: travelCostFor(i, premium),
          distanceLabel: mapDistanceLabel(m, lang),
          scanSeconds: scanDurationForZone(i, levels, premium),
          jamChancePct: Math.round(m.jamChance * 100),
          damageChancePct: Math.round(m.damageChance * 100),
          damageFeeKt: m.damageFeeKt,
          radiation: m.radiation,
          timeFactor: m.timeFactor,
          gems: ORES.filter((o) => (o.weights[i] ?? 0) > 0).map((o) => ({
            id: o.id,
            name: oreName(o, lang),
            price: roundKt(o.price * mult),
            color: o.color,
            icon: o.icon,
          })),
        })),
        expedition: {
          name: localizeExpeditionName(exp.name, lang),
          klass: localizeKlass(exp.klass, zoneIdx, lang),
          diameterKm: exp.diameterKm,
          zoneIndex: zoneIdx,
          zoneName: mapName(zone, lang),
          scanned: exp.scanned,
          anomalyText: exp.scanned ? localizeAnomaly(exp.anomalyText, lang) : null,
          veinCount: exp.veins.length,
          minedCount: exp.veins.filter((v) => v.mined).length,
          allMined: exp.veins.length > 0 && exp.veins.every((v) => v.mined),
          completionBonusKt: completionBonusKt(p.layer),
          scanEnergyCost: scanEnergyCost(exp),
          scanDurationSec: scanDurationSec(exp, levels, premium),
          abandonEnergyCost: ABANDON_ENERGY_COST,
          veins: exp.scanned
            ? exp.veins.map((v, i) => {
                const ore = oreById(v.oreId);
                return {
                  index: i,
                  oreId: v.oreId,
                  name: ore ? oreName(ore, lang) : v.oreId,
                  color: ore?.color ?? "#999",
                  icon: ore?.icon ?? v.oreId,
                  qty: v.qty,
                  richness: v.richness,
                  hardness: ore?.hardness ?? 1,
                  mined: v.mined,
                  durationSec: mineDurationSec(v, exp, levels, premium, hasDualDrill(p)),
                  energyCost: mineEnergyCost(v, exp),
                };
              })
            : [],
        },
        job: job
          ? {
              kind: job.kind,
              veinIndex: job.veinIndex,
              oreName: job.oreId ? oreNameById(job.oreId, lang) : null,
              startedAt: new Date(job.startedAt).toISOString(),
              endsAt: new Date(job.endsAt).toISOString(),
              durationSec: job.durationSec,
              remainingSec,
              ready: remainingSec <= 0,
              jammed: remainingSec <= 0 && job.jammed === true,
              hullHit: remainingSec <= 0 && job.hullHit === true,
            }
          : null,
        ores: ORES.map((o) => ({
          id: o.id,
          name: oreName(o, lang),
          basePrice: o.price,
          sellPrice: roundKt(o.price * mult),
          color: o.color,
          icon: o.icon,
          qty: invMap.get(o.id) ?? 0,
        })),
        upgrades: UPGRADES.map((u) => {
          const level = levels[u.id] ?? 0;
          return {
            id: u.id,
            name: upgradeName(u, lang),
            desc: upgradeDesc(u, lang),
            level,
            maxLevel: u.maxLevel,
            nextCost: level >= u.maxLevel ? null : upgradeCost(u, level),
          };
        }),
        withdrawals: wdRows.map((w) => toWd(w, (riskByOwner.get(w.playerId) ?? 0) > 0)),
        premiumOrders: orderRows.map((o) => ({
          id: o.id,
          plan: o.plan,
          stars: o.stars,
          days: o.days,
          tier: o.tier,
          method: o.method,
          gramAmount: o.gramAmount,
          txHash: o.txHash,
          status: o.status,
          createdAt: o.createdAt.toISOString(),
          processedAt: o.processedAt ? o.processedAt.toISOString() : null,
        })),
        activity: actRows.map((a) => ({
          id: a.id,
          kind: a.kind,
          category: activityCategory(a.kind),
          message: a.message,
          amountKt: a.amountKt,
          createdAt: a.createdAt.toISOString(),
        })),
        adminStats,
        flaggedPlayers,
      };
    },
  }),

  startScan: defineGameAction({
    description:
      "Starts a timed spectrometer scan of the current asteroid (costs energy, takes real seconds server-side). When the scan job finishes, collectJob reveals the asteroid's mineral veins.",
    request: z.object({}),
    response: resultShape.extend({
      durationSec: z.number(),
      energy: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const levels = await loadLevels(db, p.id);
      const fail = (error: string) => ({ ok: false, error, durationSec: 0, energy: p.energy });
      const exp = parseExpedition(p.expedition);
      if (!exp) return fail(S.errInvalidAsteroid);
      if (parseJob(p.job)) {
        // Anti-cheat (aturan d): operasi kedua saat timer operasi
        // pertama masih berjalan — sudah ditolak, polanya dicatat.
        await recordTamperAttempt(db, p, S.tamperScan, lang);
        return fail(S.errJobRunning);
      }
      if (exp.scanned) return fail(S.errAlreadyScanned);
      const cost = scanEnergyCost(exp);
      if (p.energy < cost)
        return fail(S.errEnergyScan(cost, p.energy));
      const durationSec = scanDurationSec(exp, levels, isPremium(p));
      const now = Date.now();
      const job: Job = {
        kind: "scan",
        veinIndex: null,
        oreId: null,
        startedAt: now,
        endsAt: now + durationSec * 1000,
        durationSec,
      };
      const spend = energyAfterSpend(p, levels, cost);
      await db
        .update(schema.player)
        .set({ ...spend, job: JSON.stringify(job) })
        .where(eq(schema.player.id, p.id));
      return { ok: true, error: null, durationSec, energy: spend.energy };
    },
  }),

  startMine: defineGameAction({
    description:
      "Starts a timed drilling operation on one scanned mineral vein of the current asteroid. Duration depends on the mineral's hardness, vein size, asteroid anomalies and the Laser Drill upgrade; the job is stored server-side and finishes in real time even while the page is closed.",
    request: z.object({ veinIndex: z.number().int().min(0).max(50) }),
    response: resultShape.extend({
      durationSec: z.number(),
      energy: z.number(),
      oreName: z.string().nullable(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const levels = await loadLevels(db, p.id);
      const fail = (error: string) => ({ ok: false, error, durationSec: 0, energy: p.energy, oreName: null as string | null });
      const exp = parseExpedition(p.expedition);
      if (!exp) return fail(S.errInvalidAsteroid);
      if (parseJob(p.job)) {
        // Anti-cheat (aturan d): operasi kedua saat timer operasi
        // pertama masih berjalan — sudah ditolak, polanya dicatat.
        await recordTamperAttempt(db, p, S.tamperMine, lang);
        return fail(S.errJobRunning);
      }
      if (!exp.scanned) return fail(S.errScanFirst);
      const vein = exp.veins[args.veinIndex];
      if (!vein) return fail(S.errVeinNotFound);
      if (vein.mined) return fail(S.errVeinMined);
      const cost = mineEnergyCost(vein, exp);
      if (p.energy < cost)
        return fail(S.errEnergyMine(cost, p.energy));
      const durationSec = mineDurationSec(vein, exp, levels, isPremium(p), hasDualDrill(p));
      const now = Date.now();
      // Map challenge rolls happen now, server-side, and stay hidden
      // until the job is collected.
      const map = mapByIndex(expeditionZone(exp, p.currentZone));
      const job: Job = {
        kind: "mine",
        veinIndex: args.veinIndex,
        oreId: vein.oreId,
        startedAt: now,
        endsAt: now + durationSec * 1000,
        durationSec,
        jammed: Math.random() < map.jamChance,
        hullHit: Math.random() < map.damageChance,
      };
      const spend = energyAfterSpend(p, levels, cost);
      await db
        .update(schema.player)
        .set({ ...spend, job: JSON.stringify(job) })
        .where(eq(schema.player.id, p.id));
      return { ok: true, error: null, durationSec, energy: spend.energy, oreName: oreNameById(vein.oreId, lang) };
    },
  }),

  collectJob: defineGameAction({
    description:
      "Collects a finished timed job: a completed scan reveals the current asteroid's veins; a completed mining job delivers the vein's ore to cargo (rich veins yield a bonus unit, the Cargo Drone upgrade can double the haul). Fails while the job's time has not elapsed yet.",
    request: z.object({}),
    response: resultShape.extend({
      kind: z.enum(["scan", "mine"]).nullable(),
      oreId: z.string().nullable(),
      oreName: z.string().nullable(),
      qty: z.number(),
      isRare: z.boolean(),
      allMined: z.boolean(),
      jammed: z.boolean(),
      hullHit: z.boolean(),
      repairFeeKt: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const levels = await loadLevels(db, p.id);
      const fail = (error: string) => ({
        ok: false, error, kind: null as "scan" | "mine" | null, oreId: null as string | null, oreName: null as string | null, qty: 0, isRare: false, allMined: false,
        jammed: false, hullHit: false, repairFeeKt: 0,
      });
      const exp = parseExpedition(p.expedition);
      if (!exp) return fail(S.errInvalidAsteroid);
      const job = parseJob(p.job);
      if (!job) return fail("Tidak ada operasi yang bisa diambil hasilnya.");
      const remaining = Math.ceil((job.endsAt - Date.now()) / 1000);
      if (remaining > 0) {
        // Anti-cheat (aturan d): ambil hasil sebelum timer operasi
        // selesai — sudah ditolak, polanya dicatat.
        await recordTamperAttempt(db, p, S.tamperCollect, lang);
        return fail(S.errJobNotReady(remaining));
      }
      // Anti-cheat (aturan b): selisih waktu collect vs job.endsAt
      // server-side — bot mengambil hasil dengan timing metronom,
      // manusia bervariasi.
      const collectDelayMs = Date.now() - job.endsAt;

      if (job.kind === "scan") {
        exp.scanned = true;
        await db
          .update(schema.player)
          .set({ expedition: JSON.stringify(exp), job: null, totalScans: p.totalScans + 1 })
          .where(eq(schema.player.id, p.id));
        await logActivity(db, p.id, "scan", S.logScan(localizeExpeditionName(exp.name, lang), exp.veins.length), null);
        await recordCollectLatency(db, p, collectDelayMs, lang);
        return { ok: true, error: null, kind: "scan" as const, oreId: null, oreName: null, qty: 0, isRare: false, allMined: false, jammed: false, hullHit: false, repairFeeKt: 0 };
      }

      // Mining job.
      const vein = job.veinIndex != null ? exp.veins[job.veinIndex] : undefined;
      if (!vein || vein.mined || vein.oreId !== job.oreId) {
        await db.update(schema.player).set({ job: null }).where(eq(schema.player.id, p.id));
        return fail(S.errVeinGone);
      }
      const ore = oreById(vein.oreId);
      const map = mapByIndex(expeditionZone(exp, p.currentZone));

      // Tantangan peta: bor macet — mata bor patah di tengah operasi,
      // urat ini hilang dan tidak menghasilkan apa pun.
      if (job.jammed === true) {
        vein.mined = true;
        const allMinedJam = exp.veins.every((v) => v.mined);
        await db
          .update(schema.player)
          .set({ expedition: JSON.stringify(exp), job: null, totalDigs: p.totalDigs + 1 })
          .where(eq(schema.player.id, p.id));
        await logActivity(db, p.id, "jam", S.logJam(ore ? oreName(ore, lang) : vein.oreId, localizeExpeditionName(exp.name, lang)), null);
        await recordCollectLatency(db, p, collectDelayMs, lang);
        return {
          ok: true, error: null, kind: "mine" as const,
          oreId: vein.oreId, oreName: ore ? oreName(ore, lang) : null, qty: 0,
          isRare: false, allMined: allMinedJam,
          jammed: true, hullHit: false, repairFeeKt: 0,
        };
      }

      let qty = vein.qty + (vein.richness >= 85 ? 1 : 0);
      const doubled = Math.random() < 0.07 * (levels["ransel"] ?? 0);
      if (doubled) qty *= 2;
      vein.mined = true;
      const allMined = exp.veins.every((v) => v.mined);
      await db
        .update(schema.player)
        .set({ expedition: JSON.stringify(exp), job: null, totalDigs: p.totalDigs + 1 })
        .where(eq(schema.player.id, p.id));
      await db
        .insert(schema.inventory)
        .values({ playerId: p.id, oreId: vein.oreId, qty })
        .onConflictDoUpdate({
          target: [schema.inventory.playerId, schema.inventory.oreId],
          set: { qty: sql`${schema.inventory.qty} + ${qty}` },
        });
      if (ore && RARE_IDS.has(ore.id)) {
        await logActivity(db, p.id, "rare_find", S.logRare(oreName(ore, lang), qty, localizeExpeditionName(exp.name, lang)), null);
      }
      // Tantangan peta: lambung kapal terkena serpihan — hasil tambang
      // tetap didapat, tapi biaya perbaikan dipotong dari saldo KT.
      let repairFeeKt = 0;
      if (job.hullHit === true && map.damageFeeKt > 0) {
        repairFeeKt = Math.min(map.damageFeeKt, p.ktBalance);
        if (repairFeeKt > 0) {
          await db
            .update(schema.player)
            .set({ ktBalance: roundKt(p.ktBalance - repairFeeKt) })
            .where(eq(schema.player.id, p.id));
        }
        await logActivity(db, p.id, "hull_damage", S.logHull(mapName(map, lang), repairFeeKt), -repairFeeKt);
      }
      await recordCollectLatency(db, p, collectDelayMs, lang);
      return {
        ok: true,
        error: null,
        kind: "mine" as const,
        oreId: vein.oreId,
        oreName: ore ? oreName(ore, lang) : null,
        qty,
        isRare: ore ? RARE_IDS.has(ore.id) : false,
        allMined,
        jammed: false,
        hullHit: job.hullHit === true,
        repairFeeKt,
      };
    },
  }),

  cancelJob: defineGameAction({
    description:
      "Cancels the running timed scan/mining job. Spent energy is not refunded and the target vein stays unmined.",
    request: z.object({}),
    response: resultShape,
    async handler(_args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      if (!parseJob(p.job)) return { ok: false, error: S.errNoJobRunning };
      await db.update(schema.player).set({ job: null }).where(eq(schema.player.id, p.id));
      return { ok: true, error: null };
    },
  }),

  completeExpedition: defineGameAction({
    description:
      "Finishes the current asteroid once every vein has been mined: pays the completion KT bonus and warps to a freshly generated asteroid. The sector advances only when the player has completed as many expeditions in the current sector as the sector number (sector L → L+1 needs L expeditions); otherwise the sector progress counter just grows by one.",
    request: z.object({}),
    response: resultShape.extend({
      layer: z.number(),
      bonusKt: z.number(),
      ktBalance: z.number(),
      /** True bila ekspedisi ini menaikkan sektor (klien memakai
       *  ini untuk memilih pesan "Warp ke Sektor X" vs pesan
       *  progres "n/m ekspedisi menuju Sektor Y"). */
      advanced: z.boolean(),
      /** Progres sektor setelah ekspedisi ini: ekspedisi selesai
       *  di sektor ini + syarat naiknya. */
      sectorProgress: z.object({
        current: z.number(),
        needed: z.number(),
      }),
    }),
    async handler(_args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const levels = await loadLevels(db, p.id);
      const fail = (error: string) => ({
        ok: false,
        error,
        layer: p.layer,
        bonusKt: 0,
        ktBalance: p.ktBalance,
        advanced: false,
        sectorProgress: {
          current: p.sectorProgress,
          needed: expeditionsToAdvance(p.layer),
        },
      });
      const exp = parseExpedition(p.expedition);
      if (!exp) return fail(S.errInvalidAsteroid);
      if (parseJob(p.job)) return fail(S.errCompleteJobRunning);
      if (!exp.scanned || !exp.veins.every((v) => v.mined))
        return fail(S.errCompleteNotAllMined);
      const bonus = completionBonusKt(p.layer);
      const newExp = generateExpedition(p.currentZone, levels);
      const newBalance = roundKt(p.ktBalance + bonus);
      // Progres sektor: satu ekspedisi selesai menambah progres;
      // sektor hanya naik bila progres mencapai syarat sektor ini
      // (L ekspedisi untuk naik dari sektor L), lalu progres reset
      // ke 0. Bonus dan warp ke asteroid baru tidak berubah.
      const progress = p.sectorProgress + 1;
      const needed = expeditionsToAdvance(p.layer);
      const advanced = progress >= needed;
      const newLayer = advanced ? p.layer + 1 : p.layer;
      const newProgress = advanced ? 0 : progress;
      await db
        .update(schema.player)
        .set({
          layer: newLayer,
          sectorProgress: newProgress,
          expedition: JSON.stringify(newExp),
          asteroidsDone: p.asteroidsDone + 1,
          ktBalance: newBalance,
          totalKtEarned: roundKt(p.totalKtEarned + bonus),
        })
        .where(eq(schema.player.id, p.id));
      await logActivity(
        db,
        p.id,
        "expedition_bonus",
        advanced
          ? S.logExpedition(localizeExpeditionName(exp.name, lang), bonus, newLayer, localizeExpeditionName(newExp.name, lang))
          : S.logExpeditionProgress(localizeExpeditionName(exp.name, lang), bonus, newProgress, needed, newLayer + 1, localizeExpeditionName(newExp.name, lang)),
        bonus,
      );
      // Referral: ekspedisi pertama pemain yang diundang membayar
      // hadiah 10 KT ke pengundangnya (sekali saja — baris referral
      // berubah pending → rewarded; ekspedisi berikutnya tidak
      // membayar lagi). Tidak pernah merusak penyelesaian ekspedisi.
      await payReferralRewardIfPending(db, p.id, lang);
      return {
        ok: true,
        error: null,
        layer: newLayer,
        bonusKt: bonus,
        ktBalance: newBalance,
        advanced,
        sectorProgress: { current: newProgress, needed },
      };
    },
  }),

  abandonAsteroid: defineGameAction({
    description:
      "Leaves the current asteroid without completing it (costs fuel energy, no bonus, no sector advance) and warps to a freshly generated asteroid in the same sector.",
    request: z.object({}),
    response: resultShape.extend({ asteroidName: z.string().nullable() }),
    async handler(_args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const levels = await loadLevels(db, p.id);
      const fail = (error: string) => ({ ok: false, error, asteroidName: null as string | null });
      if (parseJob(p.job)) return fail(S.errAbandonJobRunning);
      if (p.energy < ABANDON_ENERGY_COST)
        return fail(S.errAbandonEnergy(ABANDON_ENERGY_COST, p.energy));
      const newExp = generateExpedition(p.currentZone, levels);
      const spend = energyAfterSpend(p, levels, ABANDON_ENERGY_COST);
      await db
        .update(schema.player)
        .set({ ...spend, expedition: JSON.stringify(newExp) })
        .where(eq(schema.player.id, p.id));
      await logActivity(db, p.id, "travel", S.logAbandon(localizeExpeditionName(newExp.name, lang)), null);
      return { ok: true, error: null, asteroidName: localizeExpeditionName(newExp.name, lang) };
    },
  }),

  travelToMap: defineGameAction({
    description:
      "Travels to another mining map (zone). The map must be unlocked by the player's sector; travel costs energy (free for Premium), abandons the current asteroid without a bonus, and generates a fresh asteroid on the target map with that map's gemstones and challenges.",
    request: z.object({ zoneIndex: z.number().int().min(0).max(20) }),
    response: resultShape.extend({
      mapName: z.string().nullable(),
      asteroidName: z.string().nullable(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const levels = await loadLevels(db, p.id);
      const fail = (error: string) => ({ ok: false, error, mapName: null as string | null, asteroidName: null as string | null });
      if (args.zoneIndex >= MAPS.length) return fail(S.errMapNotFound);
      const target = mapByIndex(args.zoneIndex);
      if (p.layer < target.minLayer)
        return fail(S.errMapLocked(target.minLayer, p.layer));
      if (args.zoneIndex === p.currentZone)
        return fail(S.errAlreadyOnMap);
      if (parseJob(p.job)) return fail(S.errTravelJobRunning);
      const premium = isPremium(p);
      const cost = travelCostFor(args.zoneIndex, premium);
      if (p.energy < cost)
        return fail(S.errTravelEnergy(cost, p.energy));
      const newExp = generateExpedition(args.zoneIndex, levels);
      const spend = cost > 0 ? energyAfterSpend(p, levels, cost) : { energy: p.energy, energyUpdatedAt: p.energyUpdatedAt };
      await db
        .update(schema.player)
        .set({ ...spend, currentZone: args.zoneIndex, expedition: JSON.stringify(newExp) })
        .where(eq(schema.player.id, p.id));
      await logActivity(db, p.id, "travel", S.logTravel(mapName(target, lang), localizeExpeditionName(newExp.name, lang)), null);
      return { ok: true, error: null, mapName: mapName(target, lang), asteroidName: localizeExpeditionName(newExp.name, lang) };
    },
  }),

  createStarsInvoice: defineGameAction({
    description:
      "Creates a REAL Telegram Stars (XTR) payment for a Premium Pass plan (Standard 300 Stars / 7 days, Pro 1000 Stars / 30 days with the dual drill). Creates the pending premium_orders row (one pending order per player), then asks the Bot API for an invoice link (currency XTR, empty provider_token) that the client opens with Telegram.WebApp.openInvoice. The pass activates automatically when Telegram posts the successful payment to /api/telegram-webhook. If the player is not inside Telegram (web/legacy), the invoice cannot be opened — the action fails with a note to open the game via the Mini App.",
    request: z.object({ plan: z.enum(["standard", "pro"]) }),
    response: resultShape.extend({
      orderId: z.number().nullable(),
      invoiceUrl: z.string().nullable(),
      stars: z.number(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const plan = PREMIUM_PLANS[args.plan];
      const fail = (error: string) => ({ ok: false, error, orderId: null as number | null, invoiceUrl: null as string | null, stars: plan.stars });
      // Stars hanya bisa dibayar dari dalam Telegram (lembar invoice
      // Telegram). Pemain web tidak punya Telegram.WebApp.
      if (session.telegramId === null) {
        return fail(S.errStarsNeedTelegram);
      }
      // Creates the player row (and applies regen) if this is the
      // first ever action.
      const p = await loadPlayer(db, session);
      const pending = await db
        .select()
        .from(schema.premiumOrders)
        .where(
          and(
            eq(schema.premiumOrders.status, "pending"),
            eq(schema.premiumOrders.playerId, p.id),
          ),
        )
        .limit(1);
      if (pending[0])
        return fail(S.errPremiumOrderPending);
      const inserted = await db
        .insert(schema.premiumOrders)
        .values({ playerId: p.id, plan: args.plan, stars: plan.stars, days: plan.days, tier: plan.tier, status: "pending" })
        .returning({ id: schema.premiumOrders.id });
      const row = inserted[0];
      if (!row) return fail(S.errPremiumOrderCreateFail);
      const invoice = await createInvoiceLink({
        title: premiumPlanLabel(plan, lang),
        description: `${premiumPlanLabel(plan, lang)} · ASTRA MINING`,
        payload: buildInvoicePayload(row.id, p.id, plan.tier),
        prices: [{ label: premiumPlanLabel(plan, lang), amount: plan.stars }],
      });
      if (invoice.ok === false) {
        // Invoice gagal dibuat — hapus pesanan pending yang baru
        // dibuat supaya pemain bisa langsung mencoba lagi (satu
        // pending saja). Tanpa token / body mentah API di error.
        await db
          .delete(schema.premiumOrders)
          .where(eq(schema.premiumOrders.id, row.id))
          .catch(() => undefined);
        return fail(S.errStarsInvoiceFail);
      }
      await logActivity(db, p.id, "premium_order", S.logPremiumOrder(premiumPlanLabel(plan, lang), plan.stars), null);
      return { ok: true, error: null, orderId: row.id, invoiceUrl: invoice.invoiceUrl, stars: plan.stars };
    },
  }),

  createGramOrder: defineGameAction({
    description:
      "Creates a GRAM (TON) Premium Pass order for TON Connect payment (Standard 4 GRAM / 7 days, Pro 13 GRAM / 30 days with the dual drill). Creates the pending premium_orders row (one pending order per player, method 'gram'), and returns the owner's public receiving wallet + the amount in nanoTON — the client opens the player's TON wallet (TON Connect) and sends ONE transaction to that address. The pass activates when the client reports the wallet's BOC and the server verifies the transaction on-chain (confirmGramPayment). If the player is not inside Telegram (web/legacy), the wallet cannot be opened — the action fails with a note to open the game via the Mini App.",
    request: z.object({ plan: z.enum(["standard", "pro"]) }),
    response: resultShape.extend({
      orderId: z.number().nullable(),
      receiverAddress: z.string().nullable(),
      amountNanoTon: z.string().nullable(),
      gram: z.number(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const plan = PREMIUM_PLANS[args.plan];
      const fail = (error: string) => ({ ok: false, error, orderId: null as number | null, receiverAddress: null as string | null, amountNanoTon: null as string | null, gram: plan.gram });
      // GRAM hanya bisa dibayar dari dalam Telegram (dompet TON
      // dibuka lewat TON Connect di Mini App). Pemain web tidak
      // punya dompet yang terhubung.
      if (session.telegramId === null) {
        return fail(S.errGramNeedTelegram);
      }
      // Creates the player row (and applies regen) if this is the
      // first ever action.
      const p = await loadPlayer(db, session);
      const pending = await db
        .select()
        .from(schema.premiumOrders)
        .where(
          and(
            eq(schema.premiumOrders.status, "pending"),
            eq(schema.premiumOrders.playerId, p.id),
          ),
        )
        .limit(1);
      if (pending[0])
        return fail(S.errPremiumOrderPending);
      const inserted = await db
        .insert(schema.premiumOrders)
        .values({ playerId: p.id, plan: args.plan, stars: 0, days: plan.days, tier: plan.tier, status: "pending", method: "gram", gramAmount: plan.gram })
        .returning({ id: schema.premiumOrders.id });
      const row = inserted[0];
      if (!row) return fail(S.errGramOrderFail);
      await logActivity(db, p.id, "premium_order", S.logPremiumOrderGram(premiumPlanLabel(plan, lang), plan.gram), null);
      return { ok: true, error: null, orderId: row.id, receiverAddress: GRAM_RECEIVER_ADDRESS, amountNanoTon: String(plan.gramNanoTon), gram: plan.gram };
    },
  }),

  confirmGramPayment: defineGameAction({
    description:
      "Confirms a GRAM (TON) Premium payment after the player's wallet approved the transaction (TON Connect sendTransaction returned a BOC). The client sends the message hash derived from that BOC plus its connected wallet address; the server looks the transaction up on-chain via tonapi (api/_lib/ton.ts) and checks destination = owner's wallet, sender = connected wallet, amount >= plan price, and the tx hash never used before. On success the order is claimed atomically (pending→paid) and Premium activates with the same extension rule as Stars. If the tx is not indexed yet the call fails with retryable=true so the client retries for a few seconds; wrong recipient/amount/sender or a reused tx hash fail permanently (retryable=false).",
    request: z.object({
      orderId: z.number().int().positive(),
      msgHash: z.string().regex(/^[0-9a-fA-F]{64}$/),
      senderAddress: z.string().min(1),
    }),
    response: resultShape.extend({
      premiumUntil: z.string().nullable(),
      retryable: z.boolean(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const fail = (error: string, retryable: boolean) => ({ ok: false, error, premiumUntil: null as string | null, retryable });
      const p = await loadPlayer(db, session);
      const rows = await db
        .select()
        .from(schema.premiumOrders)
        .where(
          and(
            eq(schema.premiumOrders.id, args.orderId),
            eq(schema.premiumOrders.playerId, p.id),
          ),
        )
        .limit(1);
      const order = rows[0];
      if (!order) return fail(S.errPremiumOrderNotFound, false);
      if (order.status !== "pending")
        return fail(S.errOrderAlreadyProcessed, false);
      if (order.method !== "gram")
        return fail(S.errGramOrderInvalid, false);
      const plan = PREMIUM_PLANS[order.plan as PremiumPlanId];
      if (!plan || plan.tier !== order.tier)
        return fail(S.errGramOrderInvalid, false);
      // Verifikasi on-chain (tonapi, dengan retry internal ±8 detik
      // karena transaksi butuh satu blok untuk terindeks).
      const checked = await verifyGramTransaction({
        msgHash: args.msgHash,
        senderAddress: args.senderAddress,
        expectedNanoTon: String(plan.gramNanoTon),
        receiverAddress: GRAM_RECEIVER_ADDRESS,
      });
      if (checked.ok === false) {
        if (checked.reason === "not_found")
          return fail(S.errGramTxNotFound, true);
        if (checked.reason === "network" || checked.reason === "bad_response")
          return fail(S.errGramVerifyFail, true);
        if (checked.reason === "wrong_recipient")
          return fail(S.errGramTxWrongRecipient, false);
        if (checked.reason === "wrong_amount")
          return fail(S.errGramTxWrongAmount, false);
        return fail(S.errGramTxWrongSender, false);
      }
      // Hash transaksi tidak boleh dipakai dua kali — cek dulu, lalu
      // klaim atomik; UNIQUE index tx_hash adalah penjaga terakhir
      // (pelanggaran unique dipetakan ke errGramTxReused di bawah).
      const reused = await db
        .select({ id: schema.premiumOrders.id })
        .from(schema.premiumOrders)
        .where(
          and(
            eq(schema.premiumOrders.txHash, checked.txHash),
            eq(schema.premiumOrders.status, "paid"),
          ),
        )
        .limit(1);
      if (reused[0]) return fail(S.errGramTxReused, false);
      let claimed: { id: number }[];
      try {
        claimed = await db
          .update(schema.premiumOrders)
          .set({
            status: "paid",
            processedAt: new Date(),
            txHash: checked.txHash,
          })
          .where(
            and(
              eq(schema.premiumOrders.id, order.id),
              eq(schema.premiumOrders.status, "pending"),
            ),
          )
          .returning({ id: schema.premiumOrders.id });
      } catch (e) {
        // UNIQUE violation (Postgres 23505) = hash sudah dipakai
        // pesanan lain di antara cek dan klaim.
        const code = (e as { code?: unknown })?.code;
        const msg = e instanceof Error ? e.message : "";
        if (code === "23505" || /duplicate key/i.test(msg))
          return fail(S.errGramTxReused, false);
        return fail(S.errGramVerifyFail, true);
      }
      if (!claimed[0]) return fail(S.errOrderAlreadyProcessed, false);
      const target = await loadPlayerRowOrNull(db, order.playerId);
      if (!target) return fail(S.errOrderOwnerNotFound, false);
      const until = await activatePremiumOrder(db, order, target, lang);
      return { ok: true, error: null, premiumUntil: until.toISOString(), retryable: false };
    },
  }),

  cancelPremiumOrder: defineGameAction({
    description:
      "Player action: cancels the caller's own still-pending premium order (Telegram Stars OR GRAM) and DELETES the row — no payment was made, so there is nothing to keep. A cancelled (or failed) payment, or a payment sheet that never opened, must free the buy button at once with no admin work. Only the order's owner may cancel it, and only while it is still pending: a paid/confirmed/rejected order is already processed, and another player's order id never matches the ownership check. Race-safe against both payment paths: applyStarsPayment and confirmGramPayment claim pending→paid atomically, so a payment that landed first cannot be cancelled away; conversely a late successful_payment / GRAM confirmation for a deleted order finds no row and is ignored.",
    request: z.object({ orderId: z.number().int().positive() }),
    response: resultShape,
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      // Hanya pesanan milik sendiri yang bisa dibatalkan — id pesanan
      // pemain lain tidak akan ketemu di sini.
      const rows = await db
        .select()
        .from(schema.premiumOrders)
        .where(
          and(
            eq(schema.premiumOrders.id, args.orderId),
            eq(schema.premiumOrders.playerId, p.id),
          ),
        )
        .limit(1);
      const order = rows[0];
      if (!order) return { ok: false, error: S.errPremiumOrderNotFound };
      if (order.status !== "pending")
        return { ok: false, error: S.errOrderAlreadyProcessed };
      // Dihapus, bukan diubah status: tidak ada pembayaran, jadi
      // tidak ada yang perlu disimpan. successful_payment yang
      // terlambat untuk pesanan ini tidak menemukan baris dan
      // diabaikan oleh applyStarsPayment (dan confirmGramPayment).
      await db
        .delete(schema.premiumOrders)
        .where(eq(schema.premiumOrders.id, order.id));
      await logActivity(
        db,
        p.id,
        "premium_cancel",
        order.method === "gram"
          ? S.logPremiumCancelGram(order.id, order.gramAmount ?? 0)
          : S.logPremiumCancel(order.id, order.stars),
        null,
      );
      return { ok: true, error: null };
    },
  }),

  setupStarsWebhook: defineGameAction({
    description:
      "Owner action (one-time setup): registers the Telegram Stars webhook (https://mygamemining.vercel.app/api/telegram-webhook) with the Bot API so Stars payments activate Premium automatically. The webhook secret is derived server-side from BOT_TOKEN — no new env var. Triggered once from the Kendali tab after deploy.",
    request: z.object({}),
    response: resultShape,
    async handler(_args, session) {
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const ok = await setWebhook({ url: STARS_WEBHOOK_URL });
      if (!ok) return { ok: false, error: S.errStarsWebhookFail };
      return { ok: true, error: null };
    },
  }),

  confirmPremiumOrder: defineGameAction({
    description:
      "Owner action (fallback): confirms a pending premium order manually — e.g. the Stars payment went through but the webhook missed it, or a GRAM payment landed but on-chain verification failed (stuck pending order). Activates (or extends) the Premium Pass with the order's tier and days, unlocking the dual drill for the Pro tier. Normally payments activate automatically; this stays as the manual fallback.",
    request: z.object({ orderId: z.number().int().positive() }),
    response: resultShape.extend({
      premiumUntil: z.string().nullable(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const rows = await db
        .select()
        .from(schema.premiumOrders)
        .where(eq(schema.premiumOrders.id, args.orderId))
        .limit(1);
      const order = rows[0];
      if (!order) return { ok: false, error: S.errPremiumOrderNotFound, premiumUntil: null };
      if (order.status !== "pending")
        return { ok: false, error: S.errOrderAlreadyProcessed, premiumUntil: null };
      // Premium diaktifkan untuk PEMILIK pesanan, bukan untuk admin
      // yang mengonfirmasi.
      const target = await loadPlayerRowOrNull(db, order.playerId);
      if (!target) return { ok: false, error: S.errOrderOwnerNotFound, premiumUntil: null };
      await db
        .update(schema.premiumOrders)
        .set({ status: "confirmed", processedAt: new Date() })
        .where(eq(schema.premiumOrders.id, order.id));
      const until = await activatePremiumOrder(db, order, target, lang);
      return { ok: true, error: null, premiumUntil: until.toISOString() };
    },
  }),

  rejectPremiumOrder: defineGameAction({
    description:
      "Owner action: rejects a pending Telegram Stars premium order (e.g. the Stars payment never arrived). The pass is not activated; the player can create a new order afterwards.",
    request: z.object({ orderId: z.number().int().positive() }),
    response: resultShape,
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const rows = await db
        .select()
        .from(schema.premiumOrders)
        .where(eq(schema.premiumOrders.id, args.orderId))
        .limit(1);
      const order = rows[0];
      if (!order) return { ok: false, error: S.errPremiumOrderNotFound };
      if (order.status !== "pending") return { ok: false, error: S.errOrderAlreadyProcessed };
      await db
        .update(schema.premiumOrders)
        .set({ status: "rejected", processedAt: new Date() })
        .where(eq(schema.premiumOrders.id, order.id));
      await logActivity(
        db,
        order.playerId,
        "premium_reject",
        order.method === "gram"
          ? S.logPremiumRejectGram(order.id, order.gramAmount ?? 0)
          : S.logPremiumReject(order.id, order.stars),
        null,
      );
      return { ok: true, error: null };
    },
  }),

  grantPremium: defineGameAction({
    description:
      "Owner action: grants or extends a Premium Pass tier (Standard or Pro — Pro unlocks the dual drill) for free — used after the player pays the owner outside the game (Telegram Stars handled manually, transfer, e-wallet, etc.), matching the manual USDT payout model.",
    request: z.object({
      days: z.number().int().min(1).max(365),
      tier: z.enum(["standard", "pro"]),
      // Admin bisa memberi Premium ke pemain tertentu (id internal
      // pemain); tanpa ini Premium diberikan ke pemanggil sendiri
      // (dipakai asnit saat menguji dari web).
      playerId: z.number().int().positive().optional(),
    }),
    response: resultShape.extend({
      premiumUntil: z.string().nullable(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      let target: PlayerRow;
      if (args.playerId) {
        const found = await loadPlayerRowOrNull(db, args.playerId);
        if (!found) return { ok: false, error: S.errPlayerNotFound, premiumUntil: null };
        target = found;
      } else {
        target = await loadPlayer(db, session);
      }
      const base = target.premiumUntil && target.premiumUntil.getTime() > Date.now() ? target.premiumUntil.getTime() : Date.now();
      const until = new Date(base + args.days * 24 * 60 * 60 * 1000);
      const tier: PremiumTier = args.tier === "pro" || (isPremium(target) && target.premiumTier === "pro") ? "pro" : "standard";
      await db
        .update(schema.player)
        .set({ premiumUntil: until, premiumTier: tier })
        .where(eq(schema.player.id, target.id));
      await logActivity(db, target.id, "premium_grant", S.logPremiumGrant(tier === "pro" ? (lang === "en" ? "Pro (dual drill)" : "Pro (bor ganda)") : "Standard", args.days, fmtDateLang(until, lang)), null);
      return { ok: true, error: null, premiumUntil: until.toISOString() };
    },
  }),

  claimDailyBonus: defineGameAction({
    description:
      "Claims the once-per-calendar-day login bonus of 0,625 KT.",
    request: z.object({}),
    response: resultShape.extend({
      bonusKt: z.number(),
      ktBalance: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      if (!(await canClaimDailyBonus(db, p.id))) {
        return {
          ok: false,
          error: S.errDailyBonusClaimed,
          bonusKt: 0,
          ktBalance: p.ktBalance,
        };
      }
      const newBalance = roundKt(p.ktBalance + DAILY_BONUS_KT);
      await db
        .update(schema.player)
        .set({
          ktBalance: newBalance,
          totalKtEarned: roundKt(p.totalKtEarned + DAILY_BONUS_KT),
        })
        .where(eq(schema.player.id, p.id));
      await logActivity(db, p.id, "daily_bonus", S.logDailyBonus(DAILY_BONUS_KT), DAILY_BONUS_KT);
      return {
        ok: true,
        error: null,
        bonusKt: DAILY_BONUS_KT,
        ktBalance: newBalance,
      };
    },
  }),

  watchAd: defineGameAction({
    description:
      "Claims the sponsored-ad reward: credits 0,375 KT for one ad view. Fully server-validated (anti-cheat): the daily cap of 10 views per calendar day and the 60-second cooldown between views are recomputed here from the ad_reward activity history in the database — a tampered client cannot exceed the cap, skip the cooldown, or change the reward amount. This is the placeholder slot where the owner will plug in a real ad provider later; the reward logic stays identical.",
    request: z.object({}),
    response: resultShape.extend({
      rewardKt: z.number(),
      ktBalance: z.number(),
      watchedToday: z.number(),
      remainingToday: z.number(),
      cooldownRemainingSec: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const stats = await getAdStats(db, p.id);
      const fail = (error: string) => ({
        ok: false,
        error,
        rewardKt: 0,
        ktBalance: p.ktBalance,
        watchedToday: stats.watchedToday,
        remainingToday: stats.remainingToday,
        cooldownRemainingSec: stats.cooldownRemainingSec,
      });
      if (stats.remainingToday <= 0)
        return fail(S.errAdCapReached(AD_DAILY_CAP));
      if (stats.cooldownRemainingSec > 0)
        return fail(S.errAdCooldown(stats.cooldownRemainingSec, AD_COOLDOWN_SECONDS));
      const newBalance = roundKt(p.ktBalance + AD_REWARD_KT);
      await db
        .update(schema.player)
        .set({
          ktBalance: newBalance,
          totalKtEarned: roundKt(p.totalKtEarned + AD_REWARD_KT),
        })
        .where(eq(schema.player.id, p.id));
      await logActivity(db, p.id, "ad_reward", S.logAd(AD_REWARD_KT), AD_REWARD_KT);
      return {
        ok: true,
        error: null,
        rewardKt: AD_REWARD_KT,
        ktBalance: newBalance,
        watchedToday: stats.watchedToday + 1,
        remainingToday: Math.max(0, stats.remainingToday - 1),
        cooldownRemainingSec: AD_COOLDOWN_SECONDS,
      };
    },
  }),

  sellOre: defineGameAction({
    description:
      "Sells a quantity of one ore (or all of it) from inventory for KT at the current sell price including the Negotiator bonus.",
    request: z.object({
      oreId: z.string(),
      qty: z.number().int().positive().max(100000),
    }),
    response: resultShape.extend({
      ktGained: z.number(),
      ktBalance: z.number(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const levels = await loadLevels(db, p.id);
      const ore = oreById(args.oreId);
      const fail = (error: string) => ({ ok: false, error, ktGained: 0, ktBalance: p.ktBalance });
      if (!ore) return fail(S.errOreUnknown);
      const inv = await db
        .select()
        .from(schema.inventory)
        .where(
          and(
            eq(schema.inventory.playerId, p.id),
            eq(schema.inventory.oreId, args.oreId),
          ),
        )
        .limit(1);
      const held = inv[0]?.qty ?? 0;
      if (held < args.qty) return fail(S.errNotEnoughOre(held, oreName(ore, lang)));
      // Harga per unit bisa pecahan (Regolith 0,025 KT) — total penjualan
      // dibulatkan ke 3 desimal, BUKAN harga satuan (Math.round di
      // satuan akan membuat Regolith bernilai 0 KT).
      const gained = roundKt(ore.price * sellMultiplier(levels, isPremium(p)) * args.qty);
      const newBalance = roundKt(p.ktBalance + gained);
      await db
        .update(schema.inventory)
        .set({ qty: held - args.qty })
        .where(
          and(
            eq(schema.inventory.playerId, p.id),
            eq(schema.inventory.oreId, args.oreId),
          ),
        );
      await db
        .update(schema.player)
        .set({
          ktBalance: newBalance,
          totalKtEarned: roundKt(p.totalKtEarned + gained),
        })
        .where(eq(schema.player.id, p.id));
      await logActivity(db, p.id, "sell", S.logSell(args.qty, oreName(ore, lang), gained), gained);
      return { ok: true, error: null, ktGained: gained, ktBalance: newBalance };
    },
  }),

  sellAllOre: defineGameAction({
    description:
      "Sells the entire ore inventory for KT at current sell prices.",
    request: z.object({}),
    response: resultShape.extend({
      ktGained: z.number(),
      ktBalance: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const levels = await loadLevels(db, p.id);
      const invRows = await db
        .select()
        .from(schema.inventory)
        .where(eq(schema.inventory.playerId, p.id));
      const mult = sellMultiplier(levels, isPremium(p));
      let gained = 0;
      let count = 0;
      for (const row of invRows) {
        const ore = oreById(row.oreId);
        if (!ore || row.qty <= 0) continue;
        // Per-baris dibulatkan ke 3 desimal (harga bisa pecahan) —
        // total akhir dibulatkan sekali lagi di bawah.
        gained += roundKt(ore.price * mult * row.qty);
        count += row.qty;
      }
      gained = roundKt(gained);
      if (count === 0) {
        return { ok: false, error: S.errCargoEmpty, ktGained: 0, ktBalance: p.ktBalance };
      }
      for (const row of invRows) {
        if (row.qty > 0) {
          await db
            .update(schema.inventory)
            .set({ qty: 0 })
            .where(
              and(
                eq(schema.inventory.playerId, p.id),
                eq(schema.inventory.oreId, row.oreId),
              ),
            );
        }
      }
      const newBalance = roundKt(p.ktBalance + gained);
      await db
        .update(schema.player)
        .set({
          ktBalance: newBalance,
          totalKtEarned: roundKt(p.totalKtEarned + gained),
        })
        .where(eq(schema.player.id, p.id));
      await logActivity(db, p.id, "sell", S.logSellAll(count, gained), gained);
      return { ok: true, error: null, ktGained: gained, ktBalance: newBalance };
    },
  }),

  buyUpgrade: defineGameAction({
    description:
      "Buys the next level of an upgrade, paying its KT cost from the player's balance.",
    request: z.object({ upgradeId: z.string() }),
    response: resultShape.extend({
      newLevel: z.number().nullable(),
      costPaid: z.number(),
      ktBalance: z.number(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const levels = await loadLevels(db, p.id);
      const def = upgradeById(args.upgradeId);
      const fail = (error: string) => ({ ok: false, error, newLevel: null as number | null, costPaid: 0, ktBalance: p.ktBalance });
      if (!def) return fail(S.errUpgradeUnknown);
      const level = levels[def.id] ?? 0;
      if (level >= def.maxLevel) return fail(S.errUpgradeMax(upgradeName(def, lang)));
      const cost = upgradeCost(def, level);
      if (p.ktBalance < cost)
        return fail(S.errKtNotEnough(cost, p.ktBalance));
      const existing = await db
        .select()
        .from(schema.upgrades)
        .where(
          and(
            eq(schema.upgrades.playerId, p.id),
            eq(schema.upgrades.upgradeId, def.id),
          ),
        )
        .limit(1);
      if (existing[0]) {
        await db
          .update(schema.upgrades)
          .set({ level: level + 1 })
          .where(
            and(
              eq(schema.upgrades.playerId, p.id),
              eq(schema.upgrades.upgradeId, def.id),
            ),
          );
      } else {
        await db
          .insert(schema.upgrades)
          .values({ playerId: p.id, upgradeId: def.id, level: 1 });
      }
      const newBalance = roundKt(p.ktBalance - cost);
      await db
        .update(schema.player)
        .set({ ktBalance: newBalance })
        .where(eq(schema.player.id, p.id));
      await logActivity(db, p.id, "upgrade", S.logUpgrade(upgradeName(def, lang), level + 1), -cost);
      return {
        ok: true,
        error: null,
        newLevel: level + 1,
        costPaid: cost,
        ktBalance: newBalance,
      };
    },
  }),

  requestWithdrawal: defineGameAction({
    description:
      "Creates a withdrawal request: locks the KT and puts the request in the owner's manual payout queue with the player's USDT wallet address. Anti-cheat: the amount arrives in KT and is fully re-validated server-side — it must be a multiple of 100 KT (0,1 USDT steps), must meet the two-tier minimum computed here from the player's paid-WD history (first WD: 100 KT, repeat WDs: 5.000 KT flat), and must not exceed the per-WD maximum of 5.000 KT (5 USDT). There is NO time limit between WDs — the cooldown was removed 2026-11-19 on the owner's instruction; how fast a player can WD depends only on how fast they accumulate KT. The client cannot lower the minimum or raise the maximum.",
    request: z.object({
      walletAddress: z.string().trim().min(10).max(120),
      amountKt: z.number().int().min(WD_STEP_KT).max(10000000),
    }),
    response: resultShape.extend({
      wdId: z.number().nullable(),
      ktBalance: z.number(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const amountKt = args.amountKt;
      const amountUsdt = amountKt / KT_PER_USDT;
      const fail = (error: string) => ({ ok: false, error, wdId: null as number | null, ktBalance: p.ktBalance });
      if (amountKt % WD_STEP_KT !== 0)
        return fail(S.errWdStep(WD_STEP_KT, fmtNum(WD_STEP_KT / KT_PER_USDT, lang), amountKt));
      const paidCount = await countPaidWithdrawals(db, p.id);
      const minKt = wdMinKtForPaidCount(paidCount);
      if (amountKt < minKt)
        return fail(
          paidCount === 0
            ? S.errWdMinFirst(minKt, minKt / KT_PER_USDT, amountKt, minKt - amountKt)
            : S.errWdMinRepeat(paidCount, amountKt),
        );
      // Per-WD maximum: 5.000 KT (5 USDT) per WD — tanpa ini
      // pemain tinggal menabung lalu WD sekaligus besar.
      if (amountKt > WD_MAX_KT)
        return fail(
          S.errWdMax(WD_MAX_KT, amountKt),
        );
      if (p.ktBalance < amountKt)
        return fail(
          S.errWdBalance(amountUsdt, amountKt, p.ktBalance),
        );
      const inserted = await db
        .insert(schema.wdRequests)
        .values({
          playerId: p.id,
          walletAddress: args.walletAddress,
          amountKt,
          amountUsdt,
          status: "pending",
        })
        .returning({ id: schema.wdRequests.id });
      const row = inserted[0];
      if (!row) return fail(S.errWdCreateFail);
      const newBalance = roundKt(p.ktBalance - amountKt);
      await db
        .update(schema.player)
        .set({ ktBalance: newBalance })
        .where(eq(schema.player.id, p.id));
      await logActivity(
        db,
        p.id,
        "wd_request",
        S.logWdRequest(amountUsdt, amountKt),
        -amountKt,
      );
      return { ok: true, error: null, wdId: row.id, ktBalance: newBalance };
    },
  }),

  cancelWithdrawal: defineGameAction({
    description:
      "Cancels a still-pending withdrawal request and refunds its locked KT to the player's balance.",
    request: z.object({ wdId: z.number().int().positive() }),
    response: resultShape.extend({ ktBalance: z.number() }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      // Hanya WD milik sendiri yang bisa dibatalkan — id WD orang
      // lain tidak akan ketemu di sini.
      const rows = await db
        .select()
        .from(schema.wdRequests)
        .where(
          and(
            eq(schema.wdRequests.id, args.wdId),
            eq(schema.wdRequests.playerId, p.id),
          ),
        )
        .limit(1);
      const wd = rows[0];
      if (!wd) return { ok: false, error: S.errWdNotFound, ktBalance: p.ktBalance };
      if (wd.status !== "pending")
        return { ok: false, error: S.errWdCancelNotPending, ktBalance: p.ktBalance };
      await db
        .update(schema.wdRequests)
        .set({ status: "cancelled", processedAt: new Date() })
        .where(eq(schema.wdRequests.id, wd.id));
      await db
        .update(schema.player)
        .set({ ktBalance: roundKt(p.ktBalance + wd.amountKt) })
        .where(eq(schema.player.id, p.id));
      await logActivity(db, p.id, "wd_cancel", S.logWdCancel(wd.id, wd.amountKt), wd.amountKt);
      return { ok: true, error: null, ktBalance: roundKt(p.ktBalance + wd.amountKt) };
    },
  }),

  updateWithdrawal: defineGameAction({
    description:
      "Admin action for the owner: moves a withdrawal through the manual payout flow (pending → approved → paid, or rejected with a full KT refund). Records an optional note and USDT transaction reference.",
    request: z.object({
      wdId: z.number().int().positive(),
      action: z.enum(["approve", "reject", "pay"]),
      adminNote: z.string().trim().max(300).optional(),
      txRef: z.string().trim().max(120).optional(),
    }),
    response: resultShape.extend({
      status: z
        .enum(["pending", "approved", "paid", "rejected", "cancelled"])
        .nullable(),
    }),
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const rows = await db
        .select()
        .from(schema.wdRequests)
        .where(eq(schema.wdRequests.id, args.wdId))
        .limit(1);
      const wd = rows[0];
      if (!wd) return { ok: false, error: S.errWdNotFound, status: null };
      // Saldo yang berubah adalah saldo PEMILIK WD, bukan saldo admin.
      const target = await loadPlayerRowOrNull(db, wd.playerId);
      if (!target) return { ok: false, error: S.errWdOwnerNotFound, status: wd.status };

      if (args.action === "approve") {
        if (wd.status !== "pending")
          return { ok: false, error: S.errWdApproveNotPending, status: wd.status };
        await db
          .update(schema.wdRequests)
          .set({ status: "approved", adminNote: args.adminNote ?? wd.adminNote })
          .where(eq(schema.wdRequests.id, wd.id));
        await logActivity(db, wd.playerId, "wd_approve", S.logWdApprove(wd.id, wd.amountUsdt), null);
        return { ok: true, error: null, status: "approved" as const };
      }

      if (args.action === "pay") {
        if (wd.status !== "approved")
          return { ok: false, error: S.errWdPayNotApproved, status: wd.status };
        await db
          .update(schema.wdRequests)
          .set({
            status: "paid",
            adminNote: args.adminNote ?? wd.adminNote,
            txRef: args.txRef ?? wd.txRef,
            processedAt: new Date(),
          })
          .where(eq(schema.wdRequests.id, wd.id));
        await db
          .update(schema.player)
          .set({ totalWdPaidUsdt: target.totalWdPaidUsdt + wd.amountUsdt })
          .where(eq(schema.player.id, target.id));
        await logActivity(db, wd.playerId, "wd_paid", S.logWdPaid(wd.id, wd.amountUsdt), null);
        return { ok: true, error: null, status: "paid" as const };
      }

      // reject
      if (wd.status !== "pending" && wd.status !== "approved")
        return { ok: false, error: S.errWdAlreadyDone, status: wd.status };
      await db
        .update(schema.wdRequests)
        .set({
          status: "rejected",
          adminNote: args.adminNote ?? wd.adminNote,
          processedAt: new Date(),
        })
        .where(eq(schema.wdRequests.id, wd.id));
      await db
        .update(schema.player)
        .set({ ktBalance: roundKt(target.ktBalance + wd.amountKt) })
        .where(eq(schema.player.id, target.id));
      await logActivity(db, wd.playerId, "wd_reject", S.logWdReject(wd.id, wd.amountKt), wd.amountKt);
      return { ok: true, error: null, status: "rejected" as const };
    },
  }),

  clearPlayerFlag: defineGameAction({
    description:
      "Admin action for the owner: clears one player's anti-cheat flag after manual review (risk score back to 0, reason and counters reset). The player keeps their balance and progress — clearing a flag is never a punishment, and a genuinely suspicious player will simply be flagged again by the detection rules if the pattern continues.",
    request: z.object({ playerId: z.number().int().positive() }),
    response: resultShape,
    async handler(args, session) {
      const db = getDb();
      // i18n: request language — user-facing strings only.
      const lang = session.lang;
      const S = serverStrings(lang);
      const target = await loadPlayerRowOrNull(db, args.playerId);
      if (!target) return { ok: false, error: S.errPlayerNotFound };
      await clearPlayerFlag(db, args.playerId, lang);
      return { ok: true, error: null };
    },
  }),

};

/** The action map — the client imports this TYPE only (import type),
 *  so no server runtime ever enters the client bundle. */
export type Actions = typeof gameActions;
export type ActionName = keyof Actions;

/** Dispatches one {action, args} call (POST /api/game): validates the
 *  action's request schema with zod, then runs its handler against
 *  Neon. Throws on an unknown action or invalid arguments — the API
 *  route turns those into 400s; business failures come back as
 *  {ok: false, error} from the handlers themselves. */
export async function dispatchGameAction(
  action: string,
  input: unknown,
  initData?: string | null,
  ip?: string | null,
  // Optional client language ("id" | "en", default "id") — used ONLY
  // for user-facing strings; never for logic. Threaded through
  // resolveSession into session.lang.
  lang?: unknown,
): Promise<unknown> {
  const entry = (
    gameActions as Record<
      string,
      {
        request: z.ZodTypeAny;
        handler: (args: never, session: Session) => Promise<unknown>;
      }
    >
  )[action];
  if (!entry) {
    throw new Error(serverStrings(normalizeLang(lang)).errUnknownAction(action));
  }
  // Sesi diputuskan dulu dari initData — initData palsu/kedaluwarsa
  // ditolak sebelum handler apa pun berjalan.
  const resolved = resolveSession(initData ?? null, lang);
  // NB: `=== false`, bukan `!resolved.ok` — lihat catatan yang sama
  // di api/_lib/telegram.ts (Vercel typecheck tanpa strictNullChecks).
  if (resolved.ok === false) {
    return { ok: false, error: resolved.error };
  }
  // IP request (dari header Vercel, bukan dari klien) ditempel ke
  // sesi untuk anti-cheat aturan multi-akun.
  resolved.session.ip = ip ?? null;
  // Aksi Kendali hanya untuk pemilik — dijaga di sini (satu pintu)
  // supaya tidak ada handler admin yang lupa memeriksa: hanya sesi
  // Telegram yang id-nya cocok dengan ADMIN_TELEGRAM_ID. Pemain web
  // lama (tanpa initData) BUKAN admin. Gagal tertutup: bukan admin →
  // ok:false, aksi TIDAK dijalankan.
  const ADMIN_ACTIONS = new Set([
    "updateWithdrawal",
    "confirmPremiumOrder",
    "rejectPremiumOrder",
    "grantPremium",
    "clearPlayerFlag",
    "setupStarsWebhook",
  ]);
  if (ADMIN_ACTIONS.has(action) && !resolved.session.isAdmin) {
    return { ok: false, error: serverStrings(resolved.session.lang).errAdminOnly };
  }
  const args = entry.request.parse(input ?? {});
  return entry.handler(args as never, resolved.session);
}
