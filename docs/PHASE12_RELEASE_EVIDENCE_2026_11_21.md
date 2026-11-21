# Phase 1 + Phase 2 evidence and release gate — 2026-11-21

**Status: DEVELOPMENT VALIDATION ONLY — NOT PRODUCTION READY.** This is a source-backed checkpoint, not a permission to merge, deploy, change live grants or represent scanner accuracy as independently certified. Current working branch: `feat/agentshield-phase1-phase2-security`; PR #61 stays draft.

## Phase 1 — confirmed facts and exact remaining gates

### Evidence checked against connected live provider metadata (read-only)

- Isolated Supabase staging project `aojmjxxmsgnipbbrtvlz`: `ACTIVE_HEALTHY`, Postgres 17, one bootstrap migration `20261120033524`. Its earlier explicit 11/11 least-privilege SQL checks and SQL rollback-only tests are recorded in `PHASE12_STAGING_RUNBOOK.md`; **those SQL tests were not re-executed against a hosted database during this checkpoint**.
- Production project `oxtwuylzxyleesfvsvtx`: separate and `ACTIVE_HEALTHY`, six existing migration entries, not reconciled to the greenfield staging bootstrap. Earlier live privilege audit found 3/11 passes; **do not claim that production was remediated**. The current project metadata/advisors check is not an SQL privilege re-audit.
- Supabase security advisors: **leaked-password protection disabled in BOTH environments**. Staging additionally reports six informational `rls_enabled_no_policy` internal tables, intentionally deny-by-default. Supabase advisor: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection ; RLS/grant guidance: https://supabase.com/docs/guides/api/securing-your-api .
- Dedicated Render staging services `vibesane-phase12-staging-api` and `vibesane-phase12-staging-web` exist on the feature branch, with **autoDeploy disabled**. Separate live production services remain unmodified.
- GitHub feature-branch CI exercises locked dependencies, TypeScript builds, HTTP/mocked OAuth/webhook/usage regression tests, read-only staging HTTP smoke, and two isolated PostgreSQL 17 database proof jobs. A green CI build **cannot** certify live OAuth, payments, role grants, restore, or user-flow E2E.

### Required before Phase 1 release signoff (not fulfilled by this document)

| Gate | Required proof | Current outcome |
| --- | --- | --- |
| Production privilege lockdown | Owner-approved migration compatible with currently deployed API, restore point and rollout; authenticated usage writes denied; OAuth token ciphertext client access denied; audit writes denied; 11/11 live post-state read-only gates | **BLOCKED — no approval/migration applied** |
| Migration/rollback integrity | Reconcile six live migration versions with version-controlled SQL; backup snapshot proof, recovery drill, rollback ownership and old-client compatibility plan | **BLOCKED** |
| Production leaked-password setting | Security/product owner agrees on behavior; enable and verify via Auth settings, no user-data leakage | **BLOCKED** |
| Hosted staging E2E | Test user on staging only: signup/auth, GitHub connect/repo/scan/disconnect, role isolation, quota reserve/failure/month boundary, Dodo sandbox checkout/webhook/replay/cancel, audit retention | **PARTIAL — mocked/local SQL and anonymous HTTP only** |
| Independent review | Qualified human security review of session, authorization, migrations, token persistence and billing logic | **BLOCKED** |

**Do not** apply `supabase/review-only/PROPOSED_USAGE_ENTITLEMENT_LOCKDOWN.sql` or `PROPOSED_GITHUB_TOKEN_AUDIT_LOCKDOWN.sql` to production automatically. Both are proposals; their 17-alpine CI rehearsals do not replace provider-specific staging and restore checks. Never restore insecure authenticated DML/token grants as an unreviewed rollback.

## Phase 2 — fresh application source holdout: frozen before evaluation

- Manifest: `artifacts/api-server/benchmarks/real-world/phase2-app-holdout-22.v1.json`.
- **22** different publicly licensed repositories (MIT or Apache-2.0, from GitHub license metadata) not present in the old 30-app calibration set.
- **109** exact file paths, SHA-pinned at selection, manually chosen for API handlers, Supabase migrations/RLS, auth, tenancy, subscription, webhooks, and other product-relevant code. Subset coverage is NOT whole application/repo coverage. No source code is executed.
- Source collection is an explicit opt-in CI job via `[collect-app-holdout-22]`; only source-free paths/counts/rules/lines/severities are retained. All newly reported findings begin **unreviewed**.
- Collection mode `api_core_plus_extended_v2` combines existing API-core heuristics and Extended V2 checks on the same pinned files. This is closer to product rules than `extended_v2_only`, but **still not production checkout/browser/experimental multi-file AST, quota, billing or UI parity**.
- The original 30-repository corpus, including Claude's 112 AI verdicts and 41 post-calibration findings, is **development calibration only**. Do not transfer its annotations into the holdout or tune rules after seeing holdout outputs and then call that same corpus untouched.

### Phase 2 release-quality evaluation protocol

1. Keep current holdout pins, original source path coverage, scanner SHA and engine identifier immutable. Record incomplete, unavailable, excluded, oversize and unsupported-language source separately; do not count those as scanner negatives.
2. Have at least two **independent qualified human security reviewers** inspect every alert in its actual execution context, record evidence, severity and reproducible location. Resolve disagreements explicitly rather than overwriting labels, and separately group duplicate root causes.
3. Independently curate **known vulnerabilities absent from scanner alerts**, restricted to actually scanned files, and separately report out-of-scope source gaps and unsupported vulnerability classes. Score alert precision and curated-target recall only against independently reviewed labels.
4. Run distinct integration/E2E tests of the actual product scan path and test realistic performance at large repository sizes. Preserve missing classes, incomplete scans, cost and false-positive burden.
5. A passing automated pipeline cannot supply human independence, proof of exploitability or scanner guarantees. Keep precision, recall, clean-repository assertions and marketing figures **unset** until they can be justified.

## Approval boundary

The user has requested completion of Phases 1–2. This authorizes engineering work and non-invasive validation on the safe feature branch. It **does not replace separate explicit approval** for production deployment/merge, paid services, production SQL/data/auth changes or handling sensitive external provider secrets. All blockers must be disclosed without rebranding testing infrastructure as a production release.

## App holdout collection rerun note

The first opt-in [collection run #44866781794](https://github.com/Darkhero766/Vibeguard/actions/runs/44866781794) **FAILED CLOSED: 0/22 completed**. The combined engine's collector omitted its bundled API-core exports, so every subprocess exited nonzero; no scan result or accuracy claim is inferred. The collector now exports the third bundled module and has a direct offline regression test checking API-core and Extended V2 rule execution before source fetching. A new, SHA-pinned public-only collection is requested using the same 22-source manifest and unchanged detection rules. Results remain unreviewed.


## Verified 22-app source collection and independent review handoff

- First opt-in attempt, [run #44866781794](https://github.com/Darkhero766/Vibeguard/actions/runs/44866781794), **failed** with 0/22 because the new API-core module was built but not exported by the collector. No result or accuracy was inferred. Fixed the collector import and added an actual bundled API-core/V2 regression test.
- Corrected pinned-source collection, [run #44866956762](https://github.com/Darkhero766/Vibeguard/actions/runs/44866956762), **passed all 4 active jobs**, including the public-source collection, original release/regression suite, and two isolated Postgres proof jobs. Collector: **22/22 complete**, all **109/109 declared source paths** scanned, no failures or incomplete projects, zero fetched code executed, ruleset SHA `f95fd953bcef84a28beb632b054df90ebf90aebc`.
- **23 UNREVIEWED findings: 4 Critical / 19 High.** Rule distribution: `unauthenticated_write` 12; `unprotected_rpc` 6; `rls` 2; `service_role_client` 2; `security_definer_search_path` 1. **No confirmed true positives, false positives, precision, recall, human reviews or exploitability are asserted.**
- All 22 scanned entries used engine `api_core_plus_extended_v2`. **No product UI/remote live OAuth/checkout/browser flow, checkout-clone rules, additional experimental cross-file AST/taint mode or penetration testing** was claimed. Scan is of 109 chosen paths, not the whole 22 repos.
- Review queue is generated locally from the exact Actions metadata with pinned source URLs and independent-review templates. The repository contains `artifacts/api-server/scripts/vibesane-independent-review-gate.mjs` and 8 initial strict offline tests. It rejects an AI reviewer impersonating a human, incomplete human labels, ambiguous severity, unreviewed/missing source, inconsistent curated targets, and unresolved independent-review conflicts. It always emits `accuracyVerified:false` until external human qualification and security owner signoff.
- **Source spot-checks are NOT labels:** Two Critical `service_role_client` detections occur in `saumya66/Next-Supabase-Stripe-Starter/utils/supabase-admin.ts` and `thorsten-stripe/nextjs-subscription-payments/utils/initSupabaseAdmin.js`. Both contain `SUPABASE_SERVICE_ROLE_KEY` in plausibly server-only admin modules; the scan does not establish client-bundle inclusion. Check import chains before declaring either a leak. Similarly, subscription/webhook routes must be evaluated for signed webhook guards, while SQL `SECURITY DEFINER` helpers and initial migrations must be checked in full policy/migration context. **Do not tune detectors on these holdout examples and still call the same set untouched.**

### Explicitly unresolved hard release gates

1. Independent qualified human reviewers must produce two full, verifiable, context-rich adjudication sets; review every one of 23 alerts; verify in-scope missed vulnerability targets; reconcile disagreements; perform real product end-to-end scanner/performance comparison.
2. Phase 1 full hosted *test-only* OAuth and Dodo sandbox journeys remain contingent on independently configured, protected staging accounts and sandbox credentials; mocked/static/anonymous CI checks do not substitute.
3. Production still lacks owner-approved compatibility-checked privilege migrations, live grant lock-down and 11/11 post-state security proof; its historical migration ledger must be reconciled; a real backup/rollback rehearsal and change window must be approved.
4. Supabase leaked-password protection is disabled in both production and staging per current security advisors; enabling changes Auth behavior and requires owner's explicit approval and separate verification.
5. PR #61 remains draft and unmerged; no production settings, SQL, secrets, OAuth, payments, Render production services, users, or deployment were modified during this work.
