# VibeSane Phase 2: Solo-Founder Validation Gate (internal controlled-beta pathway)
**2026-11-21 — DEVELOPMENT ONLY / NOT A SECURITY CERTIFICATION**

## Decision and trust boundaries

A startup without two hired independent security engineers may use **one manually signed founder/source review**, plus reproducible safe test cases and tool comparisons, as evidence to **consider** a small, controlled beta. This does **not** satisfy independently certified recall/precision, proof of exploitability, or production authorization. The existing `vibesane-independent-review-gate.mjs` stays intact for later qualified independent security certification. No default CI setting shall mark the founder's review as complete.

The `vibesane-solo-founder-gate.mjs` is a **fail-closed evidence assessor**, not a deployer. It always returns `precision: null`, `recall: null`, `independentAccuracyCertified: false`, `productionReleaseAuthorized: false`, `automaticBetaDeploymentAuthorized: false`. Its strongest outcome is `candidate_for_owner_beta_decision`—an explicit owner must still decide whether the scope and remaining risks justify beta access.

## Evidence corpus and immutability

- Frozen 22 different open-license public application repositories and **109 selected source paths**, manifest `artifacts/api-server/benchmarks/real-world/phase2-app-holdout-22.v1.json`.
- Complete scan collected on immutable scanner SHA `f95fd953bcef84a28beb632b054df90ebf90aebc` in [Actions run #44866956762](https://github.com/Darkhero766/Vibeguard/actions/runs/44866956762). **23 UNREVIEWED findings** (4 Critical / 19 High); neither human ground truth nor real-world accuracy exists yet.
- Actual engine `api_core_plus_extended_v2` scans those selected files, NOT full GitHub repos, running applications, cross-repository dataflow, hosted checkout, independent AST/taint engines or user authorization.
- **Do not tune rules using these 23 holdout alerts and still call the 22 repositories an untouched holdout.** The new separate 10-case synthetic suite is development regression evidence, not external benchmark ground truth.

## New developer workflow

1. Download original SHA-pinned source-free evidence artifact, or use the `scans_merged.v1.json` from the founder review package; never paste a token or user data.
2. Create an **empty** review starter (no fabricated AI/human findings):

   ```sh
   node artifacts/api-server/scripts/prepare-vibesane-solo-review.mjs \
     --manifest artifacts/api-server/benchmarks/real-world/phase2-app-holdout-22.v1.json \
     --scans scans_merged.v1.json \
     --output-dir /tmp/vibesane-solo-review-new
   ```

3. AI (ChatGPT/Claude or another accessible model) can **propose** technical source hypotheses with pinned URLs, surrounding source logic, conditions, counterexamples and uncertainty. Keep raw AI responses in a separate artifact and state the model and date. Two AI models are not independent human auditors and their agreement does not automatically upgrade confidence or become ground truth.
4. The founder personally checks each finding's source context and completes `founder_review_EMPTY.json` with explicit `assessments` keyed by `ruleId`, `filePath`, `line`, and one of `likely_true_positive`, `likely_false_positive`, `uncertain`, `duplicate`. Each requires a **20-character contextual explanation** and a pinned code/evidence URL. Duplicate reviews must point to another exact real alert in the same repository; an unresolved Critical/High alert blocks beta candidacy.
5. Only the actual founder can set `reviewer.kind="solo_founder"`, `reviewer.id`, `ownerAttestation=true`, `signedAt` to a genuine timestamp. AI must NEVER fill these values or label findings as personally reviewed.
6. Record four separately evidenced **passed** checks: `regression_fixtures` (the 10 synthetic paired case regression, tied to commit/CI); `independent_comparator` (read-only CodeQL or licensed alternative, documented tool and unmatched rules, no false assumption that tool silence means safe); `hosted_staging_e2e` (actual isolated GitHub OAuth, quotas, and test-mode payments on a commit-matched staging deployment); `phase1_operational_safety` (privilege/rollback controls and owner decisions, with no unauthorized live changes). All four start `pending`; `waived` never counts as passed.
7. Run:

   ```sh
   node artifacts/api-server/scripts/vibesane-solo-founder-gate.mjs \
     --manifest artifacts/api-server/benchmarks/real-world/phase2-app-holdout-22.v1.json \
     --scans scans_merged.v1.json \
     --review /tmp/vibesane-solo-review-new/founder_review_EMPTY.json \
     --checks /tmp/vibesane-solo-review-new/beta_checks_PENDING.json
   ```

   Exit 2 means gate **blocked** (expected until real evidence exists); exit 1 means malformed/inconsistent evidence. Neither can be bypassed via an AI-generated founder signature or a checklist waiver. A structurally complete gate still **does not authorize production**.

## High-priority AI investigation prompts from pinned-source spot checks — NOT verdicts

- [ArnasDon/wacrm API key revoke](https://github.com/ArnasDon/wacrm/blob/6dbeb5bf94d4cf01be351272d0d45b64b1a684d4/src/app/api/account/api-keys/%5Bid%5D/route.ts#L48) uses `requireRole('admin')` and account-scoped filtering ahead of the update. Trace that helper and policy; the lexical finding is not independently established as an authorization flaw. Same family for its key creation and autoreply endpoints.
- [shadcn-ui/taxonomy post writes](https://github.com/shadcn-ui/taxonomy/blob/298a8857c7128a0d121e7f699dfd729f23b3966d/app/api/posts/%5BpostId%5D/route.ts#L28) check `verifyCurrentUserHasAccessToPost` before writes. Its [Stripe webhook](https://github.com/shadcn-ui/taxonomy/blob/298a8857c7128a0d121e7f699dfd729f23b3966d/app/api/webhooks/stripe/route.ts#L35) calls `stripe.webhooks.constructEvent` with a signing secret before any mutation; lack of a browser user session is not itself a webhook vulnerability.
- [ShenSeanChen subscription cancellation](https://github.com/ShenSeanChen/launch-mvp-stripe-nextjs-supabase/blob/513a8f0ca6e405725dcf98eab1fc5cd6468b5f10/app/api/stripe/cancel/route.ts#L31), reactivation and account deletion accept requester-controlled identifiers. The imported `withCors` wrapper in the pinned source sets CORS headers and forwards the request; **it does not visibly authenticate**. Independently assess authentication enforced elsewhere and impact before treating this as confirmed.
- Its [Stripe webhook](https://github.com/ShenSeanChen/launch-mvp-stripe-nextjs-supabase/blob/513a8f0ca6e405725dcf98eab1fc5cd6468b5f10/app/api/stripe/webhook/route.ts#L158) verifies the Stripe signature with `constructEvent` before processing. This is a different security model from login-required endpoints.
- [nextjs/saas-starter checkout callback](https://github.com/nextjs/saas-starter/blob/6e33e58b1e553a41fe22e6b941a7229a002de361/app/api/stripe/checkout/route.ts#L80) obtains a Stripe session from a query parameter and calls `setSession(user[0])` downstream. **Priority review:** check whether caller ownership of that checkout session is bound before login/session establishment; a payment-side effect cannot by itself establish identity.
- [Supabase service-role helper in saumya66 starter](https://github.com/saumya66/Next-Supabase-Stripe-Starter/blob/9adf910922d4acf5f66ea60841490afc063b86cb/utils/supabase-admin.ts#L12) and [thorsten-stripe helper](https://github.com/thorsten-stripe/nextjs-subscription-payments/blob/16d18fc78f782b162518c48a254108f21ba42641/utils/initSupabaseAdmin.js#L3) mention service-role keys, but source location alone does not demonstrate a client-bundle secret leak. Check server import chains and actual bundle exposure.
- For [early Nextbase SQL migration](https://github.com/imbhargav5/nextbase-nextjs-supabase-starter/blob/00ad2da857b84322ff359db098cbf1cb4f4b7282/apps/database/supabase/migrations/20230208104717_init.sql#L5) and [tenant migration](https://github.com/onursagir/supabase-multi-tenancy/blob/5d0ecf0ce50002484afa971b46ad308e95ef11c/supabase/migrations/20231114221614_create_tenants_table.sql#L1), determine later migrations, actual grants and exposure; bounded single-file RLS absence is not live DB proof.
- [Basejump SQL](https://github.com/usebasejump/basejump/blob/7a1f95ccef74eb2e638d5e4233b66b6cbbe175e6/supabase/migrations/20240414161947_basejump-accounts.sql#L109) contains helper/trigger and RLS policy context. Treat `unprotected_rpc` lines as **review prompts** until full function ranges and grants are mapped. [Sidekick MFA helper](https://github.com/sidekick0361/nextjs-supabase-saas-platform/blob/3325e89681f346bde3cbb3f48f33eb1ac0b02459/supabase/migrations/20250107210416_MFA.sql#L5) includes an `auth.uid()` predicate in its body; inspect `SECURITY DEFINER` search_path and invocation privileges.

## Tool choice and licensing

NIST SARD and OWASP Benchmark are excellent general references, but standard OWASP Benchmark suites are **Java/Python**; their scores are not a direct JS/TS product benchmark. For independent comparator evidence on JavaScript/TypeScript, use CodeQL's appropriate JS/TS queries when eligible and record mismatched assumptions. Semgrep's *engine* and Semgrep's registry/community *rules* have different licensing; Semgrep Rules License limits competitive/SaaS use, so do not ingest licensed rules into VibeSane without appropriate rights. Sources: https://owasp.org/projects/benchmark ; https://samate.nist.gov/SARD/ ; https://semgrep.dev/blog/2024/important-updates-to-semgrep-oss/ .

**Final safety:** No paid upgrade, production SQL/migration/Auth setting changes, production deploy, PR merge, provider secrets, or automatic public beta is authorized by this document. Phase 3 remains on hold.
