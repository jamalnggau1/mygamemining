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

VERIFIKASI: typecheck 0 (strict + Vercel-style), build OK
(main-2OJNK2EH.js), full suite 107/107 (2.814 expects), harness
Node tanpa global Buffer + data getGameState live: bundle
dievaluasi bersih, UI lengkap me-render (hero, 6 tab).
