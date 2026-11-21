// Pengingat pemain tidak aktif (2026-11-21, perintah pemilik).
//
// Aturan: pemain yang terakhir aktif (baris activity terbaru, atau
// created_at bila belum pernah ada aktivitas) lebih dari 3 hari lalu
// DAN belum pernah diingatkan (last_inactive_nudge_at NULL) atau
// terakhir diingatkan lebih dari 7 hari lalu, mendapat satu pesan
// Telegram berisi tautan Mini App. Setelah terkirim,
// last_inactive_nudge_at diisi — jadi satu pemain tidak di-spam
// tiap hari; ia hanya diingatkan lagi bila tetap tidak aktif 7 hari
// setelah pengingat terakhir.
//
// Logika seleksi + pengiriman tinggal di sini supaya endpoint cron
// (/api/cron/inactive-nudge.ts, dipanggil Vercel Cron 1×/hari)
// tetap tipis (hanya auth CRON_SECRET + panggil runInactiveNudge)
// dan supaya logikanya bisa dites langsung dari notify.test.ts
// tanpa HTTP. Pesan selalu Bahasa Indonesia — bahasa per pemain
// tidak disimpan server (keterbatasan yang sama seperti log yang
// ditulis admin).

import { eq, isNotNull, sql } from "drizzle-orm";
import * as schema from "../../deploy/neon/schema.pg.js";
import { type Db } from "./store.js";
import { sendTelegramMessage } from "./stars.js";

/** Pemain dianggap tidak aktif bila terakhir beraktivitas lebih
 *  dari ini. */
export const INACTIVE_DAYS = 3;
/** Jeda minimum antar pengingat untuk pemain yang sama. */
export const NUDGE_COOLDOWN_DAYS = 7;
/** Tautan Mini App yang disertakan di pesan pengingat. */
export const MINI_APP_URL = "https://t.me/astra_mining_bot/astra_mining";

/** Teks pengingat (Bahasa Indonesia). */
export function nudgeText(): string {
  return `Sudah 3 hari kamu tidak menambang di ASTRA MINING — asteroidmu menunggumu! Buka game dan lanjutkan ekspedisimu.\n${MINI_APP_URL}`;
}

export type NudgeCandidate = { id: number; telegramId: number };

function asDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Kandidat pengingat: pemain dengan telegram_id yang terakhir
 *  aktif > 3 hari lalu dan belum diingatkan dalam 7 hari terakhir.
 *  Aktivitas terakhir = max(activity.created_at); pemain tanpa
 *  baris activity sama sekali memakai player.created_at. Dua query
 *  agregat saja (tanpa N+1 per pemain). */
export async function selectNudgeCandidates(
  db: Db,
  now: Date,
): Promise<NudgeCandidate[]> {
  const inactiveCutoff = new Date(
    now.getTime() - INACTIVE_DAYS * 24 * 60 * 60 * 1000,
  );
  const cooldownCutoff = new Date(
    now.getTime() - NUDGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  );
  const players = await db
    .select({
      id: schema.player.id,
      telegramId: schema.player.telegramId,
      createdAt: schema.player.createdAt,
      lastNudgeAt: schema.player.lastInactiveNudgeAt,
    })
    .from(schema.player)
    .where(isNotNull(schema.player.telegramId));
  const lastAct = await db
    .select({
      playerId: schema.activity.playerId,
      last: sql<Date>`max(${schema.activity.createdAt})`,
    })
    .from(schema.activity)
    .groupBy(schema.activity.playerId);
  const lastByPlayer = new Map<number, Date>();
  for (const r of lastAct) {
    const d = asDate(r.last);
    if (d !== null) lastByPlayer.set(r.playerId, d);
  }
  const out: NudgeCandidate[] = [];
  for (const p of players) {
    if (p.telegramId === null) continue;
    // created_at NOT NULL — fallback untuk pemain tanpa aktivitas.
    const created = asDate(p.createdAt);
    const last = lastByPlayer.get(p.id) ?? created;
    if (last === null || last.getTime() >= inactiveCutoff.getTime()) continue;
    const nudged = asDate(p.lastNudgeAt);
    if (nudged !== null && nudged.getTime() >= cooldownCutoff.getTime())
      continue;
    out.push({ id: p.id, telegramId: p.telegramId });
  }
  return out;
}

/** Mengirim pengingat ke semua kandidat lalu menandai
 *  last_inactive_nudge_at mereka. `send` bisa di-stub di tes;
 *  default-nya sendTelegramMessage (Bot API). `sent` = pesan
 *  terkirim; `skipped` = kandidat yang pesannya GAGAL terkirim
 *  (tidak ditandai — cron besok mencoba lagi). Pengiriman satu
 *  pemain yang gagal tidak pernah menghentikan yang lain. */
export async function runInactiveNudge(
  db: Db,
  opts: {
    now?: Date;
    send?: (chatId: number, text: string) => Promise<boolean>;
  } = {},
): Promise<{ sent: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const send =
    opts.send ??
    ((chatId: number, text: string) =>
      sendTelegramMessage({ chatId, text }));
  const candidates = await selectNudgeCandidates(db, now);
  let sent = 0;
  let skipped = 0;
  for (const c of candidates) {
    let ok = false;
    try {
      ok = await send(c.telegramId, nudgeText());
    } catch {
      ok = false;
    }
    if (ok) {
      sent++;
      await db
        .update(schema.player)
        .set({ lastInactiveNudgeAt: now })
        .where(eq(schema.player.id, c.id));
    } else {
      skipped++;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { sent, skipped };
}
