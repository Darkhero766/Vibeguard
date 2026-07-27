import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, githubTokens } from "@workspace/db";
import { encryptToken, decryptToken } from "../lib/crypto";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { logger } from "../lib/logger";

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

    await db
      .insert(githubTokens)
      .values({ owner: req.userId!, encryptedToken: encrypted })
      .onConflictDoUpdate({
        target: githubTokens.owner,
        set: { encryptedToken: encrypted },
      });

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
  try {
    const [row] = await db
      .select()
      .from(githubTokens)
      .where(eq(githubTokens.owner, req.userId!))
      .limit(1);

    if (!row) {
      res.status(404).json({
        error: "No GitHub connection found. Sign in with GitHub to enable private repo scanning.",
      });
      return;
    }

    const githubToken = decryptToken(row.encryptedToken);

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
