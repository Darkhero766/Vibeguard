import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

const forbidden = (res: Parameters<RequestHandler>[1]): void => {
  res.status(403).json({ error: "Staging access restricted" });
};

/**
 * The staging API is not a public beta.
 *
 * Access is granted by either:
 * 1. The existing private staging access header for trusted machine tests; or
 * 2. A freshly validated staging Supabase session whose server-verified GitHub
 *    provider_id appears in the explicitly configured tester allowlist.
 *
 * The private access key NEVER goes in a VITE_* browser variable. GitHub IDs
 * are not secrets, but they are checked against the Auth server response, not
 * user_metadata, a JWT claim taken at face value, or a browser-supplied header.
 * Production bypasses this extra middleware and keeps its existing behavior.
 */
export const stagingAccess: RequestHandler = async (req, res, next) => {
  if (process.env.VIBESANE_DEPLOYMENT_ENV !== "staging") {
    next();
    return;
  }

  const path = req.path;
  // Preflight is answered by CORS; protected requests are checked separately.
  if (req.method === "OPTIONS") {
    next();
    return;
  }
  if ((req.method === "GET" &&
        (path === "/" || path === "/api/healthz" || path === "/api/readyz")) ||
      // Independent webhook handlers verify their own HMAC signatures.
      (req.method === "POST" &&
        (path === "/api/webhooks/dodo" || path === "/api/github/webhook"))) {
    next();
    return;
  }

  const expected = process.env.VIBESANE_STAGING_ACCESS_KEY ?? "";
  const actual = req.header("x-vibesane-staging-access") ?? "";
  if (expected.length >= 32 && actual.length === expected.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    next();
    return;
  }

  // A restricted test user may call regular authenticated API routes using
  // their own Supabase JWT. The downstream route still enforces authentication,
  // user ownership, quotas, and all per-resource authorization rules.
  const header = req.header("authorization") ?? "";
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const allowed = (process.env.VIBESANE_STAGING_ALLOWED_GITHUB_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[1-9][0-9]*$/.test(s) && Number.isSafeInteger(Number(s)));
  const jwt = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supabaseUrl || !supabaseKey || allowed.length === 0 ||
      jwt.length === 0 || jwt.length > 8192) {
    forbidden(res);
    return;
  }

  try {
    const response = await fetch(new URL("/auth/v1/user", supabaseUrl), {
      headers: { apikey: supabaseKey, Authorization: "Bearer " + jwt },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      forbidden(res);
      return;
    }
    const user = (await response.json()) as {
      id?: unknown;
      identities?: Array<{ provider?: unknown; provider_id?: unknown }>;
    };
    if (typeof user.id !== "string" || user.id.length === 0 ||
        !Array.isArray(user.identities)) {
      forbidden(res);
      return;
    }
    const githubProviderId = user.identities
      .find((identity) => identity.provider === "github")?.provider_id;
    const id = typeof githubProviderId === "string" ? githubProviderId : "";
    if (!allowed.includes(id)) {
      forbidden(res);
      return;
    }
    next();
  } catch {
    // A transient Supabase error must never turn into an anonymous bypass.
    forbidden(res);
  }
};
