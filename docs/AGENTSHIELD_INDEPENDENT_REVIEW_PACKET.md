# AgentShield independent security review packet

**Purpose:** supply an independent reviewer with the implementation and adversarial evidence needed to form their own findings. This is not a completed review and contains no requested conclusion.

## Review request

Review the candidate commit as a security engineer. Do not assume it is ready, and do not limit the review to the existing tests. Attempt to reproduce suspected failures safely using disposable synthetic repositories. For every finding, provide severity (Critical/High/Medium/Low/Informational), file and line, exploit scenario, reproducible evidence, recommended fix, confidence, and what you could not verify. Explicitly assess the 20 areas in the beta task: MCP authorization bypass, traversal, symlink escape, identity/switching, scanner evasion and false results, verification, completion-gate bypass/fail-open, timeouts, JSON-RPC validation, output/credential safety, baseline integrity, races, supply chain, installation, and missing adversarial tests.

## Primary implementation paths

- `artifacts/api-server/scripts/agentshield-mcp-server.mjs` — stdio MCP protocol, tool schemas, canonical workspace authorization, scan and verification orchestration, output validation.
- `artifacts/api-server/scripts/agentshield-baselines.mjs` — scan baseline storage and identity.
- `artifacts/api-server/scripts/agentshield-gate.mjs`, `agentshield-controller.mjs`, `agentshield-codex-stop.mjs`, `agentshield-stop.mjs`, `agentshield-hook.mjs` — completion policy and host adapters.
- `artifacts/api-server/scripts/agentshield-cli.mjs`, `vibesane.mjs`, `agentshield-install.mjs`, `agentshield-connect.mjs`, `agentshield-universal-install.mjs` — CLI, diagnostics, package hook installation, removal, cross-host MCP configuration and the consent-first universal installer.
- `artifacts/api-server/src/lib/apiScanner.ts`, `extendedScanner.ts`, `extendedScannerV2.ts`, `apiScanner*.ts` — detector implementation.
- `artifacts/api-server/scripts/package-agentshield-beta.mjs` and `artifacts/api-server/package.json` — local package construction and package entry points.
- `artifacts/api-server/scripts/test-agentshield-adversarial.mjs`, `test-agentshield-mcp.mjs`, `test-agentshield-package.mjs`, `test-agentshield-connect.mjs`, `test-agentshield-gate.mjs`, benchmark corpora and `validate-agentshield-release.mjs` — tests and qualification.

Read the relevant current-commit diffs, the authorization regression tests, and the previous security findings below. Treat current tests and benchmark labels as claims to validate, not proof.

## Prior findings to independently recheck

An earlier review found that a client-supplied workspace could access a repository outside the intended authorized root. The current implementation adds a required process-level JSON allowlist, canonicalizes both allowlist and caller paths, authorizes repository roots only under those canonical roots, pins configured-root filesystem identity after resolution, rejects inaccessible/missing authorization configuration, and binds baselines to canonical workspace identity. Adversarial tests claim to cover root replacement, nested repositories/worktrees, sibling-prefix paths, traversal, symlinks, switching, and cross-workspace baselines. Independently test deletion after startup, replacement before/after first authorization, root symlink retargeting, duplicate and aliased roots, casing on case-insensitive filesystems, and concurrent environment/config changes.

The local host hook is a bounded continuation control, not a tamper-proof gate. Assess whether a coding agent or user can reach a clean result after an incomplete scan, invalid/moving base ref, unsupported path, timeout, hook recursion, disabled policy, or exhausted repair budget. Confirm semantics against actual host versions where possible.

## Additional issue found during maintainer verification

Before the latest candidate change, a synthetic reproduction replaced a configured allowlist directory after the MCP process started but before its first workspace request. The replacement repository was then authorized because identity pinning began on first use. The candidate now resolves and pins valid configured roots before accepting requests, and an adversarial test starts the actual local server, replaces the root before the first workspace call, and expects denial. Independently reproduce this boundary and review the startup ordering; do not rely on the regression test alone.

## Exact-source cross-platform qualification evidence (2026-11-27)

The beta.5 candidate source revision `a777754de234ed2e469cd9822ad4a1f5f881e095` was qualified by workflow run [#46055587747](https://github.com/Darkhero766/Vibeguard/actions/runs/46055587747). Windows and macOS jobs both completed successfully on that exact SHA.

Reported evidence for each OS:
- 453/453 regression tests passed.
- TypeScript workspace build, frontend/API typechecks, web and standalone preview builds, and cross-platform connector regressions passed.
- MCP STDIO integration/protocol smoke passed; ten tools discovered and exercised.
- Curated 120-case, holdout 24-case, and adversarial 30-case synthetic benchmarks met their configured thresholds.
- Offline package install, CLI/doctor/connect/disconnect and package MCP smoke passed.
- Canonical package-content manifest matched across platforms (SHA-256 `7e65e968cbea7f9396148cdb3cfa6483efbf492aba4bf899ac675036812c401a`), 29 files.

This evidence applies **only** to SHA `a777754...`. PR #70's later head `6668071...` is seven documentation-only commits ahead of that tested SHA (README, readiness checklist, and engineering-state documentation). Confirm those exact docs-only changes and rerun qualification on the final release candidate before distribution. The workflow does not constitute independent security review or real installed-host acceptance.

## Cross-platform and auto-connect review delta

The separate branch `feat/agentshield-cross-platform-autoconnect` adds a candidate one-command connector and Windows portability work. The reviewer should inspect the branch diff against PR #69's head and specifically test:

- Project Git-root resolution and exact per-project `VIBESANE_ALLOWED_ROOTS_JSON` scope.
- Host configuration writes to Claude `.mcp.json`, Codex `.codex/config.toml`, and Cursor `.cursor/mcp.json`; preservation of unrelated entries; backups; idempotence; and refusal on malformed, customized or symlinked configuration.
- Windows path quoting, drive-letter and case normalization, junction handling, `PATHEXT` discovery, Node executable path handling, child-process environment, and cleanup on interrupted writes.
- Codex project configuration trust requirements and the actual Windows behavior of command hooks.
- Generic `--agent mcp` output against a second independent MCP stdio client.

A generic MCP entry is only a fallback for hosts that implement MCP stdio; it does not provide a universal adapter to non-MCP agents. Auto-connect configures MCP only. It does not install lifecycle hooks, change host permissions or guarantee agent completion behavior.

The branch adds a Windows/macOS GitHub Actions qualification workflow, but at the time this packet was updated that workflow had not been run. Do not count the new tests, CI definition or Windows-specific code as passing evidence until the exact candidate workflow artifacts and, separately, real host sessions have been reviewed. The package candidate is `0.7.0-beta.4`; prior beta.3 reports are historical only.

## Safe review setup

Use a clean checkout of the exact candidate commit and synthetic Git repositories in a disposable directory. Do not use customer code, real credential material, production services, or destructive actions. Do not publish packages or invoke CI. Avoid copying credentials or private source into prompts. If the reviewer needs a live coding agent, use only its approved normal test account and synthetic content.

Run the local test/qualification commands documented in `docs/AGENTSHIELD_BETA_BENCHMARK_AND_RELEASE_GATE.md`. Preserve exact stdout/stderr, exit codes, commit, platform and package SHA-256 in the review result. Do not change tests, corpus labels, thresholds or blocker behavior during review.

## Evidence provided by this candidate

- `artifacts/api-server/agentshield-beta/qualification-report-2026-11-24.json` is the preserved qualification evidence; its `gitRevision` should match the source candidate being reviewed.
- Actual Codex CLI MCP, authorization-boundary, remediation, and Stop-hook results are recorded in `docs/AGENTSHIELD_BETA_READINESS_EVIDENCE.md`. They apply only to the recorded client version, Linux x64, and synthetic scenarios.
- Claude Code was not available in the maintainer environment during this review preparation. No Claude verdict is claimed.

## Validation delta for revision 631057ba82161827156c20675ee326a7e9c8c2dc

Treat the earlier `ab51b79...` qualification report and Codex acceptance notes as historical evidence for that exact revision and package checksum only. A fresh release-qualification attempt on `631057ba82161827156c20675ee326a7e9c8c2dc` rebuilt the scanner but ended `not_qualified`. In this managed sandbox, tests that spawn Node children through pipes receive empty child stdout; the MCP `scan_changed` call consequently returned `Scanner returned malformed JSON.` A direct CLI scan worked and returned `partial_coverage`. The current actual VibeSane changed-file scan is documented in [`REAL_REPOSITORY_SCAN_2026-11-24.md`](../artifacts/api-server/agentshield-beta/REAL_REPOSITORY_SCAN_2026-11-24.md). Do not treat the earlier Codex client run as a host run on this revision.

Current-attempt evidence: source syntax and scanner build passed; the full TAP run covering 23 test files reported 10 files passed and 13 failed (process-level child stdout/transport failures were observed; individual affected tests need reproduction outside this sandbox); MCP’s direct test file reported 20/24 cases passed and 4 failed; current curated and holdout benchmark scripts could not capture child scanner JSON; the in-process adversarial corpus passed 30 synthetic cases (16 TP, 14 TN, 0 FP, 0 FN; 463 ms measured). Package install smoke did not pass in the qualification runner. These are not release-qualification results.

The package source version remains `0.7.0-beta.3`. Current source HEAD is not qualified by the attempted run. The exact relevant change set can be generated for independent inspection with:

```sh
git diff --find-renames 56222e39d30b7f5280eaacac99c28c34c10a45b0..631057ba82161827156c20675ee326a7e9c8c2dc
```

## Required reviewer report format

For each finding:

```text
ID / severity / confidence:
Title:
Affected files and lines:
Exploit scenario and preconditions:
Reproduction and observed result:
Impact:
Recommended fix:
Regression test:
What remains unverified:
```

Close with an explicit list of reviewed areas, areas not verifiable, and whether any Critical or High issue remains. A reviewer may disagree with the candidate's qualification evidence.


## Superseding cross-platform qualification evidence — 26 November 2026

The earlier note above stating that the cross-platform workflow had not run is superseded for PR #70's exact candidate:

- PR #70 head: `a9b4fc87fa202a0aaeab60f43ed6ec361e5ec01c`.
- GitHub Actions run [45861790387](https://github.com/Darkhero766/Vibeguard/actions/runs/45861790387), run #75: completed successfully.
- Windows: 429/429 release-qualification tests and 12/12 connector regression tests passed.
- macOS: 429/429 release-qualification tests and 12/12 connector regression tests passed.
- Web/standalone preview build and no-JavaScript preview checks passed.
- Both platform validators reported `validation_passed_review_required`.

This closes the **automated cross-platform CI** evidence gap for that precise SHA only. It does not close the actual installed-host acceptance matrix, independent security review, package provenance review, the separate 11-finding evidence review, or owner approval. The review packet itself remains a request for independent scrutiny, not a completed review.

PR #69 subsequently advanced to `b98f0a8bea4d50a67d1bb9c0caae5bc1801e1cb8` and its official MCP conformance job is being re-run with improved failure diagnostics. PR #70's reported base SHA remains `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`; verify and reconcile this stacked dependency against the live #69 branch before any merge proposal.


## Additional storage-integrity review delta — 27 November 2026

**Candidate implementation commit:** `a1d9865a32f9cd0840513086533d92c8e5d1ae3d` (source changes on PR #70's existing feature branch).

A source-level review of the beta.5 SQLite queue found two failure-path weaknesses. The candidate now contains fixes and regression cases; they have **not yet been executed or source-matched CI-qualified**:

1. **Database ownership mutation order.** The previous initialization sequence enabled persistent WAL mode and tightened POSIX file permissions before checking SQLite's Foxy application ID. A pre-existing unrelated SQLite file at the configured path could therefore be modified before the queue rejected its identity. Initialization now checks the application ID, rejects a non-empty unowned schema, and runs SQLite integrity validation before claiming an empty database, tightening file permissions, or enabling WAL. New regression cases assert that rejected foreign/unowned files retain their original DELETE journal mode, schema and POSIX permissions.
2. **Corrupt active payload during graceful shutdown.** The stale-lease recovery path already reconstructed a minimal UNKNOWN record from indexed columns, but graceful `unregisterWorker()` previously parsed active payload JSON without that recovery. Corrupt persisted data could abort shutdown cleanup before the worker row was removed. Graceful shutdown now validates payload/index agreement, reconstructs an interrupted/UNKNOWN record from indexed columns on corruption, and releases the worker in the same transaction. A regression test checks UNKNOWN status and confirms the worker slot is released.

The queue test file now defines 39 test cases. This is a source count, not a passing count. Reviewers should independently inspect the transaction boundaries, descriptor/path identity assumptions, foreign-database fixtures, corrupt-payload fallback, and the exact package contents.

No database migration, package publication, CI dispatch, production change, or PR merge was performed by this review. The beta.4 run #75 remains historical evidence for its exact older SHA only.

## Release-validator and test-quality review delta — 27 November 2026

The beta.5 candidate had two further source-review findings, both corrected on the PR #70 branch; neither has executed CI evidence yet:

1. The release validator still expected package version 0.7.0-beta.4 while the package smoke test and package builder already emitted 0.7.0-beta.5. It now imports the builder's exported PACKAGE_VERSION and uses it for both package evidence validation and the qualification report. A package smoke regression asserts the validator derives its version from that source and contains no stale beta.4 literal.
2. The first corrupt-shutdown regression allowed the worker's normal finish path to overwrite the malformed payload before shutdown cleanup. The fixture now makes that persistence attempt return false, forcing unregisterWorker() to execute its indexed-column recovery path; it asserts UNKNOWN/interrupted state and worker-row release.

The current queue test file defines 39 cases. These are definitions only. Run them on the exact candidate; do not describe the shutdown-recovery test as passing until CI reports it.


## Website source-of-truth and contrast review delta — 27 November 2026

- The current scanner catalog contains 54 rules (11 core + 43 extended). The public scan and GitHub webhook routes both publish `TOTAL_SECURITY_CHECKS` as `checksRun`.
- The homepage, public report, dashboard and animated console were aligned to 54. A source regression now parses the catalog and checks the displayed count.
- The global accent now resolves to the lime token. Clean-result, upgrade, signed-in dashboard clean panels and the lime CTA use explicit dark foregrounds. Test guards check the theme token pair and mixed-surface contrast classes.
- AgentShield's React page and prerendered SEO page now state Node.js 24.15.0+, distinguish runtime targets from the Windows/macOS automated matrix, and link to the current beta.5 install guide.
- Latest code candidate: `4dec4fb27a9070127904e3c29ece476dad3ad2a4`. These are source/documentation assertions; no browser build or screenshot QA has run.


## MCP runtime-provenance hardening delta — 28 November 2026

**Initial implementation commit:** `089c2ac60d5679c71dde4ef1fe0dd3d1f23177a1` on PR #70. Follow-up fixes: `e3edce0e880c074b00030e418eb1df568a00c960` and `65cd27b474db7863e1795a7d4dd59d44045e7177`. The current qualified code candidate is `8ff17de5c5f9ce788e3447ae47263c77136cc3db`; the earlier six-module inventory below is historical and was subsequently extended to include the installed bundled STDIO entrypoint.

The queue's persisted remediation-baseline context previously compared the standalone scanner artifact fingerprint, ruleset/version string and report-schema version. The candidate adds a required `runtimeFingerprint` computed from the exact bytes of these packaged modules:

- `agentshield-mcp-server.mjs`
- `agentshield-mcp-sdk.mjs`
- `agentshield-jobs.mjs`
- `agentshield-jobs-store.mjs`
- `agentshield-baselines.mjs`
- `agentshield-version.mjs`

The fingerprint uses stable relative module names and SHA-256 over each module's bytes; file descriptors are checked for regular-file type, bounded size and before/after identity/metadata consistency. Both the in-memory baseline validator and persistent queue validator require and compare the new fingerprint. A missing legacy field is rejected; a valid but different runtime fingerprint makes a persisted baseline stale and prevents its `scan_id` from being returned as usable. The previous scan's bounded finding history remains queryable, but remediation verification must start from a fresh scan.

Regression coverage was added/extended in `test-agentshield-baselines.mjs`, `test-agentshield-jobs.mjs` and `test-agentshield-mcp.mjs`, including provenance generation, missing-field rejection and cross-restart runtime-drift invalidation.

**Qualification chronology:** run [#46108972740](https://github.com/Darkhero766/Vibeguard/actions/runs/46108972740) on the initial commit `089c2ac...` returned `not_qualified`: 451/454 regression tests passed and MCP STDIO integration smoke failed. Diagnosis showed that `BaselineStore.restore()` dropped the runtime fingerprint, the async changed-scan context did not carry it, and one queue test referenced a block-scoped job ID. Follow-up commits `e3edce0...` and `65cd27b...` fix these exact issues while retaining strict validation. The current exact-source Windows/macOS run [#46109329318](https://github.com/Darkhero766/Vibeguard/actions/runs/46109329318) on `65cd27b...` was still in progress when this packet update was prepared. Do not treat the current tests as passed until both jobs complete. The old passing run #46055587747 applies only to `a777754...`.

**Independent reviewer tasks:** confirm that the six-file inventory covers every module that can change workspace authorization, scan orchestration, baseline interpretation or queue restoration; inspect package inclusion and fstat checks; reproduce both runtime-drift and missing-provenance behavior; inspect whether a partial package update can result in a mixed runtime; and confirm a stale baseline never becomes a clean or verifiable result.


## 28 November 2026 — current candidate status override

This section supersedes older candidate-SHA and in-progress-status notes earlier in this document.

- **Current code candidate:** `8ff17de5c5f9ce788e3447ae47263c77136cc3db`.
- **Exact-source Windows/macOS qualification:** [run #46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971) passed on both platforms, 454/454 tests per OS; review status remains required.
- **Current PR state:** PR #70 remains draft, open and unmerged. No production deployment or package publication was performed.
- **Earlier source results:** `a777754...` passed the prior 453/453-per-platform run #46055587747. Runtime-provenance candidate `089c2ac...` failed its source-matched run #46108972740 due to missing provenance propagation and a test-scope issue; follow-up commits fixed those. Candidate `65cd27b...` passed macOS but failed Windows at 453/454 in run #46109329318 due to a concurrent SQLite WAL-initialization lock. These failures remain part of the qualification history.
- **Latest fixes:** commit `24e08b1...` adds the installed bundled `agentshield-mcp-stdio.mjs` executable to the MCP runtime fingerprint. Commit `8ff17de...` adds bounded retries only for SQLite BUSY/LOCKED during WAL initialization, then restores the normal busy timeout. It still refuses any journal mode other than WAL.


The current independent review scope also includes the Windows WAL startup retry and the installed bundled STDIO fingerprint. Reproduce the one-process-versus-two-process initialization race, verify no weaker SQLite mode is accepted, confirm timeout behavior is UNKNOWN/fail-closed, and verify that changing the bundled entrypoint invalidates persisted baseline provenance after restart. The review packet is a request for review, not a completed independent review.


## Final exact-source qualification evidence — 28 November 2026

**Current code source:** `8ff17de5c5f9ce788e3447ae47263c77136cc3db`  
**Windows/macOS run:** [#46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971) — both jobs completed successfully.  
**Tests:** 454/454 on Windows and 454/454 on macOS; zero failed, cancelled or skipped tests. Both validation reports are `validation_passed_review_required`, with `candidate_for_independent_human_review` as the release decision.  
**Package:** 29 files on each OS; same per-file SHA-256 map and aggregate content digest `42d5d09d7a5473020b0e7706f0a3bcf07172180db657a9c85c1aa663cb3571e6`. [Windows artifact](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971/artifacts/15249631042) · [macOS artifact](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971/artifacts/15249481163).

The latest source also contains the bundled installed STDIO entrypoint in its MCP runtime fingerprint and the bounded fail-closed SQLite WAL initialization retry. The earlier Windows two-process initialization race no longer reproduces in the exact-source run; all 454 tests passed. The reports specify synthetic fixtures only and `productionTouched: false`.

**Do not treat automated qualification as the independent review.** Independently reproduce the baseline runtime-drift invalidation, bundled-entrypoint fingerprint behavior, WAL retry/exhaustion path, SQLite ownership and migration invariants, root pinning/TOCTOU boundaries, host configuration preservation, and real host tool discovery/approval. The previous 11-finding evidence set still requires reviewer-by-reviewer disposition and signed residual-risk assessment.


## Host configuration write-race review delta — 28 November 2026

Static review identified a lost-update window: the connector previously read a host config, created a backup and renamed a replacement without serializing concurrent Foxy writers or comparing the current target with the originally-read content. The candidate adds:
- Exclusive per-target \`.agentshield.lock\` sidecars for connect/disconnect.
- PID/host/timestamp/random-token lock metadata, inode verification and ownership-checked release.
- No automatic stale-lock deletion; operator inspection is required.
- Backups that must byte-match the content snapshot consumed by the configuration merge.
- An immediate pre-rename reread and byte comparison; changed or newly appeared/disappeared targets fail closed.

Regression coverage now tests that pre-existing lock files block JSON and Codex mutations, stale lock contents are not changed/deleted, config bytes remain untouched on refusal, and owned locks are removed after successful connect/disconnect.

**Current source candidate:** \`6270f43ddbbd80a8cf21d3afae2e6c8901a685c8\` plus the test/documentation commit following it. This connector hardening has not yet been exact-source requalified at the time of this note. The pre-existing independent limitations remain: no real Claude/Cursor sessions are available in this environment, prior Codex evidence applies only to an older package/SHA, and the referenced 11-finding evidence packet is not present in the repository. Do not present this source review as an external independent-review sign-off.


## Superseding exact-source review handoff — 28 November 2026

This is the current candidate override. Historical entries above remain useful for chronology but refer to earlier SHAs and must not be used as evidence for the present code.

**Exact source:** `f8d2bafbeaac4811f740cc1bbf089385f6e8d0e5`  
**Package:** `0.7.0-beta.5`  
**Windows/macOS run:** [#46114784990](https://github.com/Darkhero766/Vibeguard/actions/runs/46114784990)  
**PR:** [#70](https://github.com/Darkhero766/Vibeguard/pull/70), still draft/open/unmerged; no review submissions or inline review threads at the latest check.

The exact-source artifacts for win32 x64 and darwin arm64 both record Node.js v24.15.0, 462/462 regression tests, zero failed/cancelled/skipped, eight passed qualification stages, 53 passed source checks, 10 tools in MCP smoke, and 29 packaged files. Both files have identical per-file path/byte-count/SHA-256 records and canonical package-content SHA-256:

`b4ab8da681923e558184b3f156c05a29d6057cc03125d7d91803323ec5793cdd`

Both release reports are `validation_passed_review_required` with release decision `candidate_for_independent_human_review`. They record `productionTouched: false` and `syntheticFixturesOnly: true`. This is automated qualification, not a third-party audit, host acceptance or production approval.

### Source-level hardening since the earlier candidate notes

Review the actual code, not just this summary:

- `agentshield-controller.mjs`: same-host/PID/token lock owner records; conservative lock reclamation; path/inode identity checks; bounded 128,000-byte UTF-8 hook input; explicit-session verify reads state under lock; invalid/incompatible persisted state yields UNKNOWN; all event-history appends are capped at 16.
- `test-agentshield-week2.mjs` and `test-agentshield-week3.mjs`: regression tests for malformed and legacy locks, stale-lock owner proof, verification state race, UTF-8 byte cap, incompatible state and bounded history.
- `agentshield-connect.mjs`: cross-host config lock, exact snapshot backup, content compare, lock ownership and refusal on ambiguous locks.
- `agentshield-baselines.mjs` / MCP runtime: exact scanner + packaged MCP entrypoint provenance, with stale/missing provenance failing closed.
- SQLite queue: transactional state/index integrity, bounded retry on BUSY/LOCKED initialization, multi-process claim/lease/cancel/idempotency and interrupted/UNKNOWN recovery.

### Historical review concerns to verify

A 22 November PR #67 conversation comment by the repository maintainer contained five blocking concerns: content-aware scan cache invalidation; subprocess-level MCP transport tests; complete JSON-RPC request/notification semantics; workspace mutation/scanner failure test coverage; and actual execution of the test suite. The reviewer must verify that the current code and current test cases genuinely address those properties.

Older documentation also references a separate “11 findings” evidence set. It was not present in the current repository tree, PR #67/#69 discussion or current issue search at handoff time. Do not infer its content or claim it was recovered. The current reviewer should independently assess the candidate and explicitly list the prior set as unavailable unless the owner supplies it.

### Owner's immediate Day 2 handoff

- Claude: use [FOXY_CLAUDE_INDEPENDENT_REVIEW_BRIEF.md](FOXY_CLAUDE_INDEPENDENT_REVIEW_BRIEF.md). It asks for a no-code-change independent report with severity, confidence, exact file/line, preconditions, reproduction, expected/observed impact, fix, regression and residual risk.
- Codex in Codespaces: use [FOXY_CODEX_CODESPACES_PILOT.md](FOXY_CODEX_CODESPACES_PILOT.md). It builds and tests from a separate worktree, uses a disposable repository and the source CLI connector, and keeps the completion gate advisory.
- Do not rebase, retarget, force-push, merge or publish. PR #70 remains stacked on PR #69. The live PR #69 target branch advanced to `ed5bf64a3dced0bd890fd66cf0634e0ae888a951`, while PR #70 metadata still points at base SHA `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`; GitHub reports #70 non-mergeable. Stack reconciliation is a separate owner-approved task.

### Review decision requested

The reviewer must return a prioritized verdict with explicit Critical/High disposition and list everything that could not be verified. No finding may be marked resolved solely because an author-written test exists or a CI job passed. A clean report does not remove host-level bypass limitations: hooks can be disabled/untrusted, project policy can be changed, and a user can interrupt the host. The MCP itself must remain repository-read-only and must never be described as a tamper-proof delivery lock.


## Current exact-source review target — 28 November 2026

This section supersedes every older “current candidate” block above. Earlier entries are retained for historical review chronology only.

- **Exact code candidate for review:** `3ec649c01506ae077639595794fd0b0cc445db04` on branch `feat/agentshield-cross-platform-autoconnect`.
- **Current PR branch head:** `f8e09e46cd64d639eb5a9e5da0f943131c2de21a`; the commits after the exact code candidate are documentation/handoff and PR-description updates. The source-tested code revision remains `3ec649c01506ae077639595794fd0b0cc445db04`.
- **Exact-source qualification:** [workflow #46137576745](https://github.com/Darkhero766/Vibeguard/actions/runs/46137576745) passed on Windows, macOS and Ubuntu/Linux. Each platform report records 472/472 regression tests, successful connector regression, TypeScript/build checks, MCP STDIO, curated/holdout/additional-adversarial synthetic benchmarks and offline package/CLI/MCP smoke; no failed qualification steps.
- **Package:** `@vibesane/foxy@0.7.0-beta.6`, 30 files, Node.js `>=24.15.0`, executable aliases `foxy` and `vibesane`. The package-content SHA-256 is identical on all three OSes: `f60677328e0c5eb2de94ec4ae44598e973c198e62f15ad4156b061bd6ed42c14`.
- **Publication state:** unpublished; package generation reports `published: false`. No npm registry command is currently usable. After separate owner-approved beta publication only, the intended installer bootstrap is `npx @vibesane/foxy@beta install`.
- **Review scope additions:** inspect the entire consent-first universal installer path, supported-host detection, preview/consent behavior, generic MCP fallback, exact config-target selection, cross-platform connector write locks, verification, rollback/uncertain outcomes, package executable shims and README accuracy.
- **What passing CI does not establish:** real host acceptance, independent review, package registry ownership/provenance, security certification, or release approval. All actual host matrix rows remain pending.

The reviewer should inspect code at exact source `3ec649c01506ae077639595794fd0b0cc445db04` and use the branch's current handoff/pilot documents for the latest operational context. Preserve the review-only/no-change instruction above. PR #70 remains draft, open, unmerged and currently not mergeable; do not rebase, retarget, merge, publish or deploy during review.
