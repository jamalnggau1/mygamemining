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
//     - Standard (150 Stars / 7 hari): energy regen twice as fast,
//       scan & mining 25% faster, sell prices +15%, map travel free.
//     - Pro (500 Stars / 30 hari): everything in Standard PLUS the
//       dual drill — two drill arms work the vein at once, halving
//       mining time.
//   Purchase flow mirrors the manual WD model: the player creates an
//   order in-game, pays Stars to the owner in Telegram, and the owner
//   confirms the order from the Kendali tab, which activates the pass.
//   The owner can also grant a tier directly (grantPremium) after any
//   off-platform payment. Premium never changes the KT→GRAM ratio or
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
//   back out of circulation, and the free
//   daily faucet was cut 150 → 50 → 25 KT so passive income alone
//   needs 20 days to reach even the first 500 KT withdrawal.
//
// Economy (fixed by the owner):
//   Coin A = Kredit Tambang Antariksa (KT), earned by selling space-mined minerals.
//   1000 KT = 1 GRAM. The minimum withdrawal ESCALATES with every WD the
//   owner has actually PAID: the first paid WD only needs 500 KT
//   (0,5 GRAM) so new players reach their first payout quickly, then the
//   minimum climbs 1.000 → 2.000 → 3.000 → 5.000 → 10.000 KT. Amounts
//   move in 500 KT (0,5 GRAM) steps. The minimum is computed HERE from
//   the paid-WD history in the database — the client can display it but
//   can never lower it.
//   Withdrawals are paid MANUALLY by the owner — a request deducts and
//   locks the KT, lands in the admin queue, and is marked paid only
//   after the owner sends the GRAM outside the game. Rejection or
//   cancellation refunds the locked KT in full.
//
// Anti-cheat (owner requirement — never trust the frontend):
//   EVERY number that matters is computed in this file from the Neon database:
//   balances, energy, job start/end timestamps and durations, challenge
//   rolls (decided when a job starts, hidden until collect), sell
//   prices, upgrade costs, the escalating WD minimum and the locked KT
//   amount. Actions accept only intents and small validated inputs
//   (a vein index, an ore id + quantity, a wallet string, a KT amount
//   that is re-checked against the server-computed minimum and the
//   server-side balance). A tampered client can at most ask politely;
//   it cannot mint KT, shorten a job, or withdraw below the minimum.
//
// Economy rebalance #2 (2026-11-18, owner asked whether the economy
// still leaks — it did):
//   The previous pass only slowed energy regen; at ~370 KT per tank on
//   Map 1 a casual player still reached 1 GRAM in under a day, and one
//   Map 5 tank paid out more than 1 GRAM by itself. This pass attacks
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
// Sponsored ads (owner monetization slot):
//   A "Tonton Iklan" button pays AD_REWARD_KT (15 KT) per view — the
//   slot where the owner plugs in a real ad provider later. The
//   reward is capped server-side: at most AD_DAILY_CAP (10) views per
//   calendar day (= 150 KT/day max, deliberately below one Map 1 tank
//   so ads supplement mining instead of replacing it) and a
//   AD_COOLDOWN_SECONDS (60s) gap between views, both recomputed in
//   watchAd from the ad_reward rows in the activity log. No new table
//   or migration: the activity log IS the claim history, and ad_reward
//   classifies as an economy event in the split log.

import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import * as schema from "../../deploy/neon/schema.pg";
import { getDb, type Db } from "./store";

// ---------------------------------------------------------------------------
// Game design constants
// ---------------------------------------------------------------------------

const KT_PER_GRAM = 1000;
const DAILY_BONUS_KT = 25;
const AD_REWARD_KT = 15;
const AD_DAILY_CAP = 10;
const AD_COOLDOWN_SECONDS = 60;
const BASE_MAX_ENERGY = 30;
const BASE_REGEN_SECONDS = 240; // 1 energy per 4 minutes — deliberately slow (see economy note above)
const REGEN_MIN_SECONDS = 60; // hard floor for the Reaktor upgrade curve (pre-Premium)
const SCAN_ENERGY_COST = 5;
const ABANDON_ENERGY_COST = 2;
const BASE_SCAN_SECONDS = 150; // base scan is deliberately slow (2,5 menit) — the Spektrometer upgrade is what speeds it up
const TRAVEL_ENERGY_COST = 4; // base hop to the nearest map; +2 per extra map step (distance)

// Escalating WD minimum (anti-leak + anti-cheat): indexed by how many
// WDs the owner has already PAID this player. First WD is cheap
// (500 KT = 0,5 GRAM) so newcomers get a taste; every paid WD raises
// the floor for the next one. WD amounts move in 500 KT steps.
const WD_STEP_KT = 500;
const WD_MIN_TIERS_KT = [500, 1000, 2000, 3000, 5000, 10000];
function wdMinKtForPaidCount(paidCount: number): number {
  const idx = Math.min(Math.max(paidCount, 0), WD_MIN_TIERS_KT.length - 1);
  return WD_MIN_TIERS_KT[idx] ?? 10000;
}

// Premium Pass plans — priced in Telegram Stars (paid to the owner in
// Telegram; the owner confirms the order in the Kendali tab).
const PREMIUM_PLANS = {
  standard: { days: 7, stars: 150, tier: "standard" as const, label: "Standard · 7 hari" },
  pro: { days: 30, stars: 500, tier: "pro" as const, label: "Pro · 30 hari" },
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
  price: number; // base KT per unit
  color: string;
  icon: string; // client-side SVG icon id (matches the ore id)
  hardness: number; // 1 (soft regolith) .. 4 (helium-3 crystal lattice)
  // Drop weight per zone index (0..4). Index order matches ORES.
  weights: number[];
};

const ORES: OreDef[] = [
  { id: "regolith", name: "Regolith Asteroid", price: 2, color: "#9a9186", icon: "regolith", hardness: 1, weights: [34, 20, 12, 8, 5] },
  { id: "kondrit", name: "Kondrit Karbon", price: 6, color: "#4b4f5e", icon: "kondrit", hardness: 1, weights: [26, 34, 18, 10, 6] },
  { id: "besinikel", name: "Besi-Nikel", price: 14, color: "#c97a3a", icon: "besinikel", hardness: 2, weights: [14, 16, 28, 15, 9] },
  { id: "kobalt", name: "Kobalt Antariksa", price: 30, color: "#5b8cff", icon: "kobalt", hardness: 2, weights: [8, 8, 17, 17, 11] },
  { id: "platinum", name: "Platinum", price: 66, color: "#e6ebf2", icon: "platinum", hardness: 3, weights: [4, 3, 8, 18, 15] },
  { id: "iridium", name: "Iridium", price: 144, color: "#f2b705", icon: "iridium", hardness: 3, weights: [2, 1, 4, 12, 18] },
  { id: "helium3", name: "Kristal Helium-3", price: 360, color: "#6ee7ff", icon: "helium3", hardness: 4, weights: [0, 0, 1, 3, 9] },
  // Batu mulia khas tiap peta — dua permata unggulan per map, hanya
  // muncul di map-nya (weight di zone lain 0).
  { id: "opal", name: "Opal Pelangi", price: 39, color: "#f9a8d4", icon: "opal", hardness: 2, weights: [7, 0, 0, 0, 0] },
  { id: "topaz", name: "Topaz Emas", price: 51, color: "#fbbf24", icon: "topaz", hardness: 2, weights: [5, 0, 0, 0, 0] },
  { id: "turkuois", name: "Turkuois Orbit", price: 78, color: "#2dd4bf", icon: "turkuois", hardness: 2, weights: [0, 6, 0, 0, 0] },
  { id: "ametis", name: "Ametis Sabuk", price: 105, color: "#a78bfa", icon: "ametis", hardness: 3, weights: [0, 4, 0, 0, 0] },
  { id: "zamrud", name: "Zamrud Bulan", price: 192, color: "#34d399", icon: "zamrud", hardness: 3, weights: [0, 0, 5, 0, 0] },
  { id: "rubi", name: "Rubi Mare", price: 252, color: "#f87171", icon: "rubi", hardness: 3, weights: [0, 0, 3, 0, 0] },
  { id: "safir", name: "Safir Bintang", price: 420, color: "#60a5fa", icon: "safir", hardness: 4, weights: [0, 0, 0, 5, 0] },
  { id: "berlian", name: "Berlian Psyche", price: 570, color: "#f8fafc", icon: "berlian", hardness: 4, weights: [0, 0, 0, 3, 0] },
  { id: "opales", name: "Opal Es Hitam", price: 900, color: "#c084fc", icon: "opales", hardness: 4, weights: [0, 0, 0, 0, 4] },
  { id: "voidium", name: "Kristal Voidium", price: 1440, color: "#818cf8", icon: "voidium", hardness: 4, weights: [0, 0, 0, 0, 2] },
];
const RARE_IDS = new Set([
  "platinum", "iridium", "helium3",
  "zamrud", "rubi", "safir", "berlian", "opales", "voidium",
]);

type MapDef = {
  name: string;
  tagline: string;
  desc: string;
  minLayer: number; // sector needed to unlock this map
  image: string; // client asset key
  distanceLabel: string; // how far this map is from Earth — farther = slower ops
  // Challenge profile — map 1 is the gentle starter, map 5 the endgame.
  jamChance: number; // 0..1 — drill jams mid-job: vein lost, energy lost
  damageChance: number; // 0..1 — hull hit while mining: repair fee in KT
  damageFeeKt: number; // repair fee per hull hit (capped at KT balance)
  radiation: number; // extra energy drained by every scan & mining job
  timeFactor: number; // multiplies scan & mining durations — grows with distance
  veinCount: [number, number]; // min/max veins per asteroid
};

const MAPS: MapDef[] = [
  {
    name: "Orbit Rendah — Pos Tambang LEO",
    tagline: "Peta pemula · aman & ramah",
    desc: "Asteroid kecil dekat Bumi, jauh dari bahaya. Regolith dan kondrit karbon mendominasi, dengan kilau Opal Pelangi dan Topaz Emas di sela batuan. Tempat belajar terbaik untuk penambang baru.",
    minLayer: 1,
    image: "hero",
    distanceLabel: "±0,01 SA dari Bumi — halaman belakang stasiun",
    jamChance: 0,
    damageChance: 0,
    damageFeeKt: 0,
    radiation: 0,
    timeFactor: 1,
    veinCount: [3, 4],
  },
  {
    name: "Sabuk Asteroid Utama",
    tagline: "Peta menengah · serpihan beterbangan",
    desc: "Di antara Mars dan Jupiter, jutaan serpihan batu beterbangan. Kondrit melimpah, besi-nikel mulai muncul dari inti asteroid purba — dan Turkuois Orbit serta Ametis Sabuk bersembunyi di kawah-kawah tua. Serpihan kadang menyumbat mata bor.",
    minLayer: 3,
    image: "asteroid",
    distanceLabel: "±2,8 SA dari Bumi — di antara Mars dan Jupiter",
    jamChance: 0.06,
    damageChance: 0,
    damageFeeKt: 0,
    radiation: 0,
    timeFactor: 1.3,
    veinCount: [3, 5],
  },
  {
    name: "Permukaan Bulan — Mare Tenang",
    tagline: "Peta lanjutan · radiasi & debu tajam",
    desc: "Regolith bulan yang keras dan berdebu tajam. Besi-nikel dan kobalt jadi buruan utama, Zamrud Bulan berkilau hijau dari singkapan batuan, dan Rubi Mare yang langka menunggu penambang tekun. Radiasi permukaan menguras daya setiap operasi, dan debu bulan sesekali membuat bor macet.",
    minLayer: 6,
    image: "moon",
    distanceLabel: "384 ribu km dari Bumi — tetangga terdekat, batuan kerasnya yang bikin lama",
    jamChance: 0.08,
    damageChance: 0.05,
    damageFeeKt: 60,
    radiation: 1,
    timeFactor: 1.6,
    veinCount: [4, 5],
  },
  {
    name: "Asteroid Logam 16 Psyche",
    tagline: "Peta sulit · inti logam raksasa",
    desc: "Asteroid raksasa yang hampir seluruhnya logam padat. Platinum dan iridium jauh lebih sering terlihat, Safir Bintang dan Berlian Psyche tertanam di inti besinya. Batuan sekeras ini membuat bor sering macet, dan serpihan logam tajam bisa merobek lambung kapal — siapkan KT untuk biaya perbaikan.",
    minLayer: 10,
    image: "psyche",
    distanceLabel: "±3,3 SA dari Bumi — jauh di sabuk utama luar",
    jamChance: 0.12,
    damageChance: 0.1,
    damageFeeKt: 150,
    radiation: 1,
    timeFactor: 2,
    veinCount: [4, 6],
  },
  {
    name: "Sabuk Kuiper — Inti Es Antariksa",
    tagline: "Peta tersulit · ujung tata surya",
    desc: "Ujung tata surya: gelap, membeku, dan bermandikan radiasi kosmik. Iridium dan kristal Helium-3 menunggu di sini, bersama Opal Es Hitam dan Kristal Voidium — permata termahal yang dikenal stasiun. Bor membeku dan macet, lambung kapal rapuh diterpa puing es, dan setiap operasi menguras daya jauh lebih besar. Hanya penambang paling sabar yang pulang kaya dari sini.",
    minLayer: 15,
    image: "kuiper",
    distanceLabel: "±40 SA dari Bumi — ujung tata surya, sinyal saja butuh berjam-jam",
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
  desc: string;
  baseCost: number;
  growth: number;
  maxLevel: number;
};

const UPGRADES: UpgradeDef[] = [
  { id: "beliung", name: "Lengan Bor Laser", desc: "Pengeboran setiap urat mineral 6% lebih cepat per level — mata bor laser memotong batuan lebih efisien.", baseCost: 150, growth: 1.6, maxLevel: 10 },
  { id: "tangki", name: "Tangki O₂ & Baterai Surya", desc: "KAPASITAS daya: +6 daya maksimum per level (30 → 90). Tangki O₂ yang lebih besar memperpanjang napas misi di permukaan, dan baterai surya menyimpan cadangan daya lebih banyak — jadi kamu bisa menjalankan lebih banyak scan & bor dalam satu sesi, dan daya yang terisi saat kamu tidak bermain tidak terbuang karena tangki cepat penuh. Upgrade ini TIDAK mempercepat isi ulang; kecepatan isi ulang diatur Reaktor Fusi Mini.", baseCost: 120, growth: 1.6, maxLevel: 10 },
  { id: "bor", name: "Reaktor Fusi Mini", desc: "KECEPATAN isi ulang daya: waktu isi ulang berkurang 10% per level — dari 4 menit per daya di level 0 menjadi sekitar 1 menit 24 detik per daya di level 10. Inilah upgrade yang membuat daya kapal pulih lebih cepat; tanpa upgrade ini isi ulang sengaja dibuat lambat.", baseCost: 200, growth: 1.7, maxLevel: 10 },
  { id: "ransel", name: "Drone Kargo Otomatis", desc: "+7% peluang hasil ganda saat mengambil hasil tambang (drone mengangkut 2× lipat) per level.", baseCost: 180, growth: 1.6, maxLevel: 10 },
  { id: "negosiator", name: "Negosiator Stasiun Orbital", desc: "+5% harga jual semua mineral di Stasiun Orbital per level.", baseCost: 250, growth: 1.65, maxLevel: 10 },
  { id: "pemindai", name: "Spektrometer Inti", desc: "Scan asteroid 7% lebih cepat per level, dan +25% peluang urat Iridium & Kristal Helium-3 muncul di asteroid berikutnya.", baseCost: 400, growth: 1.75, maxLevel: 8 },
];

function oreById(id: string): OreDef | undefined {
  return ORES.find((o) => o.id === id);
}
function upgradeById(id: string): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}
function upgradeCost(def: UpgradeDef, level: number): number {
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

function generateExpedition(zoneIdx: number, levels: Record<string, number>): Expedition {
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
function scanDurationSec(exp: Expedition, levels: Record<string, number>, premium: boolean): number {
  return scanDurationForZone(expeditionZone(exp, 0), levels, premium);
}
function mineDurationSec(vein: Vein, exp: Expedition, levels: Record<string, number>, premium: boolean, dualDrill: boolean): number {
  const ore = oreById(vein.oreId);
  const hardness = ore?.hardness ?? 1;
  const map = mapByIndex(expeditionZone(exp, 0));
  const base = 30 + hardness * 25 + vein.qty * 8;
  const sped = base * exp.timeFactor * map.timeFactor * (1 - 0.06 * (levels["beliung"] ?? 0)) * (premium ? PREMIUM_TIME_FACTOR : 1) * (dualDrill ? DUAL_DRILL_FACTOR : 1);
  return Math.max(25, Math.round(sped));
}
function scanEnergyCost(exp: Expedition): number {
  return SCAN_ENERGY_COST + mapByIndex(expeditionZone(exp, 0)).radiation;
}
function mineEnergyCost(vein: Vein, exp: Expedition): number {
  const ore = oreById(vein.oreId);
  return 4 + (ore?.hardness ?? 1) + mapByIndex(expeditionZone(exp, 0)).radiation;
}
function completionBonusKt(layer: number): number {
  return 10 + layer * 2;
}
/** Energy to fly to a map: the base hop plus 2 per map step of distance. */
function travelCostFor(zoneIdx: number, premium: boolean): number {
  return premium ? 0 : TRAVEL_ENERGY_COST + zoneIdx * 2;
}

// ---------------------------------------------------------------------------
// Player loading + energy regeneration
// ---------------------------------------------------------------------------

async function loadLevels(db: Db): Promise<Record<string, number>> {
  const rows = await db.select().from(schema.upgrades);
  const levels: Record<string, number> = {};
  for (const def of UPGRADES) levels[def.id] = 0;
  for (const row of rows) levels[row.upgradeId] = row.level;
  return levels;
}

function maxEnergy(levels: Record<string, number>): number {
  return BASE_MAX_ENERGY + 6 * (levels["tangki"] ?? 0);
}
function regenSeconds(levels: Record<string, number>, premium: boolean): number {
  // Reaktor Fusi Mini ("bor") is the regen-speed upgrade: -10% per level.
  const base = Math.max(REGEN_MIN_SECONDS, Math.round(BASE_REGEN_SECONDS * Math.pow(0.9, levels["bor"] ?? 0)));
  return premium ? Math.max(30, Math.round(base / PREMIUM_REGEN_DIVISOR)) : base;
}
function sellMultiplier(levels: Record<string, number>, premium: boolean): number {
  return 1 + 0.05 * (levels["negosiator"] ?? 0) + (premium ? PREMIUM_SELL_BONUS : 0);
}

type PlayerRow = typeof schema.player.$inferSelect;

/** Loads (or creates) the singleton player, applies timed energy regen,
 *  and makes sure the player is orbiting a valid asteroid. */
async function loadPlayer(db: Db, levels: Record<string, number>): Promise<PlayerRow> {
  const existing = await db
    .select()
    .from(schema.player)
    .where(eq(schema.player.id, 1))
    .limit(1);
  let p = existing[0];
  if (!p) {
    const exp = generateExpedition(0, levels);
    await db.insert(schema.player).values({
      id: 1,
      ktBalance: 0,
      energy: BASE_MAX_ENERGY,
      energyUpdatedAt: new Date(),
      layer: 1,
      currentZone: 0,
      premiumUntil: null,
      premiumTier: null,
      grid: "[]",
      expedition: JSON.stringify(exp),
      job: null,
      totalScans: 0,
      asteroidsDone: 0,
      totalDigs: 0,
      totalKtEarned: 0,
      totalWdPaidGram: 0,
    });
    const created = await db
      .select()
      .from(schema.player)
      .where(eq(schema.player.id, 1))
      .limit(1);
    p = created[0];
    if (!p) throw new Error("player init failed");
    return p;
  }
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
      .where(eq(schema.player.id, 1));
    p = { ...p, energy: newEnergy, energyUpdatedAt: newUpdated };
  } else if (p.energy >= cap && elapsed > 0) {
    await db
      .update(schema.player)
      .set({ energyUpdatedAt: new Date(now) })
      .where(eq(schema.player.id, 1));
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
      .where(eq(schema.player.id, 1));
    p = { ...p, expedition: JSON.stringify(exp) };
  } else if (typeof parsedExp.zone !== "number") {
    parsedExp.zone = p.currentZone;
    await db
      .update(schema.player)
      .set({ expedition: JSON.stringify(parsedExp) })
      .where(eq(schema.player.id, 1));
    p = { ...p, expedition: JSON.stringify(parsedExp) };
  }
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
  kind: string,
  message: string,
  amountKt: number | null,
): Promise<void> {
  await db.insert(schema.activity).values({ kind, message, amountKt });
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

/** How many WDs the owner has actually PAID — drives the escalating
 *  WD minimum. Counted from the database on every relevant call, never
 *  taken from the client. */
async function countPaidWithdrawals(db: Db): Promise<number> {
  const rows = await db
    .select({ id: schema.wdRequests.id })
    .from(schema.wdRequests)
    .where(eq(schema.wdRequests.status, "paid"));
  return rows.length;
}

async function canClaimDailyBonus(db: Db): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.activity)
    .where(eq(schema.activity.kind, "daily_bonus"))
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
async function getAdStats(db: Db): Promise<AdStats> {
  const rows = await db
    .select()
    .from(schema.activity)
    .where(eq(schema.activity.kind, "ad_reward"))
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
// Shared response shapes
// ---------------------------------------------------------------------------

const wdShape = z.object({
  id: z.number(),
  walletAddress: z.string(),
  amountKt: z.number(),
  amountGram: z.number(),
  status: z.enum(["pending", "approved", "paid", "rejected", "cancelled"]),
  adminNote: z.string().nullable(),
  txRef: z.string().nullable(),
  createdAt: z.string(),
  processedAt: z.string().nullable(),
});

type WdRow = typeof schema.wdRequests.$inferSelect;
function toWd(row: WdRow): z.infer<typeof wdShape> {
  return {
    id: row.id,
    walletAddress: row.walletAddress,
    amountKt: row.amountKt,
    amountGram: row.amountGram,
    status: row.status,
    adminNote: row.adminNote,
    txRef: row.txRef,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt ? row.processedAt.toISOString() : null,
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
  handler: (args: z.infer<Req>) => Promise<Res>;
}): {
  description: string;
  request: Req;
  response: z.ZodTypeAny;
  handler: (args: z.infer<Req>) => Promise<Res>;
} {
  return def;
}

export const gameActions = {
  getGameState: defineGameAction({
    description:
      "Returns the full game state: player balances and energy, the escalating WD minimum computed server-side from the paid-WD history (first WD 500 KT, rising per paid WD), premium pass status (tier, dual-drill flag, Telegram Stars plans) and Stars purchase orders, the five mining maps with unlock state, per-map distance, scan duration and challenge profiles, per-map gemstone loot, the asteroid currently being explored (identity, map, scan status, mineral veins), any timed scan/mining job in progress with its remaining seconds (finished jobs also reveal map challenge outcomes: drill jam / hull hit), ore inventory with live sell prices, upgrade levels and costs, recent withdrawals, the sponsored-ad reward state (reward per view, daily cap, views used today, remaining views and cooldown seconds — all computed server-side), and the activity log split into mission and economy categories.",
    request: z.object({}),
    response: z.object({
      player: z.object({
        ktBalance: z.number(),
        gramEquivalent: z.number(),
        energy: z.number(),
        maxEnergy: z.number(),
        regenSeconds: z.number(),
        layer: z.number(),
        depthMeters: z.number(),
        zoneName: z.string(),
        zoneDesc: z.string(),
        currentZone: z.number(),
        premium: z.object({
          active: z.boolean(),
          tier: z.enum(["standard", "pro"]).nullable(),
          dualDrill: z.boolean(),
          until: z.string().nullable(),
          plans: z.array(
            z.object({
              id: z.string(),
              label: z.string(),
              days: z.number(),
              stars: z.number(),
              tier: z.enum(["standard", "pro"]),
            }),
          ),
        }),
        totalDigs: z.number(),
        totalScans: z.number(),
        asteroidsDone: z.number(),
        totalKtEarned: z.number(),
        totalWdPaidGram: z.number(),
        canClaimDailyBonus: z.boolean(),
        dailyBonusKt: z.number(),
        ktPerGram: z.number(),
        wdPaidCount: z.number(),
        wdMinKt: z.number(),
        wdMinGram: z.number(),
        wdNextMinKt: z.number(),
        wdStepKt: z.number(),
        ads: z.object({
          rewardKt: z.number(),
          dailyCap: z.number(),
          watchedToday: z.number(),
          remainingToday: z.number(),
          canWatch: z.boolean(),
          cooldownSeconds: z.number(),
          cooldownRemainingSec: z.number(),
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
          status: z.enum(["pending", "confirmed", "rejected"]),
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
    }),
    async handler() {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const premium = isPremium(p);
      const exp = parseExpedition(p.expedition) ?? generateExpedition(p.currentZone, levels);
      const job = parseJob(p.job);
      const invRows = await db.select().from(schema.inventory);
      const invMap = new Map(invRows.map((r) => [r.oreId, r.qty]));
      const mult = sellMultiplier(levels, premium);
      const zoneIdx = expeditionZone(exp, p.currentZone);
      const zone = mapByIndex(zoneIdx);
      const wdRows = await db
        .select()
        .from(schema.wdRequests)
        .orderBy(desc(schema.wdRequests.id))
        .limit(30);
      const orderRows = await db
        .select()
        .from(schema.premiumOrders)
        .orderBy(desc(schema.premiumOrders.id))
        .limit(20);
      const actRows = await db
        .select()
        .from(schema.activity)
        .orderBy(desc(schema.activity.id))
        .limit(30);
      const wdPaidCount = await countPaidWithdrawals(db);
      const wdMinKt = wdMinKtForPaidCount(wdPaidCount);
      const adStats = await getAdStats(db);
      const now = Date.now();
      const remainingSec = job ? Math.max(0, Math.ceil((job.endsAt - now) / 1000)) : 0;
      return {
        player: {
          ktBalance: p.ktBalance,
          gramEquivalent: p.ktBalance / KT_PER_GRAM,
          energy: p.energy,
          maxEnergy: maxEnergy(levels),
          regenSeconds: regenSeconds(levels, premium),
          layer: p.layer,
          depthMeters: p.layer * 12500,
          zoneName: zone.name,
          zoneDesc: zone.desc,
          currentZone: p.currentZone,
          premium: {
            active: premium,
            tier: premiumTierOf(p),
            dualDrill: hasDualDrill(p),
            until: p.premiumUntil ? p.premiumUntil.toISOString() : null,
            plans: (Object.keys(PREMIUM_PLANS) as PremiumPlanId[]).map((id) => ({
              id,
              label: PREMIUM_PLANS[id].label,
              days: PREMIUM_PLANS[id].days,
              stars: PREMIUM_PLANS[id].stars,
              tier: PREMIUM_PLANS[id].tier,
            })),
          },
          totalDigs: p.totalDigs,
          totalScans: p.totalScans,
          asteroidsDone: p.asteroidsDone,
          totalKtEarned: p.totalKtEarned,
          totalWdPaidGram: p.totalWdPaidGram,
          canClaimDailyBonus: await canClaimDailyBonus(db),
          dailyBonusKt: DAILY_BONUS_KT,
          ktPerGram: KT_PER_GRAM,
          wdPaidCount,
          wdMinKt,
          wdMinGram: wdMinKt / KT_PER_GRAM,
          wdNextMinKt: wdMinKtForPaidCount(wdPaidCount + 1),
          wdStepKt: WD_STEP_KT,
          ads: {
            rewardKt: AD_REWARD_KT,
            dailyCap: AD_DAILY_CAP,
            watchedToday: adStats.watchedToday,
            remainingToday: adStats.remainingToday,
            canWatch: adStats.canWatch,
            cooldownSeconds: AD_COOLDOWN_SECONDS,
            cooldownRemainingSec: adStats.cooldownRemainingSec,
          },
        },
        maps: MAPS.map((m, i) => ({
          index: i,
          name: m.name,
          tagline: m.tagline,
          desc: m.desc,
          minLayer: m.minLayer,
          image: m.image,
          unlocked: p.layer >= m.minLayer,
          isCurrent: p.currentZone === i,
          travelCost: travelCostFor(i, premium),
          distanceLabel: m.distanceLabel,
          scanSeconds: scanDurationForZone(i, levels, premium),
          jamChancePct: Math.round(m.jamChance * 100),
          damageChancePct: Math.round(m.damageChance * 100),
          damageFeeKt: m.damageFeeKt,
          radiation: m.radiation,
          timeFactor: m.timeFactor,
          gems: ORES.filter((o) => (o.weights[i] ?? 0) > 0).map((o) => ({
            id: o.id,
            name: o.name,
            price: Math.round(o.price * mult),
            color: o.color,
            icon: o.icon,
          })),
        })),
        expedition: {
          name: exp.name,
          klass: exp.klass,
          diameterKm: exp.diameterKm,
          zoneIndex: zoneIdx,
          zoneName: zone.name,
          scanned: exp.scanned,
          anomalyText: exp.scanned ? exp.anomalyText : null,
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
                  name: ore?.name ?? v.oreId,
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
              oreName: job.oreId ? (oreById(job.oreId)?.name ?? null) : null,
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
          name: o.name,
          basePrice: o.price,
          sellPrice: Math.round(o.price * mult),
          color: o.color,
          icon: o.icon,
          qty: invMap.get(o.id) ?? 0,
        })),
        upgrades: UPGRADES.map((u) => {
          const level = levels[u.id] ?? 0;
          return {
            id: u.id,
            name: u.name,
            desc: u.desc,
            level,
            maxLevel: u.maxLevel,
            nextCost: level >= u.maxLevel ? null : upgradeCost(u, level),
          };
        }),
        withdrawals: wdRows.map(toWd),
        premiumOrders: orderRows.map((o) => ({
          id: o.id,
          plan: o.plan,
          stars: o.stars,
          days: o.days,
          tier: o.tier,
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
    async handler() {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const fail = (error: string) => ({ ok: false, error, durationSec: 0, energy: p.energy });
      const exp = parseExpedition(p.expedition);
      if (!exp) return fail("Data asteroid tidak valid, coba muat ulang.");
      if (parseJob(p.job)) return fail("Ada operasi yang sedang berjalan. Selesaikan atau batalkan dulu.");
      if (exp.scanned) return fail("Asteroid ini sudah dipindai — komposisi uratnya sudah terbuka.");
      const cost = scanEnergyCost(exp);
      if (p.energy < cost)
        return fail(`Daya tidak cukup — scan butuh ${cost} daya, kamu punya ${p.energy}. Tunggu daya pulih (isi ulang memang lambat), naikkan Reaktor Fusi Mini agar isi ulang lebih cepat, atau Tangki O₂ & Baterai Surya agar kapasitas daya lebih besar.`);
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
        .where(eq(schema.player.id, 1));
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
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const fail = (error: string) => ({ ok: false, error, durationSec: 0, energy: p.energy, oreName: null });
      const exp = parseExpedition(p.expedition);
      if (!exp) return fail("Data asteroid tidak valid, coba muat ulang.");
      if (parseJob(p.job)) return fail("Ada operasi yang sedang berjalan. Selesaikan atau batalkan dulu.");
      if (!exp.scanned) return fail("Pindai asteroid ini dulu — tanpa scan, urat mineralnya tidak terlihat.");
      const vein = exp.veins[args.veinIndex];
      if (!vein) return fail("Urat mineral itu tidak ada di asteroid ini.");
      if (vein.mined) return fail("Urat ini sudah habis ditambang.");
      const cost = mineEnergyCost(vein, exp);
      if (p.energy < cost)
        return fail(`Daya tidak cukup — pengeboran urat ini butuh ${cost} daya, kamu punya ${p.energy}. Tunggu daya pulih (isi ulang memang lambat), naikkan Reaktor Fusi Mini agar isi ulang lebih cepat, atau Tangki O₂ & Baterai Surya agar kapasitas daya lebih besar.`);
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
        .where(eq(schema.player.id, 1));
      return { ok: true, error: null, durationSec, energy: spend.energy, oreName: oreById(vein.oreId)?.name ?? null };
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
    async handler() {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const fail = (error: string) => ({
        ok: false, error, kind: null, oreId: null, oreName: null, qty: 0, isRare: false, allMined: false,
        jammed: false, hullHit: false, repairFeeKt: 0,
      });
      const exp = parseExpedition(p.expedition);
      if (!exp) return fail("Data asteroid tidak valid, coba muat ulang.");
      const job = parseJob(p.job);
      if (!job) return fail("Tidak ada operasi yang bisa diambil hasilnya.");
      const remaining = Math.ceil((job.endsAt - Date.now()) / 1000);
      if (remaining > 0)
        return fail(`Operasi belum selesai — masih ${remaining} detik lagi. Bor dan spektrometer bekerja dengan waktu nyata.`);

      if (job.kind === "scan") {
        exp.scanned = true;
        await db
          .update(schema.player)
          .set({ expedition: JSON.stringify(exp), job: null, totalScans: p.totalScans + 1 })
          .where(eq(schema.player.id, 1));
        await logActivity(db, "scan", `Scan ${exp.name} selesai — ${exp.veins.length} urat mineral terdeteksi.`, null);
        return { ok: true, error: null, kind: "scan" as const, oreId: null, oreName: null, qty: 0, isRare: false, allMined: false, jammed: false, hullHit: false, repairFeeKt: 0 };
      }

      // Mining job.
      const vein = job.veinIndex != null ? exp.veins[job.veinIndex] : undefined;
      if (!vein || vein.mined || vein.oreId !== job.oreId) {
        await db.update(schema.player).set({ job: null }).where(eq(schema.player.id, 1));
        return fail("Urat target operasi ini sudah tidak tersedia — operasi dibatalkan.");
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
          .where(eq(schema.player.id, 1));
        await logActivity(db, "jam", `Bor macet saat mengebor urat ${ore?.name ?? vein.oreId} di ${exp.name} — urat hilang, mata bor harus diganti.`, null);
        return {
          ok: true, error: null, kind: "mine" as const,
          oreId: vein.oreId, oreName: ore?.name ?? null, qty: 0,
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
        .where(eq(schema.player.id, 1));
      await db
        .insert(schema.inventory)
        .values({ oreId: vein.oreId, qty })
        .onConflictDoUpdate({
          target: schema.inventory.oreId,
          set: { qty: sql`${schema.inventory.qty} + ${qty}` },
        });
      if (ore && RARE_IDS.has(ore.id)) {
        await logActivity(db, "rare_find", `Menambang ${ore.name} ×${qty} dari ${exp.name}!`, null);
      }
      // Tantangan peta: lambung kapal terkena serpihan — hasil tambang
      // tetap didapat, tapi biaya perbaikan dipotong dari saldo KT.
      let repairFeeKt = 0;
      if (job.hullHit === true && map.damageFeeKt > 0) {
        repairFeeKt = Math.min(map.damageFeeKt, p.ktBalance);
        if (repairFeeKt > 0) {
          await db
            .update(schema.player)
            .set({ ktBalance: p.ktBalance - repairFeeKt })
            .where(eq(schema.player.id, 1));
        }
        await logActivity(db, "hull_damage", `Lambung kapal terkena serpihan di ${map.name} — biaya perbaikan ${repairFeeKt} KT.`, -repairFeeKt);
      }
      return {
        ok: true,
        error: null,
        kind: "mine" as const,
        oreId: vein.oreId,
        oreName: ore?.name ?? null,
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
    async handler() {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      if (!parseJob(p.job)) return { ok: false, error: "Tidak ada operasi yang sedang berjalan." };
      await db.update(schema.player).set({ job: null }).where(eq(schema.player.id, 1));
      return { ok: true, error: null };
    },
  }),

  completeExpedition: defineGameAction({
    description:
      "Finishes the current asteroid once every vein has been mined: pays the completion KT bonus, advances one sector, and warps to a freshly generated asteroid.",
    request: z.object({}),
    response: resultShape.extend({
      layer: z.number(),
      bonusKt: z.number(),
      ktBalance: z.number(),
    }),
    async handler() {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const fail = (error: string) => ({ ok: false, error, layer: p.layer, bonusKt: 0, ktBalance: p.ktBalance });
      const exp = parseExpedition(p.expedition);
      if (!exp) return fail("Data asteroid tidak valid, coba muat ulang.");
      if (parseJob(p.job)) return fail("Selesaikan operasi yang sedang berjalan dulu.");
      if (!exp.scanned || !exp.veins.every((v) => v.mined))
        return fail("Tambang semua urat mineral di asteroid ini dulu sebelum warp ke asteroid berikutnya.");
      const bonus = completionBonusKt(p.layer);
      const newExp = generateExpedition(p.currentZone, levels);
      await db
        .update(schema.player)
        .set({
          layer: p.layer + 1,
          expedition: JSON.stringify(newExp),
          asteroidsDone: p.asteroidsDone + 1,
          ktBalance: p.ktBalance + bonus,
          totalKtEarned: p.totalKtEarned + bonus,
        })
        .where(eq(schema.player.id, 1));
      await logActivity(
        db,
        "expedition_bonus",
        `Ekspedisi ${exp.name} tuntas. Bonus ${bonus} KT, warp ke Sektor ${p.layer + 1}: ${newExp.name}.`,
        bonus,
      );
      return { ok: true, error: null, layer: p.layer + 1, bonusKt: bonus, ktBalance: p.ktBalance + bonus };
    },
  }),

  abandonAsteroid: defineGameAction({
    description:
      "Leaves the current asteroid without completing it (costs fuel energy, no bonus, no sector advance) and warps to a freshly generated asteroid in the same sector.",
    request: z.object({}),
    response: resultShape.extend({ asteroidName: z.string().nullable() }),
    async handler() {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const fail = (error: string) => ({ ok: false, error, asteroidName: null });
      if (parseJob(p.job)) return fail("Batalkan operasi yang sedang berjalan dulu sebelum pindah asteroid.");
      if (p.energy < ABANDON_ENERGY_COST)
        return fail(`Bahan bakar tidak cukup — pindah asteroid butuh ${ABANDON_ENERGY_COST} daya, kamu punya ${p.energy}.`);
      const newExp = generateExpedition(p.currentZone, levels);
      const spend = energyAfterSpend(p, levels, ABANDON_ENERGY_COST);
      await db
        .update(schema.player)
        .set({ ...spend, expedition: JSON.stringify(newExp) })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "travel", `Meninggalkan asteroid lama, warp ke ${newExp.name}.`, null);
      return { ok: true, error: null, asteroidName: newExp.name };
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
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const fail = (error: string) => ({ ok: false, error, mapName: null, asteroidName: null });
      if (args.zoneIndex >= MAPS.length) return fail("Peta itu tidak ada di bagan navigasi stasiun.");
      const target = mapByIndex(args.zoneIndex);
      if (p.layer < target.minLayer)
        return fail(`Peta ini terkunci — butuh Sektor ${target.minLayer}, kamu baru Sektor ${p.layer}. Selesaikan ekspedisi untuk naik sektor.`);
      if (args.zoneIndex === p.currentZone)
        return fail("Kamu sudah menambang di peta ini.");
      if (parseJob(p.job)) return fail("Batalkan operasi yang sedang berjalan dulu sebelum pindah peta.");
      const premium = isPremium(p);
      const cost = travelCostFor(args.zoneIndex, premium);
      if (p.energy < cost)
        return fail(`Bahan bakar tidak cukup — perjalanan antar-peta butuh ${cost} daya, kamu punya ${p.energy}.`);
      const newExp = generateExpedition(args.zoneIndex, levels);
      const spend = cost > 0 ? energyAfterSpend(p, levels, cost) : { energy: p.energy, energyUpdatedAt: p.energyUpdatedAt };
      await db
        .update(schema.player)
        .set({ ...spend, currentZone: args.zoneIndex, expedition: JSON.stringify(newExp) })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "travel", `Perjalanan antar-peta ke ${target.name}. Asteroid baru: ${newExp.name}.`, null);
      return { ok: true, error: null, mapName: target.name, asteroidName: newExp.name };
    },
  }),

  createPremiumOrder: defineGameAction({
    description:
      "Creates a Premium Pass purchase order priced in Telegram Stars (Standard 150 Stars / 7 days, Pro 500 Stars / 30 days with the dual drill). The player pays the Stars to the owner in Telegram; the owner then confirms the order from the Kendali tab, which activates the pass. Only one pending order at a time.",
    request: z.object({ plan: z.enum(["standard", "pro"]) }),
    response: resultShape.extend({
      orderId: z.number().nullable(),
      stars: z.number(),
    }),
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      // Creates the player row (and applies regen) if this is the
      // first ever action — the order itself has no player column.
      await loadPlayer(db, levels);
      const plan = PREMIUM_PLANS[args.plan];
      const fail = (error: string) => ({ ok: false, error, orderId: null, stars: plan.stars });
      const pending = await db
        .select()
        .from(schema.premiumOrders)
        .where(eq(schema.premiumOrders.status, "pending"))
        .limit(1);
      if (pending[0])
        return fail("Masih ada pesanan Premium yang menunggu konfirmasi pemilik. Selesaikan pembayaran Stars untuk pesanan itu dulu, atau tunggu pemilik memprosesnya.");
      const inserted = await db
        .insert(schema.premiumOrders)
        .values({ plan: args.plan, stars: plan.stars, days: plan.days, tier: plan.tier, status: "pending" })
        .returning({ id: schema.premiumOrders.id });
      const row = inserted[0];
      if (!row) return fail("Gagal membuat pesanan Premium, coba lagi.");
      await logActivity(db, "premium_order", `Pesanan Premium ${plan.label} dibuat (${plan.stars} Telegram Stars) — menunggu pembayaran & konfirmasi pemilik.`, null);
      return { ok: true, error: null, orderId: row.id, stars: plan.stars };
    },
  }),

  confirmPremiumOrder: defineGameAction({
    description:
      "Owner action: confirms a pending Telegram Stars premium order after the Stars payment arrived in Telegram — activates (or extends) the Premium Pass with the order's tier and days, unlocking the dual drill for the Pro tier.",
    request: z.object({ orderId: z.number().int().positive() }),
    response: resultShape.extend({
      premiumUntil: z.string().nullable(),
    }),
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const rows = await db
        .select()
        .from(schema.premiumOrders)
        .where(eq(schema.premiumOrders.id, args.orderId))
        .limit(1);
      const order = rows[0];
      if (!order) return { ok: false, error: "Pesanan Premium tidak ditemukan.", premiumUntil: p.premiumUntil ? p.premiumUntil.toISOString() : null };
      if (order.status !== "pending")
        return { ok: false, error: "Pesanan ini sudah diproses.", premiumUntil: p.premiumUntil ? p.premiumUntil.toISOString() : null };
      const base = p.premiumUntil && p.premiumUntil.getTime() > Date.now() ? p.premiumUntil.getTime() : Date.now();
      const until = new Date(base + order.days * 24 * 60 * 60 * 1000);
      // Tier: a Pro order always sets Pro; a Standard order never
      // downgrades an active Pro pass.
      const tier: PremiumTier = order.tier === "pro" || (isPremium(p) && p.premiumTier === "pro") ? "pro" : "standard";
      await db
        .update(schema.premiumOrders)
        .set({ status: "confirmed", processedAt: new Date() })
        .where(eq(schema.premiumOrders.id, order.id));
      await db
        .update(schema.player)
        .set({ premiumUntil: until, premiumTier: tier })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "premium_confirm", `Pembayaran ${order.stars} Telegram Stars terkonfirmasi — Premium ${tier === "pro" ? "Pro (bor ganda)" : "Standard"} ${order.days} hari aktif sampai ${until.toLocaleDateString("id-ID")}.`, null);
      return { ok: true, error: null, premiumUntil: until.toISOString() };
    },
  }),

  rejectPremiumOrder: defineGameAction({
    description:
      "Owner action: rejects a pending Telegram Stars premium order (e.g. the Stars payment never arrived). The pass is not activated; the player can create a new order afterwards.",
    request: z.object({ orderId: z.number().int().positive() }),
    response: resultShape,
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      await loadPlayer(db, levels);
      const rows = await db
        .select()
        .from(schema.premiumOrders)
        .where(eq(schema.premiumOrders.id, args.orderId))
        .limit(1);
      const order = rows[0];
      if (!order) return { ok: false, error: "Pesanan Premium tidak ditemukan." };
      if (order.status !== "pending") return { ok: false, error: "Pesanan ini sudah diproses." };
      await db
        .update(schema.premiumOrders)
        .set({ status: "rejected", processedAt: new Date() })
        .where(eq(schema.premiumOrders.id, order.id));
      await logActivity(db, "premium_reject", `Pesanan Premium #${order.id} (${order.stars} Stars) ditolak pemilik — pembayaran tidak terkonfirmasi.`, null);
      return { ok: true, error: null };
    },
  }),

  grantPremium: defineGameAction({
    description:
      "Owner action: grants or extends a Premium Pass tier (Standard or Pro — Pro unlocks the dual drill) for free — used after the player pays the owner outside the game (Telegram Stars handled manually, transfer, e-wallet, etc.), matching the manual GRAM payout model.",
    request: z.object({
      days: z.number().int().min(1).max(365),
      tier: z.enum(["standard", "pro"]),
    }),
    response: resultShape.extend({
      premiumUntil: z.string().nullable(),
    }),
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const base = p.premiumUntil && p.premiumUntil.getTime() > Date.now() ? p.premiumUntil.getTime() : Date.now();
      const until = new Date(base + args.days * 24 * 60 * 60 * 1000);
      const tier: PremiumTier = args.tier === "pro" || (isPremium(p) && p.premiumTier === "pro") ? "pro" : "standard";
      await db
        .update(schema.player)
        .set({ premiumUntil: until, premiumTier: tier })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "premium_grant", `Pemilik mengaktifkan Premium ${tier === "pro" ? "Pro (bor ganda)" : "Standard"} ${args.days} hari (pembayaran di luar game) — aktif sampai ${until.toLocaleDateString("id-ID")}.`, null);
      return { ok: true, error: null, premiumUntil: until.toISOString() };
    },
  }),

  claimDailyBonus: defineGameAction({
    description:
      "Claims the once-per-calendar-day login bonus of 25 KT.",
    request: z.object({}),
    response: resultShape.extend({
      bonusKt: z.number(),
      ktBalance: z.number(),
    }),
    async handler() {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      if (!(await canClaimDailyBonus(db))) {
        return {
          ok: false,
          error: "Bonus harian sudah diklaim hari ini. Kembali lagi besok!",
          bonusKt: 0,
          ktBalance: p.ktBalance,
        };
      }
      await db
        .update(schema.player)
        .set({
          ktBalance: p.ktBalance + DAILY_BONUS_KT,
          totalKtEarned: p.totalKtEarned + DAILY_BONUS_KT,
        })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "daily_bonus", `Bonus harian ${DAILY_BONUS_KT} KT diklaim.`, DAILY_BONUS_KT);
      return {
        ok: true,
        error: null,
        bonusKt: DAILY_BONUS_KT,
        ktBalance: p.ktBalance + DAILY_BONUS_KT,
      };
    },
  }),

  watchAd: defineGameAction({
    description:
      "Claims the sponsored-ad reward: credits 15 KT for one ad view. Fully server-validated (anti-cheat): the daily cap of 10 views per calendar day and the 60-second cooldown between views are recomputed here from the ad_reward activity history in the database — a tampered client cannot exceed the cap, skip the cooldown, or change the reward amount. This is the placeholder slot where the owner will plug in a real ad provider later; the reward logic stays identical.",
    request: z.object({}),
    response: resultShape.extend({
      rewardKt: z.number(),
      ktBalance: z.number(),
      watchedToday: z.number(),
      remainingToday: z.number(),
      cooldownRemainingSec: z.number(),
    }),
    async handler() {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const stats = await getAdStats(db);
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
        return fail(`Batas iklan hari ini sudah tercapai (${AD_DAILY_CAP}× sehari). Hadiah iklan direset besok — kembali lagi ya!`);
      if (stats.cooldownRemainingSec > 0)
        return fail(`Sabar — iklan berikutnya bisa ditonton dalam ${stats.cooldownRemainingSec} detik lagi (jeda ${AD_COOLDOWN_SECONDS} detik antar-iklan).`);
      await db
        .update(schema.player)
        .set({
          ktBalance: p.ktBalance + AD_REWARD_KT,
          totalKtEarned: p.totalKtEarned + AD_REWARD_KT,
        })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "ad_reward", `Menonton iklan sponsor — hadiah ${AD_REWARD_KT} KT masuk ke saldo.`, AD_REWARD_KT);
      return {
        ok: true,
        error: null,
        rewardKt: AD_REWARD_KT,
        ktBalance: p.ktBalance + AD_REWARD_KT,
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
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const ore = oreById(args.oreId);
      const fail = (error: string) => ({ ok: false, error, ktGained: 0, ktBalance: p.ktBalance });
      if (!ore) return fail("Jenis mineral tidak dikenal.");
      const inv = await db
        .select()
        .from(schema.inventory)
        .where(eq(schema.inventory.oreId, args.oreId))
        .limit(1);
      const held = inv[0]?.qty ?? 0;
      if (held < args.qty) return fail(`Bijih tidak cukup — kamu hanya punya ${held} ${ore.name}.`);
      const unit = Math.round(ore.price * sellMultiplier(levels, isPremium(p)));
      const gained = unit * args.qty;
      await db
        .update(schema.inventory)
        .set({ qty: held - args.qty })
        .where(eq(schema.inventory.oreId, args.oreId));
      await db
        .update(schema.player)
        .set({
          ktBalance: p.ktBalance + gained,
          totalKtEarned: p.totalKtEarned + gained,
        })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "sell", `Menjual ${args.qty} ${ore.name} seharga ${gained} KT.`, gained);
      return { ok: true, error: null, ktGained: gained, ktBalance: p.ktBalance + gained };
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
    async handler() {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const invRows = await db.select().from(schema.inventory);
      const mult = sellMultiplier(levels, isPremium(p));
      let gained = 0;
      let count = 0;
      for (const row of invRows) {
        const ore = oreById(row.oreId);
        if (!ore || row.qty <= 0) continue;
        gained += Math.round(ore.price * mult) * row.qty;
        count += row.qty;
      }
      if (count === 0) {
        return { ok: false, error: "Kargo kosong — belum ada mineral untuk dijual.", ktGained: 0, ktBalance: p.ktBalance };
      }
      for (const row of invRows) {
        if (row.qty > 0) {
          await db
            .update(schema.inventory)
            .set({ qty: 0 })
            .where(eq(schema.inventory.oreId, row.oreId));
        }
      }
      await db
        .update(schema.player)
        .set({
          ktBalance: p.ktBalance + gained,
          totalKtEarned: p.totalKtEarned + gained,
        })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "sell", `Menjual semua mineral (${count} unit) seharga ${gained} KT.`, gained);
      return { ok: true, error: null, ktGained: gained, ktBalance: p.ktBalance + gained };
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
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const def = upgradeById(args.upgradeId);
      const fail = (error: string) => ({ ok: false, error, newLevel: null, costPaid: 0, ktBalance: p.ktBalance });
      if (!def) return fail("Upgrade tidak dikenal.");
      const level = levels[def.id] ?? 0;
      if (level >= def.maxLevel) return fail(`${def.name} sudah level maksimum.`);
      const cost = upgradeCost(def, level);
      if (p.ktBalance < cost)
        return fail(`KT tidak cukup — butuh ${cost} KT, saldo kamu ${p.ktBalance} KT.`);
      const existing = await db
        .select()
        .from(schema.upgrades)
        .where(eq(schema.upgrades.upgradeId, def.id))
        .limit(1);
      if (existing[0]) {
        await db
          .update(schema.upgrades)
          .set({ level: level + 1 })
          .where(eq(schema.upgrades.upgradeId, def.id));
      } else {
        await db.insert(schema.upgrades).values({ upgradeId: def.id, level: 1 });
      }
      await db
        .update(schema.player)
        .set({ ktBalance: p.ktBalance - cost })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "upgrade", `${def.name} naik ke level ${level + 1}.`, -cost);
      return {
        ok: true,
        error: null,
        newLevel: level + 1,
        costPaid: cost,
        ktBalance: p.ktBalance - cost,
      };
    },
  }),

  requestWithdrawal: defineGameAction({
    description:
      "Creates a withdrawal request: locks the KT and puts the request in the owner's manual payout queue with the player's GRAM wallet address. Anti-cheat: the amount arrives in KT and is fully re-validated server-side — it must be a multiple of 500 KT (0,5 GRAM steps), must meet the escalating minimum computed here from the player's paid-WD history (first paid WD: 500 KT, then 1.000 / 2.000 / 3.000 / 5.000 / 10.000 KT), and must fit the server-side balance. The client cannot lower the minimum or inflate the balance.",
    request: z.object({
      walletAddress: z.string().trim().min(10).max(120),
      amountKt: z.number().int().min(WD_STEP_KT).max(1000000),
    }),
    response: resultShape.extend({
      wdId: z.number().nullable(),
      ktBalance: z.number(),
    }),
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const amountKt = args.amountKt;
      const amountGram = amountKt / KT_PER_GRAM;
      const fail = (error: string) => ({ ok: false, error, wdId: null, ktBalance: p.ktBalance });
      if (amountKt % WD_STEP_KT !== 0)
        return fail(`Jumlah WD harus kelipatan ${WD_STEP_KT} KT (0,5 GRAM) — ${amountKt} KT tidak valid.`);
      const paidCount = await countPaidWithdrawals(db);
      const minKt = wdMinKtForPaidCount(paidCount);
      if (amountKt < minKt)
        return fail(
          paidCount === 0
            ? `Minimum WD pertama adalah ${minKt} KT (0,5 GRAM) — kamu mengajukan ${amountKt} KT. Kumpulkan ${minKt - amountKt} KT lagi.`
            : `Minimum WD naik setelah WD dibayar: kamu sudah ${paidCount}× WD terbayar, jadi minimum WD berikutnya ${minKt} KT (${minKt / KT_PER_GRAM} GRAM) — kamu mengajukan ${amountKt} KT.`,
        );
      if (p.ktBalance < amountKt)
        return fail(
          `Saldo KT tidak cukup — WD ${amountGram} GRAM butuh ${amountKt} KT, saldo kamu ${p.ktBalance} KT.`,
        );
      const inserted = await db
        .insert(schema.wdRequests)
        .values({
          walletAddress: args.walletAddress,
          amountKt,
          amountGram,
          status: "pending",
        })
        .returning({ id: schema.wdRequests.id });
      const row = inserted[0];
      if (!row) return fail("Gagal membuat permintaan WD, coba lagi.");
      await db
        .update(schema.player)
        .set({ ktBalance: p.ktBalance - amountKt })
        .where(eq(schema.player.id, 1));
      await logActivity(
        db,
        "wd_request",
        `Permintaan WD ${amountGram} GRAM (${amountKt} KT) dibuat — menunggu diproses pemilik.`,
        -amountKt,
      );
      return { ok: true, error: null, wdId: row.id, ktBalance: p.ktBalance - amountKt };
    },
  }),

  cancelWithdrawal: defineGameAction({
    description:
      "Cancels a still-pending withdrawal request and refunds its locked KT to the player's balance.",
    request: z.object({ wdId: z.number().int().positive() }),
    response: resultShape.extend({ ktBalance: z.number() }),
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const rows = await db
        .select()
        .from(schema.wdRequests)
        .where(eq(schema.wdRequests.id, args.wdId))
        .limit(1);
      const wd = rows[0];
      if (!wd) return { ok: false, error: "Permintaan WD tidak ditemukan.", ktBalance: p.ktBalance };
      if (wd.status !== "pending")
        return { ok: false, error: "Hanya WD berstatus Menunggu yang bisa dibatalkan.", ktBalance: p.ktBalance };
      await db
        .update(schema.wdRequests)
        .set({ status: "cancelled", processedAt: new Date() })
        .where(eq(schema.wdRequests.id, wd.id));
      await db
        .update(schema.player)
        .set({ ktBalance: p.ktBalance + wd.amountKt })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "wd_cancel", `WD #${wd.id} dibatalkan pemain — ${wd.amountKt} KT dikembalikan.`, wd.amountKt);
      return { ok: true, error: null, ktBalance: p.ktBalance + wd.amountKt };
    },
  }),

  updateWithdrawal: defineGameAction({
    description:
      "Admin action for the owner: moves a withdrawal through the manual payout flow (pending → approved → paid, or rejected with a full KT refund). Records an optional note and GRAM transaction reference.",
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
    async handler(args) {
      const db = getDb();
      const levels = await loadLevels(db);
      const p = await loadPlayer(db, levels);
      const rows = await db
        .select()
        .from(schema.wdRequests)
        .where(eq(schema.wdRequests.id, args.wdId))
        .limit(1);
      const wd = rows[0];
      if (!wd) return { ok: false, error: "Permintaan WD tidak ditemukan.", status: null };

      if (args.action === "approve") {
        if (wd.status !== "pending")
          return { ok: false, error: "Hanya WD Menunggu yang bisa disetujui.", status: wd.status };
        await db
          .update(schema.wdRequests)
          .set({ status: "approved", adminNote: args.adminNote ?? wd.adminNote })
          .where(eq(schema.wdRequests.id, wd.id));
        await logActivity(db, "wd_approve", `WD #${wd.id} (${wd.amountGram} GRAM) disetujui — siap kirim GRAM manual.`, null);
        return { ok: true, error: null, status: "approved" as const };
      }

      if (args.action === "pay") {
        if (wd.status !== "approved")
          return { ok: false, error: "WD harus Disetujui dulu sebelum ditandai Dibayar.", status: wd.status };
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
          .set({ totalWdPaidGram: p.totalWdPaidGram + wd.amountGram })
          .where(eq(schema.player.id, 1));
        await logActivity(db, "wd_paid", `WD #${wd.id} selesai — ${wd.amountGram} GRAM telah dikirim manual ke dompet pemain.`, null);
        return { ok: true, error: null, status: "paid" as const };
      }

      // reject
      if (wd.status !== "pending" && wd.status !== "approved")
        return { ok: false, error: "WD ini sudah selesai diproses.", status: wd.status };
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
        .set({ ktBalance: p.ktBalance + wd.amountKt })
        .where(eq(schema.player.id, 1));
      await logActivity(db, "wd_reject", `WD #${wd.id} ditolak — ${wd.amountKt} KT dikembalikan ke saldo pemain.`, wd.amountKt);
      return { ok: true, error: null, status: "rejected" as const };
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
): Promise<unknown> {
  const entry = (
    gameActions as Record<
      string,
      { request: z.ZodTypeAny; handler: (args: never) => Promise<unknown> }
    >
  )[action];
  if (!entry) {
    throw new Error(`Aksi tidak dikenal: ${action}`);
  }
  const args = entry.request.parse(input ?? {});
  return entry.handler(args as never);
}
