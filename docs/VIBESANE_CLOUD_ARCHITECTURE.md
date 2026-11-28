# VibeSane Cloud Architecture

Status: architecture direction for the optional cloud layer. This document does not provision services, change production settings, create database objects, or enable the Clerk feature flag.

## 1. Product boundaries

VibeSane has two deliberately separate execution planes:

### Foxy Local

- Runs on the developer's machine through MCP STDIO.
- Performs local repository scanning, findings, baselines, queue work and verification.
- Does not require a VibeSane account for local scanning.
- Does not automatically upload source files, patches, secrets or raw repository contents.
- Uses a local completion gate only as a cooperative control. A same-user process can alter local configuration; required CI and protected-branch rules are the authoritative external controls.

### VibeSane Cloud

- Provides website identity, account settings, billing entitlements, optional report history and future organization features.
- Must not be a dependency for a local scan or a local MCP startup.
- Stores only data needed for a named cloud feature and only after the user has been clearly informed.
- Cloud report synchronization is opt-in, separately authorized, redacted and revocable.

A cloud outage must not disable Foxy's local scan/verify workflow.

## 2. Existing service boundaries

| Layer | Existing/selected service | Responsibility |
|---|---|---|
| Web identity provider | Clerk, optional | Sign-in identity and OAuth/OIDC login |
| Application session authority | Supabase Auth | Issues the session JWT currently consumed by the VibeSane frontend/API |
| Application database | Supabase Postgres | Existing application records, ownership and RLS |
| API and background work | Existing VibeSane API on Render | Business rules, authenticated endpoints, webhook processing |
| Web frontend | Existing VibeSane frontend hosting | Website, auth page, account/dashboard |
| Billing | Existing billing integration | Checkout, verified webhook events and subscription state |
| Source and CI | GitHub / GitHub Actions | Review, source-matched checks and release qualification |
| Local package distribution | npm candidate, not published | Versioned Foxy CLI/package after release gates |

Do not add a second database, second API host, new billing provider or mandatory telemetry vendor merely to complete the MVP. Reuse existing services until a measured operational need justifies a change.

## 3. Authentication decision

The current Clerk PR uses Clerk as an optional identity provider through Supabase Auth's custom OAuth provider identifier `custom:clerk`. Supabase Auth remains the session issuer and UUID authority. This is intentional because current VibeSane records, quotas, billing ownership, referrals, RLS and API bearer-token contracts are tied to Supabase user UUIDs.

This is not the same architecture as using Clerk-issued JWTs directly as third-party tokens for Supabase Data API access. Moving to that model would require a separate identity and data-ownership migration plan. Do not mix both token models casually.

### Required request validation

- Frontend sends the Supabase access token for existing VibeSane API routes.
- API validates the JWT signature, issuer, audience, expiry and intended Supabase project using a trusted server-side verifier.
- API derives the principal from the verified token; it never trusts a client-supplied user ID as proof of ownership.
- API checks resource ownership and organization membership on every request.
- Roles, plan entitlements and organization permissions are server-controlled; do not use editable user metadata as an authorization source.
- Clerk Client Secret, Clerk Secret Key, Supabase service-role key and billing secrets must never enter browser bundles, MCP config files, package artifacts or logs.
- OAuth callback URLs and allowed redirects must be exact and environment-specific.

### Account continuity

Before enabling Clerk for existing users, staging must verify:
1. New Clerk identity creates/links the expected Supabase user.
2. Returning users resolve to the same intended Supabase UUID only through an explicit, provider-verified account-linking flow.
3. Matching email alone is not treated as proof that two accounts may be merged.
4. Usage, paid entitlement, referrals, GitHub connection and report ownership remain attached to the intended UUID.
5. Sign-out, revoked provider authorization and failed callback flows clear state safely.

The Clerk UI flag remains disabled until the matching Supabase custom provider and Clerk OAuth application have been configured in an isolated staging environment and this checklist has passed.

## 4. Cloud data model direction

No schema migration is proposed by this ADR. When team features are approved, prefer explicit ownership tables:

- `profiles`: user-owned profile/preferences keyed by the Supabase Auth UUID.
- `organizations`: tenant record with an explicit owner/admin lifecycle.
- `organization_memberships`: user-to-organization relationship and server-defined role.
- `installations`: optional client installation metadata; never store source code or long-lived provider credentials here.
- `cloud_scan_reports`: user/organization-owned, opt-in, sanitized report metadata with a retention/deletion contract.
- `audit_events`: minimal security-relevant administrative events with redaction and bounded retention.

Every exposed table must have RLS enabled and ownership-aware policies. Membership writes and role changes must be authorized server-side. Use explicit `USING` and `WITH CHECK` rules for updates. Views exposed to clients must use invoker security where applicable. Never ship the Supabase service-role key to the browser or local Foxy package.

## 5. Local-to-cloud protocol

Cloud synchronization is a later, optional capability. Its default must be off.

Permitted future payloads, only after explicit opt-in:
- opaque installation ID and client version;
- timestamp, scan duration and platform/agent identifiers;
- finding counts grouped by rule/severity;
- redacted finding metadata necessary to render the user's cloud report.

Never transmit by default:
- repository source, diffs or patches;
- raw file contents or full paths;
- secret values, credential-bearing URLs or environment variables;
- prompt transcripts or coding-agent conversation history;
- local SQLite queue or baseline database contents.

The API must validate payload size and schema, apply rate limits, strip sensitive fields, enforce per-user/tenant quotas and record user consent/version. Provide a clear disconnect and cloud-data deletion path. Local scanning must continue to work after logout, token expiry or network failure.

## 6. Billing and entitlements

Keep the currently configured billing provider. Do not migrate payment processors as part of the Foxy launch.

- The browser may display plan state but cannot grant access.
- The API derives entitlements from verified, replay-protected billing webhook records.
- Webhook signatures, event IDs, idempotency, subscription ownership and cancellation state must be checked server-side.
- Entitlements are bound to the authoritative Supabase UUID or an organization record, not a client-supplied email.
- Foxy's local scan capability must not require subscription lookup. Cloud/team features may enforce server-side plans later.

## 7. Reliability and security controls

Before enabling cloud report history or organizations:
- strict CORS allowlist and HTTPS-only production endpoints;
- server-side JWT validation and object-level authorization;
- RLS policy tests for owner, non-owner, member, admin and anonymous access;
- rate limits and payload-size limits on authenticated and public endpoints;
- redacted structured logging with no tokens, source code, secrets or report bodies by default;
- webhook signature verification and idempotency;
- backup/restore exercises and account-deletion tests;
- retention schedule and user-facing data export/deletion process;
- dependency and secret scanning in CI;
- staging isolation from production keys, data, callbacks and billing webhooks.

Observability should start with the existing host logs and redaction review. Add a monitoring vendor only when alerting and retention requirements are defined.

## 8. Delivery sequence

1. Complete Foxy's local installer, configuration isolation, diagnostics and package qualification independently of Clerk.
2. Configure a Clerk development OAuth app and Supabase custom provider in isolated staging only.
3. Complete login, account-continuity, logout, referral, existing Google/GitHub/email and billing-return staging tests.
4. Review API JWT validation, RLS ownership and billing webhook contracts without weakening current controls.
5. Add an opt-in cloud report endpoint only after the data contract, consent UI, redaction, rate limits, retention and deletion tests exist.
6. Add organizations/memberships only when team functionality is approved and tenant-isolation tests pass.
7. Enable production Clerk, cloud sync or paid team features only after explicit owner approval and a documented rollback.

## 9. Non-goals for the current MVP

- No remote hosted Foxy MCP server.
- No forced login to use local scanning.
- No automatic repository/source upload.
- No new billing provider.
- No automatic sharing of local security findings with an organization.
- No production Clerk/Supabase configuration or schema migration as part of this change.
