import { pool } from "@workspace/db";

export const ADMIN_EMAIL = "nightowlclub72@gmail.com";
export const FREE_SCAN_LIMIT = 1;
export const PRO_SCAN_LIMIT = 10;
export const PRO_PROTECTED_SCAN_LIMIT = 5;
export const PRO_PUBLIC_SCAN_LIMIT = 5;
export const FREE_REPO_LIMIT = 1;
export const PRO_REPO_LIMIT = 5;

type UsageRow = {
  email: string;
  plan: string;
  scans_used: number | null;
  scans_limit: number | null;
  protected_scans_used: number | null;
  public_scans_used: number | null;
  pro_expires_at: string | null;
  monthly_reset_at: string | null;
};

export type PlanSnapshot = {
  plan: "free" | "pro";
  scansUsed: number;
  scansLimit: number;
  protectedScansUsed: number;
  protectedScansLimit: number;
  publicScansUsed: number;
  publicScansLimit: number;
  repoLimit: number;
  proExpiresAt: string | null;
  monthlyResetAt: string | null;
};

// The usage table predates the split quota model. Keep the migration self-healing so
// an existing production database gains the two counters without a manual SQL step.
let quotaSchemaReady: Promise<void> | null = null;
async function ensureQuotaSchema(): Promise<void> {
  if (!quotaSchemaReady) {
    quotaSchemaReady = (async () => {
      await pool.query(`ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS protected_scans_used integer NOT NULL DEFAULT 0`);
      await pool.query(`ALTER TABLE public.usage ADD COLUMN IF NOT EXISTS public_scans_used integer NOT NULL DEFAULT 0`);
      // Preserve historical usage in the public-scan bucket on first migration.
      await pool.query(`UPDATE public.usage SET public_scans_used = GREATEST(COALESCE(public_scans_used, 0), COALESCE(monthly_scans_used, scans_used, 0)) WHERE COALESCE(monthly_scans_used, scans_used, 0) > 0 AND COALESCE(protected_scans_used, 0) = 0 AND COALESCE(public_scans_used, 0) = 0`);
    })().catch((error) => {
      quotaSchemaReady = null;
      throw error;
    });
  }
  await quotaSchemaReady;
}

function snapshotFromRow(row: UsageRow, now: Date): PlanSnapshot {
  const resetAt = row.monthly_reset_at ? new Date(row.monthly_reset_at) : null;
  const expired = row.plan === "pro" && row.pro_expires_at && new Date(row.pro_expires_at) <= now;
  const isAdmin = String(row.email).toLowerCase() === ADMIN_EMAIL;
  const shouldBePro = isAdmin || (row.plan === "pro" && !expired);
  const protectedUsed = Number(row.protected_scans_used ?? 0);
  const publicUsed = Number(row.public_scans_used ?? 0);
  return {
    plan: shouldBePro ? "pro" : "free",
    scansUsed: protectedUsed + publicUsed,
    scansLimit: shouldBePro ? PRO_SCAN_LIMIT : FREE_SCAN_LIMIT,
    protectedScansUsed: protectedUsed,
    protectedScansLimit: shouldBePro ? PRO_PROTECTED_SCAN_LIMIT : FREE_SCAN_LIMIT,
    publicScansUsed: publicUsed,
    publicScansLimit: shouldBePro ? PRO_PUBLIC_SCAN_LIMIT : FREE_SCAN_LIMIT,
    repoLimit: shouldBePro ? PRO_REPO_LIMIT : FREE_REPO_LIMIT,
    proExpiresAt: isAdmin ? null : (expired ? null : row.pro_expires_at),
    monthlyResetAt: resetAt?.toISOString() ?? null,
  };
}

export async function ensurePlanForUser(userId: string): Promise<PlanSnapshot> {
  await ensureQuotaSchema();
  const result = await pool.query(`
    SELECT u.email,
           COALESCE(g.plan, 'free') AS plan,
           COALESCE(g.scans_limit, 1) AS scans_limit,
           COALESCE(g.protected_scans_used, 0) AS protected_scans_used,
           COALESCE(g.public_scans_used, g.monthly_scans_used, g.scans_used, 0) AS public_scans_used,
           g.pro_expires_at,
           g.monthly_reset_at
      FROM auth.users u
      LEFT JOIN public.usage g ON g.owner = u.id
     WHERE u.id = $1
     LIMIT 1`, [userId]);
  const row = result.rows[0] as UsageRow | undefined;
  if (!row) throw new Error("Account not found");

  const now = new Date();
  const resetAt = row.monthly_reset_at ? new Date(row.monthly_reset_at) : null;
  const expired = row.plan === "pro" && row.pro_expires_at && new Date(row.pro_expires_at) <= now;
  const needsReset = !resetAt || resetAt <= now;
  const isAdmin = String(row.email).toLowerCase() === ADMIN_EMAIL;
  const shouldBePro = isAdmin || (row.plan === "pro" && !expired);
  const nextPlan = shouldBePro ? "pro" : "free";
  const nextReset = needsReset ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : resetAt!;
  const nextProtectedUsed = needsReset ? 0 : Number(row.protected_scans_used ?? 0);
  const nextPublicUsed = needsReset ? 0 : Number(row.public_scans_used ?? 0);
  const nextLimit = shouldBePro ? PRO_SCAN_LIMIT : FREE_SCAN_LIMIT;
  const nextRepoLimit = shouldBePro ? PRO_REPO_LIMIT : FREE_REPO_LIMIT;
  const nextExpiry = isAdmin ? null : (expired ? null : row.pro_expires_at);

  await pool.query(`
    INSERT INTO public.usage (owner, scans_used, scans_limit, plan, pro_expires_at, monthly_scans_used, monthly_scans_limit, monthly_reset_at, protected_scans_used, public_scans_used)
    VALUES ($1, $2, $3, $4, $5, $2, $3, $6, $7, $8)
    ON CONFLICT (owner) DO UPDATE SET
      scans_used = EXCLUDED.scans_used,
      scans_limit = EXCLUDED.scans_limit,
      plan = EXCLUDED.plan,
      pro_expires_at = EXCLUDED.pro_expires_at,
      monthly_scans_used = EXCLUDED.monthly_scans_used,
      monthly_scans_limit = EXCLUDED.monthly_scans_limit,
      monthly_reset_at = EXCLUDED.monthly_reset_at,
      protected_scans_used = EXCLUDED.protected_scans_used,
      public_scans_used = EXCLUDED.public_scans_used`,
    [userId, nextProtectedUsed + nextPublicUsed, nextLimit, nextPlan, nextExpiry, nextReset.toISOString(), nextProtectedUsed, nextPublicUsed]);

  return {
    plan: nextPlan,
    scansUsed: nextProtectedUsed + nextPublicUsed,
    scansLimit: nextLimit,
    protectedScansUsed: nextProtectedUsed,
    protectedScansLimit: shouldBePro ? PRO_PROTECTED_SCAN_LIMIT : FREE_SCAN_LIMIT,
    publicScansUsed: nextPublicUsed,
    publicScansLimit: shouldBePro ? PRO_PUBLIC_SCAN_LIMIT : FREE_SCAN_LIMIT,
    repoLimit: nextRepoLimit,
    proExpiresAt: nextExpiry,
    monthlyResetAt: nextReset.toISOString(),
  };
}

async function consumeBucket(userId: string, bucket: "protected" | "public"): Promise<PlanSnapshot> {
  const snapshot = await ensurePlanForUser(userId);
  const isPro = snapshot.plan === "pro";
  const limit = bucket === "protected" ? snapshot.protectedScansLimit : snapshot.publicScansLimit;
  const used = bucket === "protected" ? snapshot.protectedScansUsed : snapshot.publicScansUsed;
  if (used >= limit) {
    const label = bucket === "protected" ? "protected repository scan" : "public repository scan";
    const error = new Error(`${label} limit reached (${limit}).`);
    Object.assign(error, { status: 429 });
    throw error;
  }

  const column = bucket === "protected" ? "protected_scans_used" : "public_scans_used";
  const result = await pool.query(`
    UPDATE public.usage
       SET ${column} = COALESCE(${column}, 0) + 1,
           scans_used = COALESCE(protected_scans_used, 0) + COALESCE(public_scans_used, 0) + 1,
           monthly_scans_used = COALESCE(protected_scans_used, 0) + COALESCE(public_scans_used, 0) + 1
     WHERE owner = $1
       AND COALESCE(${column}, 0) < $2
     RETURNING protected_scans_used, public_scans_used`, [userId, limit]);
  if (!result.rowCount) {
    const error = new Error(`${bucket === "protected" ? "Protected repository" : "Public repository"} scan limit reached (${limit}).`);
    Object.assign(error, { status: 429 });
    throw error;
  }

  const row = result.rows[0];
  const protectedUsed = Number(row.protected_scans_used ?? 0);
  const publicUsed = Number(row.public_scans_used ?? 0);
  return { ...snapshot, scansUsed: protectedUsed + publicUsed, protectedScansUsed: protectedUsed, publicScansUsed: publicUsed };
}

export async function consumePublicScan(userId: string): Promise<PlanSnapshot> {
  return consumeBucket(userId, "public");
}

export async function consumeProtectedScan(userId: string): Promise<PlanSnapshot> {
  return consumeBucket(userId, "protected");
}

// Backward-compatible name: the standalone URL scanner is the public bucket.
export async function consumeScan(userId: string): Promise<PlanSnapshot> {
  return consumePublicScan(userId);
}

export async function assertRepositoryCapacity(userId: string): Promise<PlanSnapshot> {
  const snapshot = await ensurePlanForUser(userId);
  const result = await pool.query(`SELECT count(*)::int AS count FROM public.protected_repositories WHERE owner = $1`, [userId]);
  if (Number(result.rows[0]?.count ?? 0) >= snapshot.repoLimit) {
    const error = new Error(`Repository limit reached (${snapshot.repoLimit}).`);
    Object.assign(error, { status: 429 });
    throw error;
  }
  return snapshot;
}

export async function adminCheck(userId: string): Promise<boolean> {
  const result = await pool.query(`SELECT lower(email) = lower($2) AS allowed FROM auth.users WHERE id = $1`, [userId, ADMIN_EMAIL]);
  return Boolean(result.rows[0]?.allowed);
}
