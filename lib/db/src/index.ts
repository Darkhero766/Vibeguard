import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Always prefer SUPABASE_DB_URL when it is set — this is the authoritative
// database for both development and production. Fall back to Replit's
// runtime-managed DATABASE_URL only when SUPABASE_DB_URL is absent (e.g.
// a purely local sandbox session with no Supabase project wired up).
const connectionString =
  process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SUPABASE_DB_URL is not set. Add the Supabase Postgres connection string as a Replit Secret.",
  );
}

// Supabase requires SSL; local Replit Postgres does not.
const isLocal =
  connectionString.includes("localhost") ||
  connectionString.includes("127.0.0.1") ||
  connectionString.includes("helium") ||
  connectionString.includes("sslmode=disable");

export const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

/**
 * Idempotent startup migration — creates any tables that don't yet exist.
 * Non-fatal: logs a warning if the database is unreachable (e.g. Supabase is
 * not reachable from the Replit dev sandbox) so the server still starts locally.
 * In the production deployment the database IS reachable and the table is
 * created automatically on first boot.
 */
export async function ensureTables(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS github_tokens (
        owner           uuid        PRIMARY KEY,
        encrypted_token text        NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now()
      );
    `);
  } catch (err) {
    console.warn(
      "[db] ensureTables() could not reach the database — skipping migration.",
      (err as Error).message,
    );
  }
}

export * from "./schema";
