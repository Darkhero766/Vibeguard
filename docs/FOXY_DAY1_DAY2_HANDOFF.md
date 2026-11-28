# Foxy beta.5 — Day 1 / Day 2 engineering handoff

**As of:** 28 November 2026  
**Candidate:** `f8d2bafbeaac4811f740cc1bbf089385f6e8d0e5`  
**Package:** `@vibesane/agentshield 0.7.0-beta.5`  
**PR:** [#70 — draft, open, unmerged](https://github.com/Darkhero766/Vibeguard/pull/70)  
**Exact-source qualification:** [Actions run #46114784990](https://github.com/Darkhero766/Vibeguard/actions/runs/46114784990)  
**Decision:** `candidate_for_independent_human_review` — **not approved for production distribution**

This document is the current handoff/status source for the Day 1 and Day 2 work. Older SHA/count statements in historical records are superseded by the exact-source evidence below.

## Executive status

The engineering-side Day 1 hardening and automated qualification are complete for this candidate. Day 2 preparation is complete: the Claude review packet and Codespaces Codex pilot instructions are prepared and linked below.

The two real-world actions that cannot be honestly marked complete by CI or by maintainer-side inspection are still open:

1. An independent reviewer must inspect the exact candidate and return a written verdict. No external security-review sign-off is recorded.
2. The owner must install and exercise the candidate from the Codespaces Codex terminal, including actual MCP discovery and lifecycle-hook trust. CI is not a live Codex session.

## Day 1 — engineering hardening and exact-source proof

### Completed implementation work

The current candidate includes these focused hardening changes:

- Runtime provenance covers the scanner artifact and the packaged MCP runtime entrypoint; persisted baselines with missing or mismatched provenance fail closed.
- Queue persistence validates persisted job payloads against authoritative SQLite index fields and returns UNKNOWN on mismatch/corruption.
- Retry sequence and persisted payload/index updates are written transactionally.
- SQLite WAL startup retries only transient BUSY/LOCKED initialization contention; it does not fall back to a weaker journal mode.
- Host connector mutations use per-config exclusive lock sidecars, ownership tokens and identity checks; ambiguous/stale locks are not automatically removed. Backups are checked against the exact source bytes, and a changed config is not overwritten.
- Controller state locks include host/PID/token ownership. Malformed, legacy, foreign-host or permission-ambiguous owner records are not evidence that a lock is abandoned.
- Explicit-session verification reads the current state under lock so a concurrent hook update is not replaced by an earlier snapshot.
- Present-but-invalid or incompatible persisted state is UNKNOWN; it is not silently reset to a clean state that could erase retry limits.
- All controller-owned event-history appends remain bounded to 16 entries.
- Hook input is capped at 128,000 UTF-8 bytes and stops being consumed after the limit is crossed.

### Exact-source qualification — passed

Both artifacts report source revision `f8d2bafbeaac4811f740cc1bbf089385f6e8d0e5`, package version `0.7.0-beta.5`, Node.js `v24.15.0`, and status `validation_passed_review_required`.

| Evidence | macOS arm64 | Windows x64 |
|---|---:|---:|
| Regression tests | 462/462 | 462/462 |
| Failed / cancelled / skipped | 0 / 0 / 0 | 0 / 0 / 0 |
| Release qualification stages | 8/8 | 8/8 |
| Source checks | 53/53 | 53/53 |
| Packaged files | 29 | 29 |
| MCP STDIO tools discovered | 10 | 10 |

The eight passed stages were source syntax, scanner build, unit/integration regression, MCP STDIO integration smoke, curated benchmark, holdout benchmark, additional adversarial benchmark and offline package-install/CLI/MCP smoke.

**Canonical package-content SHA-256 (same 29-file content manifest on both OSes):**

`b4ab8da681923e558184b3f156c05a29d6057cc03125d7d91803323ec5793cdd`

The outer tarball SHA differs by platform archive representation; do not compare the outer tarball hashes as though they were the package-content manifest. The exact 29-file content digests match.

The MCP smoke exercised 10 tools, a synthetic 12-file scan returning one finding, and cancellation. Synthetic benchmarks reported:

- Curated: 120 target-rule cases / 12 categories; TP 60, TN 59, FP 1, FN 0.
- Holdout: 24 target-rule cases / 6 categories; TP 12, TN 11, FP 1, FN 0.
- Additional adversarial: 30 target-rule cases / 9 categories; TP 16, TN 14, FP 0, FN 0.

These labels measure synthetic rule expectations. They do not establish real-world exploit detection, production precision/recall, application-wide security or certification. Both reports record `productionTouched: false` and `syntheticFixturesOnly: true`.

## Day 2 — review and pilot preparation

### Completed preparation

- [Independent review packet](AGENTSHIELD_INDEPENDENT_REVIEW_PACKET.md) refreshed with the current SHA, platform evidence, current hardening delta and review limits.
- [Claude independent review brief](FOXY_CLAUDE_INDEPENDENT_REVIEW_BRIEF.md) created with a strict review scope, required reproduction/evidence format and no-change instruction.
- [Codex Codespaces pilot guide](FOXY_CODEX_CODESPACES_PILOT.md) created for an isolated Git worktree and disposable synthetic repository. It uses the source checkout and the project-scoped `vibesane connect --agent codex` path; it does not publish or globally install a package.
- [Real-host acceptance runbook](FOXY_REAL_HOST_ACCEPTANCE_RUNBOOK.md) refreshed to point at the exact current candidate and mark every host/OS row as pending until a human runs it.

### Owner-run tasks still open

- Run the Claude review against this exact SHA and send back the full written findings, including evidence and any unverified areas.
- Run the Codex Codespaces procedure against a disposable repository. Capture `codex mcp list`, the `/mcp` tool catalog, `status`, a changed-file scan, remediation verification and `/hooks` trust status. Keep the gate in advisory mode for this first session.
- If Claude identifies a real issue, preserve the report first. Do not silently patch around the finding before the reviewer has recorded it.

## Known release blockers and boundaries

### Independent review is not complete

The PR has no review submissions or inline review threads at the current candidate check. The author/maintainer's own source inspection and green CI are not independent review.

### The referenced “11 findings” evidence set was not recovered

The current repository tree, current PR discussion and issue search did not expose the separate 11-item evidence set mentioned in older notes. PR #67 has a five-point **maintainer-authored** review comment (stale scan cache, process-level stdio coverage, JSON-RPC validation, workspace mutation/races, and missing test execution). That comment is useful historical context, but it is not evidence that an independent reviewer authored or closed 11 findings. The Claude reviewer should assess the current code independently and explicitly flag the missing historical evidence as unavailable.

### PR stack is intentionally unresolved

PR #70 is stacked on PR #69 and remains draft/open/unmerged. At the latest check PR #69 was also draft/open/unmerged at `ed5bf64a3dced0bd890fd66cf0634e0ae888a951`. The PR #70 metadata still shows base SHA `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`; the live base branch has advanced. Comparison against the live target showed 392 commits ahead and 23 behind from the common base, and GitHub reports `mergeable=false`. Do not rebase, retarget, force-push or merge until the stacked-PR dependency is reconciled with an explicit plan.

### Host acceptance remains a human test

The current run validates build, source, unit/integration regression, protocol smoke and offline package installation. It does not prove that a real Codex session in Codespaces trusts/loads project MCP configuration or executes the Codex Stop hook. Claude Code, Cursor, Gemini, Roo and Copilot still need their own actual host/OS acceptance before those combinations can be advertised as validated.

### Release safety boundary

PR #70 remains draft/open/unmerged. The package is unpublished. No production deployment, production configuration or secret change, production SQL/migration, or production service operation has been performed or authorized. Do not enable completion enforcement or connect production repositories during the first Codespaces pilot.

## Go / no-go

**Go:** give the exact-source packet to Claude for independent review and run the disposable Codespaces Codex pilot.

**No-go:** public release, npm publication, marking the PR ready, merging, deploying, or enabling a production completion gate.

The candidate has cleared automated cross-platform qualification. It has not cleared independent security review, real installed-host acceptance, stack reconciliation or owner release approval.
