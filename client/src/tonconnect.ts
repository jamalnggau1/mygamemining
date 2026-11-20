// GRAM (TON) — TON Connect di klien: menghubungkan dompet TON
// pemain (Tonkeeper, dsb.) dan mengirim SATU transaksi pembayaran
// Premium ke dompet pemilik.
//
// Alur bayar GRAM (TANPA salin hash oleh pemain):
//   1. pemain menekan "Bayar dengan GRAM" → server membuat pesanan
//      (createGramOrder) dan mengembalikan alamat dompet pemilik +
//      jumlah nanoTON;
//   2. dompet belum terhubung → connectWallet() membuka jendela
//      TON Connect (kode QR / daftar dompet di Telegram Mini App);
//   3. dompet terhubung → sendTransaction({ address: dompet
//      pemilik, amount: nanoTON, no extra payload }) → pemain
//      menyetujui SATU KALI di dompetnya;
//   4. dompet mengembalikan BOC transaksi → klien menghitung hash
//      pesan dari BOC itu (@ton/core) dan memanggil
//      confirmGramPayment({ orderId, msgHash, senderAddress }) →
//      server memverifikasi transaksi itu on-chain (tonapi) dan
//      mengaktifkan Premium otomatis;
//   5. pemain membatalkan/menolak di dompet → klien membatalkan
//      pesanan (cancelPremiumOrder) supaya tombol beli langsung
//      bebas lagi — sama seperti pembatalan Stars.
//
// TON Connect bekerja HANYA di dalam Telegram Mini App (dompet
// dibuka lewat WebView Telegram; twaReturnUrl mengembalikan pemain
// ke Mini App setelah menyetujui). Di luar Telegram (browser web
// biasa) modul ini melaporkan unavailable — UI menunjukkan catatan
// "bayar GRAM butuh Telegram + dompet TON", bukan tombol yang
// rusak. Tanpa dompet yang terhubung, tidak ada transaksi yang
// bisa dikirim — alamat dompet pemilik tidak pernah ditampilkan
// mentah kepada pemain; yang dikirim ke dompet adalah alamat dari
// server (getGameState), bukan yang di-hardcode klien.
//
// Test seam: modul ini dipakai HANYA oleh App.tsx — tidak ada
// logika server di sini, jadi tidak ada yang perlu di-stub untuk
// tes (verifikasi on-chain diuji server-side dengan tonapi yang
// di-mock).

import { Cell } from "@ton/core";
import { TonConnectUI } from "@tonconnect/ui";

let ui: TonConnectUI | null = null;

function getUi(): TonConnectUI {
  if (!ui) {
    ui = new TonConnectUI({
      manifestUrl: "https://mygamemining.vercel.app/tonconnect-manifest.json",
      // Setelah menyetujui di dompet, kembalikan pemain ke Mini App
      // (bukan ke halaman web biasa). TWA-ke-TWA butuh tautan
      // eksplisit — tombol kembali native tidak bekerja lintas TWA.
      actionsConfiguration: {
        twaReturnUrl: "https://t.me/astra_mining_bot/astra_mining",
      },
    });
  }
  return ui;
}

/** Apakah TON Connect tersedia di lingkungan ini: Mini App Telegram
 *  (window.Telegram.WebApp ada). Di browser web biasa dompet tidak
 *  bisa dibuka dari halaman ini. */
export function isTonConnectAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { Telegram?: { WebApp?: unknown } }).Telegram
      ?.WebApp
  );
}

/** Alamat dompet yang sedang terhubung (bentuk mentah
 *  "workchain:hex"), atau null bila belum terhubung. */
export function getConnectedWalletAddress(): string | null {
  return getUi().account?.address ?? null;
}

/** Membuka jendela TON Connect (pilih dompet) bila belum
 *  terhubung. Mengembalikan alamat dompet setelah terhubung. */
export async function connectWallet(): Promise<string> {
  const tonConnectUi = getUi();
  if (!tonConnectUi.connected) {
    await tonConnectUi.connectWallet();
  }
  const address = tonConnectUi.account?.address;
  if (!address) throw new Error("wallet-not-connected");
  return address;
}

export type GramSendResult = {
  /** Hash pesan (sel root BOC) — kunci pencarian transaksi di
   *  blockchain untuk verifikasi server-side. */
  msgHash: string;
  /** Alamat dompet pengirim (bentuk mentah). */
  senderAddress: string;
};

/** Mengirim pembayaran GRAM ke dompet pemilik lewat dompet yang
 *  terhubung. validUntil: transaksi harus masuk blok dalam 5
 *  menit, kalau tidak dompet menolaknya sendiri. Mengembalikan
 *  hash pesan + alamat pengirim untuk confirmGramPayment. */
export async function sendGramPayment(args: {
  receiverAddress: string;
  amountNanoTon: string;
}): Promise<GramSendResult> {
  const tonConnectUi = getUi();
  if (!tonConnectUi.connected || !tonConnectUi.account?.address) {
    throw new Error("wallet-not-connected");
  }
  const senderAddress = tonConnectUi.account.address;
  const res = await tonConnectUi.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [
      {
        address: args.receiverAddress,
        amount: args.amountNanoTon,
      },
    ],
  });
  // BOC transaksi → hash sel root = hash pesan (msg_hash) yang
  // dipakai tonapi untuk mencari transaksi di blockchain.
  const cells = Cell.fromBoc(Buffer.from(res.boc, "base64"));
  const root = cells[0];
  if (!root) throw new Error("invalid-boc");
  const msgHash = root.hash().toString("hex");
  return { msgHash, senderAddress };
}

/** Memutuskan dompet yang terhubung (dipakai bila pemain ingin
 *  ganti dompet sebelum membayar). */
export function disconnectWallet(): Promise<void> {
  return getUi().disconnect();
}
