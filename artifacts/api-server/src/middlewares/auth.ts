import { createClient } from "@supabase/supabase-js";
import type { Request, Response, NextFunction } from "express";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

// Single shared client — avoids re-initialising the realtime WebSocket on every request.
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

export interface AuthedRequest extends Request {
  userId?: string;
  userJwt?: string;
}

async function resolveUser(jwt: string) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt);
  if (error || !user) return null;
  return user;
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
