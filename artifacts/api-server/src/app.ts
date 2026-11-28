import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { stagingAccess } from "./lib/stagingAccess";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Staging denial responses must include the same safe CORS headers as successful
// API responses; otherwise the browser hides the HTTP 403 as "Failed to fetch".
// Keep the existing production CORS behavior unchanged.
app.use(process.env.VIBESANE_DEPLOYMENT_ENV === "staging"
  ? cors({ origin: "https://vibesane-phase12-staging-web.onrender.com" })
  : cors());
app.use(stagingAccess);
app.use(
  express.json({
    limit: "2mb",
    verify: (req: Request, _res, buffer) => {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "256kb" }));

// Render health check / root endpoint.
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "vibeguard-api" });
});

app.use("/api", router);

export default app;
