import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not set. Add the Supabase Postgres connection string as a server secret.");

const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1") || connectionString.includes("helium") || connectionString.includes("sslmode=disable");
const ca = process.env.SUPABASE_DB_CA?.replace(/\\n/g, "\n");

// Production connections keep certificate verification enabled. Supabase's
// database CA is supplied through SUPABASE_DB_CA so Render can verify the
// server certificate instead of disabling TLS verification.
const ssl = isLocal
  ? false
  : {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    };

export const pool = new Pool({ connectionString, ssl });
export const db = drizzle(pool, { schema });

export async function ensureTables(): Promise<void> {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS github_tokens (owner uuid PRIMARY KEY, encrypted_token text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS protected_repositories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner uuid NOT NULL, repo text NOT NULL UNIQUE, repo_url text NOT NULL, baseline_sha text NOT NULL, last_sha text NOT NULL, status text NOT NULL DEFAULT 'protected', last_score integer NOT NULL DEFAULT 100, critical_count integer NOT NULL DEFAULT 0, high_count integer NOT NULL DEFAULT 0, medium_count integer NOT NULL DEFAULT 0, last_event text, last_event_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS protected_repositories_owner_idx ON protected_repositories(owner)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS protection_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), repo text NOT NULL, event text NOT NULL, sha text NOT NULL, status text NOT NULL, findings_count integer NOT NULL DEFAULT 0, critical_count integer NOT NULL DEFAULT 0, high_count integer NOT NULL DEFAULT 0, medium_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now())`);
    await pool.query(`CREATE INDEX IF NOT EXISTS protection_events_repo_created_idx ON protection_events(repo, created_at DESC)`);
  } catch (err) {
    console.warn("[db] ensureTables() could not reach the database — skipping migration.", (err as Error).message);
  }
}

export * from "./schema";
