// Validasi Telegram WebApp initData — identitas per pemain ASTRA MINING.
//
// Di Telegram, setiap pemain membuka Mini App dengan `initData`: sebuah
// query string yang ditandatangani Telegram (field `user`, `auth_date`,
// `hash`, ...). Server TIDAK PERNAH percaya id/username yang dikirim
// klien begitu saja — hanya initData yang lolos pemeriksaan hash ini
// yang dianggap identitas pemain. Tanpa ini, siapa pun bisa mengaku
// sebagai pemain lain dan menguras saldo / antrean WD-nya.
//
// Cara kerja (spesifikasi validasi Telegram, https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
//   1. Ambil semua field kecuali `hash`, urutkan alfabet, gabung jadi
//      `data_check_string` dengan format `key=<value>` per baris (\n).
//   2. secret_key = HMAC_SHA256(key="WebAppData", message=BOT_TOKEN).
//   3. hash = HMAC_SHA256(key=secret_key, message=data_check_string),
//      hex — harus sama persis dengan field `hash` (perbandingan
//      constant-time).
//   4. `auth_date` tidak boleh lebih tua dari 24 jam (dan tidak boleh
//      dari masa depan) — initData curian tidak bisa dipakai selamanya.
//
// SECURITY RULES (owner requirement):
// - BOT_TOKEN hanya dari environment variable, tidak pernah ditulis ke
//   kode/file/log, dan tidak pernah muncul di pesan error.
// - Bila BOT_TOKEN belum diatur, validasi GAGAL TERTUTUP (fail closed):
//   initData apa pun ditolak, bukan diterima.
// - Tidak ada nilai dari initData yang dimasukkan ke SQL tanpa
//   parameterisasi (Drizzle menangani itu di game.ts).

import { createHmac, timingSafeEqual } from "node:crypto";

/** Umur maksimum initData yang masih diterima: 24 jam. */
const MAX_INITDATA_AGE_SECONDS = 24 * 60 * 60;
/** Toleransi jam klien yang sedikit maju dari jam server. */
const FUTURE_SKEW_SECONDS = 300;

export type TelegramIdentity = {
  /** Telegram user id — kunci identitas pemain di database. */
  id: number;
  username: string | null;
  firstName: string | null;
};

/** Sesi pemain yang sudah diputuskan server untuk satu request.
 *  `telegramId === null` berarti request datang dari browser web biasa
 *  (tanpa initData) — pemain lama id=1, pemain BIASA tanpa hak admin.
 *  Admin HANYA lewat Telegram: initData tervalidasi yang id-nya sama
 *  dengan ADMIN_TELEGRAM_ID. Browser web tidak pernah admin, supaya
 *  siapa pun yang membuka URL tidak bisa melihat/menggunakan Kendali. */
export type Session = {
  telegramId: number | null;
  username: string | null;
  /** Boleh menjalankan aksi Kendali (admin): HANYA pemain Telegram
   *  yang id-nya sama dengan ADMIN_TELEGRAM_ID. Pemain web lama
   *  (tanpa initData) bukan admin. */
  isAdmin: boolean;
};

export type SessionResolution =
  | { ok: true; session: Session }
  | { ok: false; error: string };

/** Memutuskan sesi dari initData mentah yang dikirim klien (boleh
 *  kosong/undefined untuk browser web biasa). TIDAK PERNAH percaya id
 *  Telegram yang dikirim klien di luar initData yang tervalidasi.
 *  Gagal tertutup: initData tidak valid → sesi ditolak, bukan
 *  dianggap pemain web lama. */
export function resolveSession(
  initData?: string | null,
): SessionResolution {
  if (!initData) {
    // Browser web biasa — pemain lama id=1, pemain BIASA (bukan
    // admin). Kendali hanya untuk ADMIN_TELEGRAM_ID lewat Telegram,
    // supaya siapa pun yang membuka URL — termasuk browser di dalam
    // Telegram yang tidak mengirim initData — tidak pernah mendapat
    // akses admin atau melihat tab Kendali. Pemain web tetap bisa
    // bermain penuh; hanya aksi Kendali yang ditolak.
    return {
      ok: true,
      session: { telegramId: null, username: null, isAdmin: false },
    };
  }
  const validated = validateTelegramInitData(initData);
  // NB: `=== false`, bukan `!validated.ok` — Vercel me-typecheck tanpa
  // strictNullChecks, dan di pengaturan itu `!x.ok` tidak
  // mempersempit discriminated union (perilaku tsc yang sama juga
  // berlaku di dispatchGameAction).
  if (validated.ok === false) return { ok: false, error: validated.error };
  const adminIdRaw = process.env.ADMIN_TELEGRAM_ID;
  const adminId = adminIdRaw ? Number(adminIdRaw) : NaN;
  return {
    ok: true,
    session: {
      telegramId: validated.identity.id,
      username: validated.identity.username,
      isAdmin:
        Number.isFinite(adminId) && adminId === validated.identity.id,
    },
  };
}

export type InitDataValidation =
  | { ok: true; identity: TelegramIdentity }
  | { ok: false; error: string };

function botToken(): string | null {
  const t = process.env.BOT_TOKEN;
  return t && t.length > 0 ? t : null;
}

/** Menghitung HMAC-SHA256 dan mengembalikan hex lowercase. */
function hmacSha256Hex(key: string | Buffer, message: string): string {
  return createHmac("sha256", key).update(message, "utf8").digest("hex");
}

/** Validasi satu string initData dari Telegram WebApp. Mengembalikan
 *  identitas pemain bila valid, atau {ok:false} dengan pesan yang aman
 *  ditampilkan ke klien bila tidak. */
export function validateTelegramInitData(
  initData: string,
): InitDataValidation {
  const token = botToken();
  if (!token) {
    // Fail closed: tanpa BOT_TOKEN server tidak bisa membedakan
    // initData asli dari palsu — tolak semuanya.
    return {
      ok: false,
      error: "Login Telegram belum dikonfigurasi di server.",
    };
  }
  if (!initData || typeof initData !== "string") {
    return { ok: false, error: "Data login Telegram tidak ditemukan." };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: "Data login Telegram tidak valid." };
  }

  const receivedHash = params.get("hash");
  const authDateRaw = params.get("auth_date");
  if (!receivedHash || !authDateRaw) {
    return { ok: false, error: "Data login Telegram tidak lengkap." };
  }

  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, error: "Data login Telegram tidak valid." };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (authDate > nowSec + FUTURE_SKEW_SECONDS) {
    return { ok: false, error: "Data login Telegram tidak valid." };
  }
  if (nowSec - authDate > MAX_INITDATA_AGE_SECONDS) {
    return {
      ok: false,
      error: "Sesi Telegram sudah kedaluwarsa — tutup dan buka lagi Mini App-nya.",
    };
  }

  // data_check_string: semua field kecuali `hash`, diurutkan alfabet.
  // URLSearchParams sudah men-decode nilai — sesuai spesifikasi,
  // validasi memakai nilai yang sudah di-decode.
  const entries: [string, string][] = [];
  params.forEach((value, key) => {
    if (key !== "hash") entries.push([key, value]);
  });
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(token, "utf8").digest();
  const expectedHash = hmacSha256Hex(secretKey, dataCheckString);

  // Perbandingan constant-time; panjang berbeda langsung gagal.
  let receivedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    receivedBuf = Buffer.from(receivedHash, "hex");
    expectedBuf = Buffer.from(expectedHash, "hex");
  } catch {
    return { ok: false, error: "Data login Telegram tidak valid." };
  }
  if (
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    return { ok: false, error: "Data login Telegram tidak valid." };
  }

  // Hash cocok — `user` bisa dipercaya sekarang.
  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, error: "Data login Telegram tidak lengkap." };
  }
  let user: unknown;
  try {
    user = JSON.parse(userRaw) as unknown;
  } catch {
    return { ok: false, error: "Data login Telegram tidak valid." };
  }
  if (
    typeof user !== "object" ||
    user === null ||
    typeof (user as { id?: unknown }).id !== "number" ||
    !Number.isInteger((user as { id: number }).id) ||
    (user as { id: number }).id <= 0
  ) {
    return { ok: false, error: "Data login Telegram tidak valid." };
  }
  const u = user as { id: number; username?: unknown; first_name?: unknown };
  return {
    ok: true,
    identity: {
      id: u.id,
      username: typeof u.username === "string" ? u.username : null,
      firstName: typeof u.first_name === "string" ? u.first_name : null,
    },
  };
}
