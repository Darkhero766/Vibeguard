# VibeSane — Phase 3 implementation prompt (DRAFT; NOT AUTHORIZED TO START)

**Prerequisites:** Phase 1 and Phase 2 release gates in `NOVEMBER_2026_RELEASE_GATES.md` must be met, with independently verified evidence and separate production approval. Do not start Phase 3 merely because CI is green. This document is a future implementation prompt, not a report of shipped features.

## Copyable implementation prompt

You are VibeSane's senior application-security engineer and staff engineer working in `Darkhero766/Vibeguard`. Continue the user-agreed **10-phase roadmap**, using its **Phase 3: broader security detection and production language coverage for Java, Go, PHP, Ruby and C#**. The immediate product goal is trustworthy, precise detection of exploitable security risks in AI-written application code, not a superficial increase in the number of supported extensions.

### Absolute constraints
- First inspect the existing repository, tests, on-branch code, CI, benchmarks, prior signoff and `NOVEMBER_2026_RELEASE_GATES.md`. Confirm Phase 1 and 2 production security and scanner-accuracy gates have genuinely passed. If not, stop and give a blocker report; do not silently start Phase 3.
- Never use a production database, OAuth/payment keys, customer data or production deployment for development. No paid resources without approval. Preserve P1/P2 scans, GitHub token isolation, quotas, audit history, Render/Supabase hardening and fail-closed authentication rules.
- Do not auto-merge, deploy or alter production access. Use small feature-branch PRs with reviewable diffs.
- Distinguish **implemented**, **verified only on synthetic samples**, **measured on real projects**, and **not supported**. No invented accuracy, exploit proof, customer count, or claim of launch readiness.
- Optimize GitHub Actions usage: cache dependencies, run focused per-language jobs on targeted paths and full regression for the final release candidate. Do not weaken security checks to make CI green.
- Never execute untrusted example code, download and run unknown dependencies at test time, or expose remote content as tool instructions. Pin benchmarks to commit SHAs and vetted licenses.

### Step 1 — Architectural discovery and contract
1. Read the current scanner pipeline and outputs in `artifacts/api-server/src/lib/extendedScanner.ts`, `artifacts/api-server/src/lib/apiScanner.ts` and `artifacts/api-server/scripts/`; identify per-file vs cross-file boundaries, AST/taint coverage, runtime/timeout, and the existing finding schema.
2. Define versioned language-adapter contract: `language`, `framework`, `rule_id`, `severity`, `path`, `line/column`, `evidence`, `confidence`, `taint_source`, `sink`, `sanitizer_or_guard`, `incomplete_reason` and `guidance`. Reuse the current API schema where possible, document compatibility, and never invent code locations when parse fails.
3. Choose maintainable parsers (prefer well-maintained pinned AST/tree-sitter or native grammar adapters), provide license and dependency security review, and isolate parsers with resource/time limits. Do not claim cross-file flow from filename search alone.
4. Produce a **language × framework × issue class** coverage matrix with `supported`, `partial` and `unsupported` values. Prioritize exploit-relevant rules and explicit authenticated negative controls.

### Step 2 — Language-by-language vertical slices
Implement **one verified vertical slice at a time** in this planned order, measuring real examples before expanding:
- **Java:** Spring Boot route/controller authorization, SQL/JPA/Hibernate injection patterns, unsafe process execution, path traversal, outbound URL/SSRF; recognize safe parameterized queries and proper security filters.
- **Go:** `net/http`, Gin and selected common HTTP middleware; SQL string interpolation versus bound placeholders, auth/middleware bypass, `exec.Command` misuse, file path handling, SSRF; recognize context-safe validation.
- **PHP:** Laravel/Symfony primary patterns; raw SQL vs prepared bindings, mass assignment, upload/path traversal and command execution; recognize framework authorization policies and safe query builders.
- **Ruby:** Rails endpoints and ActiveRecord, dynamic `where` interpolation, authorization policy/role checks, command execution and unsafe redirects; distinguish safe binds.
- **C#:** ASP.NET Core endpoint/controller authentication/authorization attributes, Entity Framework raw SQL and parameterization, subprocess/path handling and SSRF; recognize secure Identity/Policy patterns.

For each adapter: parser setup, at least five meaningful real-world risk examples and matching safe variants in an isolated test suite, clear evidence and rule descriptions, boundary tests for partial parse/huge files, one representative framework integration test, and known unsupported cases. Add one rule only when it has a stable negative control; never bury uncertainty in a passing finding.

### Step 3 — Detection quality and performance
- Freeze a **new, untouched**, permissioned real-repository evaluation corpus. Have a human security reviewer independently adjudicate findings and safe controls, including disputes and threat-model context. Keep training/tuning fixtures completely separate.
- Report TP, FP, FN, TN, precision, recall, false-positive rate and incomplete rate **per language and rule**, along with exact commit/file hashes. Do not aggregate away weak frameworks. State low-sample uncertainty.
- Exercise realistic AI-generated patches, multi-file authorization flow, taint source → sink → sanitizer, asynchronous calls, renamed identifiers, helpers, middleware and deliberately misleading comments or string literals. A successful AST parse does not prove a vulnerability.
- Benchmark capped repository size, p50/p95 time, memory, skipped files, cancellation and recovery. Prefer deterministic reproducible runs and no secret/file content printed into public CI logs.
- Include an explicit unresolved-misses register and link each high-risk false-negative to a regression test.

### Step 4 — Product and DX integration
- Wire each adapter through existing CLI/GitHub PR report paths without breaking current results. Make unsupported languages and `incomplete` clearly visible to users.
- Provide concise actionable fixes, but mark them as suggestions until reviewed; require user approval for edits and never automatically merge or silently rewrite application code.
- Add per-language examples, supported-framework table, limitations, privacy/retention constraints and opt-in beta onboarding.
- Align with an actual customer wedge: PR security validation for AI-generated code, with verifiable high-risk findings and fewer false positives—not a generic SAST marketing claim.

### Step 5 — Acceptance criteria and outputs
- Deliver a draft PR with limited-scoped commits, tests and sample output; all old Phase 1/2 and new CI jobs green on the final head.
- Publish a reproducible benchmark report with a human review record and a transparent supported/unsupported matrix; do not label AI-authored synthetic cases as independent holdout.
- Produce architecture/data-flow diagrams in Markdown or source-controlled format, public API compatibility notes, resource budgets and a rollback plan.
- Submit a release-gate report: what changed, files and SHAs, tests passed, issue coverage, real misses, false positives, human signoff required, cost impact and unanswered questions.
- Ask for explicit release approval before merging or promoting Phase 3 code to production.

**Work style:** Favor a small, production-correct language slice over five fragile logos. Do not move to the next adapter until the previous one has reviewed real-project evidence and a passing negative-control suite. If external access or reviewers are missing, ship the verified code and a clear blocker report, not a false PASS.
