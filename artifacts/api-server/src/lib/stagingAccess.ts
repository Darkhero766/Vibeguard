import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Staging-only API gate. This protects unfinished APIs while test OAuth and
 * payment integrations are isolated. Health/readiness remain observable.
 *
 * Never reuse this key in production, frontend bundles, or real customer flows.
 * Staging access is not a substitute for per-user Supabase authentication.
 */
export const stagingAccess: RequestHandler = (req, res, next) => {
  if (process.env.VIBESANE_DEPLOYMENT_ENV !== "staging") {
    next();
    return;
  }
  const path = req.path;
  // Browser preflight is safe to answer, while the eventual actual API
  // operation still requires its private staging access header.
  if (req.method === "OPTIONS") {
    next();
    return;
  }
  if ((req.method === "GET" &&
        (path === "/" || path === "/api/healthz" || path === "/api/readyz")) ||
      // Dodo sandbox cannot supply our staging access header. The webhook
      // route itself MUST verify its HMAC signature and test-mode isolation.
      // GitHub App webhooks similarly MUST verify x-hub-signature-256.
      (req.method === "POST" &&
        (path === "/api/webhooks/dodo" || path === "/api/github/webhook"))) {
    next();
    return;
  }
  const expected = process.env.VIBESANE_STAGING_ACCESS_KEY ?? "";
  const actual = req.header("x-vibesane-staging-access") ?? "";
  if (expected.length < 32 || actual.length !== expected.length ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    res.status(403).json({ error: "Staging access restricted" });
    return;
  }
  next();
};
