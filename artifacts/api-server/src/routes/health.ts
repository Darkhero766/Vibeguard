import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

export default router;

router.get("/readyz", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ready", database: "ok" });
  } catch {
    res.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});


router.get("/readyz", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});
