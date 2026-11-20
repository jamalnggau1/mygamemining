-- =====================================================================
-- ASTRA MINING — migrasi 0008: progres sektor (naik sektor makin sulit)
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang SUDAH berisi tabel game
-- (migrasi 0001–0007 sudah diterapkan):
--   Neon Console → SQL Editor → paste seluruh file ini → Run.
--
--   ⚠️  JALANKAN MIGRASI INI SEBELUM DEPLOY KODE SEKTOR BARU: skema
--   Drizzle (deploy/neon/schema.pg.ts) sekarang membaca kolom baru
--   di player — tanpa kolom ini, getGameState gagal (kolom tidak
--   ada) dan game tidak bisa dibuka. Sama seperti migrasi 0006/0007.
--
-- Yang ditambah:
--   1. player.sector_progress INTEGER NOT NULL DEFAULT 0 —
--      ekspedisi yang sudah diselesaikan di sektor saat ini menuju
--      kenaikan sektor berikutnya. Aturan baru (perintah pemilik
--      2026-11-20 — naik map harus susah): naik dari sektor L ke
--      L+1 butuh L ekspedisi di sektor itu (Sektor 1→2 butuh 1,
--      2→3 butuh 2, 3→4 butuh 3, dst); saat sektor naik, progres
--      kembali ke 0. Total ekspedisi untuk membuka peta: Peta 2
--      (Sektor 3) = 3, Peta 3 (Sektor 6) = 15, Peta 4 (Sektor 10)
--      = 45, Peta 5 (Sektor 15) = 105 — bukan 14 seperti dulu.
--
-- File ini aman dijalankan ulang: ADD COLUMN memakai IF NOT
-- EXISTS. Data yang sudah ada tidak disentuh (semua pemain mulai
-- dari progres 0 di sektornya saat ini).
-- =====================================================================

ALTER TABLE player
  ADD COLUMN IF NOT EXISTS sector_progress INTEGER NOT NULL DEFAULT 0;
