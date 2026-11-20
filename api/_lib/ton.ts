// GRAM (TON) — verifikasi pembayaran Premium on-chain via TON API.
//
// Alur bayar GRAM (TON Connect, TANPA salin hash oleh pemain):
// pemain memilih paket → server membuat baris premium_orders
// (pending, method "gram") → klien membuka dompet TON lewat
// TON Connect → pemain menyetujui SATU transaksi (kirim X GRAM ke
// alamat dompet pemilik) → dompet mengembalikan BOC transaksi →
// klien menghitung hash pesan dari BOC itu (@ton/core) dan
// mengirimkannya ke server (confirmGramPayment) → server mencari
// transaksi itu di blockchain lewat tonapi
// (GET /v2/blockchain/messages/{msg_hash}/transaction) dan
// memeriksa: transaksi ADA, tujuannya alamat dompet pemilik,
// pengirimnya dompet yang terhubung, jumlahnya >= harga paket,
// dan hash-nya belum pernah dipakai → Premium aktif otomatis.
//
// SECURITY RULES (owner requirement):
// - Alamat dompet pemilik di bawah ini adalah alamat PENERIMA
//   PUBLIK — aman disimpan di kode (seperti nomor rekening untuk
//   menerima transfer). BUKAN seed phrase / private key — jangan
//   pernah meminta atau menyimpan keduanya.
// - Verifikasi SELALU server-side terhadap data on-chain; hash
//   pesan dari klien hanya dipakai sebagai kunci pencarian, bukan
//   sebagai bukti — buktinya adalah transaksi yang dikembalikan
//   tonapi (tujuan + pengirim + jumlah dicek satu per satu).
// - Satu hash transaksi hanya bisa mengaktifkan SATU pesanan:
//   kolom tx_hash UNIQUE (partial index) + klaim atomik
//   pending→paid; pengiriman ulang confirmGramPayment menemukan
//   pesanan sudah paid dan tidak melakukan apa-apa.
// - Tonapi tanpa API key dibatasi 1 request/detik — volume
//   pembelian Premium jauh di bawah itu, jadi tidak perlu key.
//   Pesan error tonapi TIDAK PERNAH diteruskan mentah ke klien.

import { Address } from "@ton/core";

/** Alamat dompet GRAM pemilik (PUBLIK — hanya menerima bayaran).
 *  Ganti di sini bila pemilik pindah dompet. BUKAN seed phrase /
 *  private key — keduanya tidak pernah diminta atau disimpan. */
export const GRAM_RECEIVER_ADDRESS =
  "UQCFBLKDhmTiHhbJu1YWN0I4FRgCwk3teZjy0ByeHOhOD0tf";

/** 1 GRAM = 1.000.000.000 nanoTON. Jumlah transaksi TON Connect
 *  selalu dalam nanoTON (string, supaya tidak ada kehilangan
 *  presisi di atas 2^53). */
export const NANO_TON_PER_GRAM = 1_000_000_000;

const TONAPI_BASE = "https://tonapi.io";

/** Test seam: fetch yang dipakai untuk panggilan tonapi. Kode
 *  produksi tidak pernah menyentuh ini — tes men-stub-nya supaya
 *  tidak ada request yang keluar dari proses tes menuju tonapi.io. */
let tonFetch: typeof fetch = globalThis.fetch;
export function setTonFetchForTests(f: typeof fetch): void {
  tonFetch = f;
}
export function resetTonFetchForTests(): void {
  tonFetch = globalThis.fetch;
}

/** Normalisasi alamat TON ke bentuk mentah "workchain:hex" —
 *  bentuk yang dipakai tonapi DAN TonConnect untuk membandingkan
 *  alamat. Null bila alamatnya tidak valid. */
export function toRawAddress(address: string): string | null {
  try {
    return Address.parse(address).toRawString();
  } catch {
    return null;
  }
}

export type TonTxCheck =
  | { ok: true; txHash: string; amountNanoTon: string }
  | {
      ok: false;
      reason:
        | "not_found"
        | "wrong_recipient"
        | "wrong_amount"
        | "wrong_sender"
        | "network"
        | "bad_response";
    };

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

type TonApiTx = {
  hash?: string;
  in_msg?: {
    source?: { address?: string };
    destination?: { address?: string };
    value?: string;
  };
};

/** Mencari transaksi TON dari hash pesannya (hash sel root BOC
 *  yang dikembalikan dompet) dan memverifikasi isinya:
 *  - transaksi harus ADA (belum terindeks → "not_found", pemanggil
 *    boleh mencoba lagi beberapa detik kemudian — blok TON ~5 detik);
 *  - tujuan harus alamat dompet pemilik;
 *  - pengirim harus dompet yang terhubung saat membayar;
 *  - jumlah harus >= harga paket (lebih tidak apa-apa — pemain
 *    membayar biaya jaringan di atas harga, dan dompet boleh
 *    mengirim lebih).
 *  Mencoba hingga 4× dengan jeda 2 detik (±8 detik — di bawah
 *  batas 30 detik fungsi /api/game di Vercel). */
export async function verifyGramTransaction(
  args: {
    msgHash: string;
    senderAddress: string;
    expectedNanoTon: string;
    receiverAddress?: string;
  },
  fetchImpl?: typeof fetch,
): Promise<TonTxCheck> {
  const receiverRaw = toRawAddress(
    args.receiverAddress ?? GRAM_RECEIVER_ADDRESS,
  );
  const senderRaw = toRawAddress(args.senderAddress);
  if (!receiverRaw) return { ok: false, reason: "wrong_recipient" };
  if (!senderRaw) return { ok: false, reason: "wrong_sender" };
  if (!/^[0-9a-f]{64}$/i.test(args.msgHash))
    return { ok: false, reason: "not_found" };
  let expected: bigint;
  try {
    expected = BigInt(args.expectedNanoTon);
  } catch {
    return { ok: false, reason: "wrong_amount" };
  }
  const f = fetchImpl ?? tonFetch;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(2000);
    let res: Response;
    try {
      res = await f(
        `${TONAPI_BASE}/v2/blockchain/messages/${args.msgHash.toLowerCase()}/transaction`,
        { headers: { Accept: "application/json" } },
      );
    } catch {
      return { ok: false, reason: "network" };
    }
    if (res.status === 404) continue; // belum terindeks — coba lagi
    if (!res.ok) return { ok: false, reason: "network" };
    let tx: TonApiTx;
    try {
      tx = (await res.json()) as TonApiTx;
    } catch {
      return { ok: false, reason: "bad_response" };
    }
    const inMsg = tx.in_msg;
    if (!inMsg || typeof tx.hash !== "string") continue;
    const destRaw = inMsg.destination?.address
      ? toRawAddress(inMsg.destination.address)
      : null;
    if (destRaw !== receiverRaw)
      return { ok: false, reason: "wrong_recipient" };
    const srcRaw = inMsg.source?.address
      ? toRawAddress(inMsg.source.address)
      : null;
    if (srcRaw !== senderRaw) return { ok: false, reason: "wrong_sender" };
    let value: bigint;
    try {
      value = BigInt(inMsg.value ?? "0");
    } catch {
      return { ok: false, reason: "wrong_amount" };
    }
    if (value < expected) return { ok: false, reason: "wrong_amount" };
    return { ok: true, txHash: tx.hash, amountNanoTon: inMsg.value ?? "0" };
  }
  return { ok: false, reason: "not_found" };
}
