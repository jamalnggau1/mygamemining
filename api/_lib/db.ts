// Neon Postgres access for the Vercel serverless deployment of
// ASTRA MINING.
//
// SECURITY RULES (owner requirement):
// - The connection string comes ONLY from the DATABASE_URL environment
//   variable (set in the Vercel project settings). It is never written
//   to code, files, or logs — this module never logs it, never returns
//   it, and error messages never include it.
// - SSL is mandatory: if the URL does not already carry
//   sslmode=require, it is appended before connecting, and the query
//   itself travels over Neon's HTTPS SQL endpoint, so the transport is
//   always TLS-encrypted.
//
// Implementation note: this uses Neon's HTTPS SQL endpoint directly via
// fetch (the same protocol the @neondatabase/serverless driver speaks),
// so the Vercel functions need zero npm dependencies. Queries are
// parameterized ($1, $2, ...) — never string-interpolate user input
// into SQL.

type NeonHttpResponse = {
  rows?: Record<string, unknown>[];
  fields?: { name: string }[];
  rowCount?: number;
  command?: string;
  error?: { message?: string };
};

/** Returns the DATABASE_URL from the environment with sslmode=require
 *  guaranteed. Throws a generic error (no secret material) when unset. */
function connectionString(): { conn: string; host: string } {
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
  const conn = parsed.searchParams.get("sslmode") === "require"
    ? raw
    : raw + (raw.includes("?") ? "&" : "?") + "sslmode=require";
  return { conn, host: parsed.hostname };
}

/** Runs one parameterized SQL statement against Neon over HTTPS and
 *  returns the result rows (text output mode: values come back as
 *  strings, mirroring how the serverless driver behaves with
 *  `fullResults` off). */
export async function neonQuery(
  query: string,
  params: (string | number | boolean | null)[] = [],
): Promise<Record<string, unknown>[]> {
  const { conn, host } = connectionString();
  const res = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: {
      "Neon-Connection-String": conn,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "false",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, params }),
  });
  const data = (await res.json().catch(() => ({}))) as NeonHttpResponse;
  if (!res.ok) {
    // Deliberately generic: never surface the connection string or the
    // request headers, only Neon's own error message.
    throw new Error(
      `Query Neon gagal (${res.status}): ${data.error?.message ?? "unknown error"}`,
    );
  }
  return data.rows ?? [];
}

/** The six game tables the Neon database must contain (created by
 *  deploy/neon/init.sql). */
export const GAME_TABLES = [
  "player",
  "inventory",
  "upgrades",
  "wd_requests",
  "premium_orders",
  "activity",
] as const;
