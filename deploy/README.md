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
| `vercel.json` | Konfigurasi Vercel: client prebuilt dari `client/dist`, serverless functions di `api/`, dan header CSP yang mengizinkan game di-embed di Telegram (`frame-ancestors` untuk `web.telegram.org`). |
| `api/_lib/db.ts` | Satu-satunya jalur query ke Neon: membaca `DATABASE_URL` dari env, memaksakan SSL, menjalankan query terparameter lewat endpoint HTTPS Neon (tanpa dependensi npm tambahan). |
| `api/health.ts` | `GET /api/health` — memeriksa dari dalam deployment bahwa `DATABASE_URL` terbaca, Neon menjawab, dan keenam tabel game sudah ada. |
| `deploy/neon/init.sql` | Skema Postgres lengkap (player, inventory, upgrades, wd_requests, premium_orders, activity) untuk database Neon yang masih kosong. Idempotent — aman dijalankan ulang. |
| `deploy/neon/schema.pg.ts` | Cermin skema versi Drizzle Postgres (`server/src/schema.ts` adalah versi SQLite untuk hosting Muse saat ini). |
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

- Salinan game yang berjalan di hosting Muse saat ini **tidak berubah**:
  fitur, ekonomi KT/GRAM, dan data pemain tetap di database bawaannya.
- Yang sudah siap di paket ini: konfigurasi Vercel, lapisan koneksi
  Neon (env-only + SSL), endpoint health check, dan skema/migrasi
  Neon untuk keenam tabel game.
- Yang masih harus dikerjakan sebelum salinan Vercel melayani gameplay
  penuh: memindahkan handler aksi game di `server/src/actions.ts`
  (saat ini menempel ke `ctx.db` milik runtime Muse) ke lapisan
  `api/` dengan database Drizzle-Neon dari `deploy/neon/schema.pg.ts`.
  Logika ekonominya tidak perlu ditulis ulang — semua query sudah
  memakai Drizzle query builder, jadi yang berpindah hanya sumber
  koneksi databasenya. Data pemain dari hosting Muse juga tidak ikut
  pindah otomatis; migrasi datanya pekerjaan terpisah bila diperlukan.
- Jika string koneksi Neon pernah dibagikan lewat chat atau tempat
  terbuka lain, **reset password databasenya di Neon Console** lalu
  perbarui `DATABASE_URL` di Vercel.
