import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import githubRouter from "./github";
import githubAppRouter from "./githubApp";
import githubWebhookRouter from "./githubWebhook";
import badgeRouter from "./badge";
import protectionRouter from "./protection";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(githubRouter);
router.use(githubAppRouter);
router.use(githubWebhookRouter);
router.use(badgeRouter);
router.use(protectionRouter);

export default router;
