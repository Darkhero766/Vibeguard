import type { Request, Response, NextFunction } from "express";

// Accept server-side names (SUPABASE_URL / SUPABASE_ANON_KEY) or the VITE_-prefixed
// variants that Replit exposes as plain env vars for the frontend build.
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_ANON_KEY (or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) are required for API authentication.",
  );
}

const supabaseUserUrl = new URL("/auth/v1/user", supabaseUrl).toString();

export interface AuthedRequest extends Request {
  userId?: string;
  userJwt?: string;
}

async function resolveUser(jwt: string) {
  const response = await fetch(supabaseUserUrl, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!response.ok) return null;

  const user = (await response.json()) as { id?: unknown };
  if (typeof user.id !== "string") return null;
  return { id: user.id };
}

/**
 * Middleware that requires a valid Supabase JWT in Authorization: Bearer <token>.
 * Attaches userId and userJwt to the request. Returns 401 if missing or invalid.
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const jwt = header.slice(7);
  const user = await resolveUser(jwt);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  req.userId = user.id;
  req.userJwt = jwt;
  next();
}

/**
 * Middleware that optionally validates a Supabase JWT.
 * Attaches userId and userJwt when present and valid; otherwise continues without them.
 */
export async function optionalAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }
  const jwt = header.slice(7);
  const user = await resolveUser(jwt);
  if (user) {
    req.userId = user.id;
    req.userJwt = jwt;
  }
  next();
}
