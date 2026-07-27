import { eq } from "drizzle-orm";
import { db, githubTokens } from "@workspace/db";
import { decryptToken } from "./crypto";

/**
 * Fetch and decrypt a user's stored GitHub OAuth token.
 * Returns null if the user has no stored token.
 */
export async function getGithubTokenForUser(userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(githubTokens)
    .where(eq(githubTokens.owner, userId))
    .limit(1);

  if (!row) return null;

  try {
    return decryptToken(row.encryptedToken);
  } catch {
    return null;
  }
}
