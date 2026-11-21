/**
 * Staging-only fail-closed configuration preflight.
 * No networking, DB connections or credential logging. Production is unchanged.
 *
 * The explicit expected staging project ref is a deployment trust anchor:
 * comparing only SUPABASE_URL to SUPABASE_DB_URL is insufficient if BOTH are
 * accidentally pointed at production.
 */
export type StagingIsolationEnv = Readonly<Record<string, string | undefined>>;

export function assertStagingIsolation(env: StagingIsolationEnv = process.env): void {
  if (env.VIBESANE_DEPLOYMENT_ENV !== "staging") return;

  const fail = (reason: string): never => {
    // Never echo a DB URL, JWT, key, password or other sensitive value.
    throw new Error("Unsafe staging configuration: " + reason);
  };

  const expected = (env.VIBESANE_STAGING_SUPABASE_REF ?? "").trim().toLowerCase();
  if (!/^[a-z0-9]{15,32}$/.test(expected)) {
    fail("expected staging Supabase project ref is required");
  }

  // This staging deployment is pinned to the already approved, isolated
  // Supabase project. Matching API and DB URLs against an arbitrary environment
  // value is not enough: both could otherwise accidentally point at production.
  // Project refs are public identifiers, not credentials.
  const approvedStagingProject = "aojmjxxmsgnipbbrtvlz";
  if (expected !== approvedStagingProject) {
    fail("expected staging Supabase project ref does not match approved staging deployment");
  }

  let api: URL;
  let database: URL;
  try {
    api = new URL(env.SUPABASE_URL || "");
    database = new URL(env.SUPABASE_DB_URL || env.DATABASE_URL || "");
  } catch {
    return fail("staging Supabase URLs are required and must be valid");
  }

  if (api.protocol !== "https:" || api.hostname.toLowerCase() !== expected + ".supabase.co" ||
      api.username || api.password || api.port || api.search || api.hash ||
      api.pathname !== "/") {
    fail("Supabase API project does not match the approved staging project");
  }

  const isPostgresScheme = database.protocol === "postgres:" || database.protocol === "postgresql:";
  const hostname = database.hostname.toLowerCase();
  let username = "";
  try {
    username = decodeURIComponent(database.username);
  } catch {
    fail("invalid staging database username encoding");
  }

  // Session/transaction pooler: postgres.<project-ref>@*.pooler.supabase.com.
  // Direct DB: postgres@db.<project-ref>.supabase.co.
  // Never accept a localhost placeholder, generic Postgres host, or a
  // pooler whose username references a DIFFERENT project.
  const direct = hostname === "db." + expected + ".supabase.co" &&
    username === "postgres";
  const pooler = /^(?:[a-z0-9-]+\.)*pooler\.supabase\.com$/.test(hostname) &&
    username === "postgres." + expected;
  if (!isPostgresScheme || (!direct && !pooler) || !database.password) {
    fail("database connection is not the approved staging Supabase project");
  }

  if (env.DODO_PAYMENTS_ENVIRONMENT !== "test_mode") {
    fail("Dodo payments must be test_mode");
  }
  if (!env.VIBESANE_STAGING_ACCESS_KEY ||
      env.VIBESANE_STAGING_ACCESS_KEY.length < 32) {
    fail("staging API access key is absent or too short");
  }
  if (!/^[a-fA-F0-9]{64}$/.test(env.GITHUB_TOKEN_ENCRYPTION_KEY ?? "")) {
    fail("staging token encryption key must be a 32-byte hex secret");
  }
}
