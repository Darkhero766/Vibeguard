import { createClient } from "@supabase/supabase-js";
import { decryptToken } from "./crypto";

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

/**
 * Fetch and decrypt a user's stored GitHub OAuth token.
 * Returns null if the user has no stored token.
 */
export async function getGithubTokenForUser(
  userId: string,
  userJwt: string,
): Promise<string | null> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });

  const { data, error } = await supabase
    .from("github_tokens")
    .select("encrypted_token")
    .eq("owner", userId)
    .maybeSingle();

  if (error || !data) return null;

  try {
    return decryptToken(data.encrypted_token);
  } catch {
    return null;
  }
}
