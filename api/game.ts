// Vercel serverless game API for the ASTRA MINING deployment.
//
// POST /api/game
//   Body: { "action": "<name>", "args": { ... } }
//   Returns the action's response object (always JSON).
//
// This is the standalone replacement for the Muse runtime's action
// endpoint: the client posts the same {action, args} intents it used
// to send through the SDK's createActionClient proxy, and this route
// dispatches them to the Neon-backed handlers in api/_lib/game.ts.
// All balances, timers, drops and withdrawals are validated
// server-side there — the client can only send intents, never set a
// balance (same anti-cheat rule as the Muse version).
//
//   Business failures (not enough energy, below the WD minimum, ...)
//   come back as HTTP 200 with {ok: false, error} — the client shows
//   the error message. Unknown actions / invalid arguments are
//   HTTP 400; database or server failures are HTTP 500 with a generic
//   message (never a connection string or stack trace).

import { ZodError } from "zod";
import { dispatchGameAction } from "./_lib/game.js";

type Req = {
  method?: string;
  body?: unknown;
};
type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (req.method && req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  let body: unknown = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).json({ ok: false, error: "Body JSON tidak valid." });
      return;
    }
  }
  const action =
    body !== null && typeof body === "object" && "action" in body
      ? (body as { action?: unknown }).action
      : undefined;
  const args =
    body !== null && typeof body === "object" && "args" in body
      ? (body as { args?: unknown }).args
      : {};
  if (typeof action !== "string" || action.length === 0) {
    res.status(400).json({ ok: false, error: "Field 'action' wajib diisi." });
    return;
  }
  try {
    const result = await dispatchGameAction(action, args ?? {});
    res.status(200).json(result);
  } catch (e) {
    if (e instanceof ZodError) {
      res.status(400).json({ ok: false, error: "Argumen tidak valid." });
      return;
    }
    res.status(500).json({
      ok: false,
      error: e instanceof Error ? e.message : "Terjadi kesalahan server.",
    });
  }
}
