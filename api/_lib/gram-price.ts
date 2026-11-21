// Harga GRAM (TON) — harga Premium dinamis mengikuti pasar.
//
// Latar (perintah pemilik 2026-11-21): harga GRAM tetap (Standard 4
// GRAM, Pro 13 GRAM) membuat pemilik RUGI begitu harga GRAM turun —
// 4 GRAM yang tadinya $4,08 bisa jadi cuma $3,84. Maka harga paket
// GRAM dihitung dari TARGET USD yang tetap (Standard $4,08, Pro
// $13,26 — nilai 4 / 13 GRAM saat harga $1,02, ketika harga tetap
// itu ditetapkan) dibagi harga GRAM live: GRAM turun → pemain bayar
// LEBIH BANYAK gram; GRAM naik → pemain bayar LEBIH SEDIKIT gram.
// Pemilik selalu menerima nilai USD yang sama.
//
// Sumber harga (tanpa API key):
//   1. tonapi.io  GET /v2/rates?tokens=ton&currencies=usd
//      → rates.TON.prices.USD
//   2. CoinGecko  GET /v3/simple/price?ids=the-open-network&vs_currencies=usd
//      → ["the-open-network"].usd
// Gagal dua-duanya → harga cache terakhir; tidak ada cache → $1,02
// (harga saat harga tetap ditetapkan — hasilnya persis 4 / 13 GRAM).
// Cache 5 menit di memori + timeout 4 detik per sumber supaya API
// yang lambat tidak pernah menggantung request game.
//
// Pembulatan: jumlah GRAM SELALU dibulatkan KE ATAS ke 2 desimal
// (ceil) — nilai USD yang diterima pemilik tidak pernah di bawah
// target. nanoTON dihitung dari gram yang sudah dibulatkan dengan
// aritmetika integer (gram × 100 = sen GRAM, 1 sen = 10.000.000
// nanoTON) supaya tidak ada kehilangan presisi float.

/** Harga fallback bila tidak ada sumber harga yang bisa dihubungi
 *  dan tidak ada cache — harga saat harga tetap ditetapkan. */
export const GRAM_FALLBACK_PRICE_USD = 1.02;

/** Cache harga di memori (per instansi serverless) — 5 menit. */
const GRAM_PRICE_CACHE_TTL_MS = 5 * 60 * 1000;

/** Timeout per sumber harga — API lambat tidak boleh menggantung
 *  request game (getGameState dipanggil tiap 5 detik oleh klien). */
const PRICE_FETCH_TIMEOUT_MS = 4000;

const TONAPI_RATES_URL =
  "https://tonapi.io/v2/rates?tokens=ton&currencies=usd";
const COINGECKO_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd";

/** Test seam: fetch yang dipakai untuk panggilan harga. Kode
 *  produksi tidak pernah menyentuh ini — tes men-stub-nya supaya
 *  tidak ada request yang keluar dari proses tes menuju tonapi /
 *  CoinGecko. Pola yang sama dengan setTonFetchForTests di ton.ts. */
let priceFetch: typeof fetch = globalThis.fetch;
export function setGramPriceFetchForTests(f: typeof fetch): void {
  priceFetch = f;
}
export function resetGramPriceFetchForTests(): void {
  priceFetch = globalThis.fetch;
}
/** Mengosongkan cache harga (tes) — supaya stub harga baru
 *  langsung berlaku tanpa menunggu TTL 5 menit. */
export function resetGramPriceCacheForTests(): void {
  cachedPrice = null;
  cachedAt = 0;
  inflight = null;
}

let cachedPrice: number | null = null;
let cachedAt = 0;
/** Janji fetch yang sedang berjalan — panggilan bersamaan memakai
 *  satu fetch yang sama (tonapi tanpa key dibatasi 1 req/detik). */
let inflight: Promise<number> | null = null;

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PRICE_FETCH_TIMEOUT_MS);
  try {
    const res = await priceFetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

type TonApiRates = {
  rates?: { TON?: { prices?: { USD?: unknown } } };
};
type CoinGeckoPrice = {
  "the-open-network"?: { usd?: unknown };
};

function validPrice(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

async function fetchLivePrice(): Promise<number | null> {
  // Sumber 1: tonapi (juga dipakai verifikasi transaksi).
  try {
    const body = (await fetchJsonWithTimeout(
      TONAPI_RATES_URL,
    )) as TonApiRates;
    const price = body?.rates?.TON?.prices?.USD;
    if (validPrice(price)) return price;
  } catch {
    // jatuh ke sumber 2
  }
  // Sumber 2: CoinGecko.
  try {
    const body = (await fetchJsonWithTimeout(
      COINGECKO_PRICE_URL,
    )) as CoinGeckoPrice;
    const price = body?.["the-open-network"]?.usd;
    if (validPrice(price)) return price;
  } catch {
    // jatuh ke fallback
  }
  return null;
}

/** Harga GRAM dalam USD — cache 5 menit, fallback berlapis
 *  (tonapi → CoinGecko → cache lama → $1,02). Tidak pernah throw
 *  dan tidak pernah mengembalikan <= 0. */
export async function getGramPriceUsd(): Promise<number> {
  const now = Date.now();
  if (cachedPrice !== null && now - cachedAt < GRAM_PRICE_CACHE_TTL_MS) {
    return cachedPrice;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    const live = await fetchLivePrice();
    if (live !== null) {
      cachedPrice = live;
      cachedAt = Date.now();
      return live;
    }
    // Kedua sumber gagal: pakai cache lama (walau basi) supaya
    // harga tidak lompat ke fallback saat API sempat down.
    if (cachedPrice !== null) return cachedPrice;
    return GRAM_FALLBACK_PRICE_USD;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Jumlah GRAM untuk target USD pada harga tertentu — dibulatkan
 *  KE ATAS ke 2 desimal (ceil) supaya nilai USD yang diterima
 *  pemilik tidak pernah di bawah target. nanoTON dihitung dari
 *  sen GRAM (integer) supaya presisi tetap utuh. */
export function gramAmountForUsd(
  usdTarget: number,
  priceUsd: number,
): { gram: number; gramNanoTon: number } {
  const safePrice =
    typeof priceUsd === "number" && Number.isFinite(priceUsd) && priceUsd > 0
      ? priceUsd
      : GRAM_FALLBACK_PRICE_USD;
  // -1e-9 supaya 4.08/1.02 = 4.0000000001 (float) tidak jadi 401 sen.
  const gramCents = Math.ceil((usdTarget / safePrice) * 100 - 1e-9);
  return {
    gram: gramCents / 100,
    // 1 GRAM = 1.000.000.000 nanoTON → 0,01 GRAM = 10.000.000.
    gramNanoTon: gramCents * 10_000_000,
  };
}

/** GRAM (boleh pecahan 2 desimal, mis. dari kolom gram_amount
 *  REAL) → nanoTON (integer). Dibulatkan dulu ke 2 desimal supaya
 *  galat simpan float32 (mis. 3,97 tersimpan 3,9700000286) tidak
 *  menaikkan ekspektasi di atas jumlah yang dikutip ke pemain. */
export function gramToNanoTon(gram: number): number {
  const cents = Math.round(gram * 100);
  return cents * 10_000_000;
}
