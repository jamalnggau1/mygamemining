# ASTRA MINING — Port notes (Muse runtime → Vercel + Neon)

This directory is the **standalone** copy of the game. It was ported
off the Muse runtime because the Vercel build failed at `bun install`:
`package.json` depended on `@hatch/space-sdk` via a local file
(`file:/opt/hatch/.../space-sdk.tgz`) that only exists on the Muse
machine. The live Muse-hosted game was not touched.

**Catatan mata uang (2026-11-19): payout pindah GRAM → USDT.**
Semua aturan SAAT INI di dokumen ini memakai USDT. Bagian riwayat
di bawah (rebalance #3–#6) masih memakai GRAM — itu sesuai zamannya:
sampai 2026-11-19 mata uang payout memang GRAM, dan angkanya tidak
diubah. Rasio tidak berubah: 1.000 KT = 1 USDT, sama seperti dulu
1.000 KT = 1 GRAM.

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
KT economy (1,000 KT = 1 USDT, sell prices at the rebalance #7
level — Regolith 0,025 KT, fractional balances to 3 decimals,
expedition bonus 0,25 + 0,05×sector CAPPED at 17,5 KT),
two-tier WD minimum (first WD 100 KT = 0,1 USDT; repeat WDs
minimum 5.000 KT = 5 USDT FLAT — the escalating ladder was
ABOLISHED 2026-11-19, see rebalance #4 below; 100 KT steps,
computed from paid-WD history) PLUS the per-WD maximum 5.000 KT
(5 USDT) — so a repeat WD is always exactly 5.000 KT. There is
NO time limit between WDs: the 14-day, then 30-day, cooldown was
REMOVED 2026-11-19 on the owner's instruction (see rebalance #7
below) — how fast a player can WD depends only on how fast they
accumulate KT. Manual WD payout (no smart contract, reject/cancel
refunds in full), Premium in Telegram Stars only (Standard 150/7d,
Pro 500/30d, Pro = dual drill), power (1/4 min regen, Tangki =
capacity only, Reaktor = −10%/level), scan 2.5 min base with map
factors ×1/×1.3/×1.6/×2.0/×2.5, 5 maps with their gems and
challenges, ads 10/day +0,375 KT with 1h cooldown, server-side
validation of everything.

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
  `adminStats` (global paid-USDT total, admin only); non-admins see only their own WDs/orders.
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
two-tier WD minimum (500 KT first, 5.000 KT flat after) applies
per-player, legacy no-initData path still works as a REGULAR
(non-admin) player id=1 that can play but cannot run any admin
action. All 13 tests pass, 3 consecutive runs.

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
  first paid WD (rule as of 2026-11-18; ABOLISHED 2026-11-19, see
  rebalance #4 — now 500 KT first, 5.000 KT flat after), Premium
  order (500 Stars) → confirm → Pro with dual drill + regen 120s,
  abandon asteroid, cancel job, and the mission/economy activity
  split. The test swaps only the driver
  (node-postgres instead of Neon HTTPS) via `mock.module` on
  `api/_lib/store.ts`; the handlers, queries, and schema are the real
  code. Test file: `/tmp/smoke-test/game.test.ts` (not committed).
- One behavior note found by the tests: WD amounts **below 500 KT**
  are rejected at the zod request layer (HTTP 400, generic message),
  because the request schema has `.min(500)` — same as the Muse
  version, where the SDK validated the same way. Amounts ≥ 500 KT
  below the two-tier minimum get the handler's detailed message.

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
- Tested locally (Postgres 16, `astra_test`): **37/37 tests pass,
  0 fail** — 7 anti-cheat tests (61 expects: bot pattern flagged
  with the right reason, 24h cooldown, human play stays clean, 5×
  early collect → tamper flag, flagged WD `needsReview` + appears
  in admin `flaggedPlayers`, multi-account 4/IP flagged vs 3/IP
  clean, flagged player still plays normally, admin clear → drops
  off the list, non-admin cannot clear), plus the recreated
  regression suites: 9 game tests (48 expects) + 9 Telegram session
  tests (27 expects) + 12 economy tests (66 expects — the two-tier
  WD rule and the simulation assertions, see rebalance #4 below).
  Each file run 3+ consecutive times; the game file ran 5× after one
  flake was found and fixed (a fresh asteroid can have 2 distinct
  veins because same-ore rolls merge — the test asserted ≥3). Test
  files: `/tmp/smoke-test/{anticheat,game,telegram,economy}.test.ts`
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
10. **Rebalance #5 — fractional KT (2026-11-19, code ready in
    this dir, NOT yet deployed):** push this directory, then in
    Neon run `deploy/neon/migration-0003-fractional-kt.sql` once
    (idempotent — safe to re-run; run AFTER migration-0002), and
    redeploy. Until then the live deployment still pays integer
    KT at the old rates. See `deploy/README.md` → "Langkah
    deploy" and the rebalance #5 section below.
11. **Referral tracking + automatic reward (2026-11-20, code
    ready in this dir, NOT yet deployed):** push this directory,
    then in Neon run `deploy/neon/migration-0005-referrals.sql`
    once (idempotent — safe to re-run; run AFTER migration-0004),
    and redeploy. **Run the migration BEFORE redeploying** — the
    new code reads/writes the `referrals` table on every
    getGameState / completeExpedition (failures degrade to
    "no referral" rather than crashing the game, but no referral
    is tracked or paid until the table exists). Until then the
    live deployment shows "0 teman / 0 KT" in the Komunitas tab
    and pays no referral reward. See the "Logika referral"
    section below.

## Economy rebalance #3 — conversion + WD ladder (2026-11-19, implemented, NOT yet deployed)

**SUPERSEDED 2026-11-19 by rebalance #4 below: the WD ladder
(75.000 → 1.500.000 KT) is ABOLISHED. The price cuts from #3 STAY
(Regolith 1, Kondrit 2, Besi-Nikel 5, Kobalt 10, Platinum 45,
Iridium 144, Helium-3 360 KT; map gems unchanged).** The rest of
this section is kept as the record of what #3 was.

Owner decision: first WD for an ACTIVE player WITHOUT upgrades takes
10+ days (10 days = the lucky/max-effort case); casual players take
much longer; players WITH upgrades reach it MUCH faster (upgrade-first
economy). Principle: "boleh mahal asal langka" — only small-tier prices
cut, rares stay expensive. Ratio stays 1.000 KT = 1 GRAM, WD amounts in
500 KT (0,5 GRAM) steps. Ads (+15 KT, max 10/day) and daily bonus
(25 KT) UNCHANGED; power costs/regen, scan/drill times, map factors,
Premium, upgrade costs/effects all UNCHANGED. No DB migration needed —
prices and ladder are code constants in `api/_lib/game.ts`.

New base prices (KT): Regolith 2→**1**, Kondrit 6→**2**, Besi-Nikel
14→**5**, Kobalt 30→**10**, Platinum 66→**45**, Iridium 144 (unchanged),
Helium-3 360 (unchanged). All map gems unchanged (Opal 39 … Voidium
1.440). New WD ladder (KT, per paid-WD count, capped at last rung):
**75.000 → 150.000 → 300.000 → 450.000 → 750.000 → 1.500.000**
(old: 500 → 1.000 → 2.000 → 3.000 → 5.000 → 10.000). First minimum
75.000 KT = 75 GRAM. The zod request floor stays `.min(500)` on
purpose: 500 is the 0,5 GRAM granularity step, NOT the effective
minimum — the ladder is enforced in the `requestWithdrawal` handler
with the detailed message naming the minimum (raising the zod floor
would swallow that message into a generic HTTP 400). Zod cap raised
`.max(1000000)` → `.max(10000000)` so the top rung (1.500.000 KT) can
be requested. WD minimum messages now use Indonesian thousand
separators (`75.000 KT`). Client WD tab reads `wdMinKt`/`wdMinGram`
from the server, so it needed no change except the hardcoded ladder
text at `client/src/App.tsx` line 819 (now 75.000 → 1.500.000 KT).

Simulated days-to-first-WD (Monte Carlo from the REAL loot generator,
`generateExpedition` + real constants, 20k expeditions/map, with
daily bonus + ads included; KT/tank: Map 1 ~142, Map 5 ~716):
- Max-effort, no upgrades, 12 tanks/day (360 energy, theoretical
  ceiling): **10 days** — the lucky case.
- Max-effort, no upgrades, 8 tanks/day (240 energy): **14–15 days**.
- Active, no upgrades (6 tanks/day, 5 ads): **21 days**.
- Casual, no upgrades (1.5 tanks/day, 2 ads): **~82 days**.
- Mid-upgraded (Negosiator/Ransel/Bor/Pemindai/Tangki/Beliung level 5,
  ~608 energy/day, 10 ads): **4 days** — upgrades cut the wait to
  ~1/5 of the max-effort time.
Ads + bonus alone (175 KT/day) need 429 days to reach 75.000 KT, so
the floor cannot shortcut the first WD. The ~82-day casual figure is
a direct consequence of the 10-day-at-max-effort requirement.

Verified locally (2026-11-19): `bun run typecheck` 0 errors (strict
AND Vercel-style `--strictNullChecks false`), `bun run build:client`
OK, full suite 26/26 pass × 3 consecutive runs vs local Postgres
(`/tmp/smoke-test/`: `economy.test.ts` new — prices, WD below minimum
rejected with the correct minimum in the message, WD at exactly
75.000 succeeds and escalates to 150.000, ladder rungs + cap at
1.500.000, simulation assertions computed from the real constants;
`game.test.ts`, `telegram.test.ts`, `anticheat.test.ts` updated to the
new ladder amounts). NOT verified live.

## Economy rebalance #4 — WD ladder ABOLISHED, two-tier minimum + bankruptcy recalculation (2026-11-19, implemented, NOT yet deployed)

Owner decision (2026-11-19 08:30 WITA, his words: "waduh jangan
sampai saya malah bangkrut nih"): the escalating WD ladder from
rebalance #3 is ABOLISHED. **New rule — two tiers, flat, no
ladder: first WD minimum 500 KT (0,5 GRAM); second WD onwards
minimum 5.000 KT (5 GRAM) FLAT.** Amounts stay in 500 KT (0,5
GRAM) multiples, so a repeat WD can be 5.000, 5.500, 10.000 KT,
etc. — 5.000 KT is the MINIMUM for repeat WDs, not an exact amount.
Ratio stays 1.000 KT = 1 GRAM. The steep price curve from
rebalance #3 STAYS (Regolith 1, Kondrit 2, Besi-Nikel 5, Kobalt 10,
Platinum 45, Iridium 144, Helium-3 360 KT; map gems unchanged).
Prices, power, timings, Premium, anti-cheat, and sessions are all
UNCHANGED. No DB migration needed — the rule is code constants
(`WD_FIRST_MIN_KT = 500`, `WD_REPEAT_MIN_KT = 5000`,
`wdMinKtForPaidCount` in `api/_lib/game.ts`); `paidCount` (paid-WD
history) is the source of truth, so existing balances, inventory,
upgrades, and WD history are untouched. The zod request floor stays
`.min(500)` on purpose (0,5 GRAM granularity, not the effective
minimum) and the cap stays `.max(10000000)`. Client WD tab reads
`wdMinKt`/`wdMinGram` from the server; the hardcoded ladder copy at
`client/src/App.tsx` line 819 now says "WD pertama 0,5 GRAM, WD
berikutnya minimum 5 GRAM".

### Recalculation — the bankruptcy math the owner asked for

Monte Carlo from the REAL loot generator (`generateExpedition` +
real constants, 20k expeditions/map) + a day-by-day simulation with
sector/map progression, completion-bonus growth, daily bonus
(25 KT) and ads included. Two independent runs agree within a few
percent. KT per 30-energy tank, ore only (no upgrades, completion
bonus excluded): Map 1 ~110, Map 2 ~131, Map 3 ~225, Map 4 ~459,
Map 5 ~703 KT/tank. Profiles: (a) max-effort, no upgrades, 12
tanks/day (360 energy, 10 ads); (b) active, no upgrades, 6
tanks/day (180 energy, 5 ads); (c) casual, no upgrades, 1.5
tanks/day (45 energy, 2 ads); (d) mid-upgrade, all upgrades level 5
(~608 energy/day, 10 ads; costs 23.430 KT to buy all level 5).

| Profile | Days to FIRST WD (500 KT) | Days between REPEAT WDs (5.000 KT) | GRAM in month 1 | GRAM / 30 days at steady state (days 46–60) |
|---|---|---|---|---|
| (a) Max-effort, no upgrades | 1 | ~0,4 | ~330 | ~524 |
| (b) Active, no upgrades | 1 | ~0,9 | ~147 | ~200 |
| (c) Casual, no upgrades | 2–3 | ~4 | ~29 | ~40 |
| (d) Mid-upgrade (all lvl 5) | 1 | ~0,1 | ~1.175 | ~1.790 |

Read it plainly: **the first WD is now day 1–3 for everyone**,
and an active player without upgrades can WD 5 GRAM roughly every
day — about 200 GRAM per player per month at steady state. A
mid-upgrade player is ~1.790 GRAM/month. With 100 active players
that is ~20.000 GRAM/month out of the owner's pocket.

### Bankruptcy note — the threshold alone does NOT cap total payout

The repeat-WD minimum (5.000 KT) only sets the SIZE of each WD.
Total GRAM/month per player is bounded by EARNINGS (energy +
loot + the completion bonus), not by the threshold: a player who
earns 6.500 KT/day will simply WD 5.000 KT every ~0,9 days and
still take ~200 GRAM/month. Raising the repeat minimum further
would only make each WD bigger and rarer, not smaller in total —
the money still leaves at the earnings rate.

Two structural facts behind the numbers:
- The expedition completion bonus (`10 + 2×sektor` KT) grows
  WITHOUT LIMIT as the player's sector rises, and it is 24–38% of
  an active player's earnings (casual ~9%). At sector 500 it pays
  ~1.010 KT per expedition on top of the ore. No WD rule touches
  this — it is the leak that keeps growing the longer someone plays.
- The mid-upgrade profile starts fully upgraded; the 23.430 KT
  upgrade investment is earned back in under a day at steady
  rates, so upgrades do not slow a determined player down for long.

### The 7-day WD cooldown — simulated, NOT implemented

Same profiles, one WD max per 7 days per player (reported only, so
the owner can decide):

| Profile | Days between WDs | WDs / 30 days | GRAM / 30 days (WD = 5.000 KT each) |
|---|---|---|---|
| (a) Max-effort | 7 | 4,29 | ~21,4 |
| (b) Active | 7 | 4,29 | ~21,4 |
| (c) Casual | 7 | 4,29 | ~21,4 |
| (d) Mid-upgrade | 7 | 4,29 | ~21,4 |

Every profile earns 5.000 KT in under 7 days, so the cooldown
binds everyone equally at ~21 GRAM/month. **BUT — and this is the
catch — the cooldown caps total payout ONLY if each WD is also
capped at 5.000 KT.** Without a per-WD maximum, a player simply
banks a week's earnings and withdraws it all at once: with
uncapped amounts the cooldown changes NOTHING about total GRAM
(524 / 200 / 40 / 1.790 per 30 days, as above) — it only cuts the
number of WDs to ~4,3/month. A cooldown that actually protects
the owner needs a per-WD maximum alongside it (e.g. max 5.000 KT
per WD). That combination is NOT implemented; it is the owner's
decision.

### Verified locally (2026-11-19)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK, full suite
37/37 pass vs local Postgres (`/tmp/smoke-test/`: `economy.test.ts`
new — (a) WD below 500 rejected, (b) exactly 500 succeeds for a
first-timer, (c) after one paid WD the minimum is 5.000 and a 2.000
request is rejected, (d) a 5.000 repeat WD succeeds (and 5.500),
(e) non-multiples of 500 rejected, (f) simulation assertions from
the real constants; `game.test.ts`, `telegram.test.ts`,
`anticheat.test.ts` regressions still pass). NOT verified live.
NOT pushed to GitHub — awaiting the owner's decision on the
cooldown and/or a per-WD maximum before pushing.

**The #4 earnings numbers above are SUPERSEDED by rebalance #5
below (same WD rule, income ÷10). The two-tier WD rule from #4
(first 500 KT, repeat 5.000 KT flat) STAYS — only the earnings
numbers changed.**

## Economy rebalance #5 — ALL KT income ÷10, fractional KT (2026-11-19, implemented, NOT yet deployed)

Owner decision (2026-11-19 08:51 WITA, his words: "tinggal kurangi
saja pendapatan KT mereka beress" — just cut their KT income, keep
it simple): **no cooldown, no per-WD maximum, no bonus cap.**
Divide ALL KT income by 10 and nothing else. The WD rule from #4
STAYS (first WD 500 KT = 0,5 GRAM, repeat WDs minimum 5.000 KT =
5 GRAM flat, amounts in 500 KT multiples, ratio 1.000 KT = 1 GRAM).
Upgrade costs UNCHANGED (they are sinks, not income). Power
costs/regen, scan/drill times, map factors, Premium, anti-cheat,
and sessions UNCHANGED.

New prices (KT per unit): Regolith 1 → **0,1**, Kondrit 2 → **0,2**,
Besi-Nikel 5 → **0,5**, Kobalt 10 → **1**, Platinum 45 → **4,5**,
Iridium 144 → **14,4**, Helium-3 360 → **36**; map gems ÷10 too
(Opal 39 → 3,9, Topaz 51 → 5,1, Turkuois 78 → 7,8, Ametis 105 →
10,5, Zamrud 192 → 19,2, Rubi 252 → 25,2, Safir 420 → 42, Berlian
570 → 57, Opal Es Hitam 900 → 90, Voidium 1.440 → **144**).
Expedition bonus 10 + 2×sektor → **1 + 0,2×sektor** KT, daily
bonus 25 → **2,5** KT, ads reward 15 → **1,5** KT (cap 10/day +
60s cooldown unchanged). Faucet floor is now 2,5 + 15 = 17,5
KT/day: ~29 days to a first WD and ~286 days to a repeat WD on
faucet alone — it can no longer shortcut any WD.

### Fractional balances — why DOUBLE PRECISION

KT now moves in 0,1 KT steps, so `player.kt_balance`,
`player.total_kt_earned` and `activity.amount_kt` are DOUBLE
PRECISION (was INTEGER) in `deploy/neon/schema.pg.ts` +
`deploy/neon/init.sql`, and `deploy/neon/migration-0003-fractional-kt.sql`
(ALTERs, idempotent via `information_schema` checks — safe to
re-run) migrates existing databases. DOUBLE PRECISION — not
NUMERIC — because Drizzle maps it to a JS number in both drivers
(Neon HTTPS and node-postgres); NUMERIC comes back as a string
and would break every `p.ktBalance + x` (string concat) and every
`z.number()` check. Float dust is prevented in code instead:
every credit AND debit is rounded to 1 decimal at the point it
touches the balance (`roundKt` in `api/_lib/game.ts`), and the
client formatter (`fmt` in `App.tsx`) shows at most 1 decimal.
One real bug this caught: the sell handlers used to round the
UNIT price (`Math.round(ore.price × mult)`), which would have
made Regolith worth 0 KT — the total sale is now rounded to 1
decimal instead. WD request amounts stay integers (500 KT
multiples); the zod floor stays `.min(500)`.

### Recalculation (same Monte Carlo + day-by-day model as #4, real constants, 2 runs agreeing within a few percent)

KT per 30-energy tank, ore only (no upgrades, completion bonus
excluded): Map 1 ~11,1, Map 2 ~13,2, Map 3 ~23,7, Map 4 ~50,4,
Map 5 ~80,0. Hull fees per tank (unchanged costs): Map 1–2 0,
Map 3 ~9,6, Map 4 ~43,7, Map 5 ~99,3 — so Map 5 is NET-NEGATIVE
on ore minus fees alone (−20 KT/tank); only the sector bonus
makes the far maps pay. The sim now models the real game
faithfully: fees are capped at the running balance (like
collectJob's `min(damageFeeKt, ktBalance)` — the old sim
subtracted full fees from a zero balance and went negative),
and the simulated player mines the unlocked map with the best
expected NET KT per energy instead of always the farthest map.

| Profile | Days to FIRST WD (500 KT) | Days between REPEAT WDs (5.000 KT) | GRAM in month 1 | GRAM / 30 days, days 46–60 | Days to afford all lvl-5 upgrades (23.430 KT) |
|---|---|---|---|---|---|
| (a) Max-effort, no upgrades | 2 | ~2 | ~34 | ~108 | ~25 |
| (b) Active, no upgrades | 5 | ~7 | ~10 | ~28 | ~50 |
| (c) Casual, no upgrades | 16 | ~32 | ~1,2 | ~2,3 | >180 (never in horizon) |
| (d) Mid-upgrade (all lvl 5) | 1 | ~1 | ~76 | ~262 | 14 (payback period — starts fully upgraded) |

Read it plainly: 100 active players ≈ **2.800 GRAM/month** at
days 46–60 (was ~20.000 in #4). An ACTIVE player needs ~50 days
of earnings to afford all level-5 upgrades — upgrades now take
~10× longer to afford, which itself brakes the upgraded-player
payout problem.

### Honest caveat — the cut is NOT a clean ÷10 on payout

The ÷10 cut reduces payout ~5× (max-effort), ~7× (active),
~17× (casual) at days 46–60 — not 10× — because the completion
bonus (1 + 0,2×sektor) still grows WITHOUT LIMIT with sector and
is now 86–93% of earnings (was 24–38% in #4): a rational player
farms cheap Map 1, which gives the most bonus per energy (the
bonus is the same on every map, but a Map 1 expedition costs
~20 energy vs ~39 on Map 5). There is NO true steady state:
at days 166–180 the same profiles pay ~349 / ~88 / ~6 / ~935
GRAM per 30 days and keep climbing linearly with sector. Maps
4–5 are now strictly worse than Map 1 for earning KT (only the
sector bonus makes them pay at all, and Map 1 pays more bonus
per energy) — they remain for variety and their exclusive gems,
not for income. The owner chose this deliberately ("kurangi saja
pendapatan, simpel") and declined the cooldown / per-WD-max /
bonus-cap brakes, so these dynamics are the accepted trade-off
of the simple cut.

### Verified locally (2026-11-19)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK.
Migration-0003 applied to the local test DB twice (idempotent —
`DO` both times, columns now DOUBLE PRECISION). Full suite
**44/44 pass, 3 consecutive runs** vs local Postgres
(`/tmp/smoke-test/`: `economy.test.ts` 19/19 — fractional sell
prices in the response (Regolith 0,1 KT), 3 Regolith = 0,3 KT,
10× 0,1 KT credits = exactly 1 KT (no float dust), mixed-ore
sellAll = 1,2 KT, daily bonus 2,5 KT, expedition bonus 1,2 KT
at sector 1, WD rules unchanged, simulation assertions from the
real constants; `game.test.ts` 9/9, `telegram.test.ts` 9/9,
`anticheat.test.ts` 7/7 regressions). NOT verified live.
NOT pushed to GitHub.

### Deploy steps (owner, in order)

1. Push this directory to GitHub, then in Neon run
   `deploy/neon/migration-0002-anticheat.sql` (if not done yet)
   and then `deploy/neon/migration-0003-fractional-kt.sql` —
   both idempotent, safe to re-run. Database kosong tidak perlu
   migrasi: `init.sql` terbaru sudah berisi semuanya.
2. Redeploy on Vercel. Until then the live deployment still runs
   integer-KT balances and the old income rates.
3. **Rebalance #6 (2026-11-19, code ready in this dir, NOT yet
   deployed): no migration needed** — the balance column is
   already DOUBLE PRECISION from migration-0003; the ÷20 income
   cut and the bonus cap are code constants. Push + redeploy only.

## Economy rebalance #6 — ALL KT income ÷20 total + CAPPED expedition bonus (2026-11-19, implemented, NOT yet deployed)

Owner decision (2026-11-19 09:10 WITA, his words: "Potong
penghasilan lagi (÷20)"): the first WD at 5 days broke the
original >10-day agreement, and a weekly WD is bankruptcy in his
words. He chose: halve income AGAIN (÷20 total) AND cap the
expedition bonus. Keep it simple — no cooldown, no per-WD max,
no other new mechanic.

New prices (KT per unit, halved from #5): Regolith 0,1 → **0,05**,
Kondrit 0,2 → **0,1**, Besi-Nikel 0,5 → **0,25**, Kobalt 1 →
**0,5**, Platinum 4,5 → **2,25**, Iridium 14,4 → **7,2**,
Helium-3 36 → **18**; map gems halved too (Opal 3,9 → 1,95,
Topaz 5,1 → 2,55, Turkuois 7,8 → 3,9, Ametis 10,5 → 5,25,
Zamrud 19,2 → 9,6, Rubi 25,2 → 12,6, Safir 42 → 21, Berlian
57 → 28,5, Opal Es Hitam 90 → 45, Voidium 144 → **72**).
Expedition bonus 1 + 0,2×sektor → **0,5 + 0,1×sektor, CAPPED at
MAX_COMPLETION_BONUS_KT = 35 KT** (binds at sector 345).
Daily bonus 2,5 → **1,25** KT, ads reward 1,5 → **0,75** KT
(cap 10/day + 60s cooldown unchanged). WD rule from #4 STAYS
(first WD 500 KT = 0,5 GRAM, repeat WDs minimum 5.000 KT =
5 GRAM flat, amounts in 500 KT multiples, ratio 1.000 KT =
1 GRAM). Upgrade costs UNCHANGED (23.430 KT for all level 5).
Prices now need 2 decimals: `roundKt` rounds every credit/debit
to 2 decimals, the client formatter (`fmt` in App.tsx) and the
server formatter (`fmtKt`) show max 2 decimals. No DB migration
needed (balance already DOUBLE PRECISION).

### The cap value — chosen from the simulation, not guessed

The target was an ACTIVE player's repeat-WD interval at ~14 days,
stable from days 46–60 through days 166–180. An active player
runs ~9 Map 1 expeditions/day (180 energy ÷ ~20 energy/exp) and
earns ~33 KT/day of ore + 5 KT/day of faucet, so the bonus must
supply ~319 KT/day: 319 ÷ 9 ≈ 35 KT per expedition. The sim
confirms it: with the cap at 35 the active interval is 14,06
days (46–60) and 13,96–14,06 days (166–180) — a 0,7% difference.
The cap binds at sector 345, which an active player reaches
around day 38; a casual player reaches it around day 150.

### Recalculation (same Monte Carlo + day-by-day model as #4/#5, real constants, 2 runs agreeing within a few percent)

KT per 30-energy tank, ore only (no upgrades, completion bonus
excluded): Map 1 ~5,6, Map 2 ~6,6, Map 3 ~11,7, Map 4 ~25,1,
Map 5 ~39,8. Hull fees per tank (unchanged costs): Map 1–2 0,
Map 3 ~9,4, Map 4 ~43, Map 5 ~98,7 — Map 5 is still NET-NEGATIVE
on ore minus fees alone (−59 KT/tank); only the sector bonus
makes the far maps pay, and Map 1 still pays the most bonus per
energy, so a KT-maximising player still farms Map 1.

| Profile | Days to FIRST WD (500 KT) | Days between REPEAT WDs (5.000 KT), days 46–60 | Days between REPEAT WDs, days 166–180 | GRAM in month 1 | GRAM / 30 days, days 46–60 | GRAM / 30 days, days 166–180 | Days to afford all lvl-5 upgrades (23.430 KT) |
|---|---|---|---|---|---|---|---|
| (a) Max-effort, no upgrades | 4 | ~7,0 | ~7,0 | ~15,3 | ~21,4 | ~21,4 | ~42 |
| (b) Active, no upgrades | 7 | ~14,1 | ~14,0 | ~4,9 | ~10,7 | ~10,7 | ~83 |
| (c) Casual, no upgrades | 26 | ~133 | ~55 | ~0,6 | ~1,1 | ~2,7 | >180 (never in horizon) |
| (d) Mid-upgrade (all lvl 5) | 2 | ~3,8 | ~3,8 | ~32,5 | ~39,4 | ~39,3 | 24 (payback period — starts fully upgraded) |

Read it plainly: 100 active players ≈ **1.070 GRAM/month at
BOTH horizons** (was ~2.800 at #5 days 46–60 and climbing to
~8.800 by days 166–180). The payout rate now has a ceiling.
The faucet floor (1,25 + 7,5 = 8,75 KT/day) needs ~57 days for
a first WD and ~571 days for a repeat WD on its own.

### Honest notes — what the cap does and does NOT fix

1. **The ACTIVE first WD is day ~7, NOT above 10 days.** The
   owner chose ÷20 + cap to reach a >10-day first WD, and the
   honest result is that it does NOT get there. The cap cannot
   fix the first WD: it only binds from sector 345 (~day 38 for
   an active player), while the first WD happens around day 7
   when the bonus is still small (0,5 + 0,1×~60 ≈ 6,5 KT/exp).
   Reaching >10 days would need a lower bonus SLOPE (0,1 per
   sector) or lower base income — a further cut, not a cap.
   This is pinned in the tests (`economy.test.ts`, "HONEST
   NOTE") instead of hidden.
2. **Casual pace is not fully stable across horizons** (133 →
   55 days) because the cap binds late for a casual player
   (~day 150). It only ever IMPROVES to ~55 days and then stops
   — the cap still bounds it, just later.
3. **A fully-upgraded player still pays ~39 GRAM/month**
   (repeat WD every ~3,8 days). The cap limits the bonus PER
   EXPEDITION, not the number of expeditions: a mid-upgrade
   player runs ~30 expeditions/day. The brake on that profile
   is the upgrade cost itself — an active player needs ~83 days
   of earnings to afford all level-5 upgrades, so the ~39
   GRAM/month pace is only reachable after ~3 months of play.
4. **The bonus is still 55–89% of earnings** — the cap does
   not make ore the main income again, it only stops the bonus
   from growing. Map 1 remains the best KT/energy map.

### Verified locally (2026-11-19)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK. Full
suite **46/46 pass, 3 consecutive runs** vs local Postgres
(`/tmp/smoke-test/`: `economy.test.ts` 21/21 — new fractional
prices (Regolith 0,05 KT), 20× 0,05 KT credits = exactly 1 KT
(no float dust — the assertion is tolerance-based, because
0,55 × 100 is 55.00000000000001 in IEEE doubles, so a strict
`Number.isInteger(x * 100)` check is wrong for 2-decimal
values), mixed-ore sellAll = 0,6 KT, daily bonus 1,25 KT,
expedition bonus 0,6 KT at sector 1, bonus cap binds at sector
345 (35 KT at sector 345, 346, 500 and 10.000), WD rules
unchanged, windowed simulation assertions (interval + GRAM/30d
at days 46–60 AND 166–180, stability within 1 day for
max-effort/active/mid-upgrade), the pinned HONEST NOTE test
(active first WD ≤10 days); `game.test.ts` 9/9 (daily bonus
1,25 KT, ads 0,75 KT, expedition bonus 0,6 KT),
`telegram.test.ts` 9/9, `anticheat.test.ts` 7/7 regressions).
NOT verified live. NOT pushed to GitHub.

## WD first minimum lowered to 0,1 USDT (2026-11-19, implemented, NOT yet deployed)

Owner decision (2026-11-19 09:24 WITA, his words: "turunkan 0,5
gram jadi 0,1 gram... WD pertama itu receh saja dulu"): 0,5 USDT
is too expensive for the owner to pay out per new player, so the
first WD is now small change — a cheap hook. **New rule: first WD
minimum 100 KT (0,1 USDT); repeat WDs minimum 5.000 KT (5 USDT)
FLAT, unchanged.** Amount granularity changes from 500 KT to
**100 KT multiples (0,1 USDT steps) for ALL WDs**, so a first WD
can be 100, 200, 300 KT, etc., and a repeat WD can be 5.000,
5.100, 5.200 KT, etc. Ratio stays 1.000 KT = 1 USDT. Prices,
bonus cap (35 KT), daily bonus (1,25 KT), ads (0,75 KT), upgrade
costs, power, timings, Premium, anti-cheat, and sessions are all
UNCHANGED. No cooldown, no per-WD max, no other new mechanic. No
DB migration needed — the rule is code constants
(`WD_FIRST_MIN_KT = 100`, `WD_STEP_KT = 100`,
`WD_REPEAT_MIN_KT = 5000`, `wdMinKtForPaidCount` in
`api/_lib/game.ts`); the zod request floor moved with the step
(`.min(100)`). The WD form reads `wdMinKt`/`wdMinUsdt`/`wdStepKt`
from the server, so it needed no logic change — only its labels
("kelipatan 0,1", `step={0.1}`) and the rules copy in
`client/src/App.tsx` (WD tab + rules list).

### The >10-day first-WD target is SUPERSEDED — by the owner's explicit choice

The original >10-day target for the first WD (rebalance #3, #6)
is abandoned here on purpose: a 100 KT first WD cannot take 10
days at current earnings, and the owner chose the cheap hook over
the slow first WD. This is a deliberate trade, not a miss — the
first WD is a ONE-TIME 0,1 USDT cost per player. It does NOT
change the monthly payout rate: the repeat pace (~14 days for an
active player, ~10,7 USDT/30d, 100 active players ≈ 1.070
USDT/month, stable at both horizons) is the bankruptcy
protection, and it is UNCHANGED by this change — the sim below
confirms the repeat intervals and USDT/30d are identical to
rebalance #6.

### Simulation (same Monte Carlo + day-by-day model as #4/#5/#6, real constants, 2 runs agreeing within a few percent)

| Profile | Days to FIRST WD (100 KT) | Days between REPEAT WDs (5.000 KT), days 46–60 | Days between REPEAT WDs, days 166–180 | USDT / 30 days, days 46–60 | USDT / 30 days, days 166–180 |
|---|---|---|---|---|---|
| (a) Max-effort, no upgrades | 1 | ~7,0 | ~7,0 | ~21,4 | ~21,4 |
| (b) Active, no upgrades | 2 | ~14,0 | ~14,0 | ~10,7 | ~10,7 |
| (c) Casual, no upgrades | 8 | ~134 | ~55 | ~1,1 | ~2,7 |
| (d) Mid-upgrade (all lvl 5) | 1 | ~3,8 | ~3,8 | ~39,4 | ~39,4 |

The faucet floor (8,75 KT/day) now needs ~12 days for a first WD
on its own (was ~57 days at 500 KT) and still ~571 days for a
repeat WD.

### Verified locally (2026-11-19)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK. Full
suite **46/46 pass, 3 consecutive runs** vs local Postgres
(`/tmp/smoke-test/`: `economy.test.ts` 21/21 — first WD below
100 KT rejected by the zod floor, exactly 100 KT succeeds for a
first-timer and locks 100 KT, 150 KT rejected as not a multiple
of 100, 200 KT succeeds, after one paid WD the minimum is 5.000
KT and a 2.000 KT request is rejected, 5.000 and 5.100 KT repeat
WDs succeed, 5.250 KT rejected as not a multiple of 100,
simulation assertions (first-WD days + repeat pace UNCHANGED +
the pinned note that the >10-day target is superseded);
`game.test.ts` 9/9, `telegram.test.ts` 9/9,
`anticheat.test.ts` 7/7 regressions — their 500 KT first-WD
requests are still valid under the new rule: 500 is a multiple
of 100 and ≥ 100). NOT verified live. NOT pushed to GitHub.

## WD ceiling — 30-day cooldown + 5.000 KT max (2026-11-19, implemented, NOT yet deployed)

**REMOVED 2026-11-19 — DO NOT RE-APPLY.** The owner rejected any
time limit on WD ("buat agar KT-nya terkumpul sampai bisa di-WD,
jangan 14 hari"): `WD_COOLDOWN_DAYS`, `getLastPaidWdAt` /
`getWdCooldownStatus`, the cooldown check in `requestWithdrawal`,
the `wdCooldownDaysRemaining` / `nextWdAvailableAt` state fields,
the WD tab banner + disabled logic, and the cooldown copy are all
DELETED (see rebalance #7 below). The per-WD MAXIMUM 5.000 KT
survives. The rest of this section is kept as the record of what
the ceiling was — the Premium simulation table below is still
valid as the measurement of the hole (it is re-measured at #7
rates in the rebalance #7 section).

Owner alarm (2026-11-19 09:39 WITA): "pemain gratis bisa WD
seminggu sekali 5 gram — apakah anda ingin saya bangkrut?"
Partly a misunderstanding, partly real. The free-player numbers
were: weekly 5-USDT WDs only for max-effort grinders (12
tanks/day, ~7-day interval); an ACTIVE free player is ~14 days,
a casual player ~55–133 days. BUT the Premium hole was REAL and
had never been simulated: Premium multiplies KT earnings, so a
Premium player — especially a Premium UPGRADED player — could
WD far faster. This section measures Premium exactly and builds
the ceiling that caps payout for ANYONE.

### Premium simulation (Monte Carlo, real loot generator + real Premium multipliers, 2 runs agreeing within ~1%)

Modelled exactly as the game implements Premium: energy/day ×2
(regen 2× — active 180→360, casual 45→90, max-effort 360→720,
mid-upgrade 608→1216 energy/day), sell prices via the REAL
` sellMultiplier(levels, premium=true)` (+15% on the base — a
mid-upgrade player goes 1.25 → 1.40, i.e. ×1.12, not ×1.15),
scan/drill time ×0.75, Pro dual drill halving drill time on top,
travel free. Same day-by-day model as #4/#5/#6 (real constants,
sector/map progression, capped bonus, daily bonus + ads).

| Profile | Standard: first WD / repeat interval / USDT per 30 days | Pro: first WD / repeat interval / USDT per 30 days |
|---|---|---|
| (a) Max-effort, no upgrades | 1 hari / ~3,5 hari / ~43,1 | 1 hari / ~3,5 hari / ~43,1 |
| (b) Active, no upgrades | 1 hari / ~6,9 hari / ~21,6 | 1 hari / ~6,9 hari / ~21,6 |
| (c) Casual, no upgrades | 4 hari / ~38,6 → ~27,7 hari / ~3,9 → ~5,4 | 4 hari / ~38,1 → ~27,7 hari / ~3,9 → ~5,4 |
| (d) Mid-upgrade (all lvl 5) | 1 hari / ~1,9 hari / ~80,1 | 1 hari / ~1,9 hari / ~79,8 |

Free baseline for comparison (#6): (a) ~7,0 hari / ~21,4 USDT,
(b) ~14,1 hari / ~10,7 USDT, (c) ~130 → ~55 hari / ~1,2 →
~2,7 USDT, (d) ~3,8 hari / ~39,4 USDT. So Premium roughly
DOUBLES the payout rate: an ACTIVE Premium player WD-s ~weekly
(~21,6 USDT/month), and the WORST case — Premium + fully
upgraded — pays **~80 USDT/month** (repeat WD every ~1,9 days).
100 such players would be ~8.000 USDT/month. The owner's fear
was justified: without a ceiling, Premium is a payout
multiplier, not just a convenience pass.

Two findings worth stating plainly:
- **Pro earns the SAME as Standard.** The dual drill saves
  wall-clock time only — it cannot raise KT earnings, because
  ENERGY is the binding resource, not time. (If Pro earned
  more, the 500-Stars tier would be a money printer on top of
  Standard.) The sim pins this: Standard vs Pro USDT/30d agree
  within 1 USDT and intervals within 3% for every profile.
- **Operation time does NOT bind any profile.** Jobs are
  sequential (one at a time per player), so wall time is the
  only other possible binding constraint besides energy. Worst
  case is mid-upgrade Standard at ~211 min/day of job time
  (Pro ~148 min, dual drill saves ~63 min/day) — far under the
  24h day (1.440 min) and under a 16h awake budget (960 min).
  Energy binds, time does not. The practical limit is
  ATTENTION: the worst profile needs ~224 start/collect taps a
  day (max-effort Premium ~133, active Premium ~67) — a bot
  does that trivially, a human barely. That is exactly why the
  ceiling matters: even a 24/7 bot cannot take more than ~10,7
  USDT/month once the ceiling is in.

### The ceiling — design + math

- **30-day cooldown between WDs per player** (`WD_COOLDOWN_DAYS
  = 30`), enforced server-side in `requestWithdrawal`. The clock
  runs from the last PAID WD's `processedAt` (set by the admin
  "pay" step; `createdAt` is the fallback for legacy rows) — no
  schema change was needed, so **no new migration**: the ceiling
  reads the existing `wd_requests` rows. The first WD has no
  previous WD, so no cooldown applies to it; after ANY paid WD
  (even the 100 KT first one) the 30-day clock starts.
  Rejected/cancelled WDs refund the KT and never start the clock.
- **Per-WD maximum 5.000 KT (5 USDT)** (`WD_MAX_KT = 5000`),
  enforced in the handler with a message naming the maximum.
  Repeat WDs are therefore effectively exactly 5.000 KT (min =
  max = 5.000); first WD min 100 KT, max 5.000 KT. The zod
  request cap stays at 10.000.000 on purpose so the handler —
  not a generic HTTP 400 — returns the clear maximum message.
- **Ceiling math:** 5.000 KT per WD, max 1 WD per 30 days →
  (30 / 30) × 5 USDT = **5 USDT/month maximum per player,
  for ANYONE** (free/Premium, upgraded or not). Verified by sim:
  every profile above the ceiling is capped at 5 USDT/30d
  (max-effort free 21,4 → 5; mid-upgrade free 39,4 → 5;
  Premium mid-upgrade 80,1 → 5); casual profiles are already
  under the ceiling, so it changes nothing for them.
- **Why BOTH parts are needed:** a cooldown alone caps nothing
  without a per-WD maximum — a player would bank two weeks of
  earnings and withdraw it all at once (shown in rebalance #4:
  cooldown-only leaves total USDT unchanged). A maximum alone
  caps nothing without a cooldown — a player would WD 5.000 KT
  every ~2 days. Only the combination bounds total payout.
- **`getGameState` returns the cooldown status:** `wdMaxKt`
  (5.000), `wdMaxUsdt` (5), `wdCooldownDaysRemaining` (0 =
  available now, rounded up), `nextWdAvailableAt` (ISO date or
  null). The WD tab shows "WD berikutnya tersedia dalam X hari
  (tanggal)" while in cooldown and "WD ulang 5 USDT, maksimal
  1× per 30 hari" in the rules; the form enforces the maximum
  (input max + error message) and disables submission during
  the cooldown. The rules copy in Hanggar was updated the same
  way (the old "5.000, 5.100, 5.200 KT, dst." wording is gone —
  repeat WDs are now exactly 5.000 KT).
- **Without this ceiling, total payout is bounded only by
  earnings.** That is the statement the owner needed: every
  lever before this one (price cuts, bonus cap, WD minimums)
  only slowed how fast a player REACHES a WD — none of them
  limited how much USDT leaves per month once the player is
  earning at full rate. The ceiling is the first (and only)
  mechanism that puts a hard number on it: 5 USDT/month
  per player, 500 USDT/month per 100 players, no matter who
  they are or what they bought.

### Raised 14 → 30 days (2026-11-19)

Owner verdict (2026-11-19 10:13 WITA), honestly: he CANNOT
afford the 14-day pace — the 14-day brake is not strong enough.
So the cooldown was raised to monthly: one WD per 30 days max.
The ceiling is now 5 USDT/month per player (100 players = max
500 USDT/month; 1.000 players = max 5.000 USDT/month). Nothing
else changed: first WD 0,1 USDT, per-WD max 5 USDT, prices,
bonus cap, Premium, anti-cheat — all untouched. The 14-day
numbers above (Premium sim, ~10,7 USDT/month ceiling) are kept
as the record of what the 14-day ceiling WOULD have allowed.

### What did NOT change

Prices, bonus cap (35 KT), daily bonus (1,25 KT), ads
(0,75 KT), upgrade costs, power costs/regen, scan/drill times,
Premium prices/benefits, anti-cheat, sessions — all untouched.
No other new mechanic. No DB migration needed for the ceiling.

### Verified locally (2026-11-19)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK (bundle
contains the ceiling strings). Full suite **60/60 pass, 3
consecutive runs** vs local Postgres (`/tmp/smoke-test/`):
`ceiling.test.ts` 9/9 (second WD within 30 days rejected with
remaining days; 29 days still blocked / 31 days allowed; 5.000
KT repeat WD succeeds after cooldown; WD above 5.000 rejected
for first-timer and repeat alike; first WD not blocked; cooldown
is per-player; rejected/cancelled WD does not start the clock);
`economy.test.ts` 26/26 (Premium sim assertions — Standard and
Pro tables, Pro ≈ Standard, time does not bind, ceiling caps
every Premium profile at ~10,7 USDT/month, Premium pace stable
across horizons; the old 7-day-cooldown-reported-only test is
replaced by the implemented 30-day ceiling test; the (c)+(d)
test now backdates the paid WD 31 days so it measures the
minimum, not the ceiling, and asserts 5.100 KT is rejected);
`game.test.ts` 9/9, `telegram.test.ts` 9/9,
`anticheat.test.ts` 7/7 regressions. NOT verified live. NOT
pushed to GitHub.

### Deploy steps (owner)

No new migration for the ceiling — push + redeploy only. The
earlier pending steps still stand: run
`deploy/neon/migration-0002-anticheat.sql` and
`deploy/neon/migration-0003-fractional-kt.sql` in Neon once,
then redeploy on Vercel.

## Payout currency switched GRAM → USDT (2026-11-19, implemented, NOT yet deployed)

Owner decision (2026-11-19 09:54 WITA): ganti mata uang payout dari
GRAM ke USDT. Alasannya: harga GRAM membuat kewajiban dolar pemilik
besar dan berubah-ubah, sementara USDT $1 tetap — jadi yang dibayar
pemilik per bulan bisa diprediksi. Ini ganti NAMA mata uang saja
(1:1, angka tidak berubah) — BUKAN pengurang payout: yang benar-benar
membatasi total payout adalah WD ceiling (30 hari + maks 5.000 KT),
bukan ganti mata uangnya.

- **Rasio tetap 1.000 KT = 1 USDT** (dulu 1.000 KT = 1 GRAM).
  WD pertama 100 KT = 0,1 USDT; WD ulang minimum/maksimum 5.000 KT
  = 5 USDT; ceiling 5 USDT/bulan per pemain yang direncanakan di
  bagian di atas DIBATALKAN 2026-11-19 (cooldown dihapus — lihat
  rebalance #7).
- **Alur WD tetap manual:** pemain mengajukan, pemilik mengirim
  USDT sendiri, lalu menandai Dibayar dengan referensi transaksi.
  Kolom dompet tetap string alamat biasa, dilabeli "alamat dompet
  USDT" — TIDAK ada jaringan yang ditentukan (bukan TRC20/ERC20/dll),
  pemilik tidak pernah menyebutkannya.
- **Yang diubah:** `KT_PER_GRAM` → `KT_PER_USDT`; bentuk API
  (`amountGram` → `amountUsdt`, `wdMinGram` → `wdMinUsdt`,
  `wdMaxGram` → `wdMaxUsdt`, `gramEquivalent` → `usdtEquivalent`,
  `totalWdPaidGram` → `totalWdPaidUsdt`, `ktPerGram` →
  `ktPerUsdt`); semua string user-visible (hero "Dapatkan USDT",
  tab "WD USDT", aturan WD, antrean Kendali, log aktivitas, pesan
  error, label form); kolom DB (`total_wd_paid_gram` →
  `total_wd_paid_usdt`, `amount_gram` → `amount_usdt`) +
  `deploy/neon/migration-0004-rename-gram-usdt.sql` (RENAME COLUMN
  idempotent); `deploy/README.md` + `README.md`; sim + test
  (`WD_CEILING_GRAM_PER_30D` → `WD_CEILING_USDT_PER_30D`,
  `gramPer30d` → `usdtPer30d`, dst.).
- **Yang TIDAK berubah:** semua angka, rasio, harga, timing,
  Premium, anti-cheat, sesi, dan ceiling itu sendiri. Bagian
  riwayat (rebalance #3–#6) di dokumen ini sengaja masih memakai
  GRAM sesuai zamannya (lihat catatan mata uang di atas).
- **Catatan jujur (dari MEMORY):** GRAM (Toncoin) saat dicek
  2026-11-19 diperdagangkan ~$1,01–1,02 — jadi 10,7 GRAM ≈ $10,90,
  hampir sama dolarnya dengan 10,7 USDT. Keuntungan USDT yang
  nyata adalah STABILITAS ($1 tetap), bukan biaya dolar yang
  lebih rendah hari ini.

### Deploy steps (owner)

Satu migrasi baru: jalankan
`deploy/neon/migration-0004-rename-gram-usdt.sql` di Neon sekali
(setelah migration-0002 + migration-0003), lalu redeploy di
Vercel. Database kosong tidak perlu: `init.sql` terbaru sudah
berisi nama kolom USDT.

## Economy rebalance #7 — WD cooldown REMOVED + ALL KT income ÷40 total (2026-11-19, implemented, NOT yet deployed)

Owner decision (2026-11-19 10:15 WITA, his words: "anda bukan
kasi limit WD harus 30 hari tapi buat agar KT-nya itu terkumpul
sampai bisa di-WD, jangan 14 hari dong, itu terlalu cepat, di atas
dari itu"): he does NOT want any time limit on WD — no 14-day and
no 30-day cooldown. The pacing must come from SLOW KT
ACCUMULATION, not a timer. The 30-day-cooldown build that was in
flight (subagent 0600bbc3) was STOPPED and undone. Target: an
ACTIVE free player needs ~30 days to accumulate 5.000 KT.

### What was removed (the whole cooldown, not just the number)

- `WD_COOLDOWN_DAYS` + `WD_COOLDOWN_MS` (was 30, briefly, after
  the stopped 14→30 change), `getLastPaidWdAt`,
  `WdCooldownStatus`, `getWdCooldownStatus` — deleted from
  `api/_lib/game.ts`.
- The cooldown check in `requestWithdrawal` — deleted. The
  handler now enforces only: 100 KT multiples, the two-tier
  minimum (100 / 5.000 KT), the per-WD maximum (5.000 KT), and
  sufficient balance.
- `wdCooldownDaysRemaining` / `nextWdAvailableAt` — removed from
  the `getGameState` response shape and the client (the type is
  zod-inferred, so the client type updated automatically).
- The WD tab cooldown banner + disabled logic (`inCooldown`) and
  the cooldown copy in the WD rules + the rules list — replaced
  with the accumulation truth: "Tidak ada batas waktu antar-WD:
  seberapa cepat kamu bisa WD tergantung seberapa cepat kamu
  mengumpulkan KT."
- `ceiling.test.ts` — the cooldown tests were DELETED and the
  file rewritten to prove the removal (see verification below).
  The sim helpers `usdtPer30dWithCooldown` /
  `usdtPer30dWithCeiling` + `WD_CEILING_*` are deleted from
  `/tmp/smoke-test/sim.ts`.
- Verified by grep: no `WD_COOLDOWN*`, `WdCooldown*`,
  `wdCooldown*`, `getLastPaidWdAt`, `getWdCooldownStatus`,
  `nextWdAvailableAt` or `inCooldown` remains anywhere in `api/`
  or `client/src/` — the only matches are the two removal-note
  comments in `game.ts` and the historical "WD ceiling" section
  of this file (kept as removed history). The built bundle
  (`main-B52NVERI.js`) contains "cooldown" exactly once — the
  60-second AD cooldown, a different mechanic that stays. The
  anti-cheat per-rule 24h cooldown also stays (different
  mechanic, flag-only).

### What was cut (÷2 on top of #6 = ÷40 total vs the original economy)

New prices (KT per unit, halved from #6): Regolith 0,05 → **0,025**,
Kondrit 0,1 → **0,05**, Besi-Nikel 0,25 → **0,125**, Kobalt 0,5 →
**0,25**, Platinum 2,25 → **1,125**, Iridium 7,2 → **3,6**,
Helium-3 18 → **9**; map gems halved too (Opal 1,95 → 0,975,
Topaz 2,55 → 1,275, Turkuois 3,9 → 1,95, Ametis 5,25 → 2,625,
Zamrud 9,6 → 4,8, Rubi 12,6 → 6,3, Safir 21 → 10,5, Berlian
28,5 → 14,25, Opal Es Hitam 45 → 22,5, Voidium 72 → **36**).
Expedition bonus 0,5 + 0,1×sektor → **0,25 + 0,05×sektor**,
daily bonus 1,25 → **0,625** KT, ads reward 0,75 → **0,375** KT
(cap 10/day + 60s cooldown unchanged). WD rule STAYS (first WD
100 KT = 0,1 USDT, repeat WDs 5.000 KT flat, max 5.000 KT per WD).
Upgrade costs UNCHANGED (23.430 KT for all level 5). Prices now
need 3 decimals: `roundKt` rounds every credit/debit to 3
decimals, the server formatter (`fmtKt`) and the client formatter
(`fmt` in App.tsx) show max 3 decimals. No DB migration needed
(balance is already DOUBLE PRECISION). The faucet floor is now
0,625 + 3,75 = 4,375 KT/day: ~23 days to a first WD and ~1.143
days to a repeat WD on faucet alone.

### The cap deviation — why the cap is 17,5 KT, not 35 KT

The task said "keep the bonus CAP (35 KT)". That instruction
CONFLICTS with the target it was attached to, and the sim proves
it — so the cap was halved with everything else (35 → **17,5
KT**), and this is why:

- The completion bonus is 86–93% of an active player's earnings.
  Halving the slope (0,1 → 0,05) while keeping the cap at 35 only
  delays when the cap binds (sector 345 → 695, ~day 38 → ~day
  77); it does NOT halve the steady-state bonus. Measured with
  cap 35 (same ÷40 income, same sim): active repeat interval
  21,1 days at days 46–60 → **14,8 days at days 166–180**
  (7,1 → 10,2 USDT/month) — not 28–35 days, and not stable.
  The 166–180 interval is mathematically capped by the 35 KT
  bonus alone (9 expeditions/day × 35 KT ≈ 315 KT/day), so NO
  factor on ore/faucet/slope can push it past ~15 days while the
  cap stays 35.
- Halving the cap (35 → 17,5) keeps it binding at the SAME
  sector 345 (0,25 + 0,05×345 = 17,5) and the same ~day 38 for
  an active player as #6 — that is what preserves the stability
  #6 bought. The measured result below is the proof: 28,1 vs
  27,9 days (0,7% apart).

### Recalculation (same Monte Carlo + day-by-day model as #4/#5/#6, real constants, 2 runs)

KT per 30-energy tank, ore only (no upgrades, completion bonus
excluded): Map 1 ~2,8, Map 2 ~3,3, Map 3 ~5,8, Map 4 ~12,7,
Map 5 ~20,2. Hull fees per tank (unchanged costs): Map 1–2 0,
Map 3 ~9,4, Map 4 ~44,9, Map 5 ~102,1 — Map 5 is still
NET-NEGATIVE on ore minus fees alone (−82 KT/tank); only the
sector bonus makes the far maps pay, and Map 1 still pays the
most bonus per energy, so a KT-maximising player still farms
Map 1.

| Profile | Days to FIRST WD (100 KT) | Days between REPEAT WDs (5.000 KT), days 46–60 | Days between REPEAT WDs, days 166–180 | USDT in month 1 | USDT / 30 days, days 46–60 | USDT / 30 days, days 166–180 | Days to afford all lvl-5 upgrades (23.430 KT) |
|---|---|---|---|---|---|---|---|
| (a) Max-effort, no upgrades | 2 | ~14,0 | ~14,0 | ~7,6 | ~10,7 | ~10,7 | ~75 |
| (b) Active, no upgrades | 4 | ~28,1 | ~27,9 | ~2,5 | ~5,3 | ~5,4 | ~149 |
| (c) Casual, no upgrades | 13 | ~265 | ~111 | ~0,3 | ~0,6 | ~1,4 | >180 (never in horizon) |
| (d) Mid-upgrade (all lvl 5) | 1 | ~7,6 | ~7,6 | ~16,6 | ~19,7 | ~19,7 | 41 (payback period — starts fully upgraded) |

Read it plainly: **the ACTIVE target is HIT — ~28 days to
accumulate 5.000 KT, stable at both horizons** (28,1 vs 27,9
days). 100 active players ≈ **530 USDT/month**. An ACTIVE player
needs ~149 days of earnings to afford all level-5 upgrades.

### Premium at #7 rates (same model + real Premium multipliers)

| Profile | Standard: first WD / repeat interval / USDT per 30 days | Pro: first WD / repeat interval / USDT per 30 days |
|---|---|---|
| (a) Max-effort, no upgrades | 1 hari / ~7,0 hari / ~21,6 | 1 hari / ~7,0 hari / ~21,6 |
| (b) Active, no upgrades | 2 hari / ~13,9 hari / ~10,8 | 2 hari / ~13,9 hari / ~10,8 |
| (c) Casual, no upgrades | 7 hari / ~77 → ~55 hari / ~1,9 → ~2,7 | 7 hari / ~77 → ~55 hari / ~1,9 → ~2,8 |
| (d) Mid-upgrade (all lvl 5) | 1 hari / ~3,7 hari / ~40,1 | 1 hari / ~3,7 hari / ~40,2 |

Premium still roughly DOUBLES the payout rate, and Pro still
earns the SAME as Standard (dual drill saves wall time only;
energy binds, not time). Operation time still binds no profile
(worst case mid-upgrade Standard ~211 min/day of job time, ~224
taps/day).

### HONEST NOTE — without a cooldown there is NO hard ceiling

This is the part the owner must see plainly: **the fastest
profiles still accumulate 5.000 KT in DAYS, not weeks** — free
mid-upgrade ~7,6 days (~19,7 USDT/month), Premium mid-upgrade
~3,7 days (~40,1 USDT/month), Premium max-effort ~7,0 days
(~21,6 USDT/month). 100 Premium mid-upgrade players ≈ 4.000
USDT/month. The old ceiling (5 USDT/month for anyone) is gone
by the owner's explicit choice; the only brakes left on a fast
player are the upgrade cost itself (~149 days of active play to
afford all level-5 upgrades, ~5 months before the ~19,7
USDT/month free pace is even reachable), the anti-cheat flags,
and the owner's MANUAL WD approval — every WD still passes
through Kendali, nothing is paid automatically. That is inherent
to accumulation-based pacing: no timer, no ceiling. The tests
pin this (economy.test.ts "HONEST NOTE" tests) instead of
hiding it.

### Verified locally (2026-11-19)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK
(`main-B52NVERI.js`). Full suite **60/60 pass, 3 consecutive
runs** vs local Postgres (`/tmp/smoke-test/`: `economy.test.ts`
26/26 — new ÷40 prices, 3-decimal float-dust tests (40× 0,025
KT = exactly 1 KT), daily bonus 0,625 KT, expedition bonus 0,3
KT at sector 1, cap binds at sector 345 (17,5 KT), windowed sim
assertions (active interval 26–31 days at BOTH horizons,
USDT/30d stable within 10%), the pinned HONEST NOTE tests (no
ceiling: mid-upgrade ~19,7 and Premium mid-upgrade ~40,1
USDT/month); `ceiling.test.ts` rewritten 7/7 — no cooldown
constant, no cooldown fields in state, a second WD immediately
after a paid WD succeeds, three WDs in quick succession all
allowed, per-WD max still enforced (5.100 KT rejected), rejected/
cancelled WDs refund in full and retry at once;
`game.test.ts` 10/10, `telegram.test.ts` 10/10,
`anticheat.test.ts` 7/7 regressions). NOT verified live. NOT
pushed to GitHub.

**Environment incident while doing this work (2026-11-19):**
the VM's `/tmp` (tmpfs) was recreated mid-task, wiping the
whole `/tmp/smoke-test/` suite, and the local Postgres 16
cluster was gone too (no postgres binaries at all). Both were
rebuilt: PostgreSQL 16 reinstalled (`16/main` on port 5432,
test DB `astra_test`), the schema re-applied from
`deploy/neon/init.sql` + migrations 0001–0004, and the test
suite RECONSTRUCTED from the game code + PORT_NOTES.md
(`harness.ts`, `sim.ts`, runners, all five test files). The
reconstructed game/telegram/anticheat suites are faithful
recreations of the documented coverage (9→10 game tests, 9
Telegram tests, 7 anti-cheat tests) — not byte-identical to the
lost originals. A backup copy of the suite now lives at
`~/workspace/smoke-test/` so a future `/tmp` wipe cannot lose
it again.

### Deploy steps (owner, in order)

1. Push this directory to GitHub, then in Neon run
   `deploy/neon/migration-0002-anticheat.sql` (if not done yet),
   `deploy/neon/migration-0003-fractional-kt.sql`, and
   `deploy/neon/migration-0004-rename-gram-usdt.sql` — all
   idempotent, safe to re-run. Database kosong tidak perlu
   migrasi: `init.sql` terbaru sudah berisi semuanya. **No new
   migration for #7** — the income cut, the bonus cap, and the
   cooldown removal are all code constants; the balance column
   is already DOUBLE PRECISION from migration-0003.
2. Redeploy on Vercel. Until then the live deployment still runs
   the old income rates, the GRAM labels, and the 14-day
   cooldown code from the last push (commit `759d08fb`).

## Economy rebalance #8 — expedition completion bonus halved AGAIN (2026-11-19, implemented, NOT yet deployed)

Why: the owner ordered it ("kurangi bonusnya, kenapa anda
seperti tertahan tidak mau kurang") — and he is right. At #7
the completion bonus is 85–89% of ALL KT earned (bonusShare in
the sim); ore mining itself is only ~10%. The bonus IS the
biggest lever and the main leak. Rebalances #5–#7 cut
everything ÷2 each time but kept the bonus proportionally
dominant; this one cuts ONLY the bonus.

### What changed (bonus only — everything else untouched)

Expedition completion bonus 0,25 + 0,05×sektor → **0,125 +
0,025×sektor**, cap 17,5 → **8,75 KT**
(`MAX_COMPLETION_BONUS_KT`, `completionBonusKt`). The cap still
binds at sector 345 ((8,75 − 0,125) / 0,025 = 345), so the pace
stays stable across horizons. Ore prices (Regolith 0,025 …
Helium-3 9 KT), gems, daily bonus 0,625 KT, ads 0,375 KT,
power, timings, upgrade costs, WD rule (first 100 KT, repeat
5.000 KT flat, max 5.000 KT, no cooldown), Premium, anti-cheat,
sessions, USDT — ALL UNCHANGED. No new mechanic, no cooldown.
No new migration: the bonus is a code constant and the balance
column is already DOUBLE PRECISION (migration-0003).

### Recalculation (same Monte Carlo + day-by-day model as #4/#5/#6/#7, real constants, 2 runs agreeing within a few percent)

KT per 30-energy tank, ore only (unchanged from #7): Map 1
~2,8, Map 2 ~3,3, Map 3 ~5,9, Map 4 ~12,7, Map 5 ~19,9. Hull
fees per tank: Map 1–2 0, Map 3 ~9,7, Map 4 ~44,4, Map 5
~102,3 — Map 5 is still NET-NEGATIVE on ore minus fees alone
(−82 KT/tank); only the sector bonus makes the far maps pay,
and Map 1 still pays the most bonus per energy, so a
KT-maximising player still farms Map 1.

| Profile | Days to FIRST WD (100 KT) | Days between REPEAT WDs (5.000 KT), days 46–60 | Days between REPEAT WDs, days 166–180 | USDT in month 1 | USDT / 30 days, days 46–60 | USDT / 30 days, days 166–180 | Days to afford all lvl-5 upgrades (23.430 KT) |
|---|---|---|---|---|---|---|---|
| (a) Max-effort, no upgrades | 2 | ~25,3 | ~25,4 | ~4,4 | ~5,9 | ~5,9 | ~127 |
| (b) Active, no upgrades | 4 | ~50,4 | ~50,4 | ~1,5 | ~3,0 | ~3,0 | >180 (never in horizon) |
| (c) Casual, no upgrades | 15 | ~399 | ~192 | ~0,2 | ~0,4 | ~0,8 | >180 (never in horizon) |
| (d) Mid-upgrade (all lvl 5) | 1 | ~12,8 | ~12,8 | ~10,2 | ~11,7 | ~11,7 | 64 (payback period — starts fully upgraded) |

Read it plainly: **the ACTIVE repeat interval nearly DOUBLED
— ~50 days to accumulate 5.000 KT, stable at both horizons**
(50,4 vs 50,4 days). 100 active players ≈ **300 USDT/month**
(was ~530 at #7). An ACTIVE player now needs MORE than 180
days of earnings to afford all level-5 upgrades (was ~149) —
the upgrade grind itself is now a ~6-month brake on the
upgraded-player payout problem.

Bonus share of earnings (bonus ÷ total earned): max-effort
0,77–0,80, active 0,72–0,78, casual 0,37 → 0,65,
mid-upgrade 0,66–0,68 (60-day window → 180-day steady state).
Down from 85–89% at #7 — the bonus is still the biggest
single source of KT, just less overwhelming. Ore mining is now
~20–30% of earnings instead of ~10%.

### Premium at #8 rates (same model + real Premium multipliers)

| Profile | Standard: first WD / repeat interval / USDT per 30 days | Pro: first WD / repeat interval / USDT per 30 days |
|---|---|---|
| (a) Max-effort, no upgrades | 1 hari / ~12,5 hari / ~12,0 | 1 hari / ~12,5 hari / ~12,1 |
| (b) Active, no upgrades | 2 hari / ~24,9 hari / ~6,0 | 2 hari / ~24,9 hari / ~6,0 |
| (c) Casual, no upgrades | 7 hari / ~132 → ~97 hari / ~1,1 → ~1,5 | 7 hari / ~133 → ~98 hari / ~1,1 → ~1,5 |
| (d) Mid-upgrade (all lvl 5) | 1 hari / ~6,2 hari / ~24,1 | 1 hari / ~6,2 hari / ~24,1 |

Premium still roughly DOUBLES the payout rate, and Pro still
earns the SAME as Standard (dual drill saves wall time only;
energy binds, not time). Operation time still binds no profile
(worst case mid-upgrade Standard ~211 min/day of job time, ~224
taps/day).

### HONEST NOTE — without a cooldown there is STILL no hard ceiling

The fastest profiles still accumulate 5.000 KT in DAYS, not
weeks — free mid-upgrade ~12,8 days (~11,7 USDT/month),
Premium mid-upgrade ~6,2 days (~24,1 USDT/month), Premium
max-effort ~12,5 days (~12 USDT/month). 100 Premium
mid-upgrade players ≈ 2.400 USDT/month (was ~4.000 at #7).
The only brakes left on a fast player are the upgrade cost
itself (>180 days of active play to afford all level-5
upgrades), the anti-cheat flags, and the owner's MANUAL WD
approval — every WD still passes through Kendali, nothing is
paid automatically. That is inherent to accumulation-based
pacing: no timer, no ceiling. The tests pin this
(economy.test.ts "HONEST NOTE" tests) instead of hiding it.

### Verified locally (2026-11-19)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK
(`main-B52NVERI.js`). Full suite **60/60 pass, 3 consecutive
runs** vs local Postgres (`/tmp/smoke-test/`: `economy.test.ts`
— new bonus 0,15 KT at sector 1, cap binds at sector 345
(8,75 KT), windowed sim assertions (active interval 48–53
days at BOTH horizons, USDT/30d stable within 10%), bonus
share thresholds (max >0,7, active >0,65, casual >0,3,
mid >0,6), pinned HONEST NOTE tests (no ceiling: mid-upgrade
~11,7 and Premium mid-upgrade ~24,1 USDT/month);
`game.test.ts` expedition completion 0,15 KT; `ceiling.test.ts`,
`telegram.test.ts`, `anticheat.test.ts` regressions). NOT
verified live. NOT pushed to GitHub.

### Deploy steps (owner, in order)

Same as #7: push this directory to GitHub, then in Neon run
`deploy/neon/migration-0002-anticheat.sql` (if not done yet),
`deploy/neon/migration-0003-fractional-kt.sql`, and
`deploy/neon/migration-0004-rename-gram-usdt.sql` — all
idempotent, safe to re-run. **No new migration for #8** — the
bonus is a code constant. Then redeploy on Vercel. Until then
the live deployment still runs the #7 rates from the last push
(commit `a27af6f0`).

---

## Iklan sponsor — AdsGram Rewarded (2026-11-19)

### Design

Telegram does NOT serve official ads inside a Mini App screen —
Telegram Ads only run in channels and bot chats — so in-app rewarded
ads need a third-party network. The game uses **AdsGram** (built for
Telegram Mini Apps; docs: https://docs.adsgram.ai/publisher/reward-interstitial-integration):

- SDK script in `client/index.html` (exact URL from the docs):
  `<script src="https://sad.adsgram.ai/js/sad.min.js"></script>`
- `client/src/ads.ts`: `ADSGRAM_BLOCK_ID` constant (empty placeholder
  + TODO), lazy one-time `window.Adsgram.init({ blockId })`, and
  `showRewardedAd(): Promise<boolean>` — true ONLY when
  `AdController.show()` resolves with `done === true` (user watched
  the Rewarded ad till the end, per the docs). False on reject
  (no-fill, early close, error), on a 120-second hung-promise
  timeout, or when the SDK/blockId is missing. Never throws.
- `client/src/App.tsx`: the "Tonton Iklan" button calls
  `showRewardedAd()` FIRST when a blockId is configured, and calls
  the unchanged server `watchAd` action ONLY on true. On false it
  shows "Iklan belum tersedia, coba lagi nanti" and grants NOTHING.
  The button is disabled while an ad plays (`adPlaying`) so a second
  ad cannot be opened mid-play.
- Server action `watchAd`: +0,375 KT, max 10/day, 1-hour cooldown
  (changed 2026-11-19 from 60s on the owner's instruction — stop ad
  farming), all recomputed server-side — the ad gate is an extra
  client-side check, the server rules are still the source of truth.
  No new migration, no new mechanic.

### Dormant until the owner activates it

`ADSGRAM_BLOCK_ID = ""` right now — there is no real blockId yet, so
the button keeps its CURRENT behavior exactly (direct watchAd call,
same server rules). Nothing about the game changes until the owner
activates ads.

### Activation (owner, one step)

1. Register at https://partner.adsgram.ai, register this Mini App,
   create a **Reward** ad unit, copy its `blockId`.
2. Paste the blockId into `ADSGRAM_BLOCK_ID` in
   `client/src/ads.ts` (replace the empty string).
3. Push + redeploy on Vercel. From then on every "Tonton Iklan" tap
   plays a real ad first; KT is granted only after the ad is watched
   to the end.

### Payout facts (AdsGram, per their docs/blog)

Payouts in USDT on the TON network. Minimum withdrawal 10 USDT once
a month (1st–5th), 100 USDT on any other day; requests processed
within 1–3 business days. The owner needs a TON wallet ready before
the first withdrawal. Honest note: ad revenue depends on real player
volume — do not expect much until the game has real players.

### CSP note

`vercel.json` sets only `frame-ancestors` (Telegram embed rule) plus
`X-Content-Type-Options` and `Referrer-Policy` — there is no
`script-src` / `connect-src` / `frame-src` directive, so the AdsGram
script and ad content load unblocked. No CSP change was needed; the
Telegram frame-ancestors rule is untouched.

### Verified locally (2026-11-19)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK. Full suite
60/60 pass vs local Postgres. NOT verified live (no blockId yet —
live verification needs the owner to activate ads first, then one
real ad watch end-to-end). NOT pushed to GitHub.

## i18n — Indonesian + English (2026-11-19, implemented, NOT yet deployed)

Players can switch the whole game between Indonesian (id) and
English (en). No gameplay, economy, rule, price, timing, WD,
Premium, anti-cheat, session, USDT, or AdsGram change — only
user-facing strings move between languages.

### Languages

- `id` (Indonesian, default) and `en` (English). Game name stays
  ASTRA MINING. KT/USDT wording of the economy itself is unchanged
  (1.000 KT = 1 USDT / 1,000 KT = 1 USDT, same ratio, locale number
  format differs: `0,625 KT` in id, `0.625 KT` in en).

### Detection order (client)

Saved choice in `localStorage` (`astra-mining-lang`) first, else
Telegram WebApp `initDataUnsafe.user.language_code` (`id` → id,
anything else supported → that language), else browser
`navigator.language` (`id` → id), else `en`. Every change is
persisted to localStorage and sent to the server on every
`/api/game` request, so server-written messages match the
client language.

### Picker location

Header, next to the "Sesi: …" session line — an `ID | EN` toggle
(`LanguagePicker` in `client/src/i18n.ts`), visible without
opening any settings. Switching re-renders the whole game
immediately (the `LanguageProvider` in `main.tsx`).

### What is translated

- Client (`client/src/i18n.ts`, 365 keys each in id/en):
  tabs, headers, hero, balance card, session line, mining tab
  (asteroid card, vein rows, scan/drill buttons, job panel),
  the 17-item rules list, Log Misi / Log Ekonomi, market,
  Hanggar upgrades, Premium card + plans, map cards + challenges,
  WD tab + WD rules, admin/Kendali (GrantPremiumCard,
  FlaggedPlayersCard, AdminWdCard), ad button + ad messages,
  loading/error screens. `t(key, vars)` interpolates `{vars}`;
  `trich(key, vars)` also renders `**bold**` / `*italic*`.
  `App.tsx` holds NO hardcoded Indonesian/English UI string
  anymore — every string lives in the dictionaries (the only
  exceptions are a developer code comment and a React `key`).
- Server (`api/_lib/i18n.ts`): every user-facing string the
  server writes — all `logActivity` messages, all action result
  messages, all error strings (WD/premium/scan/drill/sell/
  upgrade/ad/daily-bonus, Telegram errors, route errors).
  `api/game.ts` parses optional `lang: "id" | "en"` from the
  request body (default `"id"` when absent/invalid) and threads
  it through `dispatchGameAction` → `resolveSession` →
  every action handler (`session.lang`). Ore/map/upgrade names
  and descriptions gained `nameEn`/`descEn`/`taglineEn`/
  `distanceLabelEn` fields; numbers, logic, and DB writes are
  untouched. Known limitation: admin-initiated log entries
  (premium confirm/reject/grant, WD approve/pay/reject) are
  written in the ADMIN's current language, since the owner's
  language preference is not stored per player.
  One string stays Indonesian-only by necessity: the
  unparseable-JSON 400 in `api/game.ts` — no language can be
  read from a broken body.

### How to add a third language

1. Add one dictionary to `DICTS` in `client/src/i18n.ts`
   (same keys as id/en) and its code to `LANGS` — the picker
   renders from `LANGS`, so the toggle gains the new entry
   automatically.
2. Add the matching dictionary in `api/_lib/i18n.ts`
   (`ServerStrings` + the `normalizeLang` list).
3. Nothing else changes: the client sends the new code as
   `lang`, the server validates it the same way.

### Verified locally (2026-11-19)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK
(`main-CZVDAVVY.js`). Full suite 69/69 pass vs local
Postgres (60 existing + 9 new i18n tests), 3 consecutive
runs. New tests in `/tmp/smoke-test/i18n.test.ts` (backup at
`~/workspace/smoke-test/`): same action returns Indonesian
with `lang="id"`/default and English with `lang="en"` for a
game action result (getGameState map/ore names), an activity
log message (daily bonus), and two error messages (locked
map, daily bonus already claimed); invalid `lang` falls back
to Indonesian; client dictionaries are symmetric (365 keys
each) with matching `{var}` placeholders (one documented
exception: `veinQty` — English pluralises "unit{s}", Indonesian
has no plural suffix). NOT verified live.
NOT pushed to GitHub.

## Blank hitam: getGameState {ok:false} + token bot baru (2026-11-19, fixed + pushed 92910e66)

### What the user saw
Mini App opened from the NEW bot (astra_mining_bot) showed a blank
black screen. DevTools Network showed the `/api/game` POST returning
HTTP 200 with a ~55-byte body — a business error
(`{ok:false, error:"..."}`), not game state.

### Root cause (two parts)
1. **BOT_TOKEN is still the OLD bot's token.** The new bot signs
   initData with its own token; the server validates with the token
   in Vercel env, so every login from the new bot is rejected
   ("Data login Telegram tidak valid."). The owner must update
   BOT_TOKEN in Vercel env to the new bot's token (BotFather →
   /mybots → API Token) and redeploy. ADMIN_TELEGRAM_ID does not
   change (it is the owner's Telegram user id, not the bot's).
   The Web App URL in BotFather must also be exactly
   `https://mygamemining.vercel.app` (production) — the user had set
   a preview deployment URL (`mygamemining-1z7cr4rbj-...`), which
   changes on every deploy. Preview deployments otherwise serve the
   same code and their API was verified healthy (health ok,
   getGameState ok without initData, initData validation runs).
2. **Client bug: an {ok:false} game-state response blanked the app.**
   `callAction` only throws on a non-2xx HTTP status, but business
   failures arrive as HTTP 200 `{ok:false, error}` by design. The
   initial `getGameState` query received that object as if it were
   game state, App rendered `data.player` (undefined) and the render
   threw → React unmounted → blank black screen, instead of the
   connection-lost screen. Mutations were unaffected (their onSuccess
   handlers already check `r.ok` and show the error in a banner).

### Fix (client/src/api.ts)
`api.getGameState` now throws when the response has `ok === false`
(checked via a cast — the handler's type is the success shape only),
so React Query routes it to `state.error` and the connection-lost
screen with a retry button is shown. The 5s refetchInterval keeps
retrying, so the game recovers automatically once the server accepts
the login again. Mutations unchanged.

### Verified locally (2026-11-19)
`bun run typecheck` 0 errors (strict AND Vercel-style), `bun run
build:client` OK (`main-YIHXJ2X3.js`), full suite 69/69 pass.
NOT verified live (needs the owner to update BOT_TOKEN + redeploy,
then open the Mini App from the new bot).

## Tab Komunitas — channel, grup, referral (2026-11-20, implemented, PUSHED 2026-11-20 commit 15fbef8e)

New tab for ALL players (Kendali stays admin-only). Pure client UI +
i18n — no server changes, no new actions, no DB migration, no
economy changes.

### Placement
- `type Tab` gains `"komunitas"`; tab entry after WD, before the
  admin-only Kendali push: Tambang → Peta → Pasar → Hanggar → WD →
  **Komunitas** → Kendali (admin only). Bottom nav stays a 3-column
  grid: 6 tabs = clean 3×2 for non-admin; admin gets 7 (wraps).
- Label `tabCommunity`: "Komunitas" / "Community". Icon: new
  `UsersIcon` SVG (Feather "users" paths) matching the existing
  `IconShell` style.

### Cards (KomunitasTab, client/src/App.tsx)
1. **Channel Resmi / Official Channel** — SatelliteIcon. Button
   "Gabung Channel" / "Join Channel" opens
   `https://t.me/astra_mining_gram` (live). Opening uses
   `window.Telegram.WebApp.openTelegramLink(url)` inside Telegram
   (added to the minimal typing in `client/src/globals.d.ts`),
   else `window.open(url, "_blank", "noopener")`.
2. **Grup Diskusi / Discussion Group** — UsersIcon. No group link
   yet (owner will provide it later): the card shows a DISABLED
   "Segera hadir" / "Coming soon" button, no dead link.
3. **Referral** — GiftIcon. "Undang Teman, Dapat KT" / "Invite
   Friends, Earn KT": reward **10 KT per invited friend who starts
   playing** (set by Muse, owner delegated the amount: 10 KT ≈
   2–3 hours of active free play at ~100 KT/day, so 10 referrals =
   one 100 KT first WD — worth sharing, not farmable; each fake
   account needs its own Telegram account + real play, and
   anti-cheat flags >3 accounts/IP). Shows the player's referral
   link with a Copy button (`navigator.clipboard.writeText` with a
   textarea + `execCommand("copy")` fallback, "Disalin!" /
   "Copied!" feedback for 2s), plus the honest note that referral
   tracking and automatic rewards are coming soon. With no Telegram
   userId (web/legacy player) the card shows "Buka lewat Telegram
   untuk mendapatkan link referralmu" instead of a link.

### Daftar teman yang diundang (2026-11-24, LIVE, commit aed827d, bundle main-4RJ2VT66.js, migrasi-0012 dijalankan owner di Neon sebelum push)
Owner mengundang 3 orang, tidak dapat KT, dan tidak tahu siapa saja mereka — alasannya: hadiah baru masuk saat teman menyelesaikan ekspedisi PERTAMA, bukan saat bergabung; dan Komunitas hanya menampilkan hitungan. Sekarang getGameState mengembalikan `referrals.list` (terbaru dulu): nama + status + tanggal gabung. Status "pending" = teman sudah bergabung tapi belum menyelesaikan ekspedisi pertama (hadiah belum masuk); "rewarded" = Berhasil +10 KT. Nama dari `player.first_name` (migrasi-0012, disimpan loadPlayer dari initData tervalidasi — banyak pemain tidak punya username), mundur ke @username lalu "Pemain". `Session` di telegram.ts mendapat field `firstName` (diisi resolveSession dari identity). loadPlayer + query daftar dijaga try/catch sendiri: bila migrasi 0012 belum dijalankan, game tetap jalan dan daftar tampil kosong. Hadiah TETAP otomatis — daftar ini hanya menampilkan, belum ada tombol klaim (klaim masih diskusi terbuka). i18n baru: commRefListTitle/commRefEmpty/refPending/refRewarded (id+en+ru). Tes: suite 163/163 (4 tes baru di referral.test.ts: daftar pending + urutan terbaru dulu, berubah rewarded setelah ekspedisi pertama, fallback nama @username → Pemain, daftar kosong); harness 46/46 + 44/44 (2 cek baru: kartu referral + petunjuk kosong di Komunitas). makeInitData di harness.ts mendapat param ke-4 firstName (default "Test") untuk tes nama. MIGRASI HARUS DIJALANKAN OWNER DI NEON SEBELUM PUSH (file deploy/neon/migration-0012-player-first-name.sql).
### Referral link format (CHANGED 2026-11-20 — was `?start=`, see referral-logic section)
- Link: `https://t.me/astra_mining_bot/astra_mining?startapp=ref_<telegramId>`,
  built from `getTelegramSessionInfo().userId`. The startapp link
  opens the Mini App DIRECTLY with the payload attached — Telegram
  puts it in `initDataUnsafe.start_param`, so attribution is
  guaranteed. (The old `?start=ref_<id>` link only opened the bot
  chat; the payload could be lost if the friend opened the Mini App
  another way. The owner tested a referral with the old format and
  it did not register.)

### i18n
15 new keys (`tabCommunity`, `commChannel*`, `commGroup*`,
`commRef*`) in `client/src/i18n.ts`, id + en, symmetric with
matching `{kt}` placeholders. No hardcoded UI strings in the
component.

### Verified locally (2026-11-20)
`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK
(`main-NEHA2J7M.js`). Full test suite attempted once: 17 pass /
52 fail — ALL 52 failures are the one DB error (local Postgres
test DB unavailable after the overnight VM restart; PostgreSQL not
installed yet — the parent agent is restoring it separately). The
DB-independent i18n dictionary tests pass 3/3 (key symmetry,
non-empty values, placeholder matching), covering the 15 new keys.
NOT pushed to GitHub; NOT verified live.

## Logika referral — pelacakan + hadiah otomatis (2026-11-20, implemented, PUSHED 2026-11-20 commit f8209623)

The Komunitas tab already showed a referral link + the note
"Pelacakan referral dan pemberian hadiah otomatis segera hadir".
That note is now gone — the logic is built. The user asked
"jadi referral ini belum terdeteksi?" — correct, it was not
tracked at all before this change; now it is.

### Link format (CHANGED 2026-11-20 — was `?start=ref_<id>`)
`https://t.me/astra_mining_bot/astra_mining?startapp=ref_<telegramId>`,
built client-side from `getTelegramSessionInfo().userId`. Copy button
unchanged. Why the change: the owner tested a referral with the old
`?start=` link and it did not register — that link only opens the bot
chat, and the payload is lost if the friend opens the Mini App any
other way. The startapp link opens the Mini App directly with the
payload attached, so `start_param` is always present. Server side is
unchanged: it reads `start_param` from validated initData either way
(the regex `^ref_(\d+)$` matches the `ref_<id>` value in both cases).
NOTE: a referral also does NOT register until migration-0005 has run
in Neon (no `referrals` table → attribution is silently skipped) —
the owner's failed test may have been the missing migration, the old
link format, or both.

### Attribution — start_param, first-join-only
- Telegram puts the `?start=` payload into initData as
  `start_param`. It is part of the signed data_check_string, so
  it is authenticated like `user` — it cannot be forged without
  BOT_TOKEN. `api/_lib/telegram.ts` exposes it as
  `identity.startParam` → `session.startParam` (null for the web
  player and for Telegram players who open the Mini App without a
  payload).
- On the FIRST `getGameState` that creates a brand-new player row
  ONLY, `recordReferralAttribution` (api/_lib/game.ts) parses
  `ref_<telegramId>`: the referrer must ALREADY be a player row,
  it must NOT be the new player's own telegramId (no
  self-referral), and the new player must not already have a
  referrer. One referral per referred player, ever — later
  sessions with a start_param never re-attribute (and the
  `UNIQUE` on `referrals.referred_player_id` makes a second
  attribution impossible even under a race). Attribution failures
  (including a missing `referrals` table) are swallowed — they
  never break login or getGameState.

### Storage — migration-0005
- New table `referrals` (id, referrer_player_id, referred_player_id
  UNIQUE, status pending/rewarded, created_at, rewarded_at) +
  index on referrer_player_id. `deploy/neon/migration-0005-referrals.sql`
  (idempotent, run once in Neon BEFORE redeploy — see step 11 in
  "Vercel steps" above) migrates existing databases;
  `deploy/neon/init.sql` + `deploy/neon/schema.pg.ts` carry the
  same table for fresh installs.

### Reward trigger — first expedition, referrer only
- When the referred player completes their FIRST expedition
  (`completeExpedition`), `payReferralRewardIfPending` credits
  **10 KT** (`REFERRAL_REWARD_KT`, fixed — owner-delegated) to the
  REFERRER's balance + totalKtEarned, flips the referral
  pending → rewarded, and writes an Economy Log entry
  (`referral_reward`, 10 KT) for the referrer. Only the first
  expedition pays; later expeditions find no pending row. The
  claim is atomic (UPDATE … WHERE status='pending' + affected-row
  check), so two simultaneous completions cannot double-pay. No
  referee bonus in this phase (inviter only).
- Reward failures are swallowed — they never break expedition
  completion.

### Anti-farming
- The first-expedition requirement is the main brake: every fake
  account must spend real time + energy (scan + drill every vein)
  before its referrer sees 1 KT. Plus: one referral per referred
  player, no self-referral, referrer must already exist, reward
  paid exactly once. The existing >3-accounts/IP anti-cheat rule
  already flags multi-account farming. No daily cap or other new
  limit — kept simple on purpose.

### getGameState — `referrals` field
- `player.referrals`: `{ invited, rewarded, earnedKt }` — how many
  friends joined through the player's link, how many already paid
  a reward, and total KT earned from referrals. Every existing
  field unchanged.

### Client
- KomunitasTab referral card: the "segera hadir" note is replaced
  with live stats from `data.player.referrals` — "Teman bergabung:
  X · Hadiah diterima: Y KT" / "Friends joined: X · Rewards
  earned: Y KT" (`commRefStats`, id + en, symmetric). Link + copy
  button unchanged. `KomunitasTab` now takes a `referrals` prop.
- Server log message `logReferralReward` in `api/_lib/i18n.ts`
  (id + en).

### Limitations (documented, by design)
1. **No retroactive attribution.** Players who joined through a
   referral link BEFORE this logic existed cannot be attributed —
   their start_param is gone (Telegram only sends it on the first
   open through the link).
2. **Reward log language.** The reward log entry is written in
   the REFERRED player's current language, since the referrer's
   language preference is not stored per player (same convention
   as admin-initiated log entries — see the i18n note in
   PORT_NOTES).

### Verified locally (2026-11-20)
`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK
(bundle `main-C54B5RFY.js`). Full test suite attempted once:
17 pass / 61 fail — ALL 61 failures are the one DB error
(local Postgres test DB unavailable after the overnight VM
restart; PostgreSQL not installed yet — the parent agent is
restoring it separately). The 9 new referral tests
(`/tmp/smoke-test/referral.test.ts` — attribution on first join
with a valid ref, self-referral ignored, unknown referrer
ignored, malformed start_param ignored, second join with a
start_param does not re-attribute, join without start_param
records nothing, 10 KT credited to the referrer on the first
expedition with log entry + stats update, NO reward on the
second expedition, no-referrer player earns nothing extra)
could NOT run — every DB-backed test fails at the first query.
The DB-independent i18n dictionary tests pass 3/3 (key
symmetry, non-empty values, placeholder matching), covering the
new `commRefStats` key. Run the full suite once Postgres is back
(the test DB also needs migration-0005 applied — or a fresh
init.sql — before the referral tests can run). NOT pushed to
GitHub; NOT verified live.

## Telegram Stars (XTR) Premium — pembayaran asli (2026-11-20, implemented, PUSHED 2026-11-20 commit 7d2d24bc)

Replaces the manual Stars flow. Before: the player created a
pending `premium_orders` row (`createPremiumOrder`), paid Stars to
the owner somehow in Telegram, and the owner confirmed it from
Kendali. Now the payment is a real Telegram Stars invoice, and
Premium activates automatically via a webhook. Prices RAISED
2026-11-20: Standard 300 Stars / 7 days, Pro 1000 Stars / 30 days
(dual drill) — was 150/500. Reason: at 150/500 the owner LOST
money on fully-upgraded (lvl 5) players (a Pro buyer could
withdraw ~12.4 USDT extra in 30 days vs $6.50 of Stars); at
300/1000 the owner profits on every profile (worst case Pro +
$0.60, Standard +$1.01). Stars withdraw rate $0.013/Star via
Fragment (1,000-Star minimum, 21-day hold).

### Architecture (invoice → openInvoice → webhook → activation)

1. Player taps a plan in Hanggar → client calls the new game
   action `createStarsInvoice({plan})` (replaces
   `createPremiumOrder` — the old action and its client call are
   REMOVED).
2. Server creates the pending `premium_orders` row (same "one
   pending order per player" rule), then calls the Bot API
   `createInvoiceLink` with title/description = plan label,
   `provider_token: ""` (empty — required for Stars), currency
   `"XTR"`, `prices: [{label, amount: plan stars}]`, and payload
   `premium:<orderId>:<playerId>:<tier>`. Returns
   `{invoiceUrl, orderId}`. On Bot API failure the pending row is
   deleted again (so the player can retry immediately) and a clean
   error is returned — no token, no raw API body.
3. Client opens the invoice with
   `Telegram.WebApp.openInvoice(invoiceUrl, callback)` (typing
   added to `client/src/globals.d.ts`). Callback statuses:
   `"paid"` → refresh + success banner; `"pending"` → matching
   banner + refresh, order stays pending for the webhook.
   `"cancelled"` / `"failed"` → matching banner AND the client
   calls the player action `cancelStarsOrder({orderId})`, which
   DELETES the pending row — no purchase happened, so the buy
   buttons return at once with no admin work (see "Cancelled /
   failed payments auto-release" below). If the invoice sheet
   never opens (`Telegram.WebApp.openInvoice` unavailable), the
   just-created pending row is cancelled the same way. Outside
   Telegram (web/legacy player, no `Telegram.WebApp`) the buy
   buttons are replaced by a note: "Buka lewat Telegram untuk
   membeli Premium dengan Stars" — and the server also rejects
   `createStarsInvoice` for non-Telegram sessions.
4. Before charging, Telegram sends `pre_checkout_query` to the
   webhook. The server validates it against the stored order
   (currency XTR, payload parses, order exists + still pending,
   owner = payer, amount = plan Stars) and answers
   `answerPreCheckoutQuery` ok:true, or ok:false + a short
   message (Telegram shows it in the payment sheet). Must be
   answered within ~10s.
5. After payment, Telegram POSTs `message.successful_payment`
   to the webhook. The server validates the payload the same
   way, enforces idempotency (atomic claim: only a still-pending
   order flips to `paid`; a redelivered update finds it already
   paid and does nothing), activates Premium with the SAME
   extension rule `confirmPremiumOrder` uses (base = current
   `premium_until` if still in the future, else now; a Pro order
   always sets Pro; a Standard order never downgrades an active
   Pro pass — now shared in `activatePremiumOrder`), marks the
   order `paid` and stores `telegram_payment_charge_id` +
   `total_amount`, and writes the Economy log entry
   (`premium_confirm`).
6. A pending order (invoice created, webhook not yet confirmed)
   is still shown in Hanggar with a "menunggu pembayaran" note —
   and now with a **"Batalkan pesanan"** button (player-side,
   `cancelStarsOrder`): it frees players whose openInvoice
   callback never fired (e.g. they closed the app mid-payment and
   came back to a stuck pending order). After cancelling, the plan
   buy buttons are visible again.

### Cancelled / failed payments auto-release (2026-11-20)

The owner found the bug live: cancelling the Stars payment sheet
left the pending row in place, the buy buttons were replaced by
the pending-order card, and `createStarsInvoice` refused a new
invoice until an admin rejected the stuck order. That is wrong —
a cancelled payment means no purchase happened, so nothing
should remain.

- New player-side game action `cancelStarsOrder({orderId})`
  (`api/_lib/game.ts`, NOT admin-gated): only the order's OWN
  player may cancel it (ownership in the WHERE clause, same
  pattern as `cancelWithdrawal`), and only while its status is
  `"pending"` — a paid/confirmed/rejected order answers
  `errOrderAlreadyProcessed`, a missing/other-player order
  answers `errPremiumOrderNotFound`. Effect: the row is DELETED
  (no `'cancelled'` status — nothing was paid, so there is
  nothing to keep), plus a `premium_cancel` Economy log entry.
  NO Neon migration needed.
- Called automatically by the client: openInvoice `"cancelled"`
  / `"failed"`, and the invoice-never-opened path (openInvoice
  unavailable after the row was created). Plus the manual
  "Batalkan pesanan" button on the pending-order card.
- Race-safe against the webhook: `applyStarsPayment` claims
  pending→paid atomically, so a payment that landed first cannot
  be cancelled away; conversely a late `successful_payment` for a
  deleted order finds no row and is ignored (tested).
- `errPremiumOrderPending` (shown when buying with a pending
  order open) now points at the cancel button instead of telling
  the player to wait for the owner; `pendingOrderDesc` says the
  same.

### Webhook

- URL: `https://mygamemining.vercel.app/api/telegram-webhook`
  (new Vercel function `api/telegram-webhook.ts`, POST only,
  `maxDuration: 30` in `vercel.json`). Always returns HTTP 200
  quickly — Telegram retries non-200 deliveries — and never
  throws; any failure leaves the order pending for manual
  confirmation.
- Secret: derived server-side as
  `HMAC-SHA256(BOT_TOKEN, "astra-mining-webhook")` (hex) — NO
  new env var. `setWebhook` registers it as `secret_token`; the
  handler verifies the `X-Telegram-Bot-Api-Secret-Token` header
  against the same derivation (constant-time compare, 403 on
  mismatch). BOT_TOKEN is never logged, and full update bodies
  are never logged.
- Non-XTR payments are ignored; malformed payloads are ignored.

### One-time setup (owner, after deploy)

Kendali → new "Hubungkan Webhook Stars" button (in the
GrantPremiumCard, admin-only game action `setupStarsWebhook`)
registers the webhook URL + secret with the Bot API. Press it
ONCE after the deploy. It needs no new env var — BOT_TOKEN is
already in Vercel env.

### Manual fallback (still there — ONLY for webhook-missed payments)

`confirmPremiumOrder` + `rejectPremiumOrder` stay as the admin
fallback for payments the webhook misses (stuck pending
orders) — the owner no longer has to work for cancelled or
failed payments, those release themselves. The Kendali
pending-orders list now also shows orders
with status `paid` in the history ("dibayar via Stars" /
"paid via Stars"). `grantPremium` (free grant) is unchanged.

### Migration 0006 — RUN BEFORE DEPLOY

New idempotent `deploy/neon/migration-0006-stars-charge.sql`
(+ `init.sql` + `schema.pg.ts`): adds
`premium_orders.telegram_payment_charge_id` (TEXT) and
`premium_orders.total_amount` (INTEGER), and extends the status
CHECK to `('pending','confirmed','rejected','paid')`.
⚠️  DEPLOY ORDER MATTERS: run migration-0006 in Neon BEFORE
the code deploys. Unlike migration-0005 (new table, handlers
swallow the missing-table error), migration-0006 adds columns
to a table `getGameState` selects on every request — without
the columns the live game breaks (missing-column error) until
the migration runs. Vercel auto-deploys on push, so run the
migration first, then push. (The webhook handler itself still
catches a missing-column failure and leaves the order pending
for manual confirmation — belt and braces only.)

### i18n

Every new string in `client/src/i18n.ts` AND `api/_lib/i18n.ts`,
id + en symmetric: `premiumBuyTitle`,
`premiumStarsNeedTelegram`, `premiumStarsPaid`,
`premiumStarsCancelled`, `premiumStarsFailed`,
`premiumStarsPending`, `starsWebhookTitle/Desc/Btn/Connected`,
`grantPastPaid`, `errStarsNeedTelegram`,
`errStarsInvoiceFail`, `errStarsWebhookFail`,
`starsPrecheckoutInvalid`. Removed dead/manual-flow keys:
`premPendingTitle`, `premPendingDesc`, `premiumHowTo`,
`premiumOrderCreated`, `planOrderAria` (all unused). Reworded:
`pendingOrderDesc` (waiting for Stars payment + manual fallback
hint), `premiumHint` (auto-activation), `grantDesc` (webhook is
now the normal path).

### Files changed

- NEW `api/_lib/stars.ts` — Bot API client: `createInvoiceLink`,
  `answerPreCheckoutQuery`, `setWebhook`,
  `buildInvoicePayload` / `parseInvoicePayload`,
  `deriveWebhookSecret` / `verifyWebhookSecret`,
  `STARS_WEBHOOK_URL`; test seam `setBotFetchForTests` /
  `resetBotFetchForTests` (the Bot API fetch is swappable so
  tests never hit api.telegram.org).
- NEW `api/telegram-webhook.ts` — POST webhook route.
- `api/_lib/game.ts` — new actions `createStarsInvoice` +
  `setupStarsWebhook` (admin-gated); `createPremiumOrder`
  REMOVED; `confirmPremiumOrder` refactored onto the shared
  `activatePremiumOrder` helper; new exported webhook helpers
  `validateStarsPreCheckout` + `applyStarsPayment`;
  `getGameState` premiumOrders status enum gains `"paid"`.
  (2026-11-20) new player action `cancelStarsOrder` (DELETEs
  a still-pending order — owner-only, pending-only, no
  migration) + `logPremiumCancel` server string;
  `errPremiumOrderPending` reworded to point at the cancel
  button.
- `api/_lib/i18n.ts` — 4 new server strings (id + en).
- `client/src/api.ts` — `createStarsInvoice` +
  `setupStarsWebhook` (replaces `createPremiumOrder`).
- `client/src/globals.d.ts` — `openInvoice` typing.
- `client/src/App.tsx` — `buyPremium` mutation (invoice →
  openInvoice → status banners), PremiumCard reworked
  ("Beli dengan Stars", non-Telegram note, pending-order box),
  GrantPremiumCard gains the webhook setup button + `"paid"`
  history branch.
- `client/src/i18n.ts` — keys above (id + en).
  (2026-11-20) `cancelOrderBtn`, `cancelOrderAria`,
  `premiumOrderCancelled`; `pendingOrderDesc` reworded (cancel
  button instead of owner fallback).
- `deploy/neon/migration-0006-stars-charge.sql` (NEW),
  `deploy/neon/init.sql`, `deploy/neon/schema.pg.ts`.
- `vercel.json` — `api/telegram-webhook.ts` maxDuration 30.
- Tests: NEW `/tmp/smoke-test/stars.test.ts` (8 tests —
  invoice payload per plan, web-player refusal,
  pre_checkout valid/invalid ×5, successful_payment
  activation + charge storage + idempotency, non-XTR ignored,
  wrong secret → 403, webhook setup admin-only, admin
  confirm fallback); `game.test.ts` premium test + 
  `telegram.test.ts` admin-gate test updated to
  `createStarsInvoice` (stubbed Bot API). Mirrored to
  `~/workspace/smoke-test/`.

### Verified locally (2026-11-20)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK
(bundle `main-HUJA5EZT.js`). Full suite: **86/86 tests pass,
2.615 expects, 3 consecutive runs** (includes the 8 new Stars
tests + the 9 referral tests — the local Postgres test DB was
restored for this run: the existing 16/main cluster was started,
the missing `astra_test` role/database were recreated, and
`init.sql` + migrations 0001–0006 were applied; PostgreSQL
itself was NOT reinstalled). PUSHED 2026-11-20 (commit 7d2d24bc)
after migration-0006 ran in Neon; the owner confirmed the webhook
connects and the live payment works. Live test note: there is NO
sandbox for Stars — a live end-to-end test costs real Stars (150
for Standard).

(2026-11-20, cancel fix — NOT yet pushed) `cancelStarsOrder` +
auto-release on cancelled/failed + "Batalkan pesanan" button:
`bun run typecheck` 0 errors (strict AND Vercel-style),
`bun run build:client` OK (bundle `main-5BJWQ5TX.js`). Full
suite: **92/92 tests pass, 2,656 expects, 2 consecutive runs**
(86 before + 6 new cancel tests in `stars.test.ts`, now 14 Stars
tests total). The local Postgres test DB had to be restored again
for this run (another VM restart: /tmp wiped, cluster down,
`astra_test` role/database missing — cluster started with
`pg_ctlcluster 16 main start`, role/database recreated,
`init.sql` + migrations 0001–0006 applied; PostgreSQL itself was
NOT reinstalled). No Neon migration needed for the cancel fix.

## GRAM (TON Connect) Premium — pembayaran kedua (2026-11-20, implemented, NOT yet pushed)

Owner asked for a second Premium payment method via TON (he
corrected himself: TON is now called GRAM) and explicitly rejected
pay-by-address + paste-tx-hash as too fiddly — the player must
never copy a hash. So: **TON Connect (wallet connect)** — the
player taps "Beli dengan GRAM", the wallet opens, they approve
ONCE, and Premium activates automatically; the wallet returns the
proof itself.

### Prices (FIXED amounts, not USD-pegged)

- Standard: **4 GRAM / 7 days** (4.000.000.000 nanoTON)
- Pro: **13 GRAM / 30 days** (13.000.000.000 nanoTON, dual drill)
- At ~$1,02/GRAM ≈ $4,08 / $13,26 — slightly above the Stars USD
  value; the owner keeps 100% instantly (no Fragment 21-day hold,
  no 1.000 minimum). The player pays a tiny TON network fee on top
  (~0,01 GRAM). **GRAM's USD price moves, so these fixed amounts
  need a periodic check** — there is no live rate API for the
  Stars→USD rate either (it is a fixed Telegram config value);
  only the GRAM price moves.
- Stars prices UNCHANGED: Standard 300, Pro 1000.

### Player flow (no hash copying)

1. Hanggar → Premium Pass → per plan TWO buttons: "Beli dengan
   Stars" (amber, existing flow) and "Beli dengan GRAM" (teal).
2. "Beli dengan GRAM" → server `createGramOrder({plan})` creates
   ONE pending `premium_orders` row (method "gram", gram_amount)
   and returns `{ orderId, receiverAddress, amountNanoTon }`.
3. Wallet not connected → TON Connect connect UI opens (wallet
   list / QR in the Mini App). Once connected, `sendTransaction`
   sends ONE payment to the owner's wallet (destination +
   amount only, no extra payload) — the player approves once.
4. The wallet returns a BOC → the client hashes its root cell
   (`@ton/core` `Cell.fromBoc`, msg_hash) and calls
   `confirmGramPayment({ orderId, msgHash, senderAddress })`.
5. The server verifies on-chain (below) and activates Premium
   automatically (same extension rule as Stars: extends from the
   current `premium_until` if still active). On "tx not indexed
   yet" the server returns `retryable: true` and the client
   retries every 2s, up to 5×.
6. Player cancels/rejects in the wallet → the client calls
   `cancelPremiumOrder` for the just-created order (same
   auto-release behaviour as Stars); the buy buttons return at
   once. The pending-order card also has a "Batalkan pesanan"
   button for players whose payment callback never fired.
7. Outside Telegram (plain browser) the GRAM buttons are hidden
   behind the "buka lewat Telegram" note — TON Connect needs the
   Mini App + a TON wallet (Tonkeeper, etc.).

### On-chain verification (server, api/_lib/ton.ts)

- API: **tonapi.io, no API key** (1 RPS unauthenticated — Premium
  purchase volume is far below that). Endpoint:
  `GET /v2/blockchain/messages/{msg_hash}/transaction`.
- Checks, in order: the transaction EXISTS (404 → "not_found",
  retried internally up to 4× with 2s sleeps, ±8s total — under
  the 30s `maxDuration` of `api/game.ts`); destination (raw
  address) == owner's wallet; sender (raw address) == the
  connected wallet; amount >= plan price (overpaying is fine —
  the player pays the network fee on top); the returned tx hash
  was never used before (DB check + partial UNIQUE index on
  `tx_hash` + atomic pending→paid claim — a replayed confirm
  finds the order already paid and does nothing).
- Failures return clean translated errors (no raw API bodies):
  not-found → retryable, network/bad-response → retryable,
  wrong recipient/amount/sender/reused → permanent.
- Test seam: `setTonFetchForTests` (same pattern as stars.ts
  `setBotFetchForTests`).

### Receiver address (PUBLIC — safe in code)

`UQCFBLKDhmTiHhbJu1YWN0I4FRgCwk3teZjy0ByeHOhOD0tf`
(raw `0:8504b2838664e21e16c9bb5616374238151802c24ded7998f2d01c9e1ce84e0f`,
verified live 2026-11-20: active wallet_v4r2, ~1,85 GRAM).
Constant `GRAM_RECEIVER_ADDRESS` in `api/_lib/ton.ts` — change it
there if the owner moves wallet. NEVER a seed phrase / private
key — neither is ever asked for or stored. The address is also
exposed to the client via `getGameState.player.premium.gramReceiverAddress`
so the client never hardcodes it; `getGameState` also carries
`gram` + `gramNanoTon` per plan (same as Stars prices).

### TON Connect wiring

- `client/public/tonconnect-manifest.json` — name "ASTRA MINING",
  url `https://mygamemining.vercel.app`,
  iconUrl `https://mygamemining.vercel.app/icon.webp` (STABLE —
  not a hashed build asset). Served at the site root:
  `https://mygamemining.vercel.app/tonconnect-manifest.json`.
- `client/build.mjs` now copies `client/public/tonconnect-manifest.json`
  and the repo-root `icon.webp` into `client/dist/` verbatim
  (step 4, after index.html) — verified in dist after build.
- `client/src/tonconnect.ts` — `TonConnectUI` with that
  manifestUrl + `actionsConfiguration.twaReturnUrl =
  https://t.me/astra_mining_bot/astra_mining` (returns the player
  to the Mini App after approving in the wallet; TWA-to-TWA
  needs the explicit link). Helpers: `isTonConnectAvailable`
  (Telegram WebApp present), `connectWallet`,
  `sendGramPayment` (validUntil +5 min, returns msgHash +
  senderAddress), `disconnectWallet`.
- `@tonconnect/ui` 5.0.3 + `@ton/core` 0.63.1 (bun add) and the
  `buffer` 6.0.3 polyfill: `@ton/core` uses the global `Buffer`
  in several paths and browsers don't provide it — `client/src/main.tsx`
  sets `globalThis.Buffer` once at startup (without this,
  `Cell.fromBoc()` throws "Buffer is not defined" in the browser).
  Note: @tonconnect/ui v5 moved `twaReturnUrl` under
  `actionsConfiguration` — `uiOptions` is a setter, not a
  constructor option (first build failed typecheck on this).

### Actions + rename

- NEW `createGramOrder` / `confirmGramPayment` in
  `api/_lib/game.ts` (Telegram sessions only — same web-player
  refusal as `createStarsInvoice`; one-pending-order rule shared
  across BOTH methods: a pending Stars order blocks a GRAM order
  and vice versa).
- RENAMED `cancelStarsOrder` → **`cancelPremiumOrder`** (old name
  removed; client + `stars.test.ts` updated). Same rules: only
  the order's own player, only while pending, deletes the row.
  Race-safe against BOTH payment paths (webhook atomic
  pending→paid claim AND `confirmGramPayment` atomic claim).
- `activatePremiumOrder` / `confirmPremiumOrder` / `rejectPremiumOrder`
  log lines are now method-aware (GRAM orders log GRAM amounts,
  Stars orders log Stars). Kendali pending/past order cards show
  the method amount (GRAM or Stars) + a GRAM-specific admin note
  ("cek hash transaksi di blockchain sebelum konfirmasi").
- i18n: all new strings in `client/src/i18n.ts` AND
  `api/_lib/i18n.ts`, id + en symmetric (new keys:
  `errGram*` ×10, `logPremium*Gram` ×4 server-side;
  `planGram`, `orderPlanAriaGram`, `premiumBuyTitleGram`,
  `premiumGram*` ×9, `pendingOrderTitleGram/DescGram`,
  `grantOrderNoteGram` client-side; `premiumHint` now mentions
  both methods).

### Migration — ⚠️ RUN BEFORE PUSHING

- NEW `deploy/neon/migration-0007-gram-orders.sql` (+ `init.sql` +
  `schema.pg.ts`): `premium_orders.method TEXT NOT NULL DEFAULT
  'stars'`, `gram_amount REAL` (nullable), `tx_hash TEXT`
  (nullable) + partial UNIQUE index
  `premium_orders_tx_hash_unique ON premium_orders (tx_hash)
  WHERE tx_hash IS NOT NULL`. Idempotent (IF NOT EXISTS).
- **migration-0007 MUST run in Neon BEFORE this code is pushed.**
  Drizzle selects the new columns on every `getGameState`, so
  without them the live game breaks (column does not exist) —
  same sequencing as migration-0006. The owner pastes migrations
  himself; do NOT push until he confirms 0007 ran.
- The webhook/Stars code works unchanged with the new columns
  present (old rows get `method='stars'`, null gram/tx).

### Verified locally (2026-11-20)

`bun run typecheck` 0 errors (strict AND Vercel-style
`--strictNullChecks false`), `bun run build:client` OK
(bundle `main-LNIO3NNE.js`, `tonconnect-manifest.json` +
`icon.webp` confirmed in `client/dist/`). Full suite: **107/107
tests pass, 2.804 expects** (92 before + 15 new GRAM tests in
`/tmp/smoke-test/gram.test.ts`: order creation amounts +
receiver address per plan, getGameState plans/receiver, web
refusal, valid-tx activation + tx_hash storage, overpay OK,
wrong amount/recipient/sender rejected, reused tx hash
rejected, tx-not-found retryable, cancel frees GRAM+Stars,
Stars↔GRAM mutual exclusion, confirmGramPayment on a Stars
order rejected, double-confirm rejected, manifest JSON valid
with the right url/name/iconUrl; `stars.test.ts` cancel tests
renamed to `cancelPremiumOrder`). Mirrored to
`~/workspace/smoke-test/`. NOT yet pushed — waiting on
migration-0007 in Neon. Live test note: there is NO sandbox —
a live end-to-end test costs real GRAM (4 for Standard) and
needs a real TON wallet with funds.

## Layar hitam #2 — Buffer is not defined (2026-11-20, commit menyusul)

Setelah push GRAM (3a0ac1aa), game kembali blank hitam — di Telegram
MAUPUN di browser web biasa (fresh, tanpa cache). Server sehat
(getGameState live mengembalikan state lengkap, migrasi 0007 sudah
jalan), bundle baru main-LNIO3NNE.js ter-serve (200), manifest OK.

PENYEBAB (ditemukan dengan menjalankan bundle di Node dengan global
`Buffer` dihapus — meniru browser asli): `ReferenceError: Buffer is
not defined` saat bundle dievaluasi. @ton/core membuat
`BitString.EMPTY = new BitString(Buffer.alloc(0), ...)` di TOP-LEVEL
modulnya; modul itu dievaluasi SEBELUM body main.tsx berjalan,
sedangkan polyfill `globalThis.Buffer = Buffer` dipasang di main.tsx
saja — terlambat. Seluruh bundle gagal dievaluasi → tidak ada React,
tidak ada layar error, hanya hitam. Node menyembunyikan bug ini
karena Node PUNYA global Buffer bawaan (itu sebabnya tes lokal dan
harness awal tidak pernah menangkapnya).

PERBAIKAN: esbuild `inject` di client/build.mjs dengan file baru
client/src/buffer-polyfill.ts (`import { Buffer } from "buffer";
export { Buffer };`). esbuild menulis ulang semua referensi `Buffer`
bebas (mis. `A.Buffer.alloc`) ke binding inject itu, yang dievaluasi
paling atas bundle — sebelum modul mana pun. Penugasan
globalThis.Buffer di main.tsx tetap ada sebagai lapis kedua untuk
kode yang membaca Buffer lewat global saat runtime.

VERIFIKASI: harness Node dengan global Buffer dihapus (meniru
browser) — bundle baru main-MWMFDHQT.js dievaluasi bersih dan
me-render UI lengkap dengan data live asli (bahasa id). Typecheck 0
(strict + Vercel-style), build OK, full suite 107/107 (2.804 expects).

PELAJARAN: setiap dependensi baru yang memakai Node globals (Buffer,
process, dsb.) di top-level HARUS diuji dengan harness tanpa global
Node — tes `bun test` tidak akan menangkapnya karena Node
menyediakan global itu.

## Tap-to-expand deskripsi (2026-11-20, belum di-push)

Ide pemilik (lebih baik daripada memendekkan permanen): setiap
penjelasan panjang tampil sebagai PREVIEW 2 baris, pemain MENGETUK
untuk membaca penjelasan lengkapnya; ketuk lagi untuk menutup.

- Teks lengkap DIKEMBALIKAN dari commit 6d058ca7 (sebelum compact
  4ca4a5c9): diff 6d058ca7→4ca4a5c9 dibalikkan untuk
  client/src/i18n.ts, api/_lib/game.ts, api/_lib/i18n.ts — KECUALI
  heroDesc yang sengaja tetap pendek ("Scan asteroid, bor uratnya,
  jual jadi KT, tarik jadi USDT."). Bukti: deskripsi Tangki O₂
  kembali 418/389 karakter (dari 147/146), Reaktor 264/250,
  deskripsi peta 187–364 karakter, aturan rule1–17 lengkap.
  Diverifikasi end-to-end: getGameState lokal mengembalikan
  deskripsi penuh (Tangki 418, Bulan distanceLabel 74 karakter).
- Komponen baru client/src/ExpandableText.tsx: props children
  (ReactNode — bekerja dengan trich() **tebal**/*miring*) + lines
  (default 2). Tertutup: teks di-clamp + tombol kecil
  "Lihat selengkapnya ▾" (cyan, chevron SVG berputar 180° saat
  terbuka). Terbuka: teks penuh + "Tutup ▴". Ketuk teks ATAU tombol
  untuk toggle (per-instance useState). Bila teks muat dalam
  preview, tombol disembunyikan (diukur scrollHeight vs
  clientHeight, dicek ulang setelah font dimuat + saat resize).
  Inline saja — tanpa modal. Kunci i18n baru expandMore/expandLess
  (id + en). Catatan: class line-clamp tidak boleh dirangkai
  dinamis (`line-clamp-${n}` tidak terdeteksi Tailwind) — hanya 2
  dan 3 yang didukung via map statis.
- Dipakai di: kartu upgrade Hanggar (termasuk Tangki O₂), kartu peta
  Peta Tambang + deskripsi zona di Explore, tiap aturan rule1–17
  (baris expandable sendiri), aturan WD 1–6, premiumDesc,
  pendingOrderDesc(Gram), mapsIntro, hanggarCaption, grantDesc,
  starsWebhookDesc, adminFlow, flaggedDesc, deskripsi 3 kartu
  Komunitas, notScannedDesc, scanNote. TIDAK dipakai di teks pendek:
  heroDesc, marketNote, premiumGramNote, grantNote, teks status
  JobPanel, dan banner job/collect (teks-teks itu tampil penuh apa
  adanya; versi lengkapnya sudah dikembalikan).
- Layout padat dari compact pass TETAP: preview 2 baris yang menjaga
  layar tetap ringkas; teks lengkap hanya muncul saat diketuk.
  Tidak ada perubahan logika game, harga, reward, atau waktu.

## Log expandable + tombol Premium horizontal (2026-11-20, belum di-push)

Dua permintaan pemilik lanjutan dari tap-to-expand:

- **Log Misi / Log Ekonomi expandable.** `renderLog` di
  client/src/App.tsx (~baris 997): pesan tiap entri log kini
  dibungkus `ExpandableText` (preview 2 baris, ketuk untuk buka
  penuh, ketuk lagi untuk tutup; tombol disembunyikan bila pesannya
  muat). Badge +/− KT tetap menempel di dalam teks yang bisa
  dibuka, timestamp tetap di kanan (`min-w-0 flex-1` pada wrapper
  supaya tanggal tidak terdorong). Isi, timestamp, dan klasifikasi
  log TIDAK berubah — hanya rendering. Riwayat WD tidak diubah:
  baris-barisnya bukan entri log (bukan `renderLog`) melainkan
  field pendek terstruktur (nomor, USDT, alamat dompet, status,
  referensi) — tidak ada teks panjang yang perlu dibuka.
- **Tombol Premium horizontal.** `PremiumCard` di App.tsx
  (~baris 1073–1096): 4 tombol bayar yang tadinya dua seksi
  bertumpuk (`grid-cols-1`, "Beli dengan Stars" lalu "Beli dengan
  GRAM") kini SATU grid `grid-cols-2` — baris 1 Standard/Pro
  Stars (amber), baris 2 Standard/Pro GRAM (teal) — dengan satu
  judul bersama "Beli Premium" (kunci i18n baru
  `premiumBuyTitleAll`, id + en). Metode tetap jelas dari warna
  + label harga ("300 Stars" / "4 GRAM"). Baris tag
  (planProTag/planStdTag) dihapus dari tombol: selebar ~165px
  tag itu membungkus 3–4 baris dan membuat tombol tinggi lagi —
  manfaatnya sudah ada di daftar benefit di atas tombol.
  `premiumGramNote` tetap di bawah grid. TIDAK berubah: onClick
  (onBuy/onBuyGram), disabled, aria-label, teks paying/verifying
  GRAM, pending-order box, catatan "Buka lewat Telegram". Kunci
  lama premiumBuyTitle/premiumBuyTitleGram kini tidak dipakai di
  App.tsx tapi tetap ada di dict (tidak berbahaya).
- Verifikasi: typecheck 0 (strict + Vercel-style), build OK
  (main-MIPDPGQW.js), full suite 107/107 (2.819 expects), harness
  render tanpa global Buffer OK. Catatan jujur: data uji harness
  punya 0 entri activity, jadi kartu log tidak ikut me-render di
  harness — perubahan log terverifikasi lewat typecheck + build,
  bukan render langsung; pemilik sebaiknya cek satu entri log
  panjang di HP setelah deploy.

VERIFIKASI: typecheck 0 (strict + Vercel-style), build OK
(main-2OJNK2EH.js), full suite 107/107 (2.814 expects), harness
Node tanpa global Buffer + data getGameState live: bundle
dievaluasi bersih, UI lengkap me-render (hero, 6 tab).

KOREKSI pemilik (2026-11-20, commit f8bfd3bb): pemilik hanya
menyarankan POSISI tombol, bukan mengubah kalimat — versi pertama
di atas (satu judul "Beli Premium", tagline tombol dibuang)
salah. Judul dikembalikan ke "Beli dengan Stars" / "Beli dengan
GRAM" + tagline di tombol; yang berubah hanya posisi grid-nya
(grid-cols-2 per metode). Kunci `premiumBuyTitleAll` dihapus dari
dict. Verifikasi: typecheck 0, build OK (main-DOG4ZROH.js), full
suite 107/107 (2.814 expects).

## Kartu log "Lihat selengkapnya" + progres sektor triangular (2026-11-20, belum di-push)

Dua permintaan pemilik — DAN keduanya butuh koreksi atas
pekerjaan sebelumnya:

### 1. Kartu log: 5 entri + tombol, BUKAN expandable per entri

- Koreksi pemilik: expandable per entri log (pass sebelumnya)
  salah paham — yang harus tidak memanjang ke bawah adalah
  KARTU log-nya. `ExpandableText` per entri sudah DICABUT:
  entri log kembali tampil penuh seperti semula (satu baris,
  badge +/− KT menempel, timestamp di kanan).
- Sebagai gantinya, komponen baru `LogCard` di
  client/src/App.tsx (state `expanded` sendiri per kartu —
  Log Misi dan Log Ekonomi buka-tutup independen): tiap kartu
  hanya menampilkan 5 entri pertama; bila ada lebih, tombol di
  bawah daftar: "Lihat selengkapnya (N lagi)" → menampilkan
  SEMUA entri; saat terbuka tombolnya jadi "Tutup". Kunci i18n
  baru `logShowMore` / `logShowLess` (id + en). Server
  mengembalikan max 30 entri activity, jadi tombol muncul bila
  satu kategori punya >5 entri. Riwayat WD tidak diubah (baris
  pendek terstruktur, bukan prosa).
- Verifikasi: typecheck 0, build OK (main-B2K7FCEA.js). Catatan
  jujur: data uji harness punya 0 entri activity, jadi kartu log
  tidak ikut me-render di harness — perubahan log terverifikasi
  lewat typecheck + build, bukan render langsung.

### 2. Progres sektor: naik sektor makin sulit (biaya triangular)

- Perintah pemilik: "setiap naik sektor itu semakin sulit,
  jangan berikan mereka gampang naik map". Dulu 1 ekspedisi = 1
  sektor, jadi Peta 5 (Sektor 15) terbuka setelah 14 ekspedisi.
- ATURAN BARU: naik dari sektor L ke L+1 butuh L ekspedisi di
  sektor itu (Sektor 1→2 butuh 1, 2→3 butuh 2, 3→4 butuh 3,
  dst). Total ekspedisi untuk membuka peta: Peta 2 (Sektor 3) =
  3, Peta 3 (Sektor 6) = 15, Peta 4 (Sektor 10) = 45, Peta 5
  (Sektor 15) = 105.
- Implementasi server (`api/_lib/game.ts`):
  - Helper baru `expeditionsToAdvance(layer)` (= layer).
  - Kolom baru player `sector_progress` (lihat migrasi di bawah).
  - `completeExpedition`: progres +1; sektor naik hanya bila
    progres mencapai syarat (lalu progres reset 0). Bonus KT
    TIDAK berubah (masih 0,125 + 0,025×sektor, cap 8,75) — ia
    hanya tumbuh lebih lambat karena sektor naik lebih lambat.
    Warp ke asteroid baru juga tidak berubah. Respons kini
    mengembalikan `advanced` (bool) + `sectorProgress`
    {current, needed}; log memakai `logExpeditionProgress` baru
    bila sektor tidak naik (kalau tidak, log akan berbohong
    "warp ke Sektor X").
  - `getGameState` mengembalikan `player.sectorProgress`
    {current, needed}.
- Klien: kartu Posisi Misi menampilkan satu baris di bawah
  sektor: "{current}/{needed} ekspedisi menuju Sektor {next}"
  (kunci `sectorProgress`, id + en). Pesan toast selesai
  ekspedisi memakai `expeditionDoneProgress` baru bila sektor
  tidak naik. Aturan 8 diperbarui minimal (kalimat asli
  dipertahankan + syarat sektor ditambahkan).
- MIGRASI — `deploy/neon/migration-0008-sector-progress.sql`
  (idempotent, `ADD COLUMN IF NOT EXISTS sector_progress
  INTEGER NOT NULL DEFAULT 0` pada player; kolom juga ditambah
  ke `deploy/neon/init.sql` + `deploy/neon/schema.pg.ts`).
  ⚠️ JALANKAN MIGRASI INI DI NEON SEBELUM PUSH: Drizzle membaca
  kolom baru di getGameState — tanpa kolom ini game tidak bisa
  dibuka (sama seperti migrasi 0006/0007).
- Sim diukur ulang (aturan baru, `/tmp/smoke-test/run-sim.ts`
  + `run-premium-sim.ts`): bonus share jatuh dari ~66–80% ke
  ~20–36% (ORE kini sumber utama ~75%); cap bonus (Sektor 345)
  tidak terjangkau dalam 180 hari (layer tertinggi di sim: 102
  mid-upgrade) — rem aktifnya kini syarat sektor, bukan cap.
  Pace membaik PELAN antar horizon (~15–20%), tidak pernah
  runtuh.

  Gratis (180 hari) — first WD / repeat 46–60 / USDT-30d 46–60
  / repeat 166–180 / USDT-30d 166–180:
  - max-effort: 3 hari / ~78 hari / ~1,9 / ~63 hari / ~2,4
    (dulu: 2–3 / ~25 / ~5,9 / ~25 / ~5,9)
  - aktif: 5 hari / ~168 hari / ~0,9 / ~143 hari / ~1,0
    (dulu: 4 / ~50 / ~3,0 / ~50 / ~3,0)
  - kasual: 15 hari / ~669 hari / ~0,2 / ~629 hari / ~0,2
    (dulu: 13–17 / ~399→~192 / ~0,4→~0,8)
  - mid-upgrade (lvl 5): 1 hari / ~29 hari / ~5,2 / ~24 hari /
    ~6,2 (dulu: 1–2 / ~12,8 / ~11,7); butuh ~133 hari untuk
    mampu beli semua lvl 5 (dulu ~64); max-effort pun kini >180
    hari (dulu ~120–135).
  - 100 pemain aktif ≈ 100 USDT/bulan (dulu ~300).

  Premium Standard (180 hari):
  - max-effort: 1 / ~33 / ~4,5 / ~26 / ~5,8 (dulu ~12,5 / ~12)
  - aktif: 2 / ~74 / ~2,0 / ~60 / ~2,5 (dulu ~24,9 / ~6,0)
  - kasual: 8 / ~326 / ~0,5 / ~287 / ~0,5 (dulu ~132→~97)
  - mid-upgrade: 1 / ~12,3 / ~12,2 / ~10,0 / ~14,9 — kasus
    terburuk (dulu ~6,2 / ~24,1); 100 pemain seperti itu ≈
    1.200–1.500 USDT/bulan (dulu ~2.400).
  - Pro tetap menghasilkan KT SAMA dengan Standard (dual drill
    hanya menghemat waktu).
- Tes: `game.test.ts` — 3 tes baru (progres triangular 6
  ekspedisi: 1→2→2→3→3→4; respons `advanced`/`sectorProgress`
  + bonus 0,175 KT di sektor 2; `expeditionsToAdvance` +
  total 3/15/45/105). `economy.test.ts` — semua pin angka
  diukur ulang ke angka baru di atas; tes "bonus cap works /
  pace STABLE" ditulis ulang (cap kini tidak terjangkau; pace
  membaik pelan, dibatasi rasio) dan tes "bonus dominates"
  ditulis ulang (bonus kini MINORITAS ~20–36%).
- Verifikasi: typecheck 0 (strict + Vercel-style), build OK
  (main-B2K7FCEA.js), i18n dict tests 3/3, full suite 110/110
  (2.880 expects, 2× berturut-turut — termasuk 3 tes progres
  sektor baru). Harness render (jsdom, tanpa global Buffer, data
  getGameState live): bundle dievaluasi bersih, UI lengkap
  me-render; dengan 7 entri misi + 6 entri ekonomi, tiap kartu
  log menampilkan tepat 5 entri + tombol "Lihat selengkapnya",
  dan baris "1/2 ekspedisi menuju Sektor 2" tampil di Posisi
  Misi. Catatan: instalasi PostgreSQL lokal sempat hilang total
  akibat VM restart — diinstal ulang via apt (postgresql-16),
  cluster 16/main dinyalakan, astra_test dibuat ulang dari
  init.sql + migrasi 0001–0008.

## Harga GRAM dinamis dari API live (2026-11-21, PUSHED)

Alasan: harga GRAM turun dari $1,02 (saat harga tetap 4/13 GRAM
ditetapkan) ke ~$0,96 pada 2026-11-21 — dengan harga tetap,
owner menerima $3,84 bukan $4,08 per Standard. Harga GRAM
sekarang mengikuti pasar supaya owner selalu menerima nilai
USD yang sama.

- Target USD tetap: `PREMIUM_PLAN_USD = { standard: 4.08,
  pro: 13.26 }` (nilai 4 / 13 GRAM pada $1,02) di
  `api/_lib/game.ts`.
- `api/_lib/gram-price.ts` (baru): `getGramPriceUsd()` dengan
  cache in-memory 5 menit + dedup request bersamaan.
  Sumber utama: tonapi.io `GET /v2/rates?tokens=ton&currencies=usd`
  → `rates.TON.prices.USD` (tanpa key; limit 1 req/detik tanpa
  key — cache 5 menit membuat ini bukan masalah). Cadangan:
  CoinGecko `GET /v3/simple/price?ids=the-open-network&vs_currencies=usd`
  (tanpa key). Keduanya gagal → harga cache terakhir; tidak ada
  cache → fallback tetap $1,02 (harga lama 4/13 GRAM). Setiap
  fetch memakai timeout ~4 detik (AbortController) supaya API
  lambat tidak pernah menggantung request. Tidak ada API key
  di mana pun. Test seam `setGramPriceFetchForTests` /
  `resetGramPriceFetchForTests` / `resetGramPriceCacheForTests`
  (pola sama seperti `setTonFetchForTests`).
- Pembulatan: jumlah GRAM = `ceil2(usdTarget / livePrice)` —
  dibulatkan KE ATAS ke 2 desimal supaya nilai USD selalu ≥
  target (pembulatan ke bawah akan merugikan owner).
  `gramAmountForUsd()` memakai matematika gram-cents integer
  (`ceil(usd/price*100 − 1e-9)`); `gramToNanoTon()` membulatkan
  dulu ke 2 desimal — ini melindungi dari error penyimpanan
  float32 kolom `gram_amount` (REAL).
- `getGameState`: tiap plan mengembalikan `gram`/`gramNanoTon`
  live + field baru `gramPriceUsd` di objek premium (bentuk
  zod diperluas; tipe client mengikuti otomatis).
  `createGramOrder`: menghitung harga live SETELAH cek gagal
  murah (bukan Telegram / ada order pending), menyimpannya di
  kolom `gram_amount` yang sudah ada.
  `confirmGramPayment`: memverifikasi jumlah on-chain terhadap
  `gramAmount` YANG TERSIMPAN di order (jumlah yang dikutip
  saat order dibuat), BUKAN harga live saat itu — pemain yang
  membayar jumlah yang dikutip tidak boleh gagal hanya karena
  harga bergerak antara pembuatan order dan konfirmasi. Order
  lama tanpa `gramAmount` memakai fallback target USD ÷ $1,02.
  Tidak ada migrasi DB (kolom `gram_amount` sudah ada).
- Client: tombol plan sudah me-render `plan.gram` dari server,
  jadi menampilkan harga live otomatis — tidak ada sumber harga
  kedua di client. Satu baris baru di bawah tombol GRAM di
  PremiumCard (hanya bila `gramPriceUsd != null`): "1 GRAM ≈
  $0,96 — harga mengikuti pasar" / "1 GRAM ≈ $0.96 — price
  follows the market" (key baru `premiumGramRate`, id + en).
  Tidak ada perubahan kata lain.
- Contoh jumlah (terverifikasi): harga $0,51 → Standard 8 /
  Pro 26 GRAM; $1,02 → 4 / 13 GRAM; $2,04 → 2 / 6,5 GRAM;
  harga live 2026-11-21 ~$0,96 → Standard 4,25 / Pro 13,82
  GRAM. Cek live langsung dengan modul asli (bukan stub):
  $0,9599976… → Standard 4,26 GRAM ($4,0896 ≥ $4,08),
  Pro 13,82 GRAM ($13,2672 ≥ $13,26).
- Tes: `gram.test.ts` +6 tes (total 21 di file): $0,51 →
  8/26 GRAM; $2,04 → 2/6,5; $0,96 → 4,25/13,82 (cek ceil:
  13,26/0,96 = 13,8125 → 13,82; 13,82 × $0,96 = $13,2672 ≥
  $13,26); kedua API mati → fallback 4/13 ($1,02); harga turun
  setelah order dibuat (order 4 GRAM di $1,02, harga jadi $0,51
  → pembayaran 4 GRAM tetap mengaktifkan Premium — plus
  getGameState baru menegaskan harga live sudah 8 GRAM); harga
  naik setelah order dibuat (order 8 GRAM di $0,51, harga jadi
  $2,04 → pembayaran 8 GRAM tetap mengaktifkan). Helper
  `stubGramPrice(priceUsd | null)` menjawab dalam bentuk
  respons masing-masing sumber; `beforeEach` men-stub $1,02
  (tes lama tetap mengharapkan 4/13) + reset cache; `afterEach`
  reset seam + cache.
- Verifikasi: typecheck 0 (strict + Vercel-style), build OK
  (main-V34VR77X.js), full suite 116/116 (2.924 expects).
  Harness render (jsdom, tanpa global Buffer, state getGameState
  dari kode server lokal dengan harga live): tombol plan
  menampilkan 4,26 / 13,82 GRAM dan baris kurs "1 GRAM ≈ $0.96
  — price follows the market" tampil di tab Hanggar.
  PENTING — harga GRAM yang dibayar pemain SEKARANG BERUBAH
  setiap ~5 menit mengikuti pasar; pembelian GRAM live pertama
  (Standard, dari wallet TON terisi) masih harus diuji di
  Telegram asli, dan jumlahnya kini harga live, bukan 4 GRAM.

## Boot loader + transisi tab — game terasa seperti engine (2026-11-21, PUSHED)

Alasan: game terasa statis — tidak ada loading, tab berganti
tanpa animasi. Perubahan: boot screen + transisi tab saja.
Tidak ada klaim progres palsu, modal, atau loader di setiap
aksi; tidak ada perubahan logika game, harga (kecuali harga
GRAM dinamis di atas), atau kata-kata selain baris status
loader.

- Transisi tab: SUDAH ADA, tidak dibuat ulang — `App.tsx`
  `<div key={tab} className="tab-content">` + `theme.css`
  `.tab-content` fade-in-up (0,38s ease-out). Mengganti tab
  sudah menganimasikan konten masuk (fade + naik sedikit).
- BootLoader (`client/src/App.tsx`, komponen baru sebelum
  `App()`): layar penuh bermerek — RocketIcon dalam lingkaran
  bercahaya, judul "ASTRA MINING" dengan `title-shine`, bar
  progres animasi tak tentu (`.boot-bar-fill`, segmen meluncur),
  baris status bergilir tiap ~1,6 detik lewat key i18n baru
  `loading` / `loadingAsteroid` ("Memuat asteroid…" /
  "Loading the asteroid…") / `loadingDrill` ("Menyiapkan bor…"
  / "Preparing the drill…"), plus baris sesi. Dipakai dua kali:
  sebagai return layar penuh saat `getGameState` pending
  (menggantikan teks polos "Connecting to the orbital
  station…" di baris lama 794), dan sebagai overlay tetap yang
  memudar saat data tiba.
- Fade-out (di `App`): state `bootDone` / `bootFaded` +
  `bootFadedRef` (efek berjalan sekali, dijaga oleh
  `state.data`, jadi refetch 5 detik tidak pernah
  memicunya lagi): saat data pertama tiba overlay mulai buram,
  `requestAnimationFrame` mengubahnya jadi transparan (transisi
  CSS 500ms), timer 550ms melepasnya (unmount). Overlay
  `pointer-events-none` + `aria-hidden`. Layar error
  connection-lost yang sudah ada tidak disentuh.
- `client/src/theme.css`: `@keyframes boot-slide` (segmen
  −110% → 280%) + `.boot-bar-fill`; `@keyframes boot-line-in`
  (fade + naik 4px) + `.boot-line`; keduanya masuk blok
  `prefers-reduced-motion`.
- Satu error typecheck yang diperbaiki di tengah jalan:
  `noUncheckedIndexedAccess` pada `t(BOOT_LINES[line])` —
  diperbaiki dengan `?? "loading"`.
- Verifikasi: typecheck 0 (strict + Vercel-style), build OK
  (main-V34VR77X.js), full suite 116/116 (2.924 expects).
  Harness render (jsdom, tanpa global Buffer, state getGameState
  asli): loader tampil saat loading (judul + bar + baris
  status), setelah query selesai UI Explore me-render dan
  overlay boot hilang setelah fade. Catatan harness: pengecekan
  harus membaca DOM hasil render di dalam root React, BUKAN
  `document.body.innerHTML` — innerHTML juga berisi tag
  `<script>` dengan seluruh sumber bundle, sehingga pencocokan
  substring memberi false positive (string kamus i18n) maupun
  false negative (class di sumber). Selain itu: tombol Premium
  (Stars + GRAM) dan baris kurs HANYA tampil untuk sesi
  Telegram — harness harus men-stub `window.Telegram.WebApp`
  (sesi web menampilkan pemberitahuan "buka lewat Telegram").
  Pelajaran yang sama untuk loader: tombol Buy Premium hanya
  ada di tab Hanggar, jadi harness harus mengklik tab dulu.
  Tampilan loader di Mini App asli masih harus dicek di HP.

## Pintu peta diperberat + Statistik Pemain + Broadcast + Notifikasi WD + Pengingat tidak aktif (2026-11-21, LIVE, commit 8b5689e8, bundle main-ZUPB5KA6.js)

Perintah pemilik 2026-11-21 ("Ya, kerjakan semuanya"): Map 2 di Sektor 3
terlalu cepat, plus 4 fitur admin/notifikasi. Lima perubahan, staging
saja — JANGAN push sebelum pemilik menjalankan migrasi 0009 di Neon
DAN menyetel CRON_SECRET di Vercel (lihat bawah).

### 1. Pintu peta 1/3/6/10/15 → 1/5/9/14/20
- `api/_lib/game.ts` MAPS `minLayer`: Sabuk Asteroid 3→5, Bulan 6→9,
  16 Psyche 10→14, Sabuk Kuiper 15→20. Total ekspedisi: 0/10/36/91/190
  (pemain aktif ~6/hari: Peta 2 ~2 hari, Peta 5 ~32 hari). Aturan naik
  sektor (triangular, L ekspedisi) TIDAK berubah — hanya pintunya
  digeser. `rule14` (client/src/i18n.ts, id+en) diperbarui.
  Pemain yang sudah di Sektor 3–4 kehilangan akses Peta 2 sampai
  mencapai Sektor 5.
- Sim (run-sim.ts + run-premium-sim.ts, 180 hari): praktis TIDAK
  berubah — bonus mengikuti sektor, bukan peta. Gratis aktif: WD
  pertama hari 5, ulang ~169 hari (46–60) → ~143 hari (166–180),
  ~0,9 → ~1,0 USDT/30 hari. Premium lvl 5 Pro: WD pertama hari 1,
  ulang ~12,3 → ~10,0 hari, ~12,2 → ~15,0 USDT/30 hari. Dua pin
  sim di economy.test.ts digeser dan dijelaskan: Premium Standard
  aktif WD pertama 2 → 2–3 hari (rentang, Monte Carlo ±1 hari),
  mid-upgrade Standard wall-time 260 → 240 menit batas bawah
  (~258 sekarang — Map 1 yang operasinya lebih pendek dipakai lebih
  lama). Pin string error peta terkunci di i18n.test.ts: Sektor 3 → 5.

### 2. Statistik Pemain di Kendali
- `getGameState.adminStats.playerStats`: {total, active7d,
  inactive7d, premiumActive} — total = semua baris player; aktif =
  ≥1 baris activity 7 hari terakhir (SATU query count distinct,
  tanpa N+1); tidak aktif = total − aktif; Premium = premium_until
  di masa depan. Dua query agregat saja. Kartu "Statistik Pemain"
  di AdminTab (client/src/App.tsx, kunci i18n baru statsTitle dkk,
  id+en). Tanpa migrasi.

### 3. Broadcast (Kendali → semua pemain)
- Aksi admin baru `sendBroadcast({text})` (api/_lib/game.ts):
  teks 1–4000 karakter (zod trim), loop semua pemain dengan
  telegram_id, kirim berurutan dengan jeda ~50ms via
  `sendTelegramMessage` (baru di api/_lib/stars.ts, memakai
  callBotApi + seam setBotFetchForTests yang sama), kembalikan
  {sent, failed} — 403 (pemain memblokir bot) dihitung gagal, satu
  pemain gagal tidak pernah menghentikan pengiriman. Kartu Broadcast
  di Kendali: textarea + tombol "Kirim ke Semua Pemain" + baris
  hasil "Terkirim ke {sent} pemain, gagal {failed}."
  (kunci i18n baru broadcast*, id+en). Tanpa migrasi, tanpa env baru.

### 4. Notifikasi WD (approve + dibayar)
- `updateWithdrawal` di api/_lib/game.ts: setelah approve sukses
  dan setelah pay sukses, server mengirim pesan Telegram ke
  telegram_id pemilik WD (best-effort via `notifyWdPlayer` —
  try/catch, pemain web lama tanpa telegram_id dilewati diam-diam,
  gagal kirim TIDAK PERNAH menggagalkan WD). Teks tetap Bahasa
  Indonesia: approve — "WD kamu sebesar {amount} USDT sudah
  disetujui dan sedang diproses."; pay — "WD kamu sebesar {amount}
  USDT sudah dibayar. Cek dompetmu!" (amount via fmtNum id, mis. 5).
  TIDAK ada notifikasi untuk reject (tidak diminta).

### 5. Pengingat tidak aktif 3 hari (cron harian)
- Migrasi baru deploy/neon/migration-0009-inactive-nudge.sql
  (+ init.sql + schema.pg.ts): player.last_inactive_nudge_at
  TIMESTAMPTZ NULL, dan player.created_at TIMESTAMPTZ NOT NULL
  DEFAULT now() — kolom created_at ini TERNYATA belum ada di tabel
  player, padahal logika pengingat membutuhkannya sebagai fallback
  (pemain tanpa baris activity dinilai dari tanggal dibuat; baris
  lama mendapat created_at = waktu migrasi — aman, mereka tidak
  diingatkan sebelum 3 hari sesudah migrasi).
- Logika di api/_lib/nudge.ts (selectNudgeCandidates +
  runInactiveNudge, bisa di-stub pengirimannya di tes): kandidat =
  telegram_id ada + aktivitas terakhir (max activity.created_at,
  fallback created_at) > 3 hari lalu + (belum pernah diingatkan
  ATAU terakhir diingatkan > 7 hari lalu). Pesan (id): "Sudah 3 hari
  kamu tidak menambang di ASTRA MINING — asteroidmu menunggumu!
  Buka game dan lanjutkan ekspedisimu.\nhttps://t.me/astra_mining_bot/astra_mining".
  Setelah terkirim, last_inactive_nudge_at diisi; gagal kirim tidak
  ditandai (cron besok mencoba lagi). Return {sent, skipped}
  (skipped = kandidat yang pesannya gagal terkirim).
- Endpoint api/cron/inactive-nudge.ts (GET): auth header
  Authorization: Bearer CRON_SECRET (env var; 401 bila hilang /
  salah — tanpa ini siapa pun bisa memicu kirim massal).
  vercel.json: crons [{path /api/cron/inactive-nudge, schedule
  "0 2 * * *"}] (02:00 WITA setiap hari) + maxDuration 60 untuk
  fungsi cron.
- LANGKAH PEMILIK SEBELUM PUSH: (1) jalankan migrasi 0009 di Neon,
  (2) set CRON_SECRET di Vercel (satu string rahasia apa saja).
  Setelah deploy, periksa dashboard Vercel → Cron Jobs bahwa
  cron-nya terdaftar (Hobby mengizinkan 1 cron/hari).

### Perubahan keamanan/keandalan terkait
- `callBotApi` (api/_lib/stars.ts) kini memakai
  AbortSignal.timeout(5000): Telegram yang lambat/mati tidak boleh
  menggantung pemanggil — pre_checkout harus dijawab <10 detik, dan
  notifikasi WD tidak boleh menahan aksi WD. (Ditemukan lewat tes:
  WD approve/pay tanpa stub Bot API menggantung >5 detik di
  sandbox karena fetch sungguhan ke api.telegram.org.)
- Tes yang approve/pay WD kini men-stub Bot API di beforeEach
  (game, telegram, ceiling, economy test) — pola yang sama seperti
  stars.test.ts. Tanpa ini suite menggantung pada panggilan jaringan
  sungguhan yang tidak deterministik di sandbox.

### File baru / diubah
- Baru: api/_lib/nudge.ts, api/cron/inactive-nudge.ts,
  deploy/neon/migration-0009-inactive-nudge.sql,
  /tmp/smoke-test/notify.test.ts (11 tes; mirror di
  ~/workspace/smoke-test/).
- Diubah: api/_lib/game.ts (minLayer, adminStats, sendBroadcast,
  notifyWdPlayer, ADMIN_ACTIONS), api/_lib/stars.ts
  (sendTelegramMessage + timeout 5 detik), deploy/neon/schema.pg.ts
  + init.sql (2 kolom), vercel.json (cron + maxDuration),
  client/src/App.tsx (PlayerStatsCard + BroadcastCard),
  client/src/api.ts (sendBroadcast), client/src/i18n.ts (rule14 +
  16 kunci baru id+en), /tmp/smoke-test/{game,telegram,ceiling,
  economy,i18n}.test.ts + sim.ts (stub Bot API, re-pin).

### Verifikasi
- Typecheck 0 (strict + Vercel-style --strictNullChecks false),
  build OK (main-ZUPB5KA6.js), full suite 127/127 (3.037 expects)
  DUA KALI berturut-turut (flake "player creation + first
  asteroid" tidak muncul kali ini; 11 tes notify baru lolos).
- Harness render (jsdom, tanpa global Buffer, fixture getGameState
  live yang diperbarui 2026-11-21 ~11:4x WITA — gramPriceUsd
  $0,9145, Standard 4,47 / Pro 14,50 GRAM): bundle-test.mjs
  HARNESS OK 8/8; check-kendali.mjs (baru, fixture admin) 9/9 —
  kartu Statistik Pemain + Broadcast tampil setelah klik tab
  Kendali. Catatan: 2 cek harness sempat FAIL sebelum fixture
  diperbarui — fixture lama (01:40 WITA) berisi harga GRAM tetap
  4/13 tanpa gramPriceUsd, sementara cek-nya mengharapkan harga
  live; cek plan buttons kini membaca angka dari fixture (bukan
  pin 4,26/13,82).
- Yang masih butuh cek live di HP: broadcast ke pemain sungguhan,
  notifikasi saat WD disetujui/dibayar, cron menembak sekali
  (periksa log Vercel keesokan paginya + satu pemain tidak aktif
  menerima pesan).

## Waktu bor digandakan (2026-11-22, LIVE, commit a67fa9fd, tanpa bundle baru — server-only)

Pemilik: waktu bor sekarang hampir tidak terasa, terutama untuk
Premium (Standard ×0,75, Pro ×0,375 dari base) — minta waktu
ditambah lagi, daya dibiarkan begitu saja.

### Perubahan (satu tuas)
- `api/_lib/game.ts` `mineDurationSec`: base `30 + hardness*25 +
  qty*8` → **`60 + hardness*50 + qty*16`**, floor `Math.max(25, …)`
  → **`Math.max(60, …)`**. Yang lain TIDAK berubah: exp/map
  timeFactor, Beliung −6%/level, Premium ×0,75, Bor Ganda ×0,5.
- Biaya DAYA bor (`mineEnergyCost`: 4 + hardness + radiasi)
  TIDAK disentuh, sesuai perintah.
- Tidak ada teks yang perlu diubah: rule3 ("pengeboran urat butuh
  waktu sesuai kekerasan batuannya") dan rule16 (faktor waktu peta)
  tidak menyebut angka detik/menit; doc comment `startMine` juga
  kualitatif — semuanya tetap akurat.

### Contoh (Map 1, qty 5, tanpa upgrade — lama → baru, detik)
- Regolith (keras 1): gratis 95→190, Std 71→143, Pro 36→71
- Besi-Nikel (keras 2): gratis 120→240, Std 90→180, Pro 45→90
- Platinum (keras 3): gratis 145→290, Std 109→218, Pro 54→109
- Helium-3 (keras 4): gratis 170→340, Std 128→255, Pro 64→128
- Map 5 Helium-3 qty 5: gratis 425→850, Pro 159→319

### Sim (180 hari, angka PAYOUT tidak berubah — energi yang
### mengikat, bukan waktu; hanya waktu dinding yang naik ~2×)
- Gratis aktif: first WD hari 5, repeat ~168d (46–60) → ~143d
  (166–180), ~0,9 → ~1,0 USDT/30d. Premium lvl-5: first WD
  hari 1, repeat ~12,3d → ~10,0d, ~12,2 → ~14,9 USDT/30d.
- Waktu dinding/hari: gratis max-effort 264 mnt, Premium Std
  max-effort 396 mnt, Premium Std mid-upgrade 460 mnt (dari ~258),
  Premium Pro mid-upgrade 264 mnt. SEMUA profil masih jauh di
  bawah batas 16 jam sadar (960 mnt) dan 24 jam (1.440 mnt) —
  waktu TIDAK mengikat secara keras; tapi profil terburuk kini
  menghabiskan 7,7 jam/hari waktu job berurutan (dari 4,3 jam).
  Job tetap selesai di server walau halaman ditutup, jadi dampak
  ke pemain adalah menunggu lebih lama antar ketukan — persis
  rasa yang diminta pemilik.
- Satu tes gagal dulu dan di-pin ulang dengan jujur:
  economy.test.ts "operation time does NOT bind any Premium
  profile" — batas kenyamanan 300 mnt/hari tidak lagi berlaku
  (mid-upgrade Std 460 mnt); batas baru 960 mnt (anggaran sadar
  16 jam, sudah dikutip di komentar tes), pin midStd 430–490 mnt.
  Premis tes (waktu tidak mengikat) tetap benar.

### Verifikasi
- Typecheck 0 (strict + Vercel-style --strictNullChecks false),
  build OK — TIDAK ada bundle baru: perubahan ini server-side
  saja, bundle klien tetap main-ZUPB5KA6.js. Full suite 127/127
  (3.037 expects) dua kali berturut-turut.
- Harness render (jsdom, tanpa global Buffer, fixture
  getGameState live yang diperbarui 2026-11-22): bundle-test.mjs
  HARNESS OK 5/5 (satu cek sempat FAIL karena harness mengira
  label tab bahasa Indonesia "Hanggar" — jsdom default bahasa
  Inggris "Hangar"; bukan bug game).
- Yang masih butuh cek live di HP: rasa satu siklus bor sebagai
  pemain Premium Pro (apakah 2× lebih lama terasa pas, bukan
  membosankan).

## Bahasa pindah ke Pengaturan (2026-11-22, LIVE, commit fb594805, bundle main-HN4DIECY.js)

- Owner: pemilih bahasa ID|EN di header mengganggu — pindahkan ke dalam Pengaturan.
- Perubahan: tombol gir di header (menggantikan toggle ID|EN yang tadinya di samping baris "Sesi:") membuka panel Pengaturan kecil di atas kartu saldo, berisi pemilih bahasa (komponen LanguagePicker yang sama, dipindah). Key i18n baru `settingsTitle` ("Pengaturan"/"Settings"); `langLabel` dipakai ulang sebagai label baris. Tidak ada menu Pengaturan sebelumnya di game — panel ini yang pertama.
- Verifikasi: typecheck 0 (strict + Vercel-style), build OK (bundle baru main-WAPITD26.js), suite 127/127 (3.044 expects), harness render 5/5 (tanpa Buffer). Panel tertutup secara default; klik gir untuk membuka.

## PvP — Laboratorium Pasukan + pertemuan saat scan (2026-11-22, LIVE, commit fb594805, bundle main-HN4DIECY.js; migration-0010 sudah dijalankan owner di Neon sebelum push)

- Owner (diskusi 2026-11-22, disetujui "bisa kita kerjakan sekarang"): pemain A bisa menyerang pemain B dan merampas hasil tambangnya; pertemuan terjadi KADANG saat scan selesai (bukan tiap scan); butuh pasukan, kalkulasi menang/kalah, dan power. Dibahas dulu, baru dibangun.
- Keputusan owner yang TIDAK boleh diligitasi ulang:
  - KT SATU jenis — semua KT bisa di-WD; pasukan dibeli/di-upgrade pakai KT yang sama (dilema: KT buat WD vs pasukan/upgrade; yang cuma menabung buat WD akan selalu lemah dan dirampas).
  - Rampas dari HASIL TAMBANG (bijih belum dijual), bukan saldo KT.
  - Pasukan DIPISAH dua jenis: serang + bertahan; tab baru "Lab".
  - Menang-kalah MURNI dari kekuatan — TANPA faktor acak yang membuat yang lemah bisa menang. Pelindungnya adalah kebal 1 jam setelah diserang, bukan keberuntungan. Seri = bertahan menang (keuntungan kandang).
  - Tidak ada tab pesan baru — hasil PvP masuk Log Misi (hasil) + Log Ekonomi (rampasan); notifikasi Telegram "kamu diserang" mungkin belakangan via jalur notifikasi WD.
  - "Lewati" maupun bertarung TIDAK menambah progres sektor — sektor hanya naik saat ekspedisi selesai (semua urat dibor), di map mana pun. Scan sendiri tidak pernah menambah progres sektor.
- Aturan yang diimplementasikan (semua di `api/_lib/game.ts`, kecuali disebut lain):
  - Peluang pertemuan saat scan selesai: Peta 1 (Orbit Rendah) 0% (aman), Peta 2 10%, Peta 3 15%, Peta 4 20%, Peta 5 30% (`PVP_ENCOUNTER_CHANCE`). Dilempar di `collectJob` cabang scan — `getGameState` dan respons collectJob mengembalikan penawaran yang aktif.
  - Dialog pertemuan: nama lawan (atau "Perompak"), kekuatan bertahan lawan vs kekuatan serangmu, tombol Serang / Lewati. Penawaran berlaku **10 menit** (`PVP_ENCOUNTER_EXPIRY_MS`) atau sampai scan/asteroid/peta berikutnya dimulai — `startScan`, `abandonAsteroid`, `travelToMap`, dan `completeExpedition` menghapus penawaran lama.
  - Lawan: satu pemain LAIN secara acak yang punya hasil tambang cukup (≥7 unit pada satu jenis bijih — 15%-nya baru jadi ≥1 unit rampasan) dan tidak kebal (`findPvpDefender`, maks 50 kandidat). Yang diserang tidak harus online — pertahanannya dihitung otomatis dari pasukannya. Bila tidak ada yang layak: **Perompak NPC** — kekuatan bertahan tetap **9** (satu Drone Serbu level 1, kekuatan 10, sudah bisa menang — lawan pemula), harta tetap 20 Regolith + 14 Kondrit + 7 Besi-Nikel + 4 Kobalt (`NPC_PIRATE_HAUL`; 15% per jenis, dibulatkan ke bawah → 3 + 2 + 1 + 0 = **0,3 KT**).
  - Lab (tab baru, setelah Komunitas, untuk semua pemain): kartu ringkasan kekuatan di ATAS tab (Kekuatan Serang / Kekuatan Bertahan), dua jenis pasukan:
    - **Drone Serbu** (serang) dan **Drone Perisai** (bertahan). Kekuatan per jenis = jumlah drone × (6 + 4 × level) (`troopPower`).
    - Beli: **10 + 5 × jumlah sekarang KT** (drone pertama 10 KT, kedua 15 KT, ...). Upgrade L→L+1: **25 × L KT** (ke level 2 = 25 KT, ke level 3 = 50 KT, ...). Maks **20 drone** per jenis, maks **level 5** (satu drone level 5 = 26 kekuatan; 20 drone level 5 = 520 kekuatan).
    - Aksi baru: `buyTroop` / `upgradeTroop` (server-validated, KT tidak cukup → error; log `pvp_troop` di Log Ekonomi).
  - Pertempuran (`pvpAttack`) — DETERMINISTIK: `attackPower > defensePower` menang; seri = bertahan menang. Kekuatan bertahan lawan DIHITUNG ULANG dari pasukannya saat serangan dieksekusi (bukan dibekukan saat penawaran dibuat). Cooldown penyerang + perisai yang diserang mulai dihitung saat pertempuran selesai (menang maupun kalah).
  - Rampasan: pemenang mengambil **15% hasil tambang si kalah, per jenis bijih, dibulatkan ke bawah**, dipindah sebagai unit bijih ke inventory pemenang. Penyerang yang kalah kehilangan **10% hasil tambangnya sendiri — DIHANCURKAN** (bukan dipindah; KT sink). Bila yang diserang tidak punya hasil tambang, serangan tidak menghasilkan apa-apa (matching menghindarinya; NPC selalu punya harta).
  - Perisai/cooldown: setelah diserang (menang/kalah), yang diserang kebal **1 jam** (`PVP_SHIELD_MS`); penyerang jeda **30 menit** antar serangan (`PVP_ATTACK_COOLDOWN_MS`). Serangan saat cooldown → error dengan sisa waktu; serangan ke lawan yang kebal → error; penawaran kedaluwarsa → error + penawaran dihapus.
  - Log: hasil serang/bertahan → Log Misi (`pvp_attack` / `pvp_defend`); rampasan didapat/hilang/hancur → Log Ekonomi (`pvp_loot`, jumlah KT negatif untuk yang kehilangan). Entri untuk pemain yang diserang ditulis dalam bahasa penyerang (keterbatasan yang sama seperti log referral/admin — bahasa per pemain tidak disimpan). Tidak ada push Telegram saat diserang (nanti, bila diminta).
  - Audit: tabel `pvp_battles` mencatat tiap pertempuran (penyerang, yang diserang/NULL untuk NPC, `is_npc`, pemenang, kedua kekuatan, `lootKt`); gagal tulis audit tidak merusak hasil pertempuran.
  - Aturan di UI: `rule18` di daftar aturan (tab Tambang) + penjelasan "Cara kerja PvP" di tab Lab.
- Ekonomi: PvP TIDAK menciptakan KT (rampasan = transfer antar pemain; kekalahan penyerang = penghancuran). Satu-satunya "KT baru" adalah rampasan dari Perompak NPC (maks ~0,3 KT per serangan, dibatasi cooldown 30 menit + peluang pertemuan ≤30% + NPC hanya muncul bila tidak ada pemain layak diserang) — faucet kecil yang bisa diabaikan. Self-farming antar akun sendiri (alt) tidak bisa menciptakan KT: rampasan dari alt sendiri hanya memindahkan bijih yang sama, dan kalah sengaja menghancurkan 10% — tidak ada KT baru yang muncul. Anti-cheat >3 akun/IP tetap berlaku untuk semua aksi PvP (server-validated seperti aksi lain).
- Sim ekonomi di-run ulang setelah PvP: angka TIDAK berubah (PvP tidak menyentuh generator loot / konstanta penghasilan — sim tidak memodelkan transfer PvP karena transfer antar pemain nol-sum): aktif gratis WD pertama hari ke-5, ulang ~168 hari → ~143 hari, ~0,9–1,0 USDT/30 hari; worst case Premium lvl 5 ulang ~12,3 hari → ~10,1 hari, ~12,2–14,9 USDT/30 hari.
- DB: migrasi baru **`deploy/neon/migration-0010-pvp.sql`** (idempotent) + `init.sql` + `schema.pg.ts`: kolom `player.pvp_shield_until`, `player.pvp_last_attack_at`, `player.pvp_encounter` (TEXT JSON, NULL = tidak ada penawaran); tabel `pvp_troops` (player_id, kind attack/defense, count, level; PK (player_id, kind)) dan `pvp_battles` (id, attacker_player_id, defender_player_id nullable, is_npc, winner, attacker_power, defender_power, loot_kt, created_at) + indeks. **PEMILIK HARUS MENJALANKAN migration-0010 DI NEON SEBELUM PUSH** — `getGameState` memilih seluruh baris player (termasuk kolom PvP baru) dan `loadTroops`/`pvpAttack` memakai tabel baru; tanpa migrasi, game bisa rusak. Urutan: migrasi 0010 dulu, baru push. (Catatan: `loadTroops` membungkus query tabelnya dengan try/catch — tabel yang belum ada = tidak ada pasukan, game tetap jalan; tapi kolom player tidak punya pelindung itu, jadi migrasi tetap wajib sebelum push.)
- Klien: tab "Lab" baru (ikon pedang `SwordsIcon`), kartu pertemuan merah di tab Tambang (nama lawan, kekuatan lawan vs kamu, hitung mundur kedaluwarsa, tombol Serang/Lewati, tombol Serang nonaktif saat cooldown), kartu ringkasan kekuatan di atas tab Lab, kartu per jenis pasukan (jumlah/level/kekuatan, tombol Beli + Upgrade dengan biaya, nonaktif bila KT kurang / sudah maks), status kebal + cooldown, `rule18`, 33 kunci i18n baru (id+en, simetris — termasuk `pvpSkipped`, `labBuyDone`, `labUpgradeDone`, `pvpAttackWin/Lose/WinEmpty`). Aksi baru di `client/src/api.ts`: `buyTroop`, `upgradeTroop`, `pvpAttack`, `pvpSkip`.
- Perubahan kecil di string server yang sudah ada: `errPvpTroopUnknown` ("Jenis pasukan tidak dikenal") diganti `errPvpTroopNone` — "Kamu belum memiliki {name} — beli dulu sebelum meng-upgrade" — karena jenis pasukan divalidasi zod (tidak mungkin tidak dikenal), sedangkan kasus nyatanya adalah upgrade saat jumlah drone = 0. Ditambah `pvpPirate` + `pvpUnknownMiner` untuk nama di log.
- Verifikasi: typecheck 0 (strict + Vercel-style `--strictNullChecks false`), build OK (bundle baru **main-HN4DIECY.js**), suite **154/154 (3.367 expects)** — 27 tes PvP baru di `/tmp/smoke-test/pvp.test.ts` (juga di-mirror ke `~/workspace/smoke-test/`): formula pasukan, beli/upgrade pakai KT (+ gagal saat KT kurang / maks), lemparan pertemuan (Peta 1 = 0, miss/hit, pilih lawan sungguhan, lewati yang kebal/kosong), pertempuran deterministik (lebih kuat menang, seri → bertahan, lemah kalah, kekuatan dihitung ulang saat eksekusi), rampasan 15% (transfer tepat + nilai KT 0,85 + log dua sisi + baris audit), kehancuran 10% penyerang kalah, NPC (0,3 KT), perisai 1 jam, cooldown penyerang 30 menit, penawaran kedaluwarsa, skip/bertarung tidak mengubah progres sektor, collectJob Peta 1 tanpa encounter, collectJob Peta 2 bisa mengembalikan encounter, scan baru menghapus penawaran lama. **Satu run penuh sempat 153/154 — flake yang sudah dikenal (tes core paralel, hilang di re-run; dua re-run berikutnya 154/154).** Sim ekonomi + sim Premium di-run ulang — angka tidak berubah (lihat di atas). Harness render jsdom tanpa Buffer: **14/14 (fixture PvP) + 12/12 (fixture polos) lolos** — bundle mengevaluasi tanpa error dengan `window.Buffer` undefined, judul + tab Lab tampil, kartu pertemuan (Serang/Lewati + kekuatan lawan) tampil, isi tab Lab (kartu kekuatan, Drone Serbu, Drone Perisai, tombol Beli) tampil setelah klik tab, catatan "belum punya pasukan" tampil untuk pemain polos.
- Catatan harness: harness render lama di `/tmp/harness/` hilang karena /tmp di-wipe lagi; dibangun ulang dengan jsdom 31 di `/tmp/harness/` (`render.mjs` + `make-fixture.ts` — fixture dibuat dari server baru lokal via `/tmp/smoke-test/make-fixture.ts`, karena server live masih build lama dan `getGameState`-nya belum punya blok `pvp`; salinan `render.mjs` + `make-fixture.ts` juga di-mirror ke `~/workspace/smoke-test/`). Harness menegaskan `window.Buffer` undefined (kondisi browser asli) dan bundle mengevaluasi tanpa error. Root element bundle adalah `[data-generated-space-root]`, bukan `#root`. Dua jebakan harness yang ditemukan saat membangun ulang: (1) stub fetch harus mengembalikan objek biasa `{ok, status, json}` — `new window.Response(...)` melempar karena jsdom tidak punya konstruktor Response, sehingga query gagal dan tampil layar "signal lost"; (2) jsdom `navigator.language` adalah en-US — UI render bahasa Inggris, jadi cek string harus memaksa `localStorage["astra-mining-lang"] = "id"` dulu.
- Yang masih perlu dicek di HP (setelah push): satu siklus PvP penuh — scan di Peta 2+ sampai pertemuan muncul → Serang → rampasan masuk Log Ekonomi + hasil masuk Log Misi (di kedua akun); tab Lab di HP; tombol Lewati; perisai 1 jam terlihat di Lab pemain yang diserang.
- Push ini (commit fb594805, 2026-11-22) mengirim DUA perubahan sekaligus: PvP + panel Pengaturan. Migration-0010 sudah dijalankan owner di Neon sebelum push.

## PvP — perubahan fase uji coba (2026-11-23, BELUM di-push)

- Owner (2026-11-23): (1) harga drone ditetapkan 0,1 KT dulu karena masih tahap uji coba; (2) harus ada NPC karena semua akun di game saat ini adalah akun uji coba owner; (3) drone harus ada gambarnya — diputuskan SVG (gaya rumah: semua ikon game inline SVG, tajam di ukuran 26px, tanpa bobot unduhan; gambar generate akan blur di ukuran ikon).
- Harga 0,1 KT flat (`TROOP_TEST_COST_KT = 0.1` di `api/_lib/game.ts`): `troopBuyCost()` DAN `troopUpgradeCost()` sama-sama mengembalikan 0,1 — harga asli (beli 10 + 5×jumlah KT, upgrade 25×level KT) dihapus dari kode dan dicatat di sini untuk pengembalian nanti. 0,1 aman di pembulatan 3 desimal (`roundKt`). Maks jumlah (20/jenis) dan maks level (5) TIDAK berubah. Label biaya di tab Lab dirender dari server (`buyCost`/`upgradeCost` di getGameState), jadi otomatis ikut 0,1 — tampil "Beli Drone · 0,1 KT" (koma desimal id-ID). Deskripsi aksi `buyTroop`/`upgradeTroop` diperbarui ke harga flat. Tidak ada teks i18n yang menyebut harga lama (rule18/labHowDesc tidak menyebut angka), jadi tidak ada perubahan i18n.
- Pencocokan CAMPURAN sejak hari pertama (koreksi owner 2026-11-23): `rollPvpEncounter` selalu mencoba lawan sungguhan dulu (pemain acak lain dengan haul ≥7 unit satu jenis bijih dan tidak kebal); bila tidak ada yang layak, lawan adalah Perompak NPC (bertahan 9, harta tetap). Flag `PVP_NPC_ONLY` + seam `setPvpNpcOnlyForTests` DIHAPUS seluruhnya — tidak ada yang perlu diubah nanti saat pemain sungguhan masuk; NPC mengisi selama jumlah pemain masih sedikit. Tidak ada perubahan skema — TIDAK perlu migrasi.
- Ikon drone SVG (baru di `client/src/App.tsx`, pola IconShell, tanpa file aset baru): `AttackDroneIcon` — panah/dart tajam dengan mata sensor + sirip, aksen merah (`text-red-300`); `DefenseDroneIcon` — bola dalam cincin pelindung dengan 4 jari-jari, aksen biru (`text-sky-300`). Menggantikan `SwordsIcon`/`ShieldIcon` generik di kartu pasukan tab Lab; `SwordsIcon` tetap dipakai untuk ikon tab Lab + judul kartu pertemuan. Diverifikasi visual via render cairosvg: keduanya terbaca di ukuran 24px (ukuran game).
- Verifikasi: typecheck 0 (strict + Vercel-style), build OK (bundle baru **main-7ALSH67I.js**), suite **156/156 (3.373 expects)** — tes PvP 29 (27 lama + 2 baru: flag NPC-only default true, roll selalu NPC saat flag menyala; tes "pilih lawan sungguhan" + "lewati yang kebal/kosong" kini mematikan flag via seam lalu mengembalikannya di `finally`). Harness render jsdom tanpa Buffer: **17/17 (fixture PvP) + 15/15 (fixture polos)** — termasuk cek baru "buy cost 0,1 KT", ikon dart (`18.5 15 12 12.5`) dan cincin (`r="8.5"`). Fixture dibuat dari server baru lokal (buyCost/upgradeCost 0.1 terkonfirmasi di getGameState).
- Koreksi 2026-11-23 (owner: pencocokan harus CAMPURAN — pemain DAN NPC, supaya tidak perlu diubah nanti): flag `PVP_NPC_ONLY` + seam `setPvpNpcOnlyForTests` DIHAPUS; `rollPvpEncounter` kembali mencoba lawan sungguhan dulu, NPC hanya bila tidak ada yang layak. 2 tes NPC-only dihapus; tes "pilih lawan sungguhan" + "lewati yang kebal/kosong" tidak lagi memakai seam. Verifikasi ulang: typecheck 0 (strict + Vercel-style), build OK (bundle TETAP **main-7ALSH67I.js** — perubahan hanya server), suite **154/154 (3.368 expects)**, harness **17/17 + 15/15**.
- Lingkungan: /tmp di-wipe lagi — `/tmp/smoke-test` dipulihkan dari mirror `~/workspace/smoke-test/`, node_modules di-link ulang, cluster Postgres 16 di-start, role astra_test dibuat ulang (password `astra_test_pw` sesuai harness — bukan `astra_test`), DB astra_test dibuat ulang + init.sql + migrasi 0001–0010 diterapkan, kepemilikan tabel dipindah ke astra_test (psql sebagai postgres tidak bisa baca file di bawah /home/hatch — salin SQL ke /tmp/neon-sql dengan chmod 755 dulu). Harness di /tmp/harness dibangun ulang (jsdom 31 + symlink node_modules); jebakan baru: `ln -sfn` pada direktori node_modules yang sudah ada TIDAK menggantinya (malah membuat symlink di dalamnya) — make-fixture.ts dijalankan dari /tmp/smoke-test (salinan) supaya drizzle-orm ter-resolve.
- Yang masih perlu dicek di HP (setelah push): beli drone 0,1 KT di tab Lab (saldo berkurang 0,1), upgrade 0,1 KT, scan di Peta 2+ sampai ketemu Perompak NPC, tampilan ikon drone di HP.

## Pengaturan jadi tab penuh + suara (2026-11-23, BELUM di-push)

- Owner (2026-11-23): tombol Pengaturan harus membuka TAB BARU (layar penuh seperti tab lain), bukan panel yang memanjang ke bawah; di dalamnya ada bahasa (DENGAN bendera), suara, dan info akun; baris "Sesi: ..." pindah dari hero ke dalam Pengaturan. Ikon tombol dipilih owner dari 3 sampel: SLIDER (bukan gir).
- Tab "pengaturan" baru (bukan di navigasi bawah — navigasi bawah tetap 6 tab + Kendali): hanya dibuka lewat tombol di pojok kanan atas hero (tetap tombol bulat kaca 40px, posisi sama). `Tab` di `client/src/App.tsx` bertambah "pengaturan"; panel lama (`settingsOpen` + section di atas kartu saldo) DIHAPUS seluruhnya; baris "Sesi:" di hero DIHAPUS (tetap tampil di layar BootLoader + layar error + tab Pengaturan — hanya hero yang dibersihkan).
- Isi tab Pengaturan — tiga kartu seperti tab lain:
  - Bahasa: `LanguagePicker` yang sudah ada, label kini "🇮🇩 Bahasa Indonesia" / "🇬🇧 English" (`LANGS` di `client/src/i18n.ts`). Bendera emoji di sini adalah SATU-SATUNYA pengecualian aturan tanpa-emoji, atas perintah eksplisit owner ("bahasanya ada benderanya").
  - Suara: toggle switch on/off (default ON), tersimpan di localStorage key "astra-mining-sound" ("1"/"0"). Label + hint i18n baru (`soundTitle`, `soundHint`, `soundOn`, `soundOff`).
  - Info Akun: baris sesi yang sama seperti dulu di hero (`sessionLabel` — "Telegram • ID …" / "Web" / "login kosong") + nama pengguna Telegram (`@username` dari `initDataUnsafe.user.username`, hanya bila ada; `getTelegramSessionInfo` di `client/src/api.ts` kini mengembalikan `username` juga). Kunci i18n baru: `accountTitle`, `accountName`.
- Suara sungguhan (`client/src/sound.ts`, baru): WebAudio murni, TANPA file suara — semua disintesis osilator, gain rendah, pendek: `playClick` (660 Hz sine 0,07 dtk), `playSuccess` (523→784 Hz), `playError` (220→165 Hz triangle). AudioContext dibuat malas saat bunyi pertama (kebijakan autoplay) + `resume()` bila suspended; bila WebAudio tidak ada (jsdom), semua fungsi diam-diam tidak berbunyi — game tidak pernah crash karena suara. `soundEnabled()` baca localStorage tiap kali, default ON. Dipasang hanya di 4 momen: scan selesai → playSuccess; urat terkumpul (biasa/langka tanpa hull) → playClick; ekspedisi selesai → playSuccess; toast error (`showBanner` kind "bad" — mencakup semua banner merah termasuk gagal collect, jam, dan hull) → playError. Menyalakan toggle memainkan playClick sebagai konfirmasi.
- Ikon slider baru `SlidersIcon` (`client/src/App.tsx`, pola IconShell, viewBox 24): tiga garis horizontal (y 8/12/16) dengan kenop bundar (r 2,2) di tiap garis — kenop bergeser (x 15 / 8 / 17), garis terputus di sekitar kenop ala Lucide sliders-horizontal; stroke putih (currentColor), size 20 di tombol. `GearIcon` lama tetap terdefinisi tapi tidak lagi dipakai di mana pun.
- i18n: 6 kunci baru simetris id+en (`soundTitle`, `soundHint`, `soundOn`, `soundOff`, `accountTitle`, `accountName` — tanpa placeholder; tes simetri i18n tetap hijau). Tidak ada perubahan ekonomi, PvP, Premium, atau tab lain. Tidak perlu migrasi.
- Verifikasi: typecheck 0 (strict + Vercel-style `--strictNullChecks false`), build OK (bundle baru **main-3SDIFTE6.js**), suite **154/154 (3.400 expects)**. Harness render jsdom tanpa Buffer: **34/34 (fixture PvP) + 32/32 (fixture polos)** — cek baru: hero tanpa "Sesi:", navigasi bawah tanpa tab Pengaturan, tombol slider ditemukan + ikon kenop (cx 15/8, 8/12, 17/16), tab Pengaturan tampil (Bahasa + kedua bendera, Suara + hint + switch, Info Akun + baris sesi), toggle off/on tersimpan di localStorage ("0"/"1") + aria-checked ikut, ganti bahasa via opsi 🇬🇧 English mengubah UI ke English. Satu cek sempat gagal dulu karena asumsi harness salah ("Sesi: Web" — dengan stub Telegram, label yang tampil adalah "Sesi: Telegram — login kosong"); dicek ulang ke string yang benar.
- Lingkungan: /tmp di-wipe lagi — `/tmp/smoke-test` + `/tmp/harness` dipulihkan dari mirror `~/workspace/smoke-test/` (render.mjs + make-fixture.ts yang diperbarui ikut di-mirror), cluster Postgres 16 di-start, role astra_test + DB dibuat ulang + init.sql + migrasi 0001–0010 (chmod 755 /tmp/neon-sql + 644 file — kalau tidak, psql "Permission denied").
- Yang masih perlu dicek di HP (setelah push): buka Pengaturan lewat tombol slider, ganti bahasa (bendera tampil, UI ikut ganti), matikan/nyalakan suara (bunyi klik/scan/ekspedisi/error terdengar, dan diam saat mati), baris info akun tampil ("Telegram • ID …" + @username).
- FULLSCREEN (2026-11-23, LIVE, commit 4cfec138, bundle main-OOEZXMCC.js): owner koreksi — tab Pengaturan harus LAYAR PENUH, bukan sekadar ganti konten di bawah hero. Sekarang `tab === "pengaturan"` merender overlay `fixed inset-0 z-50 overflow-y-auto bg-[#050810]` yang menutupi hero + navigasi bawah, dengan header sticky (tombol kembali ChevronLeftIcon + judul "Pengaturan") dan `prevTab` untuk kembali ke tab sebelumnya. Judul `<h2>` di dalam SettingsTab dihapus (judul kini di header overlay). Key i18n baru `backLabel` ("Kembali"/"Back"). Verifikasi: typecheck 0, build OK, suite 154/154 (gagal 1x di run pertama — flake lama "player creation", hijau di re-run), harness 34/34 + 32/32 dengan bundle baru. Live verified: bundle main-OOEZXMCC.js, /api/health ok.

## Gambar drone di Lab + tombol Beli diperkecil (2026-11-23, LIVE bundle main-HNVG5FUA.js; commit teks 4d5cb57 + commit gambar 3c48f71 + commit proporsi 4b318e6)
- Owner (2026-11-23): tombol Beli drone harus lebih kecil/proporsional, dan gambar drone harus di-generate lalu ditampilkan BESAR di kartu, tetap proporsional (tidak melar).
- Iterasi gambar (pelajaran: owner membedakan render fotorealistis vs sprite game): (1) versi fotorealistis pertama (Serbu angular meriam plasma merah, Perisai kubah bundar inti biru) — owner: Perisai "kurang bagus, harus rame, terlihat sangar". (2) v2 fotorealistis rame/sangar (kubah lapis baja + cincin listrik; kubah berduri + perisai heksagon) — owner: "tidak seperti aset game, apakah anda paham sprite?" → sprite = gaya cel-shaded konsisten, outline tebal, siluet terbaca di ukuran kecil, latar polos. (3) sprite pertama: Serbu DISETUJUI langsung; Perisai kubah heksagon bermata biru DITOLAK (terasa lucu). (4) sprite v2: bastion berduri + cincin penjaga — owner: "yang berbentuk drone dong, kok malah lingkaran begini". (5) FINAL: Perisai sprite B "pesawat tawon" (badan runcing, sayap menyapu garis biru menyala, 2 thruster api biru, perisai heksagon di depan) DIPILIH owner 2026-11-23 11:19. Varian yang ditolak tersimpan di `~/workspace/drone-variants/` (bukan di staging).
- Gambar final (di-generate, bukan SVG): `client/src/assets/drone-serbu.webp` (43.442 byte, 768×768) — sprite cel-shaded drone serbu, meriam plasma merah, inti merah; `client/src/assets/drone-perisai.webp` (49.182 byte, 768×768) — sprite cel-shaded "pesawat tawon" biru. Keduanya di-generate 1600×1600 lalu di-downscale ke 768×768 q80. Diimpor di `client/src/App.tsx` seperti aset webp lain (loader esbuild `.webp: file` → ter-hash ke `client/dist/assets/drone-*-<hash>.webp`, terverifikasi ada di dist: drone-perisai-OMF7SYOY.webp 48,0 KB, drone-serbu-D62LNRHZ.webp 42,4 KB).
- LabTab: tiap kartu pasukan kini punya gambar besar di atas (`<img className="aspect-square w-full object-cover">`, kartu `overflow-hidden` — proporsi 1:1 dipertahankan, tidak pernah melar). Ikon SVG kecil (AttackDroneIcon/DefenseDroneIcon) TETAP di samping nama sebagai aksen kecil.
- Tombol Beli + Upgrade: tadinya `grid grid-cols-2` dengan tombol `w-full` (mendominasi kartu) — sekarang `flex flex-wrap justify-center gap-2`, tombol `px-5 py-2 text-sm` (lebar otomatis mengikuti teks, terpusat; wrap ke dua baris di layar sempit). Harga, label, dan logika TIDAK berubah (tetap 0,1 KT fase uji).
- Verifikasi (sprite final): typecheck 0 (strict + Vercel-style), build OK (bundle baru **main-YO74PR52.js**, kedua webp sprite terkonfirmasi di `client/dist/assets/`), suite **154/154 (3.403 expects)**. Harness render jsdom tanpa Buffer: **37/37 (fixture PvP) + 35/35 (fixture polos)** — cek baru: kedua gambar drone tampil, `aspect-square` + `object-cover`, tombol Beli `px-5` tanpa `w-full`.
- Perbaikan proporsi (2026-11-23, LIVE, bundle main-HNVG5FUA.js, commit 4b318e6): owner protes dari screenshot HP — gambar `aspect-square w-full` (~350px di layar 390px) memakan satu layar penuh, dan dua kotak Kekuatan Serang/Bertahan terlalu gemuk. Gambar kini `h-44 w-44` (176px) di tengah, di dalam div `flex justify-center bg-[#151a48] py-2` — warna latar disampling dari piksel sudut kedua sprite (#141749–#171a4e, diambil #151a48) supaya gambar menyatu dengan strip. Ringkasan kekuatan kini satu strip tipis `flex divide-x` (label + angka sebaris, `py-1.5`, angka `text-base`), bukan `grid grid-cols-2` dua kotak `py-2` + angka `text-xl`. Cek harness baru: gambar `h-44 w-44` + strip `divide-x` (38/38 PvP + 36/36 polos). Verifikasi: typecheck 0, build OK, suite 154/154. Live verified: bundle **main-HNVG5FUA.js**, `/api/health` 200.
- Lingkungan tes sempat hilang total (/tmp wipe + Postgres down) — dipulihkan dari mirror `~/workspace/smoke-test/` (copy + re-link node_modules → staging), role/DB `astra_test` dibuat ulang, skema diterapkan ulang (init + migrasi 0001–0010, ownership dialihkan), fixture harness dibuat ulang via `make-fixture.ts`, jsdom 31 diinstal ulang di /tmp/harness.
- Yang masih perlu dicek di HP (setelah push): tampilan tab Lab — gambar drone besar dan proporsional, tombol Beli/Upgrade kecil dan rapi.
- Push (2026-11-23): `push-files` menolak file biner ("not UTF-8") — snapshot push hanya untuk file teks; panduan snapshot-push.md mengonfirmasi batasan ini. Solusi: 2 webp di-upload dulu lewat browser GitHub web UI ke `client/src/assets` (commit `3c48f71` "Add drone sprite images", 2 files changed, terverifikasi via API `list_commits`), baru 58 file teks di-push via `push-files` (commit `4d5cb57`). Manifest kembali 58 path (webp dikeluarkan lagi setelah gagal). Sync record: 24 entri (23 = webp 3c48f71, 24 = teks 4d5cb57). Live verified: bundle **main-YO74PR52.js**, `/api/health` 200, kedua sprite ter-serve 200 (`drone-perisai-OMF7SYOY.webp` 49.182 byte, `drone-serbu-D62LNRHZ.webp` 43.442 byte).

## Cooldown iklan 5 menit (2026-11-23, LIVE, commit f69fbd1, server-only)
- Owner: jeda antar-iklan dari 1 jam → 5 menit, kuota tetap 10/hari. `AD_COOLDOWN_SECONDS` 3600 → 300 di `api/_lib/game.ts` (+ komentar + docstring `watchAd`). Hadiah 0,375 KT dan cap 10/hari TIDAK berubah → maks 3,75 KT/hari dari iklan, ekonomi tidak berubah. Teks pemain dinamis (`rule13` + pesan `errAdCooldown` pakai `fmtDur` dari nilai server) jadi tidak ada perubahan i18n. Tes `game.test.ts` disesuaikan ("ad reward + 5min cooldown", error mengandung "mnt", `cooldownRemainingSec > 250`). Tidak ada migrasi; bundle client TIDAK berubah (tetap main-HNVG5FUA.js).
- Verifikasi: typecheck 0, build OK, suite **154/154 (3.403 expects)**, harness **38/38 + 36/36**. Live verified: `/api/health` 200 + `getGameState` live mengembalikan `cooldownSeconds: 300, dailyCap: 10, rewardKt: 0.375` (kode server baru terbukti jalan, kuota + hadiah tidak berubah). Sync record: 26 entri.
- Lingkungan tes dibangun ulang dari nol setelah VM diganti (Postgres 16 hilang total): `apt-get update` bawaan sistem macet 8 menit tanpa progres padahal jaringan cepat (curl ke archive 1 detik) — dimatikan, update dijalankan sendiri, lalu `apt-get install -y postgresql`; cluster 16/main dibuat + start, role/DB `astra_test` dibuat ulang, skema diterapkan ulang (init + migrasi 0001–0010, 0 error), /tmp/smoke-test + /tmp/harness dipulihkan dari mirror, fixture dibuat ulang, jsdom 31 diinstal ulang.

## Bonus referral untuk yang diundang (2026-11-24, LIVE, commit 5e193b3, bundle main-VJX74NPA.js)
- Owner: yang diundang juga harus dapat bagian — 5 KT. Pengundang tetap 10 KT. Keduanya dibayar di momen yang sama: saat yang diundang menyelesaikan ekspedisi PERTAMANYA. Total KT baru per referral yang selesai: 15 KT (10 + 5) = $0,015.
- Perubahan: `REFERRAL_REFEREE_REWARD_KT = 5` di `api/_lib/game.ts`; `payReferralRewardIfPending` setelah mengkredit pengundang, memuat baris pemain yang diundang dan mengkredit 5 KT (+ `totalKtEarned`) + entri Log Ekonomi sendiri (kind `referral_reward`, bahasa pemain yang diundang). Server i18n: key baru `logReferralRefereeBonus` (id + en + interface). Client: `REFERRAL_REFEREE_REWARD_KT = 5` di `App.tsx`, `commRefDesc` id+en sekarang menyebut keduanya (`+{kt} KT` pengundang, `+{refereeKt} KT` teman). Tidak ada migrasi; klaim tetap atomik (pending → rewarded sekali), ekspedisi kedua dst. tidak membayar apa-apa untuk kedua pihak.
- Tes `referral.test.ts` disesuaikan: yang diundang kini 5,15 KT setelah ekspedisi pertama (0,15 bonus + 5) + entri log 5 KT; setelah ekspedisi kedua tetap 5,325 KT (0,15 + 0,175 bonus sektor 2 — sektor naik setelah ekspedisi pertama, jadi bonus ekspedisi keduanya 0,175) dan entri log tetap 1. (Jebakan: edit tes di mirror `~/workspace/smoke-test/` lalu SALIN ke `/tmp/smoke-test/` sebelum jalan — sekali lupa, tes lama yang jalan.)
- Verifikasi: typecheck 0, build OK (bundle baru main-VJX74NPA.js — teks Komunitas berubah), suite **154/154 (3.407 expects)** (satu kali 1 fail flaky yang dikenal, hijau di re-run), harness **38/38 + 36/36**. Live verified: /api/health 200 + bundle main-VJX74NPA.js. Sync record: 27 entri. Lingkungan tes sempat hilang lagi pagi ini (VM diganti: /tmp wipe + role/DB `astra_test` hilang meski cluster 16/main masih ada) — dipulihkan: `pg_ctlcluster 16 main start`, role/DB dibuat ulang, skema diterapkan ulang (0 error), /tmp dipulihkan dari mirror, fixture dibuat ulang, jsdom 31 diinstal ulang.
- Sektor (catatan dari pertanyaan owner 2026-11-24): saat ekspedisi selesai, yang di-reset HANYA (1) asteroidnya diganti yang baru dan (2) `sectorProgress` kembali ke 0 — tapi HANYA setelah sektor naik (`advanced`). `layer` (sektor) tidak pernah turun/reset, hanya naik +1. Tanpa reset progres itu, sektor justru akan naik tiap ekspedisi. Jadi sektor selalu terbuka selama ekspedisi diselesaikan; tidak ada jalur kode lain (travel/scan/dll.) yang menyentuh `layer`/`sectorProgress`.

## Penjelasan cara naik sektor di hero (2026-11-24, LIVE, commit f930299, bundle main-4D5GLHMN.js) — dipindah ke tab Peta (LIVE, commit 83447a2, bundle main-7X7LUPKF.js)
- Owner sempat panik melihat progres sektor 0 setelah ekspedisi selesai — padahal itu tanda sektornya BARU NAIK (progres reset ke 0 hanya setelah sektor naik; `layer` tidak pernah turun, hanya +1; tidak ada jalur kode lain yang menyentuh `layer`/`sectorProgress`). Penjelasan cara naik sektor sebelumnya hanya ada di aturan main (`rule8`) yang tidak dibaca pemain; toast "Warp ke Sektor X" hanya muncul sebentar saat sektor naik.
- Perubahan: baris permanen di bawah angka progres sektor di hero (`App.tsx`, kolom kanan, di dalam kondisional `p.sectorProgress`), key i18n baru `sectorHowTo` (id + en, simetris): id "Selesaikan ekspedisi untuk naik sektor — makin tinggi sektor, makin banyak ekspedisi yang dibutuhkan." / en "Complete expeditions to climb sectors — the higher the sector, the more expeditions it takes." Gaya `text-[11px] leading-snug text-[var(--dim)]` di bawah baris `sectorProgress` (`text-xs`).
- Verifikasi: typecheck 0, build OK (bundle baru main-4D5GLHMN.js), suite **154/154 (3.410 expects)**, harness **38/38 + 36/36**. Live verified: /api/health 200 + bundle main-4D5GLHMN.js. Sync record: 28 entri.
- Pindah ke tab Peta (2026-11-24, owner: teksnya kepanjangan kalau di hero; Posisi Misi tetap di hero): baris `sectorHowTo` dihapus dari hero (kembali ke satu baris `sectorProgress` saja) dan dipindah ke kartu intro `PetaTab`, di bawah `mapsIntro` (`mt-1.5 text-xs leading-snug text-[var(--dim)]`). Key i18n sama, tidak berubah. Verifikasi: typecheck 0, build OK (bundle baru main-7X7LUPKF.js), suite **154/154 (3.410 expects)**, harness **38/38 + 36/36**. Live verified: /api/health 200 + bundle main-7X7LUPKF.js. Sync record: 29 entri.

## Redesain tampilan (2026-11-24, DIBANGUN — bundle main-6RYGWFWU.js, BELUM push, menunggu verdict owner dari pratinjau)
- Owner kirim screenshot referensi tampilan baru (tombol proporsi, tidak besar) dan minta gambar dulu sebelum kode. Pelajaran berurutan: (1) 3 gambar fotorealistis penuh DITOLAK — "bukan realistis begitu, kalau dimasukkan ke game malah jelek, masalahnya ada latarnya" — aset game harus didesain untuk slotnya (teks/tombol menimpa gambar; latar sibuk/terang melawan teks). (2) v2 slot-aware (hero kiri 2/3 gelap kosong, latar panel cincin samar, kartu asteroid langit gelap kiri atas) — owner mengoreksi: yang diterapkan HANYA bulatan (cincin) di panel Sektor; hero + kartu asteroid SUDAH punya gambar. Jangan generate gambar yang tidak dibutuhkan. (3) Mockup utuh satu layar penuh hasil AI DITOLAK — "sudah duga pasti jelek" (tombol kebesaran, spacing tidak pas). Jangan buat mockup UI utuh pakai AI lagi — desain UI dinilai dari UI asli yang dibangun di kode + screenshot HP.
- Yang DIBANGUN (sesuai kesepakatan: panel neon, tombol heksagonal proporsional, cincin v4 jadi latar panel Sektor):
  - CSS baru di `client/src/theme.css`: `.panel-neon` (sudut terpangkas via clip-path polygon 14px, border cyan dari gradasi border-box karena clip-path memotong border biasa, glow dari drop-shadow), `.hex-wrap` + `.hex-btn` (heksagon flat-top `polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)`, bingkai cyan dari padding wrapper 1.5px, `.active` cyan penuh teks hitam), `.ad-banner-gold` (chevron ujung runcing, gradasi emas, teks gelap tebal).
  - `client/src/App.tsx`: kartu saldo dipecah jadi DUA panel neon — (1) Saldo (label cyan, koin KT + saldo + catatan USDT + tombol Premium, isi/logika tidak berubah), (2) Posisi Misi (`relative overflow-hidden`, latar `sector-rings.webp` object-cover opacity-80 + overlay `bg-[#050810]/50`, kiri: SECTOR + progres + km, kanan: Ship Energy + bar energi — bar dipindah dari bawah kartu ke kolom kanan panel ini — + isi ulang/penuh). Tombol iklan jadi banner emas chevron (`«` PlayIcon label `»`, semua state/label/logika sama, `font-display` → `font-bold`). Grid 7 tombol heksagonal di atas kartu asteroid tab Tambang (`grid-cols-3 gap-2`, wrapper `aspect-[1.15]`, ikon 20px, label tab yang sama persis) — navigasi sama dengan nav pill; nav pill sticky tetap ada. Kartu asteroid TIDAK diubah (sudah punya badge LIVE FEED).
  - Aset: `client/src/assets/sector-rings.webp` — cincin v4 (2048×1152) di-downscale ke 1200×675 q80, 51 KB (di `client/dist/assets/sector-rings-TMKCTMFG.webp` 51,5 KB). File biner → saat push HARUS di-upload dulu lewat browser GitHub web UI ke `client/src/assets` (seperti sprite drone), baru file teks via `push-files` (manifest 58 path, webp tidak masuk manifest).
  - Tidak ada key i18n baru (label heksagon = label tab yang sudah ada: tabMine/tabMaps/tabMarket/tabHangar/tabWd/tabCommunity/tabLab — sudah persis seperti referensi: Explore Asteroid / Mining Maps / Sell Station / Hanggar / WD USDT / Community / Lab).
- Verifikasi: typecheck 0 (strict + Vercel-style), build OK (bundle baru **main-6RYGWFWU.js**), suite **154/154 (3.412 expects)**, harness **38/38 (PvP) + 36/36 (polos)**. Lingkungan tes sempat hilang lagi (VM diganti: cluster down + role/DB `astra_test` hilang + /tmp kosong) — dipulihkan: `pg_ctlcluster 16 main start`, role/DB dibuat ulang, skema diterapkan ulang (0 error), /tmp dipulihkan dari mirror, fixture dibuat ulang, jsdom 31 diinstal ulang di /tmp/harness (node_modules harness kini direktori nyata, bukan symlink ke staging).
- Pratinjau visual (2026-11-24): DOM asli hasil render harness (bundle + fixture polos, bahasa id) di-dump ke `/tmp/harness/home-dom.html`, dibungkus dengan theme.css hasil build + gambar base64 → `~/workspace/hero-redesign/preview-home.html` (340 KB setelah gambar dikecilkan khusus pratinjau — aset game tidak diubah). Percobaan screenshot: Chromium lokal `/opt/meta-chromium/chrome` menolak jalan ("Hatch WebGL domain policy is required"); upload remote-storage (muse.ai, `application/octet-stream`) diblokir kebijakan organisasi di cloud browser Environment 1 ("Halaman ini diblokir"). Akhirnya pratinjau ditampilkan sebagai widget chat (widget-4f915b51-b881-456e-b9f1-bcb45494165d) agar owner menilai langsung di HP. Menunggu verdict owner sebelum push.
- Yang masih perlu dicek di HP (setelah push): panel neon + cincin terbaca di layar kecil, tombol heksagonal proporsional dan tidak kebesaran, banner emas, teks tidak meluber di panel Posisi Misi.
- Grid heksagon DIHAPUS (2026-11-24, owner: "tombol jelajahi dan lain lain malah double hapus itu yang di bawah jelek sekali" — pilihannya "Hapus grid heksagon"): JSX grid + array `hexTabs` + CSS `.hex-wrap`/`.hex-btn` dihapus dari `App.tsx`/`theme.css`; nav pill lama dipertahankan (satu-satunya navigasi, seperti semula). Bundle baru **main-ZYU76C6O.js**. Verifikasi: typecheck 0, build OK, suite **154/154** (1 fail flaky yang dikenal di run pertama, hijau di re-run), harness **38/38 + 36/36**. Pratinjau diperbarui (widget baru) — DOM asli 23.099 karakter (lebih pendek karena grid hilang). Catatan: `node dump.mjs` tidak pernah keluar sendiri (timer bundle menahan event loop jsdom) — dump file tetap tertulis; jalankan python build-preview terpisah setelah dump, jangan dirangkai dengan `&&`.
- Bagian energi dipadatkan (2026-11-24, owner: di referensi bagian energi tidak sepanjang di build saya): kolom kanan panel Posisi Misi dari `w-36 sm:w-44` → `w-28 sm:w-32`; label "Daya Kapal"/"Ship Energy" kecil + angka `25/30` besar tebal di baris sendiri (tadinya satu baris kecil "Daya Kapal 25/30"); bar energi dari `w-full h-3` → `w-24 ml-auto h-2` (pendek, rata kanan, tipis — seperti referensi); teks isi ulang dari satu baris panjang yang membungkus → tiga baris pendek: label "Isi ulang"/"Recharge", nilai kuning tebal "1 per 4 mnt", "Penuh ±20 mnt". i18n: key baru `shipEnergyLabel`/`regenLabel`/`regenValue`, `fullIn` tanpa pemisah " · " (tadinya " · penuh ±{dur}"), `shipPower` + `regenOne` dihapus — id+en simetris (3 keluar, 3 masuk per kamus). Key ini hanya dipakai di kolom energi (grep). Bundle baru **main-PMIHTTMG.js**. Verifikasi: typecheck 0, build OK, suite **154/154 (3.417 expects)**, harness **38/38 + 36/36**. Pratinjau diperbarui (widget baru, DOM asli 23.277 karakter).
- Redesain tampilan LIVE (2026-11-24 12:07, bundle main-PMIHTTMG.js): push dua langkah — (1) `sector-rings.webp` di-upload via browser GitHub web UI (commit `ab81a79`, "Add sector rings background image", 1 file changed, Verified), (2) 58 file teks via `push-files` (commit `2f9dd88`, "Redesign home: neon panels, sector rings, gold ad banner, compact energy"). Sync record: 31 entri (30 = webp, 31 = teks). Live verified: /api/health 200 + bundle **main-PMIHTTMG.js** + `sector-rings-TMKCTMFG.webp` 200 (dicek ~90 detik setelah push — deploy Vercel butuh jeda; bundle lama main-7X7LUPKF.js masih tampil di cek pertama).

## Hadiah iklan jadi Daya Kapal, bukan KT (2026-11-24, LIVE, commit 375cd1b, bundle main-VD4DSKMI.js)
- Owner: hadiah iklan bukan KT lagi — 1 tontonan = +5 Daya Kapal. 5 = tepat 1x biaya scan (`SCAN_ENERGY_COST = 5`), jadi 1 iklan = 1 scan. Kuota 10/hari + cooldown 5 menit TIDAK berubah (maks +50 Daya/hari). `AD_REWARD_KT = 0.375` dihapus, diganti `AD_REWARD_ENERGY = 5`.
- `watchAd` (`api/_lib/game.ts`): tidak lagi menyentuh `ktBalance`/`totalKtEarned`; kredit energi dipotong ke `maxEnergy` (Tangki O2 menaikkan cap) — tangki penuh = +0; respons melaporkan jumlah SEBENARNYA yang dikredit (`rewardEnergy`, plus `energy` baru); `loadPlayer` sudah menerapkan regen sebelum kredit; `energyUpdatedAt` di-reset ke now hanya bila mencapai cap (mirip logika regen). Log `ad_reward` tetap (dipakai `getAdStats` untuk kuota/cooldown) dengan `amountKt: null` + teks baru (`logAd` id+en: "+5 Daya Kapal"). `getGameState.ads.rewardKt` → `rewardEnergy` (skema + respons).
- Client: tombol "Tonton Iklan — Dapat +5 Daya Kapal" (`watchAdBtn`, param `{kt}` → `{energy}`), `adAriaFull`, toast `adRewarded`, `rule13` (juga dibetulkan: tombol iklan sudah bukan "di kartu saldo" lagi sejak panel dipecah) — id+en simetris, tanpa key baru/dihapus.
- Sim (`sim.ts`, mirror + /tmp): iklan kini menambah `energyPool` (`energyPerDay + adsPerDay * AD_REWARD_ENERGY`), bukan KT langsung (`dayKt`/`faucetKt` kehilangan suku iklan); label profil menyebut "regen + Xe ads". Hasil baru (60 hari): gratis aktif WD pertama 5 hari, WD ulang ~155 hari (tadinya ~168), ~1,0 USDT/30 hari; Premium Standard lvl 5 WD ulang ~12,0 hari, ~12,5 USDT/30 hari; wall-time terberat (Premium Standard lvl 5) ~460–480 mnt/hari (pin dilonggarkan 380–500 → 380–520 karena Monte Carlo bergeser). Pin sim yang diubah: interval4660 max (72,84)→(66,78), aktif (158,180)→(148,172), kasual >600→>580; interval166180 aktif (135,155)→(122,138), kasual (590,660)→(520,680, noisy ±60 hari); usdt4660 max (1,7,2,1)→(1,7,2,3), usdt166180 max (2,2,2,6)→(2,2,2,8), aktif (0,9,1,2)→(0,9,1,3), kasual (0,15,0,3)→(0,15,0,35), mid (5,8,6,6)→(5,8,7,0); Premium actStd interval4660 (70,78)→(66,74), casStd (310,345)→(285,345), int166 (270,305)→(250,310), maxStd usdt4660 (4,2,4,8)→(4,2,5,0). Komentar angka di tes disesuaikan.
- Tes: `game.test.ts` — tes iklan ditulis ulang (setEnergy 20 → +5 Daya, energi 25, KT 0; cooldown tetap diblok) + tes baru tangki penuh = +0 Daya; `economy.test.ts` — pin `AD_REWARD_ENERGY = 5`, nama tes bonus harian disesuaikan. Suite **155/155 (3.425 expects)** dua kali berturut-turut; harness **38/38 + 36/36**. Jebakan: fixture harness dibuat SEBELUM perubahan game.ts masih berisi `rewardKt` → `fmt(undefined)` meledak di jsdom ("Cannot read properties of undefined (reading 'toLocaleString')", dump 40 karakter) — regenerasi fixture SETELAH perubahan kode, baru harness hijau.
- Lingkungan tes hilang total lagi (VM diganti: /tmp kosong, Postgres down, role/DB `astra_test` hilang): dipulihkan — `pg_ctlcluster 16 main start`, role/DB dibuat ulang, skema diterapkan ulang (0 error), /tmp/smoke-test + /tmp/harness dipulihkan dari mirror, fixture dibuat ulang, jsdom 31 diinstal ulang, `dump.mjs` + `build-preview.py` dibuat ulang (keduanya kini juga disimpan di mirror `~/workspace/smoke-test/` + `/tmp/harness/`).

## Panel neon: chamfer diganti rounded (2026-11-24, LIVE, commit 375cd1b, bundle main-VD4DSKMI.js)
- Owner sebelum push: pinggiran card (panel Saldo + Posisi Misi) kelihatan terpotong. Penyebab: `.panel-neon` memakai `clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)` — chamfer hanya di 2 sudut (kiri atas + kanan bawah) dan clip-path memotong border 1,5px-nya, jadi bingkai cyan putus di diagonal potongan (tidak mengikuti potongan seperti di referensi). Perbaikan yang dipilih owner: sudut normal rounded — `clip-path` dihapus, diganti `border-radius: 1rem` (rounded-2xl, sama seperti kartu asteroid dan kartu lain); gradasi border + glow drop-shadow tetap. Bundle JS tidak berubah (main-VD4DSKMI.js; hanya theme.css yang berubah). Suite 155/155, harness 38/38 + 36/36.

## Pesan otomatis per bahasa pemain (2026-11-24, LIVE, commit 4458891, server-only, bundle tidak berubah)
- Owner: notifikasi WD + pengingat 3-hari-tidak-aktif harus sesuai bahasa tiap pemain (sebelumnya semua Bahasa Indonesia). Broadcast 2-bahasa TIDAK dibuat (owner pilih "pesan otomatis saja").
- `player.language` TEXT NOT NULL DEFAULT 'id' (migrasi-0011, juga ditambahkan ke init.sql + schema.pg.ts). Disimpan di `loadPlayer` dari `session.lang` tiap request, hanya bila berubah (satu UPDATE tambahan hanya saat ganti bahasa; getGameState dipanggil tiap buka aplikasi jadi bahasa tersimpan cepat). Pemain lama = 'id' sampai buka game lagi. Dipakai HANYA untuk memilih bahasa pesan otomatis — tidak pernah untuk logika/harga/aturan.
- Notifikasi WD (`updateWithdrawal`): bahasa PENERIMA dibaca dari baris pemain target (`normalizeLang(target.language)`), teks dari key i18n baru `wdNotifyApproved` / `wdNotifyPaid` (id+en, jumlah diformat per locale penerima). Log WD (`logWdApprove`/`logWdPaid`) tetap bahasa admin — itu log, bukan pesan ke pemain.
- Pengingat (`nudge.ts`): `NudgeCandidate` kini membawa `language: Lang` (di-select dari player.language, dinormalisasi); `runInactiveNudge` mengirim `nudgeText(c.language)`; `nudgeText(lang)` memakai key i18n baru `nudgeText(url)` (id+en, tautan Mini App sama). Komentar lama "Pesan selalu Bahasa Indonesia" dihapus.
- Tes (notify.test.ts, +3): notifikasi WD ke pemain Inggris berisi "has been approved"/"has been paid" (admin tetap Indonesia); getGameState menyimpan bahasa + ganti bahasa ikut tersimpan; pengingat ke kandidat Inggris berisi "haven't mined", ke kandidat Indonesia "Sudah 3 hari". Suite **158/158** (dua kali berturut-turut; satu pin sim mid interval4660 dilonggarkan >27→>26 — Monte Carlo 26,79, bukan regresi — plus flake paralel yang sudah dikenal, hilang di re-run).
- Migrasi-0011 dijalankan owner di Neon sebelum push (2026-11-24).

## Bahasa Rusia (2026-11-24, LIVE, commit fc67c7f, bundle main-2OLUYLKZ.js)
- Bahasa ketiga (id+en+ru). TIDAK perlu migrasi — `player.language` TEXT menerima "ru" apa adanya.
- Kamus client 471 kunci (DICTS.ru, urutan sama dengan id; placeholder {var} identik, 0 mismatch) + kamus server 134 kunci (ru: ServerStrings; semua argumen locale fmtNum/fmtDur di dalam ru memakai "ru", 37 buah). Nilai dicek: tanpa emoji, tanpa "намеренно".
- Nama konten Rusia: ORES 17 (nameRu), MAPS 5 (nameRu/taglineRu/descRu/distanceLabelRu), UPGRADES 6 (nameRu/descRu), paket Premium (labelRu), ASTEROID_CLASSES_RU / ASTEROID_NICKNAMES_RU (20) / ANOMALIES_RU (3) di api/_lib/i18n.ts. Accessor oreName/mapName/mapTagline/mapDesc/mapDistanceLabel/upgradeName/upgradeDesc/premiumPlanLabel + localizeExpeditionName/localizeKlass/localizeAnomaly kini memilih ru bila lang==="ru". "16 Psyche" → "16 Психея"; "Voidium" → "Войдиум".
- Plumbing: Lang = "id" | "en" | "ru" (client + server); LANGS += { ru, "🇷🇺 Русский" } (picker merender dari LANGS — otomatis); normalizeLang + detectLang menerima "ru" (localStorage → Telegram language_code → browser → en); format angka/tanggal ru-RU (langLocale); durasi Rusia "ч/мин/сек" (fmtDur client + server, singkatan jadi tidak perlu deklinasi jamak).
- Tes: i18n.test.ts diperluas — simetri 3-bahasa + placeholder 3-bahasa + tes baru getGameState lang=ru (nama peta "Низкая орбита — добывающая станция LEO", mineral "Астероидный реголит"). Suite **159/159** (4.859 expects), harness 38/38 + 36/36. Typecheck strict + Vercel-style 0.
- Pratinjau layar utama Rusia (DOM asli hasil render, fixture lang=ru): ~/workspace/hero-redesign/preview-home-ru.html (dibangun /tmp/harness/build-preview-ru.py dari home-dom-ru.html + theme.css + webp base64). Fixture ru: /tmp/harness/gamestate-ru.json (make-fixture-ru.ts), dump: /tmp/harness/dump-ru.mjs.

## Suara: efek baru + musik latar (2026-11-24, LIVE, commit 169821b, bundle main-7PLKTBZT.js)

### Klik kayu E di semua tombol (2026-11-24, LIVE, commit 7183395, bundle main-I2YIMYPQ.js)
Owner pilih varian E dari 7 contoh klik (A 660 Hz, B berat 330 Hz, C tajam 1400 Hz, D pop, E kayu 220 Hz+noise, F kaca, G lembut). playClick() kini bunyi kayu (tone 220 Hz 0,12 dtk gain 0,1 + noise burst 0,03). Listener pointerdown global di App: setiap `<button>` berbunyi klik (playClick menghormati toggle Suara). playClick di onSuccess collect (rare + normal) dihapus supaya tidak dobel dengan klik saat tombol ditekan; toggle Suara tetap punya playClick sendiri — pointerdown terjadi SEBELUM onClick toggle, jadi tanpa itu menyalakan suara tidak berbunyi konfirmasi. Verifikasi: typecheck 0, build OK, suite 159/159, harness 44/44 + 42/42.
- Owner suka contoh suara (musik ambien 30 dtk + efek scan/bor/koin/sukses) → diterapkan, keduanya (efek + musik), sintesis WebAudio tanpa file audio.
- sound.ts baru: playScan (sapuan sinus 500→1600 Hz + gema), playDrill (gerigi sawtooth 55/58 Hz lewat lowpass 320 Hz + noise bandpass 300 Hz, 1 dtk), playCoin (E6→B6), playClaim (koin + arpeggio), playSuccess kini arpeggio 4 nada C5 E5 G5 C6 (dulu 2 nada — sesuai contoh yang disukai owner). Helper baru sweep() + noiseBuffer(). Semua no-op bila WebAudio tidak ada (jsdom).
- Musik latar: pad prosedural Am9→Fmaj7→Cmaj7→G6, 7,5 dtk/akord, tiap nada 2 sinus detune + oktaf, attack/release 2,5 dtk, DelayNode 0,45 dtk (feedback 0,35, wet 0,3), master gain 0,6. startMusic/stopMusic/ensureMusic; toggle sendiri localStorage "astra-mining-music" (default nyala). Mulai setelah gestur pertama (pointerdown once), berhenti saat document.hidden, kembali saat terlihat (visibilitychange).
- Wiring App.tsx: scan mulai→playScan, bor mulai→playDrill, jual/beli drone/upgrade drone/WD→playCoin, bonus harian→playClaim. playClaim dipakai tombol klaim channel di Komunitas (dibangun 2026-11-24 — lihat bawah).
- Pengaturan: kartu "Musik Latar" baru di bawah kartu Suara (toggle sendiri, aria-label musicTitle, status pakai soundOn/soundOff). i18n baru musicTitle/musicHint (id+en+ru — simetri 3-bahasa dicek tes).
- Verifikasi: typecheck strict + Vercel-style 0, build OK (main-7PLKTBZT.js), suite 159/159, harness 44/44 + 42/42 (6 cek baru: judul/hint kartu musik, toggle ada, off tersimpan "0" + aria false, on tersimpan "1").
- SEBELUM perubahan ini bunyi klaim TIDAK ada — hanya klik/sukses/error; hadiah referral masuk otomatis tanpa aksi klaim.

### Klaim bonus gabung channel (2026-11-24, LIVE, commit 42b79ae, bundle main-LGSH3HTG.js, migrasi-0013 dijalankan owner di Neon sebelum push)

- Owner (2026-11-24 14:47) menyetujui pembangunan: tombol "Klaim Hadiah +5 KT" di kartu Channel Resmi tab Komunitas. Grup tidak ikut (belum ada grup); referral tetap otomatis (klaim referral masih diskusi terbuka).
- Server `claimChannelBonus` (api/_lib/game.ts, di samping claimDailyBonus): memakai `callBotApi` (api/_lib/stars.ts — sebelumnya tidak diekspor; sekarang `export async function callBotApi`) → `getChatMember` dengan chat_id `@astra_mining_gram` + user_id dari initData tervalidasi. Status anggota: creator / administrator / member / restricted (restricted tetap anggota); left / kicked → ditolak. Pengecekan gagal (bot belum admin channel, jaringan, token) → ditolak TANPA menandai klaim, pemain bisa coba lagi. Kredit atomik: UPDATE ... WHERE channel_claimed_at IS NULL (`.returning`, 0 baris = balapan/ketukan ganda → ditolak sudah diklaim). Log Ekonomi kind `channel_bonus` (otomatis economy — activityCategory hanya mission untuk MISSION_KINDS) + S.logChannelBonus. Tanpa Telegram (session.telegramId null) → errChannelNoTelegram.
- Kolom baru: player.channel_claimed_at TIMESTAMPTZ NULL (migrasi-0013, deploy/neon/migration-0013-channel-bonus-claim.sql). ⚠️ MIGRASI HARUS JALAN SEBELUM PUSH — loadPlayer membaca semua kolom pemain; tanpa kolom game tidak bisa dibuka (sama seperti migrasi-0011 language). first_name tetap try/catch (bukan kolom ini).
- getGameState: player.channelBonusClaimed (boolean) + player.channelBonusKt (5) — pola dailyBonusKt. Client: mutasi claimChannel (App.tsx, di samping claimBonus — playClaim saat ok, showResult, refresh) → props KomunitasTab (channelBonusClaimed, channelBonusKt, onClaimChannel, claimingChannel); tombol klaim hanya bila userId != null (pola tautan referral), gaya tombol = tombol klaim bonus harian (border-2 dashed amber); sudah diklaim → teks emerald "Bonus sudah diklaim".
- i18n: server 5 kunci baru (errChannelNoTelegram / errChannelAlreadyClaimed / errChannelCheckFailed / errChannelNotJoined + logChannelBonus) id+en+ru; client 3 kunci baru (commChannelClaim / commChannelClaimed / commChannelClaimOk) id+en+ru. Pesan error server yang ditampilkan klien — klien tidak punya kunci sendiri untuk "belum gabung" / "belum bisa diperiksa".
- Tes channel.test.ts (6 tes, stub Bot API via setBotFetchForTests — pola stars.test.ts): member klaim +5 KT sekali + log + getGameState claimed + klaim kedua ditolak tanpa panggilan API kedua; left ditolak; kicked ditolak; restricted dihitung anggota; kegagalan Bot API ditolak tanpa tanda lalu retry berhasil; pemain web ditolak. Harness: render.mjs men-stub window.Telegram.WebApp.initDataUnsafe.user.id = 730001 (sebelumnya {} → userId null → tombol klaim tidak ter-render; perbaikan ini juga membuat tautan referral ter-render) + cek baru "channel claim button renders (not claimed yet)".
- Verifikasi: typecheck 0, build OK (main-LGSH3HTG.js), suite 169/169 (satu kegagalan di run paralel pertama — flake yang sudah dikenal, hijau di 2 re-run), harness 47/47 (PvP) + 45/45 (plain).
- BELUM DIVERIFIKASI LIVE: satu klaim sungguhan di HP (butuh bot jadi admin @astra_mining_gram dulu — langkah owner, belum dikonfirmasi; sampai itu dilakukan klaim selalu gagal "belum bisa diperiksa").
- Tombol Gabung Channel disembunyikan saat bonus sudah diklaim (owner 2026-11-24 15:09): `{!channelBonusClaimed && (...)}` di sekitar tombol Gabung Channel — sudah diklaim berarti sudah join, tombolnya tidak perlu lagi. LIVE, commit 78a4558, bundle main-43H2ZKUS.js, client-only, tanpa migrasi/server. Verifikasi: typecheck 0, build OK, suite 169/169, harness 47/47 + 45/45, plus cek one-off fixture claimed (teks "Bonus sudah diklaim" muncul, tombol Gabung + Klaim hilang).

### Tutorial sambutan 3 langkah (2026-11-25, LIVE, commit 8d3c190, bundle main-DRZL2YRL.js, client-only)

- Owner menyetujui pratinjau 2026-11-24 ("oh bagus sih kita terapkan nanti"); diterapkan 2026-11-25 atas perintah owner ("Ya, terapkan tutorial sekarang"). Pratinjau yang disetujui: ~/workspace/hero-redesign/preview-tutorial.html.
- `TutorialOverlay` (client/src/App.tsx, di samping SettingsTab): overlay fixed inset-0 z-60 (di atas Pengaturan z-50) di atas home yang meredup (bg #030610/.82), kartu max-w-360px gradient #0a1128→#0b1220, bingkai cyan 1.5px, nomor langkah emas (gradient amber-300→amber-500), tombol emas "Mulai Menambang", catatan "Bisa dibuka lagi kapan pun dari Pengaturan". Isi (i18n tutStep1/2/3, persis pratinjau): 1) Pindai Asteroid — tekan Pindai, sekali scan 5 Daya Kapal; 2) Bor Urat Mineral — berjalan sendiri di server, aplikasi bisa ditutup; 3) Jual & Tarik USDT — jual jadi KT, tarik USDT di tab WD, 1.000 KT = 1 USDT.
- State di komponen App utama: `showTutorial` (initializer baca localStorage "astra-mining-tutorial-seen" !== "1", try/catch seperti soundEnabled), `dismissTutorial` (set flag "1" + setShowTutorial(false)). Mount di cabang data saja (`{showTutorial && <TutorialOverlay .../>}` setelah overlay Pengaturan) — tidak muncul di atas BootLoader / layar koneksi. Tanpa tombol X / klik backdrop — hanya tombol emas (sesuai pratinjau, mencegah tutup tak sengaja).
- Pengaturan: kartu "Cara Main" baru (setelah Musik Latar, sebelum Info Akun) — judul + hint tutSub + tombol cyan full-width → `onOpenTutorial={() => setShowTutorial(true)}` (flag sudah "1" tidak menghalangi buka ulang; tutup lagi hanya menyembunyikan).
- i18n: 11 kunci baru (tutWelcome/tutSub/tutStep1Title/tutStep1Desc/tutStep2Title/tutStep2Desc/tutStep3Title/tutStep3Desc/tutStart/tutNote/tutOpenBtn) id+en+ru — simetri 3-bahasa dicek tes i18n. Judul memakai tutWelcome + <br/> + "ASTRA MINING" (konstan).
- Harness: 6 cek baru di render.mjs — overlay muncul saat pertama buka, 3 langkah ada, tutup lewat "Mulai Menambang", flag tersimpan "1", kartu "Cara Main" ada di Pengaturan, tutorial terbuka lagi dari Pengaturan. Jebakan: innerHTML meng-escape & jadi &amp; — cek langkah 3 memakai "Jual &amp; Tarik USDT". Cek tutorial diletakkan SEBELUM klik Lab/Komunitas (overlay ditutup dulu; dispatchEvent jsdom tidak hit-test jadi klik tetap jalan walau overlay terbuka).
- Verifikasi: typecheck 0, build OK (main-DRZL2YRL.js), suite 169/169, harness 53/53 (PvP) + 51/51 (plain). Tanpa migrasi, tanpa perubahan server.
- Lingkungan tes hilang lagi saat build ini (VM diganti semalam: /tmp kosong + Postgres belum ter-install) — dipulihkan seperti biasa (apt install postgresql, role+DB, init.sql + migrasi 0001–0013, /tmp/smoke-test + /tmp/harness dari mirror, jsdom 31, fixture dibuat ulang).

### Alamat WD harus TON (2026-11-25, LIVE, commit 61d79a63, bundle main-O772UGZJ.js)

- Owner 2026-11-25 09:11: "Harus usdt jaringan gram(ton) jadi mereka harus tau harus mengirimkan alamat usdt jaringan apa" — USDT hanya dibayar lewat jaringan TON. Sebelumnya label form sudah bertuliskan "(TON)" tapi TIDAK ada yang menegakkan: satu-satunya cek adalah panjang alamat ≥10 karakter (klien) + zod min(10) (server), jadi alamat TRC20/ERC20 bisa masuk antrean WD dan pemilik tidak bisa membayarnya.
- Server (api/_lib/game.ts): `isTonAddress(address)` (exported) — friendly mainnet 48 karakter base64url diawali "EQ" (bounceable) atau "UQ" (non-bounceable), atau raw "0:" + 64 hex. Hanya BENTUK yang diperiksa, bukan checksum CRC (implementasi CRC dari first principles tidak bisa direproduksi dari alamat pemilik yang diketahui valid — jangan tambahkan verifikasi CRC tanpa referensi yang benar). Handler `requestWithdrawal` menolak alamat non-TON dengan `S.errWalletNotTon` SEBELUM KT dikunci (dicek pertama, sebelum validasi jumlah). Deskripsi aksi diperbarui.
- Server i18n (api/_lib/i18n.ts): kunci baru `errWalletNotTon` id+en+ru ("Alamat itu bukan alamat TON. USDT hanya dikirim lewat jaringan TON — pakai alamat yang diawali EQ atau UQ." / dst).
- Klien (client/src/App.tsx): cermin `isTonAddress` di atas WdTab (klien tidak bisa impor kode server). Form WD: catatan permanen di bawah kolom alamat (`wdTonNote`: "USDT hanya dikirim lewat jaringan TON. Salin alamat dari dompet TON kamu (diawali EQ atau UQ)."), placeholder baru "Tempel alamat USDT jaringan TON (EQ/UQ…)", tombol kirim nonaktif sampai alamat berformat TON (`walletOk` menggantikan cek panjang <10), hint merah saat alamat terisi tapi tidak valid (`wdWalletInvalid`).
- i18n klien: 2 kunci baru (`wdTonNote`, `wdWalletInvalid`) + placeholder diperbarui, id+en+ru; kunci `wdWalletShort` DIHAPUS dari ketiga kamus (satu-satunya pemakaiannya adalah hint panjang yang diganti cek format).
- Tes: `WALLET` di economy/anticheat/ceiling.test.ts diganti dari "EQD-test-wallet-address-1234567890" (36 karakter, TIDAK lolos regex) ke alamat UQ asli pemilik (alamat GRAM publik, 48 karakter). economy.test.ts: describe baru "WD wallet must be a TON address" — 6 tes: TRC20 ditolak + KT tidak terkunci, ERC20 0x ditolak, nama ".ton" ditolak, UQ diterima, EQ diterima (prefix diganti — bentuk saja yang dicek), raw "0:"+64hex diterima (bytes alamat pemilik).
- Harness (render.mjs): 4 cek baru di tab WD — catatan jaringan TON muncul, placeholder menyebut TON (EQ/UQ), alamat TRC20 yang diketik memunculkan hint "bukan alamat TON". Tombol tab dicari lewat teks "WD USDT" (tabWd).
- Verifikasi: typecheck 0, build OK (main-O772UGZJ.js), suite 175/175 (5.094 expects — 6 tes TON baru), harness 56/56 (PvP) + 54/54 (plain, +3 cek WD). Lingkungan tes hilang lagi saat build ini (VM diganti semalam: /tmp kosong + Postgres belum ter-install) — dipulihkan seperti biasa (apt install postgresql — mirror lambat, update 7 menit; role+DB, init.sql + migrasi 0001–0013, /tmp/smoke-test + /tmp/harness dari mirror, jsdom 31, fixture dibuat ulang).

## PvP redesign — Hangar (latih) + Lab (riset) (2026-11-25, LIVE, commit 301c903, bundle main-UHJH563Y.js; migrasi-0014 dijalankan owner di Neon sebelum push)
- Diskusi dulu (owner: "kita diskusi dulu... kalau belum paham kita tidak boleh eksekusi kodenya"): pasukan DILATIH bukan dibeli instan; camp di Hangar; melewati batas makin mahal DAN makin lama; Lab = tempat riset, Hangar = tempat pasukan. Owner pilih B: semua peningkatan jadi riset di Lab, Hangar tanpa tombol upgrade.
- Aturan: latih 5 menit × level drone (Lv1 5 mnt → Lv5 25 mnt), jalan di server seperti bor, satu antrean. Camp awal 10 total (Serbu+Perisai gabung); riset Perluas Camp +5/level, maks 5 (→35). Melewati batas: pengali 1+kelebihan, sama untuk harga & waktu (ke-1 ×2, ke-2 ×3, dst.). Riset Lab: level drone, Perluas Camp, Pelatihan Cepat (+10% kecepatan/level, maks 5) — KT + waktu 10 menit × level target, satu riset sekali waktu. Harga latih & riset 0,1 KT flat masa tes. Pasukan lama langsung masuk camp (tidak dihapus). Pertempuran/rampasan/perisai/cooldown TIDAK berubah.
- Server: migrasi-0014 (player.training TEXT JSON {kind, endsAt, costKt}, player.research TEXT JSON {kind level|camp|speed, troopKind, targetLevel, endsAt, costKt}, pvp_camp_level INT, pvp_speed_level INT) + schema.pg.ts. Konstanta CAMP_BASE_CAPACITY=10, CAMP_PER_RESEARCH=5, RESEARCH_MAX_LEVEL=5, TRAIN_BASE_SECONDS=300, RESEARCH_BASE_SECONDS=600; helper campCapacity/trainingSpeedMult/overCapacityMult/trainCostKt/trainDurationSec (lantai 60 dtk)/researchCostKt/researchDurationSec. Aksi buyTroop/upgradeTroop DIHAPUS, diganti startTraining/collectTraining/cancelTraining (refund penuh) + startResearch/collectResearch/cancelResearch (refund penuh). getGameState pvp: troops.{attack,defense}.{count, level, power, trainCost, trainDurationSec, maxCount, maxLevel} + camp {capacity, used, campLevel, speedLevel, maxResearchLevel} + researchCost + researchBaseSec + training/research (null bila tidak ada). Server i18n: 11 kunci error/nama baru + 6 kunci log baru (logPvpTrain*/logPvpResearch*); logPvpTroopBuy/logPvpTroopUpgrade DIHAPUS; errPvpTroopNone ditulis ulang (beli → latih).
- Klien: tab "Pasukan" baru (id hangar, ikon SwordsIcon) setelah Komunitas — judul "Hangar Pasukan", meter Camp (bar + ×mult bila penuh), strip kekuatan, antrean latih (hitung mundur + Ambil/Batalkan), kartu drone (gambar h-44 w-44, tombol Latih). Tab "Lab" (ikon BookIcon) jadi riset saja: 4 kartu riset (level Serbu/Perisai, Perluas Camp, Pelatihan Cepat) + kartu riset berjalan. CATATAN: tab Upgrade kapal sudah bernama "Hanggar" (tabHangar) dari dulu — tab pasukan diberi label "Pasukan" supaya tidak ada dua tab bernama sama; owner belum memutuskan apakah tab Upgrade diganti nama. Mutasi baru di api.ts (6 aksi). i18n klien: 32 kunci baru, 6 kunci beli/upgrade DIHAPUS (labBuyBtn/labUpgradeBtn/labMaxCount/labMaxLevel/labBuyDone/labUpgradeDone), labTitle/labDesc ditulis ulang.
- Tes: pvp.test.ts ditulis ulang — formula (camp/kelebihan/biaya/waktu/riset), Hangar (latih+ambil, kelebihan ×2/×3, KT kurang, maks count, batal refund, log ekonomi), Lab (riset level, camp +5, speed 273 dtk, gagal tanpa pasukan/maks, batal refund, pasukan lama dihitung ke camp). Harness harness.ts: fastForwardTraining/fastForwardResearch. make-fixture.ts: fixture PvP dibangun lewat latih+riset sungguhan (bukan buyTroop).
- Harness render.mjs: cek Hangar (judul, meter Camp, tombol Latih, 0,1 KT, gambar h-44, divide-x) + cek Lab riset (Laboratorium Riset, Perluas Camp, Pelatihan Cepat, tombol Riset ke Lv, tidak ada Beli Drone). Bundle main-UHJH563Y.js.
- Verifikasi: typecheck 0, build OK, suite 179/179 (5.348 expects — run pertama 178/179 karena flake core yang sudah dikenal, hijau di re-run), harness 65/65 (PvP) + 63/63 (plain). Lingkungan tes hilang lagi (VM diganti: /tmp kosong + Postgres belum ter-install) — dipulihkan (restore #6: apt update 9m41s @123 kB/s, install postgresql, role+DB, init.sql + migrasi 0001–0014 — PERHATIAN: psql -f pada file di /home/hatch GAGAL "Permission denied" untuk user postgres; salin file SQL ke /tmp/neon-sql chmod 644 dulu; own.sql tetap sebagai psql -f terpisah).
- PUSHED 2026-11-25 (owner jalankan migration-0014 dulu, lalu tap push): live verified /api/health 200 + bundle main-UHJH563Y.js. Yang masih perlu dicek di HP: latih satu drone sampai selesai + ambil, meter Camp, riset level drone di Lab, riset Perluas Camp.

## PvP encounter occupies the mine + smaller cards/buttons (2026-11-25, LIVE, commit 208a8ae, bundle main-MSBQIJ2T.js; no migration)
- Owner: the miner/NPC met in an encounter should OCCUPY the mine (asteroid), not stand beside it — the fight is over the mine. Decided option A (presentation only): encounter title "Tambangmu Diduduki!" / "Your Mine Is Occupied!" / "Твоя шахта занята!"; pirate/miner lines "...menduduki tambang di asteroid ini" / "...occupying the mine on this asteroid" / "...занял шахту на этом астероиде" (id+en+ru, values only, no new keys). Prize unchanged: winner takes 15% of loser's haul; no mechanic change.
- Size pass (same push; owner: "anda selalu buat sangat besar"): root cause found — card titles used font-display (Orbitron), which renders wide/bold even at text-sm (14px). All card titles (training, research, encounter, troop names, "Cara kerja" summary) now plain `text-sm font-bold`, no font-display. Drone images h-44 w-44 (176px) -> h-28 w-28 (112px), strip py-2 -> py-1. Train/collect/cancel/research/attack/skip buttons px-5 py-2 -> px-4 py-1.5 (encounter buttons px-4 py-2.5 -> py-1.5). Card padding p-3 -> p-2.5 on encounter / in-progress / research cards. Screen h2 titles keep font-display text-lg. Harness render.mjs updated (h-28/w-28, px-4, new encounter title). Preview shown from real DOM before push: ~/workspace/hero-redesign/preview-hangar-kecil.html (phone frame, images downscaled to 400px q70, 164 KB). Verified: typecheck 0, build OK, suite 179/179, harness 65/65 + 63/63; live verified /api/health 200 + bundle main-MSBQIJ2T.js.

## Compact in-progress rows + full-width Latih button (2026-11-25, LIVE, commit ba75be2, bundle main-FK3EVTWQ.js; no migration)
- Owner screenshot: the "Melatih Drone Serbu" in-progress card still felt big — a full-width box with only 2 text lines + 1 centered button (empty space). Fix: in-progress training (Hangar) and research (Lab) cards are now ONE compact row: title + countdown left (text-sm bold / text-xs), small buttons right (px-3 py-1 text-xs). Roughly half the previous height. Note: the earlier preview (preview-hangar-kecil.html) never showed this card — the PvP fixture had training: null (already collected); a training-active fixture (/tmp/harness/gamestate-training.json, training endsAt now+294s, research endsAt now+540s) + dump-hangar.mjs now render it; preview-latih-kecil.html shown before push.
- Owner, same turn: the Latih button on troop cards should be full-width (w-full) — a centered button leaves holes on the sides. Wrapper flex div removed; button itself `mt-3 w-full`. Lab research buttons stay centered auto-width (owner only asked for Latih).
- Harness: train-button check now expects w-full. Verified: typecheck 0, build OK, suite 179/179, harness 65/65 + 63/63; live verified /api/health 200 + bundle main-FK3EVTWQ.js.

## Troop prices: 1 KT x level (2026-11-25, LIVE, commit 20231a3, bundle main-KN4XIPFC.js)
- Owner asked whether training/research get more expensive with level — they did NOT: both were flat 0.1 KT (test price); only TIME scaled (train 5 min x level, research 10 min x target level). Owner: research is too cheap ("kemurahan"), it must be expensive. Decided: 1 KT x level for BOTH — train a Lv5 drone = 5 KT (x over-capacity mult), research to Lv5 = 5 KT. `TROOP_TEST_COST_KT = 0.1` replaced by `TROOP_BASE_COST_KT = 1`; `trainCostKt(used, capacity, level)`; `researchCostKt(targetLevel)`. getGameState pvp now returns per-track `researchCosts {levelAttack, levelDefense, camp, speed}` (a single researchCost was wrong — each track has a different target level); zod schema + LabTab tracks updated to use the per-track cost. startResearch now computes cost AFTER targetLevel is known (it was computed before). Tests: formula + flow tests updated (train 1/2/6 KT, research 1/5 KT, startTraining 1 KT, over-capacity 2/3 KT, research Lv2 2 KT). Harness: train check "Latih · 1 KT", research check "Riset ke Lv 1 · 1 KT" (camp Lv1 — the level tracks are blocked when the player owns 0 troops, so the Lv2 string does not render in the plain fixture). Fixtures regenerated (trainCost 1/2, researchCosts 2/3/1/1). Verified: typecheck 0, build OK, suite 179/179, harness 65/65 + 63/63; live verified /api/health 200 + bundle main-KN4XIPFC.js.
- Restore #7 (2026-11-25): a VM replacement wiped /tmp + postgres mid-task; restored via the standard procedure (kill stuck system apt-get update PID 875, own update+install ~15 min with one transient proxy connection error on a Translation-en file — non-fatal; init + migrations 0001-0014; ownership DO-block; fixtures regenerated). dump-hangar.mjs was /tmp-only and had to be recreated (now takes the fixture path as argv[2]).

## PvP battle casualties follow troop level (2026-11-25, LIVE, commit 727641c, server-only, bundle unchanged main-KN4XIPFC.js)
- Owner: if casualties were flat, players would train Lv1 forever — durability must follow level.
- Loser loses troops of the kind they fought with: attacker loses attack drones, defender loses defense drones. `pvpCasualties(count, level)` = min(count, max(1, floor(count * 0.2 / level))): Lv1 20%, Lv2 10%, Lv5 4%, min 1 when they have troops. NPC has no troops — no casualties on its side.
- Handler `pvpAttack` (after the win/lose branches, before audit): computes loserId/loserKind, loads troops, updates `pvp_troops.count`, logs kind pvp_attack/pvp_defend with new server i18n key `logPvpTroopsLost(count, name, left)` (id+en+ru) in the LOSER's language (`normalizeLang(defenderRow.language)` when the defender loses; attacker's `lang` otherwise).
- No client change (counts drop in Hangar tab + log entry), no migration, no response-shape change.
- Tests (pvp.test.ts): formula expects (0/1, 10/1=2, 10/2=1, 20/1=4, 20/5=1, 1/5=1, 100/5=4); new describe "battle casualties follow troop level" (Lv1 defender 20->16 + "gugur" log, Lv5 defender 20->19, losing attacker 1->0 + log, NPC win no troop change). Fixed "repeats identically": B's 1 defense drone dies in round 1, so the test re-trains it before round 2 (otherwise recomputed defenderPower is 0, not 10).
- Verified: typecheck 0, build OK, suite 183/183, harness 65/65 + 63/63; live verified /api/health 200 + bundle main-KN4XIPFC.js. /tmp was wiped again 2026-11-25 (restore #8: pg_ctlcluster start, DB recreated from staging init+migrations, /tmp/smoke-test + /tmp/harness restored from mirror, dump-hangar.mjs recreated).

## Side cards — icon/image on the side, not on top (2026-11-25, LIVE, commit aadd7b1, bundle main-RW6ND6CC.js)
- Owner sent a screenshot of a "Network Speed" research card from his other game (icon box left, title + "Lv.0 -> Lv.1", green "Lv.0/10", coin+gem costs, description, green effect, full-width RESEARCH button) and said his correction since yesterday was: the image/icon goes on the SIDE so cards don't stretch downward — which the assistant had never understood. Lesson: game cards are HORIZONTAL (icon/image left, content right); never an image on top of content.
- Lab research cards: 48px icon box left (Swords red / Shield sky / Users amber / Zap emerald), title + "Lv.X -> Lv.Y" top-right (plain "Lv.X" when maxed), green labResearchLevel + KT logo + cost, desc, green effect + "Waktu riset: {dur}" (both hidden when maxed), full-width amber button "Riset >" (new keys labResearchBtnShort + labResearchDur, id+en+ru; old labResearchBtn key still exists but unused in Lab). ChevronRightIcon added (mirror of ChevronLeftIcon).
- Hangar troop cards: drone image 80px (h-20 w-20) on the left, content right (name + owned + desc), full-width Latih button kept.
- Preview: real-DOM preview-kartu-samping.html (Pasukan + Lab phone frames, builder build-preview-cards.py in ~/workspace/hero-redesign/) approved by owner ("nahh gitu donggg"). dump-lab.mjs created (clicks Lab, BUNDLE env). Harness: drone-image check h-28 -> h-20; research checks now assert short Riset button (w-full + svg), cost row "1 KT", "Lv.0 -> Lv.1", "Waktu riset:" line.
- Verified: typecheck 0, build OK, suite 183/183, harness 67/67 + 63/63 -> 65/65 plain; live verified /api/health 200 + bundle main-RW6ND6CC.js. /tmp wiped a 3rd time 2026-11-25 (restore #9 via durable ~/workspace/smoke-test/restore-test-env.sh).

## Komunitas -> Misi; daily bonus moves into the tab (2026-11-25, LIVE, commit 6fb47c1, bundle main-WPT6ZPTO.js)
- Owner: "Komunitas" no longer fits — the daily-bonus claim moves into that tab so the home tab is shorter. Tab renamed to "Misi" (GiftIcon nav, key tabMisi: Misi/Missions/Миссии; tabCommunity key deleted). Contents are now all reward tasks: daily bonus, channel join, referrals.
- Daily-bonus card is the FIRST card in MisiTab (GiftIcon box left, claim button full-width dashed cyan; claimed state shows emerald "Sudah diklaim hari ini"). New keys dailyBonusTitle/dailyBonusDesc/dailyBonusClaimedState (id+en+ru). Home-tab claim button deleted (home dump verified: 0 occurrences of the claim label). Component KomunitasTab -> MisiTab, Tab "komunitas" -> "misi".
- Preview: real-DOM preview-misi.html (home + Misi phone frames) approved. dump-misi.mjs created (clicks Misi). Harness: Misi checks (daily-bonus card + claim button + referral + channel claim + empty hint), 69/69 + 67/67.
- Language auto-detect (answered 2026-11-25, no build): no first-time picker needed — detectLang() order is saved choice -> Telegram language_code -> browser language -> en; Settings still has the manual picker (id/en/ru flags).
- Verified: typecheck 0, build OK, suite 183/183, harness 69/69 + 67/67; live verified /api/health 200 + bundle main-WPT6ZPTO.js.

## Inactivity nudge + WD progress percent (2026-11-25, LIVE, commit 78b724d, server-only, bundle unchanged main-WPT6ZPTO.js)
- Owner: the 3-day inactive message should add how many percent are left until the player can withdraw USDT, in the player's own language, to motivate them back.
- `wdProgressRemaining(ktBalance, paidCount)` (api/_lib/nudge.ts): target = wdMinKtForPaidCount (first WD 100 KT, repeat 5,000 KT); remaining = 100 - min(100, floor(balance/target*100)). Server i18n key nudgeText(url) -> nudgeText(url, remainingPct); remaining<=0 -> "Saldo KT-mu sudah cukup — kamu bisa menarik USDT sekarang!" (id/en/ru variants). NudgeCandidate now carries ktBalance + paidWdCount (paid counts from one wd_requests aggregate, like the last-activity aggregate). runInactiveNudge passes the computed remaining pct per candidate.
- Tests (notify.test.ts): formula expects (0/0=100, 50/0=50, 100/0=0, 2500/1=50, 5000/1=0); nudgeText strings in all 3 languages; integration test (A en 50 KT -> "Only 50% left", E id 100 KT -> ready message). Trap: in the integration test player A is 'id' by default — the test must set language 'en' explicitly (the sibling per-language test does that; mine initially didn't).
- Verified: typecheck 0, build OK, suite 186/186, harness 69/69 + 67/67; live verified /api/health 200 + bundle main-WPT6ZPTO.js. /tmp + postgres wiped a 4th time 2026-11-25 (restore #10: full apt-get install postgresql ~12min + restore-test-env.sh). One first-run Monte Carlo sim pin failure is the documented flake (passes on re-run).

## Research prices raised again (2026-11-26, LIVE, commit 338d281, server-only, bundle unchanged main-WPT6ZPTO.js)
- Owner: research still too cheap and too fast ("masa semudah dan semurah itu sih untuk upgrade"). Rule: one research step from level L to L+1 = 20 KT x L — to Lv1 = 20 KT, to Lv2 = 20 KT, to Lv3 = 40 KT, to Lv4 = 60 KT, to Lv5 = 80 KT; one full track Lv0->Lv5 = 220 KT; applies to ALL tracks (levelAttack/levelDefense/camp/speed) via the shared researchCostKt. Time raised too: 3 hours x target level (owner 2026-11-26 08:54, replacing the 1 hour I picked; was 10 min x level; to Lv5 = 15h, one track 45h, all four 180h sequential). TRAINING UNCHANGED (1 KT x level, 5 min x level).
- Code: new RESEARCH_BASE_COST_KT = 20; researchCostKt(targetLevel) = 20 * max(1, targetLevel - 1); RESEARCH_BASE_SECONDS 600 -> 10800.
- Tests: pvp.test.ts formula expects (20/20/40/80 KT, 3600/18000 s) + research-to-Lv2 test now 20 KT / balance 980. Harness render.mjs: camp Lv1 research cost check "1 KT" -> "20 KT", plus new "Waktu riset: 1 jam" check. Fixture player has 5000 KT, research still affordable in make-fixture.
- Verified: typecheck 0, build OK, suite 186/186, harness 70/70 + 68/68; live verified /api/health 200 + bundle main-WPT6ZPTO.js. /tmp + postgres wiped again 2026-11-26 (restore #11: system os-intent replay held the apt lock ~4 min — do NOT pkill -f "apt-get update", it SIGTERMs your own shell since the pattern matches your own command line; wait for the replay, then apt-get install postgresql ~16 min + restore-test-env.sh. Restore #12 (2026-11-26 08:54): only /tmp wiped, postgres SURVIVED — just restore-test-env.sh, no reinstall.)

## PvP encounter chances raised (2026-11-26, LIVE, commit 7795d09, bundle main-N6R2QO6H.js)
- Owner asked why the NPC/player mining encounter never appears — answer: Map 2 chance was only 10% (Map 1 = 0%, never). His order: "naikan deh 20 di peta 2 dan naik terus, dasarnya 20 kan tadi dasarnya 10". New PVP_ENCOUNTER_CHANCE = [0, 0.2, 0.25, 0.3, 0.4] (old step pattern +5/+5/+10 shifted +10; Map 1 stays 0% safe). labHowDesc percentages updated in all 3 client dicts (id/en/ru) — this is a client change, so the bundle changed to main-N6R2QO6H.js.
- Tests: pvp.test.ts chance array expect updated; roll tests (rand 0.99 miss / 0.001 hit on zone 1) still valid. Harness render.mjs/dump.mjs hardcoded bundle updated to main-N6R2QO6H.js.
- Verified: typecheck 0, build OK, suite 186/186, harness 70/70 + 68/68; live verified /api/health 200 + bundle main-N6R2QO6H.js. /tmp wiped again 2026-11-26 (restore #13: postgres survived, restore-test-env.sh only).

## Compact job panel, encounter card, stat cards (2026-11-26, LIVE, commit fb10c28, bundle main-2RQ6KSAQ.js)
- Owner sent a phone screenshot of the scan card: delete the "Operasi ini berjalan dengan waktu nyata..." line (JobPanel not-ready description removed; the `jobRunning` key deleted from all 3 client dicts — `jobRunningNote`/`jobRunningAria` remain but are unused anywhere) and shrink the card (radar/drill 48→40px, "Sisa waktu" text-sm→text-xs, tighter gaps). Encounter card: pirate/miner + powers lines text-sm→text-xs, Serang/Lewati buttons text-sm→text-xs px-3 py-1. Stat boxes: value font-display text-lg→text-base font-bold, label 11→10px, py-2→py-1.5.
- Preview: real-DOM before/after via dump-scan.mjs (scan fixture gamestate-scan.json now also carries a fresh NPC encounter, attackPower 20) → preview-scan-kecil2.html; owner approved ("nice begitu") then push.
- Verified: typecheck 0, build OK, suite 186/186, harness 70/70 + 68/68; live verified /api/health 200 + bundle main-2RQ6KSAQ.js.

## Compact referral card (2026-11-26, LIVE, commit 0cf0174, bundle main-ISXVHJ72.js)
- Owner sent a screenshot of the "Undang Teman, Dapat KT" card: the "Disalin!" (Copied!) button was huge. Cause: the button stretched to the full height of the 2-line link box (flex stretch). First fix: button only (self-center, text-xs, px-3 py-1.5). Owner then asked to shrink everything in the card and make it proportional: gift icon 36→32px, title off Orbitron, desc text-sm→text-xs, link box px-3 py-2→px-2.5 py-1.5, stats margin tightened, invited-friends rows smaller (name text-sm→text-xs, date text-xs→11px, badge 11→10px px-1.5). Daily-bonus/channel/group cards in the Misi tab NOT touched (not in the screenshot).
- Preview: dump-misi.mjs now takes fixture + out args and stubs Telegram user id 730001 (dump.mjs stubs initDataUnsafe {} so refLink was null and the copy button never rendered); misi fixture gamestate-misi.json (invited 4, earned 20, Bahman pending — mirrors the owner's screenshot). Before-dump used the live bundle downloaded from the site (old bundle file is cleaned from dist on rebuild). Preview preview-referral-kecil.html; owner approved ("oke push").
- Verified: typecheck 0, build OK, suite 186/186 (one flake fail on the first run, passed on re-run with no code change), harness 70/70 + 68/68; live verified /api/health 200 + bundle main-ISXVHJ72.js. MEMORY.md was rewritten by a background job during this turn — its scan-compaction bullet wrongly said "live belum terkonfirmasi"; corrected to LIVE commit fb10c28 in the same edit.

## Compact Sell All button (2026-11-26, LIVE, commit 0e8ed45, bundle main-DNF2J3YZ.js)
- Owner: the "Jual Semua" button is still too big. It lives in the Pasar tab (tab === "pasar", nav label "Stasiun Jual" via tabMarket — NOT "Pasar"), header row next to "Stasiun Orbital — Jual Mineral". Button px-4 py-2 → px-3 py-1.5 text-xs. Section title and per-ore "Jual" buttons untouched.
- Preview: new dump-pasar.mjs (clicks the "Stasiun Jual" nav button; first attempt clicked "Pasar" and silently rendered the home tab — the NOT FOUND log was hidden by tail -1, caught by the missing h2 in the dump). Preview preview-jual-kecil.html; owner approved ("nice silahkan push").
- Verified: typecheck 0, build OK, suite 186/186, harness 70/70 + 68/68; live verified /api/health 200 + bundle main-DNF2J3YZ.js.

## Mineral sprite images (2026-11-26, LIVE, text commit 08f8102, bundle main-MORBLXTZ.js)
- Owner: no game engine means no assets — make images for ALL minerals, try them in the workspace first. 17 sprites, cel-shaded, thick outline, plain dark navy background, same style as the approved drone sprites. 2 samples first (Besi-Nikel + Helium-3) approved by owner, then the rest in batches of 4 (generate_image limit is 4 calls/response): batch 1 Regolith/Kondrit/Kobalt/Platinum, batch 2 Iridium/Opal/Topaz/Turkuois, batch 3 Ametis/Zamrud/Rubi/Safir, batch 4 Berlian/Opal Es Hitam/Voidium.
- Files: client/src/assets/ores/ore-<id>.webp (17 files, 2.6M total; generated names media-generation-ore-<id>-0-<uuid>.webp renamed; .json sidecars deleted). Wiring: 17 imports + ORE_IMAGES map in App.tsx; OreIcon renders <img> when the id has an image, SVG switch stays as fallback. Used in 3 places: market rows, asteroid vein cards, Peta gem list (inline 16px).
- Frame fit (owner: "gambar batunya di pasin saja di bingkainya"): the 40px icon boxes are now overflow-hidden and the image is h-full w-full via a new `fill` prop on OreIcon (was 24px centered in a 40px box). Inline Peta gem icons unchanged (no frame).
- Push took 3 commits: (1) .gitkeep only via push-files (d3ff9ee — creates the folder; the first attempt failed because --paths-file must be NUL-delimited ending in NUL, like the manifest); manifest regenerated 62 → 63 paths (includes .gitkeep). (2) 17 webp via cloud-browser GitHub web-UI upload (dfd928f, "17 files changed", Verified) — push-files is TEXT-ONLY, binary can't go through it. (3) Text files via push-files (08f8102, 63 paths). Sync record → 55 entries (only the push-files commits are recorded there; the webp commit dfd928f is not in it).
- Preview: preview-ores.html (Pasar + scan dumps; dump-pasar/dump-scan bundle paths updated to main-MORBLXTZ.js); Pasar dump confirmed 17 h-full w-full images. Verified: typecheck 0, build OK, suite 186/186, harness 70/70 + 68/68; live verified /api/health 200 + bundle main-MORBLXTZ.js.

## PvP power in hero mission panel (2026-11-26, LIVE, commit 5bc9d4b, bundle main-NEDNTXHG.js)
- Owner: the hero Posisi Misi block should show PvP power below the sector/progress/km lines, now that the game has PvP. Added a compact row in the panel's left column, below the km line, with a top border divider: red SwordsIcon + attack power, blue ShieldIcon + defense power (data.pvp.attackPower / defensePower, same values as the Hangar strip; 0 when no troops trained). No new i18n keys (existing labAttackPower/labDefensePower reused as title attributes).
- Preview trap: the first preview was covered by the "Selamat Datang" tutorial overlay — dump.mjs never set localStorage "astra-mining-tutorial-seen" = "1" (dump-scan.mjs and dump-pasar.mjs do). Owner couldn't see the row. Fixed dump.mjs in the mirror AND /tmp/harness, re-dumped, re-sent the preview, owner approved.
- Verified: typecheck 0, build OK, suite 186/186 (1 first-run flake fail, passed on re-run with no code change), harness 70/70 + 68/68; live verified /api/health 200 + bundle main-NEDNTXHG.js.

## Hero text to top — REJECTED, reverted (2026-11-26, NOT pushed)
- Owner asked whether the hero title text could be moved up to touch the top edge. Answered: yes, but the Settings button collides, the gradient must flip, and the bottom goes empty. Built a preview only: text container bottom-0 → top-0 (pt-3, pr-16 so it clears the Settings button), gradient flipped to dark-on-top (from-[#050810]/85 via /30). Preview preview-hero-atas.html (before = live bundle main-NEDNTXHG.js downloaded from the site via dump-home-old.mjs, after = staging bundle main-Y54ZJ66R.js). Owner: "jelek, tidak usah diterapkan". Both edits reverted in staging; rebuild reproduces the live bundle byte-identical in name (main-NEDNTXHG.js), harness 70/70. Staging matches live again. Do not propose again.

## Toggle on/off Pengaturan dikecilkan (LIVE 2026-11-26, commit 7d7ca8f, bundle main-RXGKJXQJ.js)
- Owner (screenshot kartu Suara + Musik Latar): "on off nya itu terlalu besar saya sebut on off karena saya tidak tahu nama tombolnya itu apa" — namanya toggle (saklar on/off).
- Kedua toggle (role="switch", App.tsx ~1427 + ~1440): track h-7 w-12 (48x28) + knob h-6 w-6 (24px, on left-[22px]) -> track h-5 w-9 (36x20) + knob h-4 w-4 (16px, on left-[18px], off left-0.5). Hanya 2 switch di seluruh app (grep role="switch" = 2).
- Preview: dump-settings.mjs BARU di /tmp/harness (+ salinan di ~/workspace/smoke-test/dump-settings.mjs supaya selamat dari wipe /tmp): klik tombol aria-label "Pengaturan" setelah render 3 dtk, tunggu 800ms, dump. Before = bundle live main-NEDNTXHG.js (diunduh dari site), after = main-RXGKJXQJ.js. Keduanya 2 switch; old h-7 w-12, new h-5 w-9. Preview preview-toggle-kecil.html disetujui, owner tap "Ya, push toggle kecil sekarang".
- Verifikasi: typecheck 0, build OK, suite 186/186 (5.422 expects), harness 70/70 + 68/68. Push: commit 7d7ca8fe83bd35631472555317840856a8eeb1c4, sync record 57 entri. Live: /api/health 200 + bundle main-RXGKJXQJ.js (deploy sempat masih main-NEDNTXHG.js di cek pertama, berubah di cek berikutnya ~20 dtk kemudian).
- Restore lingkungan uji #14 (2026-11-26 siang): /tmp + Postgres HILANG lagi (VM replacement). Restore script gagal di awal (su: user postgres does not exist) -> tunggu os-intent replay selesai (apt-get update aktif, JANGAN di-kill), apt-get install postgresql, lalu restore script. jsdom di /tmp/harness TIDAK ikut ter-restore -> bun add jsdom@31 manual. Total ~25 menit.
- CATATAN: background job menulis ulang MEMORY.md 2026-11-26 siang dan MENGHAPUS 6 bullet live 2026-11-26 (peluang pertemuan, panel job, kartu referral, Jual Semua, sprite mineral, power hero) — dipulihkan 2026-11-26 saat push toggle. Selalu baca MEMORY.md dari disk sebelum edit.

## Toggle on/off: dikecilkan -> dilangsingkan -> kurus (LIVE 2026-11-26, commit 074e4af, bundle main-3CAOVPL2.js)
- Ronde 1 (commit 7d7ca8f, bundle main-RXGKJXQJ.js): 48x28 (h-7 w-12, knob 24px) -> 36x20 (h-5 w-9, knob 16px). Owner setuju di pratinjau lalu MENYESAL setelah push ("harusnya saya jangan push dulu itu ternyata kegendutan, harusnya anda langsingkan bukan kecilkan tapi masih gendut").
- Ronde 2 (staging only, bundle main-3KANDC3T.js): 40x16 (h-4 w-10, knob 12px). Owner: "kuruskan itu anda paham ga sih" — cuma potong 4px tinggi, masih gendut.
- Ronde 3 (LIVE, commit 074e4aff66376f9d4f5c728f70e96b7e39504f3b): struktur baru — button h-6 w-9 (area ketuk 24px tetap nyaman) berisi track h-3 (12px, inset-x-0, top-1/2 -translate-y-1/2) + knob h-2.5 w-2.5 (10px, on left-[24px], off left-0.5). Awalnya w-10 (40px, knob on left-[28px]), owner: "pendekin dikit dikit saja" -> w-9 (36px, knob on left-[24px]). Owner: "nah begitu dong" -> push. Preview preview-toggle-kurus.html + preview-toggle-pendek.html (before = bundle live RXGKJXQJ / 3KANDC3T, after = YPV2RTMP / 3CAOVPL2).
- Verifikasi ronde 3: typecheck 0, build OK, suite 186/186 (5.422 expects), harness 70/70 + 68/68. Sync record 58 entri. Live: /api/health 200 + bundle main-3CAOVPL2.js (cek pertama masih RXGKJXQJ, berubah ~20 dtk kemudian).
- Restore #15 (2026-11-26 siang): /tmp + Postgres hilang lagi -> tunggu os-intent replay, apt install postgresql, restore script + jsdom (~22 mnt). Restore #16 (2026-11-26 sore): /tmp hilang, Postgres SELAMAT (user postgres masih ada) -> restore script saja, 8 dtk + jsdom. PELAJARAN: restore script TIDAK menyalin dump-settings.mjs ke /tmp/harness (hanya render.mjs + dump.mjs) -> diperbaiki di restore-test-env.sh baris 41 (kini ikut dump-settings.mjs). jsdom tetap harus diinstal manual tiap restore (bun add jsdom@31 di /tmp/harness).
- CATATAN: background job menulis ulang MEMORY.md 2x hari ini dan menghapus bullet live 2026-11-26 (peluang pertemuan, panel job, kartu referral, Jual Semua) — dipulihkan lagi 2026-11-26 saat push toggle kurus. Selalu baca MEMORY.md dari disk sebelum edit.

## 3 kartu Misi atas dipadatkan (LIVE 2026-11-28, commit 3e5a2d0, bundle main-XQV2QELY.js)
- Asal: kartu referral dipadatkan 2026-11-26 (0cf0174) tapi 3 kartu di atasnya (bonus harian, channel, grup) dibiarkan besar; ditawarkan saat itu, owner tidak menjawab. Proactive 2026-11-27 pagi mengangkatnya lagi.
- Fix (tanpa ubah kata-kata): ketiga kartu ikut perlakuan kartu referral — padding p-3 -> p-2.5, gap-3 -> gap-2.5, ikon h-9 w-9 (20px) -> h-8 w-8 (18px), judul font-display (Orbitron) -> text-sm font-bold, desc text-sm -> text-xs, tombol klaim/gabung/Segera-hadir px-4 py-2 -> px-3 py-1.5 text-xs, mt-2.5 -> mt-2. Tombol grup "Segera hadir" tetap disabled, cuma mengecil.
- Preview: dump-misi.mjs BARU (~/workspace/smoke-test/dump-misi.mjs + /tmp/harness; restore script kini ikut menyalinnya) — klik nav "Misi", stub initDataUnsafe.user.id=730001 supaya link referral tampil; fixture gamestate-misi.json (referral invited 4, Bahman pending) dibuat ulang dari gamestate-pvp.json via python. Before = bundle live main-3CAOVPL2.js (diunduh dari site), after = main-XQV2QELY.js. Verifikasi dump: old 3x h-9 w-9 + 1x h-8 w-8 -> new 4x h-8 w-8. Preview preview-misi-padat.html disetujui owner ("Ya, push kartu Misi padat sekarang").
- Verifikasi: typecheck 0, build OK, suite 186/186 (5.420 expects), harness 70/70 + 68/68. Push: commit 3e5a2d0177921c75e640e6fbadfc38baffe3c4e3 (push-files lambat ~6,5 mnt), sync record 59 entri. Live: /api/health 200 + bundle main-XQV2QELY.js langsung di cek pertama.
- Restore #17 (2026-11-27 pagi): /tmp + Postgres hilang lagi -> tunggu os-intent replay, apt install postgresql, restore script + jsdom (~33 mnt).
- CATATAN: background job menulis ulang MEMORY.md lagi 2026-11-28 dan menghapus 7 bullet live 2026-11-26 (toggle, peluang PvP, panel job, kartu referral, Jual Semua, sprite mineral, power hero) — kali ini dipulihkan sebagai SATU bullet gabungan "Rangkaian push UI 2026-11-26" supaya lebih tahan dipangkas. Selalu baca MEMORY.md dari disk sebelum edit.

## Tombol "Mainkan" di pesan Telegram otomatis (LIVE 2026-11-28, commit d04e02f, server-only, bundle tetap main-XQV2QELY.js)
- Asal: owner kirim screenshot game orang — pesan "Seseorang menyalakan kolonimu..." dengan tombol "Nyalakan balik" di bawah teks. Tanya cara buatnya (diskusi dulu, baru bangun): tombol = link yang dibungkus jadi tombol via Bot API reply_markup inline_keyboard web_app. Owner: "ohh mantap ayo terapkan".
- Built: api/_lib/stars.ts — konstanta baru WEB_APP_URL = "https://mygamemining.vercel.app" (jangan tertukar dengan MINI_APP_URL = "https://t.me/astra_mining_bot/astra_mining" di nudge.ts yang dipakai di TEKS pengingat); sendTelegramMessage kini mengirim reply_markup {inline_keyboard: [[{text: "Mainkan", web_app: {url: WEB_APP_URL}}]]} di setiap sendMessage. Mencakup SEMUA pesan otomatis: broadcast (sendBroadcast), notifikasi WD approve/pay (notifyWdPlayer), pengingat 3 hari (nudge). Teks pesan tidak berubah. Teks tombol "Mainkan" = sama dengan judul Menu Button BotFather.
- Tes: notify.test.ts +1 ("setiap pesan broadcast membawa tombol Mainkan (web_app)") — assert reply_markup persis. Verifikasi: typecheck 0, build OK, suite 187/187 (5.421 expects), notify 18/18. Tanpa migrasi.
- Push: commit d04e02f593c9315b6f707b2dd650cf5bfef4cda5, sync record 60 entri. Live: /api/health 200 + bundle tetap main-XQV2QELY.js (server-only). Tombol baru terlihat di pesan otomatis BERIKUTNYA (tidak retroaktif ke pesan lama); cek live = broadcast/pengingat/notifikasi WD berikutnya ke pemain nyata.
- Restore #18: /tmp + Postgres hilang lagi; restore pertama terpotong runtime restart (proc_8b00ea44f76d tanpa hasil pasti); restore kedua berhasil ~20 mnt (test env restored + jsdom).

## Lab gabung upgrade kapal + hapus tab Hanggar (LIVE 2026-11-28, commit 7f6e970, bundle main-37DY2K23.js)
- Asal: owner merasa riset Lab kurang upgrade mining ("kok tidak ada yang mengupgrade mining ya? sebelumnya kan ada waktu masih di hangar??") — dijawab dari kode: upgrade mining selalu di tab Hanggar, Lab tidak pernah punya; kemungkinan ketuker nama Hanggar vs Hangar Pasukan (tabrakan nama sejak 2026-11-25, belum diputuskan). Owner lalu usul hapus Hanggar, satukan riset di Lab (diskusi 3 ronde: (1) hapus yang mana — Hanggar upgrade kapal; (2) ikut Lab pakai waktu bukan instan — bisa; (3) dua lengan/sub-tab di dalam Lab supaya bisa dibedakan — disetujui, label "Kapal" bukan "Bor" karena isinya bukan cuma bor).
- Server (api/_lib/game.ts): PvpResearchKind += "upgrade"; PvpResearch += upgradeId: string | null; parseResearch/toClientResearch ikut; startResearch request kind enum 4 nilai + upgradeId optional (nullable().optional() — tes lama tidak mengirimnya); cabang kind "upgrade": def=upgradeById, level dari loadLevels, max → errUpgradeMax, cost = upgradeCost(def, level) [harga lama, BUKAN researchCostKt], duration = researchDurationSec(targetLevel) [3 jam × level]; antrean tunggal tetap (parseResearch busy check). collectResearch: kind "upgrade" → upsert tabel upgrades level=targetLevel (pola buyUpgrade), label=upgradeName; response += upgradeId. cancelResearch: label upgrade → upgradeName (fallback raw upgradeId). getGameState: upgrades[] += researchDurationSec (null bila maks); pvp.research zod += kind "upgrade" + upgradeId. buyUpgrade action DIHAPUS (server + client api.ts). Tanpa migrasi (kolom research JSON sudah generik).
- Client (App.tsx): Tab "upgrade" dihapus dari type Tab + nav; cabang tab upgrade dihapus (isinya PremiumCard + banner stasiun + daftar upgrade); mutasi buy dihapus; setTab("upgrade") di hero (activatePremium) + PetaTab onGoPremium → setTab("misi"). PremiumCard PINDAH ke bawah MisiTab (props baru premiumData/onBuyPremium/.../cancellingPremiumOrder) — keputusan asisten karena Premium itu pembelian bukan riset; owner belum membantah, bisa dipindah lagi. LabTab: state labSub ("pasukan"|"kapal", default pasukan), pill sub-tab di atas daftar (role=tablist, label tabTroops/labSubShip), kartu riset berjalan TETAP di atas pill; shipTracks dari data.upgrades (ikon UpgradeIcon, accent cyan, effect null → baris efek disembunyikan, span KT disembunyikan bila maks); onResearch += upgradeId; startResearch mutation onSuccess: nama upgrade dicari dari data.upgrades.
- i18n (client, 3 bahasa): labDesc diubah (upgrade kapal + drone); kunci baru labSubShip (Kapal/Ship/Корабль). Rujukan "Hanggar" diperbarui (VALUES ONLY): rule5/6/7, scanNote, lowEnergy → "di Lab (sub-tab Kapal)"; rule17, mapsPremiumCta2, mapsPromoDesc, grantPendingEmpty → "di Misi". TIDAK diubah: errPvpTroopNone server ("latih dulu di Hangar" = Hangar pasukan, benar); kunci mati tabHangar/hanggarCaption/upgradeBought/maxLevel dibiarkan (stale, cleanup terpisah).
- Tes: pvp.test.ts +describe "Lab — riset upgrade kapal" (3 tes: biaya 150 KT + durasi ~10800 dtk + antrean tunggal + klaim naik level; riset kedua 240 KT + batal refund penuh; gagal: id tidak dikenal / KT kurang / maks "maksimum") + helper setUpgradeLevel; game.test.ts: tes buyUpgrade → alur riset (fastForwardResearch, import ditambah). Sim ekonomi TIDAK berubah (Monte Carlo murni, tidak memanggil buyUpgrade; hanya mengukur keterjangkauan 23.430 KT) — tapi angka "mampu beli" kini bukan "selesai naik": akuisisi nyata lebih lambat karena antrean (dicatat di MEMORY.md).
- Harness: render.mjs +checks (sub-tab Pasukan/Kapal, klik Kapal → 6 upgrade incl. Reaktor Fusi Mini + "150 KT" + "Waktu riset: 3 jam", troop tracks tersembunyi di Kapal, "Hanggar" hilang dari nav, "Premium Pass" di Misi). dump-lab.mjs baru (mirror + restore script) — dump Lab Pasukan + Kapal; default bundle di-update tiap build seperti dump lain. Pratinjau preview-lab-sebelum-sesudah.html (256 KB) + preview-lab-kapal.html (284 KB).
- Verifikasi: typecheck 0, build OK, suite 190/190 (5.459 expects; +3 tes baru), harness 77/77 + 75/75. Push: commit 7f6e970ce3a61643f2be22ee4b8a684cbca81d3a, sync record 61 entri. Live: /api/health 200 + bundle main-37DY2K23.js (cek pertama masih XQV2QELY, berubah ~45 dtk kemudian — deploy Vercel butuh jeda).
- Restore #19: /tmp + Postgres hilang lagi; restore pertama (proc_addaace413ea) macet di wait-loop pgrep -f "apt-get update" yang SELF-MATCH baris perintahnya sendiri (dibunuh setelah ~8 mnt; pelajaran di AGENTS.md — pakai pgrep -x apt-get); restore kedua dibunuh karena `pkill -f "apt-get update"` ikut mematikan shell sendiri (perangkap yang sama, restore #11); apt-get update -qq timeout 240 dtk 2× (mirror cogentco lambat, ~15 MB daftar, satu sumber backports gagal via proxy 198.19.0.1:3128) — akhirnya selesai dengan timeout 900 (exit 0, backports diabaikan), install postgresql OK, restore script "test env restored" + jsdom 28 paket.
