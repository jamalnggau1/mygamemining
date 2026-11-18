// Drizzle schema for Dalam Tanah P2E.
//
// player: singleton row (id = 1) holding the server-authoritative game
// state — KT balance, energy, current sector (layer), the map (zone) the
// player is currently mining in (maps unlock as sectors advance and can
// be revisited freely), premium pass expiry + tier (null = free player;
// "pro" unlocks the dual drill), the
// asteroid the player is currently exploring (JSON expedition: identity,
// whether it has been scanned, and its mineral veins), and any timed
// operation in progress (JSON job: scan/mining with server-side start &
// end timestamps, so operations take real time and finish even while
// the page is closed). The legacy `grid` column is kept for migration
// compatibility but no longer used by the game.
// inventory: ore_id -> quantity held.
// upgrades: upgrade_id -> level owned.
// premium_orders: Telegram Stars purchase orders for the Premium Pass —
// the player pays in the Telegram bot, the owner confirms the Stars
// payment here and the pass (tier + days) activates.
// wd_requests: withdrawal requests that land in the owner's queue; the
// owner processes them manually (approve / pay in GRAM / reject+refund).
// amount_gram is REAL because WD amounts move in 0,5 GRAM steps (the
// first WD minimum is 0,5 GRAM = 500 KT, escalating per paid WD).
// activity: newest-first log of notable events (rare finds, sales,
// upgrades, WD events).

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const player = sqliteTable("player", {
  id: integer("id").primaryKey(),
  ktBalance: integer("kt_balance").notNull().default(0),
  energy: integer("energy").notNull().default(20),
  energyUpdatedAt: integer("energy_updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  layer: integer("layer").notNull().default(1),
  currentZone: integer("current_zone").notNull().default(0),
  premiumUntil: integer("premium_until", { mode: "timestamp_ms" }),
  premiumTier: text("premium_tier", { enum: ["standard", "pro"] }),
  grid: text("grid").notNull().default("[]"),
  expedition: text("expedition").notNull().default(""),
  job: text("job"),
  totalScans: integer("total_scans").notNull().default(0),
  asteroidsDone: integer("asteroids_done").notNull().default(0),
  totalDigs: integer("total_digs").notNull().default(0),
  totalKtEarned: integer("total_kt_earned").notNull().default(0),
  totalWdPaidGram: real("total_wd_paid_gram").notNull().default(0),
});

export const inventory = sqliteTable("inventory", {
  oreId: text("ore_id").primaryKey(),
  qty: integer("qty").notNull().default(0),
});

export const upgrades = sqliteTable("upgrades", {
  upgradeId: text("upgrade_id").primaryKey(),
  level: integer("level").notNull().default(0),
});

export const wdRequests = sqliteTable("wd_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  walletAddress: text("wallet_address").notNull(),
  amountKt: integer("amount_kt").notNull(),
  amountGram: real("amount_gram").notNull(),
  status: text("status", {
    enum: ["pending", "approved", "paid", "rejected", "cancelled"],
  })
    .notNull()
    .default("pending"),
  adminNote: text("admin_note"),
  txRef: text("tx_ref"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
});

export const premiumOrders = sqliteTable("premium_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  plan: text("plan").notNull(),
  stars: integer("stars").notNull(),
  days: integer("days").notNull(),
  tier: text("tier", { enum: ["standard", "pro"] }).notNull(),
  status: text("status", {
    enum: ["pending", "confirmed", "rejected"],
  })
    .notNull()
    .default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }),
});

export const activity = sqliteTable("activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  amountKt: integer("amount_kt"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
