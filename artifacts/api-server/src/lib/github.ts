import { pool } from "@workspace/db";
import { decryptToken } from "./crypto";

/**
 * GitHub OAuth token ciphertext is server-owned. Never use an end user's
 * Supabase JWT or PostgREST Data API to select encrypted_token: revoking
 * client table privileges is required before production launch.
 */
export async function getGithubTokenForUser(
  userId: string,
  _userJwt?: string,
): Promise<string | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)) {
    throw new Error("Invalid authenticated user ID");
  }
  const { rows } = await pool.query<{ encrypted_token: string }>(
    "SELECT encrypted_token FROM public.github_tokens WHERE owner = $1 LIMIT 1",
    [userId],
  );
  if (!rows.length) return null;
  try {
    return decryptToken(rows[0].encrypted_token);
  } catch {
    // Do not leak decryption failures or ciphertext to users.
    return null;
  }
}
