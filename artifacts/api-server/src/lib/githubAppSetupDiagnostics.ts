/**
 * Privacy-safe GitHub App setup classifications. Never log API credentials,
 * installation state, upstream response bodies, or arbitrary error messages.
 */
export type GitHubAppSetupReason =
  | "missing_app_id"
  | "missing_private_key"
  | "missing_installation_state_secret"
  | "malformed_private_key"
  | "github_api_unauthorized"
  | "github_api_forbidden"
  | "github_api_not_found"
  | "github_api_service_error"
  | "github_api_unexpected_response"
  | "github_api_transport_error"
  | "unclassified_setup_failure";

export function missingGitHubAppPrerequisite(env: NodeJS.ProcessEnv = process.env): GitHubAppSetupReason | null {
  if (!env.GITHUB_APP_ID?.trim()) return "missing_app_id";
  if (!env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim() && !env.GITHUB_APP_PRIVATE_KEY?.trim()) return "missing_private_key";
  if (!env.GITHUB_APP_STATE_SECRET?.trim() && !env.GITHUB_APP_WEBHOOK_SECRET?.trim()) {
    return "missing_installation_state_secret";
  }
  return null;
}

export function classifyGitHubAppSetupError(error: unknown): GitHubAppSetupReason {
  const message = error instanceof Error ? error.message : "";
  if (/GITHUB_APP_ID is required/.test(message)) return "missing_app_id";
  if (/GITHUB_APP_PRIVATE_KEY is required/.test(message)) return "missing_private_key";
  if (/GITHUB_APP_STATE_SECRET or GITHUB_APP_WEBHOOK_SECRET is required/.test(message)) return "missing_installation_state_secret";
  if (/PRIVATE_KEY_BASE64 is not valid|private key is invalid|DECODER routines|PEM routines|no start line|bad decrypt|digital envelope routines|not supported/i.test(message)) return "malformed_private_key";
  if (/GitHub App lookup failed:\s*401\b/.test(message)) return "github_api_unauthorized";
  if (/GitHub App lookup failed:\s*403\b/.test(message)) return "github_api_forbidden";
  if (/GitHub App lookup failed:\s*404\b/.test(message)) return "github_api_not_found";
  if (/GitHub App lookup failed:\s*5\d\d\b/.test(message)) return "github_api_service_error";
  if (/GitHub App lookup failed:|GitHub App slug was not returned/.test(message)) return "github_api_unexpected_response";
  if (/fetch failed|timeout|ETIMEDOUT|ENOTFOUND|ECONNRESET|network/i.test(message)) return "github_api_transport_error";
  return "unclassified_setup_failure";
}
