import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { checkRequiredSchema } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;

router.get("/readyz", async (_req, res) => {
  try {
    const schema = await checkRequiredSchema();
    if (!schema.ready) {
      res.status(503).json({ status: "not_ready", database: "schema_incomplete" });
      return;
    }
    res.json({ status: "ready", database: "ok" });
  } catch {
    res.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});
