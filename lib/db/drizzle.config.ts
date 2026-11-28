import { defineConfig } from "drizzle-kit";
import path from "path";

// Prefer the standard PostgreSQL connection string. SUPABASE_DB_URL remains
// a fallback for environments that only provide the Supabase database URL.
const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!url) {
  throw new Error("DATABASE_URL (or SUPABASE_DB_URL) must be set to run migrations.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
