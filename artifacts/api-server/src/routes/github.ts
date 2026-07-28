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
  // Pass ?on_conflict=owner so PostgREST targets the correct unique constraint
  // (the table has both a PK on `id` and UNIQUE on `owner`; without the explicit
  // target, merge-duplicates is ambiguous and the upsert is silently skipped).
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
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Token encryption/storage failed");
    res.status(500).json({ error: "Failed to store token" });
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
 * Fetches the user's accessible repositories from the GitHub API using their stored token.
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

    // If the encryption key is missing after a redeployment, treat the stored
    // token as unusable and prompt the user to re-link their GitHub account.
    if (!process.env.GITHUB_TOKEN_ENCRYPTION_KEY) {
      res.status(404).json(noConnection);
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

    res.json(
      repos.map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        htmlUrl: r.html_url,
        updatedAt: r.updated_at,
        description: r.description,
      })),
    );
  } catch (err) {
    logger.error({ err }, "Failed to list GitHub repos");
    res.status(500).json({ error: "Failed to list repositories" });
  }
});

export default router;
