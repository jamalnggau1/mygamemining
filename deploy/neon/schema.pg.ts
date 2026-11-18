// Postgres (Neon) mirror of server/src/schema.ts for the Vercel
// deployment. Same table names, same column property names, same game
// semantics — only the dialect differs:
//   - SQLite integer "timestamp_ms" columns become TIMESTAMPTZ
//     (mode: "date", so handlers keep working with Date objects).
//   - wd amount columns stay floating point (DOUBLE PRECISION) because
//     WD amounts move in 0,5 GRAM steps.
//   - AUTOINCREMENT ids become BIGSERIAL identities.
// The DDL twin of this file is deploy/neon/init.sql — keep them in
// sync. The game handlers in server/src/actions.ts are written against
// the Drizzle query builder, so porting them to Neon means pointing
// the same queries at a drizzle-orm/neon-http database built from
// this schema (see deploy/README.md).

import {
  bigserial,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const player = pgTable("player", {
  id: integer("id").primaryKey(),
  ktBalance: integer("kt_balance").notNull().default(0),
  energy: integer("energy").notNull().default(20),
  energyUpdatedAt: timestamp("energy_updated_at", {
    withTimezone: true,
    mode: "date",
  })
    .notNull()
    .defaultNow(),
  layer: integer("layer").notNull().default(1),
  currentZone: integer("current_zone").notNull().default(0),
  premiumUntil: timestamp("premium_until", {
    withTimezone: true,
    mode: "date",
  }),
  premiumTier: text("premium_tier", { enum: ["standard", "pro"] }),
  grid: text("grid").notNull().default("[]"),
  expedition: text("expedition").notNull().default(""),
  job: text("job"),
  totalScans: integer("total_scans").notNull().default(0),
  asteroidsDone: integer("asteroids_done").notNull().default(0),
  totalDigs: integer("total_digs").notNull().default(0),
  totalKtEarned: integer("total_kt_earned").notNull().default(0),
  totalWdPaidGram: doublePrecision("total_wd_paid_gram").notNull().default(0),
});

export const inventory = pgTable("inventory", {
  oreId: text("ore_id").primaryKey(),
  qty: integer("qty").notNull().default(0),
});

export const upgrades = pgTable("upgrades", {
  upgradeId: text("upgrade_id").primaryKey(),
  level: integer("level").notNull().default(0),
});

export const wdRequests = pgTable("wd_requests", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  amountKt: integer("amount_kt").notNull(),
  amountGram: doublePrecision("amount_gram").notNull(),
  status: text("status", {
    enum: ["pending", "approved", "paid", "rejected", "cancelled"],
  })
    .notNull()
    .default("pending"),
  adminNote: text("admin_note"),
  txRef: text("tx_ref"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", {
    withTimezone: true,
    mode: "date",
  }),
});

export const premiumOrders = pgTable("premium_orders", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  plan: text("plan").notNull(),
  stars: integer("stars").notNull(),
  days: integer("days").notNull(),
  tier: text("tier", { enum: ["standard", "pro"] }).notNull(),
  status: text("status", {
    enum: ["pending", "confirmed", "rejected"],
  })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", {
    withTimezone: true,
    mode: "date",
  }),
});

export const activity = pgTable("activity", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  amountKt: integer("amount_kt"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});
