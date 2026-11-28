# Phase 2 — pinned app-source context review, 21 November 2026

**Classification: assistant-authored engineering triage; not independent human ground truth.** This document deliberately contains no credentials, user records, external repository source code or fabricated adjudications. All assertions require later qualified independent human verification before being used to claim precision or recall.

## Baseline with verifiable provenance

Read the immutable source-free GitHub Actions artifact `phase2-app-holdout-22-source-metadata` from run `44866956762`, artifact ID `14692511424` (historical ruleset `f95fd953bcef84a28beb632b054df90ebf90aebc`). The 22 pinned apps yielded 22 completed bounded source scans, 109 files, **23 unreviewed** warnings: 4 Critical / 19 High. Rule counts: `unauthenticated_write` 12, `unprotected_rpc` 6, `rls` 2, `service_role_client` 2, `security_definer_search_path` 1. The artifact explicitly sets precision/recall to null and 0 reviewed labels. These are **alerts, not confirmed vulnerabilities**.

## Pinned source checks performed (source read only; no repository code executed)

- `ArnasDon/wacrm@6dbeb5bf94d4cf01be351272d0d45b64b1a684d4`:
  - `src/app/api/account/api-keys/[id]/route.ts:48`, `src/app/api/account/api-keys/route.ts:131` and `src/app/api/ai/autoreply/[conversationId]/route.ts:91` were flagged `unauthenticated_write` High.
  - Each route awaits `requireRole('admin')` or `requireRole('agent')` imported from `@/lib/auth/account`. The pinned `src/lib/auth/account.ts:109-194` implementation calls `supabase.auth.getUser()`, rejects missing sessions, checks account/profile linkage and minimum role, and throws `UnauthorizedError` or `ForbiddenError` on failed checks. The routes also apply account scoping and RLS; effective live policies still require independent verification.
  - **Engineering conclusion:** do not assert missing authentication. Downgrade to **Medium contextual review**, preserving warning until full call graph/RLS is checked. New tests cover those positive and negative guard shapes.
- `ShenSeanChen/launch-mvp-stripe-nextjs-supabase@513a8f0ca6e405725dcf98eab1fc5cd6468b5f10`:
  - Historical `unauthenticated_write` High at `app/api/stripe/webhook/route.ts:158` points to `checkoutSessionMap.delete(subscription.id)`, an in-memory `Map.delete`, not a DB mutation. The route does perform real `supabase.from('subscriptions').update(...)` later, and calls `stripe.webhooks.constructEvent` before handling events. A browser user login is not an appropriate requirement for a signature-authenticated webhook. **Engineering conclusion:** ignore collection deletion, retain Medium manual review for the later signed DB mutation; verify that bad signatures abort and rows are correctly scoped.
- `shadcn-ui/taxonomy@298a8857c7128a0d121e7f699dfd729f23b3966d`:
  - Historical High at `app/api/webhooks/stripe/route.ts:35` is preceded by `stripe.webhooks.constructEvent(..., Stripe-Signature, STRIPE_WEBHOOK_SECRET)` and an error response on failure. **Engineering conclusion:** signed webhook differs from missing user auth; retain Medium verification of signature handling, replay and business authorization, not a proven High unauthenticated write.

## First diagnostic rescan of the same pinned source

GitHub Actions run `44912044539`, artifact `14710580957`, ruleset `80d67452488bb2a07038dec45118204fab0f25fb`: same 22 repo+commit identities and 109 files; **19 unreviewed alerts** (2 Critical / 14 High / 3 Medium) compared with 23 unreviewed (4 Critical / 19 High) in the historical ruleset. Four older `unprotected_rpc` warnings disappeared after function parser and guard improvements, two shared server-only service-role references were reclassified, and three route warnings became Medium. The result is purely diagnostic and **does not establish that any remaining or removed alert is a real true/false positive**.

The source comparison also exposed a lexical bug: apostrophes in comments could cause the previous regex masker to hide subsequent `await requireRole` checks. Fixed in `579189ee` by a stateful comments/string masking pass with negative controls. **A second same-source diagnostic rescan is intentionally requested**, not represented as an independent holdout.

## Why these are NOT unbiased holdout scores

The pinned 22-app sample informed detector changes in this feature branch. It is now a **development source-context set**, not an untouched independent holdout for the revised engine. Do not use changed warning counts to claim improved accuracy, true/false-positive rates, precision or recall. Do not turn assistant-authored interpretations into human labels. A fresh non-tuned pinned sample with permissioned independent reviewers and missed-target examination remains mandatory.

## Regression/refresh instructions

The scanner now differentiates Map/Set deletion, recognized imported role guards and Stripe signature-verified webhook handlers, retaining contextual Medium findings. An opt-in CI source-only collection with `[collect-app-holdout-22]` may re-evaluate the frozen 22 apps **diagnostically**, without executing external repository code. Compare its warning counts against this historical baseline only as a coverage/behavior diagnostic. Keep `precision: null` and `recall: null` until independently adjudicated.

**Release blockers unchanged:** owner-approved sandbox cancellation/recovery acceptance, independent human scanner labels including false negatives, severity review, production migration compatibility and rollback, and explicit production deployment approval.
