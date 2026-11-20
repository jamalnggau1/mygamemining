// Telegram webhook for Stars (XTR) payments — POST /api/telegram-webhook.
//
// Telegram POSTs Bot API updates here after the owner registers this
// URL with setWebhook (admin action setupStarsWebhook, one-time,
// from the Kendali tab). Two update types matter:
//
//   - pre_checkout_query: Telegram asks the bot to confirm the
//     invoice BEFORE charging the user — answered within ~10s via
//     answerPreCheckoutQuery (ok:true when the stored order is
//     pending and the amount matches, ok:false + short message
//     otherwise; Telegram shows that message in the payment sheet).
//   - message.successful_payment: Stars payment completed — the
//     server validates the payload (order pending, owner matches,
//     amount matches, currency XTR), activates Premium, and marks
//     the order paid with the charge id (idempotent: a redelivered
//     update finds the order already paid and does nothing).
//
// Everything else is ignored. The handler ALWAYS returns HTTP 200
// quickly (Telegram retries non-200 deliveries) and never throws —
// even a database failure is swallowed, leaving the order pending
// for manual Kendali confirmation. The secret header
// X-Telegram-Bot-Api-Secret-Token is verified FIRST (403 on
// mismatch) against the server-side derivation
// HMAC-SHA256(BOT_TOKEN, "astra-mining-webhook") — no new env var.
// BOT_TOKEN is never logged, and full update bodies are never
// logged (only the order id is safe to touch, and even that is not
// logged here).

import { getDb } from "./_lib/store.js";
import {
  applyStarsPayment,
  validateStarsPreCheckout,
  type StarsPreCheckoutQuery,
  type StarsSuccessfulPayment,
} from "./_lib/game.js";
import {
  answerPreCheckoutQuery,
  verifyWebhookSecret,
} from "./_lib/stars.js";

type Req = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

type PreCheckoutQueryRaw = {
  id?: unknown;
  from?: { id?: unknown };
  currency?: unknown;
  total_amount?: unknown;
  invoice_payload?: unknown;
};

type SuccessfulPaymentRaw = {
  currency?: unknown;
  total_amount?: unknown;
  invoice_payload?: unknown;
  telegram_payment_charge_id?: unknown;
};

type UpdateRaw = {
  pre_checkout_query?: PreCheckoutQueryRaw;
  message?: {
    from?: { id?: unknown };
    successful_payment?: SuccessfulPaymentRaw;
  };
};

function toPreCheckoutQuery(q: PreCheckoutQueryRaw): StarsPreCheckoutQuery {
  return {
    id: typeof q.id === "string" ? q.id : "",
    from: {
      id: typeof q.from?.id === "number" ? q.from.id : 0,
    },
    currency: typeof q.currency === "string" ? q.currency : "",
    total_amount:
      typeof q.total_amount === "number" ? q.total_amount : -1,
    invoice_payload:
      typeof q.invoice_payload === "string" ? q.invoice_payload : "",
  };
}

function toSuccessfulPayment(
  sp: SuccessfulPaymentRaw,
): StarsSuccessfulPayment {
  return {
    currency: typeof sp.currency === "string" ? sp.currency : "",
    total_amount:
      typeof sp.total_amount === "number" ? sp.total_amount : -1,
    invoice_payload:
      typeof sp.invoice_payload === "string" ? sp.invoice_payload : "",
    telegram_payment_charge_id:
      typeof sp.telegram_payment_charge_id === "string"
        ? sp.telegram_payment_charge_id
        : "",
  };
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (req.method && req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }
  // Secret dulu — tanpa header yang cocok, ini bukan dari Telegram.
  // 403 di sini tidak diulang Telegram (bukan update yang valid).
  if (!verifyWebhookSecret(req.headers?.["x-telegram-bot-api-secret-token"])) {
    res.status(403).json({ ok: false });
    return;
  }
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      // Body rusak: bukan update yang bisa diproses — tetap 200
      // supaya Telegram tidak mengulanginya.
      res.status(200).json({ ok: true });
      return;
    }
  }
  // Selalu 200 — Telegram mengulang pengiriman bila bukan 200, dan
  // kegagalan di bawah (DB, Bot API) ditangani dengan membiarkan
  // pesanan pending untuk konfirmasi manual, bukan dengan error.
  try {
    const update = (body ?? {}) as UpdateRaw;
    const successfulPayment = update.message?.successful_payment;
    if (update.pre_checkout_query) {
      const q = toPreCheckoutQuery(update.pre_checkout_query);
      const db = getDb();
      const result = await validateStarsPreCheckout(db, q, "id");
      await answerPreCheckoutQuery({
        preCheckoutQueryId: q.id,
        ok: result.ok,
        ...(result.ok
          ? {}
          : { errorMessage: result.errorMessage ?? "Pesanan Premium tidak valid." }),
      });
    } else if (successfulPayment) {
      const payment = toSuccessfulPayment(successfulPayment);
      const fromTelegramId =
        typeof update.message?.from?.id === "number"
          ? update.message.from.id
          : 0;
      const db = getDb();
      await applyStarsPayment(db, payment, fromTelegramId, "id");
    }
    // Update lain (pesan biasa, dll.) diabaikan.
  } catch {
    // Webhook tidak pernah melempar — selalu 200.
  }
  res.status(200).json({ ok: true });
}
