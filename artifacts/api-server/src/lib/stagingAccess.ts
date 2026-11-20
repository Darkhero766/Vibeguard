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
 *    provider_id or verified user UUID appears in a tester-only allowlist.
 *    The UUID allowlist is provisioned from a GitHub identity lookup by an
 *    operator; it remains server-only and works when Auth omits identities.
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
  const allowedGitHubIds = (process.env.VIBESANE_STAGING_ALLOWED_GITHUB_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[1-9][0-9]*$/.test(s) && Number.isSafeInteger(Number(s)));
  const allowedUserIds = (process.env.VIBESANE_STAGING_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s));
  const jwt = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supabaseUrl || !supabaseKey ||
      (allowedGitHubIds.length === 0 && allowedUserIds.length === 0) ||
      jwt.length === 0 || jwt.length > 8192) {
    req.log?.warn?.({ reason: "staging_missing_credentials_or_allowlist" }, "Staging access denied");
    forbidden(res);
    return;
  }

  try {
    const response = await fetch(new URL("/auth/v1/user", supabaseUrl), {
      headers: { apikey: supabaseKey, Authorization: "Bearer " + jwt },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      req.log?.warn?.({ reason: "staging_auth_verification_failed", authStatus: response.status }, "Staging access denied");
      forbidden(res);
      return;
    }
    const user = (await response.json()) as {
      id?: unknown;
      identities?: Array<{ provider?: unknown; provider_id?: unknown }>;
    };
    if (typeof user.id !== "string" || user.id.length === 0) {
      req.log?.warn?.({ reason: "staging_auth_missing_user_id" }, "Staging access denied");
      forbidden(res);
      return;
    }
    // An explicit per-account UUID, verified via the remote Auth server, is
    // sufficient for restricted staging access. This handles Auth responses
    // with omitted or differently shaped social-provider identities.
    const knownAccount = allowedUserIds.includes(user.id.toLowerCase());
    const githubIdentity = Array.isArray(user.identities)
      ? user.identities.find((identity) => identity?.provider === "github")
      : undefined;
    const providerId = githubIdentity?.provider_id;
    const githubId = typeof providerId === "string"
      ? providerId : typeof providerId === "number" && Number.isSafeInteger(providerId)
        ? String(providerId) : "";
    if (!knownAccount && !allowedGitHubIds.includes(githubId)) {
      req.log?.warn?.({ reason: "staging_auth_identity_not_allowlisted" }, "Staging access denied");
      forbidden(res);
      return;
    }
    next();
  } catch {
    // Transient Supabase errors fail closed, without leaking JWTs or UUIDs.
    req.log?.warn?.({ reason: "staging_auth_lookup_error" }, "Staging access denied");
    forbidden(res);
  }
};
