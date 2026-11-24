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
import { normalizeLang, serverStrings, type Lang } from "./i18n.js";

/** Umur maksimum initData yang masih diterima: 24 jam. */
const MAX_INITDATA_AGE_SECONDS = 24 * 60 * 60;
/** Toleransi jam klien yang sedikit maju dari jam server. */
const FUTURE_SKEW_SECONDS = 300;

export type TelegramIdentity = {
  /** Telegram user id — kunci identitas pemain di database. */
  id: number;
  username: string | null;
  firstName: string | null;
  /** Payload `?start=` dari link referral (mis. `ref_123`) — Telegram
   *  menaruhnya di initData sebagai `start_param`. Sudah termasuk
   *  dalam data_check_string yang ditandatangani, jadi nilainya
   *  terotentikasi seperti `user`: tidak bisa dipalsukan tanpa
   *  BOT_TOKEN. Null bila pemain membuka Mini App tanpa payload. */
  startParam: string | null;
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
  /** Nama depan dari initData yang tervalidasi (untuk daftar teman
   *  referral); null untuk pemain web lama. */
  firstName: string | null;
  /** Boleh menjalankan aksi Kendali (admin): HANYA pemain Telegram
   *  yang id-nya sama dengan ADMIN_TELEGRAM_ID. Pemain web lama
   *  (tanpa initData) bukan admin. */
  isAdmin: boolean;
  /** IP request (diisi dispatch dari header x-forwarded-for yang
   *  dipasang Vercel edge — TIDAK PERNAH dari kiriman klien).
   *  Dipakai anti-cheat aturan multi-akun; null bila tidak ada. */
  ip?: string | null;
  /** Bahasa yang diminta klien untuk string yang ditampilkan ke
   *  pengguna (hanya tampilan — tidak pernah memengaruhi logika).
   *  Default "id" bila klien tidak mengirim / mengirim yang tidak
   *  didukung. */
  lang: Lang;
  /** Payload `?start=` dari link referral (mis. `ref_123`), persis
   *  seperti di initData tervalidasi; null untuk pemain web lama
   *  dan untuk pemain Telegram yang membuka Mini App tanpa payload.
   *  Dipakai atribusi referral di game.ts — hanya saat pemain
   *  pertama kali dibuat. */
  startParam: string | null;
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
  lang?: unknown,
): SessionResolution {
  const sessionLang = normalizeLang(lang);
  if (!initData) {
    // Browser web biasa — pemain lama id=1, pemain BIASA (bukan
    // admin). Kendali hanya untuk ADMIN_TELEGRAM_ID lewat Telegram,
    // supaya siapa pun yang membuka URL — termasuk browser di dalam
    // Telegram yang tidak mengirim initData — tidak pernah mendapat
    // akses admin atau melihat tab Kendali. Pemain web tetap bisa
    // bermain penuh; hanya aksi Kendali yang ditolak.
    return {
      ok: true,
      session: {
        telegramId: null,
        username: null,
        firstName: null,
        isAdmin: false,
        lang: sessionLang,
        startParam: null,
      },
    };
  }
  const validated = validateTelegramInitData(initData, sessionLang);
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
      firstName: validated.identity.firstName,
      isAdmin:
        Number.isFinite(adminId) && adminId === validated.identity.id,
      lang: sessionLang,
      startParam: validated.identity.startParam,
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
  lang: Lang = "id",
): InitDataValidation {
  const S = serverStrings(lang);
  const token = botToken();
  if (!token) {
    // Fail closed: tanpa BOT_TOKEN server tidak bisa membedakan
    // initData asli dari palsu — tolak semuanya.
    return {
      ok: false,
      error: S.tgNoBotToken,
    };
  }
  if (!initData || typeof initData !== "string") {
    return { ok: false, error: S.tgNoInitData };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: S.tgInvalid };
  }

  const receivedHash = params.get("hash");
  const authDateRaw = params.get("auth_date");
  if (!receivedHash || !authDateRaw) {
    return { ok: false, error: S.tgIncomplete };
  }

  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, error: S.tgInvalid };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (authDate > nowSec + FUTURE_SKEW_SECONDS) {
    return { ok: false, error: S.tgInvalid };
  }
  if (nowSec - authDate > MAX_INITDATA_AGE_SECONDS) {
    return {
      ok: false,
      error: S.tgExpired,
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
    return { ok: false, error: S.tgInvalid };
  }
  if (
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    return { ok: false, error: S.tgInvalid };
  }

  // Hash cocok — `user` bisa dipercaya sekarang.
  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, error: S.tgIncomplete };
  }
  let user: unknown;
  try {
    user = JSON.parse(userRaw) as unknown;
  } catch {
    return { ok: false, error: S.tgInvalid };
  }
  if (
    typeof user !== "object" ||
    user === null ||
    typeof (user as { id?: unknown }).id !== "number" ||
    !Number.isInteger((user as { id: number }).id) ||
    (user as { id: number }).id <= 0
  ) {
    return { ok: false, error: S.tgInvalid };
  }
  const u = user as { id: number; username?: unknown; first_name?: unknown };
  // Payload referral dari `?start=` — ikut ditandatangani (masuk
  // data_check_string di atas), jadi nilainya tepercaya. Bisa kosong
  // bila pemain membuka Mini App langsung, bukan lewat link referral.
  const rawStartParam = params.get("start_param");
  return {
    ok: true,
    identity: {
      id: u.id,
      username: typeof u.username === "string" ? u.username : null,
      firstName: typeof u.first_name === "string" ? u.first_name : null,
      startParam:
        typeof rawStartParam === "string" && rawStartParam.length > 0
          ? rawStartParam
          : null,
    },
  };
}
