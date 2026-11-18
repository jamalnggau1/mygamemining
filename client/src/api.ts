// Typed RPC client for the standalone Vercel deployment.
//
// The client posts the same {action, args} intents the Muse version
// sent through the SDK's createActionClient proxy — only the
// transport changed: POST /api/game (same origin, no SDK, no
// runtime dependency on the server). Types come from the server
// handlers in api/_lib/game.ts via `import type`, so the client
// bundle never pulls in any server runtime (drizzle, Neon driver,
// etc.) — the import is erased at build time.
//
// Usage (unchanged from the Muse version):
//
//     import { api, type ApiResponse } from "./api";
//     type GameState = ApiResponse<typeof api, "getGameState">;

import type { Actions } from "../../api/_lib/game";

/** Turns one server action entry into its call signature. */
type ToFn<A> = A extends { handler: (args: infer Args) => infer R }
  ? (args: Args) => R
  : never;

/** The typed client: one method per server action. */
export type Api = { [K in keyof Actions]: ToFn<Actions[K]> };

/** Response type of one client method, e.g.
 *  ApiResponse<typeof api, "getGameState">. */
export type ApiResponse<
  T extends Record<string, (args: never) => Promise<unknown>>,
  K extends keyof T,
> = Awaited<ReturnType<T[K]>>;

async function callAction<K extends keyof Actions>(
  action: K,
  args: Parameters<Api[K]>[0],
): Promise<Awaited<ReturnType<Api[K]>>> {
  const res = await fetch("/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `Server game error (${res.status}).`,
    );
  }
  return data as Awaited<ReturnType<Api[K]>>;
}

export const api: Api = {
  getGameState: (args) => callAction("getGameState", args),
  startScan: (args) => callAction("startScan", args),
  startMine: (args) => callAction("startMine", args),
  collectJob: (args) => callAction("collectJob", args),
  cancelJob: (args) => callAction("cancelJob", args),
  completeExpedition: (args) => callAction("completeExpedition", args),
  abandonAsteroid: (args) => callAction("abandonAsteroid", args),
  travelToMap: (args) => callAction("travelToMap", args),
  createPremiumOrder: (args) => callAction("createPremiumOrder", args),
  confirmPremiumOrder: (args) => callAction("confirmPremiumOrder", args),
  rejectPremiumOrder: (args) => callAction("rejectPremiumOrder", args),
  grantPremium: (args) => callAction("grantPremium", args),
  claimDailyBonus: (args) => callAction("claimDailyBonus", args),
  watchAd: (args) => callAction("watchAd", args),
  sellOre: (args) => callAction("sellOre", args),
  sellAllOre: (args) => callAction("sellAllOre", args),
  buyUpgrade: (args) => callAction("buyUpgrade", args),
  requestWithdrawal: (args) => callAction("requestWithdrawal", args),
  cancelWithdrawal: (args) => callAction("cancelWithdrawal", args),
  updateWithdrawal: (args) => callAction("updateWithdrawal", args),
};
