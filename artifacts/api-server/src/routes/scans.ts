import { Router, type IRouter } from "express";
import { CreateScanBody, CreateScanResponse } from "@workspace/api-zod";
import { scanPublicRepository } from "../lib/scanner";
import { runExtendedSecurityChecks } from "../lib/extendedScanner";
import { optionalAuth, type AuthedRequest } from "../middlewares/auth";
import { getGithubTokenForUser } from "../lib/github";
import { cacheScanResult } from "../lib/scanCache";

const router: IRouter = Router();

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
    } catch {
      // Non-fatal — public repositories can still be scanned without the token.
    }
  }

  try {
    const report = await scanPublicRepository(parsed.data.repoUrl, githubToken);

    // Run the expanded rule set against the same repository. If one of the
    // extended heuristics fails, preserve the working core scanner result.
    let extendedFindings = [];
    try {
      extendedFindings = await runExtendedSecurityChecks(parsed.data.repoUrl, githubToken);
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

    const finalReport = { ...report, findings };
    cacheScanResult(finalReport.repo, finalReport);
    res.json(CreateScanResponse.parse(finalReport));
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 500;
    const message = error instanceof Error ? error.message : "The repository could not be scanned.";

    if (status === 404) {
      res.status(404).json({ error: "Repository not found. Make sure it is public and the URL is correct." });
      return;
    }
    if (status === 403) {
      res.status(502).json({ error: "GitHub rate-limited this scan. Please try again shortly." });
      return;
    }
    if (status >= 500 && status < 600) {
      req.log.error({ err: error }, "Repository scan failed");
      res.status(502).json({ error: "GitHub could not be reached. Please try again." });
      return;
    }

    req.log.warn({ err: error }, "Repository could not be scanned");
    res.status(400).json({ error: message });
  }
});

export default router;
