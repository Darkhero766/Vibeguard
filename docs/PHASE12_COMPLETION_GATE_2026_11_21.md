# VibeSane Phase 1 + Phase 2 — evidence-based completion gate (21 Nov 2026)

**Status:** internal development and restricted staging only. Draft PR #61 remains unmerged; Phase 3 remains on hold. No production deployment, production grant migration, or real payment has been approved. This is a release *checkpoint*, not a security certificate.

## Phase 1 — OAuth, billing, quotas, infrastructure isolation

| Gate | Evidence | State and remaining action |
| --- | --- | --- |
| Staging API / web routing, private access | Isolated Render staging; staging API 14/14 public HTTP smoke and staging PostgreSQL permission gate 11/11 | Verified for public HTTP and read-only DB checks; repeat exact-SHA smoke after every staging deployment |
| GitHub OAuth token handling | Live staging provider-token POST 200; encrypted token row stored; protected scanner tests | Real GitHub auth flow partly verified. Complete account separation, protected scans, disconnect/reconnect, quota reset/failure tests |
| Checkout session creation | Signed-in staging checkout POST 200 and user reached Dodo test-mode hosted payment page; exposed prior test API key was rotated | **Session handoff verified**, not payment. Complete sandbox test-only checkout, signed webhook receipt, verified subscription entitlement, renewal, cancellation, refund/failure and replay checks without real cards |
| Billing entitlement boundedness | HMAC/idempotency synthetic tests and reviewed code; new rule requires future paid-through date for activation in both webhook and authenticated sync | New fail-closed expiration patch at commit `03a64cf8` needs exact-head CI and staged integration confirmation; non-expiring Pro must never be created by absent or stale dates |
| Billing-provider error redaction | Staging API security fix `ce1e8e76` live and prior credential rotated | Verified public API smoke; keep raw token/provider-body errors out of responses and logs |
| Database privileges and production migration | Staging 11/11 permission gates pass, production 3/11 pass (8 fail) on prior **read-only** audit; isolated PostgreSQL migration rehearsals pass | **Blocked:** production historical ledger reconciliation, compatibility review, backup/restore proof, and separate explicit approval before changing production grants |
| Release safety | Branch-specific CI; draft PR; production untouched | Independent application security review, staging full E2E evidence, rollback and release owner signoff remain required |

## Phase 2 — scanner accuracy and independent evidence

| Gate | Evidence | State and remaining action |
| --- | --- | --- |
| Core/extended scanner and adversarial contracts | Phase 1+2 CI, SQL function body parsing, chart CSS contextual classification, weak_random fixes, role-self-promotion candidate | Implemented and regression-tested; continue missed-class analysis and ensure production/staging reporting parity |
| Pinned real-world source collection | 30 pinned public repositories and 22 frozen app subsets collected/scanned as source-only metadata (no external code executed) | **Evidence collected but findings remain unreviewed** |
| Verified precision/recall and severity | Scorer and review schema are tested; anti-fabrication gates refuse to convert synthetic/AI notes to human ground truth | **Blocked:** independent human TP/FP/uncertain labels, source-level FN target review, consistent adjudication, severity/business-context assessment |
| Comparators and external security review | Experimental synthetic and source-only scanner comparisons | Informational only; CodeQL/Semgrep differences are not human labels. Re-run source-frozen comparisons only with provenance and accuracy limits disclosed |
| Release certification | Human approval gate requires genuine independent reviewer qualifications and owner signoff | No independent accuracy certification, no public benchmark claim and no Phase 2 production release approval |

## Provisional planning assessment (not a measured metric)

Phase 1 approximately **75–80% complete** in engineering / restricted staging terms; **20–25% remains** plus external production authorization. Phase 2 approximately **55–60% complete** in implementation/evidence-pipeline terms; **40–45% remains**, primarily independently verified accuracy work. These are subjective completion estimates, **not** precision, recall, test coverage, or a deployment guarantee.

## Next safely executable tasks

1. Finish fail-closed billing expiration regression on the feature branch; pass full CI before any staging deployment.
2. Run signed synthetic webhook and authentication/sync mock HTTP tests that cover activation, duplicate events, cancellation and missing/expired paid-through date; never use production payment keys.
3. Obtain human-performed test-mode checkout and signed webhook evidence from Dodo sandbox; verify entitlement and cancellation from **read-only staging** audit queries without copying customer/token payloads.
4. Freeze 30-source benchmark outputs and source selections, arrange independent human review for all findings and a curated missed-vulnerability target set. Produce precision/recall only when ground truth exists.
5. Independently review production migration compatibility and safe rollback, then request a **separate production approval**. Do not change production in this PR.

This checkpoint supplements the original runbook and PR narrative; it does not silently waive any gate.
