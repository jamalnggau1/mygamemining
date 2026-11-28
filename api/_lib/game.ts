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
//   A "Tonton Iklan" button pays AD_REWARD_ENERGY (5 Daya Kapal)
//   per view — the slot where the owner plugs in a real ad provider
//   later. The reward is capped server-side: at most AD_DAILY_CAP
//   (10) views per calendar day (= 50 Daya/hari max) and a
//   AD_COOLDOWN_SECONDS (5 menit) gap between views, both recomputed in
//   watchAd from the ad_reward rows in the activity log. No new table
//   or migration: the activity log IS the claim history, and ad_reward
//   classifies as an economy event in the split log.

import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import * as schema from "../../deploy/neon/schema.pg.js";
import { getDb, type Db } from "./store.js";
import { resolveSession, type Session } from "./telegram.js";
import {
  ANOMALIES_EN,
  ANOMALIES_RU,
  ASTEROID_CLASSES_EN,
  ASTEROID_CLASSES_RU,
  ASTEROID_NICKNAMES_EN,
  ASTEROID_NICKNAMES_RU,
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
  callBotApi,
  createInvoiceLink,
  parseInvoicePayload,
  sendTelegramMessage,
  setWebhook,
  STARS_WEBHOOK_URL,
} from "./stars.js";
import {
  GRAM_RECEIVER_ADDRESS,
  verifyGramTransaction,
} from "./ton.js";
import {
  GRAM_FALLBACK_PRICE_USD,
  getGramPriceUsd,
  gramAmountForUsd,
  gramToNanoTon,
} from "./gram-price.js";

// ---------------------------------------------------------------------------
// Game design constants
// ---------------------------------------------------------------------------

export const KT_PER_USDT = 1000;
export const DAILY_BONUS_KT = 0.625;
export const AD_REWARD_ENERGY = 5; // Daya Kapal per tontonan iklan (owner 2026-11-24: hadiah iklan bukan KT lagi — 5 = tepat 1x biaya scan, jadi 1 iklan = 1 scan)
export const AD_DAILY_CAP = 10;
const AD_COOLDOWN_SECONDS = 300; // 5 menit antar-iklan (owner 2026-11-23: dari 1 jam; kuota tetap 10/hari)

// Hadiah referral (2026-11-20; bonus yang diundang 2026-11-24): 10 KT
// ke PENGUNDANG + 5 KT ke YANG DIUNDANG, dibayar saat pemain yang
// diundangnya menyelesaikan ekspedisi PERTAMANYA. Jumlah TETAP —
// pemilik mendelegasikan angkanya ke Muse: 10 KT ≈ 2–3 jam main
// aktif gratis (~100 KT/hari), jadi 10 referral = satu WD pertama
// (100 KT) — layak dibagikan, tidak layak di-farming (tiap akun
// palsu butuh akun Telegram sendiri + main sungguhan, dan anti-cheat
// menandai >3 akun/IP). Satu-satunya tempat angka ini dipakai:
// payReferralRewardIfPending di bawah.
export const REFERRAL_REWARD_KT = 10;
export const REFERRAL_REFEREE_REWARD_KT = 5;

// Bonus gabung channel (2026-11-24, owner): +5 KT SEKALI per pemain,
// diklaim manual dari tab Komunitas. Server memverifikasi keanggotaan
// channel @astra_mining_gram lewat Bot API (getChatMember) memakai id
// Telegram yang tervalidasi — klien tidak bisa memalsukannya. Bot
// HARUS jadi admin channel supaya Telegram menjawab pengecekan ini;
// bila pengecekan gagal (bot belum admin, jaringan, token), klaim
// ditolak TANPA menandai sudah diklaim, jadi pemain bisa mencoba lagi.
export const CHANNEL_BONUS_KT = 5;
const CHANNEL_CHAT_ID = "@astra_mining_gram";
// Status getChatMember yang berarti "sudah bergabung": creator /
// administrator / member / restricted (restricted tetap anggota).
const CHANNEL_MEMBER_STATUSES = [
  "creator",
  "administrator",
  "member",
  "restricted",
];
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

// Alamat dompet WD HARUS alamat TON (owner 2026-11-25): USDT hanya
// dibayar lewat jaringan TON. Format yang diterima — friendly
// mainnet: 48 karakter base64url diawali "EQ" (bounceable) atau
// "UQ" (non-bounceable); raw: "0:" + 64 hex. Alamat jaringan lain
// (TRC20 "T…", ERC20/BEP20 "0x…", nama .ton) DITOLAK di handler
// requestWithdrawal — pemilik tidak bisa membayar ke jaringan lain.
export function isTonAddress(address: string): boolean {
  return (
    /^[EU]Q[A-Za-z0-9_-]{46}$/.test(address) ||
    /^0:[0-9a-fA-F]{64}$/.test(address)
  );
}

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
// prices are DYNAMIC (owner 2026-11-21 — a fixed GRAM amount
// loses the owner money when GRAM drops): each plan has a fixed
// USD target (Standard $4.08, Pro $13.26 — the value of 4 / 13
// GRAM at $1.02, when the fixed prices were set) and the GRAM
// amount is target ÷ live price, rounded UP to 2 decimals
// (api/_lib/gram-price.ts: tonapi → CoinGecko → $1.02 fallback).
// GRAM down → the player pays MORE grams; GRAM up → FEWER grams;
// the owner always receives the same USD value. The fixed 4 / 13
// GRAM survive only as the fallback when no price source answers
// (price $1.02). The owner keeps 100% instantly (no Fragment
// 21-day hold, no 1.000 minimum).
const PREMIUM_PLAN_USD = { standard: 4.08, pro: 13.26 } as const;
const PREMIUM_PLANS = {
  standard: { days: 7, stars: 300, tier: "standard" as const, label: "Standard · 7 hari", labelEn: "Standard · 7 days", labelRu: "Standard · 7 дней" },
  pro: { days: 30, stars: 1000, tier: "pro" as const, label: "Pro · 30 hari", labelEn: "Pro · 30 days", labelRu: "Pro · 30 дней" },
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
  /** Russian display name (i18n) — same ore, same price. */
  nameRu: string;
  price: number; // base KT per unit
  color: string;
  icon: string; // client-side SVG icon id (matches the ore id)
  hardness: number; // 1 (soft regolith) .. 4 (helium-3 crystal lattice)
  // Drop weight per zone index (0..4). Index order matches ORES.
  weights: number[];
};

export const ORES: OreDef[] = [
  { id: "regolith", name: "Regolith Asteroid", nameEn: "Asteroid Regolith", nameRu: "Астероидный реголит", price: 0.025, color: "#9a9186", icon: "regolith", hardness: 1, weights: [34, 20, 12, 8, 5] },
  { id: "kondrit", name: "Kondrit Karbon", nameEn: "Carbonaceous Chondrite", nameRu: "Углеродистый хондрит", price: 0.05, color: "#4b4f5e", icon: "kondrit", hardness: 1, weights: [26, 34, 18, 10, 6] },
  { id: "besinikel", name: "Besi-Nikel", nameEn: "Iron-Nickel", nameRu: "Железо-никель", price: 0.125, color: "#c97a3a", icon: "besinikel", hardness: 2, weights: [14, 16, 28, 15, 9] },
  { id: "kobalt", name: "Kobalt Antariksa", nameEn: "Space Cobalt", nameRu: "Космический кобальт", price: 0.25, color: "#5b8cff", icon: "kobalt", hardness: 2, weights: [8, 8, 17, 17, 11] },
  { id: "platinum", name: "Platinum", nameEn: "Platinum", nameRu: "Платина", price: 1.125, color: "#e6ebf2", icon: "platinum", hardness: 3, weights: [4, 3, 8, 18, 15] },
  { id: "iridium", name: "Iridium", nameEn: "Iridium", nameRu: "Иридий", price: 3.6, color: "#f2b705", icon: "iridium", hardness: 3, weights: [2, 1, 4, 12, 18] },
  { id: "helium3", name: "Kristal Helium-3", nameEn: "Helium-3 Crystal", nameRu: "Кристалл гелия-3", price: 9, color: "#6ee7ff", icon: "helium3", hardness: 4, weights: [0, 0, 1, 3, 9] },
  // Batu mulia khas tiap peta — dua permata unggulan per map, hanya
  // muncul di map-nya (weight di zone lain 0).
  { id: "opal", name: "Opal Pelangi", nameEn: "Rainbow Opal", nameRu: "Радужный опал", price: 0.975, color: "#f9a8d4", icon: "opal", hardness: 2, weights: [7, 0, 0, 0, 0] },
  { id: "topaz", name: "Topaz Emas", nameEn: "Golden Topaz", nameRu: "Золотой топаз", price: 1.275, color: "#fbbf24", icon: "topaz", hardness: 2, weights: [5, 0, 0, 0, 0] },
  { id: "turkuois", name: "Turkuois Orbit", nameEn: "Orbital Turquoise", nameRu: "Орбитальная бирюза", price: 1.95, color: "#2dd4bf", icon: "turkuois", hardness: 2, weights: [0, 6, 0, 0, 0] },
  { id: "ametis", name: "Ametis Sabuk", nameEn: "Belt Amethyst", nameRu: "Аметист пояса", price: 2.625, color: "#a78bfa", icon: "ametis", hardness: 3, weights: [0, 4, 0, 0, 0] },
  { id: "zamrud", name: "Zamrud Bulan", nameEn: "Moon Emerald", nameRu: "Лунный изумруд", price: 4.8, color: "#34d399", icon: "zamrud", hardness: 3, weights: [0, 0, 5, 0, 0] },
  { id: "rubi", name: "Rubi Mare", nameEn: "Mare Ruby", nameRu: "Рубин Моря", price: 6.3, color: "#f87171", icon: "rubi", hardness: 3, weights: [0, 0, 3, 0, 0] },
  { id: "safir", name: "Safir Bintang", nameEn: "Star Sapphire", nameRu: "Звёздный сапфир", price: 10.5, color: "#60a5fa", icon: "safir", hardness: 4, weights: [0, 0, 0, 5, 0] },
  { id: "berlian", name: "Berlian Psyche", nameEn: "Psyche Diamond", nameRu: "Алмаз Психеи", price: 14.25, color: "#f8fafc", icon: "berlian", hardness: 4, weights: [0, 0, 0, 3, 0] },
  { id: "opales", name: "Opal Es Hitam", nameEn: "Black Ice Opal", nameRu: "Чёрный ледяной опал", price: 22.5, color: "#c084fc", icon: "opales", hardness: 4, weights: [0, 0, 0, 0, 4] },
  { id: "voidium", name: "Kristal Voidium", nameEn: "Voidium Crystal", nameRu: "Кристалл войдиума", price: 36, color: "#818cf8", icon: "voidium", hardness: 4, weights: [0, 0, 0, 0, 2] },
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
  /** Russian display strings (i18n) — same map, same rules. */
  nameRu: string;
  taglineRu: string;
  descRu: string;
  minLayer: number; // sector needed to unlock this map
  image: string; // client asset key
  distanceLabel: string; // how far this map is from Earth — farther = slower ops
  distanceLabelEn: string;
  distanceLabelRu: string;
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
    nameRu: "Низкая орбита — добывающая станция LEO",
    tagline: "Peta pemula · aman & ramah",
    taglineEn: "Starter map · safe & friendly",
    taglineRu: "Карта для новичков · безопасно и просто",
    desc: "Asteroid kecil dekat Bumi, jauh dari bahaya. Regolith dan kondrit karbon mendominasi, dengan kilau Opal Pelangi dan Topaz Emas di sela batuan. Tempat belajar terbaik untuk penambang baru.",
    descEn: "Small asteroids near Earth, far from danger. Regolith and carbonaceous chondrite dominate, with flashes of Rainbow Opal and Golden Topaz between the rocks. The best place for new miners to learn.",
    descRu: "Небольшие астероиды рядом с Землёй, вдали от опасностей. Здесь преобладают реголит и углеродистые хондриты, а среди камней сверкают Радужный опал и Золотой топаз. Лучшее место для обучения новых шахтёров.",
    minLayer: 1,
    image: "hero",
    distanceLabel: "±0,01 SA dari Bumi — halaman belakang stasiun",
    distanceLabelEn: "±0.01 AU from Earth — the station's backyard",
    distanceLabelRu: "±0,01 а.е. от Земли — задний двор станции",
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
    nameRu: "Главный пояс астероидов",
    tagline: "Peta menengah · serpihan beterbangan",
    taglineEn: "Mid map · flying debris",
    taglineRu: "Средняя карта · летящие обломки",
    desc: "Di antara Mars dan Jupiter, jutaan serpihan batu beterbangan. Kondrit melimpah, besi-nikel mulai muncul dari inti asteroid purba — dan Turkuois Orbit serta Ametis Sabuk bersembunyi di kawah-kawah tua. Serpihan kadang menyumbat mata bor.",
    descEn: "Between Mars and Jupiter, millions of rock fragments fly around. Chondrite is abundant, iron-nickel starts showing up from the cores of ancient asteroids — and Orbital Turquoise and Belt Amethyst hide in old craters. Debris sometimes clogs the drill bit.",
    descRu: "Между Марсом и Юпитером миллионы каменных обломков носятся в пространстве. Хондритов здесь в изобилии, железо-никель начинает встречаться в ядрах древних астероидов, а Орбитальная бирюза и Аметист пояса прячутся в старых кратерах. Обломки иногда забивают бур.",
    minLayer: 5,
    image: "asteroid",
    distanceLabel: "±2,8 SA dari Bumi — di antara Mars dan Jupiter",
    distanceLabelEn: "±2.8 AU from Earth — between Mars and Jupiter",
    distanceLabelRu: "±2,8 а.е. от Земли — между Марсом и Юпитером",
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
    nameRu: "Поверхность Луны — Море Спокойствия",
    tagline: "Peta lanjutan · radiasi & debu tajam",
    taglineEn: "Advanced map · radiation & sharp dust",
    taglineRu: "Продвинутая карта · радиация и острая пыль",
    desc: "Regolith bulan yang keras dan berdebu tajam. Besi-nikel dan kobalt jadi buruan utama, Zamrud Bulan berkilau hijau dari singkapan batuan, dan Rubi Mare yang langka menunggu penambang tekun. Radiasi permukaan menguras daya setiap operasi, dan debu bulan sesekali membuat bor macet.",
    descEn: "Hard lunar regolith and sharp dust. Iron-nickel and cobalt are the main prize, Moon Emerald glints green from rock outcrops, and the rare Mare Ruby waits for patient miners. Surface radiation drains energy on every operation, and moon dust occasionally jams the drill.",
    descRu: "Твёрдый лунный реголит и острая пыль. Железо-никель и кобальт — главная добыча, Лунный изумруд зеленеет в обнажениях пород, а редкий Рубин Моря ждёт терпеливых шахтёров. Поверхностная радиация отнимает энергию при каждой операции, а лунная пыль иногда заклинивает бур.",
    minLayer: 9,
    image: "moon",
    distanceLabel: "384 ribu km dari Bumi — tetangga terdekat, batuan kerasnya yang bikin lama",
    distanceLabelEn: "384 thousand km from Earth — the closest neighbour, its hard rock is what slows you down",
    distanceLabelRu: "384 тысячи км от Земли — ближайший сосед, но именно твёрдые породы замедляют работу",
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
    nameRu: "Металлический астероид 16 Психея",
    tagline: "Peta sulit · inti logam raksasa",
    taglineEn: "Hard map · giant metal core",
    taglineRu: "Сложная карта · гигантское металлическое ядро",
    desc: "Asteroid raksasa yang hampir seluruhnya logam padat. Platinum dan iridium jauh lebih sering terlihat, Safir Bintang dan Berlian Psyche tertanam di inti besinya. Batuan sekeras ini membuat bor sering macet, dan serpihan logam tajam bisa merobek lambung kapal — siapkan KT untuk biaya perbaikan.",
    descEn: "A giant asteroid made almost entirely of solid metal. Platinum and iridium show up far more often, Star Sapphire and Psyche Diamond are embedded in its iron core. Rock this hard jams drills often, and sharp metal shards can tear the hull — keep KT ready for repair fees.",
    descRu: "Гигантский астероид, почти целиком состоящий из твёрдого металла. Платина и иридий встречаются здесь гораздо чаще, Звёздный сапфир и Алмаз Психеи вкраплены в его железное ядро. Такая твёрдая порода часто заклинивает буры, а острые металлические осколки могут разорвать корпус корабля — держите KT наготове для оплаты ремонта.",
    minLayer: 14,
    image: "psyche",
    distanceLabel: "±3,3 SA dari Bumi — jauh di sabuk utama luar",
    distanceLabelEn: "±3.3 AU from Earth — deep in the outer main belt",
    distanceLabelRu: "±3,3 а.е. от Земли — глубоко во внешнем главном поясе",
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
    nameRu: "Пояс Койпера — ледяное ядро дальнего космоса",
    tagline: "Peta tersulit · ujung tata surya",
    taglineEn: "Hardest map · edge of the solar system",
    taglineRu: "Самая сложная карта · край Солнечной системы",
    desc: "Ujung tata surya: gelap, membeku, dan bermandikan radiasi kosmik. Iridium dan kristal Helium-3 menunggu di sini, bersama Opal Es Hitam dan Kristal Voidium — permata termahal yang dikenal stasiun. Bor membeku dan macet, lambung kapal rapuh diterpa puing es, dan setiap operasi menguras daya jauh lebih besar. Hanya penambang paling sabar yang pulang kaya dari sini.",
    descEn: "The edge of the solar system: dark, freezing, and bathed in cosmic radiation. Iridium and Helium-3 crystals wait here, along with Black Ice Opal and Voidium Crystal — the most expensive gems the station knows. Drills freeze and jam, the hull grows brittle under ice debris, and every operation drains far more energy. Only the most patient miners come home rich from here.",
    descRu: "Край Солнечной системы: темно, морозно, под космической радиацией. Здесь ждут иридий и кристаллы гелия-3, а вместе с ними Чёрный ледяной опал и Кристалл войдиума — самые дорогие самоцветы, известные станции. Буры замерзают и заклинивают, корпус становится хрупким под ударами ледяных обломков, и каждая операция отнимает гораздо больше энергии. Только самые терпеливые шахтёры возвращаются отсюда богатыми.",
    minLayer: 20,
    image: "kuiper",
    distanceLabel: "±40 SA dari Bumi — ujung tata surya, sinyal saja butuh berjam-jam",
    distanceLabelEn: "±40 AU from Earth — the edge of the solar system, even a signal takes hours",
    distanceLabelRu: "±40 а.е. от Земли — край Солнечной системы, даже сигналу нужны часы",
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
  /** Russian display strings (i18n) — same upgrade, same cost. */
  nameRu: string;
  descRu: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
};

export const UPGRADES: UpgradeDef[] = [
  { id: "beliung", name: "Lengan Bor Laser", nameEn: "Laser Drill Arm", nameRu: "Лазерный буровой манипулятор", desc: "Pengeboran setiap urat mineral 6% lebih cepat per level — mata bor laser memotong batuan lebih efisien.", descEn: "Drilling each mineral vein is 6% faster per level — the laser bit cuts through rock more efficiently.", descRu: "Бурение каждой минеральной жилы на 6% быстрее за уровень — лазерное долото режет породу эффективнее.", baseCost: 150, growth: 1.6, maxLevel: 10 },
  { id: "tangki", name: "Tangki O₂ & Baterai Surya", nameEn: "O₂ Tank & Solar Battery", nameRu: "Бак O₂ и солнечная батарея", desc: "KAPASITAS daya: +6 daya maksimum per level (30 → 90). Tangki O₂ yang lebih besar memperpanjang napas misi di permukaan, dan baterai surya menyimpan cadangan daya lebih banyak — jadi kamu bisa menjalankan lebih banyak scan & bor dalam satu sesi, dan daya yang terisi saat kamu tidak bermain tidak terbuang karena tangki cepat penuh. Upgrade ini TIDAK mempercepat isi ulang; kecepatan isi ulang diatur Reaktor Fusi Mini.", descEn: "Energy CAPACITY: +6 max energy per level (30 → 90). A bigger O₂ tank stretches your mission breath on the surface, and the solar battery banks more reserve energy — so you can run more scans & drills in one session, and energy gained while you're away isn't wasted by a tank that fills up too fast. This upgrade does NOT speed up recharge; recharge speed is set by the Mini Fusion Reactor.", descRu: "ЁМКОСТЬ энергии: +6 к максимуму энергии за уровень (30 → 90). Более вместительный бак O₂ продлевает дыхание миссии на поверхности, а солнечная батарея запасает больше резервной энергии — так вы сможете выполнять больше сканирований и бурений за одну сессию, а энергия, накопленная пока вас нет, не пропадёт из-за быстро заполняющегося бака. Это улучшение НЕ ускоряет перезарядку; скорость перезарядки задаёт Мини-реактор синтеза.", baseCost: 120, growth: 1.6, maxLevel: 10 },
  { id: "bor", name: "Reaktor Fusi Mini", nameEn: "Mini Fusion Reactor", nameRu: "Мини-реактор синтеза", desc: "KECEPATAN isi ulang daya: waktu isi ulang berkurang 10% per level — dari 4 menit per daya di level 0 menjadi sekitar 1 menit 24 detik per daya di level 10. Inilah upgrade yang membuat daya kapal pulih lebih cepat; tanpa upgrade ini isi ulang lambat.", descEn: "Energy recharge SPEED: recharge time drops 10% per level — from 4 minutes per energy at level 0 to about 1 minute 24 seconds per energy at level 10. This is the upgrade that makes ship energy recover faster; without it, recharge is slow.", descRu: "СКОРОСТЬ перезарядки энергии: время перезарядки сокращается на 10% за уровень — с 4 минут за единицу энергии на 0 уровне примерно до 1 минуты 24 секунд за единицу энергии на 10 уровне. Именно это улучшение заставляет энергию корабля восстанавливаться быстрее; без него перезарядка медленная.", baseCost: 200, growth: 1.7, maxLevel: 10 },
  { id: "ransel", name: "Drone Kargo Otomatis", nameEn: "Automated Cargo Drone", nameRu: "Автоматический грузовой дрон", desc: "+7% peluang hasil ganda saat mengambil hasil tambang (drone mengangkut 2× lipat) per level.", descEn: "+7% chance of a double haul when collecting mining results (the drone carries 2× as much) per level.", descRu: "+7% к шансу двойной добычи при сборе результатов (дрон перевозит в 2 раза больше) за уровень.", baseCost: 180, growth: 1.6, maxLevel: 10 },
  { id: "negosiator", name: "Negosiator Stasiun Orbital", nameEn: "Orbital Station Negotiator", nameRu: "Переговорщик орбитальной станции", desc: "+5% harga jual semua mineral di Stasiun Orbital per level.", descEn: "+5% sell price for all minerals at the Orbital Station per level.", descRu: "+5% к цене продажи всех минералов на орбитальной станции за уровень.", baseCost: 250, growth: 1.65, maxLevel: 10 },
  { id: "pemindai", name: "Spektrometer Inti", nameEn: "Core Spectrometer", nameRu: "Ядерный спектрометр", desc: "Scan asteroid 7% lebih cepat per level, dan +25% peluang urat Iridium & Kristal Helium-3 muncul di asteroid berikutnya.", descEn: "Asteroid scans 7% faster per level, and +25% chance that Iridium & Helium-3 crystal veins appear on the next asteroid.", descRu: "Сканирование астероидов на 7% быстрее за уровень и +25% к шансу появления жил иридия и кристаллов гелия-3 на следующем астероиде.", baseCost: 400, growth: 1.75, maxLevel: 8 },
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
  // Drill times DOUBLED (2026-11-22, owner order — the old times were
  // barely felt, especially by Premium users). Only the TIME changes:
  // the drill ENERGY cost (mineEnergyCost: 4 + hardness + radiation)
  // is untouched, as are exp/map time factors, Beliung −6%/level,
  // Premium ×0.75 and dual drill ×0.5.
  const base = 60 + hardness * 50 + vein.qty * 16;
  const sped = base * exp.timeFactor * map.timeFactor * (1 - 0.06 * (levels["beliung"] ?? 0)) * (premium ? PREMIUM_TIME_FACTOR : 1) * (dualDrill ? DUAL_DRILL_FACTOR : 1);
  return Math.max(60, Math.round(sped));
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
 *  butuh 3, dst. Pintu peta diperberat lagi 2026-11-21 (perintah
 *  pemilik — Sektor 3 terlalu cepat untuk Peta 2): Peta 2 (Sektor
 *  5) = 10, Peta 3 (Sektor 9) = 36, Peta 4 (Sektor 14) = 91,
 *  Peta 5 (Sektor 20) = 190 ekspedisi total. Bonus ekspedisinya
 *  TIDAK berubah (masih 0,125 + 0,025×sektor, cap 8,75) — ia hanya
 *  tumbuh lebih lambat karena sektornya naik lebih lambat. */
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

/** Localized display helpers — pick the Russian field when the
 *  player's session language is "ru", the English field when "en",
 *  else the Indonesian original. */
export function oreName(ore: OreDef, lang: Lang): string {
  return lang === "ru" ? ore.nameRu : lang === "en" ? ore.nameEn : ore.name;
}
/** Localized ore name by id (null when the ore id is unknown). */
export function oreNameById(id: string, lang: Lang): string | null {
  const ore = oreById(id);
  return ore ? oreName(ore, lang) : null;
}
export function mapName(map: MapDef, lang: Lang): string {
  return lang === "ru" ? map.nameRu : lang === "en" ? map.nameEn : map.name;
}
export function mapTagline(map: MapDef, lang: Lang): string {
  return lang === "ru" ? map.taglineRu : lang === "en" ? map.taglineEn : map.tagline;
}
export function mapDesc(map: MapDef, lang: Lang): string {
  return lang === "ru" ? map.descRu : lang === "en" ? map.descEn : map.desc;
}
export function mapDistanceLabel(map: MapDef, lang: Lang): string {
  return lang === "ru" ? map.distanceLabelRu : lang === "en" ? map.distanceLabelEn : map.distanceLabel;
}
export function upgradeName(def: UpgradeDef, lang: Lang): string {
  return lang === "ru" ? def.nameRu : lang === "en" ? def.nameEn : def.name;
}
export function upgradeDesc(def: UpgradeDef, lang: Lang): string {
  return lang === "ru" ? def.descRu : lang === "en" ? def.descEn : def.desc;
}
export function premiumPlanLabel(plan: { label: string; labelEn: string; labelRu: string }, lang: Lang): string {
  return lang === "ru" ? plan.labelRu : lang === "en" ? plan.labelEn : plan.label;
}
/** Expedition names are stored as "Asteroid CODE — Nickname" (see
 *  generateExpedition). Translate the nickname part by index; the
 *  code and the word "Asteroid" stay the same in all languages. */
export function localizeExpeditionName(name: string, lang: Lang): string {
  if (lang === "id") return name;
  const parts = name.split(" — ");
  const nick = parts[parts.length - 1] ?? "";
  const idx = ASTEROID_NICKNAMES.indexOf(nick);
  if (idx === -1) return name;
  const list = lang === "ru" ? ASTEROID_NICKNAMES_RU : ASTEROID_NICKNAMES_EN;
  parts[parts.length - 1] = list[idx] ?? nick;
  return parts.join(" — ");
}
/** Asteroid class strings ("Tipe C — Karbonan") are stored in the
 *  expedition; translate by (zone, index) lookup. */
export function localizeKlass(klass: string, zone: number, lang: Lang): string {
  if (lang === "id") return klass;
  const classes = ASTEROID_CLASSES[zone] ?? [];
  const idx = classes.indexOf(klass);
  if (idx === -1) return klass;
  const list = lang === "ru" ? ASTEROID_CLASSES_RU : ASTEROID_CLASSES_EN;
  return list[zone]?.[idx] ?? klass;
}
/** Anomaly text is stored in the expedition; translate by exact match. */
export function localizeAnomaly(text: string | null, lang: Lang): string | null {
  if (text == null || lang === "id") return text;
  const idx = ANOMALIES.findIndex((a) => a.text === text);
  if (idx === -1) return text;
  const list = lang === "ru" ? ANOMALIES_RU : ANOMALIES_EN;
  return list[idx] ?? text;
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
  // Nama depan Telegram terakhir (untuk daftar teman referral —
  // disimpan terpisah dari username karena banyak pemain tidak punya
  // username). Dijaga try/catch: bila migrasi 0012 belum dijalankan,
  // game tetap jalan (nama di daftar referral mundur ke @username).
  if (session.firstName && session.firstName !== p.firstName) {
    try {
      await db
        .update(schema.player)
        .set({ firstName: session.firstName })
        .where(eq(schema.player.id, playerId));
      p = { ...p, firstName: session.firstName };
    } catch {
      // Kolom first_name belum ada — abaikan, bukan error game.
    }
  }
  // Bahasa pemain terakhir (2026-11-24): disimpan supaya pesan
  // otomatis (notifikasi WD, pengingat tidak aktif) bisa dikirim
  // dalam bahasa PENERIMA, bukan bahasa admin/pengirim. Diperbarui
  // di tiap request bila berubah (getGameState dipanggil tiap buka
  // aplikasi) — satu UPDATE tambahan hanya saat bahasanya memang
  // berbeda, jadi request biasa tanpa ganti bahasa tidak menambah
  // beban tulis.
  if (session.lang !== p.language) {
    await db
      .update(schema.player)
      .set({ language: session.lang })
      .where(eq(schema.player.id, playerId));
    p = { ...p, language: session.lang };
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
const MISSION_KINDS = new Set(["scan", "jam", "rare_find", "expedition_bonus", "travel", "hull_damage", "pvp_attack", "pvp_defend"]);
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

/** Statistik pemain untuk kartu "Statistik Pemain" di Kendali
 *  (2026-11-21, perintah pemilik): total baris pemain; aktif =
 *  punya ≥1 baris activity dalam 7 hari terakhir; tidak aktif =
 *  total − aktif; Premium aktif = premium_until masih di masa
 *  depan. Dua query agregat saja — activity dihitung dengan SATU
 *  GROUP BY (count distinct), tanpa N+1 per pemain. */
type PlayerStats = {
  total: number;
  active7d: number;
  inactive7d: number;
  premiumActive: number;
};
async function getPlayerStats(db: Db): Promise<PlayerStats> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [totals, active] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)`,
        premiumActive: sql<number>`count(*) filter (where ${schema.player.premiumUntil} > now())`,
      })
      .from(schema.player),
    db
      .select({
        active: sql<number>`count(distinct ${schema.activity.playerId})`,
      })
      .from(schema.activity)
      .where(gte(schema.activity.createdAt, sevenDaysAgo)),
  ]);
  const total = Number(totals[0]?.total ?? 0);
  const premiumActive = Number(totals[0]?.premiumActive ?? 0);
  const active7d = Number(active[0]?.active ?? 0);
  return {
    total,
    active7d,
    inactive7d: Math.max(0, total - active7d),
    premiumActive,
  };
}

/** Notifikasi WD ke pemain lewat Telegram (best-effort, 2026-11-21):
 *  pemain web lama tanpa telegram_id dilewati diam-diam; kegagalan
 *  kirim TIDAK PERNAH menggagalkan aksi WD — ditangkap dan diabaikan
 *  (WD sudah tercatat di database sebelum notifikasi dikirim). */
async function notifyPlayer(
  telegramId: number | null,
  text: string,
): Promise<void> {
  if (telegramId === null) return;
  try {
    await sendTelegramMessage({ chatId: telegramId, text });
  } catch {
    // Best-effort: notifikasi gagal tidak boleh mengembalikan WD.
  }
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

/** Nama tampilan teman yang diundang: nama depan dulu ("Andi"),
 *  lalu @username, terakhir "Pemain" bila keduanya kosong. */
function referralDisplayName(row: {
  firstName: string | null;
  username: string | null;
}): string {
  if (row.firstName) return row.firstName;
  if (row.username) return `@${row.username}`;
  return "Pemain";
}

export type ReferralListItem = {
  id: number;
  name: string;
  status: "pending" | "rewarded";
  joinedAt: string;
};

/** Statistik referral untuk satu pemain (tab Komunitas): berapa
 *  teman yang bergabung lewat link-nya, berapa yang sudah memberi
 *  hadiah, total KT yang sudah diterima dari referral, dan daftar
 *  teman itu (nama + status pending/rewarded, terbaru dulu) supaya
 *  pengundang bisa melihat siapa saja yang diundangnya dan siapa
 *  yang hadiahnya masih menunggu ekspedisi pertama temannya. */
async function getReferralStats(
  db: Db,
  playerId: number,
): Promise<{
  invited: number;
  rewarded: number;
  earnedKt: number;
  list: ReferralListItem[];
}> {
  let invited = 0;
  let rewarded = 0;
  try {
    const rows = await db
      .select({ status: schema.referrals.status })
      .from(schema.referrals)
      .where(eq(schema.referrals.referrerPlayerId, playerId));
    invited = rows.length;
    rewarded = rows.filter((r) => r.status === "rewarded").length;
  } catch {
    // Tabel referrals belum ada (migrasi 0005 belum dijalankan):
    // statistik tampil 0, game tetap jalan.
  }
  // Daftar teman — try/catch sendiri supaya kolom first_name yang
  // belum ada (migrasi 0012) tidak merusak hitungan di atas: daftar
  // sekadar tampil kosong.
  let list: ReferralListItem[] = [];
  try {
    const rows = await db
      .select({
        id: schema.referrals.id,
        status: schema.referrals.status,
        createdAt: schema.referrals.createdAt,
        firstName: schema.player.firstName,
        username: schema.player.username,
      })
      .from(schema.referrals)
      .innerJoin(
        schema.player,
        eq(schema.player.id, schema.referrals.referredPlayerId),
      )
      .where(eq(schema.referrals.referrerPlayerId, playerId))
      .orderBy(desc(schema.referrals.createdAt), desc(schema.referrals.id));
    list = rows.map((r) => ({
      id: r.id,
      name: referralDisplayName(r),
      status: r.status,
      joinedAt: r.createdAt.toISOString(),
    }));
  } catch {
    list = [];
  }
  return {
    invited,
    rewarded,
    earnedKt: roundKt(rewarded * REFERRAL_REWARD_KT),
    list,
  };
}

/** Membayar hadiah referral saat pemain yang diundang menyelesaikan
 *  ekspedisi PERTAMANYA: 10 KT masuk ke saldo PENGUNDANG (bukan ke
 *  yang diundang), baris referral berubah pending → rewarded, dan
 *  entri Log Ekonomi ditulis untuk pengundang. Sejak 2026-11-24
 *  YANG DIUNDANG juga dapat 5 KT di momen yang sama + entri Log
 *  Ekonomi sendiri. Hanya ekspedisi pertama yang membayar — setelah
 *  status "rewarded", ekspedisi berikutnya tidak menemukan baris
 *  pending lagi. Klaimnya atomik
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
    // Bonus untuk yang diundang (owner 2026-11-24): 5 KT di momen
    // yang sama — saat ia menyelesaikan ekspedisi pertamanya.
    const referred = await loadPlayerRowOrNull(db, referredPlayerId);
    if (referred) {
      await db
        .update(schema.player)
        .set({
          ktBalance: roundKt(referred.ktBalance + REFERRAL_REFEREE_REWARD_KT),
          totalKtEarned: roundKt(
            referred.totalKtEarned + REFERRAL_REFEREE_REWARD_KT,
          ),
        })
        .where(eq(schema.player.id, referred.id));
      await logActivity(
        db,
        referred.id,
        "referral_reward",
        serverStrings(lang).logReferralRefereeBonus(
          REFERRAL_REFEREE_REWARD_KT,
        ),
        REFERRAL_REFEREE_REWARD_KT,
      );
    }
  } catch {
    // Hadiah gagal = referral sekadar tidak terbayar kali ini;
    // ekspedisi si yang diundang tetap selesai seperti biasa.
  }
}

// --- PvP (2026-11-22) -------------------------------------------------
// Aturan yang disepakati pemilik (diskusi 2026-11-22, jangan
// diligitasi ulang):
//   - KT SATU jenis: semua KT bisa di-WD. Pasukan dibeli/di-upgrade
//     pakai KT yang sama — itu dilemanya (KT buat WD vs pasukan).
//   - Pertemuan: saat scan SELESAI, kadang ketemu penambang lain.
//     Peta 1 aman (0%); peluang naik per peta. Bukan tiap scan.
//   - Menang-kalah MURNI dari kekuatan — TANPA faktor acak yang
//     membuat yang lemah bisa menang. Pelindungnya adalah kebal
//     1 jam setelah diserang, bukan keberuntungan. Seri = bertahan
//     menang (keuntungan kandang).
//   - Rampas dari HASIL TAMBANG (bijih belum dijual), bukan saldo
//     KT. Pemenang mengambil 15% hasil tambang si kalah; penyerang
//     yang kalah kehilangan 10% hasil tambangnya sendiri (DIHANCURKAN
//     — KT sink, bukan dipindah).
//   - Pertemuan adalah kejadian sampingan: "Lewati" maupun bertarung
//     TIDAK menambah progres sektor — sektor hanya naik saat
//     ekspedisi selesai (semua urat dibor), di map mana pun.
//   - Yang diserang tidak harus online — pertahanannya dihitung
//     otomatis dari pasukannya.
//   - PvP TIDAK menciptakan KT (rampasan = transfer; kekalahan =
//     penghancuran). Satu-satunya pengecualian: rampasan dari
//     Perompak NPC (cadangan bila tidak ada pemain layak diserang)
//     adalah faucet kecil, dibatasi cooldown serangan + peluang
//     pertemuan.

// Peluang bertemu penambang lain saat scan selesai, per peta
// (indeks peta 0..4). Peta 1 (Orbit Rendah) aman: 0%.
// Peluang pertemuan PvP saat scan selesai (keputusan owner
// 2026-11-26: "naikan deh 20 di peta 2 dan naik terus, dasarnya
// 20 kan tadi dasarnya 10" — Peta 1 tetap 0%, aman).
export const PVP_ENCOUNTER_CHANCE = [0, 0.2, 0.25, 0.3, 0.4] as const;
// Penawaran pertemuan berlaku 10 menit, atau sampai scan/asteroid/
// peta berikutnya dimulai (startScan/abandon/travel/complete
// menghapus penawaran lama).
export const PVP_ENCOUNTER_EXPIRY_MS = 10 * 60 * 1000;
// Setelah diserang (menang/kalah), pemain kebal 1 jam.
export const PVP_SHIELD_MS = 60 * 60 * 1000;
// Jeda antar serangan penyerang: 30 menit.
export const PVP_ATTACK_COOLDOWN_MS = 30 * 60 * 1000;
// Pemenang merampas 15% hasil tambang si kalah (per jenis mineral,
// dibulatkan ke bawah, dipindah sebagai unit bijih).
export const PVP_STEAL_PCT = 0.15;
// Penyerang yang kalah kehilangan 10% hasil tambangnya sendiri —
// DIHANCURKAN dalam pertempuran (bukan dipindah), jadi ini KT sink.
export const PVP_LOSER_LOSS_PCT = 0.1;
// Lawan hanya layak dipilih bila setidaknya satu jenis bijihnya
// ≥7 unit — 15% dari 7 baru menghasilkan ≥1 unit rampasan.
const PVP_MIN_LOOT_QTY = 7;

// Pasukan: dua jenis, dibayar pakai KT yang sama dengan saldo WD
// (SATU mata uang — itu dilemanya). Sejak 2026-11-25 (pilihan B):
// pasukan DILATIH di Hangar (bukan dibeli instan) dan semua
// peningkatan jadi RISET di Lab — Hangar tidak punya tombol upgrade.
export const TROOP_MAX_COUNT = 20;
export const TROOP_MAX_LEVEL = 5;
// TAHAP UJI COBA (2026-11-23): latih DAN riset sama-sama 0,1 KT flat,
// Harga pasukan (keputusan owner 2026-11-25): 1 KT × level — latih
// drone Lv5 = 5 KT. Sebelumnya 0,1 KT flat selama tahap uji coba
// (2026-11-23 s.d. 2026-11-25). Riset punya harga sendiri sejak
// 2026-11-26 (di bawah).
export const TROOP_BASE_COST_KT = 1;
// Harga riset (keputusan owner 2026-11-26: "level 1 ke level 2 saja
// butuh 20 kt lalu kalikan saja itu"): satu langkah riset dari level
// L ke L+1 = 20 KT × L — ke Lv2 = 20 KT, ke Lv3 = 40 KT, ke Lv4 =
// 60 KT, ke Lv5 = 80 KT; langkah pertama (ke Lv1) juga 20 KT.
// Berlaku ke SEMUA jalur riset (level Serbu/Perisai, Perluas Camp,
// Pelatihan Cepat) — satu jalur penuh Lv0→Lv5 = 220 KT.
export const RESEARCH_BASE_COST_KT = 20;
// Hangar + Lab (2026-11-25, pilihan B):
//   - Latih: waktu 5 menit × level drone, jalan di server seperti
//     bor, satu antrean (satu drone sekali waktu).
//   - Camp: kapasitas awal 10 pasukan total (Serbu + Perisai
//     digabung); tiap riset Perluas Camp +5 (maks level 5 → 35).
//   - Melewati batas: makin banyak makin mahal DAN makin lama —
//     pengali 1 + kelebihan, sama untuk harga dan waktu (ke-1 ×2,
//     ke-2 ×3, ke-3 ×4, dst.).
//   - Riset di Lab: level drone, Perluas Camp, Pelatihan Cepat
//     (+10% kecepatan latih per level, maks 5) — masing-masing
//     butuh KT + waktu 3 jam × level target (keputusan owner
//     2026-11-26: riset lama "masih terlalu murah dan waktunya
//     masih sangat singkat"), satu riset sekali waktu.
export const CAMP_BASE_CAPACITY = 10;
export const CAMP_PER_RESEARCH = 5;
export const RESEARCH_MAX_LEVEL = 5;
export const TRAIN_BASE_SECONDS = 300; // 5 menit × level drone
export const RESEARCH_BASE_SECONDS = 10800; // 3 jam × level target (owner 2026-11-26)
const TROOP_POWER_BASE = 6; // kekuatan per drone: 6 + 4×level
const TROOP_POWER_PER_LEVEL = 4;

export type TroopKind = "attack" | "defense";

type TroopDef = {
  kind: TroopKind;
  name: string;
  nameEn: string;
  desc: string;
  descEn: string;
};

export const TROOP_DEFS: TroopDef[] = [
  {
    kind: "attack",
    name: "Drone Serbu",
    nameEn: "Assault Drone",
    desc: "Drone tempur untuk menyerang penambang lain — kekuatan serangmu adalah jumlah Drone Serbu × kekuatan per drone.",
    descEn: "Combat drone for attacking other miners — your attack power is your Assault Drone count × power per drone.",
  },
  {
    kind: "defense",
    name: "Drone Perisai",
    nameEn: "Shield Drone",
    desc: "Drone penjaga yang melindungi hasil tambangmu saat diserang — kekuatan bertahanmu adalah jumlah Drone Perisai × kekuatan per drone.",
    descEn: "Guard drone that protects your ore when attacked — your defense power is your Shield Drone count × power per drone.",
  },
];

function troopDef(kind: TroopKind): TroopDef {
  return TROOP_DEFS.find((d) => d.kind === kind) ?? TROOP_DEFS[0]!;
}

function troopName(def: TroopDef, lang: Lang): string {
  return lang === "en" ? def.nameEn : def.name;
}

/** Kapasitas camp: 10 + 5×level riset Perluas Camp (maks 35). */
export function campCapacity(campLevel: number): number {
  return (
    CAMP_BASE_CAPACITY +
    CAMP_PER_RESEARCH *
      Math.max(0, Math.min(RESEARCH_MAX_LEVEL, campLevel))
  );
}

/** Pengali kecepatan latih: 1 + 0,1×level riset Pelatihan Cepat. */
export function trainingSpeedMult(speedLevel: number): number {
  return (
    1 +
    0.1 * Math.max(0, Math.min(RESEARCH_MAX_LEVEL, speedLevel))
  );
}

/** Pengali kelebihan camp: 1 bila masih muat, 2 untuk drone pertama
 *  di atas batas, 3 untuk yang kedua, dst. */
export function overCapacityMult(
  totalTroops: number,
  capacity: number,
): number {
  return totalTroops >= capacity ? totalTroops - capacity + 2 : 1;
}

/** Biaya latih satu drone — 1 KT × level drone × pengali kelebihan. */
export function trainCostKt(totalTroops: number, capacity: number, level: number): number {
  return roundKt(
    TROOP_BASE_COST_KT * Math.max(1, level) * overCapacityMult(totalTroops, capacity),
  );
}

/** Waktu latih satu drone (detik): 5 menit × level drone ÷ kecepatan
 *  riset × pengali kelebihan, lantai 60 detik seperti bor. */
export function trainDurationSec(
  level: number,
  speedLevel: number,
  overMult: number,
): number {
  return Math.max(
    60,
    Math.round(
      ((TRAIN_BASE_SECONDS * Math.max(1, level)) /
        trainingSpeedMult(speedLevel)) *
        overMult,
    ),
  );
}

/** Biaya riset ke level target — 20 KT × level saat ini (ke Lv1 =
 *  20 KT, ke Lv2 = 20 KT, ke Lv3 = 40 KT, ke Lv4 = 60 KT, ke Lv5
 *  = 80 KT; keputusan owner 2026-11-26). */
export function researchCostKt(targetLevel: number): number {
  return roundKt(
    RESEARCH_BASE_COST_KT * Math.max(1, targetLevel - 1),
  );
}

/** Waktu riset (detik): 3 jam × level target. */
export function researchDurationSec(targetLevel: number): number {
  return RESEARCH_BASE_SECONDS * Math.max(1, targetLevel);
}

export type PvpTraining = { kind: TroopKind; endsAt: number; costKt: number };
/** Jenis riset Lab — "upgrade" = upgrade kapal (dulu beli instan
 *  di tab Hanggar; owner 2026-11-28: ikut aturan Lab, berwaktu,
 *  bukan instan). upgradeId = id upgrade (beliung/tangki/bor/
 *  ransel/negosiator/pemindai), null untuk riset pasukan. */
export type PvpResearchKind = "level" | "camp" | "speed" | "upgrade";
export type PvpResearch = {
  kind: PvpResearchKind;
  troopKind: TroopKind | null;
  upgradeId: string | null;
  targetLevel: number;
  endsAt: number;
  costKt: number;
};

/** Kekuatan satu jenis pasukan: jumlah drone × (6 + 4×level). */
export function troopPower(count: number, level: number): number {
  return count * (TROOP_POWER_BASE + TROOP_POWER_PER_LEVEL * Math.max(1, level));
}

/** Korban pasukan yang kalah: 20% ÷ level (Lv1 20%, Lv2 10%,
 *  Lv5 4%), minimal 1 bila punya pasukan — level tinggi lebih
 *  tahan hancur, jadi menaikkan level selalu sepadan. */
export function pvpCasualties(count: number, level: number): number {
  if (count <= 0) return 0;
  return Math.min(
    count,
    Math.max(1, Math.floor((count * 0.2) / Math.max(1, level))),
  );
}

// Perompak NPC — lawan cadangan bila tidak ada pemain lain yang
// layak diserang (jumlah pemain masih sedikit). Kekuatan bertahan
// 9: satu Drone Serbu level 1 (kekuatan 10) sudah bisa menang —
// perompak adalah lawan pemula, bukan tembok.
export const NPC_PIRATE_DEFENSE = 9;
// Harta Perompak (tetap): 15% per jenis, dibulatkan ke bawah →
// 3 Regolith + 2 Kondrit + 1 Besi-Nikel + 0 Kobalt ≈ 0,3 KT.
// Rampasan NPC adalah satu-satunya KT yang PvP "ciptakan" — faucet
// kecil, dibatasi cooldown serangan 30 menit + peluang pertemuan
// ≤30% (dan NPC hanya muncul bila tidak ada pemain layak diserang).
export const NPC_PIRATE_HAUL: Record<string, number> = {
  regolith: 20,
  kondrit: 14,
  besinikel: 7,
  kobalt: 4,
};

/** Penawaran pertemuan PvP yang tersimpan di player.pvp_encounter
 *  (JSON). defenderPlayerId null = Perompak NPC. */
export type PvpEncounter = {
  defenderPlayerId: number | null;
  defenderName: string | null;
  defensePower: number;
  expiresAt: number;
  zoneIndex: number;
};

function parseEncounter(raw: string | null): PvpEncounter | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PvpEncounter>;
    if (typeof v !== "object" || v === null) return null;
    if (typeof v.defensePower !== "number" || typeof v.expiresAt !== "number") return null;
    if (v.defenderPlayerId !== null && typeof v.defenderPlayerId !== "number") return null;
    return {
      defenderPlayerId: v.defenderPlayerId ?? null,
      defenderName: typeof v.defenderName === "string" ? v.defenderName : null,
      defensePower: v.defensePower,
      expiresAt: v.expiresAt,
      zoneIndex: typeof v.zoneIndex === "number" ? v.zoneIndex : 0,
    };
  } catch {
    return null;
  }
}

function pvpEncounterExpired(enc: PvpEncounter): boolean {
  return Date.now() >= enc.expiresAt;
}

/** Bentuk penawaran yang dikirim ke klien (tanpa id internal). */
function toClientEncounter(enc: PvpEncounter): {
  defenderName: string | null;
  isNpc: boolean;
  defensePower: number;
  expiresAt: string;
} {
  return {
    defenderName: enc.defenderName,
    isNpc: enc.defenderPlayerId === null,
    defensePower: enc.defensePower,
    expiresAt: new Date(enc.expiresAt).toISOString(),
  };
}

/** Antrean latih + riset tersimpan sebagai JSON di player (pola yang
 *  sama dengan job/expedition) — rusak/tidak lengkap = tidak ada. */
function parseTraining(raw: string | null | undefined): PvpTraining | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PvpTraining>;
    if (typeof v !== "object" || v === null) return null;
    if (v.kind !== "attack" && v.kind !== "defense") return null;
    if (typeof v.endsAt !== "number" || typeof v.costKt !== "number")
      return null;
    return { kind: v.kind, endsAt: v.endsAt, costKt: v.costKt };
  } catch {
    return null;
  }
}

function parseResearch(raw: string | null | undefined): PvpResearch | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PvpResearch>;
    if (typeof v !== "object" || v === null) return null;
    if (
      v.kind !== "level" &&
      v.kind !== "camp" &&
      v.kind !== "speed" &&
      v.kind !== "upgrade"
    )
      return null;
    if (v.kind === "upgrade" && typeof v.upgradeId !== "string") return null;
    if (
      v.troopKind !== null &&
      v.troopKind !== undefined &&
      v.troopKind !== "attack" &&
      v.troopKind !== "defense"
    )
      return null;
    if (
      typeof v.targetLevel !== "number" ||
      typeof v.endsAt !== "number" ||
      typeof v.costKt !== "number"
    )
      return null;
    return {
      kind: v.kind,
      troopKind: v.troopKind ?? null,
      upgradeId: v.upgradeId ?? null,
      targetLevel: v.targetLevel,
      endsAt: v.endsAt,
      costKt: v.costKt,
    };
  } catch {
    return null;
  }
}

/** Bentuk antrean yang dikirim ke klien (waktu ISO). */
function toClientTraining(t: PvpTraining): {
  kind: TroopKind;
  endsAt: string;
  costKt: number;
} {
  return {
    kind: t.kind,
    endsAt: new Date(t.endsAt).toISOString(),
    costKt: t.costKt,
  };
}

function toClientResearch(r: PvpResearch): {
  kind: PvpResearchKind;
  troopKind: TroopKind | null;
  upgradeId: string | null;
  targetLevel: number;
  endsAt: string;
  costKt: number;
} {
  return {
    kind: r.kind,
    troopKind: r.troopKind,
    upgradeId: r.upgradeId,
    targetLevel: r.targetLevel,
    endsAt: new Date(r.endsAt).toISOString(),
    costKt: r.costKt,
  };
}

export type TroopState = { count: number; level: number };

/** Memuat pasukan satu pemain (default: 0 drone, level 1). Tabel
 *  yang belum ada (migrasi 0010 belum jalan) = tidak ada pasukan —
 *  getGameState tidak boleh mati karena itu. */
async function loadTroops(
  db: Db,
  playerId: number,
): Promise<Record<TroopKind, TroopState>> {
  const out: Record<TroopKind, TroopState> = {
    attack: { count: 0, level: 1 },
    defense: { count: 0, level: 1 },
  };
  try {
    const rows = await db
      .select()
      .from(schema.pvpTroops)
      .where(eq(schema.pvpTroops.playerId, playerId));
    for (const r of rows) {
      if (r.kind === "attack" || r.kind === "defense") {
        out[r.kind] = { count: r.count, level: Math.max(1, r.level) };
      }
    }
  } catch {
    // Migrasi 0010 belum jalan — tidak ada pasukan, game tetap jalan.
  }
  return out;
}

type HaulItem = { oreId: string; qty: number };

/** Hasil tambang yang belum dijual (inventory) satu pemain. */
async function loadHaul(db: Db, playerId: number): Promise<HaulItem[]> {
  const rows = await db
    .select()
    .from(schema.inventory)
    .where(
      and(
        eq(schema.inventory.playerId, playerId),
        gte(schema.inventory.qty, 1),
      ),
    );
  return rows.map((r) => ({ oreId: r.oreId, qty: r.qty }));
}

/** Menggeser inventory satu jenis bijih (delta negatif menghapus
 *  baris bila habis). */
async function adjustInventory(
  db: Db,
  playerId: number,
  oreId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  if (delta > 0) {
    await db
      .insert(schema.inventory)
      .values({ playerId, oreId, qty: delta })
      .onConflictDoUpdate({
        target: [schema.inventory.playerId, schema.inventory.oreId],
        set: { qty: sql`${schema.inventory.qty} + ${delta}` },
      });
    return;
  }
  const rows = await db
    .select()
    .from(schema.inventory)
    .where(
      and(
        eq(schema.inventory.playerId, playerId),
        eq(schema.inventory.oreId, oreId),
      ),
    )
    .limit(1);
  const cur = rows[0]?.qty ?? 0;
  const next = cur + delta;
  if (next <= 0) {
    await db
      .delete(schema.inventory)
      .where(
        and(
          eq(schema.inventory.playerId, playerId),
          eq(schema.inventory.oreId, oreId),
        ),
      );
  } else {
    await db
      .update(schema.inventory)
      .set({ qty: next })
      .where(
        and(
          eq(schema.inventory.playerId, playerId),
          eq(schema.inventory.oreId, oreId),
        ),
      );
  }
}

/** Nilai KT (harga dasar) dari sederet unit bijih. */
function haulKtValue(haul: HaulItem[]): number {
  let v = 0;
  for (const h of haul) {
    const ore = oreById(h.oreId);
    if (ore) v += h.qty * ore.price;
  }
  return roundKt(v);
}

/** Ambil `pct` dari tiap jenis bijih (per jenis, dibulatkan ke
 *  bawah) — rampasan / kehancuran selalu per jenis, bukan total. */
function takeFromHaul(haul: HaulItem[], pct: number): HaulItem[] {
  return haul
    .map((h) => ({ oreId: h.oreId, qty: Math.floor(h.qty * pct) }))
    .filter((h) => h.qty > 0);
}

/** Cari satu pemain lain yang layak diserang: punya hasil tambang
 *  yang cukup (≥7 unit pada satu jenis bijih — 15%-nya baru jadi
 *  ≥1 unit rampasan), tidak kebal, dan bukan penyerang sendiri.
 *  Dipilih acak di antara paling banyak 50 kandidat. Mengembalikan
 *  null bila tidak ada yang layak — pemanggil memakai Perompak NPC
 *  sebagai cadangan. Diekspor untuk tes (deterministik). */
export async function findPvpDefender(
  db: Db,
  attackerId: number,
): Promise<{
  playerId: number;
  username: string | null;
  defensePower: number;
} | null> {
  const candidates = await db
    .select({ playerId: schema.inventory.playerId })
    .from(schema.inventory)
    .innerJoin(schema.player, eq(schema.player.id, schema.inventory.playerId))
    .where(
      and(
        gte(schema.inventory.qty, PVP_MIN_LOOT_QTY),
        sql`${schema.player.id} <> ${attackerId}`,
        sql`(${schema.player.pvpShieldUntil} IS NULL OR ${schema.player.pvpShieldUntil} < now())`,
      ),
    )
    .limit(50);
  const ids = [...new Set(candidates.map((c) => c.playerId))];
  if (ids.length === 0) return null;
  const picked = ids[Math.floor(Math.random() * ids.length)]!;
  const target = await loadPlayerRowOrNull(db, picked);
  if (!target) return null;
  const troops = await loadTroops(db, picked);
  return {
    playerId: picked,
    username: target.username,
    defensePower: troopPower(troops.defense.count, troops.defense.level),
  };
}

/** Lempar dadu pertemuan saat scan selesai (peta 1 = 0%, tidak
 *  pernah). Bila kena, cari lawan sungguhan; bila tidak ada,
 *  lawan adalah Perompak NPC. Penawaran disimpan di baris penyerang.
 *  `rand` bisa di-inject di tes supaya deterministik. */
export async function rollPvpEncounter(
  db: Db,
  attacker: PlayerRow,
  zoneIdx: number,
  rand: () => number = Math.random,
): Promise<PvpEncounter | null> {
  const chance = PVP_ENCOUNTER_CHANCE[zoneIdx] ?? 0;
  if (chance <= 0) return null;
  if (rand() >= chance) return null;
  const defender = await findPvpDefender(db, attacker.id);
  const enc: PvpEncounter = defender
    ? {
        defenderPlayerId: defender.playerId,
        defenderName: defender.username,
        defensePower: defender.defensePower,
        expiresAt: Date.now() + PVP_ENCOUNTER_EXPIRY_MS,
        zoneIndex: zoneIdx,
      }
    : {
        defenderPlayerId: null,
        defenderName: null,
        defensePower: NPC_PIRATE_DEFENSE,
        expiresAt: Date.now() + PVP_ENCOUNTER_EXPIRY_MS,
        zoneIndex: zoneIdx,
      };
  await db
    .update(schema.player)
    .set({ pvpEncounter: JSON.stringify(enc) })
    .where(eq(schema.player.id, attacker.id));
  return enc;
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
          /** Harga GRAM live dalam USD saat state diambil —
           *  klien menampilkannya di bawah tombol GRAM. */
          gramPriceUsd: z.number(),
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
        channelBonusClaimed: z.boolean(),
        channelBonusKt: z.number(),
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
          rewardEnergy: z.number(),
          dailyCap: z.number(),
          watchedToday: z.number(),
          remainingToday: z.number(),
          canWatch: z.boolean(),
          cooldownSeconds: z.number(),
          cooldownRemainingSec: z.number(),
        }),
        // Referral: statistik pengundang untuk tab Komunitas — berapa
        // teman yang bergabung lewat link-nya, berapa yang sudah
        // memberi hadiah, total KT yang sudah diterima, dan daftar
        // teman itu (nama + status pending/rewarded).
        referrals: z.object({
          invited: z.number(),
          rewarded: z.number(),
          earnedKt: z.number(),
          list: z.array(
            z.object({
              id: z.number(),
              name: z.string(),
              status: z.enum(["pending", "rewarded"]),
              joinedAt: z.string(),
            }),
          ),
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
          researchDurationSec: z.number().nullable(),
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
      // PvP (2026-11-22, Hangar/Lab 2026-11-25): pasukan + kekuatan +
      // camp + antrean latih/riset + perisai/cooldown + penawaran
      // pertemuan yang sedang aktif (null bila tidak ada).
      pvp: z.object({
        attackPower: z.number(),
        defensePower: z.number(),
        troops: z.object({
          attack: z.object({
            count: z.number(),
            level: z.number(),
            power: z.number(),
            trainCost: z.number(),
            trainDurationSec: z.number(),
            maxCount: z.number(),
            maxLevel: z.number(),
          }),
          defense: z.object({
            count: z.number(),
            level: z.number(),
            power: z.number(),
            trainCost: z.number(),
            trainDurationSec: z.number(),
            maxCount: z.number(),
            maxLevel: z.number(),
          }),
        }),
        camp: z.object({
          capacity: z.number(),
          used: z.number(),
          campLevel: z.number(),
          speedLevel: z.number(),
          maxResearchLevel: z.number(),
        }),
        researchCosts: z.object({
          levelAttack: z.number(),
          levelDefense: z.number(),
          camp: z.number(),
          speed: z.number(),
        }),
        researchBaseSec: z.number(),
        training: z
          .object({
            kind: z.enum(["attack", "defense"]),
            endsAt: z.string(),
            costKt: z.number(),
          })
          .nullable(),
        research: z
          .object({
            kind: z.enum(["level", "camp", "speed", "upgrade"]),
            troopKind: z.enum(["attack", "defense"]).nullable(),
            upgradeId: z.string().nullable(),
            targetLevel: z.number(),
            endsAt: z.string(),
            costKt: z.number(),
          })
          .nullable(),
        shieldUntil: z.string().nullable(),
        attackReadyAt: z.string().nullable(),
        encounter: z
          .object({
            defenderName: z.string().nullable(),
            isNpc: z.boolean(),
            defensePower: z.number(),
            expiresAt: z.string(),
          })
          .nullable(),
      }),
      // Ringkasan Kendali untuk admin (null untuk pemain biasa):
      // total USDT yang sudah dibayar ke semua pemain + statistik
      // pemain (2026-11-21): total baris pemain, aktif dalam 7 hari
      // terakhir (ada baris activity), tidak aktif, dan Premium
      // yang sedang berjalan.
      adminStats: z
        .object({
          totalWdPaidUsdt: z.number(),
          playerStats: z.object({
            total: z.number(),
            active7d: z.number(),
            inactive7d: z.number(),
            premiumActive: z.number(),
          }),
        })
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
      // PvP: pasukan + penawaran pertemuan (yang kedaluwarsa tidak
      // dikembalikan — pvpAttack tetap memvalidasi ulang).
      const troops = await loadTroops(db, p.id);
      const pvpEncounterRaw = parseEncounter(p.pvpEncounter);
      const pvpEncounter =
        pvpEncounterRaw && !pvpEncounterExpired(pvpEncounterRaw)
          ? pvpEncounterRaw
          : null;
      // Hangar/Lab: antrean latih + riset + kapasitas camp.
      const pvpTraining = parseTraining(p.training);
      const pvpResearch = parseResearch(p.research);
      const pvpCapacity = campCapacity(p.pvpCampLevel ?? 0);
      const pvpUsed = troops.attack.count + troops.defense.count;
      const pvpOverMult = overCapacityMult(pvpUsed, pvpCapacity);
      // Harga GRAM live (cache 5 menit di gram-price.ts) — harga
      // paket GRAM di bawah dihitung dari harga ini, jadi pemain
      // selalu melihat jumlah GRAM yang berlaku saat ini.
      const gramPriceUsd = await getGramPriceUsd();
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
      // Kendali: total USDT yang sudah dibayar ke SEMUA pemain +
      // statistik pemain (hanya untuk admin; pemain biasa mendapat
      // null).
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
            playerStats: await getPlayerStats(db),
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
            gramPriceUsd,
            plans: (Object.keys(PREMIUM_PLANS) as PremiumPlanId[]).map((id) => {
              // Harga GRAM live: target USD ÷ harga pasar, dibulatkan
              // KE ATAS (pemilik tidak pernah menerima di bawah target).
              const pricing = gramAmountForUsd(PREMIUM_PLAN_USD[id], gramPriceUsd);
              return {
                id,
                label: premiumPlanLabel(PREMIUM_PLANS[id], lang),
                days: PREMIUM_PLANS[id].days,
                stars: PREMIUM_PLANS[id].stars,
                gram: pricing.gram,
                gramNanoTon: pricing.gramNanoTon,
                tier: PREMIUM_PLANS[id].tier,
              };
            }),
          },
          totalDigs: p.totalDigs,
          totalScans: p.totalScans,
          asteroidsDone: p.asteroidsDone,
          totalKtEarned: p.totalKtEarned,
          totalWdPaidUsdt: p.totalWdPaidUsdt,
          canClaimDailyBonus: await canClaimDailyBonus(db, p.id),
          dailyBonusKt: DAILY_BONUS_KT,
          channelBonusClaimed: p.channelClaimedAt !== null,
          channelBonusKt: CHANNEL_BONUS_KT,
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
            rewardEnergy: AD_REWARD_ENERGY,
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
            researchDurationSec:
              level >= u.maxLevel ? null : researchDurationSec(level + 1),
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
        pvp: {
          attackPower: troopPower(troops.attack.count, troops.attack.level),
          defensePower: troopPower(troops.defense.count, troops.defense.level),
          troops: {
            attack: {
              count: troops.attack.count,
              level: troops.attack.level,
              power: troopPower(troops.attack.count, troops.attack.level),
              trainCost: trainCostKt(pvpUsed, pvpCapacity, troops.attack.level),
              trainDurationSec: trainDurationSec(
                troops.attack.level,
                p.pvpSpeedLevel ?? 0,
                pvpOverMult,
              ),
              maxCount: TROOP_MAX_COUNT,
              maxLevel: TROOP_MAX_LEVEL,
            },
            defense: {
              count: troops.defense.count,
              level: troops.defense.level,
              power: troopPower(troops.defense.count, troops.defense.level),
              trainCost: trainCostKt(pvpUsed, pvpCapacity, troops.defense.level),
              trainDurationSec: trainDurationSec(
                troops.defense.level,
                p.pvpSpeedLevel ?? 0,
                pvpOverMult,
              ),
              maxCount: TROOP_MAX_COUNT,
              maxLevel: TROOP_MAX_LEVEL,
            },
          },
          camp: {
            capacity: pvpCapacity,
            used: pvpUsed,
            campLevel: p.pvpCampLevel ?? 0,
            speedLevel: p.pvpSpeedLevel ?? 0,
            maxResearchLevel: RESEARCH_MAX_LEVEL,
          },
          researchCosts: {
            levelAttack: researchCostKt(troops.attack.level + 1),
            levelDefense: researchCostKt(troops.defense.level + 1),
            camp: researchCostKt((p.pvpCampLevel ?? 0) + 1),
            speed: researchCostKt((p.pvpSpeedLevel ?? 0) + 1),
          },
          researchBaseSec: RESEARCH_BASE_SECONDS,
          training: pvpTraining ? toClientTraining(pvpTraining) : null,
          research: pvpResearch ? toClientResearch(pvpResearch) : null,
          shieldUntil: p.pvpShieldUntil ? p.pvpShieldUntil.toISOString() : null,
          attackReadyAt:
            p.pvpLastAttackAt &&
            p.pvpLastAttackAt.getTime() + PVP_ATTACK_COOLDOWN_MS > now
              ? new Date(
                  p.pvpLastAttackAt.getTime() + PVP_ATTACK_COOLDOWN_MS,
                ).toISOString()
              : null,
          encounter: pvpEncounter ? toClientEncounter(pvpEncounter) : null,
        },
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
        // PvP: scan baru menghapus penawaran pertemuan lama (konteks
        // scan sebelumnya sudah tidak berlaku).
        .set({ ...spend, job: JSON.stringify(job), pvpEncounter: null })
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
      // PvP: penawaran pertemuan yang muncul saat scan ini selesai
      // (null bila tidak ada — Peta 1 selalu null, peluang per peta
      // 0/10/15/20/30%).
      encounter: z
        .object({
          defenderName: z.string().nullable(),
          isNpc: z.boolean(),
          defensePower: z.number(),
          expiresAt: z.string(),
        })
        .nullable(),
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
        jammed: false, hullHit: false, repairFeeKt: 0, encounter: null as { defenderName: string | null; isNpc: boolean; defensePower: number; expiresAt: string } | null,
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
        // PvP: scan selesai = peluang bertemu penambang lain (Peta 1
        // = 0%, tidak pernah; Peta 2–5 = 10/15/20/30%). Pertemuan
        // adalah kejadian sampingan — tidak menambah progres sektor
        // (sektor hanya naik di completeExpedition).
        const encounter = await rollPvpEncounter(
          db,
          p,
          expeditionZone(exp, p.currentZone),
        );
        return { ok: true, error: null, kind: "scan" as const, oreId: null, oreName: null, qty: 0, isRare: false, allMined: false, jammed: false, hullHit: false, repairFeeKt: 0, encounter: encounter ? toClientEncounter(encounter) : null };
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
          jammed: true, hullHit: false, repairFeeKt: 0, encounter: null,
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
        encounter: null,
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
          // PvP: ekspedisi selesai = asteroid baru; penawaran dari
          // scan lama tidak berlaku lagi.
          pvpEncounter: null,
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

  // --- PvP (2026-11-22) ----------------------------------------------
  // Lab: beli + upgrade pasukan pakai KT yang sama dengan saldo WD.
  startTraining: defineGameAction({
    description:
      "Starts training one troop drone in the Hangar (5 min × drone level, server-side, one queue). Cost: 0.1 KT flat in the test phase × the over-capacity multiplier (1 when the camp still has room, 2 for the first drone over capacity, 3 for the second, ...). The drone joins the camp when collected.",
    request: z.object({ kind: z.enum(["attack", "defense"]) }),
    response: resultShape.extend({
      training: z
        .object({
          kind: z.enum(["attack", "defense"]),
          endsAt: z.string(),
          costKt: z.number(),
        })
        .nullable(),
      ktBalance: z.number(),
    }),
    async handler(args, session) {
      const db = getDb();
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const def = troopDef(args.kind);
      const fail = (error: string) => ({
        ok: false,
        error,
        training: null as {
          kind: TroopKind;
          endsAt: string;
          costKt: number;
        } | null,
        ktBalance: p.ktBalance,
      });
      if (parseTraining(p.training)) return fail(S.errPvpTrainingBusy);
      const troops = await loadTroops(db, p.id);
      const cur = troops[args.kind];
      if (cur.count >= TROOP_MAX_COUNT)
        return fail(S.errPvpTroopMaxCount(troopName(def, lang)));
      const capacity = campCapacity(p.pvpCampLevel ?? 0);
      const used = troops.attack.count + troops.defense.count;
      const overMult = overCapacityMult(used, capacity);
      const cost = trainCostKt(used, capacity, cur.level);
      if (p.ktBalance < cost)
        return fail(S.errKtNotEnough(cost, p.ktBalance));
      const durationSec = trainDurationSec(
        cur.level,
        p.pvpSpeedLevel ?? 0,
        overMult,
      );
      const training: PvpTraining = {
        kind: args.kind,
        endsAt: Date.now() + durationSec * 1000,
        costKt: cost,
      };
      const newBalance = roundKt(p.ktBalance - cost);
      await db
        .update(schema.player)
        .set({ ktBalance: newBalance, training: JSON.stringify(training) })
        .where(eq(schema.player.id, p.id));
      await logActivity(
        db,
        p.id,
        "pvp_troop",
        S.logPvpTrainStart(troopName(def, lang)),
        -cost,
      );
      return {
        ok: true,
        error: null,
        training: toClientTraining(training),
        ktBalance: newBalance,
      };
    },
  }),

  collectTraining: defineGameAction({
    description:
      "Collects a finished training drone into the camp (count +1). Fails while the training timer is still running.",
    request: z.object({}),
    response: resultShape.extend({
      kind: z.enum(["attack", "defense"]).nullable(),
      count: z.number(),
      level: z.number(),
      power: z.number(),
      ktBalance: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const fail = (error: string) => ({
        ok: false,
        error,
        kind: null as TroopKind | null,
        count: 0,
        level: 1,
        power: 0,
        ktBalance: p.ktBalance,
      });
      const training = parseTraining(p.training);
      if (!training) return fail(S.errPvpNoTraining);
      if (Date.now() < training.endsAt)
        return fail(
          S.errPvpTrainingNotReady(
            Math.ceil((training.endsAt - Date.now()) / 1000),
          ),
        );
      const troops = await loadTroops(db, p.id);
      const cur = troops[training.kind];
      const def = troopDef(training.kind);
      const newCount = cur.count + 1;
      await db
        .insert(schema.pvpTroops)
        .values({
          playerId: p.id,
          kind: training.kind,
          count: newCount,
          level: cur.level,
        })
        .onConflictDoUpdate({
          target: [schema.pvpTroops.playerId, schema.pvpTroops.kind],
          set: { count: newCount },
        });
      await db
        .update(schema.player)
        .set({ training: null })
        .where(eq(schema.player.id, p.id));
      await logActivity(
        db,
        p.id,
        "pvp_troop",
        S.logPvpTrainDone(troopName(def, lang), newCount),
        null,
      );
      return {
        ok: true,
        error: null,
        kind: training.kind,
        count: newCount,
        level: cur.level,
        power: troopPower(newCount, cur.level),
        ktBalance: p.ktBalance,
      };
    },
  }),

  cancelTraining: defineGameAction({
    description:
      "Cancels the training in progress and refunds its KT cost in full.",
    request: z.object({}),
    response: resultShape.extend({
      ktBalance: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const fail = (error: string) => ({
        ok: false,
        error,
        ktBalance: p.ktBalance,
      });
      const training = parseTraining(p.training);
      if (!training) return fail(S.errPvpNoTraining);
      const def = troopDef(training.kind);
      const newBalance = roundKt(p.ktBalance + training.costKt);
      await db
        .update(schema.player)
        .set({ ktBalance: newBalance, training: null })
        .where(eq(schema.player.id, p.id));
      await logActivity(
        db,
        p.id,
        "pvp_troop",
        S.logPvpTrainCancel(troopName(def, lang)),
        training.costKt,
      );
      return { ok: true, error: null, ktBalance: newBalance };
    },
  }),

  startResearch: defineGameAction({
    description:
      "Starts one Lab research: a drone level (Serbu/Perisai +1), Expand Camp (+5 capacity), Fast Training (+10% training speed), or a ship upgrade (one level, at its usual KT cost). One research at a time, shared queue. Cost: troop research 20 KT × current level; ship upgrade = its upgrade price. Time: 3 h × target level. The effect applies when collected.",
    request: z.object({
      kind: z.enum(["level", "camp", "speed", "upgrade"]),
      troopKind: z.enum(["attack", "defense"]).nullable(),
      upgradeId: z.string().nullable().optional(),
    }),
    response: resultShape.extend({
      research: z
        .object({
          kind: z.enum(["level", "camp", "speed", "upgrade"]),
          troopKind: z.enum(["attack", "defense"]).nullable(),
          upgradeId: z.string().nullable(),
          targetLevel: z.number(),
          endsAt: z.string(),
          costKt: z.number(),
        })
        .nullable(),
      ktBalance: z.number(),
    }),
    async handler(args, session) {
      const db = getDb();
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const fail = (error: string) => ({
        ok: false,
        error,
        research: null as {
          kind: PvpResearchKind;
          troopKind: TroopKind | null;
          upgradeId: string | null;
          targetLevel: number;
          endsAt: string;
          costKt: number;
        } | null,
        ktBalance: p.ktBalance,
      });
      if (parseResearch(p.research)) return fail(S.errPvpResearchBusy);
      let targetLevel: number;
      let label: string;
      let cost: number;
      let upgradeId: string | null = null;
      if (args.kind === "level") {
        if (!args.troopKind) return fail(S.errPvpResearchInvalid);
        const troops = await loadTroops(db, p.id);
        const cur = troops[args.troopKind];
        if (cur.count === 0)
          return fail(S.errPvpTroopNone(troopName(troopDef(args.troopKind), lang)));
        if (cur.level >= TROOP_MAX_LEVEL)
          return fail(
            S.errPvpTroopMaxLevel(troopName(troopDef(args.troopKind), lang)),
          );
        targetLevel = cur.level + 1;
        label = troopName(troopDef(args.troopKind), lang);
        cost = researchCostKt(targetLevel);
      } else if (args.kind === "camp") {
        const cur = p.pvpCampLevel ?? 0;
        if (cur >= RESEARCH_MAX_LEVEL)
          return fail(S.errPvpResearchMax(S.pvpResearchCampName));
        targetLevel = cur + 1;
        label = S.pvpResearchCampName;
        cost = researchCostKt(targetLevel);
      } else if (args.kind === "speed") {
        const cur = p.pvpSpeedLevel ?? 0;
        if (cur >= RESEARCH_MAX_LEVEL)
          return fail(S.errPvpResearchMax(S.pvpResearchSpeedName));
        targetLevel = cur + 1;
        label = S.pvpResearchSpeedName;
        cost = researchCostKt(targetLevel);
      } else {
        // Riset upgrade kapal (owner 2026-11-28): biaya = harga
        // upgrade biasa (bukan tarif riset pasukan), waktu = 3 jam
        // × level target seperti riset lain.
        const def = args.upgradeId ? upgradeById(args.upgradeId) : undefined;
        if (!def) return fail(S.errUpgradeUnknown);
        const levels = await loadLevels(db, p.id);
        const cur = levels[def.id] ?? 0;
        if (cur >= def.maxLevel)
          return fail(S.errUpgradeMax(upgradeName(def, lang)));
        targetLevel = cur + 1;
        label = upgradeName(def, lang);
        cost = upgradeCost(def, cur);
        upgradeId = def.id;
      }
      if (p.ktBalance < cost)
        return fail(S.errKtNotEnough(cost, p.ktBalance));
      const durationSec = researchDurationSec(targetLevel);
      const research: PvpResearch = {
        kind: args.kind,
        troopKind: args.kind === "level" ? args.troopKind : null,
        upgradeId,
        targetLevel,
        endsAt: Date.now() + durationSec * 1000,
        costKt: cost,
      };
      const newBalance = roundKt(p.ktBalance - cost);
      await db
        .update(schema.player)
        .set({ ktBalance: newBalance, research: JSON.stringify(research) })
        .where(eq(schema.player.id, p.id));
      await logActivity(
        db,
        p.id,
        "pvp_troop",
        S.logPvpResearchStart(label, targetLevel),
        -cost,
      );
      return {
        ok: true,
        error: null,
        research: toClientResearch(research),
        ktBalance: newBalance,
      };
    },
  }),

  collectResearch: defineGameAction({
    description:
      "Collects a finished Lab research and applies its effect (drone level +1, camp capacity +5, training speed +10%, or one ship upgrade level).",
    request: z.object({}),
    response: resultShape.extend({
      kind: z.enum(["level", "camp", "speed", "upgrade"]).nullable(),
      troopKind: z.enum(["attack", "defense"]).nullable(),
      upgradeId: z.string().nullable(),
      targetLevel: z.number(),
      ktBalance: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const fail = (error: string) => ({
        ok: false,
        error,
        kind: null as PvpResearchKind | null,
        troopKind: null as TroopKind | null,
        upgradeId: null as string | null,
        targetLevel: 0,
        ktBalance: p.ktBalance,
      });
      const research = parseResearch(p.research);
      if (!research) return fail(S.errPvpNoResearch);
      if (Date.now() < research.endsAt)
        return fail(
          S.errPvpResearchNotReady(
            Math.ceil((research.endsAt - Date.now()) / 1000),
          ),
        );
      let label: string;
      if (research.kind === "level") {
        const kind = research.troopKind ?? "attack";
        await db
          .update(schema.pvpTroops)
          .set({ level: research.targetLevel })
          .where(
            and(
              eq(schema.pvpTroops.playerId, p.id),
              eq(schema.pvpTroops.kind, kind),
            ),
          );
        label = troopName(troopDef(kind), lang);
      } else if (research.kind === "camp") {
        await db
          .update(schema.player)
          .set({ pvpCampLevel: research.targetLevel })
          .where(eq(schema.player.id, p.id));
        label = S.pvpResearchCampName;
      } else if (research.kind === "speed") {
        await db
          .update(schema.player)
          .set({ pvpSpeedLevel: research.targetLevel })
          .where(eq(schema.player.id, p.id));
        label = S.pvpResearchSpeedName;
      } else {
        // Riset upgrade kapal: naikkan level upgrade satu tingkat
        // (upsert baris upgrades, sama seperti buyUpgrade dulu).
        const def = research.upgradeId
          ? upgradeById(research.upgradeId)
          : undefined;
        if (!def) return fail(S.errPvpResearchInvalid);
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
            .set({ level: research.targetLevel })
            .where(
              and(
                eq(schema.upgrades.playerId, p.id),
                eq(schema.upgrades.upgradeId, def.id),
              ),
            );
        } else {
          await db.insert(schema.upgrades).values({
            playerId: p.id,
            upgradeId: def.id,
            level: research.targetLevel,
          });
        }
        label = upgradeName(def, lang);
      }
      await db
        .update(schema.player)
        .set({ research: null })
        .where(eq(schema.player.id, p.id));
      await logActivity(
        db,
        p.id,
        "pvp_troop",
        S.logPvpResearchDone(label, research.targetLevel),
        null,
      );
      return {
        ok: true,
        error: null,
        kind: research.kind,
        troopKind: research.troopKind,
        upgradeId: research.upgradeId,
        targetLevel: research.targetLevel,
        ktBalance: p.ktBalance,
      };
    },
  }),

  cancelResearch: defineGameAction({
    description:
      "Cancels the research in progress and refunds its KT cost in full.",
    request: z.object({}),
    response: resultShape.extend({
      ktBalance: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const fail = (error: string) => ({
        ok: false,
        error,
        ktBalance: p.ktBalance,
      });
      const research = parseResearch(p.research);
      if (!research) return fail(S.errPvpNoResearch);
      const upgradeDef =
        research.kind === "upgrade" && research.upgradeId
          ? upgradeById(research.upgradeId)
          : undefined;
      const label =
        research.kind === "level"
          ? troopName(troopDef(research.troopKind ?? "attack"), lang)
          : research.kind === "camp"
            ? S.pvpResearchCampName
            : research.kind === "speed"
              ? S.pvpResearchSpeedName
              : upgradeDef
                ? upgradeName(upgradeDef, lang)
                : (research.upgradeId ?? "");
      const newBalance = roundKt(p.ktBalance + research.costKt);
      await db
        .update(schema.player)
        .set({ ktBalance: newBalance, research: null })
        .where(eq(schema.player.id, p.id));
      await logActivity(
        db,
        p.id,
        "pvp_troop",
        S.logPvpResearchCancel(label),
        research.costKt,
      );
      return { ok: true, error: null, ktBalance: newBalance };
    },
  }),

  pvpAttack: defineGameAction({
    description:
      "Attacks the miner from the current PvP encounter offer. DETERMINISTIC: higher power wins, a tie goes to the defender. The winner steals 15% of the loser's unsold ore (per ore type, rounded down); an attacker who loses destroys 10% of their own unsold ore. After the battle the defender is immune for 1 hour and the attacker cannot attack again for 30 minutes. Fighting never advances sector progress.",
    request: z.object({}),
    response: resultShape.extend({
      won: z.boolean(),
      attackerPower: z.number(),
      defenderPower: z.number(),
      defenderName: z.string().nullable(),
      isNpc: z.boolean(),
      loot: z.array(z.object({ oreId: z.string(), qty: z.number() })),
      lootKt: z.number(),
    }),
    async handler(_args, session) {
      const db = getDb();
      const lang = session.lang;
      const S = serverStrings(lang);
      const p = await loadPlayer(db, session);
      const fail = (error: string) => ({
        ok: false, error, won: false, attackerPower: 0, defenderPower: 0,
        defenderName: null as string | null, isNpc: false,
        loot: [] as { oreId: string; qty: number }[], lootKt: 0,
      });
      const enc = parseEncounter(p.pvpEncounter);
      if (!enc) return fail(S.errPvpNoEncounter);
      if (pvpEncounterExpired(enc)) {
        await db
          .update(schema.player)
          .set({ pvpEncounter: null })
          .where(eq(schema.player.id, p.id));
        return fail(S.errPvpEncounterExpired);
      }
      const now = new Date();
      if (
        p.pvpLastAttackAt &&
        p.pvpLastAttackAt.getTime() + PVP_ATTACK_COOLDOWN_MS > now.getTime()
      ) {
        const remainingSec = Math.ceil(
          (p.pvpLastAttackAt.getTime() + PVP_ATTACK_COOLDOWN_MS - now.getTime()) / 1000,
        );
        return fail(S.errPvpAttackCooldown(remainingSec));
      }
      // Kekuatan penyerang dari pasukannya sendiri (saat ini).
      const myTroops = await loadTroops(db, p.id);
      const attackerPower = troopPower(myTroops.attack.count, myTroops.attack.level);
      // Kekuatan bertahan lawan DIHITUNG ULANG dari pasukannya saat
      // ini (bisa berubah sejak penawaran dibuat); untuk NPC
      // nilainya tetap.
      let defenderPower = enc.defensePower;
      let defenderName = enc.defenderName;
      let defenderRow: PlayerRow | null = null;
      let defenderHaul: HaulItem[] = [];
      if (enc.defenderPlayerId !== null) {
        defenderRow = await loadPlayerRowOrNull(db, enc.defenderPlayerId);
        if (!defenderRow) {
          await db
            .update(schema.player)
            .set({ pvpEncounter: null })
            .where(eq(schema.player.id, p.id));
          return fail(S.errPvpDefenderGone);
        }
        if (
          defenderRow.pvpShieldUntil &&
          defenderRow.pvpShieldUntil.getTime() > now.getTime()
        ) {
          await db
            .update(schema.player)
            .set({ pvpEncounter: null })
            .where(eq(schema.player.id, p.id));
          return fail(S.errPvpDefenderShielded);
        }
        const defTroops = await loadTroops(db, defenderRow.id);
        defenderPower = troopPower(defTroops.defense.count, defTroops.defense.level);
        defenderName = defenderRow.username;
        defenderHaul = await loadHaul(db, defenderRow.id);
      } else {
        defenderHaul = Object.entries(NPC_PIRATE_HAUL).map(([oreId, qty]) => ({
          oreId,
          qty,
        }));
      }
      const isNpc = enc.defenderPlayerId === null;
      const defenderLabel = isNpc ? S.pvpPirate : (defenderName ?? S.pvpUnknownMiner);
      const attackerLabel = p.username ?? S.pvpUnknownMiner;
      // Pertempuran DETERMINISTIK: kekuatan lebih besar menang; seri
      // = bertahan menang (keuntungan kandang). Tanpa acak.
      const won = attackerPower > defenderPower;
      // Korban pasukan (2026-11-25): yang kalah kehilangan sebagian
      // drone jenis yang dipakainya — makin tinggi level, makin
      // sedikit yang gugur (20% ÷ level, minimal 1). NPC tidak
      // punya pasukan, jadi tidak ada korban di pihaknya. Dihitung
      // DI SINI (sebelum entri log pertempuran) supaya angka korban
      // bisa ditulis di entri si pemenang juga (2026-11-28: detail
      // log PvP); entri "gugur" si kalah sendiri tetap ditulis di
      // bawah, dalam bahasa si kalah.
      const loserId = won ? defenderRow?.id ?? null : p.id;
      const loserKind: TroopKind = won ? "defense" : "attack";
      let dead = 0;
      let deadLeft = 0;
      if (loserId !== null) {
        const loserTroops = await loadTroops(db, loserId);
        const cur = loserTroops[loserKind];
        dead = pvpCasualties(cur.count, cur.level);
        if (dead > 0) {
          deadLeft = cur.count - dead;
          await db
            .update(schema.pvpTroops)
            .set({ count: deadLeft })
            .where(
              and(
                eq(schema.pvpTroops.playerId, loserId),
                eq(schema.pvpTroops.kind, loserKind),
              ),
            );
        }
      }
      // Nama pasukan yang gugur, dalam bahasa entri log pertempuran
      // (bahasa penyerang) — "" bila tidak ada korban.
      const deadName = dead > 0 ? troopName(troopDef(loserKind), lang) : "";
      // Cooldown penyerang + perisai yang diserang mulai dari
      // sekarang (menang maupun kalah).
      await db
        .update(schema.player)
        .set({ pvpEncounter: null, pvpLastAttackAt: now })
        .where(eq(schema.player.id, p.id));
      if (defenderRow) {
        await db
          .update(schema.player)
          .set({ pvpShieldUntil: new Date(now.getTime() + PVP_SHIELD_MS) })
          .where(eq(schema.player.id, defenderRow.id));
      }
      let loot: HaulItem[] = [];
      let lootKt = 0;
      if (won) {
        loot = takeFromHaul(defenderHaul, PVP_STEAL_PCT);
        lootKt = haulKtValue(loot);
        if (defenderRow) {
          for (const item of loot) {
            await adjustInventory(db, defenderRow.id, item.oreId, -item.qty);
            await adjustInventory(db, p.id, item.oreId, item.qty);
          }
        } else {
          // NPC: rampasan "muncul" dari harta perompak (faucet kecil
          // — lihat komentar NPC_PIRATE_HAUL).
          for (const item of loot) {
            await adjustInventory(db, p.id, item.oreId, item.qty);
          }
        }
        await logActivity(
          db,
          p.id,
          "pvp_attack",
          loot.length > 0
            ? S.logPvpAttackWin(defenderLabel, lootKt, attackerPower, defenderPower, dead, deadName)
            : S.logPvpAttackWinEmpty(defenderLabel, attackerPower, defenderPower, dead, deadName),
          null,
        );
        if (loot.length > 0) {
          await logActivity(db, p.id, "pvp_loot", S.logPvpLootGain(lootKt), lootKt);
        }
        if (defenderRow) {
          await logActivity(
            db,
            defenderRow.id,
            "pvp_defend",
            loot.length > 0
              ? S.logPvpDefendedLose(attackerLabel, lootKt, attackerPower, defenderPower)
              : S.logPvpDefendedLoseEmpty(attackerLabel, attackerPower, defenderPower),
            null,
          );
          if (loot.length > 0) {
            await logActivity(db, defenderRow.id, "pvp_loot", S.logPvpLootStolen(lootKt), -lootKt);
          }
        }
      } else {
        // Penyerang kalah: 10% hasil tambangnya sendiri DIHANCURKAN
        // (bukan dipindah) — KT sink.
        const myHaul = await loadHaul(db, p.id);
        const destroyed = takeFromHaul(myHaul, PVP_LOSER_LOSS_PCT);
        const destroyedKt = haulKtValue(destroyed);
        for (const item of destroyed) {
          await adjustInventory(db, p.id, item.oreId, -item.qty);
        }
        await logActivity(
          db,
          p.id,
          "pvp_attack",
          S.logPvpAttackLose(defenderLabel, attackerPower, defenderPower),
          null,
        );
        if (destroyed.length > 0) {
          await logActivity(db, p.id, "pvp_loot", S.logPvpLootDestroyed(destroyedKt), -destroyedKt);
        }
        if (defenderRow) {
          await logActivity(
            db,
            defenderRow.id,
            "pvp_defend",
            S.logPvpDefendedWin(attackerLabel, attackerPower, defenderPower, dead, deadName),
            null,
          );
        }
      }
      // Entri "gugur" si kalah (dihitung di atas) — ditulis dalam
      // bahasa si kalah.
      if (dead > 0 && loserId !== null) {
        const loserLang = won
          ? normalizeLang(defenderRow?.language ?? "id")
          : lang;
        await logActivity(
          db,
          loserId,
          won ? "pvp_defend" : "pvp_attack",
          serverStrings(loserLang).logPvpTroopsLost(
            dead,
            troopName(troopDef(loserKind), loserLang),
            deadLeft,
          ),
          null,
        );
      }
      // Audit (tidak memengaruhi permainan): siapa vs siapa, siapa
      // menang, berapa kekuatan, berapa KT rampasan.
      try {
        await db.insert(schema.pvpBattles).values({
          attackerPlayerId: p.id,
          defenderPlayerId: enc.defenderPlayerId,
          isNpc,
          winner: won ? "attacker" : "defender",
          attackerPower,
          defenderPower,
          lootKt,
        });
      } catch {
        // Audit gagal tidak boleh merusak hasil pertempuran.
      }
      // Notifikasi Telegram ke pemain yang diserang (2026-11-28,
      // owner): seperti notifikasi WD — best-effort, dalam bahasa
      // si bertahan, gagal kirim tidak merusak hasil pertempuran.
      // NPC tidak punya Telegram, jadi tidak ada notifikasi.
      // Perisai 1 jam membatasi notifikasi ke paling banyak 1
      // per jam per pemain.
      if (defenderRow) {
        const defLang = normalizeLang(defenderRow.language ?? "id");
        const defStrings = serverStrings(defLang);
        const defDeadName = dead > 0 ? troopName(troopDef(loserKind), defLang) : "";
        const text = won
          ? loot.length > 0
            ? defStrings.pvpNotifyAttackedLose(attackerLabel, lootKt, attackerPower, defenderPower, dead, defDeadName)
            : defStrings.pvpNotifyAttackedLoseEmpty(attackerLabel, attackerPower, defenderPower, dead, defDeadName)
          : defStrings.pvpNotifyAttackedWin(attackerLabel, attackerPower, defenderPower, dead, defDeadName);
        await notifyPlayer(defenderRow.telegramId, text);
      }
      return {
        ok: true,
        error: null,
        won,
        attackerPower,
        defenderPower,
        defenderName,
        isNpc,
        loot,
        lootKt,
      };
    },
  }),

  pvpSkip: defineGameAction({
    description:
      "Skips the current PvP encounter offer (Lewati). The offer simply disappears — skipping never advances sector progress, and neither does fighting.",
    request: z.object({}),
    response: resultShape,
    async handler(_args, session) {
      const db = getDb();
      const p = await loadPlayer(db, session);
      await db
        .update(schema.player)
        .set({ pvpEncounter: null })
        .where(eq(schema.player.id, p.id));
      return { ok: true, error: null };
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
        // PvP: pindah asteroid menghapus penawaran pertemuan lama.
        .set({ ...spend, expedition: JSON.stringify(newExp), pvpEncounter: null })
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
        // PvP: pindah peta menghapus penawaran pertemuan lama.
        .set({ ...spend, currentZone: args.zoneIndex, expedition: JSON.stringify(newExp), pvpEncounter: null })
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
      "Creates a GRAM (TON) Premium Pass order for TON Connect payment (Standard $4.08 / 7 days, Pro $13.26 / 30 days with the dual drill — the GRAM amount is the USD target ÷ live GRAM price, rounded UP to 2 decimals, so the owner always receives the same USD value). Creates the pending premium_orders row (one pending order per player, method 'gram'), and returns the owner's public receiving wallet + the amount in nanoTON — the client opens the player's TON wallet (TON Connect) and sends ONE transaction to that address. The pass activates when the client reports the wallet's BOC and the server verifies the transaction on-chain (confirmGramPayment) against the amount quoted in this order. If the player is not inside Telegram (web/legacy), the wallet cannot be opened — the action fails with a note to open the game via the Mini App.",
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
      // gram pada jalur gagal: 0 — klien hanya membaca gram bila
      // ok; harga live dihitung di bawah, SETELAH cek gagal yang
      // murah (bukan Telegram / sudah ada pesanan pending), supaya
      // jalur gagal tidak membayar satu panggilan API harga.
      const fail = (error: string, gram = 0) => ({ ok: false, error, orderId: null as number | null, receiverAddress: null as string | null, amountNanoTon: null as string | null, gram });
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
      // Harga GRAM live saat pesanan dibuat — jumlah inilah yang
      // dikutip ke pemain, disimpan di gram_amount, dan dipakai
      // confirmGramPayment sebagai patokan (bukan harga live saat
      // konfirmasi — harga bisa bergerak di antaranya).
      const gramPriceUsd = await getGramPriceUsd();
      const pricing = gramAmountForUsd(PREMIUM_PLAN_USD[args.plan], gramPriceUsd);
      const inserted = await db
        .insert(schema.premiumOrders)
        .values({ playerId: p.id, plan: args.plan, stars: 0, days: plan.days, tier: plan.tier, status: "pending", method: "gram", gramAmount: pricing.gram })
        .returning({ id: schema.premiumOrders.id });
      const row = inserted[0];
      if (!row) return fail(S.errGramOrderFail, pricing.gram);
      await logActivity(db, p.id, "premium_order", S.logPremiumOrderGram(premiumPlanLabel(plan, lang), pricing.gram), null);
      return { ok: true, error: null, orderId: row.id, receiverAddress: GRAM_RECEIVER_ADDRESS, amountNanoTon: String(pricing.gramNanoTon), gram: pricing.gram };
    },
  }),

  confirmGramPayment: defineGameAction({
    description:
      "Confirms a GRAM (TON) Premium payment after the player's wallet approved the transaction (TON Connect sendTransaction returned a BOC). The client sends the message hash derived from that BOC plus its connected wallet address; the server looks the transaction up on-chain via tonapi (api/_lib/ton.ts) and checks destination = owner's wallet, sender = connected wallet, amount >= the amount quoted when the order was created (stored gram_amount — NOT the live price at confirmation time, since the GRAM price can move between order creation and confirmation), and the tx hash never used before. On success the order is claimed atomically (pending→paid) and Premium activates with the same extension rule as Stars. If the tx is not indexed yet the call fails with retryable=true so the client retries for a few seconds; wrong recipient/amount/sender or a reused tx hash fail permanently (retryable=false).",
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
      // Jumlah patokan adalah jumlah yang DIKUTIP saat pesanan
      // dibuat (kolom gram_amount) — BUKAN harga live saat ini:
      // harga GRAM bisa bergerak antara pembuatan pesanan dan
      // konfirmasi, dan pemain yang membayar jumlah yang dikutip
      // tidak boleh gagal karena harganya bergerak. Fallback untuk
      // pesanan lama tanpa gram_amount: target USD ÷ $1,02.
      const quotedGram =
        order.gramAmount ??
        gramAmountForUsd(
          PREMIUM_PLAN_USD[order.plan as PremiumPlanId],
          GRAM_FALLBACK_PRICE_USD,
        ).gram;
      // Verifikasi on-chain (tonapi, dengan retry internal ±8 detik
      // karena transaksi butuh satu blok untuk terindeks).
      const checked = await verifyGramTransaction({
        msgHash: args.msgHash,
        senderAddress: args.senderAddress,
        expectedNanoTon: String(gramToNanoTon(quotedGram)),
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

  claimChannelBonus: defineGameAction({
    description:
      "Claims the one-time +5 KT channel-join bonus. The server verifies membership of @astra_mining_gram via the Bot API (getChatMember) using the player's validated Telegram id — the client cannot fake it. If the check fails (bot not yet an admin of the channel, network, token), the claim is rejected WITHOUT marking it claimed, so the player can retry after the owner fixes it. The credit itself is atomic (UPDATE ... WHERE channel_claimed_at IS NULL) so a double-tap or race can never pay twice.",
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
      if (session.telegramId === null) {
        return {
          ok: false,
          error: S.errChannelNoTelegram,
          bonusKt: 0,
          ktBalance: 0,
        };
      }
      const p = await loadPlayer(db, session);
      const fail = (error: string) => ({
        ok: false as const,
        error,
        bonusKt: 0,
        ktBalance: p.ktBalance,
      });
      if (p.channelClaimedAt !== null) {
        return fail(S.errChannelAlreadyClaimed);
      }
      // Verifikasi keanggotaan lewat Bot API — identitas dari initData
      // tervalidasi, bukan dari kiriman klien.
      const member = await callBotApi<{ status?: string }>("getChatMember", {
        chat_id: CHANNEL_CHAT_ID,
        user_id: session.telegramId,
      });
      if (member.ok === false) {
        // Bot belum admin channel / jaringan / token: JANGAN tandai
        // klaim — pemain bisa mencoba lagi setelah pemilik memperbaiki.
        return fail(S.errChannelCheckFailed);
      }
      const status = member.data?.status;
      if (typeof status !== "string" || !CHANNEL_MEMBER_STATUSES.includes(status)) {
        return fail(S.errChannelNotJoined);
      }
      // Kredit atomik: hanya baris yang belum klaim yang berubah —
      // ketukan ganda / balapan tidak pernah membayar dua kali.
      const claimed = await db
        .update(schema.player)
        .set({
          ktBalance: roundKt(p.ktBalance + CHANNEL_BONUS_KT),
          totalKtEarned: roundKt(p.totalKtEarned + CHANNEL_BONUS_KT),
          channelClaimedAt: new Date(),
        })
        .where(
          and(
            eq(schema.player.id, p.id),
            isNull(schema.player.channelClaimedAt),
          ),
        )
        .returning({ id: schema.player.id });
      if (!claimed[0]) {
        return fail(S.errChannelAlreadyClaimed);
      }
      await logActivity(db, p.id, "channel_bonus", S.logChannelBonus(CHANNEL_BONUS_KT), CHANNEL_BONUS_KT);
      return {
        ok: true,
        error: null,
        bonusKt: CHANNEL_BONUS_KT,
        ktBalance: roundKt(p.ktBalance + CHANNEL_BONUS_KT),
      };
    },
  }),

  watchAd: defineGameAction({
    description:
      "Claims the sponsored-ad reward: credits AD_REWARD_ENERGY (5) Ship Energy for one ad view — NOT KT (owner 2026-11-24). Fully server-validated (anti-cheat): the daily cap of 10 views per calendar day and the 5-minute cooldown between views are recomputed here from the ad_reward activity history in the database — a tampered client cannot exceed the cap, skip the cooldown, or change the reward amount. The credit is capped at maxEnergy (a full tank gets 0); the response reports the ACTUAL credited amount. This is the placeholder slot where the owner will plug in a real ad provider later; the reward logic stays identical.",
    request: z.object({}),
    response: resultShape.extend({
      rewardEnergy: z.number(),
      energy: z.number(),
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
        rewardEnergy: 0,
        energy: p.energy,
        ktBalance: p.ktBalance,
        watchedToday: stats.watchedToday,
        remainingToday: stats.remainingToday,
        cooldownRemainingSec: stats.cooldownRemainingSec,
      });
      if (stats.remainingToday <= 0)
        return fail(S.errAdCapReached(AD_DAILY_CAP));
      if (stats.cooldownRemainingSec > 0)
        return fail(S.errAdCooldown(stats.cooldownRemainingSec, AD_COOLDOWN_SECONDS));
      // loadPlayer already applied pending regen; credit +5 Daya,
      // capped at maxEnergy (Tangki O2 raises the cap). The actual
      // credited amount is reported — a full tank gets 0.
      const levels = await loadLevels(db, p.id);
      const cap = maxEnergy(levels);
      const credited = Math.min(AD_REWARD_ENERGY, Math.max(0, cap - p.energy));
      const newEnergy = p.energy + credited;
      await db
        .update(schema.player)
        .set({
          energy: newEnergy,
          energyUpdatedAt: newEnergy >= cap ? new Date() : p.energyUpdatedAt,
        })
        .where(eq(schema.player.id, p.id));
      await logActivity(db, p.id, "ad_reward", S.logAd(credited), null);
      return {
        ok: true,
        error: null,
        rewardEnergy: credited,
        energy: newEnergy,
        ktBalance: p.ktBalance,
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


  requestWithdrawal: defineGameAction({
    description:
      "Creates a withdrawal request: locks the KT and puts the request in the owner's manual payout queue with the player's USDT wallet address. The wallet address must be a TON address (48-char EQ/UQ friendly format or 0:+64hex raw) — USDT is only paid on the TON network; other networks are rejected (owner 2026-11-25). Anti-cheat: the amount arrives in KT and is fully re-validated server-side — it must be a multiple of 100 KT (0,1 USDT steps), must meet the two-tier minimum computed here from the player's paid-WD history (first WD: 100 KT, repeat WDs: 5.000 KT flat), and must not exceed the per-WD maximum of 5.000 KT (5 USDT). There is NO time limit between WDs — the cooldown was removed 2026-11-19 on the owner's instruction; how fast a player can WD depends only on how fast they accumulate KT. The client cannot lower the minimum or raise the maximum.",
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
      // Alamat HARUS TON (owner 2026-11-25): USDT hanya dibayar
      // lewat jaringan TON — alamat jaringan lain tidak bisa dibayar.
      if (!isTonAddress(args.walletAddress))
        return fail(S.errWalletNotTon);
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
      // Bahasa PENERIMA WD (player.language, disimpan dari request
      // terakhirnya) — dipakai notifikasi approve + pay, bukan
      // bahasa admin yang memproses WD ini.
      const targetLang = normalizeLang(target.language);
      const T = serverStrings(targetLang);

      if (args.action === "approve") {
        if (wd.status !== "pending")
          return { ok: false, error: S.errWdApproveNotPending, status: wd.status };
        await db
          .update(schema.wdRequests)
          .set({ status: "approved", adminNote: args.adminNote ?? wd.adminNote })
          .where(eq(schema.wdRequests.id, wd.id));
        await logActivity(db, wd.playerId, "wd_approve", S.logWdApprove(wd.id, wd.amountUsdt), null);
        // Notifikasi Telegram ke pemain (best-effort — gagal kirim
        // tidak menggagalkan approve).
        await notifyPlayer(
          target.telegramId,
          T.wdNotifyApproved(wd.amountUsdt),
        );
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
        // Notifikasi Telegram ke pemain (best-effort — gagal kirim
        // tidak menggagalkan penandaan dibayar). Bahasa = bahasa
        // PENERIMA, seperti di approve.
        await notifyPlayer(
          target.telegramId,
          T.wdNotifyPaid(wd.amountUsdt),
        );
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

  sendBroadcast: defineGameAction({
    description:
      "Admin action for the owner (Kendali tab): sends one Telegram message to every player who opened the game via Telegram. Sends sequentially with a ~50ms gap; a player who blocked the bot (Telegram 403) is counted as failed, never crashes the run. Returns sent/failed counts. No new env vars — BOT_TOKEN already in Vercel.",
    request: z.object({ text: z.string().trim().min(1).max(4000) }),
    response: resultShape.extend({
      sent: z.number(),
      failed: z.number(),
    }),
    async handler(args) {
      const db = getDb();
      const rows = await db
        .select({ telegramId: schema.player.telegramId })
        .from(schema.player)
        .where(isNotNull(schema.player.telegramId));
      let sent = 0;
      let failed = 0;
      for (const r of rows) {
        // sendTelegramMessage tidak pernah throw (false bila gagal),
        // tapi tetap dibungkus: satu pemain tidak boleh merusak
        // pengiriman ke pemain lain.
        let ok = false;
        try {
          ok = await sendTelegramMessage({
            chatId: r.telegramId as number,
            text: args.text,
          });
        } catch {
          ok = false;
        }
        if (ok) sent++;
        else failed++;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return { ok: true, error: null, sent, failed };
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
    "sendBroadcast",
  ]);
  if (ADMIN_ACTIONS.has(action) && !resolved.session.isAdmin) {
    return { ok: false, error: serverStrings(resolved.session.lang).errAdminOnly };
  }
  const args = entry.request.parse(input ?? {});
  return entry.handler(args as never, resolved.session);
}
