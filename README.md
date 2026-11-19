# ASTRA MINING — Tambang Luar Angkasa P2E

Web play-to-earn space mining game. Players scan and drill asteroids in real
time, earn Koin Tambang (KT), and withdraw USDT manually.

- **Economy:** 1,000 KT = 1 USDT. First withdrawal minimum is 0.1 USDT
  (100 KT), then 5 USDT (5,000 KT) flat for every later withdrawal,
  at most once per 30 days.
- **Payout:** manual, no smart contract. Players request a withdrawal, the
  owner approves it and sends USDT manually.
- **Premium:** paid with Telegram Stars (Standard 150 Stars / 7 days,
  Pro 500 Stars / 30 days). Pro unlocks dual drills.
- **Anti-cheat:** balances, timers, drops and withdrawals are validated
  server-side. Never trust the frontend.

## Deploy (Vercel + Neon Postgres)

This copy is the **standalone port**: the game no longer depends on
the Muse runtime. Gameplay runs on `POST /api/game` backed by Neon
Postgres (`api/_lib/game.ts`, `api/_lib/store.ts`), and the client is
built with esbuild + Tailwind CLI (`client/build.mjs`). See
`PORT_NOTES.md` for what changed, what was tested, and the limits
(single player, no auth — same as the Muse version).

Full step-by-step guide: see `deploy/README.md`.

1. Create the tables in an empty Neon Postgres database:
   run `deploy/neon/init.sql`.
2. Import this repo into Vercel.
3. Set the environment variable `DATABASE_URL` to the Neon connection
   string (Vercel Project Settings → Environment Variables).
   Never commit a real `DATABASE_URL` — see `.env.example`.
4. Deploy, then check `GET /api/health` to verify the database
   connection and tables.
5. Point the Telegram bot's Mini App (Web App) button at the
   deployed HTTPS URL.

## Images

The game's artwork (asteroid, hero, maps, KT logo) lives in
`client/src/assets/` as `.webp` files. Those binary images are uploaded
separately and are not part of this text-only snapshot.
