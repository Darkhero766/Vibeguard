import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { adminCheck, ensurePlanForUser, PRO_REPO_LIMIT, PRO_SCAN_LIMIT } from "../lib/plan";
import { pool } from "@workspace/db";

const router = Router();

async function requireAdmin(req: AuthedRequest, res: any, next: any) {
  if (!req.userId || !(await adminCheck(req.userId))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

router.get("/admin/overview", requireAuth, requireAdmin, async (_req: AuthedRequest, res) => {
  try {
    const [users, plans, scans, repos, events] = await Promise.all([
      pool.query(`SELECT count(*)::int AS count FROM auth.users`),
      pool.query(`SELECT count(*) FILTER (WHERE plan = 'pro' AND (pro_expires_at IS NULL OR pro_expires_at > now()))::int AS pro, count(*) FILTER (WHERE plan <> 'pro' OR (pro_expires_at IS NOT NULL AND pro_expires_at <= now()))::int AS free FROM public.usage`),
      pool.query(`SELECT COALESCE(sum(monthly_scans_used),0)::int AS count FROM public.usage`),
      pool.query(`SELECT count(*)::int AS count FROM public.protected_repositories`),
      pool.query(`SELECT count(*)::int AS count FROM public.protection_events WHERE created_at >= now() - interval '30 days'`),
    ]);
    res.json({
      users: Number(users.rows[0]?.count ?? 0),
      proUsers: Number(plans.rows[0]?.pro ?? 0),
      freeUsers: Number(plans.rows[0]?.free ?? 0),
      scans: Number(scans.rows[0]?.count ?? 0),
      protectedRepositories: Number(repos.rows[0]?.count ?? 0),
      events30d: Number(events.rows[0]?.count ?? 0),
      proLimits: { monthlyScans: PRO_SCAN_LIMIT, repositories: PRO_REPO_LIMIT },
    });
  } catch (error) {
    req.log.error({ err: error }, "Could not load admin overview");
    res.status(500).json({ error: "Could not load admin overview" });
  }
});

router.get("/admin/users", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.created_at,
             COALESCE(g.plan, 'free') AS plan,
             COALESCE(g.monthly_scans_used, g.scans_used, 0)::int AS scans_used,
             COALESCE(g.monthly_scans_limit, g.scans_limit, 1)::int AS scans_limit,
             g.pro_expires_at
        FROM auth.users u
        LEFT JOIN public.usage g ON g.owner = u.id
       WHERE ($1 = '' OR lower(u.email) LIKE lower('%' || $1 || '%'))
       ORDER BY u.created_at DESC
       LIMIT 100`, [search]);
    res.json({ users: result.rows });
  } catch (error) {
    req.log.error({ err: error }, "Could not load admin users");
    res.status(500).json({ error: "Could not load users" });
  }
});

router.post("/admin/users/:userId/pro", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const targetId = req.params.userId;
  const days = Math.max(1, Math.min(3650, Number(req.body?.days ?? 30)));
  try {
    const result = await pool.query(`
      INSERT INTO public.usage (owner, scans_used, scans_limit, plan, pro_expires_at, monthly_scans_used, monthly_scans_limit, monthly_reset_at)
      VALUES ($1, 0, $2, 'pro', now() + ($3 * interval '1 day'), 0, $2, now() + interval '30 days')
      ON CONFLICT (owner) DO UPDATE SET
        plan = 'pro', scans_limit = $2, monthly_scans_limit = $2,
        pro_expires_at = CASE WHEN usage.pro_expires_at IS NULL OR usage.pro_expires_at < now() THEN now() + ($3 * interval '1 day') ELSE usage.pro_expires_at + ($3 * interval '1 day') END
      RETURNING plan, pro_expires_at, monthly_scans_used, monthly_scans_limit`, [targetId, PRO_SCAN_LIMIT, days]);
    if (!result.rows[0]) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ user: result.rows[0] });
  } catch (error) {
    req.log.error({ err: error }, "Could not grant Pro");
    res.status(500).json({ error: "Could not grant Pro" });
  }
});

router.post("/admin/users/:userId/revoke-pro", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    await pool.query(`UPDATE public.usage SET plan = 'free', scans_limit = 1, monthly_scans_limit = 1, pro_expires_at = now() WHERE owner = $1`, [req.params.userId]);
    res.json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "Could not revoke Pro");
    res.status(500).json({ error: "Could not revoke Pro" });
  }
});

router.get("/admin/me", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try { res.json(await ensurePlanForUser(req.userId!)); }
  catch { res.status(500).json({ error: "Could not load admin plan" }); }
});

export default router;
