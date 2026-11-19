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
import { getCurrentLang, t } from "./i18n.js";

/** Turns one server action entry into its call signature. The
 *  server handler takes (args, session) — the client only ever
 *  passes args; the session is resolved server-side from initData,
 *  so only the first parameter is exposed here. */
type ToFn<A> = A extends { handler: (...args: infer P) => infer R }
  ? (args: P[0]) => R
  : never;

/** The typed client: one method per server action. */
export type Api = { [K in keyof Actions]: ToFn<Actions[K]> };

/** Response type of one client method, e.g.
 *  ApiResponse<typeof api, "getGameState">. */
export type ApiResponse<
  T extends Record<string, (args: never) => Promise<unknown>>,
  K extends keyof T,
> = Awaited<ReturnType<T[K]>>;

/** Reads the Telegram WebApp initData for this session, if the game
 *  runs inside Telegram. Empty string in a plain browser (the server
 *  then plays as the legacy web player). The value is an opaque
 *  signed string — the client never parses an id out of it; only the
 *  server validates it. */
export function getTelegramInitData(): string {
  try {
    return window.Telegram?.WebApp?.initData ?? "";
  } catch {
    return "";
  }
}

/** Diagnostik sesi (hanya untuk ditampilkan ke pemain sendiri, bukan
 *  untuk keputusan server): apakah game berjalan di dalam Telegram,
 *  apakah Telegram memberikan initData, dan id Telegram yang terlihat
 *  di initDataUnsafe. Id di sini TIDAK dipercaya server — server
 *  hanya memakai id dari initData yang lolos validasi hash. */
export function getTelegramSessionInfo(): {
  inTelegram: boolean;
  hasInitData: boolean;
  userId: number | null;
} {
  try {
    const wa = window.Telegram?.WebApp;
    if (!wa) return { inTelegram: false, hasInitData: false, userId: null };
    const uid = wa.initDataUnsafe?.user?.id;
    return {
      inTelegram: true,
      hasInitData: (wa.initData?.length ?? 0) > 0,
      userId: typeof uid === "number" ? uid : null,
    };
  } catch {
    return { inTelegram: false, hasInitData: false, userId: null };
  }
}

async function callAction<K extends keyof Actions>(
  action: K,
  args: Parameters<Api[K]>[0],
): Promise<Awaited<ReturnType<Api[K]>>> {
  const res = await fetch("/api/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // initData accompanies every call so the server can resolve the
    // calling player (or reject a forged one) on every action.
    // `lang` travels with it so server-written messages (errors,
    // activity log entries) come back in the player's language.
    body: JSON.stringify({
      action,
      args,
      initData: getTelegramInitData(),
      lang: getCurrentLang(),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : t("serverErrorStatus", { status: res.status }),
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
  clearPlayerFlag: (args) => callAction("clearPlayerFlag", args),
};
