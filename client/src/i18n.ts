// i18n — client-side dictionaries + language plumbing (client/src/i18n.ts)
//
// The game is translated in two languages: Indonesian ("id") and
// English ("en"). The server has the matching dictionary in
// api/_lib/i18n.ts (logActivity messages, action results, errors).
//
// Rules:
// - Every user-visible client string lives in DICTS below — no
//   hardcoded Indonesian/English UI string may remain in App.tsx
//   (or api.ts) outside this file.
// - `t(key, vars)` interpolates {vars}; `trich(key, vars)` does the
//   same and renders **bold** / *italic* markup as <b>/<em>.
// - Language resolution order (contract): saved choice in
//   localStorage first, else Telegram WebApp
//   initDataUnsafe.user.language_code ('id' → id, anything else
//   supported → that language), else browser navigator.language
//   ('id' → id), else 'en'. Every change is persisted to
//   localStorage and sent to the server on every /api/game request
//   (see client/src/api.ts) so server-written messages match.
// - To add a third language: add one dictionary to DICTS, add its
//   code to LANGS (the picker renders from LANGS), and add the
//   server dictionary in api/_lib/i18n.ts. Nothing else changes.

import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "id" | "en";

/** Languages offered in the header picker (label = language code). */
export const LANGS: { code: Lang; label: string }[] = [
  { code: "id", label: "ID" },
  { code: "en", label: "EN" },
];

const LANG_KEY = "astra-mining-lang";

export function normalizeLang(v: unknown): Lang {
  if (v === "en" || v === "id") return v;
  if (typeof v === "string") {
    const base = v.trim().toLowerCase().split("-")[0];
    if (base === "id") return "id";
    if (base === "en") return "en";
  }
  return "en";
}

/** Detect the player's language: localStorage → Telegram
 *  language_code → browser language → "en". */
function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "id" || saved === "en") return saved;
  } catch {
    // localStorage unavailable — fall through to the next source.
  }
  try {
    const tgLang =
      window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    if (tgLang) {
      const base = tgLang.toLowerCase().split("-")[0];
      if (base === "id") return "id";
      if (base === "en") return "en";
    }
  } catch {
    // No Telegram WebApp — fall through.
  }
  try {
    const nav = navigator.language?.toLowerCase().split("-")[0];
    if (nav === "id") return "id";
  } catch {
    // navigator unavailable — default below.
  }
  return "en";
}

/** Current language (module-level so non-component code — api.ts —
 *  can read it; the provider keeps it in sync on every change). */
let currentLang: Lang = detectLang();

export function getCurrentLang(): Lang {
  return currentLang;
}

export function setCurrentLang(lang: Lang): void {
  currentLang = normalizeLang(lang);
  try {
    localStorage.setItem(LANG_KEY, currentLang);
  } catch {
    // localStorage unavailable — the choice just doesn't persist.
  }
}

export type Dict = Record<string, string>;

const id: Dict = {
  sessionWeb: "Sesi: Web — tanpa login Telegram (akun bersama)",
  sessionEmpty: "Sesi: Telegram — login kosong (buka lewat tombol Mini App, bukan link)",
  sessionTelegram: "Sesi: Telegram • ID {id}",
  genericFail: "Gagal, coba lagi.",
  loading: "Menghubungkan ke stasiun orbital…",
  connLost: "Sinyal stasiun terputus",
  connLostDesc: "Koneksi ke server misi gagal. Coba muat ulang.",
  retry: "Coba Lagi",
  serverErrorStatus: "Error server game ({status}).",
  heroEyebrow: "Play-to-Earn • Jelajah Asteroid • Dapatkan USDT",
  heroDesc: "Jelajahi asteroid satu per satu: **scan** komposisinya, **bor urat mineralnya** — setiap operasi butuh waktu nyata — jual hasilnya jadi **Kredit Tambang Antariksa (KT)**, lalu tarik jadi **USDT** asli.",
  balTitle: "Saldo Kredit Antariksa",
  balNeed: "≈ {usdt} USDT · kurang {kt} KT lagi untuk WD",
  balReady: "sudah bisa WD!",
  premiumActive: "PREMIUM {tier} AKTIF",
  dualDrillTag: "PRO · BOR GANDA",
  standardTag: "STANDARD",
  premiumUntilShort: " — s/d {date}",
  activatePremium: "Aktifkan Premium — bor lebih cepat, harga jual +15%",
  missionPos: "Posisi Misi",
  sector: "SEKTOR {n}",
  kmFromEarth: "{km} km dari Bumi",
  shipPower: "Daya Kapal {e}/{m}",
  regenOne: "isi ulang 1 per {dur}",
  fullIn: " · penuh ±{dur}",
  claimDaily: "Klaim Bonus Misi Harian +{kt} KT",
  adPlaying: "Memutar Iklan…",
  adQuotaOut: "Kuota Iklan Hari Ini Habis",
  adNextIn: "Iklan Berikutnya dalam {s} dtk…",
  watchAdBtn: "Tonton Iklan — Dapat +{kt} KT",
  watchAdAria: "Tonton iklan dan dapatkan {kt} KT",
  adCaption: "Tonton iklan sponsor dan dapatkan +{kt} KT — maks {cap}× sehari, jeda {cooldown} antar-iklan. Iklan direset setiap hari.",
  navLabel: "Menu misi",
  tabMine: "Jelajah Asteroid",
  tabMaps: "Peta Tambang",
  tabMarket: "Stasiun Jual",
  tabHangar: "Hanggar",
  tabWd: "WD USDT",
  tabAdmin: "Kendali",
  statDigs: "Operasi tambang selesai",
  statAsteroids: "Asteroid dituntaskan",
  statUsdtPaid: "USDT sudah dibayar",
  rulesTitle: "Aturan Misi & Ekonomi Antariksa",
  rule1: "Kapalmu mengorbit **satu asteroid dalam satu waktu**. Setiap asteroid punya komposisi urat mineral yang berbeda — tidak ada dua asteroid yang sama.",
  rule2: "**Scan dulu, baru bor.** Scan spektrometer membuka jenis, jumlah, kekerasan, dan kekayaan tiap urat. Tanpa scan, urat tidak bisa dibor.",
  rule3: "**Semua operasi memakai waktu nyata.** Scan butuh ±{scanDur}, pengeboran urat butuh waktu sesuai kekerasan batuannya (urat keras & besar = lebih lama). Waktu berjalan di server misi — klik berulang tidak mempercepat apa pun, dan operasi tetap selesai walau halaman ditutup.",
  rule4: "Satu operasi dalam satu waktu. Membatalkan operasi tidak mengembalikan daya yang sudah terpakai.",
  rule5: "**Daya kapal adalah rem utama ekonomi misi.** Setiap scan & bor memakai daya, dan isi ulangnya **sengaja lambat: 1 daya per {regen}** (tangki penuh {maxEnergy} daya butuh ±{fullDur}). Jadi tidak ada yang bisa menambang tanpa henti — semua penambang dibatasi kecepatan isi ulang yang sama.",
  rule6: "**Bedakan dua upgrade daya di Hanggar.** **Tangki O₂ & Baterai Surya** menaikkan *kapasitas* (+6 daya maksimum per level): napas misi lebih panjang, lebih banyak operasi dalam satu sesi, dan daya yang terisi selama kamu pergi tidak terbuang karena tangki cepat penuh — tapi upgrade ini tidak mempercepat isi ulang. **Reaktor Fusi Mini** menaikkan *kecepatan* isi ulang (−10% waktu per level). Mau menunggu lebih singkat? Naikkan Reaktor. Mau sesi menambang lebih panjang? Naikkan Tangki.",
  rule7: "Jual mineral di Stasiun Orbital untuk mendapat **Kredit Tambang Antariksa (KT)**. KT dipakai untuk upgrade kapal & alat di Hanggar, atau ditarik jadi USDT.",
  rule8: "Tambang semua urat dalam satu asteroid untuk menyelesaikan ekspedisi: bonus KT + warp ke sektor yang lebih jauh, tempat mineral langka lebih sering muncul.",
  rule9: "Rasio tetap: **1.000 KT = 1 USDT**, dan jumlah WD bergerak dalam kelipatan 100 KT (0,1 USDT). **Minimum WD dua tingkat:** WD pertamamu 100 KT (0,1 USDT), WD berikutnya minimum 5.000 KT (5 USDT). **Maksimum per WD: 5.000 KT (5 USDT)** — jadi WD ulang selalu tepat 5.000 KT. **Tidak ada batas waktu antar-WD:** seberapa cepat kamu bisa WD tergantung seberapa cepat kamu mengumpulkan KT — makin rajin menambang & makin bagus upgrade-mu, makin cepat 5.000 KT terkumpul. Minimum & maksimum yang berlaku untukmu selalu dihitung server dari riwayat WD terbayarmu, dan tertulis di tab WD USDT.",
  rule10: "WD diproses **manual oleh pemilik misi**. KT dikunci saat pengajuan, pemilik mengirim USDT ke dompetmu lalu menandai Dibayar di Pusat Kendali.",
  rule11: "WD ditolak/dibatalkan = KT kembali utuh. **Anti-cheat:** semua saldo, waktu operasi, harga, dan minimum WD dihitung & divalidasi di server misi — browser hanya mengirim perintah (scan, bor, jual, WD), tidak pernah menentukan hasilnya. Mengedit tampilan atau mengirim angka palsu dari browser tidak mengubah apa pun di server.",
  rule12: "Bonus ekspedisi tiap asteroid tuntas, dan bonus harian {dailyBonus} KT sekali sehari — sengaja kecil, karena sumber KT utama memang hasil tambang, bukan bonus gratis.",
  rule13: "**Iklan sponsor:** tombol Tonton Iklan di kartu saldo memberi +{adReward} KT per tontonan, dibatasi server maks {adCap}× sehari dengan jeda {adCooldown} antar-iklan (maks {adDailyMax} KT/hari) — cukup untuk membantu, tidak cukup untuk menggantikan menambang.",
  rule14: "**Lima peta tambang** terbuka bertahap mengikuti sektormu: Orbit Rendah (Sektor 1) → Sabuk Asteroid (3) → Bulan (6) → Psyche (10) → Sabuk Kuiper (15). Peta yang sudah terbuka bisa dikunjungi lagi kapan pun dari tab Peta Tambang (biaya perjalanan naik mengikuti jarak peta — {travelNear} daya untuk peta terdekat sampai {travelFar} daya untuk yang terjauh; gratis untuk Premium) — tapi asteroid yang sedang kamu tambang akan ditinggalkan tanpa bonus.",
  rule15: "**Setiap peta punya batu mulia khas** yang tidak ditemukan di peta lain — dari Opal Pelangi & Topaz Emas di Orbit Rendah sampai Opal Es Hitam & Kristal Voidium di Sabuk Kuiper. Harga jualnya jauh di atas mineral biasa.",
  rule16: "**Semakin jauh peta, semakin lama semua operasi.** Jarak dan kekerasan batuan membuat scan & pengeboran di Sabuk Asteroid 30% lebih lama dari Orbit Rendah, di Bulan 60%, di Psyche 2× lipat, dan di Sabuk Kuiper 2,5× lipat — waktu pastinya tertulis di kartu setiap peta. **Tantangan juga naik bersama peta.** Peta pertama aman sepenuhnya. Peta berikutnya membawa risiko bor macet (urat hilang), serpihan yang merusak lambung kapal (biaya perbaikan KT), dan radiasi yang menguras daya ekstra. Persentase pastinya tertulis di kartu setiap peta — risiko diputuskan server saat pengeboran dimulai, bukan saat tombol ditekan.",
  rule17: "**Premium Pass** (di Hanggar) dibayar dengan **Telegram Stars**: Standard (150 Stars / 7 hari) memberi regen daya 2× lebih cepat, scan & bor 25% lebih cepat, harga jual +15%, dan perjalanan antar-peta gratis; Pro (500 Stars / 30 hari) menambahkan **Bor Ganda** — dua lengan bor bekerja bersamaan sehingga pengeboran 2× lebih cepat. Premium tidak mengubah rasio WD.",
  logMission: "Log Misi",
  logEconomy: "Log Ekonomi",
  logMissionDesc: "Scan, pengeboran, temuan langka, dan ekspedisi.",
  logEconomyDesc: "Penjualan mineral, upgrade, bonus, iklan, Premium, dan WD.",
  logEmpty: "Belum ada catatan.",
  marketTitle: "Stasiun Orbital — Jual Mineral",
  sellAll: "Jual Semua",
  marketNote: "Harga sudah termasuk bonus Negosiator Stasiun{premium}. Mineral terjual berubah jadi KT.",
  marketNotePremium: " dan bonus Premium +15%",
  perUnitCargo: "KT/unit · di kargo {qty}",
  sell: "Jual",
  sellAllAria: "Jual semua {name}",
  cargoEmpty: "Kargo kosong. Jelajahi asteroid di tab {tab}, lalu kembali ke sini untuk menjual.",
  hanggarCaption: "Hanggar Stasiun — KT yang dibelanjakan tidak bisa di-WD, tapi alat yang lebih canggih membuat scan & bor jauh lebih cepat dan misimu lebih jauh.",
  levelLabel: "Level",
  levelAria: "Level {l} dari {m}",
  needKt: "Butuh {cost} KT — saldo kurang",
  installUpgrade: "Pasang Upgrade — {cost} KT",
  buyAria: "Beli {name} level {l} seharga {cost} KT",
  maxLevel: "Level Maksimum",
  premiumDesc: "Lisensi penambang prioritas stasiun orbital, dibayar dengan **Telegram Stars** — mata uang resmi Telegram, tempat game ini diluncurkan. Premium mempercepat semua yang kamu lakukan — tanpa mengubah rasio WD 1.000 KT = 1 USDT.",
  premBenefit1: "Regen daya 2× lebih cepat — lebih sedikit menunggu, lebih banyak menambang",
  premBenefit2: "Scan & pengeboran 25% lebih cepat di semua peta",
  premBenefit3: "Harga jual semua mineral & batu mulia +15% di Stasiun Orbital",
  premBenefit4: "Perjalanan antar-peta gratis, tanpa biaya daya",
  premDualTitle: "Khusus Pro — Bor Ganda:",
  premDualText: "dua lengan bor bekerja bersamaan, waktu pengeboran setiap urat jadi 2× lebih cepat.",
  premPendingTitle: "Pesanan #{id} — Premium {tier} · {stars} Stars",
  premPendingDesc: "Status: **menunggu pembayaran & konfirmasi pemilik**. Bayar {stars} Telegram Stars ke pemilik di Telegram (kirim tangkapan layar bukti bayar + nomor pesanan #{id}), lalu pemilik mengonfirmasinya dari Pusat Kendali dan Premium-mu langsung aktif.",
  planDays: "{days} hari",
  planProTag: "Semua benefit Standard + BOR GANDA",
  planStdTag: "Regen 2× · operasi 25% lebih cepat · jual +15%",
  planOrderAria: "Pesan Premium {label} seharga {stars} Telegram Stars",
  premiumHowTo: "Cara beli: tekan paketnya untuk membuat pesanan, bayar Stars-nya ke pemilik lewat Telegram, dan pemilik mengaktifkan Premium-mu setelah pembayaran terkonfirmasi. Premium tidak bisa dibeli pakai KT — KT murni untuk upgrade kapal dan WD USDT.",
  premActiveBadge: "{tier} AKTIF",
  mapsTitle: "Bagan Navigasi — Lima Peta Tambang",
  mapsIntro: "Setiap peta punya batu mulia khas dan tantangannya sendiri. Peta terbuka mengikuti sektormu (sekarang **Sektor {layer}**); pindah peta meninggalkan asteroid yang sedang kamu tambang tanpa bonus. Ingat: **semakin jauh petanya, semakin lama scan & pengeborannya** — tapi batu mulianya juga semakin mahal.",
  mapsJobWarning: "Ada operasi yang sedang berjalan — selesaikan atau batalkan dulu sebelum pindah peta.",
  mapNumber: "Peta {n} · {tagline}",
  mapCurrent: "SEDANG DITAMBANG",
  mapLockedBadge: "Sektor {min}",
  mapGemsTitle: "Mineral & batu mulia di peta ini",
  mapChallengesTitle: "Tantangan peta",
  mapSafe: "Aman — tanpa risiko bor macet, kerusakan lambung, atau radiasi. Scan tercepat (±{dur}). Peta belajar terbaik.",
  mapJam: "Bor macet {pct}% per pengeboran — urat yang sedang dibor hilang tanpa hasil.",
  mapDamage: "Lambung terkena serpihan {pct}% — biaya perbaikan {fee} KT dipotong dari saldo.",
  mapRadiation: "Radiasi +{n} daya untuk setiap scan & pengeboran.",
  mapTime: "Jarak jauh & batuan keras — scan ±{dur} dan semua operasi {pct}% lebih lama dari peta pertama.",
  mapTravelBusy: "Operasi sedang berjalan — tidak bisa pindah",
  mapTravelNoEnergy: "Daya kurang — perjalanan butuh {cost} daya",
  mapTravelFree: "Terbang ke Peta Ini — Gratis (Premium)",
  mapTravelCost: "Terbang ke Peta Ini — {cost} daya",
  mapLockedText: "Terkunci — selesaikan ekspedisi sampai Sektor {sector} untuk membuka peta ini",
  mapTravelAria: "Terbang ke peta {name}",
  mapsPremiumCta1: "Premium Pass — perjalanan antar-peta GRATIS",
  mapsPremiumCta2: "Plus regen daya 2× lebih cepat, operasi 25% lebih cepat, dan harga jual +15%. Lihat di Hanggar.",
  chipJam: "Bor macet {pct}%",
  chipDamage: "Risiko lambung {pct}% · perbaikan {fee} KT",
  chipRadiation: "Radiasi +{n} daya/operasi",
  chipTime: "Jarak jauh — scan & bor {pct}% lebih lama",
  chipSafe: "Peta aman — tanpa tantangan, cocok untuk pemula",
  chipsAria: "Tantangan peta aktif",
  veinsMined: "Urat tertambang: {mined} dari {count}",
  asteroidDone: " — asteroid ini sudah tandas.",
  notScannedTitle: "Komposisi Belum Dipindai",
  notScannedDesc: "Radar pasif menangkap pantulan dari **{count} urat mineral**, tapi jenis dan jumlahnya belum diketahui. Jalankan scan spektrometer untuk membuka komposisi asteroid ini — tanpa scan, lengan bor tidak bisa dikunci ke urat mana pun.",
  scanNoEnergy: "Daya kurang — scan butuh {cost} daya",
  startScanBtn: "Mulai Scan Spektrometer — {cost} daya • ±{dur}",
  scanNote: "Scan adalah operasi berwaktu nyata yang dicatat di server misi — sengaja dibuat lama, dan klik berulang tidak mempercepatnya. Mau scan lebih cepat? Naikkan **Spektrometer Inti** di Hanggar (−7% waktu scan per level).",
  anomalyDetected: "Anomali terdeteksi: {text}",
  veinQty: "×{qty} unit",
  veinHardness: "Kekerasan batuan {dots} · Kekayaan urat {rich}%",
  richBonus: " (urat kaya: +1 unit bonus)",
  veinValue: "Perkiraan nilai jual ≈ {kt} KT",
  veinMined: "Sudah Ditambang",
  mineAria: "Bor urat {name}, butuh {cost} daya dan waktu {dur}",
  mineNoEnergy: "Daya kurang — bor butuh {cost} daya",
  mineBtn: "Bor Urat Ini — {cost} daya • ±{dur}",
  completeBtn: "Selesaikan Ekspedisi & Warp ke Asteroid Berikutnya — Bonus +{bonus} KT",
  completeHint: "Tambang semua urat untuk menyelesaikan ekspedisi dan menerima bonus {bonus} KT.",
  abandonBtn: "Tinggalkan asteroid ini & warp ke asteroid lain ({cost} daya, tanpa bonus)",
  lowEnergy: "Daya hampir habis — reaktor sedang mengisi ulang, 1 daya per {dur}. Isi ulang memang sengaja lambat; naikkan Reaktor Fusi Mini di Hanggar untuk mempercepatnya, atau Tangki O₂ & Baterai Surya untuk kapasitas yang lebih besar.",
  jobDone: "Operasi Selesai!",
  jobScanning: "Spektrometer sedang memindai asteroid…",
  jobDualDrill: "Dua lengan bor (BOR GANDA)",
  jobDrillArm: "Lengan bor",
  jobMining: "sedang mengebor urat {ore}…",
  jobRemaining: "Sisa waktu: {dur}",
  jobReadyScan: "Hasil scan sudah siap — buka komposisi urat mineral asteroid ini.",
  jobReadyJammed: "Ada yang tidak beres — suara bor berhenti mendadak di tengah jalan. Ambil laporannya untuk melihat apa yang terjadi.",
  jobReadyHull: "Pengeboran selesai, tapi teknisi melaporkan lambung kapal terkena serpihan selama operasi. Ambil hasil tambang dan laporan perbaikannya.",
  jobReadyMine: "Pengeboran selesai — ambil hasil tambangnya ke kargo.",
  jobRunningNote: "Operasi ini berjalan dengan waktu nyata di server misi. Kamu boleh menutup halaman ini — alat tetap bekerja dan hasilnya bisa diambil saat kamu kembali.",
  jobProgressAria: "Kemajuan operasi",
  jobRunningAria: "Operasi sedang berjalan",
  openScan: "Buka Hasil Scan",
  collectBtn: "Ambil Hasil Tambang",
  cancelJobBtn: "Batalkan Operasi",
  scanStarted: "Spektrometer mulai memindai asteroid — operasi selesai dalam {dur}. Sensor bekerja dengan waktu nyata.",
  mineStarted: "Lengan bor mulai mengebor urat {ore} — selesai dalam {dur}. Kamu boleh menutup halaman, bor tetap bekerja.",
  collectScanDone: "Scan selesai — komposisi urat mineral asteroid terbuka. Pilih urat yang mau dibor.",
  collectJammed: "BOR MACET! Mata bor patah saat mengebor urat {ore} — urat ini hilang tanpa hasil. Risiko khas peta ini; coba urat berikutnya.",
  collectRare: "LANGKA! Dapat {ore} ×{qty} dari urat asteroid!",
  collectRareHull: " Tapi lambung kapal terkena serpihan — biaya perbaikan {fee} KT dipotong dari saldo.",
  collectHull: "Hasil tambang masuk kargo: {ore} ×{qty}. Tapi lambung kapal terkena serpihan tajam — biaya perbaikan {fee} KT dipotong dari saldo.",
  collectOk: "Hasil tambang masuk kargo: {ore} ×{qty}.",
  collectFail: "Belum bisa diambil.",
  jobCancelled: "Operasi dibatalkan. Daya yang sudah terpakai tidak kembali.",
  expeditionDone: "Ekspedisi tuntas! Bonus +{bonus} KT. Warp ke Sektor {layer} — asteroid baru menanti.",
  abandoned: "Warp ke {name} di sektor yang sama.",
  travelDone: "Perjalanan selesai — kamu tiba di peta {map}. Asteroid baru: {name}. Batu mulia & tantangan peta ini sekarang berlaku.",
  premiumOrderCreated: "Pesanan Premium #{id} dibuat — bayar **{stars} Telegram Stars** ke pemilik di Telegram, lalu pemilik mengonfirmasi pesananmu dan Premium langsung aktif.",
  dailyBonusClaimed: "Bonus misi harian +{bonus} KT masuk ke saldo!",
  adRewarded: "Iklan selesai — hadiah +{reward} KT masuk ke saldo! Sisa kuota iklan hari ini: {remaining}×.",
  adUnavailable: "Iklan belum tersedia, coba lagi nanti",
  sellAllDone: "Semua mineral terjual di Stasiun Orbital: +{kt} KT.",
  sellOneDone: "Terjual: +{kt} KT.",
  upgradeBought: "Upgrade terpasang (level {level}) seharga {cost} KT.",
  wdCancelled: "WD dibatalkan — KT dikembalikan ke saldo.",
  wdRequested: "Permintaan WD #{id} terkirim — {kt} KT dikunci dan masuk antrean Pusat Kendali.",
  wdTitle: "Tarik KT jadi USDT",
  wdSubtitle: "Token resmi misi: Kredit Tambang Antariksa (KT)",
  wdRule1: "Rasio tetap **1.000 KT = 1 USDT**, jumlah WD dalam kelipatan 0,1 USDT (100 KT).",
  wdRule3: "**Maksimum 5 USDT (5.000 KT) per WD** — WD ulang selalu tepat 5.000 KT. **Tidak ada batas waktu antar-WD:** seberapa cepat kamu bisa WD tergantung seberapa cepat kamu mengumpulkan KT.",
  wdRule4: "Isi alamat dompet USDT (TON) dan jumlah USDT. KT langsung dikunci.",
  wdRule5: "Permintaan masuk ke Pusat Kendali — pemilik mengirim USDT **secara manual** ke dompetmu.",
  wdRule6: "Status jadi Dibayar setelah pemilik mengirim & mencatat referensi transaksi. Ditolak = KT kembali utuh.",
  wdProgress: "Progres menuju WD ({min} USDT)",
  wdWalletLabel: "Alamat dompet USDT (TON)",
  wdWalletPh: "Tempel alamat dompet USDT",
  wdCostLine: "Biaya: {kt} KT · saldo kamu {bal} KT · minimum saat ini {min} USDT · maksimum {max} USDT per WD",
  wdBelowMin: "Di bawah minimum WD saat ini ({min} USDT / {minkt} KT).",
  wdOffStep: "Jumlah harus kelipatan 0,1 USDT (100 KT).",
  wdAboveMax: "Maksimum WD {max} USDT ({maxkt} KT) per WD.",
  wdCheckAmount: "Periksa jumlah WD dulu",
  wdNotEnough: "Saldo kurang {kt} KT lagi",
  wdWalletShort: "Alamat dompet terlalu pendek — periksa lagi.",
  wdHistory: "Riwayat WD Saya",
  wdHistoryEmpty: "Belum ada permintaan WD. Kumpulkan {min} KT untuk WD pertamamu ({usdt} USDT).",
  wdDateRequested: "KT · diajukan {date}",
  wdDateProcessed: " · diproses {date}",
  wdOwnerNote: "Catatan pemilik: {note}",
  wdRef: "Ref: {ref}",
  wdCancelBtn: "Batalkan & Kembalikan KT",
  wdCancelAria: "Batalkan WD nomor {id}",
  wdStatusPending: "Menunggu",
  wdStatusApproved: "Disetujui — kirim USDT",
  wdStatusPaid: "Sudah Dibayar",
  wdStatusRejected: "Ditolak",
  wdStatusCancelled: "Dibatalkan",
  grantTitle: "Monetisasi — Premium via Telegram Stars",
  grantDesc: "Premium dijual dengan **Telegram Stars**: pemain membuat pesanan di Hanggar, membayar Stars ke kamu di Telegram, lalu kamu konfirmasi pesanannya di bawah ini — Premium langsung aktif. Tier **Pro** membuka Bor Ganda (pengeboran 2× lebih cepat).",
  grantStatus: "Status pemain saat ini: ",
  grantFree: "Pemain gratis (belum Premium)",
  grantPendingTitle: "Pesanan Stars menunggu konfirmasi",
  grantPendingEmpty: "Belum ada pesanan menunggu. Pesanan baru muncul di sini begitu pemain menekan paket Premium di Hanggar.",
  grantOrderTitle: "#{id} · Premium {tier} · {days} hari",
  grantOrderDesc: "Dibuat {date} · pastikan {stars} Stars dari pemain ini sudah masuk di Telegram sebelum konfirmasi.",
  grantConfirmBtn: "Stars Masuk — Aktifkan Premium",
  grantRejectBtn: "Tolak Pesanan",
  grantConfirmAria: "Konfirmasi pesanan Premium nomor {id} dan aktifkan Premium",
  grantRejectAria: "Tolak pesanan Premium nomor {id}",
  orderConfirmed: "terkonfirmasi",
  orderRejected: "ditolak",
  grantManualTitle: "Aktifkan manual (pembayaran di luar alur pesanan)",
  grantTierLabel: "Tier",
  tierStandard: "Standard",
  tierPro: "Pro — Bor Ganda",
  grantDaysLabel: "Durasi (hari)",
  grantExtend: "Perpanjang Premium",
  grantActivate: "Aktifkan Premium",
  grantManualNote: "Mengaktifkan saat Premium masih berjalan menambah durasinya dari tanggal berakhir saat ini; mengaktifkan Pro tidak pernah menurunkan tier yang sedang aktif.",
  grantSuccess: "Premium {tier} {days} hari diaktifkan — berlaku sampai {date}.",
  grantConfirmSuccess: "Pesanan Stars terkonfirmasi — Premium aktif sampai {date}.",
  grantRejectSuccess: "Pesanan Premium ditolak — pemain bisa membuat pesanan baru.",
  adminTitle: "Pusat Kendali — Antrean WD Pemilik",
  adminDesc: "Alur manual: periksa dompet → Setujui → kirim USDT dari dompetmu sendiri → Tandai Dibayar (isi referensi transaksi). Tolak bila alamat tidak valid; KT pemain kembali otomatis.",
  adminLockedKt: "KT terkunci",
  adminReadyUsdt: "Siap kirim",
  adminPaidUsdt: "Sudah dibayar",
  adminQueueEmpty: "Antrean kosong — belum ada penambang yang mengajukan WD.",
  flaggedTitle: "Pemain Mencurigakan",
  flaggedDesc: "Deteksi otomatis: bot, multi-akun, atau pola mustahil. Flag ini HANYA peringatan — pemain tetap bisa main, dan WD-nya ditandai \"Perlu ditinjau\" di antrean bawah. Bersihkan flag bila setelah ditinjau ternyata pemain biasa; pola bot yang berlanjut akan ter-flag lagi otomatis.",
  flaggedEmpty: "Tidak ada pemain mencurigakan saat ini.",
  flaggedNoUser: "Tanpa username",
  flaggedScore: "Skor {score}",
  flaggedNoReason: "Tanpa alasan.",
  flaggedMeta: "Saldo {kt} KT · {n}× WD terbayar",
  flaggedMetaDate: " · ditandai {date}",
  flaggedClear: "Bersihkan",
  flaggedClearAria: "Bersihkan bendera pemain {id}",
  flagCleared: "Bendera pemain #{id} dibersihkan — saldonya dan progresnya tetap utuh.",
  wdNeedsReview: "Perlu ditinjau — pemain ini ditandai mencurigakan (lihat \"Pemain Mencurigakan\" di atas). Periksa dengan teliti sebelum menyetujui WD ini.",
  wdAdminMeta: "{kt} KT terkunci · diajukan {date}",
  wdAdminNote: "Catatan: {note}",
  wdAdminNoteLabel: "Catatan admin (opsional)",
  wdAdminNotePh: "Mis. alamat valid, diproses malam ini",
  wdTxLabel: "Referensi transaksi USDT",
  wdTxPh: "Tempel hash transaksi setelah USDT terkirim",
  wdApprove: "Setujui",
  wdPay: "Tandai Dibayar",
  wdRejectRefund: "Tolak & Refund KT",
  wdApproveAria: "Setujui WD nomor {id}",
  wdPayAria: "Tandai WD nomor {id} sudah dibayar",
  wdRejectAria: "Tolak WD nomor {id} dan kembalikan KT",
  wdApproved: "WD #{id} disetujui. Kirim {usdt} USDT ke dompet pemain, lalu tandai Dibayar.",
  wdPaid: "WD #{id} ditandai Dibayar. Selesai!",
  wdRejected: "WD #{id} ditolak — KT pemain sudah dikembalikan.",
  langLabel: "Bahasa",
  asteroidNew: "asteroid baru",
  oreFallback: "mineral",
  tierProParen: "Pro (bor ganda)",
  adNote: "Iklan sponsor AdsGram — aktif setelah pemilik memasukkan blockId dari partner.adsgram.ai; sampai saat itu tombol memberi hadiah langsung seperti biasa. Hadiah {reward} KT per tontonan, maks {cap}× sehari ({watched}/{cap} terpakai), jeda {cooldown} antar-iklan — semua batas dihitung & divalidasi server.",
  adAriaFull: "Tonton iklan sponsor dan dapatkan {reward} KT, sisa {remaining} dari {cap} kali hari ini",
  energyAria: "Daya kapal",
  heroImgAlt: "Rig tambang raksasa mengebor permukaan asteroid di luar angkasa dengan Bumi terlihat di kejauhan",
  mapImgAlt: "Pemandangan peta tambang {zone}",
  ktLogoAlt: "Logo token KT — koin emas bertuliskan KT dikelilingi kristal dan asteroid dengan latar luar angkasa biru tua",
  ktLogoAltShort: "Logo token KT — koin emas bertuliskan KT",
  oresImgAlt: "Kristal dan mineral berharga hasil tambang asteroid di nampan laboratorium stasiun luar angkasa",
  stationImgAlt: "Astronot di dalam stasiun luar angkasa menyerahkan kontainer mineral ke lengan robot",
  wdStationImgAlt: "Interior stasiun luar angkasa tempat penukaran mineral",
  mapCardImgAlt: "Pemandangan peta {name}",
  wdRule2a: "**Minimum WD dua tingkat:** WD pertamamu **{min} USDT ({minkt} KT)**",
  premiumTitle: "Premium Pass",
  premiumBadge: "{tier} AKTIF",
  premiumBadgeUntil: " s/d {date}",
  ben1: "Regen daya 2× lebih cepat — lebih sedikit menunggu, lebih banyak menambang",
  ben2: "Scan & pengeboran 25% lebih cepat di semua peta",
  ben3: "Harga jual semua mineral & batu mulia +15% di Stasiun Orbital",
  ben4: "Perjalanan antar-peta gratis, tanpa biaya daya",
  proDual: "**Khusus Pro — Bor Ganda:** dua lengan bor bekerja bersamaan, waktu pengeboran setiap urat jadi 2× lebih cepat.",
  pendingOrderTitle: "Pesanan #{id} — Premium {tier} · {stars} Stars",
  pendingOrderDesc: "Status: **menunggu pembayaran & konfirmasi pemilik**. Bayar {stars} Telegram Stars ke pemilik di Telegram (kirim tangkapan layar bukti bayar + nomor pesanan #{id}), lalu pemilik mengonfirmasinya dari Pusat Kendali dan Premium-mu langsung aktif.",
  orderPlanAria: "Pesan Premium {label} seharga {stars} Telegram Stars",
  planLine: "{tier} · {days} hari",
  planStars: "{stars} Telegram Stars",
  premiumHint: "Cara beli: tekan paketnya untuk membuat pesanan, bayar Stars-nya ke pemilik lewat Telegram, dan pemilik mengaktifkan Premium-mu setelah pembayaran terkonfirmasi. Premium tidak bisa dibeli pakai KT — KT murni untuk upgrade kapal dan WD USDT.",
  mapsJobActive: "Ada operasi yang sedang berjalan — selesaikan atau batalkan dulu sebelum pindah peta.",
  mapTaglineLine: "Peta {n} · {tagline}",
  mapMinSector: "Sektor {sector}",
  mapScanPill: "{dist} · scan ±{dur}",
  mapMineralsTitle: "Mineral & batu mulia di peta ini",
  gemPrice: "· {price} KT",
  travelAria: "Terbang ke peta {name}",
  travelBusy: "Operasi sedang berjalan — tidak bisa pindah",
  travelNeedPower: "Daya kurang — perjalanan butuh {cost} daya",
  travelFree: "Terbang ke Peta Ini — Gratis (Premium)",
  travelGo: "Terbang ke Peta Ini — {cost} daya",
  mapsPromoTitle: "Premium Pass — perjalanan antar-peta GRATIS",
  mapsPromoDesc: "Plus regen daya 2× lebih cepat, operasi 25% lebih cepat, dan harga jual +15%. Lihat di Hanggar.",
  jobDrilling: "Lengan bor sedang mengebor urat {ore}…",
  jobDrillingDual: "Dua lengan bor (BOR GANDA) sedang mengebor urat {ore}…",
  jobRunning: "Operasi ini berjalan dengan waktu nyata di server misi. Kamu boleh menutup halaman ini — alat tetap bekerja dan hasilnya bisa diambil saat kamu kembali.",
  jobProgress: "Kemajuan operasi",
  jobCollectScan: "Buka Hasil Scan",
  jobCollectMine: "Ambil Hasil Tambang",
  jobCancel: "Batalkan Operasi",
  jobAria: "Operasi sedang berjalan",
  jobTimeLeft: "Sisa waktu: {dur}",
  wdTokenNote: "Token resmi misi: Kredit Tambang Antariksa (KT)",
  wdRule2b: "— kamu sudah {count}× WD terbayar, jadi minimum WD sekarang **5 USDT (5.000 KT)** dan tetap di sana.",
  wdRule2c: "— setelah WD pertamamu dibayar, minimum WD berikutnya jadi **5 USDT (5.000 KT)** dan tetap di sana.",
  wdRule2d: "Minimum dihitung server dari riwayat WD-mu, tidak bisa diturunkan dari browser.",
  wdProgressLine: "{have} / {need} KT",
  wdWalletPlaceholder: "Tempel alamat dompet USDT",
  wdUsdtLabel: "Jumlah USDT (kelipatan 0,1)",
  wdSubmitCheck: "Periksa jumlah WD dulu",
  wdNeedKt: "Saldo kurang {kt} KT lagi",
  wdSubmitGo: "Ajukan WD {usdt} USDT",
  wdRequestSent: "Permintaan WD #{id} terkirim — {kt} KT dikunci dan masuk antrean Pusat Kendali.",
  wdTxRefLabel: "Ref: {ref}",
  wdHistoryLine: "{kt} KT · diajukan {created}{processed}",
  wdProcessedAt: " · diproses {date}",
  grantStatusActive: "PREMIUM {tier} aktif{until}",
  grantStatusActiveUntil: " sampai {date}",
  grantStatusFree: "Pemain gratis (belum Premium)",
  grantStatusLabel: "Status pemain saat ini: ",
  grantOrderNote: "Dibuat {date} · pastikan {stars} Stars dari pemain ini sudah masuk di Telegram sebelum konfirmasi.",
  grantConfirm: "Stars Masuk — Aktifkan Premium",
  grantReject: "Tolak Pesanan",
  grantPastConfirmed: "terkonfirmasi",
  grantPastRejected: "ditolak",
  grantProOption: "Pro — Bor Ganda",
  grantNote: "Mengaktifkan saat Premium masih berjalan menambah durasinya dari tanggal berakhir saat ini; mengaktifkan Pro tidak pernah menurunkan tier yang sedang aktif.",
  premiumConfirmed: "Pesanan Stars terkonfirmasi — Premium aktif sampai {date}.",
  premiumGranted: "Premium {tier} {days} hari diaktifkan — berlaku sampai {date}.",
  premiumRejected: "Pesanan Premium ditolak — pemain bisa membuat pesanan baru.",
  adminFlow: "Alur manual: periksa dompet → Setujui → kirim USDT dari dompetmu sendiri → Tandai Dibayar (isi referensi transaksi). Tolak bila alamat tidak valid; KT pemain kembali otomatis.",
  adminLocked: "KT terkunci",
  adminReady: "Siap kirim",
  adminPaid: "Sudah dibayar",
  adminEmpty: "Antrean kosong — belum ada penambang yang mengajukan WD.",
  flaggedLine: "Saldo {kt} KT · {count}× WD terbayar{at}",
  flaggedAt: " · ditandai {date}",
  flaggedCleared: "Bendera pemain #{id} dibersihkan — saldonya dan progresnya tetap utuh.",
  wdApproveDone: "WD #{id} disetujui. Kirim {usdt} USDT ke dompet pemain, lalu tandai Dibayar.",
  wdPayDone: "WD #{id} ditandai Dibayar. Selesai!",
  wdRejectDone: "WD #{id} ditolak — KT pemain sudah dikembalikan.",
  wdLockedLine: "{kt} KT terkunci · diajukan {date}",
  wdNoteLabel: "Catatan admin (opsional)",
  wdNotePlaceholder: "Mis. alamat valid, diproses malam ini",
  wdTxRefLabel2: "Referensi transaksi USDT",
  wdTxRefPlaceholder: "Tempel hash transaksi setelah USDT terkirim",
  wdMarkPaid: "Tandai Dibayar",
};

const en: Dict = {
  sessionWeb: "Session: Web — no Telegram login (shared account)",
  sessionEmpty: "Session: Telegram — empty login (open via the Mini App button, not a link)",
  sessionTelegram: "Session: Telegram • ID {id}",
  genericFail: "Failed, please try again.",
  loading: "Connecting to the orbital station…",
  connLost: "Station signal lost",
  connLostDesc: "Connection to the mission server failed. Please reload.",
  retry: "Try Again",
  serverErrorStatus: "Server game error ({status}).",
  heroEyebrow: "Play-to-Earn • Explore Asteroids • Earn USDT",
  heroDesc: "Explore asteroids one by one: **scan** their composition, **drill their mineral veins** — every operation takes real time — sell the haul as **Space Mining Credits (KT)**, then withdraw real **USDT**.",
  balTitle: "Space Credit Balance",
  balNeed: "≈ {usdt} USDT · {kt} more KT needed to withdraw",
  balReady: "ready to withdraw!",
  premiumActive: "PREMIUM {tier} ACTIVE",
  dualDrillTag: "PRO · DUAL DRILL",
  standardTag: "STANDARD",
  premiumUntilShort: " — until {date}",
  activatePremium: "Activate Premium — faster drilling, sell prices +15%",
  missionPos: "Mission Position",
  sector: "SECTOR {n}",
  kmFromEarth: "{km} km from Earth",
  shipPower: "Ship Energy {e}/{m}",
  regenOne: "recharge 1 per {dur}",
  fullIn: " · full in ±{dur}",
  claimDaily: "Claim Daily Mission Bonus +{kt} KT",
  adPlaying: "Playing Ad…",
  adQuotaOut: "Today's Ad Quota Used Up",
  adNextIn: "Next Ad in {s} sec…",
  watchAdBtn: "Watch Ad — Get +{kt} KT",
  watchAdAria: "Watch an ad and get {kt} KT",
  adCaption: "Watch a sponsored ad and get +{kt} KT — max {cap}× per day, {cooldown} between ads. Ads reset every day.",
  navLabel: "Mission menu",
  tabMine: "Explore Asteroid",
  tabMaps: "Mining Maps",
  tabMarket: "Sell Station",
  tabHangar: "Hangar",
  tabWd: "WD USDT",
  tabAdmin: "Control",
  statDigs: "Mining operations completed",
  statAsteroids: "Asteroids completed",
  statUsdtPaid: "USDT already paid",
  rulesTitle: "Mission & Space Economy Rules",
  rule1: "Your ship orbits **one asteroid at a time**. Each asteroid has a different mineral vein composition — no two asteroids are the same.",
  rule2: "**Scan first, then drill.** The spectrometer scan reveals each vein's type, amount, hardness, and richness. Without a scan, veins can't be drilled.",
  rule3: "**All operations run in real time.** Scanning takes ±{scanDur}, drilling a vein takes time based on the rock's hardness (harder & bigger veins = longer). Time runs on the mission server — clicking repeatedly doesn't speed anything up, and operations still finish even if the page is closed.",
  rule4: "One operation at a time. Cancelling an operation doesn't refund the energy already spent.",
  rule5: "**Ship energy is the mission economy's main brake.** Every scan & drill uses energy, and recharging is **deliberately slow: 1 energy per {regen}** (a full {maxEnergy}-energy tank takes ±{fullDur}). So nobody can mine non-stop — every miner is limited by the same recharge speed.",
  rule6: "**Tell the two energy upgrades in the Hangar apart.** **O₂ Tank & Solar Battery** raises *capacity* (+6 max energy per level): a longer mission breath, more operations in one session, and energy gained while you're away isn't wasted by a tank that fills up too fast — but this upgrade doesn't speed up recharging. **Mini Fusion Reactor** raises recharge *speed* (−10% time per level). Want shorter waits? Upgrade the Reactor. Want longer mining sessions? Upgrade the Tank.",
  rule7: "Sell minerals at the Orbital Station to get **Space Mining Credits (KT)**. KT is used for ship & gear upgrades in the Hangar, or withdrawn as USDT.",
  rule8: "Mine all veins on one asteroid to complete the expedition: a KT bonus + a warp to a farther sector, where rare minerals appear more often.",
  rule9: "Fixed ratio: **1,000 KT = 1 USDT**, and withdrawal amounts move in multiples of 100 KT (0.1 USDT). **Two-tier withdrawal minimum:** your first withdrawal is 100 KT (0.1 USDT), later withdrawals need a minimum of 5,000 KT (5 USDT). **Maximum per withdrawal: 5,000 KT (5 USDT)** — so repeat withdrawals are always exactly 5,000 KT. **No time limit between withdrawals:** how fast you can withdraw depends on how fast you accumulate KT — the more diligently you mine & the better your upgrades, the faster 5,000 KT adds up. The minimum & maximum that apply to you are always computed server-side from your paid withdrawal history, and written in the WD USDT tab.",
  rule10: "Withdrawals are processed **manually by the mission owner**. KT is locked when you request, the owner sends USDT to your wallet then marks it Paid in the Control Center.",
  rule11: "Rejected/cancelled withdrawal = KT fully refunded. **Anti-cheat:** all balances, operation times, prices, and withdrawal minimums are computed & validated on the mission server — the browser only sends commands (scan, drill, sell, WD), it never decides the outcome. Editing the display or sending fake numbers from the browser changes nothing on the server.",
  rule12: "Expedition bonus for each completed asteroid, and a daily bonus of {dailyBonus} KT once a day — deliberately small, because the main KT source is mining, not free bonuses.",
  rule13: "**Sponsored ads:** the Watch Ad button on the balance card gives +{adReward} KT per view, server-limited to max {adCap}× per day with a {adCooldown} gap between ads (max {adDailyMax} KT/day) — enough to help, not enough to replace mining.",
  rule14: "**Five mining maps** unlock gradually with your sector: Low Orbit (Sector 1) → Asteroid Belt (3) → Moon (6) → Psyche (10) → Kuiper Belt (15). Maps you've unlocked can be revisited any time from the Mining Maps tab (travel cost rises with map distance — {travelNear} energy for the nearest map up to {travelFar} energy for the farthest; free for Premium) — but the asteroid you're currently mining will be abandoned with no bonus.",
  rule15: "**Each map has its own gemstones** found on no other map — from Rainbow Opal & Golden Topaz in Low Orbit to Black Ice Opal & Voidium Crystal in the Kuiper Belt. Their sell prices are far above ordinary minerals.",
  rule16: "**The farther the map, the longer every operation.** Distance and rock hardness make scanning & drilling in the Asteroid Belt 30% longer than Low Orbit, on the Moon 60%, on Psyche 2×, and in the Kuiper Belt 2.5× — the exact times are written on each map's card. **Challenges rise with the map too.** The first map is completely safe. Later maps bring drill-jam risk (vein lost), debris that damages the hull (KT repair fee), and radiation that drains extra energy. The exact percentages are written on each map's card — risk is decided server-side when drilling starts, not when the button is pressed.",
  rule17: "**Premium Pass** (in the Hangar) is paid with **Telegram Stars**: Standard (150 Stars / 7 days) gives energy regen 2× faster, scan & drill 25% faster, sell prices +15%, and free inter-map travel; Pro (500 Stars / 30 days) adds the **Dual Drill** — two drill arms working together so drilling is 2× faster. Premium doesn't change the withdrawal ratio.",
  logMission: "Mission Log",
  logEconomy: "Economy Log",
  logMissionDesc: "Scans, drilling, rare finds, and expeditions.",
  logEconomyDesc: "Mineral sales, upgrades, bonuses, ads, Premium, and withdrawals.",
  logEmpty: "No entries yet.",
  marketTitle: "Orbital Station — Sell Minerals",
  sellAll: "Sell All",
  marketNote: "Prices already include the Station Negotiator bonus{premium}. Sold minerals turn into KT.",
  marketNotePremium: " and the Premium +15% bonus",
  perUnitCargo: "KT/unit · in cargo {qty}",
  sell: "Sell",
  sellAllAria: "Sell all {name}",
  cargoEmpty: "Cargo is empty. Explore an asteroid in the {tab} tab, then come back here to sell.",
  hanggarCaption: "Station Hangar — KT spent here can't be withdrawn, but better gear makes scanning & drilling much faster and your missions go further.",
  levelLabel: "Level",
  levelAria: "Level {l} of {m}",
  needKt: "Needs {cost} KT — not enough balance",
  installUpgrade: "Install Upgrade — {cost} KT",
  buyAria: "Buy {name} level {l} for {cost} KT",
  maxLevel: "Max Level",
  premiumDesc: "Priority miner licence from the orbital station, paid with **Telegram Stars** — Telegram's official currency, where this game launches. Premium speeds up everything you do — without changing the withdrawal ratio of 1,000 KT = 1 USDT.",
  premBenefit1: "Energy regen 2× faster — less waiting, more mining",
  premBenefit2: "Scan & drilling 25% faster on all maps",
  premBenefit3: "Sell prices of all minerals & gemstones +15% at the Orbital Station",
  premBenefit4: "Inter-map travel free, no energy cost",
  premDualTitle: "Pro only — Dual Drill:",
  premDualText: "two drill arms work together, drilling each vein 2× faster.",
  premPendingTitle: "Order #{id} — Premium {tier} · {stars} Stars",
  premPendingDesc: "Status: **awaiting payment & owner confirmation**. Pay {stars} Telegram Stars to the owner in Telegram (send a screenshot of the payment proof + order number #{id}), then the owner confirms it from the Control Center and your Premium activates immediately.",
  planDays: "{days} days",
  planProTag: "All Standard benefits + DUAL DRILL",
  planStdTag: "2× regen · 25% faster operations · +15% sell prices",
  planOrderAria: "Order Premium {label} for {stars} Telegram Stars",
  premiumHowTo: "How to buy: tap a plan to create an order, pay the Stars to the owner via Telegram, and the owner activates your Premium once payment is confirmed. Premium can't be bought with KT — KT is purely for ship upgrades and USDT withdrawals.",
  premActiveBadge: "{tier} ACTIVE",
  mapsTitle: "Navigation Chart — Five Mining Maps",
  mapsIntro: "Every map has its own signature gemstones and challenges. Maps unlock as your sector rises (now **Sector {layer}**); switching maps abandons the asteroid you are mining, with no bonus. Remember: **the farther the map, the longer scanning & drilling take** — but its gemstones are also worth more.",
  mapsJobWarning: "An operation is running — finish or cancel it first before changing maps.",
  mapNumber: "Map {n} · {tagline}",
  mapCurrent: "CURRENTLY MINING",
  mapLockedBadge: "Sector {min}",
  mapGemsTitle: "Minerals & gemstones on this map",
  mapChallengesTitle: "Map challenges",
  mapSafe: "Safe — no drill jams, hull damage, or radiation. Fastest scan (±{dur}). The best map to learn on.",
  mapJam: "Drill jam {pct}% per drill — the vein being drilled is lost with no yield.",
  mapDamage: "Hull hit by debris {pct}% — a {fee} KT repair fee is taken from your balance.",
  mapRadiation: "Radiation +{n} power for every scan & drill.",
  mapTime: "Far distance & hard rock — scan ±{dur} and all operations {pct}% longer than on the first map.",
  mapTravelBusy: "An operation is running — can't travel",
  mapTravelNoEnergy: "Not enough energy — travel needs {cost} energy",
  mapTravelFree: "Fly to This Map — Free (Premium)",
  mapTravelCost: "Fly to This Map — {cost} energy",
  mapLockedText: "Locked — finish expeditions up to Sector {sector} to unlock this map",
  mapTravelAria: "Fly to the {name} map",
  mapsPremiumCta1: "Premium Pass — inter-map travel is FREE",
  mapsPremiumCta2: "Plus energy regen 2× faster, operations 25% faster, and sell prices +15%. See the Hangar.",
  chipJam: "Drill jam {pct}%",
  chipDamage: "Hull risk {pct}% · repair {fee} KT",
  chipRadiation: "Radiation +{n} energy/operation",
  chipTime: "Far away — scan & drill {pct}% longer",
  chipSafe: "Safe map — no challenges, great for beginners",
  chipsAria: "Active map challenges",
  veinsMined: "Veins mined: {mined} of {count}",
  asteroidDone: " — this asteroid is depleted.",
  notScannedTitle: "Composition Not Scanned Yet",
  notScannedDesc: "Passive radar caught reflections from **{count} mineral veins**, but their type and amount are still unknown. Run a spectrometer scan to reveal this asteroid's composition — without a scan, the drill arm can't lock onto any vein.",
  scanNoEnergy: "Not enough energy — scanning needs {cost} energy",
  startScanBtn: "Start Spectrometer Scan — {cost} energy • ±{dur}",
  scanNote: "Scanning is a real-time operation recorded on the mission server — deliberately slow, and repeated clicks don't speed it up. Want faster scans? Upgrade the **Core Spectrometer** in the Hangar (−7% scan time per level).",
  anomalyDetected: "Anomaly detected: {text}",
  veinQty: "×{qty} unit{s}",
  veinHardness: "Rock hardness {dots} · Vein richness {rich}%",
  richBonus: " (rich vein: +1 bonus unit)",
  veinValue: "Estimated sell value ≈ {kt} KT",
  veinMined: "Already Mined",
  mineAria: "Drill the {name} vein, needs {cost} energy and {dur}",
  mineNoEnergy: "Not enough energy — drilling needs {cost} energy",
  mineBtn: "Drill This Vein — {cost} energy • ±{dur}",
  completeBtn: "Complete Expedition & Warp to the Next Asteroid — Bonus +{bonus} KT",
  completeHint: "Mine all veins to complete the expedition and receive a {bonus} KT bonus.",
  abandonBtn: "Leave this asteroid & warp to another one ({cost} energy, no bonus)",
  lowEnergy: "Energy is almost out — the reactor is recharging, 1 energy per {dur}. Recharging is deliberately slow; upgrade the Mini Fusion Reactor in the Hangar to speed it up, or the O₂ Tank & Solar Battery for a larger capacity.",
  jobDone: "Operation Complete!",
  jobScanning: "Spectrometer is scanning the asteroid…",
  jobDualDrill: "Two drill arms (DUAL DRILL)",
  jobDrillArm: "Drill arm",
  jobMining: "is drilling the {ore} vein…",
  jobRemaining: "Time left: {dur}",
  jobReadyScan: "Scan results are ready — open the mineral vein composition of this asteroid.",
  jobReadyJammed: "Something went wrong — the drill stopped abruptly mid-way. Collect the report to see what happened.",
  jobReadyHull: "Drilling finished, but technicians report the hull was hit by debris during the operation. Collect the ore and the repair report.",
  jobReadyMine: "Drilling finished — collect the ore into your cargo.",
  jobRunningNote: "This operation runs in real time on the mission server. You may close this page — the equipment keeps working and the results can be collected when you return.",
  jobProgressAria: "Operation progress",
  jobRunningAria: "Operation in progress",
  openScan: "Open Scan Results",
  collectBtn: "Collect the Haul",
  cancelJobBtn: "Cancel Operation",
  scanStarted: "The spectrometer started scanning the asteroid — the operation finishes in {dur}. The sensors run in real time.",
  mineStarted: "The drill arm started drilling the {ore} vein — done in {dur}. You may close the page, the drill keeps working.",
  collectScanDone: "Scan complete — the asteroid's mineral vein composition is revealed. Pick a vein to drill.",
  collectJammed: "DRILL JAMMED! The drill bit broke while drilling the {ore} vein — this vein is lost with no yield. A typical risk on this map; try the next vein.",
  collectRare: "RARE! Got {ore} ×{qty} from the asteroid vein!",
  collectRareHull: " But the hull was hit by debris — a {fee} KT repair fee was deducted from your balance.",
  collectHull: "Haul delivered to cargo: {ore} ×{qty}. But the hull was hit by sharp debris — a {fee} KT repair fee was deducted from your balance.",
  collectOk: "Haul delivered to cargo: {ore} ×{qty}.",
  collectFail: "Can't be collected yet.",
  jobCancelled: "Operation cancelled. Energy already spent is not refunded.",
  expeditionDone: "Expedition complete! Bonus +{bonus} KT. Warping to Sector {layer} — a new asteroid awaits.",
  abandoned: "Warped to {name} in the same sector.",
  travelDone: "Travel complete — you arrived at the {map} map. New asteroid: {name}. This map's gemstones & challenges now apply.",
  premiumOrderCreated: "Premium order #{id} created — pay **{stars} Telegram Stars** to the owner in Telegram, then the owner confirms your order and Premium activates immediately.",
  dailyBonusClaimed: "Daily mission bonus +{bonus} KT added to your balance!",
  adRewarded: "Ad finished — reward +{reward} KT added to your balance! Ad quota left today: {remaining}×.",
  adUnavailable: "Ads aren't available yet, please try again later",
  sellAllDone: "All minerals sold at the Orbital Station: +{kt} KT.",
  sellOneDone: "Sold: +{kt} KT.",
  upgradeBought: "Upgrade installed (level {level}) for {cost} KT.",
  wdCancelled: "Withdrawal cancelled — KT returned to your balance.",
  wdRequested: "Withdrawal request #{id} sent — {kt} KT locked and queued in the Control Center.",
  wdTitle: "Withdraw KT as USDT",
  wdSubtitle: "Official mission token: Space Mining Credits (KT)",
  wdRule1: "Fixed ratio **1,000 KT = 1 USDT**, withdrawals in multiples of 0.1 USDT (100 KT).",
  wdRule3: "**Maximum 5 USDT (5,000 KT) per withdrawal** — repeat withdrawals are always exactly 5,000 KT. **No time limit between withdrawals:** how fast you can withdraw depends on how fast you collect KT.",
  wdRule4: "Enter your USDT (TON) wallet address and the USDT amount. KT is locked immediately.",
  wdRule5: "The request goes to Mission Control — the owner sends USDT **manually** to your wallet.",
  wdRule6: "Status becomes Paid after the owner sends the funds & records the transaction reference. Rejected = KT returns in full.",
  wdProgress: "Progress toward withdrawal ({min} USDT)",
  wdWalletLabel: "USDT (TON) wallet address",
  wdWalletPh: "Paste your USDT wallet address",
  wdCostLine: "Cost: {kt} KT · your balance {bal} KT · current minimum {min} USDT · maximum {max} USDT per withdrawal",
  wdBelowMin: "Below the current withdrawal minimum ({min} USDT / {minkt} KT).",
  wdOffStep: "Amount must be a multiple of 0.1 USDT (100 KT).",
  wdAboveMax: "Maximum withdrawal {max} USDT ({maxkt} KT) per withdrawal.",
  wdCheckAmount: "Check the withdrawal amount first",
  wdNotEnough: "Balance is {kt} KT short",
  wdWalletShort: "Wallet address too short — please check again.",
  wdHistory: "My Withdrawal History",
  wdHistoryEmpty: "No withdrawal requests yet. Collect {min} KT for your first withdrawal ({usdt} USDT).",
  wdDateRequested: "KT · requested {date}",
  wdDateProcessed: " · processed {date}",
  wdOwnerNote: "Owner's note: {note}",
  wdRef: "Ref: {ref}",
  wdCancelBtn: "Cancel & Return KT",
  wdCancelAria: "Cancel withdrawal #{id}",
  wdStatusPending: "Pending",
  wdStatusApproved: "Approved — send USDT",
  wdStatusPaid: "Paid",
  wdStatusRejected: "Rejected",
  wdStatusCancelled: "Cancelled",
  grantTitle: "Monetization — Premium via Telegram Stars",
  grantDesc: "Premium is sold for **Telegram Stars**: the player creates an order in the Hangar, pays Stars to you on Telegram, then you confirm the order below — Premium activates right away. The **Pro** tier unlocks the Dual Drill (drilling 2× faster).",
  grantStatus: "Player's current status: ",
  grantFree: "Free player (no Premium yet)",
  grantPendingTitle: "Star orders awaiting confirmation",
  grantPendingEmpty: "No orders waiting. New orders appear here as soon as a player taps a Premium plan in the Hangar.",
  grantOrderTitle: "#{id} · Premium {tier} · {days} days",
  grantOrderDesc: "Created {date} · make sure the {stars} Stars from this player have arrived in Telegram before confirming.",
  grantConfirmBtn: "Stars Received — Activate Premium",
  grantRejectBtn: "Reject Order",
  grantConfirmAria: "Confirm Premium order #{id} and activate Premium",
  grantRejectAria: "Reject Premium order #{id}",
  orderConfirmed: "confirmed",
  orderRejected: "rejected",
  grantManualTitle: "Activate manually (payment outside the order flow)",
  grantTierLabel: "Tier",
  tierStandard: "Standard",
  tierPro: "Pro — Dual Drill",
  grantDaysLabel: "Duration (days)",
  grantExtend: "Extend Premium",
  grantActivate: "Activate Premium",
  grantManualNote: "Activating while Premium is still running extends it from its current end date; activating Pro never lowers the currently active tier.",
  grantSuccess: "Premium {tier} for {days} days activated — valid until {date}.",
  grantConfirmSuccess: "Stars order confirmed — Premium active until {date}.",
  grantRejectSuccess: "Premium order rejected — the player can create a new order.",
  adminTitle: "Mission Control — Owner's Withdrawal Queue",
  adminDesc: "Manual flow: check the wallet → Approve → send USDT from your own wallet → Mark Paid (fill in the transaction reference). Reject if the address is invalid; the player's KT returns automatically.",
  adminLockedKt: "KT locked",
  adminReadyUsdt: "Ready to send",
  adminPaidUsdt: "Already paid",
  adminQueueEmpty: "Queue is empty — no miner has requested a withdrawal yet.",
  flaggedTitle: "Suspicious Players",
  flaggedDesc: "Automatic detection: bots, multi-accounts, or impossible patterns. This flag is ONLY a warning — the player can keep playing, and their withdrawals are marked \"Needs review\" in the queue below. Clear the flag if review shows a normal player; persistent bot patterns will be flagged again automatically.",
  flaggedEmpty: "No suspicious players right now.",
  flaggedNoUser: "No username",
  flaggedScore: "Score {score}",
  flaggedNoReason: "No reason given.",
  flaggedMeta: "Balance {kt} KT · {n}× withdrawals paid",
  flaggedMetaDate: " · flagged {date}",
  flaggedClear: "Clear",
  flaggedClearAria: "Clear player {id}'s flag",
  flagCleared: "Flag for player #{id} cleared — their balance and progress stay intact.",
  wdNeedsReview: "Needs review — this player is flagged as suspicious (see \"Suspicious Players\" above). Review carefully before approving this withdrawal.",
  wdAdminMeta: "{kt} KT locked · requested {date}",
  wdAdminNote: "Note: {note}",
  wdAdminNoteLabel: "Admin note (optional)",
  wdAdminNotePh: "E.g. address valid, processing tonight",
  wdTxLabel: "USDT transaction reference",
  wdTxPh: "Paste the transaction hash after the USDT is sent",
  wdApprove: "Approve",
  wdPay: "Mark Paid",
  wdRejectRefund: "Reject & Refund KT",
  wdApproveAria: "Approve withdrawal #{id}",
  wdPayAria: "Mark withdrawal #{id} as paid",
  wdRejectAria: "Reject withdrawal #{id} and return KT",
  wdApproved: "WD #{id} approved. Send {usdt} USDT to the player's wallet, then mark it Paid.",
  wdPaid: "WD #{id} marked as Paid. Done!",
  wdRejected: "WD #{id} rejected — the player's KT has been refunded.",
  langLabel: "Language",
  asteroidNew: "a new asteroid",
  oreFallback: "ore",
  tierProParen: "Pro (dual drill)",
  adNote: "Sponsored AdsGram ads — active once the owner enters the blockId from partner.adsgram.ai; until then the button gives the reward directly as usual. Reward {reward} KT per view, max {cap}× per day ({watched}/{cap} used), {cooldown} between ads — all limits are computed & validated server-side.",
  adAriaFull: "Watch a sponsored ad and get {reward} KT, {remaining} of {cap} left today",
  energyAria: "Ship energy",
  heroImgAlt: "Giant mining rig drilling an asteroid surface in space with Earth visible in the distance",
  mapImgAlt: "View of the {zone} mining map",
  ktLogoAlt: "KT token logo — a gold coin with KT surrounded by crystals and asteroids on a deep-space blue background",
  ktLogoAltShort: "KT token logo — a gold coin with KT",
  oresImgAlt: "Crystals and precious minerals mined from asteroids on a space station laboratory tray",
  stationImgAlt: "An astronaut inside the space station handing a mineral container to a robot arm",
  wdStationImgAlt: "Interior of the space station where minerals are exchanged",
  mapCardImgAlt: "View of the {name} map",
  wdRule2a: "**Two-tier withdrawal minimum:** your first withdrawal **{min} USDT ({minkt} KT)**",
  premiumTitle: "Premium Pass",
  premiumBadge: "{tier} ACTIVE",
  premiumBadgeUntil: " until {date}",
  ben1: "Power recharges 2× faster — less waiting, more mining",
  ben2: "Scanning & drilling 25% faster on every map",
  ben3: "Sell prices for all minerals & gemstones +15% at the Orbital Station",
  ben4: "Free travel between maps, no power cost",
  proDual: "**Pro only — Dual Drill:** two drill arms work together, so every vein drills 2× faster.",
  pendingOrderTitle: "Order #{id} — {tier} Premium · {stars} Stars",
  pendingOrderDesc: "Status: **awaiting payment & owner confirmation**. Pay {stars} Telegram Stars to the owner on Telegram (send a screenshot of the payment proof + order number #{id}), then the owner confirms it from Mission Control and your Premium activates right away.",
  orderPlanAria: "Order {label} Premium for {stars} Telegram Stars",
  planLine: "{tier} · {days} days",
  planStars: "{stars} Telegram Stars",
  premiumHint: "How to buy: tap a plan to create an order, pay the Stars to the owner via Telegram, and the owner activates your Premium once payment is confirmed. Premium cannot be bought with KT — KT is only for ship upgrades and USDT withdrawals.",
  mapsJobActive: "An operation is still running — finish or cancel it before switching maps.",
  mapTaglineLine: "Map {n} · {tagline}",
  mapMinSector: "Sector {sector}",
  mapScanPill: "{dist} · scan ±{dur}",
  mapMineralsTitle: "Minerals & gemstones on this map",
  gemPrice: "· {price} KT",
  travelAria: "Fly to the {name} map",
  travelBusy: "An operation is running — cannot switch",
  travelNeedPower: "Not enough power — the trip needs {cost} power",
  travelFree: "Fly to This Map — Free (Premium)",
  travelGo: "Fly to This Map — {cost} power",
  mapsPromoTitle: "Premium Pass — FREE travel between maps",
  mapsPromoDesc: "Plus 2× faster power regen, 25% faster operations, and +15% sell prices. See the Hangar.",
  jobDrilling: "Drill arm is drilling the {ore} vein…",
  jobDrillingDual: "Two drill arms (DUAL DRILL) are drilling the {ore} vein…",
  jobRunning: "This operation runs in real time on the mission server. You may close this page — the equipment keeps working and the results can be collected when you return.",
  jobProgress: "Operation progress",
  jobCollectScan: "Open Scan Results",
  jobCollectMine: "Collect the Ore",
  jobCancel: "Cancel Operation",
  jobAria: "Operation in progress",
  jobTimeLeft: "Time left: {dur}",
  wdTokenNote: "Official mission token: Space Mining Credit (KT)",
  wdRule2b: "— you already have {count} paid withdrawals, so the withdrawal minimum is now **5 USDT (5,000 KT)** and stays there.",
  wdRule2c: "— after your first withdrawal is paid, the next minimum becomes **5 USDT (5,000 KT)** and stays there.",
  wdRule2d: "The minimum is computed by the server from your withdrawal history and cannot be lowered from the browser.",
  wdProgressLine: "{have} / {need} KT",
  wdWalletPlaceholder: "Paste your USDT wallet address",
  wdUsdtLabel: "USDT amount (multiples of 0.1)",
  wdSubmitCheck: "Check the withdrawal amount first",
  wdNeedKt: "Balance short by {kt} KT",
  wdSubmitGo: "Submit withdrawal of {usdt} USDT",
  wdRequestSent: "Withdrawal request #{id} sent — {kt} KT locked and queued in Mission Control.",
  wdTxRefLabel: "Ref: {ref}",
  wdHistoryLine: "{kt} KT · requested {created}{processed}",
  wdProcessedAt: " · processed {date}",
  grantStatusActive: "{tier} PREMIUM active{until}",
  grantStatusActiveUntil: " until {date}",
  grantStatusFree: "Free player (no Premium)",
  grantStatusLabel: "This player's current status: ",
  grantOrderNote: "Created {date} · make sure {stars} Stars from this player have arrived on Telegram before confirming.",
  grantConfirm: "Stars Received — Activate Premium",
  grantReject: "Reject Order",
  grantPastConfirmed: "confirmed",
  grantPastRejected: "rejected",
  grantProOption: "Pro — Dual Drill",
  grantNote: "Activating while Premium is still running extends it from the current end date; activating Pro never lowers the currently active tier.",
  premiumConfirmed: "Star order confirmed — Premium active until {date}.",
  premiumGranted: "{tier} Premium for {days} days activated — valid until {date}.",
  premiumRejected: "Premium order rejected — the player can create a new order.",
  adminFlow: "Manual flow: check the wallet → Approve → send USDT from your own wallet → Mark as Paid (fill in the transaction reference). Reject if the address is invalid; the player's KT returns automatically.",
  adminLocked: "KT locked",
  adminReady: "Ready to send",
  adminPaid: "Already paid",
  adminEmpty: "Queue is empty — no miner has requested a withdrawal yet.",
  flaggedLine: "Balance {kt} KT · {count}× paid withdrawals{at}",
  flaggedAt: " · flagged {date}",
  flaggedCleared: "Player #{id}'s flag cleared — their balance and progress stay intact.",
  wdApproveDone: "Withdrawal #{id} approved. Send {usdt} USDT to the player's wallet, then mark as Paid.",
  wdPayDone: "Withdrawal #{id} marked as Paid. Done!",
  wdRejectDone: "Withdrawal #{id} rejected — the player's KT has been returned.",
  wdLockedLine: "{kt} KT locked · requested {date}",
  wdNoteLabel: "Admin note (optional)",
  wdNotePlaceholder: "E.g. address valid, processed tonight",
  wdTxRefLabel2: "USDT transaction reference",
  wdTxRefPlaceholder: "Paste the transaction hash after the USDT is sent",
  wdMarkPaid: "Mark as Paid",
};

export const DICTS: Record<Lang, Dict> = { id, en };

/** Translate a key, interpolating {vars}. Falls back to the
 *  Indonesian dictionary, then to the key itself (never crashes). */
export function t(
  key: string,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTS[currentLang];
  let s = dict[key] ?? DICTS.id[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
  }
  return s;
}

/** Like t(), but renders **bold** and *italic* markup as <b>/<em>
 *  (used for the rules list and the hero description). */
export function trich(
  key: string,
  vars?: Record<string, string | number>,
): ReactNode {
  const raw = t(key, vars);
  const boldParts = raw.split(/(\*\*[^*]+\*\*)/g);
  return boldParts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return createElement("b", { key: i }, part.slice(2, -2));
    }
    const italicParts = part.split(/(\*[^*]+\*)/g);
    if (italicParts.length === 1) return part;
    return createElement(
      "span",
      { key: i },
      italicParts.map((sub, j) =>
        sub.startsWith("*") && sub.endsWith("*") && sub.length > 2
          ? createElement("em", { key: j }, sub.slice(1, -1))
          : sub,
      ),
    );
  });
}

/** Locale-aware number formatting (max 3 decimals, KT values). */
export function fmt(n: number): string {
  return n.toLocaleString(currentLang === "id" ? "id-ID" : "en-US", {
    maximumFractionDigits: 3,
  });
}

/** Short date, e.g. "19 Nov 2026" (id) / "Nov 19, 2026" (en). */
export function fmtDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(currentLang === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Long date, e.g. "19 November 2026" (id) / "November 19, 2026" (en)
 *  — used for Premium activation dates. */
export function fmtDateLong(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(currentLang === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Date + time, e.g. "19 Nov 2026, 14.05" (id) / "Nov 19, 2026, 2:05 PM" (en). */
export function fmtDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(currentLang === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Duration in seconds → "2 mnt 30 dtk" (id) / "2 min 30 sec" (en),
 *  "1 jam 5 mnt" (id) / "1 hr 5 min" (en). */
export function fmtDur(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (currentLang === "en") {
    if (h > 0) return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
    if (m > 0) return r > 0 ? `${m} min ${r} sec` : `${m} min`;
    return `${r} sec`;
  }
  if (h > 0) return m > 0 ? `${h} jam ${m} mnt` : `${h} jam`;
  if (m > 0) return r > 0 ? `${m} mnt ${r} dtk` : `${m} mnt`;
  return `${r} dtk`;
}

// --- React plumbing ------------------------------------------------------

type LangContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
};

const LanguageContext = createContext<LangContextValue>({
  lang: "id",
  setLang: () => {},
});

/** Provider for the whole game. Put it around <App/> in main.tsx. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => currentLang);
  const setLang = (next: Lang) => {
    const nl = normalizeLang(next);
    setCurrentLang(nl);
    setLangState(nl);
  };
  // Keep the module-level language (used by api.ts + fmt/t) in sync.
  useEffect(() => {
    currentLang = lang;
  }, [lang]);
  return createElement(
    LanguageContext.Provider,
    { value: { lang, setLang } },
    children,
  );
}

/** Hook for components: t() is the module function (reads the current
 *  language); useLang() re-renders the component when it changes. */
export function useLang(): LangContextValue {
  return useContext(LanguageContext);
}

/** Visible "ID | EN" toggle for the game header — findable without
 *  digging through settings. Styled for the dark header bar. */
export function LanguagePicker() {
  const { lang, setLang } = useLang();
  return createElement(
    "div",
    {
      className: "lang-picker",
      role: "group",
      "aria-label": t("langLabel"),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.25)",
        padding: 2,
      },
    },
    LANGS.map((l) =>
      createElement(
        "button",
        {
          key: l.code,
          type: "button",
          onClick: () => setLang(l.code),
          "aria-pressed": lang === l.code,
          style: {
            border: "none",
            borderRadius: 999,
            padding: "3px 9px",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.5,
            cursor: "pointer",
            background: lang === l.code ? "#fff" : "transparent",
            color: lang === l.code ? "#0b1020" : "rgba(255,255,255,0.75)",
          },
        },
        l.label,
      ),
    ),
  );
}
