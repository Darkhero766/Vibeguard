import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/**
 * Idempotent startup migration — creates any tables that don't yet exist.
 * Call this once before the HTTP server begins accepting requests so that both
 * the development and production databases are always in sync without a
 * separate migration step.
 */
export async function ensureTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS github_tokens (
      owner          uuid        PRIMARY KEY,
      encrypted_token text       NOT NULL,
      created_at     timestamptz NOT NULL DEFAULT now()
    );
  `);
}

export * from "./schema";
