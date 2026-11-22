-- =====================================================================
-- ASTRA MINING — migrasi 0010: PvP (pasukan, perisai, cooldown,
-- pertemuan, riwayat pertempuran)
-- =====================================================================
-- Jalankan SEKALI pada database Neon yang SUDAH berisi tabel game
-- (migrasi 0001–0009 sudah diterapkan):
--   Neon Console → SQL Editor → paste seluruh file ini → Run.
--
--   ⚠️  JALANKAN MIGRASI INI SEBELUM DEPLOY KODE PvP:
--   getGameState membaca kolom-kolom baru di player (dan tabel
--   pvp_troops) di setiap request — tanpa kolom/tabel ini game
--   tidak bisa dibuka (kolom tidak ada). Sama seperti migrasi
--   0006/0007/0008.
--
-- Yang ditambah:
--   1. player.pvp_shield_until TIMESTAMPTZ NULL — sampai kapan
--      pemain ini kebal dari serangan (1 jam setelah diserang,
--      menang atau kalah). NULL = tidak kebal.
--   2. player.pvp_last_attack_at TIMESTAMPTZ NULL — kapan terakhir
--      pemain ini menyerang. Menyerang lagi baru bisa 30 menit
--      setelahnya. NULL = belum pernah menyerang.
--   3. player.pvp_encounter TEXT NULL — penawaran pertemuan PvP
--      yang sedang aktif untuk pemain ini (JSON: defenderPlayerId
--      null = Perompak NPC, defenderName, defensePower, expiresAt
--      epoch-ms). NULL = tidak ada penawaran. Kedaluwarsa 10 menit
--      atau saat scan berikutnya dimulai.
--   4. Tabel pvp_troops — pasukan per pemain, dua jenis:
--      kind 'attack' (Drone Serbu) / 'defense' (Drone Perisai),
--      count = jumlah drone, level = level teknologi (mulai 1).
--      Kekuatan = count × (6 + 4×level). Beli + upgrade pakai KT
--      yang sama dengan saldo WD (satu mata uang — itu dilemanya).
--   5. Tabel pvp_battles — jejak audit setiap pertempuran: siapa
--      menyerang siapa, NPC atau pemain, siapa menang, kekuatan
--      kedua pihak, dan nilai KT rampasan (0 bila tidak ada).
--
-- File ini aman dijalankan ulang: ADD COLUMN memakai IF NOT
-- EXISTS, CREATE TABLE memakai IF NOT EXISTS. Data yang sudah ada
-- tidak disentuh (semua pemain mulai tanpa pasukan, tanpa perisai,
-- tanpa cooldown, tanpa pertemuan).
-- =====================================================================

ALTER TABLE player
  ADD COLUMN IF NOT EXISTS pvp_shield_until TIMESTAMPTZ;
ALTER TABLE player
  ADD COLUMN IF NOT EXISTS pvp_last_attack_at TIMESTAMPTZ;
ALTER TABLE player
  ADD COLUMN IF NOT EXISTS pvp_encounter TEXT;

CREATE TABLE IF NOT EXISTS pvp_troops (
  player_id INTEGER NOT NULL REFERENCES player (id),
  kind TEXT NOT NULL CHECK (kind IN ('attack', 'defense')),
  count INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, kind)
);

CREATE TABLE IF NOT EXISTS pvp_battles (
  id BIGSERIAL PRIMARY KEY,
  attacker_player_id INTEGER NOT NULL REFERENCES player (id),
  defender_player_id INTEGER REFERENCES player (id),
  is_npc BOOLEAN NOT NULL DEFAULT false,
  winner TEXT NOT NULL CHECK (winner IN ('attacker', 'defender')),
  attacker_power INTEGER NOT NULL,
  defender_power INTEGER NOT NULL,
  loot_kt DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pvp_battles_attacker_idx ON pvp_battles (attacker_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pvp_battles_defender_idx ON pvp_battles (defender_player_id, created_at DESC);
