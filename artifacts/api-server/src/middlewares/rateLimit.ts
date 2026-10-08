import { pool } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  name: string;
};

const cleanupEvery = 100;
let requestsSinceCleanup = 0;

function clientKey(req: Request, name: string) {
  // Express is configured to trust the single Render/Vercel ingress proxy.
  // req.ip is therefore the normalized client address, not an arbitrary
  // user-controlled X-Forwarded-For value.
  return `v1:${name}:${req.ip ?? "unknown"}`;
}

export function rateLimit(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const windowStartedAt = new Date(Math.floor(now / options.windowMs) * options.windowMs);
    const key = clientKey(req, options.name);

    try {
      const result = await pool.query<{ request_count: number }>(
        `
        INSERT INTO public.api_rate_limits (bucket_key, window_started_at, request_count, updated_at)
        VALUES ($1, $2, 1, now())
        ON CONFLICT (bucket_key) DO UPDATE SET
          window_started_at = CASE
            WHEN public.api_rate_limits.window_started_at < $2
              THEN EXCLUDED.window_started_at
            ELSE public.api_rate_limits.window_started_at
          END,
          request_count = CASE
            WHEN public.api_rate_limits.window_started_at < $2
              THEN 1
            ELSE public.api_rate_limits.request_count + 1
          END,
          updated_at = now()
        RETURNING request_count
        `,
        [key, windowStartedAt.toISOString()],
      );

      const count = Number(result.rows[0]?.request_count ?? 1);
      const remaining = Math.max(0, options.max - count);
      const resetAt = windowStartedAt.getTime() + options.windowMs;

      res.setHeader("X-RateLimit-Limit", String(options.max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

      if (count > options.max) {
        res.setHeader("Retry-After", String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
        res.status(429).json({
          error: "Too many requests. Please retry after the rate-limit window.",
        });
        return;
      }

      requestsSinceCleanup += 1;
      if (requestsSinceCleanup >= cleanupEvery) {
        requestsSinceCleanup = 0;
        void pool.query(
          "delete from public.api_rate_limits where updated_at < now() - interval '2 hours'",
        ).catch(() => undefined);
      }

      next();
    } catch (error) {
      // Availability of the database should not turn a rate-limit failure into
      // an outage for legitimate users. Log upstream and allow the request;
      // endpoint-level auth/quota checks remain authoritative.
      req.log?.warn?.({ err: error }, "Rate limiter unavailable; continuing request");
      next();
    }
  };
}
