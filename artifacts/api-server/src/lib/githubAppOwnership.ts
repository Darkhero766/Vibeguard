import { pool } from "@workspace/db";
import { decryptToken } from "./crypto";

export type InstallationAccount = {
  id: number;
  login: string;
  type: "User" | "Organization" | string;
};

function isValidAccount(account: InstallationAccount): boolean {
  return Number.isSafeInteger(account.id) && account.id > 0 &&
    typeof account.login === "string" &&
    /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(account.login);
}

/**
 * The existence of a GitHub App installation is NOT evidence that a given
 * VibeSane user owns it. Bind personal installs to a GitHub OAuth identity
 * obtained from the trusted Supabase Auth /user response.
 *
 * For organizations also require a live GitHub membership of role "admin"
 * proven using that same account's stored OAuth token. Missing permission
 * (including read:org), missing identity, or API errors always DENY.
 */
export async function canClaimGitHubInstallation(
  vibesaneOwner: string,
  verifiedGitHubId: number | undefined,
  account: InstallationAccount,
): Promise<boolean> {
  if (!Number.isSafeInteger(verifiedGitHubId) || !verifiedGitHubId || !isValidAccount(account)) {
    return false;
  }
  if (account.type === "User") return account.id === verifiedGitHubId;
  if (account.type !== "Organization") return false;

  const { rows } = await pool.query<{ encrypted_token: string }>(
    "SELECT encrypted_token FROM public.github_tokens WHERE owner = $1 LIMIT 1",
    [vibesaneOwner],
  );
  if (!rows[0]) return false;

  const githubToken = decryptToken(rows[0].encrypted_token);
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const who = await fetch("https://api.github.com/user", {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!who.ok) return false;
  const githubUser = await who.json() as { id?: number };
  if (githubUser.id !== verifiedGitHubId) return false;

  const membership = await fetch(
    `https://api.github.com/user/memberships/orgs/${encodeURIComponent(account.login)}`,
    { headers, signal: AbortSignal.timeout(10_000) },
  );
  if (!membership.ok) return false;
  const role = await membership.json() as {
    role?: string;
    state?: string;
    organization?: { id?: number };
  };
  return role.state === "active" && role.role === "admin" &&
    role.organization?.id === account.id;
}
