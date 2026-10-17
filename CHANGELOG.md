## 2026-10-17

### SUE policy-evidence precision: governing law and privacy rights

- Improve L12 evidence selection so a named governing-law clause is preferred over a generic “Governing Law” heading; incomplete clauses remain REVIEW rather than passing.
- Expand P11 matching to recognize rights lists phrased as nouns (access, correction, deletion, restriction, portability, objection) as well as “right to …” wording.
- Add regression assertions for jurisdiction clauses after a generic heading and noun-list privacy rights with an exercise path.
- Preserve the 50-check engine, 12-check V1 core registry, conservative evidence quality gates, and crawl safety controls.
- Validation required before merge: API build/typecheck, SUE regression, accuracy benchmark, policy benchmark, and live core benchmark. Production rescan is still required.

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

