import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Stores encrypted GitHub OAuth tokens keyed by Supabase user UUID.
 * The encryption key lives in the GITHUB_TOKEN_ENCRYPTION_KEY secret.
 * This table lives in the Replit Postgres — no FK to Supabase auth.users.
 */
export const githubTokens = pgTable("github_tokens", {
  owner: uuid("owner").primaryKey(), // Supabase auth user id
  encryptedToken: text("encrypted_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type GithubToken = typeof githubTokens.$inferSelect;
