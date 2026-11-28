# VibeSane product roadmap — master source of truth

**Version:** 1.0  
**Date:** 22 November 2026  
**Owner decision state:** engineering roadmap; later phases beyond Phase 3 are proposals, not commitments.  
**Primary release target:** controlled, invite-only beta decision by 30 November 2026, conditional—not a promised launch.

## Why this document exists

This is the durable project plan for future engineering sessions. Read it together with `../START_HERE.md`. It separates the web SaaS from the AgentShield local developer preview, records the release gates, and makes clear which work is shipped, experimental, or merely planned.

## Product thesis and initial wedge

**Working thesis:** VibeSane helps small software teams shipping AI-assisted code catch high-impact security mistakes before they reach production, with source-linked evidence, lower-noise findings, understandable fixes, and verification that a fix removed the risky path without silently changing application code.

Do not position the MVP as "another universal SAST" or "AI finds every bug." The initial evidence-backed wedge should be:
- JavaScript/TypeScript web apps and APIs, especially Next.js/Node/Express;
- Supabase/Postgres-backed apps: RLS, privileged RPCs, service-role exposure, auth/tenant ownership, billing/entitlement logic;
- GitHub pull-request and push-time review with actionable, reproducible findings;
- optional local AgentShield checks for AI coding workflows, only where that feature is actually installed and validated.

**Differentiation hypothesis to test with users:** a developer-focused "AI code change assurance loop" that connects (1) deterministic source checks, (2) explanation of the affected user/data boundary, (3) evidence-backed remediation suggestions, (4) rerun and verify the repair, and (5) a readable PR/repository audit trail. The model should explain and assist—not decide the security verdict. Local AgentShield and remote GitHub scans should have explicit, separate privacy descriptions.

## Architecture: two surfaces, one trust model

### A. VibeSane web/GitHub SaaS
- GitHub OAuth identifies the person.
- GitHub App grants repository installation access; OAuth and App installation are not interchangeable.
- Server-side token persistence/encryption, tenant ownership, quota, billing, reports, SUE checks, GitHub webhooks, and remote scanner processing.
- Public/private repository behavior, webhook-triggered deltas, baseline scans, and report UX must be described according to actually tested behavior.

### B. AgentShield local developer preview
- Local CLI/hook scanning selected changed files; do not execute customer source code.
- Week 1–6 engineering exists on the feature branch; local scan budgets, fail-closed incomplete status, Monitor/Assist/Auto-fix modes, experimental AST and optional Ollama-compatible metadata-only advisory each have different evidence levels.
- The standalone package and real Claude Code session/OS matrix are not approved for public distribution merely because unit tests pass.

## Ten-phase roadmap

### Phase 1 — Secure web SaaS foundation (ACTIVE; release gates NOT CLOSED)
**Goal:** make user identity, repository ownership, paid entitlements, quotas, tokens and data access safe and predictable.

Scope:
- GitHub OAuth login and separate GitHub App installation; server-side OAuth token storage/encryption and installation-to-account ownership checks.
- Signup/session/logout, account isolation, private-repository consent, reconnect/disconnect and safe handling of revoked tokens.
- Dodo test-mode checkout, signed webhook verification, event idempotency, correct subscriber binding, subscription status/paid-through semantics, cancellation/failure/replay and entitlement expiry.
- Server-authoritative quota reservation/consumption, monthly reset, scan failure behavior and audit history.
- Supabase RLS/grants least privilege; no browser INSERT/UPDATE to entitlement rows or client access to OAuth token ciphertext; migration ledger compatibility; backup/restore/rollback.
- Environment separation, secret redaction, rate limiting, readiness checks, CORS and access gates.

Exit gate:
1. Actual staging account signup/login/logout and OAuth/App installation/reconnect/repo list/disconnect with at least two separate test identities.
2. Cross-tenant and IDOR negative controls: no account can see another user's installation, token, report, quota or entitlement.
3. Dodo sandbox success, duplicate/out-of-order webhook, scheduled cancellation, actual termination, failed/on-hold/resume/renewal/failure recovery. Test on a disposable second subscription; never cancel the owner's working test subscription without approval.
4. Server-only token and entitlement access; post-migration permissions proven by read-only live checks; quota/month boundary and failed scan rollback tested.
5. Reconciled migrations, tested backup and restore/rollback, owner-approved production migration and post-state verification. The earlier production privilege audit was 3/11 pass and 8/11 fail; do not claim fixed without a fresh approved audit.
6. Leaked-password protection and Auth advisor warnings reviewed and resolved or risk-accepted.
7. No unresolved Critical/High issue in auth, tenant boundaries, billing, data access or secret handling.

Current evidence: staging test payment previously processed signed Dodo webhooks and produced a future-expiring Pro entitlement. Signed synthetic tests cover important webhook states. The owner reports the main website OAuth/GitHub App and payment path works. These facts do not replace staging two-account tests or production DB migration signoff.

### Phase 2 — Detection quality, benchmark integrity and explainable results (ACTIVE; accuracy NOT CERTIFIED)
**Goal:** report fewer, better-supported findings and demonstrate what the scanner does and does not detect.

Scope:
- Deterministic SUE and code checks; source-context-aware authorization, SQL/RLS, secret, token and risky-code rules.
- Stable finding identity, deduplication, severity rationale, affected file/line evidence, incomplete-scan semantics and negative controls.
- Bounded one-hop import/AST/SQL dataflow where implemented; no generic cross-project taint claim.
- Product scan metadata must report actual engine/rules executed, files analyzed/skipped/incomplete and duration. Do not hardcode 50/51 rule counters.
- A consistent severity-weighted heuristic indicator may summarize a report, but must never be called a security probability or guarantee.
- Pinned real-source calibration/holdout sets; preserve source SHA, path scope, ruleset SHA, engine, durations and missing/incomplete files.
- Independent human TP/FP/uncertain/duplicate adjudication and separately curated missed-vulnerability targets. Use solo-founder protocol while two qualified independent reviewers are unavailable.

Exit gate:
1. Exact reproducible local build and regression suites pass; record command, SHA and environment.
2. A genuinely untouched, permissioned application set (separate from tuned/calibration examples) is reviewed before unblinding scanner output.
3. Findings are classified in context; missed targets are curated independently; publish per-rule/category TP/FP/FN and incomplete rates with sample sizes and uncertainty. No precision or recall before valid labels/targets exist.
4. Compare against CodeQL/Semgrep or another license-compatible tool with pinned versions and clearly documented scope gaps; comparator silence is not a clean verdict.
5. Fail-closed tests cover malformed/large/missing files, parser timeouts, symlinks/path traversal, missing auth, and unsupported languages.
6. Document supported subset. Reading Go/Python/Rust files does not mean language-aware analysis supports them.
7. Solo-founder internal-beta gate may produce only a candidate-for-owner-beta-decision; no independently certified accuracy or production release claim.

Current evidence: pinned public-source collections (including the 30-repository and 22-application sets) exist, but the 22-app set has been used in tuning and both sets' findings remain unreviewed. The 30-repo collection previously reported 30/30 repositories and 364 scanned files with 52 unreviewed alerts. The 22-app diagnostic after tuning reported 19 unreviewed alerts. Alert counts are not true-positive counts. Precision and recall remain null.

### Phase 3 — Broader language and framework coverage (DOCUMENTED FUTURE PHASE; NOT STARTED)
**Goal:** expand beyond the current JS/TS/Supabase-focused supported subset only through verified vertical slices.

Planned adapter order from `PHASE3_IMPLEMENTATION_PROMPT.md`:
1. Java — Spring Boot auth, JPA/Hibernate SQL, process execution, path traversal, SSRF.
2. Go — net/http/Gin middleware, SQL parameters, auth middleware, process/path/SSRF patterns.
3. PHP — Laravel/Symfony SQL, mass assignment, upload/path, command execution.
4. Ruby — Rails/ActiveRecord SQL binding, authorization policies, command execution/redirects.
5. C# — ASP.NET Core authorization, EF raw SQL, process/path/SSRF.

Each adapter requires safe and risky cases, framework-specific authorization context, parse-failure/incomplete behavior, license review, resource budgets and real-source evaluation before marketing support. Never build five shallow language badges. Phase 3 starts only after Phase 1/2 gates and an explicit owner decision.

### Phase 4 — AgentShield local workflow (EXPERIMENTAL WORKSTREAM; WEEK 1–6 BUILT, DISTRIBUTION NOT APPROVED)
**Goal:** protect AI-assisted edits before commit while preserving developer control.

Scope from Week 1–6:
- Local CLI and Claude Code PostToolUse/Stop hook integration.
- Monitor as default; Assist and bounded Auto-fix only with explicit opt-in.
- Snapshot/hash checks and scan-incomplete on changes, missing coverage, symlink or budget violations.
- Experimental AST-based SQL alias/dataflow analysis; bounded worker time/memory.
- Optional local Ollama-compatible metadata-only advisory. No code snippet or repository content in the documented metadata-only mode; real model installation/session is not verified.
- Reversible installer, offline package validation, safe uninstall, OS support, signed artifact and licensing review.

Exit gate: authenticated real Claude Code acceptance on supported OSes; install/upgrade/uninstall and hook coexistence; independent repair verification; measured FP/FN on separate local corpus; package/secret/privacy review; 3–5 consenting users explicitly approved by owner. Unit tests alone do not authorize npm publication.

### Phase 5 — Evidence-backed AI investigation and remediation (PROPOSED)
**Goal:** add useful AI without turning models into the source of truth.

- Finding explainer cites exact file/line/snippet and relevant control flow.
- AI can propose root cause, exploit preconditions, remediation and regression test; every claim is traceable to source or explicitly uncertain.
- Suggested patch is diff-only, user-approved, test-run and rescanned. No auto-merge.
- Model provider is configurable; local or cloud use requires explicit user choice/consent and clear data residency/retention disclosure.
- Redact secrets, minimize context, cap size, defend against prompt injection in source comments/strings, record model/version/token/cost/latency, never pass auth credentials.
- Deterministic scanner verdicts cannot be suppressed, downgraded or marked verified by a model.

### Phase 6 — Continuous security lifecycle and risk context (PROPOSED)
- Baseline and delta scans on push/PR; finding reappearance and fix verification; severity trend and aging.
- Explain impacted endpoint/data/tenant/auth boundary; reachability/exploitability context only when evidence supports it.
- Dependabot/SBOM/dependency-risk and secret detection integrations only after licenses, data rights and evidence contracts are reviewed.
- Alert grouping, duplicate root cause, owner assignment, exception expiry and risk acceptance with audit history. No silent suppression.

### Phase 7 — Team and organization controls (PROPOSED)
- Teams, roles, SSO/SCIM only when demanded by validated buyers, organization-wide policy, audit exports and repo groups.
- Strong tenant isolation, least-privilege installations, approval boundaries and account lifecycle.
- Do not build enterprise workflows before small teams repeatedly use and pay for the core scanner.

### Phase 8 — Developer ecosystem and integrations (PROPOSED)
- CI providers (GitHub Actions, GitLab CI, Bitbucket, etc.), IDE/CLI integrations, Jira/Linear issues and SARIF export.
- Integrations must be useful independently; do not ship a wide checklist of empty connectors.
- GitHub Actions exhaustion is an engineering-project CI constraint, not a reason to make customer's runtime depend on GitHub Actions.

### Phase 9 — Enterprise trust, reliability and operations (PROPOSED)
- Data flow/privacy documentation, retention controls, incident response, key rotation, audit trails, SLAs, backups/restore drills, support processes, SBOM and dependency monitoring.
- SOC 2/ISO readiness work only when customer pipeline justifies cost; never claim certification until audited.
- Load testing, scan queues, abuse control, cost limits, availability, observability and support.

### Phase 10 — General availability and repeatable growth (PROPOSED)
- Public launch after measured retention, repeat scan usage, product-market pull, support capacity, pricing validation and security release gates.
- Developer-led distribution: AI coding communities, open-source maintainers, agencies, dev shops, incubators and cloud/Supabase ecosystem.
- Publish transparent methodology, changelog, coverage matrix, responsible disclosure and security limitations.
- Expansion/enterprise sales only after a focused wedge works.

## AgentShield Week 1–6 versus roadmap phases

AgentShield Week 1–6 are implementation milestones for the local developer preview. They are not the same as SaaS Phase 1, Phase 2, or Phase 3. Keep their checklists and completion evidence in `artifacts/api-server/AGENTSHIELD_WEEK1.md` through `AGENTSHIELD_WEEK6_HYBRID_PREVIEW.md` and `artifacts/api-server/agentshield-beta/RELEASE_CHECKLIST.md`.

## 30 November 2026 beta decision — realistic scope

A **small invite-only controlled beta decision** is still a reasonable target, but a general public launch or enterprise-grade security certification by 30 November is not. Because Actions usage is exhausted, current-head CI is not verified; a staging GitHub App callback was also not yet fully proven in the last recorded staging diagnostics. The owner reports the main website OAuth/repository/payment paths work; verify the exact main-site live release separately before inviting users.

Recommended November beta shape:
- 3–5 design partners, or even fewer if security gates remain open.
- JS/TS/Next.js/Node/Supabase-focused supported subset only.
- Non-sensitive test repositories first; no mission-critical/private production source until tenant/security review and data controls pass.
- Human-readable findings with limitations and easy feedback/reporting; no autonomous code changes by default.
- Owner-approved invite list, support channel, bug/incident process and rollback plan.
- Beta is **NO-GO** if cross-tenant access, token leaks, entitlement bypass, unsafe webhook handling or incomplete scans masquerade as clean.

## Growth and fundability — evidence plan, not a promise

### First customer wedge
Target small SaaS teams, indie founders, agencies and AI-first dev teams shipping Next.js/Node/Supabase apps. Their painful problem is not lack of another scanner; it is alert noise, auth/RLS/tenant bugs in generated code, and the effort of converting findings into verified fixes.

**Differentiation hypothesis:** a PR-level AI-code assurance loop with precise Supabase/tenant/auth context, readable source proof, remediation proposal, and verified rescan. Validate via interviews and repeated usage; do not present as a moat until customers choose it over substitutes.

### Metrics to collect weekly
- Activation: connected repository and first successful baseline.
- Time-to-first-value: minutes to first actionable finding or clean result (clean not a guarantee).
- Accuracy: reviewed precision/recall and incomplete rates when evidence exists.
- Remediation: finding acknowledged, fix proposed, fix accepted, verification rescan passed.
- Retention: repeat scans per workspace, 7/30-day active repos, retained teams.
- Monetization: trial-to-paid, conversion cohort, ARPA, gross margin after provider/scanning infrastructure, churn and expansion.
- Customer proof: short written quotes, before/after time, number of actionable security issues fixed, consented case studies.

### 1,000 customers by 31 December
This is a **stretch aspiration, not a forecast**. From 22 November there are 39 days to year-end. 1,000 paid customers would require roughly 26 new paying customers/day and meaningful inbound, partner or viral distribution that has not yet been evidenced. A sensible sequence is: 3–5 design partners by the first beta gate; prove repeated weekly use; convert the first 5–10 paying teams; then target 25–50 active paying teams only if funnel evidence supports it. Track 1,000 free signups separately from 1,000 activated workspaces and 1,000 paying customers; these are not interchangeable. Reforecast after 2 weeks of real funnel data.

### Funding
Potential funding routes: pre-seed angels/micro-VCs after design-partner evidence, relevant accelerators/incubators, and eligible government seed programmes. Investors will expect a credible market wedge, repeat usage, willingness to pay, high-quality security evidence, founder execution, and distribution—not simply a large competitor list or a completed pitch deck.

India Startup India Seed Fund Scheme details and eligibility must be checked on the official portal at application time. Current official pages describe up to ₹20 lakh grant for PoC/prototype/product trials and up to ₹50 lakh in debt/convertible support for commercialization; DPIIT recognition and incorporation/entity rules apply, and an individual entrepreneur is not eligible under the FAQ. Portal pages have displayed different application timing, so do not assume a call is open; confirm before relying on it:
- https://seedfund.startupindia.gov.in/faq
- https://seedfund.startupindia.gov.in/
- https://www.startupindia.gov.in/

## AI model policy and current experiment

- The product's existing optional local model integration is Ollama-compatible and metadata-only advisory; it is not proof of a deployed hosted GPT/Claude/Gemini model.
- `benchmark-agentshield-models.mjs` is a **synthetic-only provider adapter/evaluation harness**. It requires `--live` plus provider API keys to call a provider. No live provider evaluation has been run or claimed.
- Approved candidate catalog is pinned in the code and must be rechecked against official provider docs/pricing before any live run. On 22 Nov 2026 current candidate IDs: OpenAI `gpt-6-luna`, `gpt-6.2-sol`; Anthropic `claude-haiku-5-5`, `claude-sonnet-5-5`; Google `gemini-2.5-flash-lite`, `gemini-4-argon`.
- This is a classification benchmark on synthetic labels, not a security benchmark against real projects. Model accuracy on this set does not establish scanner TP/FP/FN on real repositories.
- Never send customer repository source to a hosted provider by default. Any future source-code AI needs an explicit consent, redaction, retention, regional processing and threat-model gate.
- Do not say previous coding sessions used a free GPT API: they used ChatGPT tooling to edit/review the repository; the VibeSane model benchmark itself has made no live API calls. The exact ChatGPT UI model shown to the user may differ by session/account and is not stored as a repo configuration.

## Verification policy while GitHub Actions quota is exhausted

The owner reports GitHub Actions quota at 100% on 22 Nov 2026. Until reset or an approved external CI alternative:
1. Do not trigger Actions to see if quota returns; use the quota panel/usage reset date.
2. Use a clean local Linux/WSL checkout if available:
   - `pnpm install --frozen-lockfile`
   - `pnpm --filter @workspace/api-server run typecheck`
   - `pnpm --filter @workspace/api-server run build`
   - `pnpm --filter @workspace/api-server run test:agentshield:phase12`
   - `pnpm --filter @workspace/api-server run test:agentshield:release`
   - Run the relevant SUE/scan regression suites listed in package.json.
3. Record exact commit SHA, OS/Node/pnpm versions, command output, passed/failed/skipped counts. Do not label local runs as GitHub CI.
4. Render build/deploy verifies deployment build/startup only; it does not substitute for full tests.
5. Choose an external CI provider only after checking free quotas, secrets handling, concurrency and setup cost. Never remove security checks to reduce minutes.

## Decisions that require the owner

- Any production code merge/deploy, migration, grants/Auth settings, data deletion, change to customer billing, cancellation of the working sandbox subscription, paid model API spend, new paid service, external beta invitations or public marketing claims.
- Any change to the agreed product scope, price, open-source licensing, telemetry or source-code processing policy.
- Starting Phase 3 or promoting AgentShield from developer preview to beta.

## Evidence hierarchy

1. Exact-SHA build/tests and deployed staging logs.
2. Reproducible local tests with commands/output and pinned dependencies.
3. Read-only provider/database evidence scoped to staging/production as stated.
4. Human source review with pinned commit/file/line and explicit reviewer identity.
5. Owner-reported product behavior, labelled as such until freshly reproduced.
6. AI-generated hypotheses are leads only, never ground truth.

## Source links already in repository

- `artifacts/api-server/NOVEMBER_2026_RELEASE_GATES.md`
- `docs/PHASE12_COMPLETION_GATE_2026_11_21.md`
- `docs/PHASE12_RELEASE_EVIDENCE_2026_11_21.md`
- `docs/PHASE12_SOLO_FOUNDER_BETA_PROTOCOL_2026_11_21.md`
- `docs/benchmark-realworld-protocol.md`
- `artifacts/api-server/PHASE3_IMPLEMENTATION_PROMPT.md`
- `artifacts/api-server/agentshield-beta/RELEASE_CHECKLIST.md`
