// Neon-backed Drizzle database for the Vercel deployment of
// ASTRA MINING.
//
// This is the ONLY way the game code reaches Postgres. It replaces
// the Muse runtime's ctx.db: the game handlers in api/_lib/game.ts
// are written against the same Drizzle query builder, so their logic
// is unchanged — only the database behind it moved (SQLite in the
// Muse runtime -> Neon Postgres here, schema in
// deploy/neon/schema.pg.ts, DDL in deploy/neon/init.sql).
//
// SECURITY RULES (owner requirement):
// - The connection string comes ONLY from the DATABASE_URL environment
//   variable (set in the Vercel project settings). It is never written
//   to code, files, or logs — this module never logs it, never returns
//   it, and error messages never include it.
// - SSL is mandatory: if the URL does not already carry
//   sslmode=require, it is appended before connecting (mirrors
//   api/_lib/db.ts).

import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "../../deploy/neon/schema.pg";

export { schema };

/** Returns DATABASE_URL with sslmode=require guaranteed. Throws a
 *  generic error (no secret material) when unset or malformed. */
function connectionString(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL belum diatur. Set environment variable DATABASE_URL di Vercel project settings (atau .env.local untuk lokal).",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL tidak valid sebagai URL koneksi Postgres.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL harus berupa koneksi Postgres (postgres://...).");
  }
  return parsed.searchParams.get("sslmode") === "require"
    ? raw
    : raw + (raw.includes("?") ? "&" : "?") + "sslmode=require";
}

type NeonDb = NeonHttpDatabase<typeof schema>;

let dbInstance: NeonDb | null = null;

/** Lazily builds (and caches per serverless instance) the Drizzle
 *  client over Neon's HTTPS SQL endpoint. No persistent TCP
 *  connection is held, so this is safe in serverless functions. */
export function getDb(): NeonDb {
  if (!dbInstance) {
    dbInstance = drizzle(neon(connectionString()), { schema });
  }
  return dbInstance;
}

/** The Drizzle database type the game handlers work with. */
export type Db = NeonDb;
