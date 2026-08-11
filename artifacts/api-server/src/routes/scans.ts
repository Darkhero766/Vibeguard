import { Router, type IRouter } from "express";
import { CreateScanBody, CreateScanResponse } from "@workspace/api-zod";
import { scanPublicRepository } from "../lib/scanner";
import { scanRepositoryViaApi } from "../lib/apiScanner";
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

      req.log.warn({ err: firstError, status }, "Git clone scan failed; falling back to GitHub REST API");
      try {
        report = await scanRepositoryViaApi(parsed.data.repoUrl, githubToken);
        tokenUsed = Boolean(githubToken);
      } catch (apiError) {
        const apiStatus = errorStatus(apiError);
        const apiMessage = errorMessage(apiError);

        if (githubToken && (apiStatus === 401 || apiStatus === 403 || apiStatus === 404)) {
          req.log.warn({ err: apiError, status: apiStatus }, "Authenticated GitHub API access failed; retrying anonymously");
          report = await scanRepositoryViaApi(parsed.data.repoUrl, undefined);
          tokenUsed = false;
        } else {
          const wrapped = new Error(apiMessage || message);
          Object.assign(wrapped, { status: apiStatus ?? status ?? 502 });
          throw wrapped;
        }
      }
    }

    let extendedFindings = [];
    let extendedSucceeded = false;

    try {
      extendedFindings = await runExtendedSecurityChecks(parsed.data.repoUrl, tokenUsed ? githubToken : undefined);
      extendedSucceeded = true;
    } catch (extendedError) {
      req.log.warn({ err: extendedError }, "Extended security checks failed; returning core findings");
    }

    // The public API Finding schema supports Critical/High/Medium only.
    // Some extended detectors intentionally use Low for informational findings.
    // Normalize those to Medium at the API boundary so one Low finding cannot
    // invalidate the entire scan response with a Zod enum error.
    extendedFindings = extendedFindings.map((finding) => ({
      ...finding,
      severity: finding.severity === "Low" ? "Medium" : finding.severity,
    }));

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

    if (status === 404 || /Repository not found|does not exist|GitHub API 404/i.test(message)) {
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
    if (status === 413) {
      res.status(413).json({ error: message });
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
