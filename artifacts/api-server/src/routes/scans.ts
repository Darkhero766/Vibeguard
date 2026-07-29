import { Router, type IRouter } from "express";
import { CreateScanBody, CreateScanResponse } from "@workspace/api-zod";
import { scanPublicRepository } from "../lib/scanner";
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

  // If the request is authenticated, try to fetch the user's stored GitHub token.
  // This enables private repository scanning without changing the API contract.
  let githubToken: string | undefined;
  if (req.userId && req.userJwt) {
    try {
      githubToken = (await getGithubTokenForUser(req.userId, req.userJwt)) ?? undefined;
    } catch {
      // Non-fatal — fall back to unauthenticated clone
    }
  }

  try {
    const report = await scanPublicRepository(parsed.data.repoUrl, githubToken);
    // Cache result for badge endpoint (keyed by owner/repo)
    const repoKey = report.repo; // already "owner/repo"
    cacheScanResult(repoKey, report);
    res.json(CreateScanResponse.parse(report));
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
