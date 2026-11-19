-- =====================================================================
-- ASTRA MINING — migrasi 0003: saldo KT pecahan (rebalance #5)
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang SUDAH berisi tabel game
-- (migrasi 0001 + 0002 sudah diterapkan):
--   Neon Console → SQL Editor → paste seluruh file ini → Run.
--   (Jalankan migrasi ini SEBELUM redeploy Vercel dari kode terbaru:
--    handler game menulis saldo pecahan 0,1 KT ke kolom-kolom ini.)
--
-- Yang berubah (aturan game TIDAK berubah — hanya tipe kolom):
--   1. player.kt_balance INTEGER → DOUBLE PRECISION
--   2. player.total_kt_earned INTEGER → DOUBLE PRECISION
--   3. activity.amount_kt INTEGER → DOUBLE PRECISION
--
-- Kenapa DOUBLE PRECISION, bukan NUMERIC:
--   KT kini pecahan (Regolith 0,1 KT — rebalance #5 membagi SEMUA
--   penghasilan KT dengan 10). Driver Postgres mengembalikan kolom
--   NUMERIC sebagai string, yang akan merusak aritmetika saldo di
--   kode (`p.ktBalance + x` jadi gabung string) dan pemeriksaan
--   `z.number()` di respons. DOUBLE PRECISION dikembalikan sebagai
--   angka JS di kedua driver (Neon HTTPS dan node-postgres). Debu
--   float dicegah di kode: setiap kredit/debit dibulatkan ke
--   1 desimal saat menyentuh saldo (roundKt di api/_lib/game.ts).
--
-- File ini aman dijalankan ulang: setiap ALTER hanya berjalan bila
-- kolomnya masih INTEGER (cek information_schema). Data yang sudah
-- ada tidak berubah — nilai INTEGER lama berubah jadi DOUBLE
-- PRECISION tanpa kehilangan apa pun (500 → 500.0).
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player' AND column_name = 'kt_balance'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE player ALTER COLUMN kt_balance TYPE DOUBLE PRECISION;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player' AND column_name = 'total_kt_earned'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE player ALTER COLUMN total_kt_earned TYPE DOUBLE PRECISION;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activity' AND column_name = 'amount_kt'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE activity ALTER COLUMN amount_kt TYPE DOUBLE PRECISION;
  END IF;
END $$;
