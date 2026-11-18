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
| `api/game.ts` + `api/_lib/game.ts` | Gameplay penuh di Vercel: `POST /api/game` (`{action, args}`) menjalankan 20 aksi game (scan, bor, ekspedisi, jual, upgrade, bonus, iklan, Premium, WD) yang dipindah dari runtime Muse ke Drizzle + Neon. |
| `client/` | Client React yang sama, dibangun mandiri dengan esbuild + Tailwind CLI (`client/build.mjs`) — tanpa SDK Muse. |
| `deploy/neon/init.sql` | Skema Postgres lengkap (player, inventory, upgrades, wd_requests, premium_orders, activity) untuk database Neon yang masih kosong. Idempotent — aman dijalankan ulang. |
| `deploy/neon/schema.pg.ts` | Skema Drizzle Postgres yang dipakai handler game di `api/_lib/game.ts`. |
| `.env.example` | Template env — hanya berisi nama variabel, tanpa nilai asli. |

## Langkah deploy

1. **Buat tabel di Neon** (sekali saja, database masih kosong):
   Neon Console → SQL Editor → paste isi `deploy/neon/init.sql` → Run.
   Alternatif dari terminal: `psql "$DATABASE_URL" -f deploy/neon/init.sql`
   dengan `DATABASE_URL` ter-export di shell-mu.
2. **Import project ke Vercel**: New Project → pilih folder/repo ini.
   `vercel.json` sudah mengatur output ke `client/dist` dan functions
   ke `api/`, jadi tidak ada build command tambahan yang perlu diisi.
3. **Set environment variable**: Project Settings → Environment
   Variables → tambahkan `DATABASE_URL` berisi string koneksi Neon-mu
   (Production & Preview). Jangan tempel nilai ini di file mana pun.
4. **Deploy**, lalu buka `https://<domain-vercel-mu>/api/health` —
   harus menjawab `{"ok": true, "database": "connected", "tables": "ready"}`.
5. **Pasang sebagai Mini App**: di BotFather → `/mybots` → pilih bot →
   Bot Settings → Menu Button → Web App → tempel URL Vercel tadi.

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
