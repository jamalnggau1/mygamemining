-- =====================================================================
-- ASTRA MINING — migrasi 0002: anti-cheat otomatis (deteksi bot)
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang SUDAH berisi tabel game
-- (versi per-pemain, migrasi 0001 sudah diterapkan):
--   Neon Console → SQL Editor → paste seluruh file ini → Run.
--   (Jalankan migrasi ini SEBELUM redeploy Vercel dari kode terbaru:
--    handler game membaca kolom-kolom baru di tabel player.)
--
-- Yang ditambah (aturan & ekonomi game TIDAK berubah):
--   1. player.username TEXT — username Telegram terakhir dari
--      initData tervalidasi, supaya admin bisa mengenali akun di
--      daftar pemain mencurigakan.
--   2. player.risk_score / flag_reason / flagged_at — skor risiko
--      (0 = bersih) + alasan flag terakhir + kapan terakhir menyala.
--      Pemain dengan risk_score > 0 TIDAK diblokir main — hanya WD-nya
--      ditandai perlu ditinjau dan ia muncul di Kendali.
--   3. player.instant_collect_streak — hitungan collect instan
--      berturut-turut (aturan b).
--   4. player.tamper_count / tamper_since — hitungan percobaan aksi
--      mustahil dalam jendela 24 jam (aturan d).
--   5. player.last_eval_hour — jam epoch evaluasi aturan terakhir
--      (evaluasi dibatasi max 1×/jam/pemain).
--   6. Tabel security_flags — jejak audit tiap aturan yang menyala
--      dan tiap pembersihan flag oleh admin.
--   7. Tabel player_ip — IP terakhir per pemain (aturan multi-akun).
--      IP dari header x-forwarded-for, bukan dari klien.
--   8. Indeks activity (player_id, created_at) — evaluasi aturan
--      nonstop tanpa memindai tabel penuh.
--
-- File ini aman dijalankan ulang: semua kolom/tabel/indeks memakai
-- IF NOT EXISTS. Data yang sudah ada tidak disentuh (kolom baru
-- terisi nilai default: risk_score 0 = bersih).
-- =====================================================================

-- 1-5. Kolom anti-cheat di player --------------------------------------
ALTER TABLE player ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE player ADD COLUMN IF NOT EXISTS risk_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player ADD COLUMN IF NOT EXISTS flag_reason TEXT;
ALTER TABLE player ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;
ALTER TABLE player ADD COLUMN IF NOT EXISTS instant_collect_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player ADD COLUMN IF NOT EXISTS tamper_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player ADD COLUMN IF NOT EXISTS tamper_since TIMESTAMPTZ;
ALTER TABLE player ADD COLUMN IF NOT EXISTS last_eval_hour INTEGER;

-- 6. Tabel security_flags ----------------------------------------------
CREATE TABLE IF NOT EXISTS security_flags (
  id BIGSERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES player (id),
  rule TEXT NOT NULL,
  reason TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_flags_player_idx ON security_flags (player_id, created_at DESC);

-- 7. Tabel player_ip ----------------------------------------------------
CREATE TABLE IF NOT EXISTS player_ip (
  player_id INTEGER NOT NULL REFERENCES player (id),
  ip TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, ip)
);
CREATE INDEX IF NOT EXISTS player_ip_ip_idx ON player_ip (ip, last_seen_at DESC);

-- 8. Indeks pendukung evaluasi -----------------------------------------
CREATE INDEX IF NOT EXISTS activity_player_created_idx ON activity (player_id, created_at DESC);
