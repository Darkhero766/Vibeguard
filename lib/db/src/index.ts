import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("SUPABASE_DB_URL is not set. Add the Supabase Postgres connection string as a server secret.");

const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1") || connectionString.includes("helium") || connectionString.includes("sslmode=disable");
const ca = process.env.SUPABASE_DB_CA?.replace(/\\n/g, "\n");

const ssl = isLocal
  ? false
  : {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    };

export const pool = new Pool({
  connectionString,
  ssl,
  // Never allow a database/network problem to block application startup.
  // Render must be able to reach the HTTP health endpoint independently.
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 5,
});
export const db = drizzle(pool, { schema });

/** Required production tables/columns. Read-only readiness checks replace
 * historical request/startup CREATE, ALTER and admin entitlement backfills.
 * Schema changes must be explicit, versioned and approved migrations. */
const REQUIRED_SCHEMA: Readonly<Record<string, readonly string[]>> = {
  github_tokens: ["owner", "encrypted_token"],
  github_app_installations: ["owner", "installation_id", "account_login"],
  protected_repositories: ["id", "owner", "repo"],
  protection_events: ["id", "repo", "event", "sha", "base_sha", "status", "findings_count",
    "critical_count", "high_count", "medium_count", "details", "created_at"],
  usage: ["owner", "plan", "scans_used", "scans_limit", "monthly_scans_used",
    "monthly_scans_limit", "protected_scans_used", "public_scans_used", "audit_scans_used",
    "pro_expires_at", "dodo_customer_id", "dodo_subscription_id"],
  audit_runs: ["id", "owner", "checks", "score"],
  api_rate_limits: ["bucket_key", "window_started_at", "request_count"],
  dodo_webhook_events: ["webhook_id", "event_type", "processed"],
  hackathon_redemptions: ["owner", "coupon_code"],
};

export async function checkRequiredSchema(): Promise<{
  ready: boolean;
  missing: string[];
}> {
  const query = await pool.query<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  );
  const tables = new Map<string, Set<string>>();
  for (const row of query.rows) {
    const columns = tables.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    tables.set(row.table_name, columns);
  }
  const missing: string[] = [];
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    const existing = tables.get(table);
    for (const col of columns) if (!existing?.has(col)) missing.push(table + "." + col);
  }
  return { ready: missing.length === 0, missing };
}

export async function ensureTables(): Promise<void> {
  // Historical public name retained to avoid breaking callers; no DDL occurs.
  const schema = await checkRequiredSchema();
  if (!schema.ready) throw new Error("Database schema requires reviewed migrations: " + schema.missing.join(", "));
}

export * from "./schema";
