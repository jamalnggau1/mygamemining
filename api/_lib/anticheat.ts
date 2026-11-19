// Anti-cheat otomatis — deteksi bot & multi-akun ASTRA MINING.
//
// Latar: semua saldo/timer/drop/WD sudah divalidasi server-side dan
// initData Telegram mencegah pemalsuan identitas. Celah yang tersisa:
// pemain BISA mengekstrak initData-nya sendiri yang valid lalu
// men-script pemanggilan API untuk main 24/7 dengan timing sempurna,
// dan satu orang bisa menjalankan banyak akun Telegram. Modul ini
// menutup celah itu dengan DETEKSI, bukan hukuman otomatis.
//
// KEBIJAKAN (keputusan pemilik, jangan diubah diam-diam):
// - TIDAK ADA auto-ban, TIDAK ADA pemblokiran main. Pemain yang
//   ditandai tetap bermain normal — hanya WD-nya ditandai "perlu
//   ditinjau" dan ia muncul di daftar "Pemain Mencurigakan" Kendali.
//   Admin sudah menyetujui semua WD secara manual, jadi flag ini
//   hanya alat bantu keputusan, bukan vonis.
// - False positive DITOLERANSI oleh desain: pemain manusia yang
//   kebetulan bermain maraton atau berbagi WiFi keluarga bisa
//   ter-flag — admin cukup meninjau lalu membersihkan flag-nya
//   (aksi clearPlayerFlag). Flag yang dibersihkan tidak menghukum
//   dan tidak mengurangi apa pun.
// - Deteksi berjalan murah: aturan (a) + (c) dievaluasi max 1×/jam
//   per pemain (kolom player.last_eval_hour), aturan (b) + (d)
//   dievaluasi inkremental saat aksinya terjadi (counter di baris
//   player). Tidak pernah ada full-table scan per request.
// - Deteksi tidak boleh merusak gameplay: semua fungsi di sini
//   menelan error sendiri — bila tabel anti-cheat belum termigrasi
//   atau query gagal, game tetap jalan dan flag sekadar tidak naik.
//
// Aturan (skor naik per aturan yang menyala; risk_score > 0 = flagged):
//   a. nonstop (+40): aktivitas game di >=20 jam berbeda dalam 24
//      jam terakhir (dari log activity). Manusia tidur; bot tidak.
//   b. instant_collect (+40): 10× ambil hasil berturut-turut dalam
//      ≤10 detik setelah job selesai. Manusia bervariasi; bot
//      metronom. Dihitung dari streak di baris player (job.endsAt
//      server-side vs waktu collect).
//   c. multi_account (+30): >3 telegram_id berbeda dari satu IP
//      dalam 24 jam. IP dari header x-forwarded-for (Vercel edge),
//      TIDAK PERNAH dari kiriman klien.
//   d. tamper (+30): >=5 percobaan aksi mustahil dalam 24 jam —
//      collect sebelum job selesai, atau scan/bor kedua saat operasi
//      berjalan. Aksi-aksi ini SUDAH ditolak validasi; di sini hanya
//      polanya yang dihitung.
// Satu aturan yang sama tidak menyala ulang dalam 24 jam (cooldown)
// supaya skor tidak menggelembung dan tabel security_flags tidak
// kebanjiran baris.

import { and, desc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import * as schema from "../../deploy/neon/schema.pg.js";
import type { Db } from "./store.js";
import type { Session } from "./telegram.js";

type PlayerRow = typeof schema.player.$inferSelect;

export const ANTICHEAT_RULES = {
  nonstop: { points: 40, hoursThreshold: 20 },
  instant_collect: { points: 40, windowMs: 10_000, streak: 10 },
  multi_account: { points: 30, maxAccountsPerIp: 3 },
  tamper: { points: 30, attemptsThreshold: 5 },
} as const;

const DAY_MS = 24 * 3600 * 1000;
const FLAG_COOLDOWN_MS = DAY_MS; // satu aturan tidak menyala ulang dalam 24 jam
const IP_TOUCH_THROTTLE_MS = 3600 * 1000; // last_seen IP diperbarui max 1×/jam

/** Menaikkan skor risiko pemain + mencatat alasan (manusiawi) dan
 *  jejak audit. Mengembalikan false bila aturan yang sama sudah
 *  menyala untuk pemain ini dalam 24 jam terakhir (cooldown). */
export async function flagPlayer(
  db: Db,
  playerId: number,
  rule: string,
  reason: string,
  points: number,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - FLAG_COOLDOWN_MS);
    const recent = await db
      .select({ id: schema.securityFlags.id })
      .from(schema.securityFlags)
      .where(
        and(
          eq(schema.securityFlags.playerId, playerId),
          eq(schema.securityFlags.rule, rule),
          gte(schema.securityFlags.createdAt, since),
        ),
      )
      .limit(1);
    if (recent[0]) return false;
    await db
      .update(schema.player)
      .set({
        riskScore: sql`${schema.player.riskScore} + ${points}`,
        flagReason: reason,
        flaggedAt: new Date(),
      })
      .where(eq(schema.player.id, playerId));
    await db
      .insert(schema.securityFlags)
      .values({ playerId, rule, reason, points });
    return true;
  } catch {
    return false;
  }
}

/** Mencatat IP pemain (upsert, max 1×/jam per pemain+IP). */
async function recordRequestIp(db: Db, playerId: number, ip: string): Promise<void> {
  const existing = await db
    .select()
    .from(schema.playerIp)
    .where(
      and(
        eq(schema.playerIp.playerId, playerId),
        eq(schema.playerIp.ip, ip),
      ),
    )
    .limit(1);
  const row = existing[0];
  if (row && Date.now() - row.lastSeenAt.getTime() < IP_TOUCH_THROTTLE_MS) return;
  await db
    .insert(schema.playerIp)
    .values({ playerId, ip, lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.playerIp.playerId, schema.playerIp.ip],
      set: { lastSeenAt: new Date() },
    });
}

/** Aturan (a) — hitung jam berbeda dengan aktivitas dalam 24 jam
 *  terakhir, dari log activity pemain ini saja (terindeks). */
export async function countActiveHours(db: Db, playerId: number): Promise<number> {
  const since = new Date(Date.now() - DAY_MS);
  const rows = await db
    .select({
      hours: sql<number>`count(distinct date_trunc('hour', ${schema.activity.createdAt}))`,
    })
    .from(schema.activity)
    .where(
      and(
        eq(schema.activity.playerId, playerId),
        gte(schema.activity.createdAt, since),
      ),
    );
  return Number(rows[0]?.hours ?? 0);
}

/** Aturan (c) — hitung akun Telegram berbeda dari satu IP dalam
 *  24 jam terakhir (terindeks per IP). */
export async function countAccountsForIp(db: Db, ip: string): Promise<number> {
  const since = new Date(Date.now() - DAY_MS);
  const rows = await db
    .select({
      n: sql<number>`count(distinct ${schema.player.telegramId})`,
    })
    .from(schema.playerIp)
    .innerJoin(schema.player, eq(schema.playerIp.playerId, schema.player.id))
    .where(
      and(eq(schema.playerIp.ip, ip), gte(schema.playerIp.lastSeenAt, since)),
    );
  return Number(rows[0]?.n ?? 0);
}

/** Evaluasi berkala aturan (a) + (c) untuk satu pemain — dipanggil
 *  dari loadPlayer (satu-satunya jalur semua aksi game), tapi
 *  dibatasi max 1×/jam per pemain via player.last_eval_hour supaya
 *  polling getGameState tiap 5 detik tidak membebani database. */
export async function evaluateAntiCheat(
  db: Db,
  player: PlayerRow,
  session: Session,
): Promise<void> {
  const hour = Math.floor(Date.now() / 3600000);
  if (player.lastEvalHour === hour) return;
  try {
    await db
      .update(schema.player)
      .set({ lastEvalHour: hour })
      .where(eq(schema.player.id, player.id));
  } catch {
    return;
  }
  // (a) Nonstop play — dari log activity pemain ini saja.
  try {
    const hours = await countActiveHours(db, player.id);
    if (hours >= ANTICHEAT_RULES.nonstop.hoursThreshold) {
      await flagPlayer(
        db,
        player.id,
        "nonstop",
        `Bermain di ${hours} jam berbeda dalam 24 jam terakhir — manusia tidur, bot tidak.`,
        ANTICHEAT_RULES.nonstop.points,
      );
    }
  } catch {
    // Satu aturan gagal tidak boleh menggagalkan aturan lain / request.
  }
  // (c) Multi-akun — hanya bila IP request diketahui (header server).
  const ip = session.ip ?? null;
  if (ip) {
    try {
      await recordRequestIp(db, player.id, ip);
      const n = await countAccountsForIp(db, ip);
      if (n > ANTICHEAT_RULES.multi_account.maxAccountsPerIp) {
        await flagPlayer(
          db,
          player.id,
          "multi_account",
          `${n} akun Telegram berbeda dari IP yang sama dalam 24 jam terakhir (batas: ${ANTICHEAT_RULES.multi_account.maxAccountsPerIp}).`,
          ANTICHEAT_RULES.multi_account.points,
        );
      }
    } catch {
      // Abaikan — deteksi tidak boleh merusak gameplay.
    }
  }
}

/** Aturan (b) — dipanggil tiap collectJob berhasil: delay = waktu
 *  collect dikurangi job.endsAt server-side. Streak naik bila
 *  delay ≤10 detik, reset bila collect lambat. */
export async function recordCollectLatency(
  db: Db,
  player: PlayerRow,
  delayMs: number,
): Promise<void> {
  try {
    const streak = player.instantCollectStreak ?? 0;
    if (delayMs <= ANTICHEAT_RULES.instant_collect.windowMs) {
      const next = streak + 1;
      if (next >= ANTICHEAT_RULES.instant_collect.streak) {
        await db
          .update(schema.player)
          .set({ instantCollectStreak: 0 })
          .where(eq(schema.player.id, player.id));
        await flagPlayer(
          db,
          player.id,
          "instant_collect",
          `10× ambil hasil berturut-turut dalam ≤10 detik setelah operasi selesai — timing metronom seperti bot; manusia bervariasi.`,
          ANTICHEAT_RULES.instant_collect.points,
        );
      } else {
        await db
          .update(schema.player)
          .set({ instantCollectStreak: next })
          .where(eq(schema.player.id, player.id));
      }
    } else if (streak !== 0) {
      await db
        .update(schema.player)
        .set({ instantCollectStreak: 0 })
        .where(eq(schema.player.id, player.id));
    }
  } catch {
    // Deteksi tidak boleh merusak gameplay.
  }
}

/** Aturan (d) — dipanggil tiap aksi mustahil yang ditolak validasi
 *  (collect sebelum job selesai, scan/bor kedua saat operasi
 *  berjalan). Hitungan per jendela 24 jam; menyala di percobaan ke-5. */
export async function recordTamperAttempt(
  db: Db,
  player: PlayerRow,
  detail: string,
): Promise<void> {
  try {
    const now = new Date();
    const since = player.tamperSince;
    const inWindow =
      since !== null &&
      since !== undefined &&
      now.getTime() - since.getTime() < DAY_MS;
    const count = inWindow ? (player.tamperCount ?? 0) + 1 : 1;
    if (count >= ANTICHEAT_RULES.tamper.attemptsThreshold) {
      await db
        .update(schema.player)
        .set({ tamperCount: 0, tamperSince: null as Date | null })
        .where(eq(schema.player.id, player.id));
      await flagPlayer(
        db,
        player.id,
        "tamper",
        `5+ percobaan aksi mustahil dalam 24 jam (contoh: ${detail}) — aksinya sudah ditolak server, tapi polanya dicatat.`,
        ANTICHEAT_RULES.tamper.points,
      );
    } else {
      await db
        .update(schema.player)
        .set({
          tamperCount: count,
          tamperSince: inWindow ? since : now,
        })
        .where(eq(schema.player.id, player.id));
    }
  } catch {
    // Deteksi tidak boleh merusak gameplay.
  }
}

/** Membersihkan flag pemain (aksi admin Kendali): skor kembali 0,
 *  alasan + counter direset, dan pembersihan dicatat di audit trail
 *  (baris flag_cleared) supaya ada jejaknya. */
export async function clearPlayerFlag(db: Db, playerId: number): Promise<void> {
  await db
    .update(schema.player)
    .set({
      riskScore: 0,
      flagReason: null as string | null,
      flaggedAt: null as Date | null,
      instantCollectStreak: 0,
      tamperCount: 0,
      tamperSince: null as Date | null,
    })
    .where(eq(schema.player.id, playerId));
  await db.insert(schema.securityFlags).values({
    playerId,
    rule: "flag_cleared",
    reason: "Bendera dibersihkan oleh pemilik dari Kendali setelah ditinjau.",
    points: 0,
  });
}

export type FlaggedPlayer = {
  playerId: number;
  telegramId: number | null;
  username: string | null;
  riskScore: number;
  flagReason: string | null;
  flaggedAt: string | null;
  ktBalance: number;
  paidWdCount: number;
};

/** Daftar pemain mencurigakan untuk Kendali (risk_score > 0,
 *  skor tertinggi dulu). Dipakai getGameState saat admin memuat
 *  state — mengembalikan [] bila query gagal supaya state game
 *  tidak pernah rusak karena deteksi. */
export async function listFlaggedPlayers(db: Db): Promise<FlaggedPlayer[]> {
  try {
    const rows = await db
      .select()
      .from(schema.player)
      .where(gt(schema.player.riskScore, 0))
      .orderBy(desc(schema.player.riskScore))
      .limit(50);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const paid = await db
      .select({
        playerId: schema.wdRequests.playerId,
        n: sql<number>`count(*)`,
      })
      .from(schema.wdRequests)
      .where(
        and(
          eq(schema.wdRequests.status, "paid"),
          inArray(schema.wdRequests.playerId, ids),
        ),
      )
      .groupBy(schema.wdRequests.playerId);
    const paidById = new Map(paid.map((r) => [r.playerId, Number(r.n ?? 0)]));
    return rows.map((r) => ({
      playerId: r.id,
      telegramId: r.telegramId,
      username: r.username,
      riskScore: r.riskScore,
      flagReason: r.flagReason,
      flaggedAt: r.flaggedAt ? r.flaggedAt.toISOString() : null,
      ktBalance: r.ktBalance,
      paidWdCount: paidById.get(r.id) ?? 0,
    }));
  } catch {
    return [];
  }
}
