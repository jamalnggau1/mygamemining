// Cron harian: pengingat pemain tidak aktif (2026-11-21).
//
// GET /api/cron/inactive-nudge — dipanggil Vercel Cron 1×/hari
// (vercel.json crons, "0 2 * * *"). Auth: header
// Authorization: Bearer CRON_SECRET (env var di Vercel; 401 bila
// hilang/salah — tanpa ini siapa pun bisa memicu pengiriman pesan
// massal). Logika seleksi + pengiriman ada di api/_lib/nudge.ts;
// endpoint ini hanya memeriksa auth lalu memanggilnya.
//
// Setup pemilik (sebelum push): jalankan
// deploy/neon/migration-0009-inactive-nudge.sql di Neon, lalu set
// CRON_SECRET di Vercel (satu string rahasia apa saja) dan
// redeploy. Setelah deploy, periksa dashboard Vercel → Cron Jobs
// bahwa cron-nya terdaftar (Hobby mengizinkan 1 cron/hari).

import { getDb } from "../_lib/store.js";
import { runInactiveNudge } from "../_lib/nudge.js";

type Req = {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
};
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (req.method && req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  const secret = process.env.CRON_SECRET;
  const auth = req.headers?.authorization;
  const value = Array.isArray(auth) ? auth[0] : auth;
  if (
    !secret ||
    typeof value !== "string" ||
    value !== `Bearer ${secret}`
  ) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  try {
    const result = await runInactiveNudge(getDb());
    res.status(200).json({ ok: true, sent: result.sent, skipped: result.skipped });
  } catch {
    res.status(500).json({ ok: false, error: "internal error" });
  }
}
