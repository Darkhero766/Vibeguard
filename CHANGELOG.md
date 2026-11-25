
# FOXY BY VIBESANE — AUTONOMOUS SECURITY ENGINEERING MISSION

Act as a senior AI security, MCP, SAST, software engineering and QA lead for Foxy by VibeSane.

Repository: Darkhero766/Vibeguard
Work on the current feature branch associated with PR #69.

Your mission is to deeply research, implement substantial improvements, test, debug, benchmark and qualify Foxy. Do not merely audit, write documentation or create a plan.

## SAFETY
- No production deployments, merges or production configuration changes.
- Do not push unless explicitly authorized.
- Preserve all existing user changes; never reset or discard work.
- Never execute untrusted MCP servers or code without explicit authorization and isolation.
- Do not weaken security rules or tests to achieve passing results.
- Report only tests and results actually verified.
- Maintain backward compatibility wherever feasible.

## 1. CHECKPOINT & AUDIT
Inspect repository, branch, commit, working tree, PR #69, Foxy/MCP code, hooks, scanners, controllers, tests and benchmarks.

Run baseline tests. Investigate the actual VibeSane-reported 2 Critical and 2 High findings, retrieve evidence and determine whether they are genuine, false positives or uncertain. Do not rely on previous summaries without verification.

## 2. RESEARCH
Research current MCP security, AI coding agents, Codex hooks, Claude, Cursor, agent permissions, skills, tool poisoning, prompt injection, SAST, AST/taint analysis, OWASP, Semgrep, CodeQL, Snyk and competing tools.

Use research to inform implementation, not just produce documents.

Foxy's differentiation: local-first, evidence-driven security for AI coding agents.

Target lifecycle:
DETECT → EXPLAIN → REMEDIATE → VERIFY → ENFORCE.

## 3. HEAVY FUNCTIONAL IMPLEMENTATION
Implement approximately 4–6 meaningful improvements where feasible, prioritizing depth over quantity. Do not finish with documentation-only work or minor fixes.

Focus on:

**Protocol and reliability**
- Fix JSONL framing, partial/multiple messages, size limits and buffer management.
- Improve malformed input handling, cancellation, timeouts and resource limits.
- Investigate sequential processing and implement safe bounded concurrency if beneficial.
- Keep stdout protocol-clean and preserve MCP compatibility.
- Evaluate protocol conformance against current MCP specifications.

**Filesystem and state security**
- Investigate symlinks, TOCTOU races, path traversal, state corruption and unsafe writes.
- Harden controller/state handling, safe file access, atomic writes and identity validation.

**Detection quality**
- Improve JavaScript/TypeScript AST and source-to-sink analysis.
- Improve Python AST/lexical analysis, including comments, strings and docstrings.
- Improve sanitizer recognition, evidence, confidence and false-positive reduction.
- Cover SQL injection, command injection, SSRF, XSS, path traversal, unsafe deserialization, insecure cryptography, dangerous execution and other relevant risks where supported.

**Finding identity and remediation**
- Improve fingerprints and matching across code movement and similar findings.
- Detect new, resolved, modified and reintroduced findings.
- Avoid claiming vulnerabilities fixed without meaningful revalidation.
- Clearly distinguish resolved, unresolved, uncertain and unverified.

**Agent and MCP security**
Analyze MCP configs, tools, schemas, skills, hooks, agent instructions, Codex/Claude/Cursor configurations, permissions, credentials, dangerous commands, filesystem/network access, tool poisoning and prompt injection.
Implement practical static detection improvements. Never execute untrusted configurations by default.

**Coding agent integration**
Investigate Codex PostToolUse and Stop hooks.
Improve incremental feedback, changed-file scanning, final security gating, duplicate suppression, loop prevention and performance where feasible.
Investigate compatibility with Claude Code and Cursor without unnecessarily breaking existing identifiers.

**Performance**
Improve incremental scanning, caching, content hashing, bounded concurrency, cancellation, memory usage and repeated-scan performance.
Review existing limits such as 100 files, 1 MB per file and 8 MB aggregate.
Incomplete scans must never silently report clean.

## 4. TESTING & BENCHMARKS
Create or improve realistic labelled vulnerable/safe/adversarial fixtures.

Test:
- Protocol framing and malformed messages.
- Multiple and partial JSONL messages.
- Oversized input.
- Cancellation and concurrency.
- State/filesystem security.
- AST and taint detection.
- Sanitization.
- Agent/MCP configurations.
- Prompt injection and tool poisoning.
- Baselines and finding identity.
- Remediation verification.
- Incomplete scans.
- Performance and incremental scanning.
- Packaging, build, type checks, lint and compatibility.

Measure precision, recall, false positives, false negatives and performance where feasible. Clearly identify synthetic benchmark limitations.

Implement → test → debug → fix → retest throughout. Do not postpone all testing until the end.

## 5. AUTONOMOUS EXECUTION
Operate autonomously on safe, reversible engineering decisions. Research, implement, debug, test and benchmark. Do not stop after producing a plan, audit or minor fixes.

Aim for 4–6 meaningful functional improvements and at least one genuinely new capability if feasible. If blocked on one task, continue other independent work. If limits are reached, validate completed work and leave an exact continuation checkpoint.

Priorities:
P0: Critical/High findings, protocol reliability, state security.
P1: Detection quality, agent/MCP security, remediation and adversarial testing.
P2: Incremental scanning, performance and agent lifecycle integration.
P3: Additional ecosystem support and documentation.

## 6. FINAL REPORT
Report:
1. Starting and ending commit, branch and working tree.
2. Research findings and architecture decisions.
3. Major functional improvements and files changed.
4. Minor fixes separately.
5. Critical/High findings investigated and resolved or remaining.
6. Actual tests, failures, benchmarks and performance results.
7. Security limitations and untested areas.
8. Remaining risks and release-readiness verdict.
9. Exact continuation checkpoint if unfinished.

Do not fabricate results or overstate security coverage.

SUCCESS means meaningful functional engineering improvements, reproducible testing and measurable progress toward a dependable AI-agent security product.

Start with the checkpoint, then proceed autonomously. No merging, pushing or deployment.
## 2026-11-19 — AgentShield Week 5 launch readiness (feature branch, not deployed)

- Added a dedicated AgentShield developer-preview page to the existing VibeSane web app, with desktop/mobile navigation, crawlable metadata, and explicit separation of local Claude Code integration from GitHub web scanning.
- Fixed release-build and type-check errors in the API, including duplicated readiness routing, GitHub headers, scan types, SUE evidence typing, and proper modeling of Low static-scan severity at the API boundary.
- Added strict frontend/backend build and TypeScript verification to Week 5 branch-only CI; existing SUE and Weeks 1–4 regressions remain mandatory.
- Added 11 Week 5 tests and a new 48-case synthetic Next.js/Supabase evaluation, plus web-to-local demo and manual authenticated Claude Code acceptance instructions.
- Production deployment, default-branch merge, npm publication, real Claude interaction and private beta recruitment remain unperformed and require explicit authorization.

## 2026-11-19

### AgentShield Week 4 — offline private-beta build and labeled accuracy assessment (feature branch)

- Added 120 curated and 24 challenge synthetic labeled scanner cases with transparent confusion matrices, category-level precision, recall, and false-positive reporting.
- Strengthened existing scanner checks for typed JWT signing keys, explicitly checked authorization guards (ignoring commented-out guards), staging environment files, browser-global privileged-key use, and quoted SQL table references; extended local SQL interpolation heuristics to string concatenation.
- Added a versioned, locally packable npm tarball with a strict 11-file manifest, no install scripts, private-only metadata and offline installation/regression testing; no publication or distribution.
- Added local expiring file/rule acknowledgements without suppressing findings or security gates, plus human-readable verification reporting and synthetic performance measurements.
- Added private-beta demo fixtures, first-run instructions, feedback/bug-report templates and a fail-closed release checklist.
- All changes remain on an isolated feature branch; no production deploy, npm publish, external pilot invitation or default-branch merge. Live authenticated Claude Code validation and pre-existing API-wide TypeScript errors remain release blockers.

## 2026-11-19

### AgentShield Week 3 — local final gate and reliability hardening (feature branch only)

- Added a Stop-time, race-awareFoxy by VibeSane — Autonomous Engineering Mission

Repository: Darkhero766/Vibeguard. Work on the current PR #69 feature branch.

Act as my autonomous senior security engineer and researcher. Your goal is to substantially upgrade Foxy into a reliable security layer for AI coding agents and MCP, not merely audit or write documentation.

SAFETY: Do not merge, deploy, push or modify production. Preserve existing work. Never reset or discard changes. Never execute untrusted servers/code. Do not weaken security checks or fabricate test results.

1. Audit the current branch, architecture, tests and benchmark. Reproduce and investigate the actual 2 Critical and 2 High VibeSane findings; verify their evidence before fixing.

2. Research current MCP/agent security, OWASP, Codex/Claude/Cursor hooks, Semgrep, CodeQL, Snyk and competitors. Use research to guide implementation, not produce lengthy reports.

3. Implement 4–6 substantial improvements, prioritizing:

- MCP protocol reliability: JSONL framing, buffering, malformed input, cancellation, limits and concurrency.
- Filesystem/state security: symlinks, TOCTOU, path traversal, atomic writes and state integrity.
- Detection: stronger JS/TS AST and taint analysis, Python analysis, source-to-sink evidence, sanitizer recognition and fewer false positives.
- Agent/MCP security: configuration, tools, schemas, permissions, skills, hooks, secrets, dangerous commands, prompt injection and tool poisoning.
- Finding identity and remediation: stable fingerprints, code movement, baseline accuracy and genuine fix verification.
- Coding-agent integration: investigate/improve Codex PostToolUse and Stop hooks, incremental feedback and final security gating.
- Performance: caching, incremental scans, bounded concurrency and resource control.

Prioritize real vulnerabilities and correctness over feature quantity. Build at least one new meaningful capability if feasible. Do not make superficial changes just to meet a count.

4. Create realistic safe, vulnerable and adversarial fixtures. Run targeted and regression tests continuously; debug and retest. At final qualification, run relevant unit, integration, protocol, security, hook, build, lint, type, packaging and benchmark tests. Measure detection quality and performance where feasible. Incomplete scans must never silently report clean.

5. Work autonomously: research → implement → test → debug → benchmark → improve. Do not stop at a plan, audit, documentation or minor fixes. Continue across independent tasks if blocked. Prioritize Critical/High fixes, protocol/state security, detection, agent security, remediation verification and performance.

6. Finish with a concise report: changes, files, research decisions, findings fixed/remaining, actual tests and benchmark results, limitations, release readiness and exact continuation checkpoint if unfinished.

No merge, push or deployment. Begin immediately and maximize meaningful functional improvements within the available session. static security gate that rescans supported Git-visible changes, including staged/unstaged/untracked files and Bash-created sources.
- Added explicit incomplete/no-changes results, final-report coverage checks, bounded Auto-fix continuations and nonblocking Monitor/Assist behavior.
- Hardened session locks with conservative abandoned-lock recovery, retention-based local cleanup and a 200-file metadata cap that reports partial coverage.
- Added a unified local developer command, diagnostics, idempotent installation checks, and new safety/acceptance tests.
- Production source routes, secrets, deployments and the default branch were not changed. Live authenticated Claude Code operation still requires acceptance testing; API-wide pre-existing TypeScript errors remain.

## 2026-11-19 — AgentShield Week 2 (feature branch)

- Added per-project AgentShield Monitor/Assist/Auto-fix configuration, optional parse-only verification, per-session repair state, safe Stop-hook continuation and explicit manual status/verify commands.
- Kept repair requests bounded by attempts and elapsed time, using existing Claude Code permissions and the Week 1 scanner. No source files or secrets are persisted by the coordinator.
- Added narrow independent JWT configuration regression verification and clearly marked unsupported dynamic security checks as unverified.
- Extended reversible Claude Code setup with a Stop hook, added Week 2 security and hook test fixtures, documented rollback, and created read-only branch-only CI.
- Baseline API-wide TypeScript errors remain separate from the passing AgentShield-specific and SUE regression suites. No default-branch change or deployment.

## 2026-11-19

### AgentShield Week 1 — local Claude Code integration (feature branch only)

- Reused existing API and extended VibeSane security checks for local source-file analysis without changing the GitHub scanning routes.
- Added an independent changed-file CLI with JSON findings, explicit error exit codes, source-file limits, and a local experimental interpolated-SQL warning.
- Added a Claude Code PostToolUse hook, reversible project-local installation, tests for vulnerable and clean fixtures, and a branch-only test workflow.
- No production deployment, merge, or credentials change; manual and CI validation are reported separately in the AgentShield Week 1 documentation.

## 2026-10-13

### Mobile SUE audit layout correction

- Disabled the sticky global navigation on small screens so the header and SUE/product-controls tabs scroll with the page instead of covering the audit headline while scrolling.
- Made the SUE hero headline scale fluidly between 40px and 48px on narrow viewports, with a slightly more forgiving mobile line height; desktop headline sizing is unchanged.
- Validation required: run the frontend build and verify `/audit` on a narrow mobile viewport before merging and deploying.

## 2026-10-12

### SUE policy crawl regression guard and production benchmark

- Added a post-write artifact check to the static-page generator. The build now reads each generated route back from disk and fails if the route-specific title or configured static policy body is absent.
- Added the live VibeSane production site to the real-world vibecoded policy benchmark with known `/terms` and `/privacy` targets. Benchmark output explicitly flags when either target returns the generic app shell, and records whether the crawler verified the actual policy document.
- Existing benchmark includes public builder-attributed products plus Stripe, Shopify, GitHub and Wikipedia controls, with manually labelled policy routes for selected sites. This extends cross-site validation rather than treating VibeSane alone as the benchmark.
- This guards build artifacts and makes the production failure measurable; it does not itself prove Render serves the generated nested files correctly. The live benchmark must run after deploy, and the known VibeSane policy routes must be verified before marking production fixed.

## 2026-10-12

### SUE self-audit crawlability and trust-page corrections

- Root cause found from the live report and repository inspection: the production frontend is a client-rendered React SPA. The SEO generator created route-specific HTML files for /terms but changed only metadata; the generated #root stayed empty. The SUE public crawler does not execute browser JavaScript, so it could discover legal routes but could not verify the actual Terms/Privacy body text.
- Added crawlable static body snapshots for Terms, Privacy, Contact, Security Disclosure, and Accessibility routes while keeping the client-rendered app routes intact. Added footer links and sitemap entries for the new trust routes.
- Added Contact and Support, Security Disclosure, and Accessibility pages. Security disclosure instructions explicitly avoid public vulnerability details and make private GitHub reporting conditional on the feature being enabled.
- Expanded the Privacy Policy to disclose that SUE audit reports are saved to account history with the URL, timestamp, score, statuses, context signals, and short evidence excerpts. This corrects the prior overbroad statement that scan findings are never stored.
- Fixed Terms & Conditions matching in SUE and policy inventory. Added an evidence-quality gate so a generic “governing law” mention cannot pass without an identified jurisdiction; the current Terms deliberately says the jurisdiction provision still needs counsel review, so L12 should remain REVIEW until the real jurisdiction is supplied.
- Added regression coverage for ampersand Terms headings, privacy-rights evidence, legal-page reachability, and governing-law quality.
- Business Identity (L10) remains a genuine unresolved item: no actual legal operator name/entity was provided in the website or project context. Do not fabricate a company name; the operator's real legal identity and applicable jurisdiction must be supplied before this can be honestly resolved.
- Validation: SUE Live Benchmark run #148 passed frontend/API build checks, both typechecks, SUE regression, accuracy benchmark, real-world vibecoded policy benchmark, and five-site live core benchmark. Deployment/fresh rescan remain pending. Do not mark production-fixed until Render deploys the API commit, Vercel deploys the frontend build, and a new audit confirms expected evidence/statuses.

## 2026-10-12

### SUE policy discovery, verification, and evidence map

- Fixed route uncertainty matching: an ordinary homepage Privacy link no longer makes the homepage look like an unverified Privacy policy. Relevant routes are identified from URL paths and page-owned title/headings, not navigation links.
- Added a policy inventory to audit results. It distinguishes verified policy pages, fetched-but-unverified routes, and discovered routes whose page content was not captured. A link alone never counts as verified policy evidence.
- Added a core evidence map containing each of the 12 core checks, status/applicability, evidence URL/signal/excerpt/confidence, explanation, and recommended action. It is returned by new scans and reconstructed for historical reports from stored checks.
- Persisted policy inventory inside existing product_context JSON; no database migration required.
- Added regression coverage for Terms-only shells and a separately discovered Privacy shell.
- Existing crawler safety controls, 50 checks, 12 core checks, policy-content quality gates, and N/A scoring are preserved. Validation and production rescan pending.

## 2026-10-12

### SUE policy-route-specific review correction

- Root cause: any unverified policy-like route could force REVIEW for every policy-content check, even when the route was unrelated to that check.
- Change: route uncertainty now downgrades only checks relevant to that policy family (Terms, Privacy, Cookies, Refunds, Cancellation, Security, DPA, etc.). Unverified routes remain excluded from policy evidence and cannot create PASS.
- Regression: assertions ensure an unverified Terms shell does not obscure independent Privacy/Cookie results.
- Preserves 50 checks, 12 core checks, content verification gates, N/A scoring, and SSRF protections. Validation and production rescan pending.

# Change Log

Short, human-readable notes for contributors and reviewers.

## 2026-10-12

### SUE accessibility evidence status correction

- Root cause: T03's rationale already states that absence of an accessibility statement is not proof of legal non-compliance, but an empty evidence result could still be emitted as Missing.
- Change: when T03 is applicable but the crawl finds no accessibility statement or detectable accessibility signal, emit Review with an explicit explanation rather than Missing. Positive evidence remains subject to the existing evidence-based status rules.
- Added regression coverage for a developer security scanner with no accessibility evidence. Preserves the 50-check engine, 12-check V1 scope, N/A semantics, policy evidence gates, and SSRF protections.
- Validation/deployment: pending the focused SUE regression, accuracy, policy, and live core benchmarks; production rescan not yet verified.

## 2026-10-11

### SUE core applicability false-N/A correction

- Root cause: several launch-core rules relied only on secondary signals (commercial activity, payment, or detected personal-data collection). A recognizable first-party SaaS/security product could therefore receive N/A when the crawler missed one of those signals.
- Expanded product-type applicability for core Contact, Business Identity, Governing Law, Privacy Rights, Accessibility and Legal-Page Reachability checks. Identified SaaS/developer/AI/service products now receive an applicable check or review rather than a silent N/A; this does not force a PASS or claim a legal obligation.
- Added a VibeSane-like regression fixture asserting those six core checks cannot silently become N/A while preserving exactly 50 checks and 12 core checks.
- Preserved evidence-quality gates: visible links alone do not prove policy content, unverified policy routes remain REVIEW, and N/A scoring behavior is unchanged.
- Validation/deployment: pending fresh SUE regression, accuracy, policy and live core benchmarks; production deployment and a rescan are not yet confirmed.


### SUE pricing-signal regression correction (PR #43 follow-up)

- Root cause: general crawled text was allowed to create pricing and recurring-billing signals. The encyclopedia regression fixture's article text therefore produced `signals.pricing=true`, causing the API build to fail because `build` runs `test:sue`.
- Added product-surface-scoped text evidence for pricing, price amounts, checkout actions, subscription/renewal language and paid billing. These signals now use the homepage or explicit first-party commercial/product routes rather than unrelated editorial/article pages.
- Added regression coverage that article text containing “monthly subscription plans billed monthly” does not create pricing/subscription/paid-service signals, while a real first-party `/pricing` page with recurring billing is still detected.
- PR #42 has already merged; this is a follow-up fix and must pass fresh SUE regression, accuracy, policy and live smoke benchmarks before merge. Build/typecheck alone is not sufficient.


### SUE pricing-signal regression correction

- Root cause: pricing and recurring-subscription signals were being extracted from any crawled first-party page, so an editorial article about commerce could make an encyclopedia appear to have pricing/subscription capabilities.
- Added product-surface-scoped text evidence: homepage plus explicit first-party commercial/product routes (pricing, plans, billing, checkout, subscription, products, features, shop, store). Incidental article/glossary text no longer supplies pricing, recurring-subscription, auto-renewal, paid-pricing, or checkout-action evidence.
- Added regression assertions for article-only pricing/subscription false positives and positive detection on a genuine first-party pricing route.
- Build status before this correction: the TypeScript bundle and frontend build steps passed in SUE Live Benchmark run #131; API build failed because its configured build command runs `test:sue`, which failed at the encyclopedia pricing assertion. Downstream accuracy/live benchmarks were skipped after that failure.
- Validation of this correction pending: run the focused SUE suite, then accuracy, policy and live smoke benchmarks. Do not treat a successful build alone as proof of classification accuracy.

### SUE informational-site classification follow-up

- Tightened ecommerce evidence so generic commerce phrases in linked editorial articles do not independently count as first-party shopping capability; homepage commerce actions, first-party store/cart routes, or commerce platform evidence remain available.
- Added a conservative content-site classification guard for explicitly identified encyclopedia/reference publications. Generic login links and incidental subscription, commerce, or API terminology in article text no longer turn those publications into SaaS/ecommerce/developer-tool product types.
- Expanded the encyclopedia regression fixture with a linked article containing misleading commerce/API terms; asserts content classification and an unknown commercial model.
- Validation pending: repository network access is unavailable in this environment, so local build/test execution could not be performed here. Run the existing SUE regression suite and live benchmark before merge; the live benchmark already includes Wikipedia as a negative classification control.
- Next SUE priorities remain: review linked policy discovery and human-labelled benchmark coverage, then verify deployed core/beta report counts and prompt scope.

### SUE V1 core launch scope — PR #41 merged

- Merged PR #41 to `main` (merge commit `b9b8e00b5ae6985bcc97a1f2e75b7fd365d67f55`).
- The SUE report defaults to the 12 core launch-readiness checks, with the full 50-check engine available in a clearly labelled beta view; the underlying 50-check engine remains intact.
- The PR's existing validation run passed frontend/API typechecks, frontend build, SUE regression tests, the policy benchmark, and the five-site core-check smoke benchmark. A green test run does not establish production accuracy or deployment.
- Related merged fixes: PR #38 improved policy evidence/benchmark quality; PR #39 recognizes explicit security-scanning products; PR #40 requires actual security-contact evidence.
- Production deployment/rescan is still unverified. Follow-ups: address the observed Wikipedia-as-SaaS false classification, test discovery of linked Terms/Privacy/security-policy pages, improve labelled policy benchmark coverage, and verify the report's core/beta prompt and attention counts remain consistent.
- Workflow preference recorded: minimize unnecessary GitHub Actions usage; prefer focused validation where practical without bypassing meaningful tests.

## 2026-09-09

### Replit setup and SEO

- Installed the locked pnpm workspace dependencies and confirmed the VibeSane frontend, API, and component-preview workflows start successfully.
- Added static production HTML snapshots for the public SEO landing pages so crawlers receive route-specific titles, descriptions, canonicals, and structured data without changing the app UI or API.
- Added an explicit sitemap link to the frontend document head.

## 2026-07-27

### Replit setup

- Installed the locked pnpm workspace dependencies and configured the existing VibeGuard frontend and API workflows.
- Confirmed the Supabase browser configuration and securely added the API’s Supabase database and GitHub-token encryption secrets.
- Updated server-side Supabase JWT validation to use the Auth REST endpoint so the API starts on Replit’s Node.js runtime without an unnecessary realtime WebSocket.
- Synchronized the OpenAPI finding enum with the scanner’s generic-secret and CORS checks.

## 2026-07-26 (session 7)

### GitHub OAuth login and private repository scanning

**What was built:**

1. **GitHub sign-in** — Added "Continue with GitHub" button to the auth page alongside the existing Google button. Requests `repo` scope so private repositories can be read. Includes a consent notice explaining exactly what is stored and how to revoke access.

2. **Encrypted token storage** — New `github_tokens` table in Supabase (with full RLS: users can only read/write their own row). On GitHub sign-in, `provider_token` is captured from the Supabase session and sent to `POST /api/github/token`, where it is encrypted with AES-256-GCM using `GITHUB_TOKEN_ENCRYPTION_KEY` (a Replit Secret) and stored. The plaintext token never persists anywhere.

3. **Private repo scanning** — `POST /api/scans` now accepts an optional Supabase JWT. When present, the server fetches the user's stored GitHub token, decrypts it, and embeds it in the git clone URL (`https://x-oauth-token:<token>@github.com/...`). All existing file-filtering and check logic is unchanged — only the clone URL differs.

4. **Repo picker UI** — Logged-in users see a "Paste URL / My repos" toggle above the scan input. "My repos" fetches `GET /api/github/repos` (proxied through the server using the stored token) and shows a searchable list with lock/globe icons for private/public repos. Clicking a repo immediately triggers a scan. If no GitHub connection exists, the picker shows a "Link GitHub account" prompt.

5. **Auth wiring** — `setAuthTokenGetter` is called at app startup so every generated API hook (including `useCreateScan`) automatically includes the Supabase JWT in the Authorization header.

**Manual steps still required:**
- Apply the `github_tokens` table migration (`node scripts/migrate-supabase.mjs` or paste the SQL in the Supabase SQL editor).
- Register a GitHub OAuth App (Settings → Developer settings → OAuth Apps) and add the Client ID + Secret to Supabase Auth → Providers → GitHub.
- Add the Replit dev domain to Supabase Auth → URL Configuration → Redirect URLs.

## 2026-07-26 (session 6)

### Two polish features

1. **Full name on signup** — Added a required "Full name" field to the signup form in `AuthPage.tsx`. The name is stored in Supabase `user_metadata` as `full_name`. The Nav now shows `user_metadata.full_name` everywhere the email used to appear (desktop button, desktop dropdown header, mobile menu), falling back to email for existing users who signed up before this change.

2. **Animated scan progress** — Replaced the static skeleton (`ScanSkeleton`) with a new `ScanProgress` component. It steps through the 7 scanner checks (fetch → RLS → unauthenticated writes → service keys → secrets → security definer → CORS) with realistic timed delays (400–1100ms each), a smooth CSS progress bar, and per-row status icons (gray dot → spinning loader → green check). The last check stays in "running" state until the real scan completes, ensuring the UI never looks falsely done before results arrive.

## 2026-07-26 (session 5)

### Pre-launch pass — all six items completed

1. **Dedup + self-exclusion verified** — re-scan of Darkhero766/Vibeguard: 0 scanner.ts hits, 0 duplicates. ✅
2. **App.tsx false positive fixed** — added `COPY_EXCLUDED_LINE_RANGES` map in scanner.ts; line 287 (UI copy mentioning "service_role keys") is skipped by service-role and secrets checks while the rest of App.tsx is still fully scanned.
3. **Generic secrets check added** — new `scanGenericSecrets` in scanner.ts flags Stripe live keys (`sk_live_…`), AWS access key IDs (`AKIA…`), and hardcoded `api_key`/`secret_key` assignments ≥ 20 chars. Critical severity. Respects `COPY_EXCLUDED_LINE_RANGES` and comment-line skips.
4. **CORS wildcard check added** — new `scanCorsWildcard` in scanner.ts flags `Access-Control-Allow-Origin: "*"` in `next.config.*` files. Medium severity.
5. **Legal pages updated** — removed "Placeholder — review before launch" labels and "[email placeholder]" text from both pages; updated date to July 2026; Terms now explicitly states public-repos-only, no code storage, results not a substitute for professional audit, and 1-scan free-tier limit; Privacy updated to match.
6. **Mobile layout verified** — 375 × 812 screenshot: hero, CTA buttons, and nav all render correctly, no horizontal scroll or cut-off text.

Final verification scan (Darkhero766/Vibeguard): 0 findings, 100 files scanned.

## 2026-07-26 (session 4)

### Unlimited scans for nightowlclub72@gmail.com

- Added `isUnlimited` check in `artifacts/vibeguard/src/App.tsx` (Home component) that bypasses the scan limit for `nightowlclub72@gmail.com` only.
- Patched both enforcement points: the `isAtLimit` derived value (hides the upgrade wall) and the pre-scan inline re-check inside `runScan` (prevents the blocked state from being set).
- All other users remain subject to the normal `scans_used >= scans_limit` quota.

## 2026-07-26 (session 3)

### Scanner bug fixes (artifacts/api-server/src/lib/scanner.ts)

- **Bug 1 — Duplicate findings**: Added `deduplicateFindings()` and applied it inside `scanPublicRepository` before the final sort. Deduplicates by `filePath:line:check:title` key.
- **Bug 2 — Self-scan false positives**: Added `SELF_EXCLUDED_PATHS` constant and updated `shouldRead()` to skip `artifacts/api-server/src/lib/scanner.ts`. Prevents the scanner's own detection patterns (e.g. the string `service_role`) from triggering findings against the VibeGuard repo itself.
- Verified by scanning `https://github.com/Darkhero766/Vibeguard`: `scanner.ts` appears 0 times in findings, 0 duplicate findings, 1 real finding (`artifacts/vibeguard/src/App.tsx:287`).

## 2026-07-26 (session 2)

### Supabase credentials wired up

- Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as shared Replit environment variables (read from `artifacts/vibeguard/.env.example`).
- Restarted the VibeGuard frontend workflow; browser console clean, landing page loads without errors.
- Confirmed the API server is stateless — scan routes do not call the database. `DATABASE_URL` is runtime-managed by Replit but not required for functionality.
- Usage tracking (`usage` table, RLS, auto-signup trigger) lives entirely in Supabase. Run `supabase/migrations/usage_table.sql` once in the Supabase SQL Editor if not already applied.

## 2026-07-26

### Project setup

- Installed the locked pnpm workspace dependencies and verified the VibeGuard web preview, API server, and mockup preview workflows.
- Added secure Supabase configuration through the Replit Secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Added a placeholder environment template at `artifacts/vibeguard/.env.example`; no credential values are committed.
- Added startup validation for the Supabase URL and documented the required environment variables in `replit.md`.
- Verified workspace typechecking and the VibeGuard production build.

### Contributor workflow

- Documented the project convention to update this changelog after each change and push the summary to GitHub.
## 2026-10-07 — SUE audit/applicability hardening and deployment validation

### Completed

- Stabilized the SUE applicability build after multiple Render/esbuild failures in `sue-context.ts`; the production build now completes successfully.
- Fixed the malformed/double-escaped JavaScript regex literals used by SUE context detection, including analytics disclosure, tracking disclosure, and Facebook/SDK domain detection.
- Added/maintained SUE applicability regression coverage and verified the suite passes: **13 scenarios × 50 checks = 650 evaluations**.
- Regression coverage currently validates portfolio, blog, ecommerce, SaaS, AI product, AI mention-only, analytics, no-tracking, free SaaS, VibeSane-like SaaS, legal-page contamination, generic search input, and JS-heavy coverage scenarios.
- Confirmed the Render production API build and startup are healthy: build succeeds, SUE regression tests pass, server listens successfully, database initialization completes, and the service becomes live.
- Confirmed GitHub protection webhook processing is operational in production, including repository lookup, installation-token creation, security-check creation, delta-scan startup/completion, and zero-finding handling for an unchanged-file push.
- Added/validated the real-world SUE benchmark workflow for representative public sites so classification/applicability can be checked against actual web content rather than fixtures alone.

### Current SUE architecture

- URL submission → crawl → product/context classification → applicability evaluation → evidence collection → final PASS/REVIEW/MISSING/N/A status → score → report → master fix prompt.
- Applicability is evidence/confidence weighted and coverage-aware; insufficient crawl visibility can produce REVIEW/UNKNOWN instead of confidently declaring a requirement absent or irrelevant.
- The master fix prompt only uses missing/review requirements and treats crawled evidence as untrusted data, protecting the downstream coding-agent handoff from prompt-injection content found on audited sites.
- Not-applicable requirements are excluded from the score denominator so products are not penalized for requirements that do not apply to their product model.

### Remaining SUE work / next priorities

1. **Audit the 13 imperative applicability overrides** in `runApplicabilityAwareChecks`: test each against its declarative `Rule`, remove redundant overrides, and document which remaining overrides are genuinely load-bearing.
2. **Move load-bearing exceptions into the declarative rule model** where justified, using capabilities such as `noneSignals`, `unknownIfAbsent`, and `forceApplicableIf`; do this only after the override audit proves the need.
3. **Harden SSRF protection fully**: resolve hostnames explicitly, validate resolved IPv4/IPv6 addresses against private/link-local/loopback/reserved ranges, and protect against DNS rebinding while preserving the intended Host header behavior.
4. **Verify the N/A UI end-to-end**: confirm the filter/tab and summary count render correctly in `AuditReportPage`; add only if missing.
5. **Benchmark real crawl latency** with a multi-page site. If sequential fetching of up to 16 pages is materially slow, introduce bounded concurrency (target ~4–5 concurrent fetches) with `Promise.allSettled` while preserving SSRF and timeout protections.
6. **Add robots.txt support** before following linked pages, using the same SSRF-safe fetch path and respecting disallowed paths.
7. **Use the live benchmark results to identify classifier blind spots** before adding an LLM fallback. Deterministic classification remains preferred; add an LLM fallback only if real scans demonstrate a meaningful low-confidence/unknown rate.
8. **Keep expanding regression scenarios from real-world failures**. Every new classifier/applicability rule should add a regression case and the full SUE suite must remain green.
9. **Re-run production verification after each security/crawl change**: Render build, SUE regression suite, API startup, GitHub webhook/delta protection path, and at least one real-world SUE audit.

### Operational rule

Do not treat a green build alone as proof that SUE is correct. Changes must be validated at three levels: deterministic regression tests, real-world crawl/benchmark behavior, and production deployment/runtime behavior. Preserve the existing 50-check applicability contract unless a requirement is intentionally changed and covered by a new regression scenario.

