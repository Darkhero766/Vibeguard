import { pool } from "@workspace/db";

export const ADMIN_EMAIL = "nightowlclub72@gmail.com";
export const FREE_SCAN_LIMIT = 1;
export const PRO_SCAN_LIMIT = 10;
export const FREE_REPO_LIMIT = 1;
export const PRO_REPO_LIMIT = 5;

export type PlanSnapshot = {
  plan: "free" | "pro";
  scansUsed: number;
  scansLimit: number;
  repoLimit: number;
  proExpiresAt: string | null;
  monthlyResetAt: string | null;
};

export async function ensurePlanForUser(userId: string): Promise<PlanSnapshot> {
  const result = await pool.query(`
    SELECT u.email,
           COALESCE(g.plan, 'free') AS plan,
           COALESCE(g.monthly_scans_used, g.scans_used, 0) AS scans_used,
           COALESCE(g.monthly_scans_limit, g.scans_limit, 1) AS scans_limit,
           g.pro_expires_at,
           g.monthly_reset_at
      FROM auth.users u
      LEFT JOIN public.usage g ON g.owner = u.id
     WHERE u.id = $1
     LIMIT 1`, [userId]);
  const row = result.rows[0];
  if (!row) throw new Error("Account not found");

  const now = new Date();
  const resetAt = row.monthly_reset_at ? new Date(row.monthly_reset_at) : null;
  const expired = row.plan === "pro" && row.pro_expires_at && new Date(row.pro_expires_at) <= now;
  const needsReset = !resetAt || resetAt <= now;
  const isAdmin = String(row.email).toLowerCase() === ADMIN_EMAIL;
  const shouldBePro = isAdmin || (row.plan === "pro" && !expired);
  const nextLimit = shouldBePro ? PRO_SCAN_LIMIT : FREE_SCAN_LIMIT;
  const nextRepoLimit = shouldBePro ? PRO_REPO_LIMIT : FREE_REPO_LIMIT;
  const nextReset = needsReset ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) : resetAt!;
  const nextUsed = needsReset ? 0 : Number(row.scans_used ?? 0);
  const nextPlan = shouldBePro ? "pro" : "free";
  const nextExpiry = isAdmin ? null : (expired ? null : row.pro_expires_at);

  await pool.query(`
    INSERT INTO public.usage (owner, scans_used, scans_limit, plan, pro_expires_at, monthly_scans_used, monthly_scans_limit, monthly_reset_at)
    VALUES ($1, $2, $3, $4, $5, $2, $3, $6)
    ON CONFLICT (owner) DO UPDATE SET
      scans_used = EXCLUDED.scans_used,
      scans_limit = EXCLUDED.scans_limit,
      plan = EXCLUDED.plan,
      pro_expires_at = EXCLUDED.pro_expires_at,
      monthly_scans_used = EXCLUDED.monthly_scans_used,
      monthly_scans_limit = EXCLUDED.monthly_scans_limit,
      monthly_reset_at = EXCLUDED.monthly_reset_at`,
    [userId, nextUsed, nextLimit, nextPlan, nextExpiry, nextReset.toISOString()]);

  return { plan: nextPlan, scansUsed: nextUsed, scansLimit: nextLimit, repoLimit: nextRepoLimit, proExpiresAt: nextExpiry, monthlyResetAt: nextReset.toISOString() };
}

export async function consumeScan(userId: string): Promise<PlanSnapshot> {
  const snapshot = await ensurePlanForUser(userId);
  if (snapshot.scansUsed >= snapshot.scansLimit) {
    const error = new Error(`Monthly scan limit reached (${snapshot.scansLimit}).`);
    Object.assign(error, { status: 429 });
    throw error;
  }
  await pool.query(`UPDATE public.usage SET scans_used = scans_used + 1, monthly_scans_used = monthly_scans_used + 1 WHERE owner = $1`, [userId]);
  return { ...snapshot, scansUsed: snapshot.scansUsed + 1 };
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
