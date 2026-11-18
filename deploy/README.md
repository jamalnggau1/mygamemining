# Deploy ASTRA MINING ke Vercel (Telegram Mini App) + Neon Postgres

Paket ini menyiapkan ASTRA MINING untuk di-deploy ke **Vercel** sebagai
Telegram Mini App, dengan database **Neon Postgres**. Aturan utamanya:

> **Kredensial database tidak pernah ditulis di kode, file, atau log.**
> Koneksi hanya membaca environment variable `DATABASE_URL`
> (Vercel Project Settings → Environment Variables). SSL selalu aktif
> (`sslmode=require` dipaksakan oleh `api/_lib/db.ts` bila belum ada).

## Isi paket

| File | Fungsi |
| --- | --- |
| `vercel.json` | Konfigurasi Vercel: client dibangun `bun run build:client` ke `client/dist`, serverless functions di `api/`, dan header CSP yang mengizinkan game di-embed di Telegram (`frame-ancestors` untuk `web.telegram.org`). |
| `api/_lib/db.ts` | Satu-satunya jalur query ke Neon: membaca `DATABASE_URL` dari env, memaksakan SSL, menjalankan query terparameter lewat endpoint HTTPS Neon (tanpa dependensi npm tambahan). |
| `api/health.ts` | `GET /api/health` — memeriksa dari dalam deployment bahwa `DATABASE_URL` terbaca, Neon menjawab, dan keenam tabel game sudah ada. |
| `api/game.ts` + `api/_lib/game.ts` | Gameplay penuh di Vercel: `POST /api/game` (`{action, args, initData}`) menjalankan 20 aksi game (scan, bor, ekspedisi, jual, upgrade, bonus, iklan, Premium, WD) yang dipindah dari runtime Muse ke Drizzle + Neon. |
| `api/_lib/telegram.ts` | Validasi Telegram WebApp `initData` server-side (HMAC-SHA256 sesuai spesifikasi Telegram, `auth_date` maks 24 jam) — identitas pemain tidak pernah dipercaya dari klien. Tanpa `initData`, request dianggap pemain web lama. |
| `deploy/neon/migration-0001-telegram-id.sql` | Migrasi untuk database yang SUDAH berisi tabel versi single-player: menambah `player.telegram_id` + `player_id` di semua tabel per-pemain (data lama dianggap milik pemain web id=1, tidak hilang). |
| `client/` | Client React yang sama, dibangun mandiri dengan esbuild + Tailwind CLI (`client/build.mjs`) — tanpa SDK Muse. |
| `deploy/neon/init.sql` | Skema Postgres lengkap (player, inventory, upgrades, wd_requests, premium_orders, activity) untuk database Neon yang masih kosong. Idempotent — aman dijalankan ulang. |
| `deploy/neon/schema.pg.ts` | Skema Drizzle Postgres yang dipakai handler game di `api/_lib/game.ts`. |
| `.env.example` | Template env — hanya berisi nama variabel, tanpa nilai asli. |

## Langkah deploy

1. **Buat tabel di Neon** (sekali saja, database masih kosong):
   Neon Console → SQL Editor → paste isi `deploy/neon/init.sql` → Run.
   Alternatif dari terminal: `psql "$DATABASE_URL" -f deploy/neon/init.sql`
   dengan `DATABASE_URL` ter-export di shell-mu.
   **Database sudah berisi tabel lama?** Jangan jalankan `init.sql` —
   jalankan `deploy/neon/migration-0001-telegram-id.sql` sebagai
   gantinya (sekali saja, aman dijalankan ulang). Data lama dianggap
   milik pemain web lama (id=1) dan tidak hilang.
2. **Import project ke Vercel**: New Project → pilih folder/repo ini.
   `vercel.json` sudah mengatur output ke `client/dist` dan functions
   ke `api/`, jadi tidak ada build command tambahan yang perlu diisi.
3. **Set environment variable**: Project Settings → Environment
   Variables → tambahkan (Production & Preview):
   - `DATABASE_URL` — string koneksi Neon-mu. Jangan tempel nilai
     ini di file mana pun.
   - `BOT_TOKEN` — token bot Telegram dari BotFather (tanpa kata
     `bot:`, hanya tokennya). Dipakai server untuk memvalidasi
     `initData` pemain. **Jangan pernah menempel token ini di chat,
     file, atau log.**
   - `ADMIN_TELEGRAM_ID` — id numerik Telegram-mu (pemilik game).
     Hanya id ini yang boleh memakai Kendali (setujui/tolak/tandai
     WD, konfirmasi/tolak pesanan Premium, beri Premium). Cara
     melihat id-mu: kirim pesan apa saja ke [@userinfobot](https://t.me/userinfobot)
     di Telegram — ia membalas id numerikmu.
4. **Deploy**, lalu buka `https://<domain-vercel-mu>/api/health` —
   harus menjawab `{"ok": true, "database": "connected", "tables": "ready"}`.
5. **Pasang sebagai Mini App**: di BotFather → `/mybots` → pilih bot →
   Bot Settings → Menu Button → Web App → tempel URL Vercel tadi.

## Sesi per pemain (Telegram)

Sejak migrasi 0001, setiap pemain Telegram punya progres sendiri:
client mengirim `window.Telegram.WebApp.initData` di setiap panggilan
`/api/game`, server memvalidasi tanda tangannya dengan `BOT_TOKEN`,
lalu memetakan pemain ke baris `player`-nya sendiri lewat
`telegram_id` — saldo KT, inventory, upgrade, riwayat WD, pesanan
Premium, dan log aktivitas terpisah per pemain. Membuka game dari
browser biasa (tanpa Telegram) tetap memakai pemain web lama (id=1),
tapi pemain web lama adalah pemain BIASA — bukan admin, tidak melihat
tab Kendali, dan tidak bisa menjalankan aksi Kendali. Kendali/admin
hanya lewat Telegram, untuk id di `ADMIN_TELEGRAM_ID` saja.

Yang penting diingat:
- Tanpa `BOT_TOKEN` di Vercel, pemain Telegram **ditolak semua**
  (fail closed) — game hanya bisa dimainkan dari web.
- Tanpa `ADMIN_TELEGRAM_ID`, **tidak ada siapa pun** yang bisa
  memakai Kendali — WD dan pesanan Premium tidak bisa diproses sampai
  id admin diisi (Kendali hanya lewat Telegram, bukan dari web).
- Kalau string koneksi Neon atau `BOT_TOKEN` pernah dibagikan lewat
  chat atau tempat terbuka lain, **reset di tempat asalnya**
  (Neon Console untuk password database, BotFather `/revoke` untuk
  token bot) lalu perbarui environment variable di Vercel.

## Status & langkah berikutnya (jujur)

- Porting dari hosting Muse ke Vercel + Neon **selesai di repo ini**:
  handler aksi game yang dulu menempel ke database runtime Muse kini
  berjalan sebagai `POST /api/game` di atas Drizzle + Neon
  (`api/_lib/game.ts`, `api/_lib/store.ts`), dan client dibangun
  mandiri tanpa SDK Muse (`client/build.mjs`, esbuild + Tailwind CLI).
  Ekonomi KT/GRAM, aturan WD, Premium, dan semua angka game tidak
  berubah — yang pindah hanya sumber databasenya.
- Yang masih harus dilakukan pemilik sebelum game bisa dimainkan di
  Vercel: langkah 1–4 di atas (tabel Neon, import Vercel, `DATABASE_URL`,
  cek `/api/health`). Setelah itu, uji satu siklus scan → bor →
  ambil hasil, satu penjualan, dan satu WD di URL Vercel — koneksi
  Neon dan gameplay end-to-end belum pernah dites langsung dari
  deployment ini (lihat `PORT_NOTES.md`).
- Data pemain dari hosting Muse **tidak ikut pindah otomatis**;
  salinan Vercel mulai dari database Neon yang kosong.
- Jika string koneksi Neon pernah dibagikan lewat chat atau tempat
  terbuka lain, **reset password databasenya di Neon Console** lalu
  perbarui `DATABASE_URL` di Vercel.
