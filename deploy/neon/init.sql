-- =====================================================================
-- ASTRA MINING — skema database Neon Postgres (database kosong)
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang masih kosong:
--   - Neon Console → SQL Editor → paste seluruh file ini → Run, ATAU
--   - psql "$DATABASE_URL" -f deploy/neon/init.sql
--     (DATABASE_URL dibaca dari environment — jangan pernah menulis
--      string koneksi asli ke file, kode, atau log.)
--
-- File ini adalah padanan Postgres dari skema game di
-- server/src/schema.ts (SQLite): tabel player, inventory, upgrades,
-- wd_requests, premium_orders, activity. Perbedaan dialect saja:
--   - timestamp mode "timestamp_ms"  → TIMESTAMPTZ
--   - amount_gram / total_wd_paid_gram (REAL, langkah 0,5 GRAM)
--                                    → DOUBLE PRECISION
--   - INTEGER PRIMARY KEY AUTOINCREMENT → BIGSERIAL
-- Semua CREATE memakai IF NOT EXISTS, jadi file ini aman dijalankan
-- ulang (idempotent) dan tidak menyentuh data yang sudah ada.
-- =====================================================================

CREATE TABLE IF NOT EXISTS player (
  id INTEGER PRIMARY KEY,
  kt_balance INTEGER NOT NULL DEFAULT 0,
  energy INTEGER NOT NULL DEFAULT 20,
  energy_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  layer INTEGER NOT NULL DEFAULT 1,
  current_zone INTEGER NOT NULL DEFAULT 0,
  premium_until TIMESTAMPTZ,
  premium_tier TEXT CHECK (premium_tier IN ('standard', 'pro')),
  grid TEXT NOT NULL DEFAULT '[]',
  expedition TEXT NOT NULL DEFAULT '',
  job TEXT,
  total_scans INTEGER NOT NULL DEFAULT 0,
  asteroids_done INTEGER NOT NULL DEFAULT 0,
  total_digs INTEGER NOT NULL DEFAULT 0,
  total_kt_earned INTEGER NOT NULL DEFAULT 0,
  total_wd_paid_gram DOUBLE PRECISION NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS inventory (
  ore_id TEXT PRIMARY KEY,
  qty INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS upgrades (
  upgrade_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS wd_requests (
  id BIGSERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  amount_kt INTEGER NOT NULL,
  amount_gram DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'cancelled')),
  admin_note TEXT,
  tx_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS premium_orders (
  id BIGSERIAL PRIMARY KEY,
  plan TEXT NOT NULL,
  stars INTEGER NOT NULL,
  days INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('standard', 'pro')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS activity (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  amount_kt INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Indeks untuk pola query game: antrean WD & pesanan premium difilter
-- per status, log aktivitas dibaca terbaru-dulu.
CREATE INDEX IF NOT EXISTS wd_requests_status_idx ON wd_requests (status, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS premium_orders_status_idx ON premium_orders (status, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS activity_created_idx ON activity (created_at DESC);
