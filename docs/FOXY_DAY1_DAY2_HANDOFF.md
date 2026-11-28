# Foxy beta.6 — Day 1 / Day 2 engineering handoff

> **Current exact-source evidence (28 November 2026):** `e6ab2fcfd373f3473bc6d282eabebfcc105db2c6`, [three-OS Actions run #46167652859](https://github.com/Darkhero766/Vibeguard/actions/runs/46167652859): Windows, macOS and Ubuntu/Linux all passed; 477/477 regression tests per OS; 33-file package content SHA-256 `39bb5a4893f49c2a035454bb9ac063eb09e41b5a05a826621558bd2280818b98`. Every packaged file digest matches across OSes. The release report remains `candidate_for_independent_human_review`; this is not independent review or launch approval. Later commits on the PR branch after this code SHA are documentation-only.

**As of:** 28 November 2026  
**Current qualified code:** `e6ab2fcfd373f3473bc6d282eabebfcc105db2c6`  
**Package:** `@vibesane/foxy 0.7.0-beta.6` (local-only; unpublished)  
**PR:** [#70 — draft, open, unmerged](https://github.com/Darkhero766/Vibeguard/pull/70)  
**Exact-source qualification:** [Actions run #46167652859](https://github.com/Darkhero766/Vibeguard/actions/runs/46167652859) — Windows, macOS and Ubuntu/Linux passed  
**Decision:** `candidate_for_independent_human_review` — **not approved for public distribution**

The detailed Day 1 narrative below retains historical beta.5 implementation/qualification context. The current beta.6 installer, package and exact-source evidence in the later sections supersede any older candidate SHA or package hash.

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

### Historical beta.5 exact-source qualification — superseded

The following two-platform beta.5 result is retained as historical context only. It is not the current beta.6 evidence. Both artifacts reported source revision `f8d2bafbeaac4811f740cc1bbf089385f6e8d0e5`, package version `0.7.0-beta.5`, Node.js `v24.15.0`, and status `validation_passed_review_required`.

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

## Universal installer and package bootstrap — qualification status

The consent-first `vibesane install` engine resolves the canonical Git root, detects supported agents, previews exact project-scoped targets, requires explicit consent, delegates writes to the hardened connector, reopens every managed entry for exact verification, and performs conservative rollback. It does not install hooks/skills, grant host trust, execute repository code or enable completion enforcement.

### Beta.6 exact-source automated qualification — passed on three platforms

Commit `e6ab2fcfd373f3473bc6d282eabebfcc105db2c6` passed [Foxy qualification workflow #46167652859](https://github.com/Darkhero766/Vibeguard/actions/runs/46167652859) on Windows, macOS and Ubuntu/Linux. All three platform jobs completed all 17 steps successfully with zero failed steps.

| Evidence | Windows | macOS | Ubuntu/Linux |
|---|---:|---:|---:|
| Regression tests | 477/477 | 477/477 | 477/477 |
| Cross-platform connector regression workflow step | Passed | Passed | Passed |
| TypeScript workspace + frontend/API typechecks | Passed | Passed | Passed |
| VibeSane frontend + standalone Foxy preview build | Passed | Passed | Passed |
| MCP STDIO integration smoke | Passed | Passed | Passed |
| Curated / holdout / adversarial benchmarks | Passed | Passed | Passed |
| Offline package install, CLI, MCP and launcher smoke | Passed | Passed | Passed |
| Qualification failures | 0 | 0 | 0 |

All three reports record `validation_passed_review_required` and `candidate_for_independent_human_review`. These are automated, synthetic-fixture qualification results, not third-party review or production security certification.

### Exact beta.6 package manifest

- Package: `@vibesane/foxy@0.7.0-beta.6`
- Executables: `foxy` and `vibesane`, both mapped to the same consent-first CLI.
- Runtime: Node.js `>=24.15.0`.
- Packaged files: 30.
- Canonical package-content SHA-256, identical across all three OSes: `39bb5a4893f49c2a035454bb9ac063eb09e41b5a05a826621558bd2280818b98`.
- The offline package smoke invokes the installed `foxy` executable (and verifies the Windows shim), checks `--help`, exercises `foxy install --dry-run`, and asserts no host configuration is created. It also covers consent denial, explicit-consent install/verification, idempotency, disconnect and MCP STDIO smoke.
- The generated package README now states the Beta.6 identity, Windows/macOS/Ubuntu matrix, Node.js requirement and live-host/independent-review caveats; package smoke has regression assertions against stale release claims.
- Cross-process SQLite first-open now checks application identity, schema objects and integrity inside `BEGIN IMMEDIATE`, preventing a second process from combining a stale zero application ID with schema created by the first process.
- The VibeSane `/foxy` page now has an Install MCP panel with the beta command, but its copy action remains disabled until `VITE_FOXY_BETA_INSTALL_ENABLED=true` is explicitly set after owner-approved package publication/provenance checks. The static SEO and no-JavaScript staging page display the same evidence and the disabled state.
- Package generation and tests report `published: false`; the package is not published. The `@vibesane` npm scope/name ownership and availability have not been verified.

Because the package is configured with the `beta` dist-tag, the intended command after an owner-approved beta publication would be `npx @vibesane/foxy@beta install`. The untagged `npx @vibesane/foxy install` resolves the `latest` dist-tag and is intended for a future stable release. Neither registry command is usable against this unpublished candidate.

### Outstanding gates

- Independent security review of the exact source SHA has not been recorded.
- Actual live-host acceptance remains owner-run. Codex is the first pilot; Claude Code, Cursor, Gemini CLI, Roo and Copilot each need separate host/OS validation before those combinations are represented as fully accepted.
- Linux automated qualification now passes, but live Linux host acceptance is still separate.
- Registry namespace ownership, package provenance/signing and publication approval remain open.
- Stack reconciliation remains open; PR #70 is draft/open/unmerged and not mergeable. Do not retarget, rebase, force-push or merge without an explicit plan.
- GitHub's VibeSane Security check remains at 82/100 with one critical finding, matching the previous beta.5 source's same 82/100/one-critical result (66 vs 67 changed files). GitGuardian also reports one secret across the same 250-commit history on both sources. These are unresolved security-review signals; inspect their source findings and remediate/triage before a release decision. Do not treat passing Foxy qualification as a clean security scan.
- No package publication, production deployment, production configuration change, production secret update, production SQL/migration, or production service operation has been performed.

The [Universal Installer Codespaces pilot](FOXY_UNIVERSAL_INSTALLER_PILOT.md) now points at the exact beta.6 package and the current three-platform evidence. Use only a disposable synthetic repository for the first live-host run.

## Known release blockers and boundaries

### Independent review is not complete

The PR has no review submissions or inline review threads at the current candidate check. The author/maintainer's own source inspection and green CI are not independent review.

### The referenced “11 findings” evidence set was not recovered

The current repository tree, current PR discussion and issue search did not expose the separate 11-item evidence set mentioned in older notes. PR #67 has a five-point **maintainer-authored** review comment (stale scan cache, process-level stdio coverage, JSON-RPC validation, workspace mutation/races, and missing test execution). That comment is useful historical context, but it is not evidence that an independent reviewer authored or closed 11 findings. The Claude reviewer should assess the current code independently and explicitly flag the missing historical evidence as unavailable.

### PR stack is intentionally unresolved

PR #70 remains stacked on PR #69, open, draft and unmerged; GitHub reports `mergeable=false`. The existing base branch has advanced and the stack relationship must be reconciled deliberately. Do not rebase, retarget, force-push or merge until there is an explicit dependency/ancestry plan.

### Host acceptance remains a human test

The current run validates build, source, unit/integration regression, protocol smoke and offline package installation. It does not prove that a real Codex session in Codespaces trusts/loads project MCP configuration or executes the Codex Stop hook. Claude Code, Cursor, Gemini, Roo and Copilot still need their own actual host/OS acceptance before those combinations can be advertised as validated.

### Release safety boundary

PR #70 remains draft/open/unmerged. The package is unpublished. No production deployment, production configuration or secret change, production SQL/migration, or production service operation has been performed or authorized. Do not enable completion enforcement or connect production repositories during the first Codespaces pilot.

## 28 November follow-up — permission-copy and evidence consistency

- Corrected the website, standalone SEO page and regression assertions: repository files are never modified, while scan/baseline/queue operations may update Foxy-managed local state. The MCP protocol annotations were already correct; query tools remain `readOnlyHint: true`, state-mutating tools remain `false`.
- Updated the real-host runbook and universal-installer pilot to point to the final Beta.6 exact-source evidence: commit `e6ab2fcfd373f3473bc6d282eabebfcc105db2c6`, workflow #46167652859, package manifest SHA-256 `39bb5a4893f49c2a035454bb9ac063eb09e41b5a05a826621558bd2280818b98`.
- This follow-up changes UI copy, SEO copy, regression assertions and documentation only; it does not change scanner, installer, host adapters, package payload or production configuration.
- Wired `test-foxy-page.mjs` into the VibeSane frontend `build` script immediately after SEO generation, making the page/evidence/permission-claim regression a normal build gate. The standalone staging preview test remains a separate staging-artifact check. This build change has not yet been executed on the current follow-up head. The new UI assertions/build have not been rerun locally or in Actions in this session, so those specific checks remain pending. The 477/477 Beta.6 qualification remains evidence for its recorded exact source SHA, not a claim that this follow-up commit was requalified.
- PR #70 remains draft/open/unmerged; PR #71 remains draft/open/unmerged. No npm publication, production deploy, production auth/provider change, or database mutation was performed.

## Go / no-go

**Go:** give the exact-source packet to Claude for independent review and run the disposable Codespaces Codex pilot.

**No-go:** public release, npm publication, marking the PR ready, merging, deploying, or enabling a production completion gate.

The candidate has cleared automated cross-platform qualification. It has not cleared independent security review, real installed-host acceptance, stack reconciliation or owner release approval.
