> **Latest Beta.6 package qualification (28 November 2026):** package source `a0651317c1cb16170d563867adcf5ddff08d5927` passed [three-OS Actions run #46169706820](https://github.com/Darkhero766/Vibeguard/actions/runs/46169706820) on Windows, macOS and Ubuntu/Linux: **479/479 regression tests per OS**, zero failed/cancelled/skipped tests, all qualification steps passed, and identical 33-file package-content SHA-256 `2a0405717fd3a8873e74eded393de73a286c70fd71a2626c24cab841cc7a95fa`. Reports say `validation_passed_review_required` / `candidate_for_independent_human_review`; this is automated synthetic-fixture evidence, not independent security review, real-host acceptance or launch approval. Current PR #70 head at the last audit was `68f06d84865fdd17c2677d64a4821263efee5cce`, four commits beyond the qualified package source; those commits change only the Foxy website page, SEO generation and associated assertions, not the packaged Foxy runtime. The four newer website/SEO files have not been requalified at the latest PR head.

# Claude independent security review brief — Foxy beta.6

**Current PR head to inspect:** `68f06d84865fdd17c2677d64a4821263efee5cce` ([PR #70](https://github.com/Darkhero766/Vibeguard/pull/70))  
**Qualified Foxy package source:** `a0651317c1cb16170d563867adcf5ddff08d5927` ([three-OS run #46169706820](https://github.com/Darkhero766/Vibeguard/actions/runs/46169706820))  
**Package:** `@vibesane/foxy@0.7.0-beta.6` (unpublished local candidate); 33 files; content SHA-256 `2a0405717fd3a8873e74eded393de73a286c70fd71a2626c24cab841cc7a95fa`  
**CI evidence:** Windows, macOS and Ubuntu/Linux each passed 479/479 regression tests with no failed qualification steps.  
**Review status:** no independent-party sign-off is recorded.

## Instructions to the reviewer

You are acting as an independent product-security reviewer. Do not assume this candidate is safe because the CI is green or the maintainer packet says a defect was fixed. Inspect the actual source at the exact commit SHA above. Challenge both the implementation and the assumptions in its documentation.

**Do not edit, commit, merge, rebase, publish, deploy or change the candidate during the review.** Do not run the code against production repositories, customer data, real credentials or external services. Use a clean checkout and disposable synthetic Git repositories. If a suspected issue requires a dangerous action, describe the reproduction safely rather than executing it.

Read `docs/AGENTSHIELD_INDEPENDENT_REVIEW_PACKET.md`, `docs/FOXY_DAY1_DAY2_HANDOFF.md`, `docs/FOXY_CODEX_CODESPACES_PILOT.md` and `docs/FOXY_REAL_HOST_ACCEPTANCE_RUNBOOK.md`. Treat all author statements, tests and benchmark labels as hypotheses to validate. A test name or green workflow is not proof that its claimed invariant is actually tested.

## Required review scope

1. **Workspace authorization:** process-level allowlist parsing; canonical-root resolution and startup pinning; deletion/replacement after startup; first-call replacement; symlink retargeting; path traversal; sibling-prefix confusion; nested repositories and Git worktrees; case folding on Windows; duplicate/aliased roots; unauthorized workspace switching; environment/config races.
2. **Filesystem and scanner boundaries:** symlink/junction escape; non-regular files; file identity changes between lstat/open/read; TOCTOU windows; UTF-8 byte limits; file count/size/time/output bounds; ignored and unsupported file semantics; deleted/renamed files; Git status and committed-diff completeness.
3. **Scanner trust and accuracy:** source parsing, detector assumptions, false-positive/false-negative exposure, Python heuristics, SQL/auth/RLS rules, analyzer timeouts, malformed JSON, nonzero exits with valid JSON, exit code 2, zero/partial coverage, secret/output redaction, and whether any source content leaves the local process.
4. **MCP protocol and tool surface:** SDK/stdio framing, protocol negotiation, fragmented/concatenated frames, UTF-8 byte lengths, malformed or duplicate headers, JSON-RPC validation, request/notification semantics, missing IDs, invalid params, unexpected methods, cancellation, stderr/stdout separation, output size, error handling, accurate read-only annotations, and whether any tool can invoke shell, arbitrary code or writes to the repository.
5. **Baselines and provenance:** runtime fingerprint completeness, installed bundled MCP entrypoint inclusion, fingerprint freshness after package/runtime changes, baseline expiry, restart restoration, content identity, workspace switching, stale/mixed package state, and verification behavior after edits/commits.
6. **SQLite queue and migration:** WAL initialization, transaction boundaries, global concurrency cap, simultaneous claims, worker registration, heartbeat/lease expiry, stale-worker recovery, queue limits/backpressure, idempotency aliases and key reuse, cross-process cancellation, cancellation/completion races, abrupt process death, corrupt payload recovery, index/payload mismatch, SQLite identity and permissions, network/cloud filesystem refusal, Beta.4 migration root filtering, symlink/junction escapes, stale/live lock handling, downgrade marker and recovery.
7. **Controller and completion controls:** corrupt/unsupported session state, schema validation, lock-owner metadata and PID reuse, same-host/foreign-host behavior, ownership token and directory identity, lock cleanup failures, bounded attempts/time budgets, pruning, retention, verification lost-update races, bounded event history, UTF-8 stdin limits, disabled policy, missing base refs, moving bases, unsupported changed paths, incomplete scans, repeated Stop events, host response contracts and ways the host/user can bypass or disable the hooks.
8. **Codex host integration:** generated project `.codex/config.toml`, `.codex/hooks.json`, project trust and hook trust hashes, absolute Node/server paths, MCP environment allowlist, job namespace isolation, Codespaces behavior and safe uninstall. Distinguish MCP registration from Stop-hook installation. A successful stdio smoke test is not a successful live Codex test.
9. **Cross-platform connector writes:** Codex TOML, Claude/Copilot workspace `.mcp.json`, Cursor, Gemini and Roo destinations; exact managed-entry recognition; preservation of unrelated settings; backup byte identity; stale/customized/malformed config refusal; sidecar lock ownership and cleanup; interrupted writes; Windows path and executable discovery; race with non-Foxy editors.
10. **Package and supply chain:** lockfile and package versions, dependency provenance/licenses, lifecycle scripts, offline install behavior, package content manifest, per-file digests, package archive differences, entrypoint integrity, upgrade/downgrade behavior and whether the README/installed package accurately reflects the tested runtime.
11. **Benchmark and claims quality:** verify curated/holdout/adversarial labels, targets and off-target logic. These are synthetic rule-expectation cases, not exploit proofs or empirical production precision/recall. Identify unsupported claims in marketing or docs.
12. **Release and operational readiness:** PR stack, base divergence, support/rollback, local queue backup/retention, disk-full/corruption response, privacy and diagnostic handling, missing platform/host acceptance.

## Known historical review context — verify independently

A 22 November PR #67 conversation comment by the repository maintainer described five blocking concerns: scan-cache invalidation when a dirty file changes without a Git status-shape change; lack of subprocess MCP transport tests; incomplete JSON-RPC request/notification validation; missing workspace-mutation/race and scanner-failure tests; and unexecuted tests. Current code and tests claim to address parts of this list. Reproduce the relevant boundaries and confirm the tests actually assert the security property.

Older repository notes refer to a separate “11 findings” evidence set, but that separate artifact was not located in the current repository tree, PR comments or issue search. Do not invent or infer those 11 items. Record that historical evidence as unavailable and conduct an independent review from the source.

## Current candidate’s recent hardening claims to verify

- Lock owner record binds PID, hostname, creation time and a random token. Malformed, legacy and foreign-host records do not justify automatic lock reclamation; lock directory identity and token are checked before cleanup.
- Explicit-session `verify` acquires the state lock and uses the latest locked state after scan, instead of writing a pre-lock snapshot.
- Existing state documents that are corrupt/incompatible or structurally invalid result in UNKNOWN instead of silently resetting state and retry budgets.
- Controller event-history writes all pass through a 16-entry bounded append helper.
- Hook stdin is capped at 128,000 UTF-8 bytes and is destroyed after the limit is crossed.
- MCP runtime provenance fingerprints the packaged bundled stdio entrypoint as well as the scanner runtime.
- Connector config mutations serialize Foxy writers, verify ownership and compare original bytes before replacing the target.

For each claim, find the exact current source lines, inspect adjacent error paths, construct at least one counterexample attempt, and decide whether the claimed invariant truly holds. Do not merely restate the tests.

## Exact-source automated evidence — context, not certification

The Windows `win32 x64` and macOS `darwin arm64` artifacts for the exact SHA above each report:
- 462/462 regression tests; zero failed/cancelled/skipped.
- 8/8 qualification stages passed.
- 53/53 source syntax/check files passed.
- 10 MCP tools discovered; a synthetic 12-file scan and cancellation exercised.
- 29 package files with matching per-file digest manifest and canonical package-content SHA-256:

`b4ab8da681923e558184b3f156c05a29d6057cc03125d7d91803323ec5793cdd`

- Release decision `candidate_for_independent_human_review`, not approval.

The benchmark corpus reported 120 curated cases, 24 holdout cases and 30 additional synthetic adversarial cases. The benchmark authors explicitly limit these labels to target-rule expectations. Do not extrapolate them to application-wide security.

## Required reviewer report

Return one report, not code changes. For every finding include:

| Field | Required detail |
|---|---|
| ID | Stable identifier |
| Severity | Critical / High / Medium / Low / Informational |
| Confidence | High / Medium / Low, with rationale |
| Exact location | File path and line range on the reviewed SHA |
| Preconditions | What access/configuration/state is required |
| Exploit or failure scenario | Concrete attacker/operator sequence |
| Reproduction | Disposable fixture and exact commands/tool calls |
| Expected vs observed | What should happen and what happened |
| Impact | Confidentiality, integrity, availability or false assurance |
| Recommended fix | Smallest defensible remediation |
| Regression | Deterministic test that would fail before the fix |
| Status | Confirmed / not reproduced / unverifiable |
| Residual risk | What remains even after a proposed fix |

Also provide:
- Areas reviewed and areas not reviewed.
- Files/commits actually inspected.
- Commands executed, environment versions and test output (include failures).
- Any assumptions that could not be tested without actual Codex/Claude hosts or Windows machines.
- A separate list of documentation/marketing claims that overstate evidence.
- A prioritized release recommendation. Clearly state whether any Critical or High finding remains.
- A final binary conclusion: `DO NOT DISTRIBUTE`, `CONDITIONAL PRIVATE PILOT ONLY`, or `READY FOR OWNER RELEASE DECISION`. Do not use “certified secure”.

## Review boundary and handback

Do not push fixes. First return the full report for owner review. If a finding is confirmed, preserve its reproduction and affected lines so it can be fixed in a separate reviewed commit and requalified on both platforms. The PR must remain draft/open/unmerged during this review. No production changes, package publication or deployments are authorized.


## Current review target clarification — 28 November 2026

Review the source tree at exact code SHA `3ec649c01506ae077639595794fd0b0cc445db04`; the current PR branch has later documentation-only commits. The source-matched [qualification run #46137576745](https://github.com/Darkhero766/Vibeguard/actions/runs/46137576745) passed on Windows, macOS and Ubuntu/Linux. Its synthetic tests and benchmark evidence are not a substitute for your independent reproduction.

The package is `@vibesane/foxy@0.7.0-beta.6`, 33 files, package-content SHA-256 `f60677328e0c5eb2de94ec4ae44598e973c198e62f15ad4156b061bd6ed42c14`, and remains unpublished. The intended beta registry bootstrap after separate owner approval is `npx @vibesane/foxy@beta install`; do not treat that as currently available.

In addition to the original areas below, inspect the new consent-first universal installer and package path: agent detection for Claude/Codex/Cursor/Gemini/Roo/Copilot, generic MCP fallback, canonical Git root handling, exact target previews, consent boundaries, no-write dry-run, connector lock/snapshot semantics, post-write verification, rollback and ambiguous outcomes, and the Windows executable shim. Check that the README and package evidence describe the same tested source and do not overstate host acceptance.

Keep this review strictly read-only. PR #70 must remain draft/open/unmerged; do not publish, merge, rebase, deploy or modify the candidate. No real credentials, customer repositories or production services.


## Final Beta.6 review target — 28 November 2026

The latest qualified source is `e6ab2fcfd373f3473bc6d282eabebfcc105db2c6`; [workflow #46167652859](https://github.com/Darkhero766/Vibeguard/actions/runs/46167652859) passed on Windows, macOS and Ubuntu/Linux. Each OS passed 477/477 regression tests per OS, 30 package files and identical package-content SHA-256 `39bb5a4893f49c2a035454bb9ac063eb09e41b5a05a826621558bd2280818b98`. The package remains unpublished.

Inspect the new concurrent SQLite initialization fix in agentshield-jobs-store.mjs: application identity, schema-object inspection, quick-check and first-time application-ID assignment now occur in an immediate transaction, preventing a stale application-ID read from being combined with another process's newly created tables. Reproduce the two-process first-open race and ensure unrelated non-empty SQLite databases are still refused without persistent changes.

Also inspect the website Install MCP panel and the static/no-JavaScript SEO preview. The beta command copy action must remain disabled unless the explicit public build flag VITE_FOXY_BETA_INSTALL_ENABLED=true is set after owner-approved publication/provenance review. The website must not imply it can install or write local host configuration; the CLI still shows the target plan and requires user consent. Check focus/disabled/status accessibility and confirm no lifecycle hook or completion gate is silently enabled.

Keep this review read-only. PR #70 remains draft/open/unmerged; no package publication or production deployment is authorized.
