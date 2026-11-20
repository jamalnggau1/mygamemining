// i18n — server-side user-facing strings (api/_lib/i18n.ts)
//
// The game is translated in two languages: Indonesian ("id") and
// English ("en"). The client has the matching dictionary in
// client/src/i18n.ts.
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
// - To add a third language: add a third branch to serverStrings
//   (and to ASTEROID_CLASSES_EN / ASTEROID_NICKNAMES_EN /
//   ANOMALIES_EN + the nameEn/descEn fields on the defs in game.ts),
//   add "xx" to Lang, and add the picker entry in the client.

export type Lang = "id" | "en";

export function normalizeLang(v: unknown): Lang {
  if (v === "en" || v === "id") return v;
  if (typeof v === "string") {
    const base = v.trim().toLowerCase().split("-")[0];
    if (base === "id") return "id";
    if (base === "en") return "en";
  }
  return "id";
}

/** Locale-aware number formatting (max 3 decimals, KT values). */
export function fmtNum(n: number, lang: Lang): string {
  return n.toLocaleString(lang === "id" ? "id-ID" : "en-US", {
    maximumFractionDigits: 3,
  });
}

/** Duration in seconds → "1 jam 5 mnt" (id) / "1 hr 5 min" (en).
 *  Server-side twin of the client's fmtDur in client/src/i18n.ts. */
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
  if (h > 0) return m > 0 ? `${h} jam ${m} mnt` : `${h} jam`;
  if (m > 0) return r > 0 ? `${m} mnt ${r} dtk` : `${m} mnt`;
  return `${r} dtk`;
}

/** KT amounts: same as fmtNum (kept as a named alias for clarity). */
export function fmtKtLang(n: number, lang: Lang): string {
  return fmtNum(n, lang);
}

/** Short date, e.g. "19/11/2026" (id) / "11/19/2026" (en). */
export function fmtDateLang(d: Date, lang: Lang): string {
  return d.toLocaleDateString(lang === "id" ? "id-ID" : "en-US");
}

// --- Asteroid content in English ---------------------------------------
// game.ts keeps the Indonesian originals (classes / nicknames /
// anomalies) and the localize* helpers in game.ts pick the English
// text from these lists when lang === "en".

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
  errDailyBonusClaimed: string;
  errAdCapReached: (cap: number) => string;
  errAdCooldown: (seconds: number, cooldown: number) => string;
  errOreUnknown: string;
  errNotEnoughOre: (held: number, oreName: string) => string;
  errCargoEmpty: string;
  errUpgradeUnknown: string;
  errUpgradeMax: (name: string) => string;
  errKtNotEnough: (cost: number, balance: number) => string;
  errWdStep: (step: number, stepUsdt: string, amountKt: number) => string;
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
  logAd: (amount: number) => string;
  logSell: (qty: number, oreName: string, gained: number) => string;
  logSellAll: (count: number, gained: number) => string;
  logUpgrade: (name: string, level: number) => string;
  logWdRequest: (usdt: number, kt: number) => string;
  logWdCancel: (id: number, kt: number) => string;
  logWdApprove: (id: number, usdt: number) => string;
  logWdPaid: (id: number, usdt: number) => string;
  logWdReject: (id: number, kt: number) => string;
  // Referral: hadiah 10 KT yang dibayar ke pengundang saat teman
  // yang diundangnya menyelesaikan ekspedisi pertama.
  logReferralReward: (amount: number) => string;
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
    `Daya tidak cukup — scan butuh ${cost} daya, kamu punya ${energy}. Tunggu daya pulih, atau naikkan Reaktor (isi ulang lebih cepat) / Tangki O₂ (kapasitas lebih besar).`,
  errEnergyMine: (cost, energy) =>
    `Daya tidak cukup — pengeboran urat ini butuh ${cost} daya, kamu punya ${energy}. Tunggu daya pulih, atau naikkan Reaktor (isi ulang lebih cepat) / Tangki O₂ (kapasitas lebih besar).`,
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
  errDailyBonusClaimed:
    "Bonus harian sudah diklaim hari ini. Kembali lagi besok!",
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
  logAd: (amount) =>
    `Menonton iklan sponsor — hadiah ${fmtNum(amount, "id")} KT masuk ke saldo.`,
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
  logWdReject: (id, kt) =>
    `WD #${id} ditolak — ${fmtNum(kt, "id")} KT dikembalikan ke saldo pemain.`,
  logReferralReward: (amount) =>
    `Teman yang kamu undang menyelesaikan ekspedisi pertamanya — hadiah referral ${fmtNum(amount, "id")} KT masuk ke saldo.`,
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
    `Not enough energy — scanning needs ${cost} energy, you have ${energy}. Wait for energy to recover, or upgrade the Reactor (faster recharge) / O₂ Tank (bigger capacity).`,
  errEnergyMine: (cost, energy) =>
    `Not enough energy — drilling this vein needs ${cost} energy, you have ${energy}. Wait for energy to recover, or upgrade the Reactor (faster recharge) / O₂ Tank (bigger capacity).`,
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
  errDailyBonusClaimed:
    "The daily bonus has already been claimed today. Come back tomorrow!",
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
  logAd: (amount) =>
    `Watched a sponsored ad — reward of ${fmtNum(amount, "en")} KT added to balance.`,
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
  logWdReject: (id, kt) =>
    `WD #${id} rejected — ${fmtNum(kt, "en")} KT refunded to the player's balance.`,
  logReferralReward: (amount) =>
    `A friend you invited completed their first expedition — referral reward of ${fmtNum(amount, "en")} KT added to your balance.`,
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
export function serverStrings(lang: Lang): ServerStrings {
  return lang === "en" ? en : id;
}
