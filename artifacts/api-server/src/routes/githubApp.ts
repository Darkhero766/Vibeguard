import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { createInstallState, getAppSlug, getInstallation, getLinkedInstallationForUser, listInstallationRepos, saveInstallation, verifyInstallState } from "../lib/githubApp";
import { canClaimGitHubInstallation } from "../lib/githubAppOwnership";
import { classifyGitHubAppSetupError, missingGitHubAppPrerequisite } from "../lib/githubAppSetupDiagnostics";

/**
 * Resolve an App-install identity only from Supabase-controlled auth identities
 * belonging to the JWT user already verified by requireAuth. Some hosted Auth
 * /user responses omit provider_id from the inline identities JSON; that
 * absence must not force a legitimate GitHub OAuth user to connect twice.
 * Never trust user_metadata, a request header, a browser ID, or a GitHub token
 * merely posted by an authenticated client.
 */
async function resolveVerifiedGitHubId(req: AuthedRequest): Promise<number | undefined> {
  if (req.githubProviderId) return req.githubProviderId;
  if (!req.userId) return undefined;
  const { rows } = await pool.query<{ provider_id: string | number }>(
    "SELECT provider_id FROM auth.identities WHERE user_id = $1 AND provider = 'github' LIMIT 1",
    [req.userId],
  );
  const value = rows[0]?.provider_id;
  const text = typeof value === "string" ? value :
    typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  if (!/^[1-9][0-9]*$/.test(text)) return undefined;
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined;
  req.githubProviderId = parsed;
  return parsed;
}

// Staging-only, read-only preflight on startup. Inspect config presence and
// GitHub's authenticated App descriptor without logging credentials or App
// installation state. An actual GitHub installation is never created here.
if (process.env.VIBESANE_DEPLOYMENT_ENV === "staging") {
  const missing = missingGitHubAppPrerequisite();
  if (missing) {
    console.warn("[github-app] staging preflight", { reason: missing });
  } else {
    void getAppSlug().then(() => {
      createInstallState("staging-preflight-no-user");
      console.info("[github-app] staging preflight", { status: "ready" });
    }).catch((error: unknown) => {
      console.warn("[github-app] staging preflight", { reason: classifyGitHubAppSetupError(error) });
    });
  }
}

const router = Router();

router.get("/github/app/install-url", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  try {
    if (!await resolveVerifiedGitHubId(req)) {
      res.status(403).json({ error: "Sign in with GitHub on staging before installing the App" });
      return;
    }
    const slug = await getAppSlug();
    const state = createInstallState(req.userId!);
    const installUrl = `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
    res.setHeader("Cache-Control", "no-store");
    res.json({ installUrl });
  } catch (error) {
    // Emit only an allowlisted error category, never raw provider/crypto errors.
    const reason = missingGitHubAppPrerequisite() ?? classifyGitHubAppSetupError(error);
    req.log?.warn?.({ reason }, "Staging GitHub App installation setup failed");
    res.status(503).json({
      error: reason.startsWith("missing_")
        ? "GitHub App configuration is incomplete in staging"
        : "GitHub App installation is temporarily unavailable",
    });
  }
});

router.post("/github/app/complete", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const installationId = Number(req.body?.installationId);
  const state = typeof req.body?.state === "string" ? req.body.state : "";
  if (!Number.isSafeInteger(installationId) || installationId <= 0 || !state) {
    res.status(400).json({ error: "installationId and state are required" });
    return;
  }

  const stateUserId = verifyInstallState(state);
  if (!stateUserId || stateUserId !== req.userId) {
    res.status(403).json({ error: "Invalid or expired GitHub installation state" });
    return;
  }

  try {
    const installation = await getInstallation(installationId);
    const account = installation.account;
    if (!account?.login || typeof account.id !== "number" || !Number.isSafeInteger(account.id)) {
      res.status(502).json({ error: "GitHub installation did not include account information" });
      return;
    }
    const verifiedGitHubId = await resolveVerifiedGitHubId(req);
    if (!account.type || !(await canClaimGitHubInstallation(req.userId!, verifiedGitHubId, {
      id: account.id, login: account.login, type: account.type,
    }))) {
      res.status(403).json({ error: "GitHub installation account ownership could not be verified" });
      return;
    }
    await saveInstallation(req.userId!, installationId, account.login, account.id, account.type);
    const repositories = await listInstallationRepos(installationId, true);
    res.json({ ok: true, account: { login: account.login, type: account.type ?? "User" }, repositories });
  } catch (error) {
    req.log.error({ err: error, installationId }, "Could not complete GitHub App installation");
    res.status(502).json({ error: "Could not complete GitHub connection" });
  }
});

router.get("/github/app/repos", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  try {
    const linked = await getLinkedInstallationForUser(req.userId!);
    if (!linked) {
      res.status(404).json({ error: "No GitHub App installation found" });
      return;
    }
    const verifiedGitHubId = await resolveVerifiedGitHubId(req);
    if (!(await canClaimGitHubInstallation(req.userId!, verifiedGitHubId, linked.account))) {
      res.status(403).json({ error: "GitHub account ownership must be reverified" });
      return;
    }
    const forceRefresh = String(req.query.refresh ?? "").toLowerCase() === "true";
    const repositories = await listInstallationRepos(linked.installationId, forceRefresh);
    res.setHeader("Cache-Control", forceRefresh ? "no-store" : "private, max-age=30, stale-while-revalidate=120");
    res.json(repositories);
  } catch (error) {
    req.log.error({ err: error }, "Could not list GitHub App repositories");
    res.status(502).json({ error: "Could not list GitHub repositories" });
  }
});

export default router;
