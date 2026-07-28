import { decryptToken } from "./crypto";

// Use Supabase REST (HTTPS) instead of a direct Postgres connection.
// The direct db connection is blocked from Replit's sandbox network.
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

/**
 * Fetch and decrypt a user's stored GitHub OAuth token via Supabase REST.
 * Returns null if the user has no stored token.
 *
 * @param userId   Supabase user ID
 * @param userJwt  Supabase access token for row-level security
 */
export async function getGithubTokenForUser(
  userId: string,
  userJwt: string,
): Promise<string | null> {
  const url = `${supabaseUrl}/rest/v1/github_tokens?owner=eq.${encodeURIComponent(userId)}&select=encrypted_token&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${userJwt}`,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase REST error ${res.status}: ${body}`);
  }

  const rows = (await res.json()) as { encrypted_token: string }[];
  const row = rows[0];
  if (!row) return null;

  try {
    return decryptToken(row.encrypted_token);
  } catch {
    return null;
  }
}
