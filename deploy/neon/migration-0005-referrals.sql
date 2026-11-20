-- =====================================================================
-- ASTRA MINING — migrasi 0005: referral (pelacakan + hadiah otomatis)
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang SUDAH berisi tabel game
-- (migrasi 0001–0004 sudah diterapkan):
--   Neon Console → SQL Editor → paste seluruh file ini → Run.
--   (Jalankan migrasi ini untuk MENGAKTIFKAN referral: tanpa tabel ini
--    game tetap jalan normal, tapi referral tidak tercatat dan tidak
--    ada hadiah yang dibayar — handler game menelan error tabel yang
--    belum ada dan lanjut seperti biasa.)
--
-- Yang ditambah (aturan & ekonomi game TIDAK berubah, kecuali
-- hadiah referral yang memang baru):
--   1. Tabel referrals — satu baris per pemain yang diundang:
--      referrer_player_id (pengundang), referred_player_id (yang
--      diundang, UNIQUE — satu pemain hanya bisa punya satu
--      pengundang, selamanya), status pending/rewarded, created_at,
--      rewarded_at. Hadiah 10 KT dibayar ke PENGUNDANG saat pemain
--      yang diundang menyelesaikan ekspedisi PERTAMANYA.
--   2. Indeks referrals_referrer_idx — statistik pengundang
--      (berapa teman bergabung) dibaca per pengundang.
--
-- Anti-farming: atribusi hanya saat pemain baru pertama kali dibuat
-- lewat link referral (?start=ref_<telegramId>), pengundang harus
-- sudah jadi pemain, tidak bisa mengundang diri sendiri, satu
-- pemain yang diundang = satu baris (UNIQUE), dan hadiah hanya
-- dibayar sekali — saat ekspedisi pertama si yang diundang selesai
-- (butuh waktu + daya nyata per akun palsu). Aturan anti-cheat
-- multi-akun (>3 akun/IP) yang sudah ada tetap menangkap
-- farming massal.
--
-- File ini aman dijalankan ulang: CREATE TABLE / CREATE INDEX
-- memakai IF NOT EXISTS. Data yang sudah ada tidak disentuh.
-- BATASAN: pemain yang bergabung lewat link referral SEBELUM
-- logika ini ada tidak bisa diatribusikan mundur — start_param
-- mereka sudah hilang (Telegram hanya mengirimnya saat pertama
-- kali membuka Mini App lewat link itu).
-- =====================================================================

-- 1. Tabel referrals ----------------------------------------------------
CREATE TABLE IF NOT EXISTS referrals (
  id BIGSERIAL PRIMARY KEY,
  referrer_player_id INTEGER NOT NULL REFERENCES player (id),
  referred_player_id INTEGER NOT NULL REFERENCES player (id) UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'rewarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rewarded_at TIMESTAMPTZ
);

-- 2. Indeks pengundang --------------------------------------------------
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_player_id);
