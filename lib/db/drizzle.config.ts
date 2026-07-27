import { defineConfig } from "drizzle-kit";
import path from "path";

const url =
  process.env.NODE_ENV === "production"
    ? process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!url) {
  throw new Error("SUPABASE_DB_URL (or DATABASE_URL) must be set to run migrations.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: { url },
});
