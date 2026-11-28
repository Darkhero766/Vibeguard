# Foxy beta.5 production-readiness checklist

**Status:** NOT APPROVED FOR PRODUCTION  
**Candidate:** 0.7.0-beta.5  
**Current source candidate:** 8ff17de5c5f9ce788e3447ae47263c77136cc3db  
**Exact-source qualification:** [#46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971) — **PASSED on Windows and macOS**  
**Prior qualified source:** a777754de234ed2e469cd9822ad4a1f5f881e095  
**Code changes after qualification:** none; subsequent PR-head commit(s) are documentation-only.  
**PR:** [#70 — Foxy beta.5](https://github.com/Darkhero766/Vibeguard/pull/70)

This is the release control record for Foxy / AgentShield beta.5. A source change, test definition, historical green run, or reviewer preview is not a completed release gate. Mark an item complete only when its evidence is attached to the exact candidate commit and reviewed. Keep the PR draft, unpublished and unmerged until every mandatory gate is closed.

## 1. Source identity and change control

- [x] Qualify exact source SHA `8ff17de5c5f9ce788e3447ae47263c77136cc3db` on Windows and macOS in [Actions run #46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971). Both machine reports record 454/454 tests passed, zero failed/cancelled/skipped, `validation_passed_review_required`.
- [x] Confirm beta.5 package version, exact Git revision, generated README, 29-file package inventory and identical per-file content manifest on both platforms. Canonical package-content SHA-256: `42d5d09d7a5473020b0e7706f0a3bcf07172180db657a9c85c1aa663cb3571e6`.
- [x] Verify workflow triggerability: `.github/workflows/agentshield-cross-platform.yml` has a branch-scoped `push` trigger for `feat/agentshield-cross-platform-autoconnect`; run #46055587747 completed successfully on both platforms.
- [x] CI checks out the exact candidate with a clean checkout and verifies the source revision before building.
- [ ] Review the entire PR diff, not only the latest commit.
- [ ] Reconcile the stacked PR dependency with PR #69. PR #70 remains based on f6a16dc; PR #69 has advanced from that common base. Do not rebase, retarget or force-push without an explicit stack plan and owner approval.
- [x] Preserve the prior unpublished package and its SHA-256 for forensic comparison; current per-platform artifacts are retained in Actions.
- [x] Do not merge, publish or deploy as part of qualification. PR #70 remains draft/open; no production deployment or npm publication was performed.

**Evidence:** candidate SHA, PR diff, package version, source fingerprint, ancestry comparison and reviewer sign-off.

## 2. Automated qualification — exact-source Windows and macOS

Run on Node.js 24.15.0 or newer, using the repository lockfile and .github/workflows/agentshield-cross-platform.yml.

- [x] VibeSane frontend strict typecheck.
- [x] API server strict typecheck.
- [x] Vite production build.
- [x] Generated Foxy SEO route assertions.
- [x] Staging noindex, robots denial and direct-route finalization.
- [x] Standalone no-JavaScript Foxy preview build and assertions.
- [x] Cross-platform connector regression suite.
- [x] Complete AgentShield release qualification on both Windows and macOS.
- [x] Source-syntax and source-fingerprint evidence.
- [x] MCP STDIO integration smoke and required protocol checks.
- [x] Curated, holdout and additional adversarial synthetic benchmark validators.
- [x] Offline package build, isolated install, CLI, doctor, connect/disconnect and MCP smoke.
- [x] Verify zero failed, cancelled or skipped required test cases (454/454 per OS).
- [x] Download and inspect both platform artifacts. Confirm each reports source SHA `8ff17de...` and matching package file digests.

**Current exact-source evidence:** [run #46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971) passed on source SHA `8ff17de5c5f9ce788e3447ae47263c77136cc3db`. Windows (win32 x64) and macOS (darwin arm64), both on Node.js v24.15.0, each report 454/454 tests passed, 0 failed, 0 cancelled, 0 skipped, no failed release steps, and `validation_passed_review_required`. The eight release validator stages passed, including source syntax, scanner build, full regression suite, MCP STDIO integration smoke, curated/holdout/additional adversarial benchmarks, and offline package/install/CLI/MCP smoke. Both 29-file package inventories have identical file SHA-256 values and aggregate content digest `42d5d09d7a5473020b0e7706f0a3bcf07172180db657a9c85c1aa663cb3571e6`. Artifacts: [macOS #15249481163](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971/artifacts/15249481163) and [Windows #15249631042](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971/artifacts/15249631042). Both reports say `productionTouched: false` and `syntheticFixturesOnly: true`.
  
**Historical failures retained:** run #46108972740 on `089c2ac...` reported 451/454 and failed MCP STDIO due to provenance propagation/test-scope defects; those were fixed in `e3edce0...` and `65cd27b...`. Run #46109329318 on `65cd27b...` passed macOS but Windows reported 453/454 due to concurrent SQLite WAL initialization contention; `8ff17de...` added bounded BUSY/LOCKED retry without journal-mode fallback. The passing run #46109758971 is the source-matched evidence for the final code candidate.

## 3. SQLite queue and migration adversarial validation

All tests below must pass on the exact candidate; new tests being present in source is not evidence of a pass.

- [ ] Two or more independent processes share the same scoped database and never exceed the global worker cap.
- [ ] Simultaneous claims cannot execute one job twice.
- [ ] Heartbeats, lease expiry and stale-worker recovery are deterministic under process pause, kill and restart.
- [ ] Cross-process cancellation is observable and never produces a clean result.
- [ ] Idempotency key reuse for a different fingerprint is rejected before and after completion.
- [ ] Fingerprint coalescing, multiple aliases, per-job alias cap and global alias cap behave under races.
- [ ] Queue saturation rejects work without persisting a poisoned idempotency key.
- [ ] Abrupt process death, corrupt payload JSON and indexed-column/payload disagreement become interrupted/UNKNOWN, never completed/clean.
- [ ] Graceful shutdown with a corrupt active payload persists UNKNOWN and releases the worker row.
- [ ] Startup failure after worker registration removes that worker row even if pruning fails.
- [ ] Concurrent initialize/close and duplicate initialization do not leak workers or handles.
- [ ] Foreign application IDs and non-empty unowned SQLite schemas are rejected before persistent WAL or file-permission changes.
- [ ] SQLite integrity failure, path replacement, symlink and non-regular database files fail closed.
- [ ] POSIX file and directory modes are owner-only; Windows paths are restricted to the user-profile ACL boundary.
- [ ] Unsupported network, NFS, SMB and cloud-synced stores fail closed or are explicitly rejected.
- [ ] WAL, synchronous mode, foreign keys, busy timeout, transaction rollback and retention limits are verified.
- [ ] beta.4 migration imports only records under the canonical allowlist after realpath validation.
- [ ] Symlink/junction escapes, live beta.4 locks, stale locks, malformed locks and absent/malformed allowlists are tested.
- [ ] Two beta.5 processes migrating the same snapshot cannot race, duplicate or import another root's records.
- [ ] The durable beta.5 migration marker prevents a beta.4 writer from reacquiring the legacy lock.
- [ ] Source JSON remains unchanged as a recovery copy; downgrade to beta.4 after migration is explicitly unsupported and documented.

**Evidence:** test output, fixture descriptions, redacted process logs, database integrity results, filesystem permission results and reviewer walkthrough of transaction boundaries.

## 4. Installed-host acceptance — real applications, real machines

Automated CI cannot prove that a coding-agent host parses, trusts or launches an MCP configuration correctly. Use disposable repositories and synthetic content only.

| Host | Windows | macOS |
|---|---|---|
| Claude Code | [ ] | [ ] |
| Codex CLI | [ ] | [ ] |
| Cursor | [ ] | [ ] |
| Gemini CLI | [ ] | [ ] |
| Roo Code | [ ] | [ ] |
| GitHub Copilot / VS Code | [ ] | [ ] |

For every host/platform cell, record exact host and runtime versions and complete these steps:

- [ ] Install/connect using the supported project-scoped command.
- [ ] Confirm generated config is valid and only the intended entry changes.
- [ ] Confirm backups are created and unrelated entries are preserved.
- [ ] Restart the actual host, approve the MCP server and inspect its actual tool catalog.
- [ ] Call status, changed scan, asynchronous start/status/wait/results and cancellation as supported by the protocol.
- [ ] Verify unauthorized sibling directories, symlinks, junctions, changed root identity and malformed allowlists are denied.
- [ ] Verify repository text is treated as untrusted data and no project scripts are executed by Foxy.
- [ ] Run simultaneous same-namespace processes and confirm shared concurrency/idempotency behavior.
- [ ] Disconnect and verify only Foxy's managed configuration is removed.
- [ ] Confirm host logs and MCP output contain no secrets or full repository source excerpts.
- [ ] Record redacted screenshots or screen-capture evidence and signed acceptance notes.

**Evidence:** host/platform/version matrix, exact package SHA, test repository commit, redacted logs/screenshots, pass/fail record and reviewer identity.

## 5. Independent security review

The reviewer must not be the implementation author and must receive the exact candidate SHA and unpublished package checksum.

- [ ] Review path authorization, canonical root pinning, symlink/junction handling and TOCTOU assumptions.
- [ ] Review MCP tool catalog and annotations, schemas, argument limits, cancellation and information disclosure.
- [ ] Review queue transactions, global concurrency, leases, cross-process races and corrupt-state recovery.
- [ ] Review SQLite file/directory ownership, application identity, WAL behavior, local filesystem assumptions and permissions.
- [ ] Review beta.4 migration marker, lock races, stale-lock operator procedure and upgrade/downgrade behavior.
- [ ] Review host config mutation, backup/restore behavior, atomic writes, symlink refusals and Windows quoting.
- [ ] Review subprocess environment, executable discovery, working directory, timeout and signal propagation.
- [ ] Review package file allowlist, version, provenance, checksum and unpublished distribution process.
- [ ] Reconcile the previous 11-finding evidence set one finding at a time. Preserve severity, confidence, reproduction, fix and retest evidence.
- [ ] Confirm no Critical or High findings remain open; document and obtain explicit risk acceptance for any lower-severity residual issue.

**Evidence:** independent written report with affected lines, exploit preconditions, reproducible steps, observed impact, recommended fix, regression coverage and residual-risk statement.

## 6. Production operations and support readiness

These items require an approved operating model, not just a code change.

- [ ] Document supported Node.js and host-version policy and a tested compatibility matrix.
- [ ] Document per-host store location, local filesystem requirement, backup location and data-retention semantics.
- [ ] Document beta.4 upgrade steps, process shutdown requirements, migration marker behavior and stale-lock operator procedure.
- [ ] Document that beta.4 downgrade is unsupported after beta.5 migration; provide the supported recovery path without overwriting source JSON.
- [ ] Define recovery from database corruption, disk-full errors, permission errors, host crash and lease expiry.
- [ ] Define queue capacity, per-process/global worker limits, timeout/retry policy and operator-visible failure signals.
- [ ] Confirm logs are bounded and redacted; do not persist or expose repository content beyond the defined findings/result contract.
- [ ] Define support intake, security disclosure contact, incident severity levels and response ownership.
- [ ] Prepare a website rollback plan and a separate local MCP storage recovery plan.
- [ ] Ensure support can identify Foxy version, Node version, host version, OS and source/package checksum without collecting secrets.

## 7. Web experience and accessibility

- [x] Build the production frontend and run route/SEO/static-preview checks (CI run #46109758971).
- [ ] Verify /, /foxy, /agentshield, /scan-public, /audit, auth, settings and report routes.
- [ ] Verify signed-out, signed-in, loading, error, exhausted-quota, scan-in-progress, findings, clean, partial-coverage and UNKNOWN states.
- [ ] Test desktop, tablet and small mobile breakpoints; confirm forms, navigation, cards and tables do not overflow.
- [ ] Test keyboard navigation, visible focus, semantic headings/landmarks, accessible names and form error announcements.
- [ ] Test reduced-motion behavior and contrast in graphite, lime and warm-white sections.
- [x] Verify staging and reviewer previews are noindex and robots-blocked; do not index private beta material (CI run #46109758971).
- [ ] Check every product claim and number against source evidence. Historical beta.4 metrics remain labeled historical.
- [ ] Confirm the public rule count matches the source catalog (54 rules at this candidate) in the landing page, public report, signed-in dashboard and animated console.
- [ ] Review contrast on the lime CTA and light clean/upgrade/dashboard cards in both normal and reduced-motion browser states.
- [ ] Confirm the scanner remains usable and redesign has not broken auth, GitHub connection, billing or scan flows.

## 8. Release decision and sign-off

Release remains blocked until all mandatory evidence is complete.

| Sign-off | Required owner | Status |
|---|---|---|
| Source and dependency review | Maintainer + stack reviewer | OPEN |
| Exact-source Windows/macOS CI | Engineering owner | **PASSED** — run #46109758971, SHA 8ff17de, 454/454 per platform, zero failed/skipped |
| Queue/migration adversarial review | Independent engineer | OPEN |
| Installed-host acceptance | Host/platform testers | OPEN |
| Independent security review | External reviewer | OPEN |
| Package provenance | Release owner | OPEN |
| Web/accessibility QA | Frontend reviewer | OPEN |
| Operational/support readiness | Product/operations owner | OPEN |
| Production authorization | Product owner | NOT GRANTED |

**Do not convert this checklist to complete based on author inspection alone.** CI, installed-host acceptance and independent review require their own source-matched evidence.


## 28 November 2026 — current candidate status override

This section supersedes older candidate-SHA and in-progress-status notes earlier in this document.

- **Current code candidate:** `8ff17de5c5f9ce788e3447ae47263c77136cc3db`.
- **Exact-source Windows/macOS qualification:** [run #46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971) completed successfully on both platforms; 454/454 tests per OS and zero failed, cancelled or skipped tests.
- **Current PR state:** PR #70 remains draft, open and unmerged. No production deployment or package publication was performed.
- **Earlier source results:** `a777754...` passed the prior 453/453-per-platform run #46055587747. Runtime-provenance candidate `089c2ac...` failed its source-matched run #46108972740 due to missing provenance propagation and a test-scope issue; follow-up commits fixed those. Candidate `65cd27b...` passed macOS but failed Windows at 453/454 in run #46109329318 due to a concurrent SQLite WAL-initialization lock. These failures remain part of the qualification history.
- **Latest fixes:** commit `24e08b1...` adds the installed bundled `agentshield-mcp-stdio.mjs` executable to the MCP runtime fingerprint. Commit `8ff17de...` adds bounded retries only for SQLite BUSY/LOCKED during WAL initialization, then restores the normal busy timeout. It still refuses any journal mode other than WAL.


The release checklist remains **NOT APPROVED FOR PRODUCTION**. The exact-source CI gate is PASSED; independent security review, real-host acceptance, PR-stack reconciliation, package/release provenance, rollback/support readiness, accessibility QA and owner authorization remain separate mandatory gates.


## 9. Final automated qualification — 28 November 2026

**Code candidate:** `8ff17de5c5f9ce788e3447ae47263c77136cc3db`  
**Workflow:** [#46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971)  
**Result:** Windows and macOS passed; 454/454 tests on each platform (908 total); zero failed, cancelled or skipped; both qualification reports are `validation_passed_review_required`.  
**Package parity:** 29 files per platform; same per-file SHA-256 map and aggregate content SHA-256 `42d5d09d7a5473020b0e7706f0a3bcf07172180db657a9c85c1aa663cb3571e6`.  
**Artifacts:** [macOS](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971/artifacts/15249481163) · [Windows](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971/artifacts/15249631042).

This closes the exact-source automated qualification gate only. The reports explicitly nominate the candidate for independent human review. The release remains NOT APPROVED FOR PRODUCTION until real-host acceptance, independent security review, stack reconciliation, provenance/operations, accessibility QA and owner authorization are complete.
