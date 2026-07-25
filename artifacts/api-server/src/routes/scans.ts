import { Router, type IRouter } from "express";
import { CreateScanBody, CreateScanResponse } from "@workspace/api-zod";
import { scanPublicRepository } from "../lib/scanner";

const router: IRouter = Router();

router.post("/scans", async (req, res): Promise<void> => {
  const parsed = CreateScanBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid scan request");
    res.status(400).json({ error: "Enter a valid public GitHub repository URL." });
    return;
  }

  try {
    const report = await scanPublicRepository(parsed.data.repoUrl);
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
