import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import githubRouter from "./github";
import githubWebhookRouter from "./githubWebhook";
import badgeRouter from "./badge";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(githubRouter);
router.use(githubWebhookRouter);
router.use(badgeRouter);

export default router;
