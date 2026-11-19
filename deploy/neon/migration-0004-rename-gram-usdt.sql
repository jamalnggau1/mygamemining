-- =====================================================================
-- ASTRA MINING — migrasi 0004: mata uang payout GRAM → USDT
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang SUDAH berisi tabel game
-- (migrasi 0001 + 0002 + 0003 sudah diterapkan):
--   Neon Console → SQL Editor → paste seluruh file ini → Run.
--   (Jalankan migrasi ini SEBELUM redeploy Vercel dari kode terbaru:
--    handler game kini membaca/menulis kolom-kolom baru ini.)
--
-- Yang berubah (aturan game TIDAK berubah — hanya NAMA kolom):
--   1. player.total_wd_paid_gram → total_wd_paid_usdt
--   2. wd_requests.amount_gram → amount_usdt
--
-- Kenapa ganti nama: mata uang payout pindah dari GRAM ke USDT
-- (2026-11-19, pemilik: harga GRAM membuat kewajiban dolar
-- pemilik besar dan berubah-ubah; USDT $1 stabil). Rasio TIDAK
-- berubah: 1.000 KT = 1 USDT, sama seperti dulu 1.000 KT = 1 GRAM.
-- Semua angka WD (minimum pertama 100 KT, ulang 5.000 KT, jeda
-- 14 hari, maksimum 5.000 KT) juga TIDAK berubah.
--
-- File ini aman dijalankan ulang: setiap RENAME hanya berjalan bila
-- kolom lama masih ada (cek information_schema). Data yang sudah
-- ada tidak berubah — RENAME COLUMN tidak menyentuh nilai
-- (5.0 tetap 5.0, hanya namanya yang berubah).
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player' AND column_name = 'total_wd_paid_gram'
  ) THEN
    ALTER TABLE player RENAME COLUMN total_wd_paid_gram TO total_wd_paid_usdt;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'wd_requests' AND column_name = 'amount_gram'
  ) THEN
    ALTER TABLE wd_requests RENAME COLUMN amount_gram TO amount_usdt;
  END IF;
END $$;
