import { Router } from "express";
import { pool } from "@workspace/db";
import { encryptToken, decryptToken } from "../lib/crypto";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

// GitHub token encryption/storage is server-only. Supabase browser roles must
// have NO SQL permissions on public.github_tokens after a reviewed migration.
async function fetchTokenRow(userId: string): Promise<{ encrypted_token: string } | null> {
  const { rows } = await pool.query<{ encrypted_token: string }>(
    "SELECT encrypted_token FROM public.github_tokens WHERE owner = $1 LIMIT 1",
    [userId],
  );
  return rows[0] ?? null;
}
async function upsertTokenRow(userId: string, encryptedToken: string): Promise<void> {
  await pool.query(
    `INSERT INTO public.github_tokens (owner, encrypted_token)
     VALUES ($1, $2)
     ON CONFLICT (owner) DO UPDATE SET encrypted_token = EXCLUDED.encrypted_token`,
    [userId, encryptedToken],
  );
}

// ─── In-memory repo cache ─────────────────────────────────────────────────────
// Keyed by user id. Resets on server restart — acceptable tradeoff.
type MappedRepo = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  updatedAt: string;
  description: string | null;
};
type CacheEntry = { repos: MappedRepo[]; cachedAt: number };
const repoCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const router = Router();

/**
 * POST /github/token
 * Encrypts and upserts the user's GitHub OAuth token.
 * Called by the frontend immediately after a GitHub OAuth sign-in.
 */
router.post("/github/token", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const { token } = req.body as { token?: unknown };
  if (typeof token !== "string" || !token || token.length > 512) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  try {
    const encrypted = encryptToken(token);
    await upsertTokenRow(req.userId!, encrypted);
    // Invalidate any cached repo list so the next fetch is fresh.
    repoCache.delete(req.userId!);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Token encryption/storage failed");
    res.status(500).json({ error: "Failed to store token" });
  }
});

/**
 * DELETE /github/token
 * Removes the user's stored GitHub OAuth token and clears their repo cache.
 */
router.delete("/github/token", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  try {
    await pool.query("DELETE FROM public.github_tokens WHERE owner = $1", [req.userId!]);
    repoCache.delete(req.userId!);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to disconnect GitHub token");
    res.status(500).json({ error: "Failed to disconnect GitHub account" });
  }
});

/**
 * GET /github/token/status
 * Returns a boolean, NEVER the stored encrypted token. This is the only
 * token-connection lookup the browser should perform.
 */
router.get("/github/token/status", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM public.github_tokens WHERE owner = $1 LIMIT 1",
      [req.userId!],
    );
    res.json({ connected: (rowCount ?? 0) > 0 });
  } catch (error) {
    logger.error({ err: error }, "GitHub connection status unavailable");
    res.status(503).json({ error: "GitHub connection status temporarily unavailable" });
  }
});

type GitHubApiRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  updated_at: string;
  description: string | null;
};

/**
 * GET /github/repos
 * Returns the user's repositories. Caches results for 5 minutes per user.
 * Pass ?refresh=true to force a fresh fetch from GitHub.
 */
router.get("/github/repos", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  const noConnection = {
    error: "No GitHub connection found. Sign in with GitHub to enable private repo scanning.",
  };

  try {
    const row = await fetchTokenRow(req.userId!);

    if (!row) {
      res.status(404).json(noConnection);
      return;
    }

    if (!process.env.GITHUB_TOKEN_ENCRYPTION_KEY) {
      res.status(404).json(noConnection);
      return;
    }

    // Return cached result unless ?refresh=true or cache has expired.
    const forceRefresh = req.query.refresh === "true";
    const cached = repoCache.get(req.userId!);
    if (!forceRefresh && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      res.json(cached.repos);
      return;
    }

    const githubToken = decryptToken(row.encrypted_token);

    const response = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator",
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );

    if (!response.ok) {
      logger.warn({ status: response.status }, "GitHub API error");
      res.status(502).json({ error: "Failed to fetch repositories from GitHub" });
      return;
    }

    const repos = (await response.json()) as GitHubApiRepo[];
    const mapped: MappedRepo[] = repos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      private: r.private,
      htmlUrl: r.html_url,
      updatedAt: r.updated_at,
      description: r.description,
    }));

    repoCache.set(req.userId!, { repos: mapped, cachedAt: Date.now() });
    res.json(mapped);
  } catch (err) {
    logger.error({ err }, "Failed to list GitHub repos");
    res.status(500).json({ error: "Failed to list repositories" });
  }
});

export default router;
