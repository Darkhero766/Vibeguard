import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// SUPABASE_DB_URL takes priority (Supabase Postgres for prod parity).
// Falls back to DATABASE_URL for the Replit-managed local Postgres in dev.
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SUPABASE_DB_URL must be set. Copy the DATABASE_URL value from .env.example and add it as a Replit Secret named SUPABASE_DB_URL.",
  );
}

export const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });

export * from "./schema";
