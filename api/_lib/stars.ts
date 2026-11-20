// Telegram Stars (XTR) — klien Bot API + webhook untuk Premium Pass.
//
// Alur bayar: pemain memilih paket → server membuat baris
// premium_orders (pending) + meminta tautan invoice ke Bot API
// (createInvoiceLink, currency XTR, provider_token "" — invoice
// Stars tidak butuh payment provider) → klien membukanya dengan
// Telegram.WebApp.openInvoice → Telegram menampilkan lembar bayar
// Stars → sebelum menagih, Telegram mengirim pre_checkout_query
// (server menjawab ok:true/false) → setelah bayar, Telegram POST
// update successful_payment ke /api/telegram-webhook → server
// memvalidasi payload, mengaktifkan Premium, dan menandai pesanan
// paid (idempotent: pengiriman ulang diabaikan).
//
// SECURITY RULES (owner requirement):
// - BOT_TOKEN hanya dari environment variable, tidak pernah ditulis
//   ke kode/file/log, dan tidak pernah muncul di pesan error.
// - Secret webhook diturunkan server-side sebagai
//   HMAC-SHA256(BOT_TOKEN, "astra-mining-webhook") — TIDAK ADA env
//   var baru. setWebhook mendaftarkannya sebagai secret_token;
//   handler webhook memverifikasi header
//   X-Telegram-Bot-Api-Secret-Token terhadap turunan yang sama
//   (perbandingan constant-time).
// - Payload invoice `premium:<orderId>:<playerId>:<tier>` divalidasi
//   server terhadap baris pesanan yang tersimpan (status, pemilik,
//   jumlah Stars) — payload palsu tidak bisa mengaktifkan apa pun.
// - Bot API hanya dipanggil dengan token di path URL (desain API
//   Telegram); token tidak pernah masuk body, header, atau log.
//   Pesan error dari Bot API TIDAK PERNAH diteruskan mentah ke
//   klien — pemanggil memetakannya ke string i18n generik.

import { createHmac, timingSafeEqual } from "node:crypto";

export const STARS_WEBHOOK_URL =
  "https://mygamemining.vercel.app/api/telegram-webhook";

const TELEGRAM_API = "https://api.telegram.org";
const WEBHOOK_SECRET_LABEL = "astra-mining-webhook";

function botToken(): string | null {
  const t = process.env.BOT_TOKEN;
  return t && t.length > 0 ? t : null;
}

/** Menurunkan secret webhook dari BOT_TOKEN. Null bila token tidak
 *  ada (fail closed: webhook tidak bisa didaftarkan atau
 *  diverifikasi). */
export function deriveWebhookSecret(): string | null {
  const token = botToken();
  if (!token) return null;
  return createHmac("sha256", token)
    .update(WEBHOOK_SECRET_LABEL, "utf8")
    .digest("hex");
}

/** Memeriksa header X-Telegram-Bot-Api-Secret-Token terhadap secret
 *  turunan (constant-time). Header hilang / token hilang → false. */
export function verifyWebhookSecret(
  header: string | string[] | undefined,
): boolean {
  const expected = deriveWebhookSecret();
  if (!expected) return false;
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== "string" || value.length === 0) return false;
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(value, "utf8");
    b = Buffer.from(expected, "utf8");
  } catch {
    return false;
  }
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Payload invoice: `premium:<orderId>:<playerId>:<tier>`. */
export function buildInvoicePayload(
  orderId: number,
  playerId: number,
  tier: "standard" | "pro",
): string {
  return `premium:${orderId}:${playerId}:${tier}`;
}

export type InvoicePayload = {
  orderId: number;
  playerId: number;
  tier: "standard" | "pro";
};

/** Mengurai + memvalidasi payload invoice. Null bila formatnya
 *  salah — apa pun di luar `premium:<id>:<id>:<tier>` ditolak. */
export function parseInvoicePayload(payload: unknown): InvoicePayload | null {
  if (typeof payload !== "string") return null;
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "premium") return null;
  const orderId = Number(parts[1]);
  const playerId = Number(parts[2]);
  const tier = parts[3];
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return null;
  if (!Number.isSafeInteger(playerId) || playerId <= 0) return null;
  if (tier !== "standard" && tier !== "pro") return null;
  return { orderId, playerId, tier };
}

/** Test seam: fetch yang dipakai untuk panggilan Bot API. Kode
 *  produksi tidak pernah menyentuh ini — tes men-stub-nya supaya
 *  tidak ada request yang keluar dari proses tes menuju
 *  api.telegram.org. */
let botFetch: typeof fetch = globalThis.fetch;
export function setBotFetchForTests(f: typeof fetch): void {
  botFetch = f;
}
export function resetBotFetchForTests(): void {
  botFetch = globalThis.fetch;
}

type BotApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: "no_bot_token" | "network" | "bad_response" | "api_error" };

async function callBotApi<T>(
  method: string,
  body: Record<string, unknown>,
  fetchImpl?: typeof fetch,
): Promise<BotApiResult<T>> {
  const token = botToken();
  if (!token) return { ok: false, error: "no_bot_token" };
  const f = fetchImpl ?? botFetch;
  let res: Response;
  try {
    res = await f(`${TELEGRAM_API}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "network" };
  }
  let data: { ok?: boolean; result?: T; description?: string };
  try {
    data = (await res.json()) as {
      ok?: boolean;
      result?: T;
      description?: string;
    };
  } catch {
    return { ok: false, error: "bad_response" };
  }
  if (!res.ok || data.ok !== true || data.result === undefined) {
    // Sengaja generik: body mentah API tidak pernah diteruskan
    // (bisa menggemakan detail request) — pemanggil memetakannya
    // ke string i18n yang aman ditampilkan.
    return { ok: false, error: "api_error" };
  }
  return { ok: true, data: data.result };
}

export type InvoicePrice = { label: string; amount: number };

/** Meminta tautan invoice Stars ke Bot API. currency SELALU "XTR",
 *  provider_token SELALU "" (invoice Stars tidak pakai provider).
 *  Mengembalikan tautan, atau error generik (tanpa token, tanpa
 *  body mentah API). */
export async function createInvoiceLink(
  args: {
    title: string;
    description: string;
    payload: string;
    prices: InvoicePrice[];
  },
  fetchImpl?: typeof fetch,
): Promise<{ ok: true; invoiceUrl: string } | { ok: false; error: string }> {
  const r = await callBotApi<string>(
    "createInvoiceLink",
    {
      title: args.title,
      description: args.description,
      payload: args.payload,
      provider_token: "",
      currency: "XTR",
      prices: args.prices,
    },
    fetchImpl,
  );
  if (r.ok === false) return { ok: false, error: r.error };
  return { ok: true, invoiceUrl: r.data };
}

/** Menjawab pre_checkout_query. Harus dijawab dalam ~10 detik —
 *  pemanggil (webhook) tidak boleh melakukan kerja berat sebelum
 *  ini. Mengembalikan true bila Telegram menerima jawabannya. */
export async function answerPreCheckoutQuery(
  args: {
    preCheckoutQueryId: string;
    ok: boolean;
    errorMessage?: string;
  },
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const body: Record<string, unknown> = {
    pre_checkout_query_id: args.preCheckoutQueryId,
    ok: args.ok,
  };
  if (args.ok === false && args.errorMessage) {
    body.error_message = args.errorMessage;
  }
  const r = await callBotApi<true>("answerPreCheckoutQuery", body, fetchImpl);
  return r.ok;
}

/** Mendaftarkan webhook Stars ke Bot API (langkah setup satu kali,
 *  dipicu admin dari Kendali). Secret didaftarkan sebagai
 *  secret_token supaya Telegram mengirim header verifikasi di setiap
 *  update. Mengembalikan true bila Telegram menerima pendaftarannya. */
export async function setWebhook(
  args: { url: string },
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  const secret = deriveWebhookSecret();
  if (!secret) return false;
  const r = await callBotApi<true>(
    "setWebhook",
    { url: args.url, secret_token: secret },
    fetchImpl,
  );
  return r.ok;
}
