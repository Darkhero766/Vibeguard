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
