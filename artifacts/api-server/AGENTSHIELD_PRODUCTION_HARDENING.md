# VibeSane AgentShield — Production Hardening Phase 1

**Status: DEVELOPMENT CANDIDATE ONLY. No production deployment, npm publication, default-branch merge, Supabase schema change, external pilot invitations, or customer-data access authorized or performed.**

## Scope and verified starting point

This branch is based on the latest verified Week 5 development branch, which contains the merged Week 6 hybrid implementation (PR #59). The prior feature pipeline passed 117 AgentShield tests. Validate this branch's own exact SHA/CI before making any claims about the new code.

The existing supported scanner checks selected JavaScript, TypeScript and SQL patterns, plus selected JSON/YAML/.env configuration issues. The experimental AST tracks selected constructed SQL strings and now adds a bounded, in-file **request-input-to-SQL-sink taint** preview. It does not provide generic cross-file analysis or proof that a vulnerability is exploitable.

The local AI layer remains **optional advice from a user-installed localhost model**, receiving only bounded rule IDs and severities. No real authenticated Claude Code or installed local AI model has been exercised in this environment.

## Urgent Supabase security finding — NOT FIXED IN PRODUCTION

On a read-only check of the active Supabase project, public.usage had:
- enabled RLS;
- owner-scoped SELECT, INSERT and UPDATE policies;
- broad authenticated privileges on **plan, pro_expires_at, scans_limit, scan counters and subscription fields**;
- other broad SQL grants that merit least-privilege review.

RLS restricts *rows* to their owner, but the UPDATE policy does not stop a signed-in client from changing plan/subscription fields on its own record. This is a **potential entitlement or quota manipulation vulnerability**. No exploitation or proof-of-concept against a user account was attempted. Supabase's built-in security advisor did not flag this specific business-logic issue.

The only approved repository artifact here is **supabase/review-only/PROPOSED_USAGE_ENTITLEMENT_LOCKDOWN.sql**. It is NOT in the timestamped migration directory and is not automatically applied.

**Do not deploy the new API/browser code as if this were already fixed.** A production-ready release depends on approved staging verification, a reviewed canonical migration, and a read-only grant check after applying the migration. Use the Supabase CLI version actually installed, and generate a migration name with current CLI help. Do not rewrite existing production migration ledger entries merely to align filenames.

Current active Supabase project had nine public tables with RLS enabled, including usage, audit_runs and api_rate_limits; two public functions with execute privileges restricted for anon/authenticated. Live migration entries differ from some GitHub SQL filename timestamps. These differences should be reconciled by schema and function/policy diffs, not blind SQL replay.

Supabase advisor: Leaked Password Protection Disabled. Owner approval is required to enable it:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

The github_tokens table also has broad client SQL grants. The browser status read was repaired to query owner rather than a nonexistent id, but moving encrypted token storage behind strictly server-side privileges and authenticated status endpoints requires its own reviewed migration and end-to-end test.

## Changes implemented in this feature branch

### API and browser access control

- Authenticated /api/scans now fails closed with HTTP 503 when plan state cannot be loaded; it no longer silently provides a scan after quota-state errors.
- Quota consumption occurs before a result is cached or returned. Failed usage recording yields HTTP 429 (exhausted quota) or 503 (temporary failure) rather than a free scan.
- Browser AuthContext no longer inserts usage records with client credentials. The secure signup trigger and privileged backend initialize or update entitlements. If usage cannot be read, show unknown instead of inventing a plan.
- The GitHub connection status read uses the deployed github_tokens owner column.
- The plan and Dodo payment paths no longer run CREATE/ALTER/INDEX DDL automatically when serving web requests. They require approved schema columns to already exist. **Staging tests of billing and first-run database connections are still required** before deploying these changes.

### Hybrid security

- An additional TypeScript parser-based, in-file **tainted_sql_sink** analysis follows selected request inputs (req.query/body/params/headers, request JSON/text, Next.js nextUrl params) through some variables and transformations into supported SQL query APIs.
- Explicit parameter binding and numeric casts are negative controls; unknown sanitizers are not automatically trusted.
- Source snippets and customer credentials are not included in taint findings. Only bounded rule metadata reaches an explicitly enabled local AI endpoint.
- Code execution, repository import resolution and arbitrary repository test scripts are not part of scanning.
- Analysis runs with file, node, heap and timing budgets in the existing isolated worker; race or parser failure returns an incomplete report.
- The analyzer does NOT trace across files or functions, reason about SQL parameter correctness in all APIs, evaluate actual attackers, or prove authorization.

### Developer package and supported-language claims

- Updated an unpublished, versioned **0.7.0-beta.1** local package containing the deterministic scanner, the preview hybrid command, a bundled TypeScript AST/taint worker, source-independent Node scripts, a capability registry, and third-party license notice.
- Zero runtime npm dependencies in the package metadata and no lifecycle scripts; package-building tooling stays in the development workspace.
- Strict allowlist, SHA-256 archive digest, size budget, offline npm install and a disposable Git repo smoke test run in CI.
- The CLI capability registry explicitly separates JS/TS/SQL static heuristics, partial config checks, experimental AST/taint, and languages without dedicated SAST.
- The hybrid preview remains opt-in; the normal Claude Stop gate still uses the established static scanner. No unapproved code uploads, model downloads, or npm release.

## Accuracy and evidence policy

The historical Week 4 120-case and 24-case benchmarks were tuned during development; their percentages **do not predict real-world accuracy**.

Week 6's 24-case AST comparison deliberately stressed SQL strings stored in aliases and demonstrated incremental coverage, but it was not independent of development priorities.

Phase 1 adds 50 new, labeled source-to-SQL-sink challenge cases across Express, Next.js, ORM raw APIs, transformations and source aliases. The actual first-run results and after-tuning metrics are recorded below. Report exact TP, FP, TN, FN, category-level rates and failures as observed in CI, without changing labels to boost scores. A curated challenge corpus is not equivalent to independent external applications.

Do not call a disappearing finding independently verified; semantic correctness still requires approved regression tests, DB policies and human review.

## Measured results and precise completion status

The authoritative full CI run on the hardened source and disposable PostgreSQL was:

- https://github.com/Darkhero766/Vibeguard/actions/runs/44560838825
- Head commit: 985ce8a3ef059120783e175ca61608d3a96a8c64
- **160 / 160 AgentShield tests passed**, zero failed: Week1 9, Week2 21, Week3 32, Week4 19, Week5 11, local AI 8, AST 17, taint 31, release 12.
- Existing SUE regression: PASS.
- Web Vite build: PASS; web strict TypeScript: PASS.
- API build: PASS; API strict TypeScript: PASS.
- Portable hybrid npm tarball built offline, installed and scanned a synthetic Git project with bundled AST and taint worker. No npm publication.
- Separate PostgreSQL 17 CI job: **CI_PRIVILEGE_TEST_PASSED**, demonstrating a synthetic authenticated user could alter their own plan under the former broad privileges, but cannot after applying the proposed lock-down inside CI. This is not a live production validation.

### Source-to-SQL-sink benchmark, synthetic examples only

| Evaluation stage | TP | TN | FP | FN | Precision | Recall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| First evaluation of 50 new examples | 20 | 25 | 0 | 5 | 100% | 80% |
| After deliberately improving missed Koa, Next URL, Knex, Sequelize patterns | 25 | 25 | 0 | 0 | 100% | 100% |

**The second row is a tuned result, not a holdout.** The cases are chosen to exercise known risks; none establish real exploitability or expected performance on arbitrary repositories. A separate untouched application-level benchmark remains a release prerequisite. The AST/taint parser remains experimental and opt-in; the normal Claude gate is unchanged.

### Remaining unexecuted acceptance

- Interactive, authenticated Claude Code with real PostToolUse, Stop and Bash edits: **unexecuted** — no claude executable/authenticated agent available.
- Local Ollama/Qwen model evaluation: **unexecuted** — no Ollama or model available; existing protocol uses a synthetic loopback service.
- macOS installation, upgrade/recovery tests: **unexecuted** — no supported macOS runner available.
- Actual live Supabase least-privilege migration: **not applied**; pending explicit owner approval, reviewed migration and staging rollout.
- Production VibeSane website/webhook/payment testing: **not executed**; feature code is not deployed, and no credentials were used.
- External multi-developer pilot: **not conducted**; no invitations sent.

## Reproduce development checks

Prerequisites: Node.js >=20, Git and pnpm in the source checkout.

~~~bash
pnpm install --frozen-lockfile
pnpm run typecheck:libs
pnpm --filter @workspace/vibeguard run build
pnpm --filter @workspace/vibeguard run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build:agentshield
pnpm --filter @workspace/api-server run test:agentshield
pnpm --filter @workspace/api-server run test:agentshield:week2
pnpm --filter @workspace/api-server run test:agentshield:week3
pnpm --filter @workspace/api-server run test:agentshield:week4
pnpm --filter @workspace/api-server run test:agentshield:week5
pnpm --filter @workspace/api-server run test:agentshield:hybrid
pnpm --filter @workspace/api-server run test:agentshield:ast
pnpm --filter @workspace/api-server run test:agentshield:taint
pnpm --filter @workspace/api-server run test:agentshield:release
pnpm --filter @workspace/api-server run test:sue
pnpm --filter @workspace/api-server run benchmark:agentshield:taint
pnpm --filter @workspace/api-server run package:agentshield:beta
node artifacts/api-server/scripts/vibesane.mjs capabilities --format json
~~~

The package build creates a **local ignored tarball only**; do not distribute without approval. Source and archives remain in the development environment.

## Critical remaining release gates

1. **Supabase:** owner-approved review of usage entitlement lock-down, migration history drift, secret/token table grants and leaked-password Auth setting; staging migration and after-state verification; no blind production SQL replay.
2. **Authenticated Claude Code:** real PostToolUse, Stop, Bash-created file, permissions and bounded repair acceptance on supported macOS and Linux machines. Not present in this environment.
3. **Real Ollama/local model:** model actually installed in a controlled environment; consent, bounded source-redacted inputs, output quality, unsafe advice and memory/latency measured. Mock loopback API tests do not count.
4. **Independent security review:** review webhook signatures, plan abuse, GitHub token storage, source privacy, untrusted Git/config, symlink races, installer safety, dependency licenses, SQL policy correctness and PR changes.
5. **Release packaging:** owner-controlled scope and distribution channel, provenance/third-party licensing, verified install/uninstall on real target platforms, CI artifact integrity; no unverified download instructions.
6. **Independent holdout:** new, untouched licensed example projects, security-review labels, per-language support claims and realistic false-positive/false-negative evaluation. No real customer source without permission.
7. **Production staging:** dedicated staging environment, explicit workspace selection and approval, end-to-end GitHub API/Auth/payment/billing/usage checks. Existing app is not assumed deployed from feature branches.
8. **Human signoff:** private pilot of 3–5 consenting developers, telemetry opt-in only, no automatic invitations. Launch only after critical findings are resolved and owner explicitly approves.

**Release decision:** Engineering changes are reviewable; commercial/public/private-beta distribution is BLOCKED until the above gates actually pass.
