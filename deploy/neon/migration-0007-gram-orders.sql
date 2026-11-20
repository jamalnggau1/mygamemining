-- =====================================================================
-- ASTRA MINING — migrasi 0007: GRAM (TON Connect) — pesanan Premium
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang SUDAH berisi tabel game
-- (migrasi 0001–0006 sudah diterapkan):
--   Neon Console → SQL Editor → paste seluruh file ini → Run.
--
--   ⚠️  JALANKAN MIGRASI INI SEBELUM DEPLOY KODE GRAM: skema
--   Drizzle (deploy/neon/schema.pg.ts) sekarang membaca kolom baru
--   di premium_orders — tanpa kolom ini, getGameState gagal
--   (kolom tidak ada) dan game tidak bisa dibuka. Berbeda dengan
--   migrasi 0005 (tabel baru, handler menelan error), migrasi ini
--   MENAMBAH kolom ke tabel yang sudah dibaca tiap request
--   (sama seperti migrasi 0006).
--
-- Yang ditambah:
--   1. premium_orders.method TEXT NOT NULL DEFAULT 'stars' —
--      cara bayar pesanan: 'stars' (invoice XTR) atau 'gram'
--      (TON Connect). Pesanan lama semuanya 'stars'.
--   2. premium_orders.gram_amount REAL — harga paket dalam GRAM
--      (Standard 4, Pro 13). Null untuk pesanan Stars.
--   3. premium_orders.tx_hash TEXT — hash transaksi TON yang
--      membayar pesanan GRAM (bukti on-chain). Null sampai
--      pembayaran GRAM terverifikasi.
--   4. Partial UNIQUE index premium_orders_tx_hash_unique pada
--      tx_hash (hanya baris yang tx_hash-nya terisi): satu hash
--      transaksi hanya bisa membayar SATU pesanan — pengiriman
--      ulang confirmGramPayment tidak bisa mengaktifkan Premium
--      dua kali.
--
-- File ini aman dijalankan ulang: ADD COLUMN memakai IF NOT
-- EXISTS, dan CREATE UNIQUE INDEX memakai IF NOT EXISTS.
-- Data yang sudah ada tidak disentuh.
-- =====================================================================

-- 1. Cara bayar + jumlah GRAM + hash transaksi -------------------------
ALTER TABLE premium_orders
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'stars';
ALTER TABLE premium_orders
  ADD COLUMN IF NOT EXISTS gram_amount REAL;
ALTER TABLE premium_orders
  ADD COLUMN IF NOT EXISTS tx_hash TEXT;

-- 2. Satu hash transaksi hanya untuk satu pesanan ----------------------
CREATE UNIQUE INDEX IF NOT EXISTS premium_orders_tx_hash_unique
  ON premium_orders (tx_hash)
  WHERE tx_hash IS NOT NULL;
