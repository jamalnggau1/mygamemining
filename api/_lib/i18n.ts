// i18n — server-side user-facing strings (api/_lib/i18n.ts)
//
// The game is translated in three languages: Indonesian ("id"),
// English ("en") and Russian ("ru"). The client has the matching
// dictionary in client/src/i18n.ts.
//
// Rules:
// - The server uses this ONLY for user-facing strings (logActivity
//   messages, action result messages, error strings). Game logic,
//   numbers, prices, timings, and DB writes NEVER depend on lang.
// - `lang` is threaded from dispatchGameAction through every action
//   handler via the Session (session.lang). Default "id" when the
//   client sends nothing or an unsupported value.
// - Numbers are formatted with the language's locale: Indonesian
//   uses "5.000" / "0,025", English uses "5,000" / "0.025".
// - To add a fourth language: add a fourth branch to serverStrings
//   (and to ASTEROID_CLASSES_EN / ASTEROID_NICKNAMES_EN /
//   ANOMALIES_EN + the nameEn/descEn fields on the defs in game.ts),
//   add "xx" to Lang, and add the picker entry in the client.

export type Lang = "id" | "en" | "ru";

export function normalizeLang(v: unknown): Lang {
  if (v === "en" || v === "id" || v === "ru") return v;
  if (typeof v === "string") {
    const base = v.trim().toLowerCase().split("-")[0];
    if (base === "id") return "id";
    if (base === "en") return "en";
    if (base === "ru") return "ru";
  }
  return "id";
}

/** BCP 47 locale for a language (numbers + dates). */
function langLocale(lang: Lang): string {
  return lang === "id" ? "id-ID" : lang === "ru" ? "ru-RU" : "en-US";
}

/** Locale-aware number formatting (max 3 decimals, KT values). */
export function fmtNum(n: number, lang: Lang): string {
  return n.toLocaleString(langLocale(lang), {
    maximumFractionDigits: 3,
  });
}

/** Duration in seconds → "1 jam 5 mnt" (id) / "1 hr 5 min" (en).
 *  Server-side twin of the client's fmtDur in client/src/i18n.ts.
 *  Russian uses abbreviations (ч/мин/сек) so no plural declension
 *  is needed. */
export function fmtDur(sec: number, lang: Lang): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (lang === "en") {
    if (h > 0) return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
    if (m > 0) return r > 0 ? `${m} min ${r} sec` : `${m} min`;
    return `${r} sec`;
  }
  if (lang === "ru") {
    if (h > 0) return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
    if (m > 0) return r > 0 ? `${m} мин ${r} сек` : `${m} мин`;
    return `${r} сек`;
  }
  if (h > 0) return m > 0 ? `${h} jam ${m} mnt` : `${h} jam`;
  if (m > 0) return r > 0 ? `${m} mnt ${r} dtk` : `${m} mnt`;
  return `${r} dtk`;
}

/** KT amounts: same as fmtNum (kept as a named alias for clarity). */
export function fmtKtLang(n: number, lang: Lang): string {
  return fmtNum(n, lang);
}

/** Short date, e.g. "19/11/2026" (id) / "11/19/2026" (en) / "19.11.2026" (ru). */
export function fmtDateLang(d: Date, lang: Lang): string {
  return d.toLocaleDateString(langLocale(lang));
}

// --- Asteroid content in English + Russian ---------------------------
// game.ts keeps the Indonesian originals (classes / nicknames /
// anomalies) and the localize* helpers in game.ts pick the English
// or Russian text from these lists when lang is "en" / "ru".

export const ASTEROID_CLASSES_EN: string[][] = [
  ["C-Type — Carbonaceous", "S-Type — Silicate"],
  ["S-Type — Silicate", "C-Type — Carbonaceous", "M-Type — Metallic"],
  ["Dense Lunar Silicate", "S-Type — Silicate"],
  ["M-Type — Pure Metallic"],
  ["D-Type — Dark Ice", "Kuiper Object — Ice Core"],
];

export const ASTEROID_NICKNAMES_EN: string[] = [
  "Silent Crater",
  "Dusk Pillar",
  "Cold Ember",
  "Silent Witness",
  "Far Lantern",
  "Carbon Echo",
  "Iron Horn",
  "Silent Jungle",
  "Cracked Mirror",
  "Orbit Guardian",
  "Dead Lantern",
  "Nickel Hill",
  "Dust River",
  "Ice Tower",
  "Sky Anchor",
  "Rust Garden",
  "Distant Voice",
  "Cracked Dome",
  "Wind Corridor",
  "Silent Fortress",
];

export const ANOMALIES_EN: string[] = [
  "Fragile rock structure — drilling is 20% faster on this asteroid.",
  "A strong magnetic field disturbs the drill arm — drilling is 25% slower on this asteroid.",
  "Strange sensor reflections from the asteroid's core — the technicians say it's just ordinary interference.",
];

export const ASTEROID_CLASSES_RU: string[][] = [
  ["Тип C — углеродистый", "Тип S — силикатный"],
  ["Тип S — силикатный", "Тип C — углеродистый", "Тип M — металлический"],
  ["Плотный лунный силикат", "Тип S — силикатный"],
  ["Тип M — чисто металлический"],
  ["Тип D — тёмный лёд", "Объект Койпера — ледяное ядро"],
];

export const ASTEROID_NICKNAMES_RU: string[] = [
  "Безмолвный кратер",
  "Сумеречный столб",
  "Холодный уголёк",
  "Безмолвный свидетель",
  "Далёкий фонарь",
  "Углеродное эхо",
  "Железный рог",
  "Тихие джунгли",
  "Треснувшее зеркало",
  "Страж орбиты",
  "Погасший фонарь",
  "Никелевый холм",
  "Пылевая река",
  "Ледяная башня",
  "Небесный якорь",
  "Сад ржавчины",
  "Далёкий голос",
  "Треснувший купол",
  "Коридор ветра",
  "Тихая крепость",
];

export const ANOMALIES_RU: string[] = [
  "Хрупкая структура пород — бурение на этом астероиде на 20% быстрее.",
  "Сильное магнитное поле мешает буровому манипулятору — бурение на этом астероиде на 25% медленнее.",
  "Странные отражения сигналов от ядра астероида — техники говорят, что это просто обычные помехи.",
];

// --- Server message dictionary -----------------------------------------

export interface ServerStrings {
  // Telegram session errors
  tgNoBotToken: string;
  tgNoInitData: string;
  tgInvalid: string;
  tgIncomplete: string;
  tgExpired: string;
  // Route errors (api/game.ts)
  routeInvalidJson: string;
  routeInvalidInitData: string;
  routeActionRequired: string;
  routeInvalidArgs: string;
  routeServerError: string;
  // Action errors
  errInvalidAsteroid: string;
  errJobRunning: string;
  errAlreadyScanned: string;
  errEnergyScan: (cost: number, energy: number) => string;
  errEnergyMine: (cost: number, energy: number) => string;
  errScanFirst: string;
  errVeinNotFound: string;
  errVeinMined: string;
  errCompleteJobRunning: string;
  errAbandonJobRunning: string;
  errTravelJobRunning: string;
  errWdOwnerNotFound: string;
  errNoJob: string;
  errJobNotReady: (remaining: number) => string;
  errVeinGone: string;
  errNoJobRunning: string;
  errCompleteNotAllMined: string;
  errAbandonEnergy: (cost: number, energy: number) => string;
  errMapNotFound: string;
  errMapLocked: (minLayer: number, layer: number) => string;
  errAlreadyOnMap: string;
  errTravelEnergy: (cost: number, energy: number) => string;
  errPremiumOrderPending: string;
  errPremiumOrderCreateFail: string;
  errStarsNeedTelegram: string;
  errStarsInvoiceFail: string;
  errStarsWebhookFail: string;
  starsPrecheckoutInvalid: string;
  errGramNeedTelegram: string;
  errGramOrderFail: string;
  errGramOrderInvalid: string;
  errGramTxNotFound: string;
  errGramTxWrongRecipient: string;
  errGramTxWrongAmount: string;
  errGramTxWrongSender: string;
  errGramTxReused: string;
  errGramVerifyFail: string;
  errPremiumOrderNotFound: string;
  errOrderAlreadyProcessed: string;
  errOrderOwnerNotFound: string;
  errPlayerNotFound: string;
  // PvP (2026-11-22)
  errPvpNoEncounter: string;
  errPvpEncounterExpired: string;
  errPvpAttackCooldown: (seconds: number) => string;
  errPvpDefenderShielded: string;
  errPvpDefenderGone: string;
  errPvpTroopNone: (name: string) => string;
  errPvpTroopMaxCount: (name: string) => string;
  errPvpTroopMaxLevel: (name: string) => string;
  /** Nama lawan NPC + penambang tanpa nama, untuk pesan log PvP. */
  pvpPirate: string;
  pvpUnknownMiner: string;
  errDailyBonusClaimed: string;
  errChannelNoTelegram: string;
  errChannelAlreadyClaimed: string;
  errChannelCheckFailed: string;
  errChannelNotJoined: string;
  errAdCapReached: (cap: number) => string;
  errAdCooldown: (seconds: number, cooldown: number) => string;
  errOreUnknown: string;
  errNotEnoughOre: (held: number, oreName: string) => string;
  errCargoEmpty: string;
  errUpgradeUnknown: string;
  errUpgradeMax: (name: string) => string;
  errKtNotEnough: (cost: number, balance: number) => string;
  errWdStep: (step: number, stepUsdt: string, amountKt: number) => string;
  errWalletNotTon: string;
  errWdMinFirst: (
    minKt: number,
    minUsdt: number,
    amountKt: number,
    missing: number,
  ) => string;
  errWdMinRepeat: (paidCount: number, amountKt: number) => string;
  errWdMax: (maxKt: number, amountKt: number) => string;
  errWdBalance: (amountUsdt: number, amountKt: number, balance: number) => string;
  errWdCreateFail: string;
  errWdNotFound: string;
  errWdCancelNotPending: string;
  errWdApproveNotPending: string;
  errWdPayNotApproved: string;
  errWdAlreadyDone: string;
  errAdminOnly: string;
  errUnknownAction: (action: string) => string;
  // Activity log messages
  logScan: (expName: string, veinCount: number) => string;
  logJam: (oreName: string, expName: string) => string;
  logRare: (oreName: string, qty: number, expName: string) => string;
  logHull: (mapName: string, fee: number) => string;
  logExpedition: (
    expName: string,
    bonus: number,
    layer: number,
    newExpName: string,
  ) => string;
  // Ekspedisi selesai TANPA naik sektor (progres belum cukup):
  // log-nya menulis progres, bukan "warp ke sektor baru".
  logExpeditionProgress: (
    expName: string,
    bonus: number,
    progress: number,
    needed: number,
    nextLayer: number,
    newExpName: string,
  ) => string;
  logAbandon: (newExpName: string) => string;
  logTravel: (mapName: string, newExpName: string) => string;
  logPremiumOrder: (label: string, stars: number) => string;
  logPremiumConfirm: (
    stars: number,
    tierLabel: string,
    days: number,
    until: string,
  ) => string;
  logPremiumReject: (orderId: number, stars: number) => string;
  logPremiumCancel: (orderId: number, stars: number) => string;
  logPremiumOrderGram: (label: string, gram: number) => string;
  logPremiumConfirmGram: (
    gram: number,
    tierLabel: string,
    days: number,
    until: string,
  ) => string;
  logPremiumRejectGram: (orderId: number, gram: number) => string;
  logPremiumCancelGram: (orderId: number, gram: number) => string;
  logPremiumGrant: (tierLabel: string, days: number, until: string) => string;
  logDailyBonus: (amount: number) => string;
  logChannelBonus: (amount: number) => string;
  logAd: (amount: number) => string;
  logSell: (qty: number, oreName: string, gained: number) => string;
  logSellAll: (count: number, gained: number) => string;
  logUpgrade: (name: string, level: number) => string;
  logWdRequest: (usdt: number, kt: number) => string;
  logWdCancel: (id: number, kt: number) => string;
  logWdApprove: (id: number, usdt: number) => string;
  logWdPaid: (id: number, usdt: number) => string;
  // Notifikasi Telegram ke pemilik WD (2026-11-24): dikirim dalam
  // bahasa PENERIMA (dari player.language), bukan bahasa admin.
  wdNotifyApproved: (usdt: number) => string;
  wdNotifyPaid: (usdt: number) => string;
  // Pengingat tidak aktif (2026-11-24): sama, per bahasa pemain.
  nudgeText: (url: string) => string;
  logWdReject: (id: number, kt: number) => string;
  // Referral: hadiah 10 KT yang dibayar ke pengundang saat teman
  // yang diundangnya menyelesaikan ekspedisi pertama.
  logReferralReward: (amount: number) => string;
  // Referral: bonus 5 KT untuk YANG DIUNDANG, di momen yang sama.
  logReferralRefereeBonus: (amount: number) => string;
  // PvP (2026-11-22): hasil serang/bertahan (Log Misi) + rampasan
  // yang didapat/hilang (Log Ekonomi). Entri untuk pemain yang
  // diserang ditulis dalam bahasa penyerang (sama seperti log
  // referral/admin — bahasa per pemain tidak disimpan).
  logPvpAttackWin: (defenderName: string, lootKt: number) => string;
  logPvpAttackWinEmpty: (defenderName: string) => string;
  logPvpAttackLose: (defenderName: string) => string;
  logPvpDefendedWin: (attackerName: string) => string;
  logPvpDefendedLose: (attackerName: string, lootKt: number) => string;
  logPvpDefendedLoseEmpty: (attackerName: string) => string;
  logPvpTroopBuy: (name: string, count: number) => string;
  logPvpTroopUpgrade: (name: string, level: number) => string;
  logPvpLootGain: (lootKt: number) => string;
  logPvpLootStolen: (lootKt: number) => string;
  logPvpLootDestroyed: (lootKt: number) => string;
  // Anti-cheat
  tamperScan: string;
  tamperMine: string;
  tamperCollect: string;
  flagNonstop: (hours: number) => string;
  flagMulti: (count: number, max: number) => string;
  flagInstant: string;
  flagTamper: (detail: string) => string;
  flagCleared: string;
}

const id: ServerStrings = {
  tgNoBotToken: "Login Telegram belum dikonfigurasi di server.",
  tgNoInitData: "Data login Telegram tidak ditemukan.",
  tgInvalid: "Data login Telegram tidak valid.",
  tgIncomplete: "Data login Telegram tidak lengkap.",
  tgExpired:
    "Sesi Telegram sudah kedaluwarsa — tutup dan buka lagi Mini App-nya.",
  routeInvalidJson: "Body JSON tidak valid.",
  routeInvalidInitData: "Field 'initData' tidak valid.",
  routeActionRequired: "Field 'action' wajib diisi.",
  routeInvalidArgs: "Argumen tidak valid.",
  routeServerError: "Terjadi kesalahan server.",
  errInvalidAsteroid: "Data asteroid tidak valid, coba muat ulang.",
  errJobRunning:
    "Ada operasi yang sedang berjalan. Selesaikan atau batalkan dulu.",
  errAlreadyScanned:
    "Asteroid ini sudah dipindai — komposisi uratnya sudah terbuka.",
  errEnergyScan: (cost, energy) =>
    `Daya tidak cukup — scan butuh ${cost} daya, kamu punya ${energy}. Tunggu daya pulih (isi ulang memang lambat), naikkan Reaktor Fusi Mini agar isi ulang lebih cepat, atau Tangki O₂ & Baterai Surya agar kapasitas daya lebih besar.`,
  errEnergyMine: (cost, energy) =>
    `Daya tidak cukup — pengeboran urat ini butuh ${cost} daya, kamu punya ${energy}. Tunggu daya pulih (isi ulang memang lambat), naikkan Reaktor Fusi Mini agar isi ulang lebih cepat, atau Tangki O₂ & Baterai Surya agar kapasitas daya lebih besar.`,
  errScanFirst:
    "Pindai asteroid ini dulu — tanpa scan, urat mineralnya tidak terlihat.",
  errVeinNotFound: "Urat mineral itu tidak ada di asteroid ini.",
  errVeinMined: "Urat ini sudah habis ditambang.",
  errCompleteJobRunning: "Selesaikan operasi yang sedang berjalan dulu.",
  errAbandonJobRunning:
    "Batalkan operasi yang sedang berjalan dulu sebelum pindah asteroid.",
  errTravelJobRunning:
    "Batalkan operasi yang sedang berjalan dulu sebelum pindah peta.",
  errWdOwnerNotFound: "Pemain pemilik WD tidak ditemukan.",
  errNoJob: "Tidak ada operasi yang bisa diambil hasilnya.",
  errJobNotReady: (remaining) =>
    `Operasi belum selesai — masih ${remaining} detik lagi. Bor dan spektrometer bekerja dengan waktu nyata.`,
  errVeinGone:
    "Urat target operasi ini sudah tidak tersedia — operasi dibatalkan.",
  errNoJobRunning: "Tidak ada operasi yang sedang berjalan.",
  errCompleteNotAllMined:
    "Tambang semua urat mineral di asteroid ini dulu sebelum warp ke asteroid berikutnya.",
  errAbandonEnergy: (cost, energy) =>
    `Bahan bakar tidak cukup — pindah asteroid butuh ${cost} daya, kamu punya ${energy}.`,
  errMapNotFound: "Peta itu tidak ada di bagan navigasi stasiun.",
  errMapLocked: (minLayer, layer) =>
    `Peta ini terkunci — butuh Sektor ${minLayer}, kamu baru Sektor ${layer}. Selesaikan ekspedisi untuk naik sektor.`,
  errAlreadyOnMap: "Kamu sudah menambang di peta ini.",
  errTravelEnergy: (cost, energy) =>
    `Bahan bakar tidak cukup — perjalanan antar-peta butuh ${cost} daya, kamu punya ${energy}.`,
  errPremiumOrderPending:
    "Masih ada pesanan Premium yang menunggu pembayaran. Selesaikan pembayaran Stars untuk pesanan itu dulu, atau batalkan pesanan itu dari kartu Premium.",
  errPremiumOrderCreateFail: "Gagal membuat pesanan Premium, coba lagi.",
  errStarsNeedTelegram: "Premium Stars hanya bisa dibeli dari dalam Telegram — buka game lewat Mini App Telegram.",
  errStarsInvoiceFail: "Gagal membuat pembayaran Stars, coba lagi.",
  errStarsWebhookFail: "Gagal menghubungkan webhook Stars, coba lagi.",
  starsPrecheckoutInvalid: "Pesanan Premium tidak valid.",
  errGramNeedTelegram: "Premium GRAM hanya bisa dibeli dari dalam Telegram — buka game lewat Mini App Telegram.",
  errGramOrderFail: "Gagal membuat pesanan GRAM, coba lagi.",
  errGramOrderInvalid: "Pesanan ini bukan pesanan GRAM.",
  errGramTxNotFound: "Transaksi GRAM belum ditemukan di blockchain — masih diproses, coba lagi sebentar.",
  errGramTxWrongRecipient: "Transaksi ini tidak dikirim ke dompet pemilik — pembayaran tidak cocok dengan pesanan.",
  errGramTxWrongAmount: "Jumlah GRAM yang dikirim kurang dari harga paket.",
  errGramTxWrongSender: "Transaksi ini tidak berasal dari dompet yang terhubung.",
  errGramTxReused: "Transaksi GRAM ini sudah dipakai untuk pesanan lain.",
  errGramVerifyFail: "Gagal memeriksa transaksi GRAM, coba lagi.",
  errPremiumOrderNotFound: "Pesanan Premium tidak ditemukan.",
  errOrderAlreadyProcessed: "Pesanan ini sudah diproses.",
  errOrderOwnerNotFound: "Pemain pemilik pesanan tidak ditemukan.",
  errPlayerNotFound: "Pemain tidak ditemukan.",
  errPvpNoEncounter: "Tidak ada penawaran pertemuan PvP — selesaikan scan untuk bertemu penambang lain.",
  errPvpEncounterExpired: "Penawaran pertemuan ini sudah kedaluwarsa — selesaikan scan baru untuk bertemu lagi.",
  errPvpAttackCooldown: (seconds) =>
    `Serangan berikutnya baru bisa dalam ${fmtDur(seconds, "id")} lagi — jeda 30 menit antar serangan.`,
  errPvpDefenderShielded: "Penambang ini sedang kebal — ia baru saja diserang, coba pemain lain.",
  errPvpDefenderGone: "Penambang itu sudah tidak bisa diserang — penawarannya dibatalkan.",
  errPvpTroopNone: (name) =>
    `Kamu belum memiliki ${name} — beli dulu sebelum meng-upgrade.`,
  errPvpTroopMaxCount: (name) => `${name} sudah mencapai jumlah maksimum.`,
  errPvpTroopMaxLevel: (name) => `${name} sudah level maksimum.`,
  pvpPirate: "Perompak",
  pvpUnknownMiner: "Penambang Lain",
  errDailyBonusClaimed:
    "Bonus harian sudah diklaim hari ini. Kembali lagi besok!",
  errChannelNoTelegram:
    "Buka lewat Telegram untuk mengklaim bonus channel.",
  errChannelAlreadyClaimed: "Bonus channel sudah diklaim.",
  errChannelCheckFailed:
    "Bonus belum bisa diperiksa — coba lagi nanti.",
  errChannelNotJoined:
    "Kamu belum bergabung dengan channel. Gabung dulu, lalu klaim lagi.",
  errAdCapReached: (cap) =>
    `Batas iklan hari ini sudah tercapai (${cap}× sehari). Hadiah iklan direset besok — kembali lagi ya!`,
  errAdCooldown: (seconds, cooldown) =>
    `Sabar — iklan berikutnya bisa ditonton dalam ${fmtDur(seconds, "id")} lagi (jeda ${fmtDur(cooldown, "id")} antar-iklan).`,
  errOreUnknown: "Jenis mineral tidak dikenal.",
  errNotEnoughOre: (held, oreName) =>
    `Bijih tidak cukup — kamu hanya punya ${held} ${oreName}.`,
  errCargoEmpty: "Kargo kosong — belum ada mineral untuk dijual.",
  errUpgradeUnknown: "Upgrade tidak dikenal.",
  errUpgradeMax: (name) => `${name} sudah level maksimum.`,
  errKtNotEnough: (cost, balance) =>
    `KT tidak cukup — butuh ${fmtNum(cost, "id")} KT, saldo kamu ${fmtNum(balance, "id")} KT.`,
  errWdStep: (step, stepUsdt, amountKt) =>
    `Jumlah WD harus kelipatan ${fmtNum(step, "id")} KT (${stepUsdt} USDT) — ${fmtNum(amountKt, "id")} KT tidak valid.`,
  errWalletNotTon:
    "Alamat itu bukan alamat TON. USDT hanya dikirim lewat jaringan TON — pakai alamat yang diawali EQ atau UQ.",
  errWdMinFirst: (minKt, minUsdt, amountKt, missing) =>
    `Minimum WD pertama adalah ${fmtNum(minKt, "id")} KT (${minUsdt} USDT) — kamu mengajukan ${fmtNum(amountKt, "id")} KT. Kumpulkan ${fmtNum(missing, "id")} KT lagi.`,
  errWdMinRepeat: (paidCount, amountKt) =>
    `Minimum WD setelah WD pertama adalah ${fmtNum(5000, "id")} KT (5 USDT) — kamu sudah ${paidCount}× WD terbayar, jadi minimum WD tetap ${fmtNum(5000, "id")} KT — kamu mengajukan ${fmtNum(amountKt, "id")} KT.`,
  errWdMax: (maxKt, amountKt) =>
    `Maksimum WD adalah ${fmtNum(maxKt, "id")} KT (5 USDT) per WD — kamu mengajukan ${fmtNum(amountKt, "id")} KT. Ajukan ${fmtNum(maxKt, "id")} KT saja.`,
  errWdBalance: (amountUsdt, amountKt, balance) =>
    `Saldo KT tidak cukup — WD ${amountUsdt} USDT butuh ${fmtNum(amountKt, "id")} KT, saldo kamu ${fmtNum(balance, "id")} KT.`,
  errWdCreateFail: "Gagal membuat permintaan WD, coba lagi.",
  errWdNotFound: "Permintaan WD tidak ditemukan.",
  errWdCancelNotPending: "Hanya WD berstatus Menunggu yang bisa dibatalkan.",
  errWdApproveNotPending: "Hanya WD Menunggu yang bisa disetujui.",
  errWdPayNotApproved: "WD harus Disetujui dulu sebelum ditandai Dibayar.",
  errWdAlreadyDone: "WD ini sudah selesai diproses.",
  errAdminOnly: "Aksi ini hanya bisa dilakukan pemilik.",
  errUnknownAction: (action) => `Aksi tidak dikenal: ${action}`,
  logScan: (expName, veinCount) =>
    `Scan ${expName} selesai — ${veinCount} urat mineral terdeteksi.`,
  logJam: (oreName, expName) =>
    `Bor macet saat mengebor urat ${oreName} di ${expName} — urat hilang, mata bor harus diganti.`,
  logRare: (oreName, qty, expName) =>
    `Menambang ${oreName} ×${qty} dari ${expName}!`,
  logHull: (mapName, fee) =>
    `Lambung kapal terkena serpihan di ${mapName} — biaya perbaikan ${fmtNum(fee, "id")} KT.`,
  logExpedition: (expName, bonus, layer, newExpName) =>
    `Ekspedisi ${expName} tuntas. Bonus ${fmtNum(bonus, "id")} KT, warp ke Sektor ${layer}: ${newExpName}.`,
  logExpeditionProgress: (expName, bonus, progress, needed, nextLayer, newExpName) =>
    `Ekspedisi ${expName} tuntas. Bonus ${fmtNum(bonus, "id")} KT, ${progress}/${needed} ekspedisi menuju Sektor ${nextLayer}: ${newExpName}.`,
  logAbandon: (newExpName) =>
    `Meninggalkan asteroid lama, warp ke ${newExpName}.`,
  logTravel: (mapName, newExpName) =>
    `Perjalanan antar-peta ke ${mapName}. Asteroid baru: ${newExpName}.`,
  logPremiumOrder: (label, stars) =>
    `Pesanan Premium ${label} dibuat (${stars} Telegram Stars) — menunggu pembayaran & konfirmasi pemilik.`,
  logPremiumConfirm: (stars, tierLabel, days, until) =>
    `Pembayaran ${stars} Telegram Stars terkonfirmasi — Premium ${tierLabel} ${days} hari aktif sampai ${until}.`,
  logPremiumReject: (orderId, stars) =>
    `Pesanan Premium #${orderId} (${stars} Stars) ditolak pemilik — pembayaran tidak terkonfirmasi.`,
  logPremiumCancel: (orderId, stars) =>
    `Pesanan Premium #${orderId} (${stars} Stars) dibatalkan pemain — tidak ada pembayaran, pesanan dihapus.`,
  logPremiumOrderGram: (label, gram) =>
    `Pesanan Premium ${label} dibuat (${gram} GRAM) — menunggu pembayaran & verifikasi blockchain.`,
  logPremiumConfirmGram: (gram, tierLabel, days, until) =>
    `Pembayaran ${gram} GRAM terkonfirmasi di blockchain — Premium ${tierLabel} ${days} hari aktif sampai ${until}.`,
  logPremiumRejectGram: (orderId, gram) =>
    `Pesanan Premium #${orderId} (${gram} GRAM) ditolak pemilik — pembayaran tidak terkonfirmasi.`,
  logPremiumCancelGram: (orderId, gram) =>
    `Pesanan Premium #${orderId} (${gram} GRAM) dibatalkan pemain — tidak ada pembayaran, pesanan dihapus.`,
  logPremiumGrant: (tierLabel, days, until) =>
    `Pemilik mengaktifkan Premium ${tierLabel} ${days} hari (pembayaran di luar game) — aktif sampai ${until}.`,
  logDailyBonus: (amount) =>
    `Bonus harian ${fmtNum(amount, "id")} KT diklaim.`,
  logChannelBonus: (amount) =>
    `Bonus gabung channel ${fmtNum(amount, "id")} KT diklaim.`,
  logAd: (amount) =>
    `Menonton iklan sponsor — hadiah +${fmtNum(amount, "id")} Daya Kapal.`,
  logSell: (qty, oreName, gained) =>
    `Menjual ${qty} ${oreName} seharga ${fmtNum(gained, "id")} KT.`,
  logSellAll: (count, gained) =>
    `Menjual semua mineral (${count} unit) seharga ${fmtNum(gained, "id")} KT.`,
  logUpgrade: (name, level) => `${name} naik ke level ${level}.`,
  logWdRequest: (usdt, kt) =>
    `Permintaan WD ${usdt} USDT (${fmtNum(kt, "id")} KT) dibuat — menunggu diproses pemilik.`,
  logWdCancel: (id, kt) =>
    `WD #${id} dibatalkan pemain — ${fmtNum(kt, "id")} KT dikembalikan.`,
  logWdApprove: (id, usdt) =>
    `WD #${id} (${usdt} USDT) disetujui — siap kirim USDT manual.`,
  logWdPaid: (id, usdt) =>
    `WD #${id} selesai — ${usdt} USDT telah dikirim manual ke dompet pemain.`,
  wdNotifyApproved: (usdt) =>
    `WD kamu sebesar ${fmtNum(usdt, "id")} USDT sudah disetujui dan sedang diproses.`,
  wdNotifyPaid: (usdt) =>
    `WD kamu sebesar ${fmtNum(usdt, "id")} USDT sudah dibayar. Cek dompetmu!`,
  nudgeText: (url) =>
    `Sudah 3 hari kamu tidak menambang di ASTRA MINING — asteroidmu menunggumu! Buka game dan lanjutkan ekspedisimu.\n${url}`,
  logWdReject: (id, kt) =>
    `WD #${id} ditolak — ${fmtNum(kt, "id")} KT dikembalikan ke saldo pemain.`,
  logReferralReward: (amount) =>
    `Teman yang kamu undang menyelesaikan ekspedisi pertamanya — hadiah referral ${fmtNum(amount, "id")} KT masuk ke saldo.`,
  logReferralRefereeBonus: (amount) =>
    `Kamu menyelesaikan ekspedisi pertamamu lewat undangan teman — bonus referral ${fmtNum(amount, "id")} KT masuk ke saldo.`,
  logPvpAttackWin: (defenderName, lootKt) =>
    `Kamu menyerang ${defenderName} dan MENANG — merampas hasil tambang senilai ${fmtNum(lootKt, "id")} KT.`,
  logPvpAttackWinEmpty: (defenderName) =>
    `Kamu menyerang ${defenderName} dan MENANG — tapi tidak ada hasil tambang yang bisa dirampas.`,
  logPvpAttackLose: (defenderName) =>
    `Kamu menyerang ${defenderName} dan KALAH — kekuatan bertahannya lebih besar.`,
  logPvpDefendedWin: (attackerName) =>
    `${attackerName} menyerangmu tapi pertahananmu menang — hasil tambangmu aman, dan kamu kebal 1 jam.`,
  logPvpDefendedLose: (attackerName, lootKt) =>
    `${attackerName} menyerangmu dan menang — ${fmtNum(lootKt, "id")} KT hasil tambangmu dirampas. Kamu kebal 1 jam.`,
  logPvpDefendedLoseEmpty: (attackerName) =>
    `${attackerName} menyerangmu dan menang — tapi tidak ada hasil tambang yang bisa dirampas. Kamu kebal 1 jam.`,
  logPvpTroopBuy: (name, count) =>
    `${name} ke-${count} dibeli.`,
  logPvpTroopUpgrade: (name, level) => `${name} naik ke level ${level}.`,
  logPvpLootGain: (lootKt) =>
    `Rampasan PvP senilai ${fmtNum(lootKt, "id")} KT masuk ke kargomu.`,
  logPvpLootStolen: (lootKt) =>
    `Hasil tambang senilai ${fmtNum(lootKt, "id")} KT dirampas penyerang dalam PvP.`,
  logPvpLootDestroyed: (lootKt) =>
    `Hasil tambang senilai ${fmtNum(lootKt, "id")} KT hancur dalam pertempuran PvP.`,
  tamperScan: "memulai scan saat operasi masih berjalan",
  tamperMine: "memulai pengeboran saat operasi masih berjalan",
  tamperCollect: "ambil hasil sebelum operasi selesai",
  flagNonstop: (hours) =>
    `Bermain di ${hours} jam berbeda dalam 24 jam terakhir — manusia tidur, bot tidak.`,
  flagMulti: (count, max) =>
    `${count} akun Telegram berbeda dari IP yang sama dalam 24 jam terakhir (batas: ${max}).`,
  flagInstant:
    "10× ambil hasil berturut-turut dalam ≤10 detik setelah operasi selesai — timing metronom seperti bot; manusia bervariasi.",
  flagTamper: (detail) =>
    `5+ percobaan aksi mustahil dalam 24 jam (contoh: ${detail}) — aksinya sudah ditolak server, tapi polanya dicatat.`,
  flagCleared: "Bendera dibersihkan oleh pemilik dari Kendali setelah ditinjau.",
};

const en: ServerStrings = {
  tgNoBotToken: "Telegram login is not configured on the server yet.",
  tgNoInitData: "Telegram login data not found.",
  tgInvalid: "Telegram login data is not valid.",
  tgIncomplete: "Telegram login data is incomplete.",
  tgExpired:
    "Telegram session has expired — close and reopen the Mini App.",
  routeInvalidJson: "Invalid JSON body.",
  routeInvalidInitData: "Invalid 'initData' field.",
  routeActionRequired: "The 'action' field is required.",
  routeInvalidArgs: "Invalid arguments.",
  routeServerError: "A server error occurred.",
  errInvalidAsteroid: "Invalid asteroid data, please reload.",
  errJobRunning:
    "An operation is already running. Finish or cancel it first.",
  errAlreadyScanned:
    "This asteroid has already been scanned — its vein composition is revealed.",
  errEnergyScan: (cost, energy) =>
    `Not enough energy — scanning needs ${cost} energy, you have ${energy}. Wait for energy to recover (recharging is slow), upgrade the Mini Fusion Reactor for faster recharge, or the O₂ Tank & Solar Battery for a larger energy capacity.`,
  errEnergyMine: (cost, energy) =>
    `Not enough energy — drilling this vein needs ${cost} energy, you have ${energy}. Wait for energy to recover (recharging is slow), upgrade the Mini Fusion Reactor for faster recharge, or the O₂ Tank & Solar Battery for a larger energy capacity.`,
  errScanFirst:
    "Scan this asteroid first — without a scan, its mineral veins are hidden.",
  errVeinNotFound: "That mineral vein doesn't exist on this asteroid.",
  errVeinMined: "This vein has already been mined out.",
  errCompleteJobRunning: "Finish the running operation first.",
  errAbandonJobRunning:
    "Cancel the running operation first before moving to another asteroid.",
  errTravelJobRunning:
    "Cancel the running operation first before travelling to another map.",
  errWdOwnerNotFound: "The player who owns this withdrawal was not found.",
  errNoJob: "There is no operation to collect.",
  errJobNotReady: (remaining) =>
    `Operation not finished yet — ${remaining} seconds left. The drill and spectrometer run in real time.`,
  errVeinGone:
    "The target vein of this operation is no longer available — the operation was cancelled.",
  errNoJobRunning: "No operation is currently running.",
  errCompleteNotAllMined:
    "Mine all mineral veins on this asteroid first before warping to the next one.",
  errAbandonEnergy: (cost, energy) =>
    `Not enough fuel — moving to another asteroid needs ${cost} energy, you have ${energy}.`,
  errMapNotFound: "That map doesn't exist on the station's navigation chart.",
  errMapLocked: (minLayer, layer) =>
    `This map is locked — it needs Sector ${minLayer}, you are only at Sector ${layer}. Complete expeditions to raise your sector.`,
  errAlreadyOnMap: "You are already mining on this map.",
  errTravelEnergy: (cost, energy) =>
    `Not enough fuel — inter-map travel needs ${cost} energy, you have ${energy}.`,
  errPremiumOrderPending:
    "You still have a Premium order waiting for payment. Finish paying Stars for that order first, or cancel it from the Premium card.",
  errPremiumOrderCreateFail: "Failed to create the Premium order, please try again.",
  errStarsNeedTelegram: "Stars Premium can only be bought inside Telegram — open the game via the Telegram Mini App.",
  errStarsInvoiceFail: "Could not start the Stars payment, please try again.",
  errStarsWebhookFail: "Could not connect the Stars webhook, please try again.",
  starsPrecheckoutInvalid: "Invalid Premium order.",
  errGramNeedTelegram: "GRAM Premium can only be bought inside Telegram — open the game via the Telegram Mini App.",
  errGramOrderFail: "Failed to create the GRAM order, please try again.",
  errGramOrderInvalid: "This is not a GRAM order.",
  errGramTxNotFound: "The GRAM transaction was not found on the blockchain yet — still processing, please try again shortly.",
  errGramTxWrongRecipient: "This transaction was not sent to the owner's wallet — the payment does not match the order.",
  errGramTxWrongAmount: "The GRAM amount sent is less than the plan price.",
  errGramTxWrongSender: "This transaction did not come from the connected wallet.",
  errGramTxReused: "This GRAM transaction was already used for another order.",
  errGramVerifyFail: "Failed to check the GRAM transaction, please try again.",
  errPremiumOrderNotFound: "Premium order not found.",
  errOrderAlreadyProcessed: "This order has already been processed.",
  errOrderOwnerNotFound: "The player who owns this order was not found.",
  errPlayerNotFound: "Player not found.",
  errPvpNoEncounter: "There is no PvP encounter offer — finish a scan to meet another miner.",
  errPvpEncounterExpired: "This encounter offer has expired — finish a new scan to meet someone again.",
  errPvpAttackCooldown: (seconds) =>
    `Your next attack is available in ${fmtDur(seconds, "en")} — there is a 30-minute gap between attacks.`,
  errPvpDefenderShielded: "This miner is currently immune — they were just attacked, try another player.",
  errPvpDefenderGone: "That miner can no longer be attacked — the offer was cancelled.",
  errPvpTroopNone: (name) =>
    `You do not own any ${name} yet — buy one before upgrading.`,
  errPvpTroopMaxCount: (name) => `${name} is already at the maximum count.`,
  errPvpTroopMaxLevel: (name) => `${name} is already at max level.`,
  pvpPirate: "Pirate",
  pvpUnknownMiner: "Another Miner",
  errDailyBonusClaimed:
    "The daily bonus has already been claimed today. Come back tomorrow!",
  errChannelNoTelegram:
    "Open via Telegram to claim the channel bonus.",
  errChannelAlreadyClaimed: "Channel bonus already claimed.",
  errChannelCheckFailed:
    "The bonus couldn't be checked — try again later.",
  errChannelNotJoined:
    "You haven't joined the channel yet. Join first, then claim again.",
  errAdCapReached: (cap) =>
    `Today's ad limit is reached (${cap}× per day). Ad rewards reset tomorrow — come back then!`,
  errAdCooldown: (seconds, cooldown) =>
    `Hold on — the next ad is available in ${fmtDur(seconds, "en")} (${fmtDur(cooldown, "en")} between ads).`,
  errOreUnknown: "Unknown mineral type.",
  errNotEnoughOre: (held, oreName) =>
    `Not enough ore — you only have ${held} ${oreName}.`,
  errCargoEmpty: "Cargo is empty — no minerals to sell yet.",
  errUpgradeUnknown: "Unknown upgrade.",
  errUpgradeMax: (name) => `${name} is already at max level.`,
  errKtNotEnough: (cost, balance) =>
    `Not enough KT — need ${fmtNum(cost, "en")} KT, your balance is ${fmtNum(balance, "en")} KT.`,
  errWdStep: (step, stepUsdt, amountKt) =>
    `Withdrawal amounts must be multiples of ${fmtNum(step, "en")} KT (${stepUsdt} USDT) — ${fmtNum(amountKt, "en")} KT is not valid.`,
  errWalletNotTon:
    "That is not a TON address. USDT is only sent on the TON network — use an address starting with EQ or UQ.",
  errWdMinFirst: (minKt, minUsdt, amountKt, missing) =>
    `The first withdrawal minimum is ${fmtNum(minKt, "en")} KT (${minUsdt} USDT) — you requested ${fmtNum(amountKt, "en")} KT. Collect ${fmtNum(missing, "en")} more KT.`,
  errWdMinRepeat: (paidCount, amountKt) =>
    `After your first withdrawal the minimum is ${fmtNum(5000, "en")} KT (5 USDT) — you already have ${paidCount} paid withdrawals, so the minimum stays ${fmtNum(5000, "en")} KT — you requested ${fmtNum(amountKt, "en")} KT.`,
  errWdMax: (maxKt, amountKt) =>
    `The maximum withdrawal is ${fmtNum(maxKt, "en")} KT (5 USDT) per withdrawal — you requested ${fmtNum(amountKt, "en")} KT. Request ${fmtNum(maxKt, "en")} KT instead.`,
  errWdBalance: (amountUsdt, amountKt, balance) =>
    `Not enough KT balance — a ${amountUsdt} USDT withdrawal needs ${fmtNum(amountKt, "en")} KT, your balance is ${fmtNum(balance, "en")} KT.`,
  errWdCreateFail: "Failed to create the withdrawal request, please try again.",
  errWdNotFound: "Withdrawal request not found.",
  errWdCancelNotPending: "Only a Pending withdrawal can be cancelled.",
  errWdApproveNotPending: "Only a Pending withdrawal can be approved.",
  errWdPayNotApproved: "A withdrawal must be Approved before it can be marked Paid.",
  errWdAlreadyDone: "This withdrawal has already been processed.",
  errAdminOnly: "Only the owner can do this.",
  errUnknownAction: (action) => `Unknown action: ${action}`,
  logScan: (expName, veinCount) =>
    `Scan of ${expName} complete — ${veinCount} mineral veins detected.`,
  logJam: (oreName, expName) =>
    `Drill jammed while mining the ${oreName} vein on ${expName} — vein lost, the drill bit must be replaced.`,
  logRare: (oreName, qty, expName) =>
    `Mined ${oreName} ×${qty} from ${expName}!`,
  logHull: (mapName, fee) =>
    `Hull hit by debris on ${mapName} — repair cost ${fmtNum(fee, "en")} KT.`,
  logExpedition: (expName, bonus, layer, newExpName) =>
    `Expedition ${expName} complete. Bonus ${fmtNum(bonus, "en")} KT, warping to Sector ${layer}: ${newExpName}.`,
  logExpeditionProgress: (expName, bonus, progress, needed, nextLayer, newExpName) =>
    `Expedition ${expName} complete. Bonus ${fmtNum(bonus, "en")} KT, ${progress}/${needed} expeditions to Sector ${nextLayer}: ${newExpName}.`,
  logAbandon: (newExpName) =>
    `Leaving the old asteroid, warping to ${newExpName}.`,
  logTravel: (mapName, newExpName) =>
    `Inter-map travel to ${mapName}. New asteroid: ${newExpName}.`,
  logPremiumOrder: (label, stars) =>
    `Premium order ${label} created (${stars} Telegram Stars) — awaiting payment & owner confirmation.`,
  logPremiumConfirm: (stars, tierLabel, days, until) =>
    `Payment of ${stars} Telegram Stars confirmed — Premium ${tierLabel} active for ${days} days until ${until}.`,
  logPremiumReject: (orderId, stars) =>
    `Premium order #${orderId} (${stars} Stars) rejected by the owner — payment not confirmed.`,
  logPremiumCancel: (orderId, stars) =>
    `Premium order #${orderId} (${stars} Stars) cancelled by the player — no payment was made, order deleted.`,
  logPremiumOrderGram: (label, gram) =>
    `Premium order ${label} created (${gram} GRAM) — awaiting payment & blockchain verification.`,
  logPremiumConfirmGram: (gram, tierLabel, days, until) =>
    `Payment of ${gram} GRAM confirmed on-chain — Premium ${tierLabel} active for ${days} days until ${until}.`,
  logPremiumRejectGram: (orderId, gram) =>
    `Premium order #${orderId} (${gram} GRAM) rejected by the owner — payment not confirmed.`,
  logPremiumCancelGram: (orderId, gram) =>
    `Premium order #${orderId} (${gram} GRAM) cancelled by the player — no payment was made, order deleted.`,
  logPremiumGrant: (tierLabel, days, until) =>
    `The owner activated Premium ${tierLabel} for ${days} days (payment outside the game) — active until ${until}.`,
  logDailyBonus: (amount) =>
    `Daily bonus of ${fmtNum(amount, "en")} KT claimed.`,
  logChannelBonus: (amount) =>
    `Channel join bonus ${fmtNum(amount, "en")} KT claimed.`,
  logAd: (amount) =>
    `Watched a sponsored ad — reward of +${fmtNum(amount, "en")} Ship Energy.`,
  logSell: (qty, oreName, gained) =>
    `Sold ${qty} ${oreName} for ${fmtNum(gained, "en")} KT.`,
  logSellAll: (count, gained) =>
    `Sold all minerals (${count} units) for ${fmtNum(gained, "en")} KT.`,
  logUpgrade: (name, level) => `${name} upgraded to level ${level}.`,
  logWdRequest: (usdt, kt) =>
    `Withdrawal request of ${usdt} USDT (${fmtNum(kt, "en")} KT) created — waiting for the owner to process it.`,
  logWdCancel: (id, kt) =>
    `WD #${id} cancelled by the player — ${fmtNum(kt, "en")} KT refunded.`,
  logWdApprove: (id, usdt) =>
    `WD #${id} (${usdt} USDT) approved — ready for manual USDT transfer.`,
  logWdPaid: (id, usdt) =>
    `WD #${id} complete — ${usdt} USDT has been sent manually to the player's wallet.`,
  wdNotifyApproved: (usdt) =>
    `Your withdrawal of ${fmtNum(usdt, "en")} USDT has been approved and is being processed.`,
  wdNotifyPaid: (usdt) =>
    `Your withdrawal of ${fmtNum(usdt, "en")} USDT has been paid. Check your wallet!`,
  nudgeText: (url) =>
    `You haven't mined in ASTRA MINING for 3 days — your asteroid is waiting for you! Open the game and continue your expedition.\n${url}`,
  logWdReject: (id, kt) =>
    `WD #${id} rejected — ${fmtNum(kt, "en")} KT refunded to the player's balance.`,
  logReferralReward: (amount) =>
    `A friend you invited completed their first expedition — referral reward of ${fmtNum(amount, "en")} KT added to your balance.`,
  logReferralRefereeBonus: (amount) =>
    `You completed your first expedition via a friend's invite — referral bonus of ${fmtNum(amount, "en")} KT added to your balance.`,
  logPvpAttackWin: (defenderName, lootKt) =>
    `You attacked ${defenderName} and WON — looting ore worth ${fmtNum(lootKt, "en")} KT.`,
  logPvpAttackWinEmpty: (defenderName) =>
    `You attacked ${defenderName} and WON — but there was no ore to loot.`,
  logPvpAttackLose: (defenderName) =>
    `You attacked ${defenderName} and LOST — their defense was stronger.`,
  logPvpDefendedWin: (attackerName) =>
    `${attackerName} attacked you but your defense won — your ore is safe, and you are immune for 1 hour.`,
  logPvpDefendedLose: (attackerName, lootKt) =>
    `${attackerName} attacked you and won — ${fmtNum(lootKt, "en")} KT of your ore was looted. You are immune for 1 hour.`,
  logPvpDefendedLoseEmpty: (attackerName) =>
    `${attackerName} attacked you and won — but there was no ore to loot. You are immune for 1 hour.`,
  logPvpTroopBuy: (name, count) =>
    `${name} #${count} bought.`,
  logPvpTroopUpgrade: (name, level) => `${name} upgraded to level ${level}.`,
  logPvpLootGain: (lootKt) =>
    `PvP loot worth ${fmtNum(lootKt, "en")} KT added to your cargo.`,
  logPvpLootStolen: (lootKt) =>
    `Ore worth ${fmtNum(lootKt, "en")} KT was looted by an attacker in PvP.`,
  logPvpLootDestroyed: (lootKt) =>
    `Ore worth ${fmtNum(lootKt, "en")} KT was destroyed in a PvP battle.`,
  tamperScan: "starting a scan while an operation was running",
  tamperMine: "starting a mining job while an operation was running",
  tamperCollect: "collecting before the operation finished",
  flagNonstop: (hours) =>
    `Played in ${hours} different hours in the last 24 hours — humans sleep, bots don't.`,
  flagMulti: (count, max) =>
    `${count} different Telegram accounts from the same IP in the last 24 hours (limit: ${max}).`,
  flagInstant:
    "10 consecutive collects within ≤10 seconds after operations finished — metronome timing like a bot; humans vary.",
  flagTamper: (detail) =>
    `5+ impossible-action attempts in 24 hours (e.g. ${detail}) — the actions were already rejected by the server, but the pattern is recorded.`,
  flagCleared: "Flag cleared by the owner from Control after review.",
};

/** Return the server string dictionary for a language. */
const ru: ServerStrings = {
  tgNoBotToken: "Вход через Telegram пока не настроен на сервере.",
  tgNoInitData: "Данные входа Telegram не найдены.",
  tgInvalid: "Данные входа Telegram недействительны.",
  tgIncomplete: "Данные входа Telegram неполные.",
  tgExpired:
    "Сессия Telegram истекла — закрой и снова открой Mini App.",
  routeInvalidJson: "Неверный JSON в теле запроса.",
  routeInvalidInitData: "Неверное поле 'initData'.",
  routeActionRequired: "Поле 'action' обязательно.",
  routeInvalidArgs: "Неверные аргументы.",
  routeServerError: "Произошла ошибка сервера.",
  errInvalidAsteroid: "Неверные данные астероида, обнови страницу.",
  errJobRunning:
    "Операция уже выполняется. Заверши её или отмени.",
  errAlreadyScanned:
    "Этот астероид уже просканирован — состав жил уже открыт.",
  errEnergyScan: (cost, energy) =>
    `Не хватает энергии — сканирование требует ${cost} энергии, а у тебя ${energy}. Подожди, пока энергия восстановится (зарядка медленная), улучши Мини-реактор синтеза, чтобы заряжаться быстрее, или Бак O₂ и Солнечную батарею, чтобы увеличить запас энергии.`,
  errEnergyMine: (cost, energy) =>
    `Не хватает энергии — бурение этой жилы требует ${cost} энергии, а у тебя ${energy}. Подожди, пока энергия восстановится (зарядка медленная), улучши Мини-реактор синтеза, чтобы заряжаться быстрее, или Бак O₂ и Солнечную батарею, чтобы увеличить запас энергии.`,
  errScanFirst:
    "Сначала просканируй этот астероид — без скана жилы не видны.",
  errVeinNotFound: "Такой жилы нет на этом астероиде.",
  errVeinMined: "Эта жила уже выработана.",
  errCompleteJobRunning: "Сначала заверши текущую операцию.",
  errAbandonJobRunning:
    "Сначала отмени текущую операцию, прежде чем переходить к другому астероиду.",
  errTravelJobRunning:
    "Сначала отмени текущую операцию, прежде чем лететь на другую карту.",
  errWdOwnerNotFound: "Игрок, которому принадлежит этот вывод, не найден.",
  errNoJob: "Нет операции, результат которой можно забрать.",
  errJobNotReady: (remaining) =>
    `Операция ещё не завершена — осталось ещё ${remaining} сек. Бур и спектрометр работают в реальном времени.`,
  errVeinGone:
    "Целевая жила этой операции больше недоступна — операция отменена.",
  errNoJobRunning: "Сейчас нет выполняющейся операции.",
  errCompleteNotAllMined:
    "Сначала добудь все жилы на этом астероиде, прежде чем лететь к следующему.",
  errAbandonEnergy: (cost, energy) =>
    `Не хватает топлива — переход к другому астероиду требует ${cost} энергии, а у тебя ${energy}.`,
  errMapNotFound: "Такой карты нет в навигационной схеме станции.",
  errMapLocked: (minLayer, layer) =>
    `Эта карта закрыта — нужен Сектор ${minLayer}, а у тебя только Сектор ${layer}. Завершай экспедиции, чтобы повысить сектор.`,
  errAlreadyOnMap: "Ты уже добываешь на этой карте.",
  errTravelEnergy: (cost, energy) =>
    `Не хватает топлива — перелёт между картами требует ${cost} энергии, а у тебя ${energy}.`,
  errPremiumOrderPending:
    "У тебя ещё есть заказ Premium, ожидающий оплаты. Сначала оплати его в Stars или отмени заказ в карточке Premium.",
  errPremiumOrderCreateFail: "Не удалось создать заказ Premium, попробуй ещё раз.",
  errStarsNeedTelegram: "Premium за Stars можно купить только в Telegram — открой игру через Mini App в Telegram.",
  errStarsInvoiceFail: "Не удалось создать оплату в Stars, попробуй ещё раз.",
  errStarsWebhookFail: "Не удалось подключить webhook Stars, попробуй ещё раз.",
  starsPrecheckoutInvalid: "Неверный заказ Premium.",
  errGramNeedTelegram: "Premium за GRAM можно купить только в Telegram — открой игру через Mini App в Telegram.",
  errGramOrderFail: "Не удалось создать заказ GRAM, попробуй ещё раз.",
  errGramOrderInvalid: "Это не заказ GRAM.",
  errGramTxNotFound: "Транзакция GRAM пока не найдена в блокчейне — она ещё обрабатывается, попробуй чуть позже.",
  errGramTxWrongRecipient: "Эта транзакция отправлена не на кошелёк владельца — оплата не совпадает с заказом.",
  errGramTxWrongAmount: "Отправленная сумма GRAM меньше цены пакета.",
  errGramTxWrongSender: "Эта транзакция пришла не с подключённого кошелька.",
  errGramTxReused: "Эта транзакция GRAM уже использована для другого заказа.",
  errGramVerifyFail: "Не удалось проверить транзакцию GRAM, попробуй ещё раз.",
  errPremiumOrderNotFound: "Заказ Premium не найден.",
  errOrderAlreadyProcessed: "Этот заказ уже обработан.",
  errOrderOwnerNotFound: "Игрок, которому принадлежит этот заказ, не найден.",
  errPlayerNotFound: "Игрок не найден.",
  errPvpNoEncounter: "Нет предложений PvP-встреч — заверши скан, чтобы встретить другого шахтёра.",
  errPvpEncounterExpired: "Это предложение встречи истекло — заверши новый скан, чтобы встретить кого-нибудь снова.",
  errPvpAttackCooldown: (seconds) =>
    `Следующая атака будет доступна через ${fmtDur(seconds, "ru")} — перерыв между атаками 30 минут.`,
  errPvpDefenderShielded: "Этот шахтёр сейчас неуязвим — его только что атаковали, попробуй другого игрока.",
  errPvpDefenderGone: "Этого шахтёра больше нельзя атаковать — предложение отменено.",
  errPvpTroopNone: (name) =>
    `У тебя ещё нет: ${name} — сначала купи, потом улучшай.`,
  errPvpTroopMaxCount: (name) => `${name} уже в максимальном количестве.`,
  errPvpTroopMaxLevel: (name) => `${name} уже на максимальном уровне.`,
  pvpPirate: "Пират",
  pvpUnknownMiner: "Другой шахтёр",
  errDailyBonusClaimed:
    "Ежедневный бонус на сегодня уже получен. Возвращайся завтра!",
  errChannelNoTelegram:
    "Откройте через Telegram, чтобы получить награду канала.",
  errChannelAlreadyClaimed: "Награда канала уже получена.",
  errChannelCheckFailed:
    "Не удалось проверить награду — попробуйте позже.",
  errChannelNotJoined:
    "Вы ещё не вступили в канал. Вступите, а потом заберите награду.",
  errAdCapReached: (cap) =>
    `Лимит рекламы на сегодня исчерпан (${cap}× в день). Награды за рекламу обновятся завтра — возвращайся!`,
  errAdCooldown: (seconds, cooldown) =>
    `Подожди — следующая реклама будет доступна через ${fmtDur(seconds, "ru")} (перерыв ${fmtDur(cooldown, "ru")} между рекламой).`,
  errOreUnknown: "Неизвестный тип минерала.",
  errNotEnoughOre: (held, oreName) =>
    `Не хватает руды — у тебя только ${held} ${oreName}.`,
  errCargoEmpty: "Груз пуст — продавать пока нечего.",
  errUpgradeUnknown: "Неизвестное улучшение.",
  errUpgradeMax: (name) => `${name} уже на максимальном уровне.`,
  errKtNotEnough: (cost, balance) =>
    `Не хватает KT — нужно ${fmtNum(cost, "ru")} KT, а у тебя ${fmtNum(balance, "ru")} KT.`,
  errWdStep: (step, stepUsdt, amountKt) =>
    `Сумма вывода должна быть кратна ${fmtNum(step, "ru")} KT (${stepUsdt} USDT) — ${fmtNum(amountKt, "ru")} KT не подходит.`,
  errWalletNotTon:
    "Это не адрес TON. USDT отправляется только в сети TON — используйте адрес, начинающийся с EQ или UQ.",
  errWdMinFirst: (minKt, minUsdt, amountKt, missing) =>
    `Минимальный первый вывод — ${fmtNum(minKt, "ru")} KT (${minUsdt} USDT), а ты запросил ${fmtNum(amountKt, "ru")} KT. Добудь ещё ${fmtNum(missing, "ru")} KT.`,
  errWdMinRepeat: (paidCount, amountKt) =>
    `После первого вывода минимум — ${fmtNum(5000, "ru")} KT (5 USDT). У тебя уже ${paidCount} оплаченных выводов, так что минимум остаётся ${fmtNum(5000, "ru")} KT, а ты запросил ${fmtNum(amountKt, "ru")} KT.`,
  errWdMax: (maxKt, amountKt) =>
    `Максимальный вывод — ${fmtNum(maxKt, "ru")} KT (5 USDT) за один вывод, а ты запросил ${fmtNum(amountKt, "ru")} KT. Запроси ${fmtNum(maxKt, "ru")} KT.`,
  errWdBalance: (amountUsdt, amountKt, balance) =>
    `Не хватает баланса KT — для вывода ${amountUsdt} USDT нужно ${fmtNum(amountKt, "ru")} KT, а у тебя ${fmtNum(balance, "ru")} KT.`,
  errWdCreateFail: "Не удалось создать запрос на вывод, попробуй ещё раз.",
  errWdNotFound: "Запрос на вывод не найден.",
  errWdCancelNotPending: "Отменить можно только вывод в статусе «Ожидание».",
  errWdApproveNotPending: "Одобрить можно только вывод в статусе «Ожидание».",
  errWdPayNotApproved: "Вывод должен быть сначала одобрен, прежде чем его можно отметить оплаченным.",
  errWdAlreadyDone: "Этот вывод уже обработан.",
  errAdminOnly: "Это может делать только владелец.",
  errUnknownAction: (action) => `Неизвестное действие: ${action}`,
  logScan: (expName, veinCount) =>
    `Скан ${expName} завершён — обнаружено жил: ${veinCount}.`,
  logJam: (oreName, expName) =>
    `Бур заклинило при бурении жилы ${oreName} на ${expName} — жила потеряна, бур нужно заменить.`,
  logRare: (oreName, qty, expName) =>
    `Добыто: ${oreName} ×${qty} с ${expName}!`,
  logHull: (mapName, fee) =>
    `Корпус корабля пострадал от обломков на ${mapName} — ремонт: ${fmtNum(fee, "ru")} KT.`,
  logExpedition: (expName, bonus, layer, newExpName) =>
    `Экспедиция ${expName} завершена. Бонус ${fmtNum(bonus, "ru")} KT, перелёт в Сектор ${layer}: ${newExpName}.`,
  logExpeditionProgress: (expName, bonus, progress, needed, nextLayer, newExpName) =>
    `Экспедиция ${expName} завершена. Бонус ${fmtNum(bonus, "ru")} KT, ${progress}/${needed} экспедиций до Сектора ${nextLayer}: ${newExpName}.`,
  logAbandon: (newExpName) =>
    `Покидаешь старый астероид, перелёт к ${newExpName}.`,
  logTravel: (mapName, newExpName) =>
    `Перелёт на другую карту: ${mapName}. Новый астероид: ${newExpName}.`,
  logPremiumOrder: (label, stars) =>
    `Заказ Premium ${label} создан (${stars} Telegram Stars) — ожидание оплаты и подтверждения владельца.`,
  logPremiumConfirm: (stars, tierLabel, days, until) =>
    `Оплата ${stars} Telegram Stars подтверждена — Premium ${tierLabel} активен ${days} дн. до ${until}.`,
  logPremiumReject: (orderId, stars) =>
    `Заказ Premium #${orderId} (${stars} Stars) отклонён владельцем — оплата не подтверждена.`,
  logPremiumCancel: (orderId, stars) =>
    `Заказ Premium #${orderId} (${stars} Stars) отменён игроком — оплаты не было, заказ удалён.`,
  logPremiumOrderGram: (label, gram) =>
    `Заказ Premium ${label} создан (${gram} GRAM) — ожидание оплаты и проверки в блокчейне.`,
  logPremiumConfirmGram: (gram, tierLabel, days, until) =>
    `Оплата ${gram} GRAM подтверждена в блокчейне — Premium ${tierLabel} активен ${days} дн. до ${until}.`,
  logPremiumRejectGram: (orderId, gram) =>
    `Заказ Premium #${orderId} (${gram} GRAM) отклонён владельцем — оплата не подтверждена.`,
  logPremiumCancelGram: (orderId, gram) =>
    `Заказ Premium #${orderId} (${gram} GRAM) отменён игроком — оплаты не было, заказ удалён.`,
  logPremiumGrant: (tierLabel, days, until) =>
    `Владелец активировал Premium ${tierLabel} на ${days} дн. (оплата вне игры) — активен до ${until}.`,
  logDailyBonus: (amount) =>
    `Ежедневный бонус ${fmtNum(amount, "ru")} KT получен.`,
  logChannelBonus: (amount) =>
    `Награда за вступление в канал ${fmtNum(amount, "ru")} KT получена.`,
  logAd: (amount) =>
    `Просмотр спонсорской рекламы — награда +${fmtNum(amount, "ru")} энергии корабля.`,
  logSell: (qty, oreName, gained) =>
    `Продано: ${qty} ${oreName} за ${fmtNum(gained, "ru")} KT.`,
  logSellAll: (count, gained) =>
    `Проданы все минералы (${count} шт.) за ${fmtNum(gained, "ru")} KT.`,
  logUpgrade: (name, level) => `${name} улучшен до уровня ${level}.`,
  logWdRequest: (usdt, kt) =>
    `Запрос на вывод ${usdt} USDT (${fmtNum(kt, "ru")} KT) создан — ожидание обработки владельцем.`,
  logWdCancel: (id, kt) =>
    `Вывод #${id} отменён игроком — ${fmtNum(kt, "ru")} KT возвращены.`,
  logWdApprove: (id, usdt) =>
    `Вывод #${id} (${usdt} USDT) одобрен — готов к ручной отправке USDT.`,
  logWdPaid: (id, usdt) =>
    `Вывод #${id} завершён — ${usdt} USDT отправлены вручную на кошелёк игрока.`,
  wdNotifyApproved: (usdt) =>
    `Твой вывод на ${fmtNum(usdt, "ru")} USDT одобрен и обрабатывается.`,
  wdNotifyPaid: (usdt) =>
    `Твой вывод на ${fmtNum(usdt, "ru")} USDT оплачен. Проверь кошелёк!`,
  nudgeText: (url) =>
    `Ты не добывал в ASTRA MINING уже 3 дня — твой астероид ждёт тебя! Открой игру и продолжи экспедицию.\n${url}`,
  logWdReject: (id, kt) =>
    `Вывод #${id} отклонён — ${fmtNum(kt, "ru")} KT возвращены на баланс игрока.`,
  logReferralReward: (amount) =>
    `Приглашённый тобой друг завершил свою первую экспедицию — реферальная награда ${fmtNum(amount, "ru")} KT добавлена на баланс.`,
  logReferralRefereeBonus: (amount) =>
    `Ты завершил свою первую экспедицию по приглашению друга — реферальный бонус ${fmtNum(amount, "ru")} KT добавлен на баланс.`,
  logPvpAttackWin: (defenderName, lootKt) =>
    `Ты атаковал ${defenderName} и ПОБЕДИЛ, захватив добычу на ${fmtNum(lootKt, "ru")} KT.`,
  logPvpAttackWinEmpty: (defenderName) =>
    `Ты атаковал ${defenderName} и ПОБЕДИЛ, но добычи не было.`,
  logPvpAttackLose: (defenderName) =>
    `Ты атаковал ${defenderName} и ПРОИГРАЛ — его защита оказалась сильнее.`,
  logPvpDefendedWin: (attackerName) =>
    `${attackerName} атаковал тебя, но твоя защита победила — добыча в безопасности, у тебя защита на 1 час.`,
  logPvpDefendedLose: (attackerName, lootKt) =>
    `${attackerName} атаковал тебя и победил — у тебя отняли добычу на ${fmtNum(lootKt, "ru")} KT. У тебя защита на 1 час.`,
  logPvpDefendedLoseEmpty: (attackerName) =>
    `${attackerName} атаковал тебя и победил, но добычи не было. У тебя защита на 1 час.`,
  logPvpTroopBuy: (name, count) =>
    `${name} №${count} куплен.`,
  logPvpTroopUpgrade: (name, level) => `${name} улучшен до уровня ${level}.`,
  logPvpLootGain: (lootKt) =>
    `Добыча PvP на ${fmtNum(lootKt, "ru")} KT добавлена в твой груз.`,
  logPvpLootStolen: (lootKt) =>
    `Добыча на ${fmtNum(lootKt, "ru")} KT отнята нападающим в PvP.`,
  logPvpLootDestroyed: (lootKt) =>
    `Добыча на ${fmtNum(lootKt, "ru")} KT уничтожена в бою PvP.`,
  tamperScan: "начало скана во время выполнения операции",
  tamperMine: "начало бурения во время выполнения операции",
  tamperCollect: "забор результата до завершения операции",
  flagNonstop: (hours) =>
    `Играл в ${hours} разных часов за последние 24 часа — люди спят, боты нет.`,
  flagMulti: (count, max) =>
    `${count} разных аккаунтов Telegram с одного IP за последние 24 часа (лимит: ${max}).`,
  flagInstant:
    "10 сборов подряд в течение ≤10 секунд после завершения операций — точность метронома, как у бота; люди так не делают.",
  flagTamper: (detail) =>
    `5+ попыток невозможных действий за 24 часа (например: ${detail}) — действия уже отклонены сервером, но шаблон поведения записан.`,
  flagCleared: "Флаг снят владельцем из Центра управления после проверки.",
};

export function serverStrings(lang: Lang): ServerStrings {
  return lang === "ru" ? ru : lang === "en" ? en : id;
}
