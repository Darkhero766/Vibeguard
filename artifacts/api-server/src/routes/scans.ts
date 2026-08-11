import { Router, type IRouter } from "express";
import { CreateScanBody, CreateScanResponse } from "@workspace/api-zod";
import { scanPublicRepository } from "../lib/scanner";
import { runExtendedSecurityChecks } from "../lib/extendedScanner";
import { TOTAL_SECURITY_CHECKS } from "../lib/securityCheckCatalog";
import { optionalAuth, type AuthedRequest } from "../middlewares/auth";
import { getGithubTokenForUser } from "../lib/github";
import { cacheScanResult } from "../lib/scanCache";

const router: IRouter = Router();
const CORE_SECURITY_CHECKS = 8;

function errorStatus(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    return Number.isFinite(status) ? status : null;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown repository scan error.";
}

router.post("/scans", optionalAuth, async (req: AuthedRequest, res): Promise<void> => {
  console.log("[scans] repoUrl received:", JSON.stringify(req.body?.repoUrl));
  console.log("[scans] pattern used:", CreateScanBody.shape.repoUrl.toString());
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid scan request");
    res.status(400).json({ error: "Enter a valid public GitHub repository URL." });
    return;
  }

  let githubToken: string | undefined;
  if (req.userId && req.userJwt) {
    try {
      githubToken = (await getGithubTokenForUser(req.userId, req.userJwt)) ?? undefined;
    } catch (error) {
      // A missing/expired GitHub provider token must not prevent public-repo scans.
      req.log.warn({ err: error }, "Could not load GitHub provider token; trying public access");
    }
  }

  try {
    let report;
    let tokenUsed = Boolean(githubToken);

    try {
      report = await scanPublicRepository(parsed.data.repoUrl, githubToken);
    } catch (firstError) {
      const status = errorStatus(firstError);
      const message = errorMessage(firstError);

      // Public repositories must remain scannable even when a user's stored
      // GitHub OAuth token is expired/revoked. Retry anonymously before failing.
      if (githubToken && (status === 401 || status === 403 || status === 404 || status === 502 || /GitHub could not be reached|not found|authentication|auth/i.test(message))) {
        req.log.warn({ err: firstError }, "Authenticated GitHub clone failed; retrying public repository without token");
        report = await scanPublicRepository(parsed.data.repoUrl, undefined);
        tokenUsed = false;
      } else {
        throw firstError;
      }
    }

    let extendedFindings = [];
    let extendedSucceeded = false;

    try {
      // Use the same access mode that successfully fetched the repository.
      // This prevents an expired OAuth token from breaking public scans after
      // the core repository fetch has already succeeded anonymously.
      extendedFindings = await runExtendedSecurityChecks(parsed.data.repoUrl, tokenUsed ? githubToken : undefined);
      extendedSucceeded = true;
    } catch (extendedError) {
      req.log.warn({ err: extendedError }, "Extended security checks failed; returning core findings");
    }

    const seen = new Set(report.findings.map((f) => `${f.filePath}:${f.line}:${f.check}:${f.title}`));
    const findings = [...report.findings];
    for (const finding of extendedFindings) {
      const key = `${finding.filePath}:${finding.line}:${finding.check}:${finding.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push(finding);
      }
    }
    findings.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line || a.title.localeCompare(b.title));

    const finalReport = {
      ...report,
      findings,
      checksRun: extendedSucceeded ? TOTAL_SECURITY_CHECKS : CORE_SECURITY_CHECKS,
    };
    cacheScanResult(finalReport.repo, finalReport);
    res.json(CreateScanResponse.parse(finalReport));
  } catch (error) {
    const status = errorStatus(error);
    const message = errorMessage(error);
    req.log.error({ err: error, repoUrl: parsed.data.repoUrl, status }, "Repository scan failed");

    if (status === 404 || /Repository not found|does not exist/i.test(message)) {
      res.status(404).json({ error: `Repository not found or inaccessible: ${message}` });
      return;
    }
    if (status === 403) {
      res.status(502).json({ error: `GitHub access was denied or rate-limited: ${message}` });
      return;
    }
    if (status === 401) {
      res.status(502).json({ error: `GitHub authorization failed: ${message}` });
      return;
    }
    if (status && status >= 500) {
      res.status(502).json({ error: `Repository download failed: ${message}` });
      return;
    }

    res.status(400).json({ error: message });
  }
});

export default router;
