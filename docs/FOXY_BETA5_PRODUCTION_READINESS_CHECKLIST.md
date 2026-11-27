# Foxy beta.5 production-readiness checklist

**Status:** NOT APPROVED FOR PRODUCTION  
**Candidate:** 0.7.0-beta.5  
**Current source candidate:** 13a74ef706d531c92fbf2c21629b64cac141a36c  
**PR:** [#70 — Foxy beta.5](https://github.com/Darkhero766/Vibeguard/pull/70)

This is the release control record for Foxy / AgentShield beta.5. A source change, test definition, historical green run, or reviewer preview is not a completed release gate. Mark an item complete only when its evidence is attached to the exact candidate commit and reviewed. Keep the PR draft, unpublished and unmerged until every mandatory gate is closed.

## 1. Source identity and change control

- [ ] Pin the release candidate to one full 40-character commit SHA.
- [ ] Confirm package version, Git revision, source fingerprint and generated README all refer to that candidate.
- [ ] Confirm the release checkout is clean and no untracked source is included.
- [ ] Review the entire PR diff, not only the latest commit.
- [ ] Reconcile the stacked PR dependency with PR #69. PR #70 remains based on f6a16dc; PR #69 has advanced from that common base. Do not rebase, retarget or force-push without an explicit stack plan and owner approval.
- [ ] Preserve the prior unpublished package and its SHA-256 for forensic comparison.
- [ ] Do not merge, publish or deploy as part of qualification.

**Evidence:** candidate SHA, PR diff, package version, source fingerprint, ancestry comparison and reviewer sign-off.

## 2. Automated qualification — exact-source Windows and macOS

Run on Node.js 24.15.0 or newer, using the repository lockfile and .github/workflows/agentshield-cross-platform.yml.

- [ ] VibeSane frontend strict typecheck.
- [ ] API server strict typecheck.
- [ ] Vite production build.
- [ ] Generated Foxy SEO route assertions.
- [ ] Staging noindex, robots denial and direct-route finalization.
- [ ] Standalone no-JavaScript Foxy preview build and assertions.
- [ ] Cross-platform connector regression suite.
- [ ] Complete AgentShield release qualification.
- [ ] Source-syntax and source-fingerprint evidence.
- [ ] MCP STDIO integration smoke and protocol conformance.
- [ ] Curated, holdout and additional adversarial synthetic benchmark validators.
- [ ] Offline package build, isolated install, CLI, doctor, connect/disconnect and MCP smoke.
- [ ] Verify zero failed, cancelled or skipped required test cases.
- [ ] Download and inspect both platform artifacts. Confirm their reported source SHA equals the candidate SHA.

**Evidence:** successful Windows and macOS workflow URLs, job logs, full TAP counts, benchmark JSON, generated preview HTML, package checksum and source revision. The older beta.4 run #75 must never be substituted for beta.5 evidence.

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

- [ ] Build the production frontend and run route/SEO/static-preview checks.
- [ ] Verify /, /foxy, /agentshield, /scan-public, /audit, auth, settings and report routes.
- [ ] Verify signed-out, signed-in, loading, error, exhausted-quota, scan-in-progress, findings, clean, partial-coverage and UNKNOWN states.
- [ ] Test desktop, tablet and small mobile breakpoints; confirm forms, navigation, cards and tables do not overflow.
- [ ] Test keyboard navigation, visible focus, semantic headings/landmarks, accessible names and form error announcements.
- [ ] Test reduced-motion behavior and contrast in graphite, lime and warm-white sections.
- [ ] Verify staging and reviewer previews are noindex and robots-blocked; do not index private beta material.
- [ ] Check every product claim and number against source evidence. Historical beta.4 metrics remain labeled historical.
- [ ] Confirm the scanner remains usable and redesign has not broken auth, GitHub connection, billing or scan flows.

## 8. Release decision and sign-off

Release remains blocked until all mandatory evidence is complete.

| Sign-off | Required owner | Status |
|---|---|---|
| Source and dependency review | Maintainer + stack reviewer | OPEN |
| Exact-source Windows/macOS CI | Engineering owner | OPEN |
| Queue/migration adversarial review | Independent engineer | OPEN |
| Installed-host acceptance | Host/platform testers | OPEN |
| Independent security review | External reviewer | OPEN |
| Package provenance | Release owner | OPEN |
| Web/accessibility QA | Frontend reviewer | OPEN |
| Operational/support readiness | Product/operations owner | OPEN |
| Production authorization | Product owner | NOT GRANTED |

**Do not convert this checklist to complete based on author inspection alone.** CI, installed-host acceptance and independent review require their own source-matched evidence.
