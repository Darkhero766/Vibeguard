/** Payment environment isolation. Staging must never default to live charges. */
export function assertDodoEnvironmentSafe(): void {
  if (process.env.VIBESANE_DEPLOYMENT_ENV === "staging" &&
      process.env.DODO_PAYMENTS_ENVIRONMENT !== "test_mode") {
    throw new Error("VibeSane staging must explicitly use DODO_PAYMENTS_ENVIRONMENT=test_mode");
  }
}

export function dodoBaseUrl(): string {
  assertDodoEnvironmentSafe();
  return (process.env.DODO_PAYMENTS_ENVIRONMENT || "live_mode") === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com";
}

/** Staging checkout must never redirect a test purchase to production. */
export function dodoCheckoutReturnOrigin(env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (env.VIBESANE_DEPLOYMENT_ENV === "staging") {
    const approved = "https://vibesane-phase12-staging-web.onrender.com";
    const configured = (env.VITE_APP_URL ?? "").trim().replace(/\/+$/, "");
    if (configured && configured !== approved) {
      throw new Error("Unsafe staging checkout return origin");
    }
    return approved;
  }
  return env.VITE_APP_URL || "https://vibesane.app";
}

/**
 * Both supplied authoritative signals must agree with the signed-in account.
 * Missing metadata may occur with older billing records; do not infer ownership
 * from an empty metadata object or a missing customer email.
 */
export function dodoSubscriptionBelongsToAccount(data: {
  metadataUserId: string | null;
  customerEmail: string;
  userId: string;
  accountEmail: string;
}): boolean {
  const metadata = data.metadataUserId?.trim() ?? "";
  const email = data.customerEmail.trim().toLowerCase();
  const accountEmail = data.accountEmail.trim().toLowerCase();
  if (!metadata && !email) return false;
  if (metadata && metadata !== data.userId) return false;
  if (email && email !== accountEmail) return false;
  return true;
}
