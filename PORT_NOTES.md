# ASTRA MINING — Port notes (Muse runtime → Vercel + Neon)

This directory is the **standalone** copy of the game. It was ported
off the Muse runtime because the Vercel build failed at `bun install`:
`package.json` depended on `@hatch/space-sdk` via a local file
(`file:/opt/hatch/.../space-sdk.tgz`) that only exists on the Muse
machine. The live Muse-hosted game was not touched.

## What changed

**Removed — every trace of `@hatch/space-sdk` (verified by grep):**
- `package.json`: SDK dependency removed; added
  `@neondatabase/serverless` (Neon driver) and, as devDependencies,
  `esbuild` + `@tailwindcss/cli` for the client build.
- `bun.lock`: regenerated — 92 packages, zero references to
  `space-sdk` or `/opt/hatch`.
- `server/` (Muse actions + SQLite schema): **deleted**. The game
  logic now lives in `api/_lib/game.ts`.
- `client/src/api.ts`: `createActionClient` replaced with a typed
  `fetch` client posting `{action, args}` to `/api/game`. The call
  shape the UI uses (`api.getGameState({})`, `api.startScan({})`, …)
  is unchanged.
- `client/src/main.tsx`: `spaceQueryClient` replaced with a plain
  `new QueryClient()`.
- `client/src/App.tsx`: `SafeAreaTopScrim` (SDK component) replaced
  with a plain `<div className="bg-[var(--bg)] pt-safe" />` using the
  `tailwindcss-safe-area` utility. No other UI/text change.
- `client/build.mjs`: `buildClient` (SDK) replaced with a standalone
  build — esbuild bundles the React app, the Tailwind v4 CLI compiles
  `theme.css`, and `index.html` is generated with the hashed JS/CSS.
- `client/index.html`: only the `<title>` changed
  ("Dalam Tanah P2E" → "ASTRA MINING — Tambang Luar Angkasa P2E").
- `bunfig.toml`: Muse-specific install-cache override removed.
- `client/tsconfig.json` / new `api/tsconfig.json`: server include
  paths updated (client now type-imports `api/_lib/game`).

**Added:**
- `api/_lib/store.ts`: Drizzle client over Neon's HTTPS endpoint
  (`drizzle-orm/neon-http` + `@neondatabase/serverless`), schema
  from `deploy/neon/schema.pg.ts`. `DATABASE_URL` from env only,
  `sslmode=require` enforced, never logged.
- `api/_lib/game.ts`: all 20 game actions ported 1:1 from the old
  `server/src/actions.ts` (same constants, odds, durations, costs,
  messages, and Drizzle queries — only the database behind them
  changed from SQLite/`ctx.db` to Neon). Dispatch via
  `dispatchGameAction(action, args)` with zod request validation.
- `api/game.ts`: `POST /api/game` — the single game endpoint.
  Business failures return HTTP 200 `{ok:false, error}`; unknown
  actions / invalid args are HTTP 400; server failures are HTTP 500.
- `vercel.json`: real `buildCommand` (`bun run build:client`),
  `outputDirectory: client/dist`, CSP header kept (Telegram embed),
  `api/game.ts` maxDuration 30s, `api/health.ts` 10s.
- `deploy/README.md` + `deploy/neon/schema.pg.ts` / `init.sql`:
  comments updated to the ported state.
- `.gitignore`: `node_modules/`, `client/dist/`, `.bun-cache/`.

**Left as-is:**
- `drizzle/` migration files are the legacy SQLite migrations from
  the Muse runtime; the Neon database is created from
  `deploy/neon/init.sql` instead.
- `deploy/neon/init.sql` / `schema.pg.ts`: unchanged except comments.

**Unchanged game rules** (owner-settled, verified in the smoke test):
KT economy (1,000 KT = 1 GRAM, sell prices at the patched level),
escalating WD minimum (500 → 1,000 → 2,000 → 3,000 → 5,000 →
10,000 KT, 500 KT steps, computed from paid-WD history), manual WD
payout (no smart contract, reject/cancel refunds in full), Premium in
Telegram Stars only (Standard 150/7d, Pro 500/30d, Pro = dual drill),
power (1/4 min regen, Tangki = capacity only, Reaktor = −10%/level),
scan 2.5 min base with map factors ×1/×1.3/×1.6/×2.0/×2.5, 5 maps
with their gems and challenges, ads 10/day +15 KT with 60s cooldown,
server-side validation of everything.

## Per-player sessions — Telegram initData (2026-11-18, implemented, NOT yet deployed)

The single-player limitation above is fixed in this directory (not
yet pushed/deployed — the live Vercel deployment still runs the old
single-player code until the owner pushes + redeploys + migrates):

- `api/_lib/telegram.ts` (new): server-side Telegram WebApp
  `initData` validation per Telegram's spec — secret =
  HMAC_SHA256("WebAppData", BOT_TOKEN), data_check_string hash
  compared constant-time, `auth_date` max 24h old. BOT_TOKEN from
  env only, never logged; missing BOT_TOKEN fails closed (every
  Telegram login rejected).
- `player.telegram_id` BIGINT UNIQUE (NULL only for the legacy web
  player id=1); `player_id` on inventory, upgrades, wd_requests,
  premium_orders, activity (composite PKs on inventory/upgrades).
  `player.id` is now IDENTITY START WITH 1000 so the sequence can
  never hand out id=1 to a Telegram player (explicit inserts do not
  advance the sequence — the first Telegram player would otherwise
  collide with the legacy row).
- `deploy/neon/init.sql` updated to the new schema (fresh installs);
  `deploy/neon/migration-0001-telegram-id.sql` (new) migrates the
  existing Neon DB in place — existing rows are adopted as the
  legacy player's (player_id=1), idempotent, safe to re-run.
- `api/_lib/game.ts`: `dispatchGameAction(action, input, initData)`
  resolves the session FIRST; every handler works on the session
  player's row only. Admin actions (updateWithdrawal,
  confirmPremiumOrder, rejectPremiumOrder, grantPremium) are gated
  in dispatch to ADMIN_TELEGRAM_ID only (validated Telegram initData)
  and always move KT/premium on the WD/order OWNER's row, never the
  admin's. The legacy web player (no initData) is a REGULAR player —
  it can play, but it is NOT admin, never sees the Kendali tab, and
  cannot run admin actions. `getGameState` returns `player.isAdmin` +
  `adminStats` (global paid-GRAM total, admin only); non-admins see only their own WDs/orders.
- Client: `telegram-web-app.js` in `client/index.html`,
  `window.Telegram.WebApp.initData` sent with every `/api/game`
  call (`client/src/api.ts`), `ready()` + `expand()` guarded in
  `main.tsx`; the Kendali tab is hidden for non-admins (`App.tsx`)
  — server enforcement is what matters, the tab is only cosmetic.
- Env vars (Vercel, never in code): `BOT_TOKEN` (BotFather),
  `ADMIN_TELEGRAM_ID` (owner's numeric Telegram id). Documented in
  `deploy/README.md` + `.env.example`.

Verified locally (2026-11-18): clean-copy `bun install` (92
packages, 0 space-sdk refs), `bun run typecheck` 0 errors under
BOTH strict and Vercel-style (`--strictNullChecks false`) settings
— the non-strict run caught 3 real bugs (see note below),
`bun run build:client` OK, route checks (GET→405, forged
initData→200 `{ok:false}`, non-string initData→400, unknown
action→500). Against local Postgres 16 (migration-0001 applied,
idempotent): old smoke test 7/7 (101 assertions) + new
`/tmp/smoke-test/telegram.test.ts` 6/6 — two validated initData
payloads get independent players/balances/inventory, tampered/
stale/wrong-token initData rejected, missing BOT_TOKEN fails
closed, non-admin cannot approve WD / confirm Premium / grant
Premium, admin approve→pay lands on the WD owner's row and the
escalating WD minimum rises per-player, legacy no-initData path
still works as a REGULAR (non-admin) player id=1 that can play but
cannot run any admin action. All 13 tests pass, 3 consecutive
runs.

## Admin is Telegram-only (2026-11-18, tightening — NOT yet deployed)

The first sessions pass left one hole: a request with NO initData
resolved to the legacy web player id=1 **with isAdmin=true**, so
anyone opening the site in a plain browser (or in Telegram's
in-app browser, which sends no initData) got the shared admin
account and saw the Kendali tab. Fixed in this directory:
`resolveSession` now returns `isAdmin: false` for the no-initData
legacy player, and the dispatch gate admits only a validated
Telegram initData whose id equals `ADMIN_TELEGRAM_ID`. The legacy
player keeps its balance/progress and can play normally — it just
has no admin rights and never sees Kendali. Client already hides
the Kendali tab when `p.isAdmin` is false (App.tsx) — verified,
no UI change needed. Docs updated (`deploy/README.md`, this file).
Verified locally: typecheck 0 errors (strict + Vercel-style),
`bun run build:client` OK, telegram tests extended (legacy
non-admin: can play, cannot approve WD / confirm or reject Premium
/ grant Premium; admin can approve a legacy player's WD onto the
owner's row) + the 7 game tests updated to call admin actions with
validated admin initData. Deploy note: until this is pushed +
redeployed, the live site still grants admin to the legacy web
player.

Typecheck note (Vercel lesson, same class as the TS7018 incident):
Vercel typechecks WITHOUT strictNullChecks, and under that setting
(a) `!x.ok` does NOT narrow a discriminated union — the code uses
`=== false` in `telegram.ts` resolveSession and in
dispatchGameAction, (b) bare `null` in an untyped object literal
widens to implicit any — `insertFreshPlayer` types its nulls
explicitly, (c) `unknown` from the request body does not narrow by
`typeof` guards the same way — `api/game.ts` extracts initData
with an explicit `string | undefined` type.

## Known limitation — single player, no auth

~~The Muse version was effectively single-player (one `player` row,
id = 1). This port keeps that: **anyone who opens the deployed URL
shares the same player, KT balance, and admin (Kendali) tab**. No
Telegram auth was invented. Before opening this to real players,
per-player identity (e.g. Telegram WebApp `initData` validation)
must be added — otherwise one player's WD queue is everyone's.~~
SUPERSEDED — see "Per-player sessions" above. The limitation now
applies only to the LIVE deployment until the owner pushes this
code, redeploys, runs migration-0001 on Neon, and sets BOT_TOKEN +
ADMIN_TELEGRAM_ID in Vercel.

## What was tested (2026-11-18, local machine)

- `bun install` in a **clean copy** of this dir: OK (92 packages,
  0 references to `space-sdk` / `/opt/hatch` in `bun.lock`).
- `bun run typecheck` (client + api): OK, 0 errors.
- `bun run build:client`: OK — `client/dist` has `index.html` +
  hashed JS/CSS/WebP assets; built CSS contains the Tailwind
  utilities, `pt-safe`, and all game keyframes/animations.
- Route wiring (no DB): `GET /api/game` → 405, missing action →
  400, unknown action → 500, `getGameState` without `DATABASE_URL`
  → 500 with a clean message (no secret material); `/api/health`
  without `DATABASE_URL` → 503.
- **End-to-end gameplay against a local Postgres 16** (test DB
  `astra_test` on this machine, `deploy/neon/init.sql` applied):
  7 bun tests, 101 assertions, **7 pass, 0 fail, 3 consecutive
  runs**. Covered: player creation + first asteroid, daily bonus
  (once/day), ad reward + 60s cooldown, scan → collect → mine all
  veins → expedition completion (bonus 12 KT, sector 2), sell-all,
  upgrade purchase, map travel locks, WD below-minimum rejection,
  WD approve → pay, WD minimum escalating 500 → 1,000 KT after the
  first paid WD, Premium order (500 Stars) → confirm → Pro with dual
  drill + regen 120s, abandon asteroid, cancel job, and the
  mission/economy activity split. The test swaps only the driver
  (node-postgres instead of Neon HTTPS) via `mock.module` on
  `api/_lib/store.ts`; the handlers, queries, and schema are the real
  code. Test file: `/tmp/smoke-test/game.test.ts` (not committed).
- One behavior note found by the tests: WD amounts **below 500 KT**
  are rejected at the zod request layer (HTTP 400, generic message),
  because the request schema has `.min(500)` — same as the Muse
  version, where the SDK validated the same way. Amounts ≥ 500 KT
  below the escalating minimum get the handler's detailed message.

## Anti-cheat — automated bot detection + admin review (2026-11-19, implemented, NOT yet deployed)

- Why: a player can extract their own valid `initData` and script
  API calls 24/7 with perfect timing, and one person can run many
  Telegram accounts. Server-side validation alone cannot catch that.
- Design (flag-for-review only — **no auto-ban, no blocking of
  play**; false positives are tolerated by design): four server-side
  rules in `api/_lib/anticheat.ts`, evaluated at most 1×/hour per
  player (`player.last_eval_hour`) plus incrementally on the player's
  own actions — never a full-table scan per request:
  - Nonstop play: game actions in ≥20 of the last 24 distinct
    hours (from the `activity` log) → +40.
  - Instant collect: the last 10 collect actions each within 10s
    of the job's server-side completion (`job.endsAt` vs collect
    time, streak counter on the player row) → +40.
  - Multi-account: >3 distinct `telegram_id` from the same IP in
    24h (IP from the `x-forwarded-for` header set by Vercel edge,
    never client-sent) → +30.
  - Impossible speed / tampering: action arriving while the
    server-side timer still runs (early collect, second scan/mine
    while a job is active) — already rejected by validation, counted
    as a tamper signal; ≥5 in 24h → +30.
  - Same rule does not re-fire within 24h (per-rule cooldown);
    each firing raises `risk_score` and records a human-readable
    reason in `security_flags` (audit trail).
- Storage: `player` gains `username`, `risk_score` (default 0),
  `flag_reason`, `flagged_at`, `instant_collect_streak`,
  `tamper_count`, `tamper_since`, `last_eval_hour`; new tables
  `security_flags` and `player_ip`. `deploy/neon/init.sql` updated
  for fresh installs (also fixed a pre-existing bug there:
  `premium_orders` lacked the `player_id` column that
  `schema.pg.ts` already had, so the index failed on fresh
  installs with error 42703). Migration
  `deploy/neon/migration-0002-anticheat.sql` is idempotent and must
  run BEFORE redeploying the new code on an existing database.
- Enforcement: a flagged player keeps playing normally; only their
  WD requests are marked `needsReview` (computed live from the
  owner's current `risk_score` in `getGameState`) and they appear in
  the admin review list. Admin clears flags via `clearPlayerFlag`
  (admin-only, same gating as other Kendali actions).
- Client: Kendali tab gains a "Pemain Mencurigakan" section
  (username/Telegram ID, risk score, reason, KT balance, paid-WD
  count, flagged date, "Bersihkan" button); `AdminWdCard` shows an
  amber "Perlu ditinjau" warning when `wd.needsReview`. No other UI
  changes. No game rules, economy numbers, timings, WD minimums, or
  Premium changed.
- Detection functions swallow their own errors so detection never
  breaks gameplay.
- Tested locally (Postgres 16, `astra_test`): **21/21 tests pass,
  6 consecutive runs, 0 fail** — 7 anti-cheat tests (67 expects:
  bot pattern flagged with the right reason, 24h cooldown, human
  play stays clean, 5× early collect → tamper flag, flagged WD
  `needsReview` + appears in admin `flaggedPlayers`, multi-account
  4/IP flagged vs 3/IP clean, flagged player still plays normally,
  admin clear → drops off the list, non-admin cannot clear), plus
  the recreated regression suites: 8 game tests + 6 Telegram
  session tests (player creation, daily bonus, ads, full
  scan→mine→expedition cycle, sell, upgrade, map locks, WD
  escalating minimum 500→1,000, Premium Pro, cancel/abandon, log
  split; independent players, forged/stale/wrong-token initData
  rejected, non-admin blocked from admin actions, admin approve→pay
  lands on the owner's row, legacy web player is non-admin). Test
  files: `/tmp/smoke-test/{anticheat,game,telegram}.test.ts`
  (not committed). `bun run typecheck` 0 errors under strict AND
  Vercel-style (`--strictNullChecks false`) settings;
  `bun run build:client` OK.
- One test lesson worth keeping: veins with the same ore are merged
  into one entry in `generateExpedition`, so `exp.veins.length` can
  be smaller than the rolled vein count — tests must use the actual
  length, not assume ≥3.

## What was NOT tested live

- Real Neon connectivity, `/api/health` against real Neon, and
  end-to-end gameplay on the actual Vercel deployment — no Neon
  credentials are stored anywhere (the connection string was shared
  in chat once and deliberately never saved). The Neon HTTPS
  transport is the one layer the local Postgres test cannot cover.
- The Vercel build itself — it has not run since the port. The
  first redeploy is the moment of truth (see below).
- Real Telegram Mini App embedding and Telegram Stars payment
  (manual confirm flow only, as before).

## Vercel steps (owner)

1. Push this directory to `jamalnggau1/mygamemining` (branch `main`).
   Note: `client/src/assets/*.webp` and `icon.webp` are already in the
   repo from the earlier upload; this port adds them to this staging
   dir too (fetched from the public repo) so the client build works.
2. In Neon, run `deploy/neon/init.sql` once on the empty database.
3. In Vercel, import the repo, then set `DATABASE_URL` (Production
   & Preview) in Project Settings → Environment Variables.
4. Deploy. Watch the build log: it must run `bun install` cleanly
   and `bun run build:client`, then serve `client/dist`.
5. Open `https://<domain>/api/health` — expect
   `{"ok":true,"database":"connected","tables":"ready"}`.
6. Play one full cycle on the live URL: scan → drill → collect →
   sell → check the KT balance, then one WD request in the Kendali
   tab. If anything fails, the build/runtime logs in Vercel are the
   first place to look.
7. **Before real players:** add per-player auth (see limitation
   above) and reset the Neon password if the connection string was
   ever shared in chat.
8. **Per-player sessions (2026-11-18, code ready in this dir, NOT
   yet deployed):** push this directory, redeploy, then in Neon run
   `deploy/neon/migration-0001-telegram-id.sql` once (NOT init.sql —
   the tables already exist), and in Vercel set `BOT_TOKEN` +
   `ADMIN_TELEGRAM_ID` (Production & Preview). Until then the live
   deployment still shares one player. See `deploy/README.md` →
   "Sesi per pemain (Telegram)".
9. **Anti-cheat (2026-11-19, code ready in this dir, NOT yet
   deployed):** push this directory, then in Neon run
   `deploy/neon/migration-0002-anticheat.sql` once (idempotent —
   safe to re-run; run AFTER migration-0001), and redeploy. Until
   then the live deployment has no bot detection. See
   `deploy/README.md` → "Anti-cheat otomatis (deteksi bot)".
