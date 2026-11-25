-- Migrasi 0014: Hangar + riset Lab (PvP redesign, owner 2026-11-25, pilihan B).
-- Pasukan DILATIH (bukan dibeli instan) dan level/camp/kecepatan
-- ditingkatkan lewat RISET di Lab. Semua state antrean disimpan
-- sebagai JSON di player (pola yang sama dengan job/expedition/
-- pvp_encounter), jadi tidak ada tabel baru.
--   training: NULL atau {"kind":"attack"|"defense","endsAt":ms,"costKt":n}
--   research: NULL atau {"kind":"level"|"camp"|"speed",
--             "troopKind":"attack"|"defense"|null,"targetLevel":n,
--             "endsAt":ms,"costKt":n}
--   pvp_camp_level: riset Perluas Camp 0-5 (kapasitas 10 + 5×level).
--   pvp_speed_level: riset Pelatihan Cepat 0-5 (waktu latih ÷ (1+0,1×level)).
-- Pasukan yang sudah ada (pvp_troops) TIDAK disentuh — langsung
-- dihitung ke isi camp. HARUS dijalankan di Neon SEBELUM push
-- (loadPlayer select semua kolom).
ALTER TABLE player ADD COLUMN IF NOT EXISTS training TEXT;
ALTER TABLE player ADD COLUMN IF NOT EXISTS research TEXT;
ALTER TABLE player ADD COLUMN IF NOT EXISTS pvp_camp_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player ADD COLUMN IF NOT EXISTS pvp_speed_level INTEGER NOT NULL DEFAULT 0;
