import { Router, type IRouter } from "express";
import { CreateScanBody, CreateScanResponse } from "@workspace/api-zod";
import { scanPublicRepository } from "../lib/scanner";
import { scanRepositoryViaApi } from "../lib/apiScanner";
import { runExtendedSecurityChecksV2 } from "../lib/extendedScannerV2";
import { TOTAL_SECURITY_CHECKS } from "../lib/securityCheckCatalog";
import { optionalAuth, requireAuth, type AuthedRequest } from "../middlewares/auth";
import { getGithubTokenForUser } from "../lib/github";
import { cacheScanResult } from "../lib/scanCache";
import { ensurePlanForUser, consumePublicScan } from "../lib/plan";
import { rateLimit } from "../middlewares/rateLimit";
import { normalizeScanRepositoryUrl } from "../lib/scanRepositoryUrl";

const router: IRouter = Router();

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

/**
 * Server-authoritative allowance for the public-scanner UI.
 *
 * The persisted usage table has counters, not a public_scans_limit column.
 * Both plan limits and private admin/tester exceptions are evaluated in
 * ensurePlanForUser. Never infer entitlements from user-editable browser data.
 */
router.get("/scans/allowance", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const plan = await ensurePlanForUser(req.userId!);
    res.json({
      plan: plan.plan,
      publicScansUsed: plan.publicScansUsed,
      publicScansLimit: plan.publicScansLimit,
      unlimited: plan.unlimited,
    });
  } catch (error) {
    req.log.error({ err: error }, "Public scan allowance verification failed");
    res.status(503).json({ error: "Unable to verify scan allowance. Please retry." });
  }
});

router.post("/scans", rateLimit({ name: "scans", windowMs: 60_000, max: 10 }), optionalAuth, async (req: AuthedRequest, res): Promise<void> => {
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid scan request");
    res.status(400).json({ error: "Enter a valid public GitHub repository URL." });
    return;
  }

  // Validate and canonicalize before quota lookup or launching parallel API
  // requests. A sentence-ending dot must not become a different repo name.
  let repoUrl: string;
  try {
    repoUrl = normalizeScanRepositoryUrl(parsed.data.repoUrl);
  } catch (error) {
    res.status(400).json({ error: errorMessage(error) });
    return;
  }

  if (req.userId) {
    try {
      const plan = await ensurePlanForUser(req.userId);
      if (!plan.unlimited && plan.publicScansUsed >= plan.publicScansLimit) {
        res.status(429).json({ error: `Public repository scan limit reached (${plan.publicScansLimit}).`, plan });
        return;
      }
    } catch (error) {
      req.log.error({ err: error }, "Could not verify account scan quota; refusing to scan.");
      res.status(503).json({ error: "Unable to verify scan allowance. Please retry later." });
      return;
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

    // Attach the rejection handler immediately. GitHub rate limits can make
    // the extended scan reject before the core scan finishes its fallback;
    // an unhandled rejection would otherwise terminate the Node process.
    const extendedPromise = runExtendedSecurityChecksV2(repoUrl, githubToken)
      .then(
        (findings) => ({ ok: true as const, findings }),
        (error: unknown) => ({ ok: false as const, error }),
      );

    try {
      report = await scanRepositoryViaApi(repoUrl, githubToken);
    } catch (firstError) {
      const status = errorStatus(firstError);
      // A 404 is a missing/inaccessible repository, not a retryable API
      // throttle. Do not attempt clone or strip OAuth credentials.
      if (status === 404) throw firstError;
      req.log.warn({ err: firstError, status }, "GitHub API scan failed; falling back to Git clone");
      try {
        report = await scanPublicRepository(repoUrl, githubToken);
      } catch (cloneError) {
        const cloneStatus = errorStatus(cloneError);
        // Never downgrade an authenticated GitHub scan to anonymous.
        // Shared cloud IPs often exhaust the smaller anonymous API limit.
        const wrapped = new Error(errorMessage(cloneError));
        Object.assign(wrapped, { status: cloneStatus ?? status ?? 502 });
        throw wrapped;
      }
    }

    const extendedResult = await extendedPromise;
    if (!extendedResult.ok) {
      // A partial scan must never be presented as all security checks having
      // passed or consume the customer's limited scan allowance.
      req.log.warn({ err: extendedResult.error, status: errorStatus(extendedResult.error) },
        "Extended checks unavailable; withholding incomplete repository report");
      res.status(503).json({
        error: "Full security scan could not finish because GitHub access is temporarily unavailable. Check your GitHub connection or retry later. No scan credit was used.",
      });
      return;
    }
    const extendedFindings = extendedResult.findings;

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
      checksRun: TOTAL_SECURITY_CHECKS,
    };
    // Validate output, then charge the authenticated account before returning or
    // caching a result. A database failure or exhausted quota must not grant a free scan.
    const response = CreateScanResponse.parse(finalReport);
    if (req.userId) {
      try {
        await consumePublicScan(req.userId);
      } catch (error) {
        const status = errorStatus(error);
        req.log.error({ err: error }, "Scan quota could not be recorded; refusing to deliver result.");
        res.status(status === 429 ? 429 : 503).json({
          error: status === 429 ? "Scan allowance exhausted. Please check your plan."
            : "Unable to record scan usage. Please retry later.",
        });
        return;
      }
    }
    cacheScanResult(finalReport.repo, finalReport);
    res.json(response);
  } catch (error) {
    const status = errorStatus(error);
    const message = errorMessage(error);
    req.log.error({ err: error, repoUrl: repoUrl, status }, "Repository scan failed");

    if (status === 429) {
      res.status(429).json({ error: "Scan allowance exhausted. Please check your plan." });
      return;
    }
    if (!status && /quota|allowance|account not found|database|connection/i.test(message)) {
      res.status(503).json({ error: "Scan allowance could not be recorded; please retry." });
      return;
    }
    if (status === 409 || /repository is empty|empty repository/i.test(message)) {
      res.status(422).json({ error: "This GitHub repository is empty. Add at least one committed file before scanning." });
      return;
    }
    if (status === 404 || /Repository not found|does not exist|GitHub API 404/i.test(message)) {
      res.status(404).json({ error: "Repository not found or inaccessible. Check the GitHub URL and repository permissions. No scan credit was used." });
      return;
    }
    if (status === 403) {
      res.status(503).json({ error: "GitHub repository access was denied or rate-limited. Verify your GitHub connection and permissions, then retry. No scan credit was used." });
      return;
    }
    if (status === 401) {
      res.status(502).json({ error: "GitHub authorization failed. Reconnect GitHub and retry. No scan credit was used." });
      return;
    }
    if (status === 413) {
      res.status(413).json({ error: message });
      return;
    }
    if (status && status >= 500) {
      res.status(502).json({ error: "Repository download failed temporarily. No scan credit was used." });
      return;
    }

    res.status(400).json({ error: message });
  }
});

export default router;
