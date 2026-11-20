# AgentShield Phase 1 + Phase 2 Engineering Report
19 November 2026 — FEATURE BRANCH ONLY. NOT PRODUCTION APPROVED.

## Baseline
Previous production-hardening PR #60 merged into the Week 5 development branch, not main. Prior CI verified 169 tests. The current branch adds tests; consult its latest successful commit-matched CI for accurate final totals.

## Phase 1 — code completed, hosted access-control fix pending
Read-only inspection of active Vibeguard Supabase (Postgres 17) confirmed:
- public.usage grants authenticated INSERT/UPDATE including plan and quota fields. Owner RLS does not prevent an owner changing entitlement columns.
- public.github_tokens grants broad anon/authenticated table privileges; RLS limits access by owner, but client access to encrypted tokens is unnecessary and should be removed.
- public.audit_runs grants more privileges than the SELECT-only owner RLS policy needs.
- Supabase Auth security advisor reports leaked-password protection disabled.
- No Supabase development branch is available.

Live Supabase migration ledger (six entries):
- 20260914133603 harden_server_side_rls_and_owner_foreign_keys
- 20260914133634 optimize_rls_and_lock_signup_trigger
- 20260914133649 revoke_public_signup_trigger_execute
- 20261006131921 add_audit_scan_usage
- 20261008060445 harden_audit_rls_retention
- 20261008060541 add_api_rate_limits

October 8 recorded versions differ from some GitHub migration filenames. Required live tables and columns are present, but the ledger is not reconciled. Do NOT blindly replay historic SQL or alter migration records.

Implemented feature-branch changes:
1. GitHub OAuth token read/insert/delete now uses parameterized server-owned database SQL, not end-user JWT Supabase REST. Encryption stays on the server.
2. Authenticated GitHub connection status API returns a boolean only, with no-store cache directive; frontend never queries github_tokens ciphertext table. Disconnect errors are not misreported as success.
3. Removed all startup DDL, table creation, indexes and privileged account backfills from shared database initialization. Startup instead performs read-only schema validation; /readyz returns 503 if required tables or columns are missing, without publishing internal schema details.
4. Existing quota and billing fail-closed mechanisms are retained.
5. Prepared review-only entitlement and token/audit privilege lockdown SQL, plus isolated PostgreSQL 17 pre/post privilege regression fixtures. Both disposable CI database tests pass.

Proposals intentionally NOT applied:
- supabase/review-only/PROPOSED_USAGE_ENTITLEMENT_LOCKDOWN.sql
- supabase/review-only/PROPOSED_GITHUB_TOKEN_AUDIT_LOCKDOWN.sql

Controlled staging/production sequence (requires explicit owner approval):
1. Review SQL, verify server-only privileged database role, backup and disaster plan.
2. Stage the new API/browser build with existing grants; verify GitHub connect/repos/disconnect, signup, usage, webhook, payments, audit and quota behavior.
3. Reconcile migration ledger and create approved timestamped migration using the installed Supabase CLI help. Test in a private staging database only.
4. Apply grants on staging, test anon/authenticated denials and service-side access, then perform human security signoff.
5. Only after separate approval, deploy compatible application code to production before migrating grants, monitor, verify post-state privileges and all customer flows. Do NOT revert to incompatible old browser-token code after the grants are revoked.
6. Review enabling leaked-password protection separately.

No hosted Supabase SQL, Auth settings, credentials or data were modified.

## Phase 2 — experimental security engine improvements implemented

The local opt-in hybrid mode now includes:
- One-hop named relative imports among selected changed JS/TS files, following certain request values to unsafe helper SQL construction. Some aliases and default/named helper exports are modeled.
- Next.js mutation-route guarded authorization checks. A bare getUser/getServerSession call does not prove authorization; an explicit checked deny/return/throw before mutation is expected.
- Supabase SQL heuristics for explicit DISABLE ROW LEVEL SECURITY and unconditional client-facing write policies.
- Core GitHub repository scanner now also refuses to trust bare auth calls before database writes.
- Existing source size, file count, symlink/path bounds, scan-incomplete behavior, 10-second worker deadline, and 256MB V8 heap bound remain.

These are selected heuristics, not proof of exploitability, complete authorization, SQL correctness or a comprehensive AST/taint product. The one-hop rule analyzes only changed files, not arbitrary imports or whole projects. AI remains optional local metadata-only advice and cannot override static verdicts. No own foundation model was trained.

New 40-case synthetic challenge, FIRST run before tuning:
- One-hop SQL: TP 8, TN 10, FP 0, FN 2 (recall 80%).
- Next.js authorization: TP 9, TN 10, FP 0, FN 1 (recall 90%).
- Total: TP 17, TN 20, FP 0, FN 3, precision 100%, recall 85% on these selected synthetic labels.
The three misses were subsequently used to improve detection, so later results on these SAME cases are tuned, not untouched evaluation. The synthetic code is not verified real-world exploit evidence.

## Before Phase 1 and 2 can be signed off
- A real isolated Supabase staging environment and fully reviewed migrations.
- Explicit owner approval and actual production privilege lock-down, post-state verification and Auth setting review.
- End-to-end staging payment, GitHub OAuth, webhook, quota and account tests.
- Human security review, external/untouched application-level detection benchmark with independently reviewed labels and realistic performance.
- Support matrix and truthful marketing distinguishing heuristic, AST, SQL and unsupported languages.

Later release gates also remain: real authenticated Claude Code sessions, real installed local model validation, macOS install/recovery, external private pilot, publication and deployment approval.

## Sources
https://supabase.com/docs/guides/database/postgres/column-level-security
https://code.claude.com/docs/en/hooks
https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/overview
https://asvs.owasp.org/

CI pass does not authorize public distribution or prove an application is secure.


## Continuation — 20 November 2026

Changes added after the original 19 November report:
- Added a second, fixed 40-case synthetic challenge (20 cross-file, 20 Next.js; positive/negative cases balanced) and an informational GitHub Actions benchmark. Its labels were AI-authored, **not independently human-reviewed**. It is not a real-project evaluation. No new benchmark pass is claimed until CI output is inspected.
- Hardened experimental Next.js AST auth checks: a branch must be top-level and its denial path guaranteed; optional conditional auth, swallowed try/catch auth, nested callback returns do not qualify.
- Hardened the baseline GitHub API scanner so nested conditional/callback returns do not suppress missing-auth warnings.
- Added nine focused regression cases (six AST and three baseline). The latest commit CI has **not yet been verified**.
- Added `supabase/review-only/PHASE1_READ_ONLY_PRIVILEGE_GATES.sql.check`, which is read-only, not a migration.
- Ran this SQL against live Supabase on 20 Nov 2026 without mutating data or access controls: **3 of 11 security gates passed, 8 failed**. Failing: authenticated usage INSERT/UPDATE, authenticated token read/write, anonymous token access, authenticated audit writes, old usage write RLS policies, old token client RLS policy.
- Leaked-password protection remains disabled per Supabase Auth advisor.

**Phase 1 remains blocked for production release.** No confirmed isolated staging project, approved migration, security review, privilege lockdown, or end-to-end staging tests. Deploy compatible API/browser before any approved grant revocations. Do not automatically apply proposed review-only SQL patches.

**Phase 2 remains experimental.** Requires independently reviewed real-project accuracy, false-positive analysis, realistic large-repo performance, and up-to-date CI evidence. No exploit proof or security guarantee is implied.

**Merge/rollout:** Keep PR #61 draft. Do not merge/deploy/publish or change live settings without a separate release approval. This is engineering-only continuation.
