# VibeSane Clerk sign-in setup

## Architecture decision

VibeSane currently uses Supabase Auth as its session and user-ID authority. API requests carry Supabase access tokens; application records, scan quotas, billing ownership, referrals and GitHub-token records are keyed to Supabase user UUIDs.

This integration adds **Clerk as an additional identity provider**, not a replacement for Supabase Auth. Clerk acts as the OAuth/OIDC identity provider, while Supabase Auth completes the callback and issues the Supabase session that the existing frontend and API already expect. This preserves the current UUID-based data model and avoids a risky account migration.

The website button is feature-gated and is hidden by default. No Clerk client secret belongs in Vite/browser environment variables.

## Configure the Clerk OAuth application

1. In the Clerk Dashboard, select the VibeSane Clerk instance (create a separate development instance for staging/testing).
2. Open **OAuth applications** and create an OAuth application named **VibeSane**.
3. Enable the scopes `openid`, `profile` and `email`.
4. Save the Client ID and Client Secret securely. Clerk only shows the Client Secret when it is created; keep it in the password manager until the Supabase provider is configured.
5. Keep the Clerk Frontend API URL for the matching Clerk instance. Clerk publishes OAuth authorization-server metadata at:
   `https://<your-clerk-frontend-api>/.well-known/oauth-authorization-server`.

## Configure Supabase Auth

1. Open the matching Supabase project, then **Authentication → Sign In / Providers → Custom Providers → New Provider**.
2. Choose **Manual configuration (OAuth2)** and use the unique provider identifier `custom:clerk`.
3. Paste the Clerk OAuth application's Client ID and Client Secret into the Supabase provider form. The secret must remain in Supabase Auth and must never be copied to Vite or frontend source.
4. Add the callback URL shown by Supabase to the Clerk OAuth application's **Redirect URIs** list. Copy the exact URL; do not construct it yourself.
5. From Clerk's OAuth authorization-server metadata document, use the listed `authorization_endpoint` and `token_endpoint`. Use the listed `userinfo_endpoint`; if the metadata document does not list one, Clerk documents the userinfo endpoint as `<Clerk Frontend API URL>/oauth/userinfo`.
6. Configure scopes `openid profile email`, then save and enable the provider.
7. In Supabase Auth URL configuration, allow the exact VibeSane website callback/redirect origin used by this deployment. Keep development/staging URLs separate from production URLs.

Supabase custom provider identifiers use the `custom:` prefix. The web client calls the provider identifier `custom:clerk`.

## Enable the website button

Set this public frontend build variable only for the deployment where the provider has been configured:

```dotenv
VITE_CLERK_AUTH_ENABLED=true
```

The default is `false`, so the new **Continue with Clerk** button remains hidden until the backend provider is configured. Rebuild and deploy the relevant non-production frontend after setting the flag. The existing email/password, Google and GitHub buttons remain available.

Do not set any of the following in a `VITE_*` variable: Clerk Client Secret, Clerk Secret Key, Supabase service-role key or any backend credential.

## Staging acceptance checklist

Use a separate Clerk development instance and the isolated VibeSane staging deployment first.

- [ ] Clerk button is absent while `VITE_CLERK_AUTH_ENABLED=false`.
- [ ] Clerk button appears when the flag is `true`.
- [ ] New user can complete Clerk authentication and returns to the VibeSane redirect URL.
- [ ] Supabase Auth creates/links a Supabase user and returns a valid Supabase session.
- [ ] Frontend `AuthContext` loads the Supabase UUID, usage row and GitHub connection status.
- [ ] Existing Google, GitHub and email/password sign-in still work.
- [ ] A returning account retains its existing usage/billing ownership and Pro entitlement. Do not assume email matching has linked an existing account; verify the actual Supabase identity link and UUID before testing paid flows.
- [ ] Referral attribution survives the OAuth redirect and can be claimed exactly once.
- [ ] Dodo billing return sync and authenticated API calls still accept the Supabase bearer token.
- [ ] Sign-out clears the Supabase session and authenticated UI state.
- [ ] Invalid/disabled custom provider returns a recoverable error and does not leave the page stuck loading.

Do not enable the flag in production until the staging checklist passes and the owner explicitly approves the production configuration/deployment. No provider dashboard or deployment settings are modified by this repository change.

## References

- [Clerk: Use OAuth for Single Sign-On (SSO)](https://clerk.com/docs/guides/configure/auth-strategies/oauth/single-sign-on)
- [Clerk: How Clerk implements OAuth](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
- [Supabase: Custom OAuth/OIDC Providers](https://supabase.com/docs/guides/auth/custom-oauth-providers)
