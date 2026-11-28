# Phase 1–2 release-hardening sprint — 21 Nov 2026

**Branch**: `feat/agentshield-phase1-phase2-security`, draft PR #61, no production merge or deployment. This is an engineering test record, not release signoff.

## Phase 1: paid entitlement lifecycle

- Staging checkout and test payment have already been verified by successful processed signed Dodo webhooks and a bounded Pro entitlement, but *no cancellation of the owner's active sandbox subscription has been authorized*.
- Fixed stale Dodo cancellation revoking a newer hackathon Pro entitlement: subscription ID AND `pro_source IN ('dodo','dodo_return_sync')` now required for revocation. Signed test covers same-ID stale cancellation against hackathon Pro, plus `on_hold`, `failed`, `expired`, correct cancellation, duplicates, wrong account, invalid expiry/product and one-time payment not granting Pro.
- Official Dodo API documentation says `cancel_at_next_billing_date: true` leaves a subscription active until the current period ends. The `subscription.updated` event must not immediately remove access while the paid-through date remains valid. Signed synthetic test added for scheduled cancellation. Event semantics must also be validated in Dodo's test environment before production cutover.
- Pending: provider-initiated cancellation, failed-payment/dunning and resume, ordered replays, live two-account isolation, quota reset, privilege migration and rollback approval. Do not cancel current test subscription without owner's consent.

## Phase 2: repeatable independent review

- Separate source-only packets: `blind` contains frozen repository and scanned path scope **without scanner findings**; `adjudication` contains exact candidate rule, file, line, severity only, without any verdict.
- Both packets must match the same SHA-256 source metadata fingerprint; if any of 30 pinned scans is incomplete, missing or changed, the handoff **fails closed** and cannot claim accuracy.
- Current 22-app sample was used for rule tuning and remains diagnostic, not an independent holdout. No reviewer has been appointed or certified by this sprint.
- GitHub Actions opt-in `[collect-30-public]` runs **only local VibeSane scanner code** over read-only, immutable PUBLIC GitHub sources with `api_core_plus_extended_v2` engine; it never executes source repository code. Upload metadata-only artifacts and **separate** blind and unblinded packets to avoid contaminating the first review. All labels remain unreviewed, precision and recall null.
- Independent qualified reviewers must first identify vulnerabilities and missed targets from the blind source scope, then separately adjudicate scanner alerts. A release owner must verify both reviewers' independence and qualified security experience. External certification is not available yet.

## Safety gates

Do not run real charges, cancel the existing test subscription, touch production secrets or grants, merge PR #61, or treat synthetic/source-only CI as an externally certified accuracy metric. Staging rollout must pass exact-SHA CI and service/rollback verification first.

Official source: https://docs.dodopayments.com/api-reference/subscriptions/patch-subscriptions
