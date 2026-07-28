import { Router } from "express";
import { encryptToken, decryptToken } from "../lib/crypto";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

// Supabase REST API (PostgREST) — reachable via HTTPS from any environment,
// unlike the direct Postgres connection which Replit's sandbox blocks.
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

function supabaseHeaders(userJwt: string) {
  return {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${userJwt}`,
    "Content-Type": "application/json",
  };
}

/** Fetch the encrypted token row for a user via Supabase REST (PostgREST). */
async function fetchTokenRow(
  userId: string,
  userJwt: string,
): Promise<{ encrypted_token: string } | null> {
  const url = `${supabaseUrl}/rest/v1/github_tokens?owner=eq.${encodeURIComponent(userId)}&select=encrypted_token&limit=1`;
  const res = await fetch(url, { headers: supabaseHeaders(userJwt) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase REST error ${res.status}: ${body}`);
  }
  const rows = (await res.json()) as { encrypted_token: string }[];
  return rows[0] ?? null;
}

/** Upsert (insert or replace) a github token row via Supabase REST. */
async function upsertTokenRow(
  userId: string,
  encryptedToken: string,
  userJwt: string,
): Promise<void> {
  const url = `${supabaseUrl}/rest/v1/github_tokens?on_conflict=owner`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(userJwt),
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({ owner: userId, encrypted_token: encryptedToken }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase REST upsert error ${res.status}: ${body}`);
  }
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
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "token is required" });
    return;
  }

  try {
    const encrypted = encryptToken(token);
    await upsertTokenRow(req.userId!, encrypted, req.userJwt!);
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
    const url = `${supabaseUrl}/rest/v1/github_tokens?owner=eq.${encodeURIComponent(req.userId!)}`;
    const deleteRes = await fetch(url, {
      method: "DELETE",
      headers: supabaseHeaders(req.userJwt!),
    });
    if (!deleteRes.ok) {
      const body = await deleteRes.text();
      throw new Error(`Supabase REST delete error ${deleteRes.status}: ${body}`);
    }
    repoCache.delete(req.userId!);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to disconnect GitHub token");
    res.status(500).json({ error: "Failed to disconnect GitHub account" });
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
    const row = await fetchTokenRow(req.userId!, req.userJwt!);

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
      const body = await response.text();
      logger.warn({ status: response.status, body }, "GitHub API error");
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
