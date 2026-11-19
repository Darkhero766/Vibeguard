# VibeSane AgentShield — production readiness and hybrid-engine continuation mission

**Instruction:** This is the next coding mission for ChatGPT when asked "continue AgentShield production readiness." Execute repository changes on a new reviewed feature branch, not main; do not regenerate a plan or ask the owner to paste this file. Inspect actual GitHub/Supabase state first, preserve working code, run CI and create a draft PR. **Never merge, deploy, publish, run production migrations, enable cloud AI, collect customer data, change credentials or invite beta users without explicit owner approval.**

## Current verified baseline (historical until rechecked)

Weeks 1–5 are implemented in feature branches; Week 6 PR #59 adds metadata-only opt-in localhost AI, and experimental local TypeScript AST SQL-alias detection via --enable-ast. Exact latest CI and PR ancestry must be verified before work. AST uses no repository code execution and has strict file/race/time/memory limits. Supabase project's live schema was inspected read-only: major expected tables exist with RLS enabled, but migration versions differ from GitHub, and leaked-password protection remains disabled. No Supabase mutations were authorized.

## Definition of an honest production release

- Every release component builds and typechecks in required CI without hidden continue-on-error.
- Independent security review of scanner, installer, model inputs, GitHub token handling, Auth, RLS, web API and webhook signatures.
- Actual authenticated Claude Code PostToolUse, Stop and Bash-edit test completed on supported operating systems.
- The scanner, optional parser and local model all enforce budgets, fail safely and preserve developer permissions.
- True-positive and false-positive rates measured on genuinely untouched representative projects with per-category sample sizes, limitations and reviewed labels.
- Offline package validated end-to-end, signed/traceable build, ownership and licensing reviewed, no unsafe install scripts and reliable uninstall.
- Website privacy distinction remains explicit: GitHub web scanning processes approved repository source remotely; local AgentShield scanning does not automatically sync source.
- Project owner approves each distribution and production change. CI alone is NOT approval.

## Priority P0 — close real release blockers before features

1. Reverify exact GitHub commit, PR state and latest CI; do not assume feature branch is main.
2. Review Supabase migration history and live schema using **read-only** MCP only. Prepare canonical migration inventory, compare function/policy definitions, and produce a no-op/drift report. Never replay stale scripts/migrate-supabase.mjs or change the migration ledger without owner approval.
3. Flag Supabase Auth leaked-password protection warning for owner action; do not change Auth settings on your own.
4. Validate published Claude Code hook specification. Run one real authenticated end-to-end session **only if runtime/auth are actually accessible**, otherwise record the exact manual blocker and keep the release gate pending.
5. Validate the feature-build/installer on macOS and Linux. Ensure no fake npm install URL, no unexpected package scripts and reversible hooks; report unsupported environments.

## Priority P1 — grow hybrid scanner quality with actual code

1. Audit current experimental AST coverage, false positives and runtime. Expand safely from local SQL variable aliases to sources/sinks/sanitizers **only when demonstrable with tests**.
2. Use a maintained compatible parser (TypeScript Compiler API initially) and build a transparent local dataflow model. Start with JS/TS Next.js/Supabase contexts: request input, SQL query strings, server action authorization and privileged key exposure.
3. Never claim generic full SAST, cross-file taint or proof of exploitability before implementing and measuring it.
4. Keep deterministic rules authoritative: model suggestions cannot clear, downgrade, suppress or mark findings verified. Avoid relying on AI as the only detector.
5. Evaluate optional local model on actual installed model runtime if authorized. A mocked localhost API is **only protocol validation**. Track hallucinated or unsafe remediation, latency, resource cost, and model availability.
6. To offer consented cloud inference in the future, first design explicit consent, scoped path/code redaction, provider/model controls, retention, pricing, data processing terms, opt-out and threat model; **do not implement sending source by default**.
7. Do not copy proprietary CodeQL/Semgrep/Snyk/Aikido rules, customer code, embeddings or weights. Review licenses, especially commercial/rule redistribution restrictions, before integrating open-source engines.
8. Package hybrid AST honestly: either bundle its audited runtime dependencies or keep it a source-checkout-only preview. Do not advertise an unshipped command in a distributed package.

## Priority P2 — independent evaluation and supported languages

- Current local supported file selection includes JS/TS/JSX/TSX and variants, SQL, JSON, YAML/YML and .env variants. Detailed API/auth/SQL checks are principally JS/TS and Supabase SQL. Do not advertise full Python/Go/Java/Rust/PHP security scanning just because the GitHub web reader can ingest those text files.
- Add a separate registry of parser support, heuristic-only checks, partial coverage and unsupported languages in both CLI JSON and website messaging.
- Use untouched, appropriately licensed or synthetic challenge sets to evaluate exact detection rules and negative controls; distinguish tuned benchmarks from new holdouts.
- Compare against relevant open-source, license-compatible detection tools under the same fixtures, scopes and hardware. Disclose false negatives, timeouts, memory and partial coverage.
- Keep user control over local processing and telemetry; no source upload without explicit consent.

## Optional UI integration (after reliability gates)

- Existing /agentshield website is informational and separate from the remote GitHub scanner. Add a reviewed downloadable installer link **only after publishing has been approved and the package is available**.
- Consider consented metadata-only local finding summaries in the web dashboard, but do not silently sync source, secrets, transcripts, filenames or developer data.
- Evaluate how GitHub webhook security results differ from local AST results before claiming parity.

## Testing and release evidence

Required CI should cover previous 100 AgentShield tests plus current AST tests, GitHub scan regressions, SUE tests, frontend/backend builds/typechecks, offline package tests, and new fake-adversarial multi-file fixtures. Require 0 failures; explicitly list skipped/unexecuted checks. Simulated model or Claude hooks do not count as live authenticated acceptance.

No "100% secure" marketing or "verified" label for a disappearing regex/AST match.

## Delivery sequence

Inspect → read-only drift audit → threat model → implement focused changes → verify original tests → add regression and new holdout tests → benchmark → fix actual regressions → document licensing/privacy → open draft PR → report evidence.

### Final report must include

- Exact branch/PR URL, CI run SHA/link and accurate test counts.
- Languages **read**, **heuristically scanned** and **AST-analyzed**, separately.
- Model type (rules / AST / advisory) and precise limits of detection.
- Real vs simulated Claude/model tests, and what remains blocked.
- Supabase drift status and confirmation whether any hosted state was modified.
- Package and website deployment status.
- Whether engineering tasks are complete vs distribution approval pending.
