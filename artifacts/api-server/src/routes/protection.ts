import { Router } from "express";
import { rateLimit } from "../middlewares/rateLimit";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { getGithubTokenForUser } from "../lib/github";
import { getInstallationIdForUser, getInstallationToken } from "../lib/githubApp";
import { scanRepositorySecurity } from "../lib/securityScanPipeline";
import { TOTAL_SECURITY_CHECKS } from "../lib/securityCheckCatalog";
import { getProtectedRepository, listProtectedRepositories, listProtectionEvents, saveProtectedRepository } from "../lib/protectionStore";
import { assertRepositoryCapacity, consumeProtectedScan, ensurePlanForUser } from "../lib/plan";

const router = Router();
const githubUrlPattern = /^https:\/\/github\.com\/[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+\/?$/;

function score(findings: Array<{ severity: string }>) {
  return Math.max(0, 100 - findings.reduce((sum, f) => sum + (f.severity === "Critical" ? 18 : f.severity === "High" ? 10 : 4), 0));
}

async function currentSha(repoUrl: string, token?: string) {
  const parsed = new URL(repoUrl);
  const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
  const headers = { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}), "X-GitHub-Api-Version": "2022-11-28" };
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, { headers });
  if (!response.ok) throw new Error(`GitHub repository metadata failed: ${response.status}`);
  const data = (await response.json()) as { default_branch?: string };
  const branch = data.default_branch ?? "main";
  const refResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(branch)}`, { headers });
  if (!refResponse.ok) throw new Error(`GitHub commit metadata failed: ${refResponse.status}`);
  const commit = (await refResponse.json()) as { sha?: string };
  if (!commit.sha) throw new Error("GitHub did not return the repository head SHA");
  return commit.sha;
}

async function getBestGithubToken(userId: string, userJwt: string): Promise<string | undefined> {
  const installationId = await getInstallationIdForUser(userId);
  if (installationId) return getInstallationToken(installationId);
  return (await getGithubTokenForUser(userId, userJwt)) ?? undefined;
}

router.get("/protection", requireAuth, async (req: AuthedRequest, res) => {
  try { res.json({ repositories: await listProtectedRepositories(req.userId!) }); }
  catch (error) { req.log.error({ err: error }, "Could not list protected repositories"); res.status(500).json({ error: "Could not load protected repositories" }); }
});

router.get("/protection/:repo/events", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rawRepo = req.params.repo;
    if (typeof rawRepo !== 'string') { res.status(400).json({ error: 'Invalid repository name' }); return; }
    const repo = decodeURIComponent(rawRepo);
    const protectedRepo = await getProtectedRepository(repo);
    if (!protectedRepo || protectedRepo.owner !== req.userId) { res.status(404).json({ error: "Protected repository not found" }); return; }
    res.json({ repository: protectedRepo, events: await listProtectionEvents(repo) });
  } catch (error) { req.log.error({ err: error }, "Could not load protection activity"); res.status(500).json({ error: "Could not load protection activity" }); }
});

router.post("/protection", rateLimit({ name: "protection", windowMs: 60_000, max: 6 }), requireAuth, async (req: AuthedRequest, res) => {
  const repoUrl = typeof req.body?.repoUrl === "string" ? req.body.repoUrl.trim().replace(/\/$/, "") : "";
  if (!githubUrlPattern.test(repoUrl)) { res.status(400).json({ error: "Enter a valid GitHub repository URL." }); return; }

  try {
    const token = await getBestGithubToken(req.userId!, req.userJwt!);
    const [repoOwner, repoName] = new URL(repoUrl).pathname.split("/").filter(Boolean);
    const repo = `${repoOwner}/${repoName}`;
    const existing = await getProtectedRepository(repo);
    if (existing && existing.owner !== req.userId) {
      res.status(409).json({ error: "This repository is already protected by another VibeSane account." });
      return;
    }
    if (!existing) {
      await assertRepositoryCapacity(req.userId!);
      const plan = await ensurePlanForUser(req.userId!);
      if (!plan.unlimited && plan.protectedScansUsed >= plan.protectedScansLimit) {
        const error = new Error(`Protected repository scan limit reached (${plan.protectedScansLimit}).`);
        Object.assign(error, { status: 429 });
        throw error;
      }
    }

    const sha = await currentSha(repoUrl, token);
    // Pin both engines to the exact commit whose SHA is stored as the initial
    // protection baseline. The shared pipeline must complete or protection
    // activation is withheld; a core-only partial result is not a valid baseline.
    const snapshotUrl = repoUrl + "?ref=" + encodeURIComponent(sha);
    const scanned = await scanRepositorySecurity(snapshotUrl, token);
    if (!scanned.coverage.complete) {
      const reasons = [
        scanned.coverage.treeTruncated ? "GitHub truncated the repository tree." : null,
        scanned.coverage.omittedByFileLimit ? "The repository exceeded the supported file-count cap." : null,
        scanned.coverage.oversizedPaths.length ? "One or more files exceeded scanner size limits." : null,
        scanned.coverage.unreadablePaths.length ? "One or more files could not be read or decoded." : null,
        scanned.coverage.missingRequestedPaths.length ? "Some requested paths were not present." : null,
      ].filter(Boolean);
      const error = new Error("The initial security baseline is incomplete. Protection was not activated and no scan credit was consumed. " + reasons.join(" "));
      Object.assign(error, { status: 503 });
      throw error;
    }
    const report = {
      findings: scanned.findings,
      filesScanned: scanned.filesScanned,
      changedFiles: scanned.coverage.eligibleFileCount,
      checksRun: TOTAL_SECURITY_CHECKS,
      scanMode: "full",
      scanIncomplete: false,
      coveragePartial: false,
      resolvedFindingsCount: 0,
      existingFindingsCount: 0,
      unscannedChangedFileCount: 0,
      unscannedChangedFiles: [],
      coverageReasons: [],
    };
    const saved = await saveProtectedRepository({ owner: req.userId!, repo, repoUrl, baselineSha: sha, score: score(report.findings), report });
    if (!existing) await consumeProtectedScan(req.userId!);
    res.json({ repository: saved, baseline: {
      sha, filesScanned: report.filesScanned, findings: report.findings, checksRun: TOTAL_SECURITY_CHECKS,
      scanMode: "full", coverage: {
        eligibleFileCount: scanned.coverage.eligibleFileCount,
        filesScanned: scanned.coverage.filesScanned,
        complete: scanned.coverage.complete,
      },
    } });
  } catch (error) {
    req.log.error({ err: error, repoUrl }, "Could not protect repository");
    const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : 502;
    res.status(status === 429 ? 429 : status === 503 ? 503 : 502).json({ error: error instanceof Error ? error.message : "Could not protect repository" });
  }
});

export default router;
