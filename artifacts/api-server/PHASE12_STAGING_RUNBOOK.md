# VibeSane Phase 1+2 — isolated staging and release runbook

Status: **isolated Supabase staging project created, schema installed, permission gates validated** (20 Nov 2026). Dedicated Render staging deployment and external integrations remain pending. Draft PR #61 must remain unmerged until the gates below pass.

### Verified staging environment — 20 Nov 2026
- Supabase organization: `darkhero766's projects` (Free). New project: **VibeSane-staging**, ref `aojmjxxmsgnipbbrtvlz`, region `ap-northeast-1`. Creation quote: **$0/month**; project reported `ACTIVE_HEALTHY`.
- Production project remains **separate**: `oxtwuylzxyleesfvsvtx`; no production database, Auth or Render changes.
- Schema-only bootstrap versioned at `supabase/staging/20261120_staging_bootstrap_hardened.sql`, applied to staging with migration name `vibesane_staging_bootstrap_hardened`, Supabase ledger version `20261120033524`.
- Nine application tables installed, all with RLS. No production rows or secrets copied. Intentional no-access tables show 6 informational `rls_enabled_no_policy` notices: zero client policies is a deny-by-default choice.
- The existing `PHASE1_READ_ONLY_PRIVILEGE_GATES.sql.check` returned **11/11 true** in staging. Hosted production had **3/11** at the earlier read-only audit; do not confuse results.
- Staging's `service_role` has SELECT/INSERT/UPDATE/DELETE on all nine tables; authenticated has usage/audit owner-scoped SELECT and tightly scoped hackathon permissions. GitHub tokens and billing events have no direct client permissions.
- Disposable synthetic `auth.users` record triggered creation of free `public.usage` row with expected plan and quotas, then was deleted. Confirmed no remaining staging Auth users, usage rows or token rows.
- **This is fresh-schema validation, NOT proof of a compatible migration from the legacy production grant state.** The original production migration ledger is still unreconciled.
- **No public Render staging service created**; secure staging DB URL/password, unique encryption key, OAuth app and Dodo sandbox secrets have not yet been configured or verified. No end-to-end external integration or billing test claimed.


## Isolation and budget rules
- Use a **new dedicated Supabase project**; never modify the existing Vibeguard project to simulate staging.
- Obtain the user's explicit organization choice before project creation. The currently connected Supabase organization is `darkhero766's projects` (Free plan, one existing active project on 20 Nov 2026). Confirm the creation quote; **no paid resource or nonzero incremental cost** without explicit approval.
- Use the user's approved Render workspace `My Workspace` for a separate **free-plan** staging web service, only if a staging database and separate secrets are ready. `autoDeploy=no`, deploy only the feature branch, and do not modify the current production services.
- Use no production user records, OAuth tokens, encryption keys, database backups, payment keys, payment webhooks, email domains or application secrets. Use new disposable test values and sandbox-only external accounts.
- Never bind the staging backend to the production Supabase project URL, DB URL, or any production billing webhook. Check endpoint hostname and project ref at each deploy.
- Prefer a private/restricted staging deployment. Render web services have public URLs; **do not create one with partially configured or production-connected secrets**.

## Step 1: Create and provision (requires org confirmation)
1. Create `VibeSane-staging` in the confirmed Supabase organization, free if available, ideally `ap-northeast-1` to match the existing project's region. Wait for `ACTIVE_HEALTHY`; verify project ID differs from production `oxtwuylzxyleesfvsvtx`.
2. Inspect expected schema in `lib/db/src/index.ts`, migrations, extension prerequisites and migration ledger differences. Reconcile a migration plan and seek review before applying to staging; the review-only scripts are **NOT** automatic production migrations.
3. Populate staging with schema and **synthetic fixture data only**. Use dedicated service-role/server credentials and a unique random GitHub token encryption key, held in the staging service's secret store.
4. Set up independent GitHub OAuth test app credentials and an isolated Dodo sandbox integration. Do not forward real webhooks or send real paid transactions.
5. After schema and secrets are ready, create a Render free staging API service from `feat/agentshield-phase1-phase2-security` with automatic deployments **off**, and test `/healthz` then `/readyz`; never point staging DNS at production.

## Step 2: Security controls on isolated staging
- Exercise *read-only* pre-lockdown results from `supabase/review-only/PHASE1_READ_ONLY_PRIVILEGE_GATES.sql.check`.
- Review and rehearse proposed entitlement, GitHub token and audit grants/policies with a real staging app, then apply only to **staging** under reviewed, explicitly approved steps.
- Re-run that read-only gate; all 11 checks must pass. Also verify actual requests from anon/authenticated roles cannot change plan, scan limits, customer/subscription IDs or obtain token ciphertext.
- Validate **service-side** token save/status/delete, anonymous 401, owner isolation, and no cached token leaks.
- Independently inspect the Supabase Auth leaked-password protection warning; enable only after checking the desired Auth behavior and agreement for that project.
- Validate backend read-only schema checks, migrations/backfills, quota limits, month transitions, checkout/webhook idempotency and audit writes.

## Step 3: Integration acceptance
- Test signup/login/logout/session refresh, user separation, GitHub OAuth connect/reconnect/disconnect, repo scans, missing/expired tokens, protected repos, quota enforcement and billing state.
- Use payment sandbox exclusively for upgrade, cancel, webhook signature validation, retry/idempotency and entitlement change; no real charges.
- Verify rollback/fail-closed behavior when Supabase, GitHub API, sandbox payments or scanner service is unavailable.
- Inspect logs for secrets, PII, authorization failures and accidental production hostname references. Smoke-test UI and API cross-origin integration.
- Record test case IDs, outcomes, evidence, branch/commit SHA, sanitized environment IDs and reviewer.

## Step 4: External accuracy and human signoff
- Freeze and disclose the benchmark dataset source and labels; obtain **human-reviewed ground truth** on representative, permissioned real repositories. Distinguish confirmed issues from speculative warnings.
- Measure precision, recall, false-positive rate by category and incomplete coverage. Report misses and real-world scanning cost. The 40-case AI-authored synthetic set is **NOT** an independent holdout.
- Have a qualified independent reviewer examine the new auth, entitlement, OAuth, database, token encryption and scanner logic.
- Require separate approval before production migration/credentials changes, deploying to users, or merging PR #61. Re-check GitHub Actions on the exact final head SHA.

## Gate status at start
- GitHub Actions: green for PR development code/report; prior successful run [#44666968567](https://github.com/Darkhero766/Vibeguard/actions/runs/44666968567); earlier successful [#44666690654](https://github.com/Darkhero766/Vibeguard/actions/runs/44666690654) ran 259 automated tests.
- Isolated PostgreSQL 17 grant rehearsals: green in CI, **not yet live staging tests**.
- Existing live Supabase: previously 3/11 permission gates passing, 8 failing; no production changes made.
- Dedicated staging Supabase/Render, real E2E, independent real-repo labels and security review: **pending**.

This document is a staging safety plan, not certification or authorization to deploy.


### Additional executed staging and CI evidence — 20 November 2026

**Hosted staging-only tests (executed, not merely planned):**
- `supabase/staging/PHASE12_TRANSACTIONAL_ROLE_PROOF.sql`: created two synthetic Auth identities inside a transaction, checked owner read isolation, no client plan UPDATE/INSERT, no access to GitHub ciphertext, no client audit INSERT, tightly scoped coupon ownership, and service-role token access; **passed and ROLLBACK**.
- `supabase/staging/PHASE12_TRANSACTIONAL_LEGACY_LOCKDOWN_REHEARSAL.sql.fixture`: temporarily simulated legacy permissive grants/RLS, executed the **existing proposed revocation bodies** and verified all 11 post-migration gates; **passed and ROLLBACK**. This does NOT reconcile production's historical schema migration ledger or verify deployment compatibility.
- `supabase/staging/PHASE12_TRANSACTIONAL_BILLING_AUDIT_PROOF.sql.fixture`: staged server-owned Pro entitlement update, duplicate Dodo webhook ID rejection, 90-day audit retention trigger, and owner-only audit/plan reads; **passed and ROLLBACK**. No Dodo API key or real payment/webhook used.
- Final read-only hosted staging audit: **11/11 permission gates passed**; `auth.users`, `public.usage`, `public.github_tokens`, `public.audit_runs`, `public.dodo_webhook_events`, `public.hackathon_redemptions` all contained **zero** test rows.

**Expanded application-level automated tests:**
- `test-phase1-github-http-contract.mjs`: real Express routes, real auth middleware behavior with **mocked** Supabase Auth HTTP, real AES-GCM token encryption, simulated DB/GitHub responses. Tests connection lifecycle, user isolation, private repo listing, errors and no ciphertext response.
- `test-phase1-crypto.mjs`: requires strict 64-digit key hex, GCM random IVs, integrity failure for tampering and wrong keys.
- `test-phase1-dodo-environment.mjs`: staging billing refuses unset/live Dodo mode; production's existing default remains unchanged.
- `test-phase1-dodo-signature.mjs`: HMAC signature, malformed base64 secrets, missing signatures, wrong body, wrong event ID, timestamp and version rejection.
- Successful [CI run 44682663676](https://github.com/Darkhero766/Vibeguard/actions/runs/44682663676): **271/271 automated tests**, all three CI jobs successful, no new Critical/High scanner warnings. Newer documentation commits require a final exact-head CI check.

**Phase 2 external-source smoke:** `benchmark-agentshield-public-repo-smoke.mjs` fetched four files at pinned `OWASP/NodeGoat@c5cb68a7...` without executing external code. Existing detector identified `eval_usage` and `open_redirect`, and did not detect plaintext password storage or ReDoS patterns. This was not a human-labeled representative benchmark; zero general precision/recall claims.

**Deployment safety / unresolved blocking prerequisites:**
1. No Render staging web API yet: obtain/store an isolated **staging-only Postgres connection password** and unique token encryption key using a trusted secrets manager; use dedicated OAuth test app and Dodo sandbox credentials. Never paste secrets into GitHub commits or this report.
2. For any staging API startup, set `VIBESANE_DEPLOYMENT_ENV=staging`, `DODO_PAYMENTS_ENVIRONMENT=test_mode`, and a staging-only app URL. Dodo production operations cannot be exercised without an actual sandbox setup. Authenticate and restrict access to any public staging URL before deployment.
3. Full HTTP browser/API OAuth, verified webhooks/checkout, quota resets, recovery/rollback, authenticated Claude Code app pilot and real-repo benchmark with independently **human-reviewed** ground truth have not been run. The mocked-HTTP tests are not a substitute.
4. Hosted production still has previously observed 8/11 failed permission gates and Auth leaked-password protection disabled. No live production changes, billing activity, publication, merge or rollback occurred.
5. Independent qualified security signoff and distinct production release authorization are mandatory. **Phase 1 and Phase 2 are not yet release-complete.**
