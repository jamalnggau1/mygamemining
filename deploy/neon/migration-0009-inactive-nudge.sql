-- =====================================================================
-- ASTRA MINING — migrasi 0009: pengingat pemain tidak aktif
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang SUDAH berisi tabel game
-- (migrasi 0001–0008 sudah diterapkan):
--   Neon Console → SQL Editor → paste seluruh file ini → Run.
--
--   ⚠️  JALANKAN MIGRASI INI SEBELUM DEPLOY KODE PENGINGAT:
--   skema Drizzle (deploy/neon/schema.pg.ts) sekarang membaca kolom
--   baru di player — tanpa kolom ini, cron pengingat gagal (kolom
--   tidak ada). Sama seperti migrasi 0006/0007/0008.
--
-- Yang ditambah:
--   1. player.last_inactive_nudge_at TIMESTAMPTZ NULL — kapan
--      terakhir pemain ini dikirimi pengingat tidak aktif. NULL =
--      belum pernah. Cron mengisi kolom ini setiap kali pengingat
--      terkirim, supaya satu pemain tidak di-spam tiap hari (jeda
--      minimum 7 hari antar pengingat).
--   2. player.created_at TIMESTAMPTZ NOT NULL DEFAULT now() —
--      kolom ini TERNYATA belum ada di tabel player, padahal logika
--      pengingat membutuhkannya sebagai fallback: pemain yang belum
--      pernah punya baris activity dinilai dari tanggal ia dibuat.
--      Baris lama mendapat created_at = waktu migrasi dijalankan
--      (aman: mereka tidak diingatkan sebelum 3 hari sesudah
--      migrasi, dan yang punya activity tetap dinilai dari activity
--      terakhirnya).
--
-- File ini aman dijalankan ulang: ADD COLUMN memakai IF NOT
-- EXISTS. Data yang sudah ada tidak disentuh (semua pemain mulai
-- dari last_inactive_nudge_at NULL).
-- =====================================================================

ALTER TABLE player
  ADD COLUMN IF NOT EXISTS last_inactive_nudge_at TIMESTAMPTZ;
ALTER TABLE player
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
