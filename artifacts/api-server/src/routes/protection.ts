import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { getGithubTokenForUser } from "../lib/github";
import { scanPublicRepository } from "../lib/scanner";
import { runExtendedSecurityChecksV2 } from "../lib/extendedScannerV2";
import { TOTAL_SECURITY_CHECKS } from "../lib/securityCheckCatalog";
import { getProtectedRepository, listProtectedRepositories, listProtectionEvents, saveProtectedRepository } from "../lib/protectionStore";

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

router.get("/protection", requireAuth, async (req: AuthedRequest, res) => {
  try { res.json({ repositories: await listProtectedRepositories(req.userId!) }); }
  catch (error) { req.log.error({ err: error }, "Could not list protected repositories"); res.status(500).json({ error: "Could not load protected repositories" }); }
});

router.get("/protection/:repo/events", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const repo = decodeURIComponent(req.params.repo);
    const protectedRepo = await getProtectedRepository(repo);
    if (!protectedRepo || protectedRepo.owner !== req.userId) { res.status(404).json({ error: "Protected repository not found" }); return; }
    res.json({ repository: protectedRepo, events: await listProtectionEvents(repo) });
  } catch (error) { req.log.error({ err: error }, "Could not load protection activity"); res.status(500).json({ error: "Could not load protection activity" }); }
});

router.post("/protection", requireAuth, async (req: AuthedRequest, res) => {
  const repoUrl = typeof req.body?.repoUrl === "string" ? req.body.repoUrl.trim().replace(/\/$/, "") : "";
  if (!githubUrlPattern.test(repoUrl)) { res.status(400).json({ error: "Enter a valid GitHub repository URL." }); return; }

  try {
    const token = await getGithubTokenForUser(req.userId!, req.userJwt!);
    const [repoOwner, repoName] = new URL(repoUrl).pathname.split("/").filter(Boolean);
    const repo = `${repoOwner}/${repoName}`;
    const sha = await currentSha(repoUrl, token ?? undefined);
    let report = await scanPublicRepository(repoUrl, token ?? undefined);
    try {
      const extended = await runExtendedSecurityChecksV2(repoUrl, token ?? undefined);
      const normalized = extended.map((finding) => ({ ...finding, severity: finding.severity === "Low" ? "Medium" : finding.severity }));
      const seen = new Set(report.findings.map((f) => `${f.filePath}:${f.line}:${f.check}:${f.title}`));
      report = { ...report, findings: [...report.findings, ...normalized.filter((f) => !seen.has(`${f.filePath}:${f.line}:${f.check}:${f.title}`))] };
    } catch { /* core scan is still a valid baseline */ }
    const saved = await saveProtectedRepository({ owner: req.userId!, repo, repoUrl, baselineSha: sha, score: score(report.findings), report });
    res.json({ repository: saved, baseline: { sha, filesScanned: report.filesScanned, findings: report.findings, checksRun: TOTAL_SECURITY_CHECKS } });
  } catch (error) {
    req.log.error({ err: error, repoUrl }, "Could not protect repository");
    res.status(502).json({ error: error instanceof Error ? error.message : "Could not protect repository" });
  }
});

export default router;
