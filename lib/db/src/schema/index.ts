import { bigint, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Stores encrypted GitHub OAuth tokens keyed by Supabase user UUID.
 * The encryption key lives in the GITHUB_TOKEN_ENCRYPTION_KEY secret.
 */
export const githubTokens = pgTable("github_tokens", {
  owner: uuid("owner").primaryKey(),
  encryptedToken: text("encrypted_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Stores the GitHub App installation selected by a VibeGuard account. */
export const githubAppInstallations = pgTable("github_app_installations", {
  owner: uuid("owner").primaryKey(),
  installationId: bigint("installation_id", { mode: "number" }).notNull().unique(),
  accountLogin: text("account_login").notNull(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  accountType: text("account_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** A repository selected for continuous VibeSane protection. */
export const protectedRepositories = pgTable("protected_repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner: uuid("owner").notNull(),
  repo: text("repo").notNull().unique(),
  repoUrl: text("repo_url").notNull(),
  baselineSha: text("baseline_sha").notNull(),
  lastSha: text("last_sha").notNull(),
  status: text("status").notNull().default("protected"),
  lastScore: integer("last_score").notNull().default(100),
  criticalCount: integer("critical_count").notNull().default(0),
  highCount: integer("high_count").notNull().default(0),
  mediumCount: integer("medium_count").notNull().default(0),
  lastEvent: text("last_event"),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Lightweight activity history used by the Pro protection dashboard. */
export const protectionEvents = pgTable("protection_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  repo: text("repo").notNull(),
  event: text("event").notNull(),
  sha: text("sha").notNull(),
  status: text("status").notNull(),
  findingsCount: integer("findings_count").notNull().default(0),
  criticalCount: integer("critical_count").notNull().default(0),
  highCount: integer("high_count").notNull().default(0),
  mediumCount: integer("medium_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type GithubToken = typeof githubTokens.$inferSelect;
export type GithubAppInstallation = typeof githubAppInstallations.$inferSelect;
export type ProtectedRepository = typeof protectedRepositories.$inferSelect;
export type ProtectionEvent = typeof protectionEvents.$inferSelect;
