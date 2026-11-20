# VibeSane — 30 November 2026 private-beta go/no-go

**Scope:** finish Phase 1 (critical security and database hardening) and Phase 2 (dependable security detection). No Phase 3 development until both exit gates pass and a release decision is made.

**Target:** invite-only / controlled beta by **30 November 2026**, **conditional** on the gates below. This is a target, not permission to merge/deploy or a guarantee of release. Broad public GA, security certifications, and million-dollar funding are not implied.

## Current verified baseline (20 Nov 2026)

| Gate | Verified evidence | Remaining |
|---|---|---|
| Staging DB schema, RLS | Separate Supabase project `aojmjxxmsgnipbbrtvlz`; 9 tables, 35 columns, 11/11 privilege checks; role isolation and rollback-only billing/audit simulations | Production migration/rollback |
| Hosted staging DB | Render staging service `srv-dbvui5afngtc73ahhu70`; schema verified on app startup and `GET /api/readyz` returned HTTP 200 in Render logs | Hosted smoke CI, **same app commit as release candidate**, OAuth/payment/signup E2E |
| Scanner/code regressions | `272/272` Node tests in previous verified CI `44688572812`; separate PostgreSQL rehearsals green | New CI at exact head, independently reviewed real-project evaluation |
| Staging secrets | Stage-only Supabase URL/key, encryption/access secrets and Dodo test-mode guard | Independent GitHub OAuth test app + Dodo sandbox keys and verified callbacks |
| Production access | **3/11** privilege gates passing and **8/11 failing** in most recent prior read-only audit | Backup + reviewed, separately approved migration, live 11/11 verification |
| External scanner evaluation | Two supported rules detected on pinned OWASP NodeGoat samples; plaintext password storage and ReDoS not detected | Human-reviewed real repos, false-positive/miss analysis, transparent supported scope |
| Security review | Internal tests and read-only catalog checks | Qualified **independent** human review/signoff |

Do not paste credentials into GitHub or this report. Any Render environment update must target staging service, never production.

## Ten-day execution window

- **Nov 20–21 — Phase 1 staging baseline:** prove hosted health/ready (200); unauthorized route (403), unsigned Dodo webhook (401), CORS preflight (204); verify app-deployed SHA matches the reviewed PR head. Capture sanitized CI + Render evidence.
- **Nov 21–23 — Staging end-to-end:** configure *new test-only* GitHub OAuth app and Dodo sandbox in provider consoles. Verify real staging user signup/login/logout, JWT auth, GitHub connect/reconnect/repo listing/scan/disconnect, token loss/error handling, scan quotas, and audit records. Run sandbox upgrade/renew/cancel/replay and webhook retry and confirm entitlement transitions. No real money.
- **Nov 23–25 — Phase 2 independent verification:** freeze one untouched set of permissioned real JS/TS/Next.js/Express/Supabase projects; obtain human-reviewed issue labels. Publish per-rule TP/TN/FP/FN, incomplete files, scan duration, false positives, and examples of missed classes. No blanket 'accurate' claim from synthetic or partially tuned samples.
- **Nov 25–26 — Production migration readiness:** compare current schema/migrations against reviewed PR, create verified backup/snapshot and rollback instructions, rehearse production-state migrations in isolated staging using **schema-only** migration or synthetic records, and verify API/browser dependencies no longer rely on client quota/token writes. Independent security reviewer approves before rollout.
- **Nov 27–28 — Candidate build + controlled deploy:** CI green on exact release SHA; staged E2E all green; obtain **separate explicit production change approval**; deploy compatible API and UI before database privilege revocation, validate health and customer flows, apply approved SQL, verify 11/11 privilege checks, check errors and monitoring, retain rollback plan. Do not claim success until post-rollout smoke tests pass.
- **Nov 29–30 — Private-beta go/no-go:** invite small permissioned cohort only if all blocker gates are evidenced; disclose bounded scanner stack support and experimental status; monitor false positives, scan failures, authentication, billing and quotas. **Delay rather than bypass a failed critical security gate.**

## Precise exit criteria (go/no-go)

**Phase 1 PASS requires all:**
1. Hosted staging API `/api/readyz=200`, private routes denied without access secret, no production database references, no secret/log leakage.
2. Staging real sessions, GitHub OAuth and Dodo sandbox end-to-end pass; security-specific negative controls (cross-tenant, IDOR, webhooks, unauthorized billing/plan writes) pass; no real transactions.
3. Production migration tested on representative legacy schema and independently reviewed, with backup/rollback; live 11/11 privilege gates pass **after** explicitly approved, monitored rollout.
4. Supabase Auth security advisor warnings (including leaked-password protection) resolved or formally reviewed and risk-accepted; independent reviewer checks token encryption, grants, row security and billing.
5. No fatal or high-severity unresolved security findings.

**Phase 2 PASS requires all:**
1. Exact-commit GitHub Actions builds/typechecks/regressions green.
2. Untouched **real** repositories or intentionally permissioned open-source projects with human-reviewed labels; report per-category confusion matrix (not just one aggregate score), missed critical issues, false-positive cost and performance.
3. Verified JS/TS/React/Next.js/Node/Express/Supabase/SQL *supported subset* documented, unsupported patterns clearly shown; no promises for Python/FastAPI/Django until evidence supports those stacks.
4. Tests of security-detection fail-closed behavior on incomplete/damaged files, large projects and missing tokens; scanner never auto-merges or silently alters code.

**Release result fields to complete:** final release commit SHA; reviewed PR URL; staging deploy SHA; CI run URL; reviewer name/date; approved production backup ID; production gate table 11/11; staging E2E log IDs; external ground-truth dataset SHA and report; monitoring/rollback owner.

## Hard release stop conditions

- Any mismatch between staging and production project IDs or hostname; leaked staging access/encryption secrets; required paid resources without explicit permission.
- Missing real OAuth/payment sandbox E2E; missing independent security review; confirmed auth/entitlement bypass; 8/11 production permission failures still present.
- Scanner accuracy claims unsupported by independent labeled samples; a critical real-repo miss with no documented mitigation.
- PR #61 merges prematurely. Its base is `feat/agentshield-week5-launch-readiness`, **not `main`**. Validate eventual promotion path to the production deployment branch separately.

## What Phase 3 means afterward

Language and framework expansion planned in the user's earlier 10-stage support roadmap: **Java, Go, PHP, Ruby, and C#**. This comes *after* Phase 1/2 security gates and a controlled launch decision, not instead of them. See `PHASE3_IMPLEMENTATION_PROMPT.md`. No cross-language production guarantee exists yet.
