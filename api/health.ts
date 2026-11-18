// Vercel serverless health check for the ASTRA MINING deployment.
//
// GET /api/health
//   Verifies, from inside the Vercel deployment, that:
//     1. DATABASE_URL is configured (value is never echoed back),
//     2. Neon answers a trivial query over SSL, and
//     3. the six game tables exist (run deploy/neon/init.sql on an
//        empty Neon database to create them).
//   Returns 200 when everything is ready, 503 otherwise.

import { GAME_TABLES, neonQuery } from "./_lib/db";

type Req = { method?: string };
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
  try {
    await neonQuery("SELECT 1 AS ok");
    const rows = await neonQuery(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)",
      [`{${GAME_TABLES.join(",")}}`],
    );
    const found = new Set(rows.map((r) => String(r["table_name"])));
    const missing = GAME_TABLES.filter((t) => !found.has(t));
    if (missing.length > 0) {
      res.status(503).json({
        ok: false,
        database: "connected",
        tables: "incomplete",
        missing,
        hint: "Jalankan deploy/neon/init.sql di database Neon ini.",
      });
      return;
    }
    res.status(200).json({
      ok: true,
      database: "connected",
      tables: "ready",
      tablesFound: [...GAME_TABLES],
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      database: "unreachable",
      error: e instanceof Error ? e.message : "unknown error",
    });
  }
}
