import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { createInstallState, getAppSlug, getInstallation, getLinkedInstallationForUser, listInstallationRepos, saveInstallation, verifyInstallState } from "../lib/githubApp";
import { canClaimGitHubInstallation } from "../lib/githubAppOwnership";

const router = Router();

router.get("/github/app/install-url", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  if (!req.githubProviderId) {
    res.status(403).json({ error: "Connect your GitHub identity before installing the App" });
    return;
  }
  try {
    const slug = await getAppSlug();
    const state = createInstallState(req.userId!);
    const installUrl = `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}`;
    res.json({ installUrl });
  } catch (error) {
    req.log.error({ err: error }, "Could not create GitHub App install URL");
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not start GitHub connection" });
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
    if (!account.type || !(await canClaimGitHubInstallation(req.userId!, req.githubProviderId, {
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
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not complete GitHub connection" });
  }
});

router.get("/github/app/repos", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  try {
    const linked = await getLinkedInstallationForUser(req.userId!);
    if (!linked) {
      res.status(404).json({ error: "No GitHub App installation found" });
      return;
    }
    if (!(await canClaimGitHubInstallation(req.userId!, req.githubProviderId, linked.account))) {
      res.status(403).json({ error: "GitHub account ownership must be reverified" });
      return;
    }
    const forceRefresh = String(req.query.refresh ?? "").toLowerCase() === "true";
    const repositories = await listInstallationRepos(linked.installationId, forceRefresh);
    res.setHeader("Cache-Control", forceRefresh ? "no-store" : "private, max-age=30, stale-while-revalidate=120");
    res.json(repositories);
  } catch (error) {
    req.log.error({ err: error }, "Could not list GitHub App repositories");
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not list GitHub repositories" });
  }
});

export default router;
