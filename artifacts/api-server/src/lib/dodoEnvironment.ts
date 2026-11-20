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
