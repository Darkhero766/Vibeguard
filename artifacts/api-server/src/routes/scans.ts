import { Router, type IRouter } from "express";
import { CreateScanBody, CreateScanResponse } from "@workspace/api-zod";
import { scanPublicRepository } from "../lib/scanner";
import { scanRepositoryViaApi } from "../lib/apiScanner";
import { runExtendedSecurityChecksV2 } from "../lib/extendedScannerV2";
import { TOTAL_SECURITY_CHECKS } from "../lib/securityCheckCatalog";
import { optionalAuth, type AuthedRequest } from "../middlewares/auth";
import { getGithubTokenForUser } from "../lib/github";
import { cacheScanResult } from "../lib/scanCache";
import { ensurePlanForUser, consumeScan } from "../lib/plan";

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
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid scan request");
    res.status(400).json({ error: "Enter a valid public GitHub repository URL." });
    return;
  }

  if (req.userId) {
    try {
      const plan = await ensurePlanForUser(req.userId);
      if (plan.scansUsed >= plan.scansLimit) {
        res.status(429).json({ error: `Monthly scan limit reached (${plan.scansLimit}).`, plan });
        return;
      }
    } catch (error) {
      req.log.warn({ err: error }, "Could not load plan; continuing scan for compatibility");
    }
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

    const extendedPromise = runExtendedSecurityChecksV2(parsed.data.repoUrl, githubToken);

    try {
      report = await scanRepositoryViaApi(parsed.data.repoUrl, githubToken);
    } catch (firstError) {
      const status = errorStatus(firstError);
      const message = errorMessage(firstError);
      req.log.warn({ err: firstError, status }, "GitHub API scan failed; falling back to Git clone");
      try {
        report = await scanPublicRepository(parsed.data.repoUrl, githubToken);
        tokenUsed = Boolean(githubToken);
      } catch (cloneError) {
        const cloneStatus = errorStatus(cloneError);
        const cloneMessage = errorMessage(cloneError);
        if (githubToken && (cloneStatus === 401 || cloneStatus === 403 || cloneStatus === 404)) {
          req.log.warn({ err: cloneError, status: cloneStatus }, "Authenticated Git clone failed; retrying API anonymously");
          report = await scanRepositoryViaApi(parsed.data.repoUrl, undefined);
          tokenUsed = false;
        } else {
          const wrapped = new Error(cloneMessage || message);
          Object.assign(wrapped, { status: cloneStatus ?? status ?? 502 });
          throw wrapped;
        }
      }
    }

    let extendedFindings = [];
    let extendedSucceeded = false;
    try {
      extendedFindings = await extendedPromise;
      extendedSucceeded = true;
    } catch (extendedError) {
      req.log.warn({ err: extendedError }, "Extended security checks failed; returning core findings");
    }

    const normalizedExtended = extendedFindings.map((item) => ({
      ...item,
      severity: item.severity === "Low" ? "Medium" : item.severity,
    }));

    const seen = new Set(report.findings.map((f) => `${f.filePath}:${f.line}:${f.check}:${f.title}`));
    const findings = [...report.findings];
    for (const item of normalizedExtended) {
      const key = `${item.filePath}:${item.line}:${item.check}:${item.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push(item);
      }
    }
    findings.sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line || a.title.localeCompare(b.title));

    const finalReport = {
      ...report,
      findings,
      checksRun: extendedSucceeded ? TOTAL_SECURITY_CHECKS : CORE_SECURITY_CHECKS,
    };
    cacheScanResult(finalReport.repo, finalReport);
    if (req.userId) {
      try { await consumeScan(req.userId); } catch (error) { req.log.warn({ err: error }, "Could not record scan usage"); }
    }
    res.json(CreateScanResponse.parse(finalReport));
  } catch (error) {
    const status = errorStatus(error);
    const message = errorMessage(error);
    req.log.error({ err: error, repoUrl: parsed.data.repoUrl, status }, "Repository scan failed");

    if (status === 409 || /repository is empty|empty repository/i.test(message)) {
      res.status(422).json({ error: "This GitHub repository is empty. Add at least one committed file before scanning." });
      return;
    }
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
