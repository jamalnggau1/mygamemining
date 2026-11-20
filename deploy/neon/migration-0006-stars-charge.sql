-- =====================================================================
-- ASTRA MINING — migrasi 0006: Telegram Stars (XTR) — bukti bayar
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang SUDAH berisi tabel game
-- (migrasi 0001–0005 sudah diterapkan):
--   Neon Console → SQL Editor → paste seluruh file ini → Run.
--
--   ⚠️  JALANKAN MIGRASI INI SEBELUM DEPLOY KODE STARS: skema
--   Drizzle (deploy/neon/schema.pg.ts) sekarang membaca kolom baru
--   di premium_orders — tanpa kolom ini, getGameState gagal
--   (kolom tidak ada) dan game tidak bisa dibuka. Berbeda dengan
--   migrasi 0005 (tabel baru, handler menelan error), migrasi ini
--   MENAMBAH kolom ke tabel yang sudah dibaca tiap request.
--
-- Yang ditambah:
--   1. premium_orders.telegram_payment_charge_id TEXT — id bukti
--      bayar dari Telegram (successful_payment), bukti unik tiap
--      pembayaran Stars.
--   2. premium_orders.total_amount INTEGER — jumlah Stars yang
--      benar-benar dibayar (XTR), dicocokkan dengan order.stars.
--   3. Status "paid" — pesanan yang dibayar lewat webhook Stars.
--      CHECK status diperbarui: pending / confirmed / rejected /
--      paid. "confirmed" tetap untuk konfirmasi manual admin dari
--      Kendali (fallback bila webhook terlewat).
--
-- File ini aman dijalankan ulang: ADD COLUMN memakai IF NOT
-- EXISTS, dan CHECK di-drop + dibuat ulang dengan IF EXISTS.
-- Data yang sudah ada tidak disentuh.
-- =====================================================================

-- 1. Kolom bukti bayar --------------------------------------------------
ALTER TABLE premium_orders
  ADD COLUMN IF NOT EXISTS telegram_payment_charge_id TEXT;
ALTER TABLE premium_orders
  ADD COLUMN IF NOT EXISTS total_amount INTEGER;

-- 2. Status "paid" untuk pembayaran webhook Stars ----------------------
-- CHECK inline di CREATE TABLE bernama premium_orders_status_check.
ALTER TABLE premium_orders
  DROP CONSTRAINT IF EXISTS premium_orders_status_check;
ALTER TABLE premium_orders
  ADD CONSTRAINT premium_orders_status_check
    CHECK (status IN ('pending', 'confirmed', 'rejected', 'paid'));
