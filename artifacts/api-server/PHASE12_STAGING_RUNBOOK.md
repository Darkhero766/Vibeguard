# VibeSane Phase 1+2 — isolated staging and release runbook

Status: **prepared only; staging infrastructure not yet created**. Draft PR #61 must remain unmerged until the gates below pass.

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
