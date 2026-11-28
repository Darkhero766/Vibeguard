# AgentShield beta readiness evidence (2026-11-24)

## Decision

**NOT READY for distribution.** Historical qualification passed on `ab51b79f2f702da15608267d8ba725bb994914a8`, but the current candidate at `631057ba82161827156c20675ee326a7e9c8c2dc` has not been qualified. A fresh release-qualification attempt returned `not_qualified`, and a real stdio MCP scan could not complete in this managed sandbox because the MCP server's captured Node scanner subprocess output was empty. The scanner CLI itself worked. Keep external beta blocked until qualification passes on the exact candidate and an independent security review, intended-platform checks, and owner approval are complete. No Claude Code run or review is claimed.

## Candidate and environment

- Branch: `feat/agentshield-beta-coding-agent-install`
- Candidate source revision: `ab51b79f2f702da15608267d8ba725bb994914a8`.
- Package: `@vibesane/agentshield@0.7.0-beta.3`, built locally and not published.
- Qualified package SHA-256: `9c2ec6013126b0f6ddb864ce32d1919b78df6104f0e34e82ac9af4c14ebb67ba` (1,107,853 bytes; 23 packaged files).
- Qualification runtime: Linux x64, Node.js `v24.22.2`; installed MCP client: Codex CLI `0.171.0`.
- No production services, real credentials, GitHub Actions, deployment, merge, or publication were used.

## Local qualification

Command:

```sh
npm_config_cache=/tmp/agentshield-npm-cache \
  pnpm --filter @workspace/api-server run test:agentshield:release-qualification
```

Result: `validation_passed_review_required`; 369/369 regression tests passed, 0 failed, 0 skipped. Source validation passed for 48 files and fingerprinted six critical inputs. Scanner build passed. The isolated unpublished package smoke passed installation, CLI, doctor (including Codex Stop-hook detection), Codex hook install/block/remediation/uninstall, MCP initialize/tool discovery/status/scan/findings/explain/verification, authorization denial, cancellation, invalid arguments, and malformed JSON checks.

| Benchmark | Cases / categories | TP | TN | FP | FN | Precision | Recall | Result |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Curated | 120 / 12 | 60 | 59 | 1 | 0 | 0.984 | 1.000 | Passed configured aggregate and per-category floors |
| Holdout | 24 / 6 | 12 | 11 | 1 | 0 | 0.923 | 1.000 | Passed configured aggregate and per-category floors |
| Additional adversarial | 30 / 9 | 16 | 14 | 0 | 0 | 1.000 | 1.000 | Passed |

The curated false positive was `unauthenticated_write` on `missing_api_auth_negative_1`; the holdout false positive was the same rule on a custom-guard challenge. The challenge corpus is synthetic and evaluates named target rules; it is not real-world precision/recall or exploit validation. The full machine-readable qualification output records category metrics, misclassifications, source digest, revision, package checksum, limitations, and exact step outputs in [`qualification-report-2026-11-24.json`](../artifacts/api-server/agentshield-beta/qualification-report-2026-11-24.json). Its SHA-256 is `81d97ecbd48e7024cc7714099bf5ff65a701e95833cde79e9f73cc00468607ba`; the generated working copy is also at `artifacts/api-server/dist/agentshield-release-validation.json`.

## Actual Codex MCP client and remediation

The locally installed package was configured as a stdio MCP server using a process-level `VIBESANE_ALLOWED_ROOTS_JSON` containing only a temporary parent directory with a synthetic Git repository. Codex CLI initialized the server and used the five discovered tools:

- `status`: `ready`; scanner built; `workspaceAuthorization: configured`.
- `scan_changed`: complete; one supported synthetic file; reported `hardcoded_jwt_secret` Critical and `eval_usage` High.
- `list_findings`: returned both baseline findings for the scan ID.
- `explain_finding`: returned deterministic JWT handling and rotation guidance.
- Agent edit: inspected and modified only synthetic `src/auth.js`; replaced the synthetic hardcoded value with `process.env.JWT_SECRET` and `eval(input)` with `JSON.parse(input)`.
- `verify_remediation`: `rescan_clean`; two baseline findings removed; zero remaining and zero new findings. Verification level was `complete_static_rescan_only`; no runtime tests were claimed.

The full MCP workflow and outside-root denial were rerun through the real Codex CLI against the exact qualified package SHA-256 listed above. The actual Codex agent changed only the disposable repository; its resulting diff was inspected.

## Authorization boundary review

The real Codex MCP client attempted `scan_changed` on a second synthetic Git repository outside the configured allowlist. The MCP tool returned `Workspace is not authorized or is not an accessible Git repository.` The repository was not scanned or modified.

Adversarial coverage includes valid roots and nested repositories/worktrees; unauthorized parent, sibling-prefix, and external paths; traversal; root and changed-file symlinks; empty/malformed/missing allowlists; duplicate and aliased canonical roots; post-use root replacement and deletion; workspace switching; cross-workspace baseline binding; and scan/list/remediation authorization. Path casing on case-insensitive filesystems was not tested in this Linux environment.

Independent testing found that replacing an allowed directory after server startup but before the first workspace request could substitute a different repository under that pathname. The server now pins valid configured root identities before processing its first request. A spawned-server regression test reproduces replacement at that boundary and confirms denial; the adversarial suite passes 20/20 tests.

## Actual Codex completion hook

The installed Codex Stop hook from the exact qualified package SHA-256 listed above was tested in a disposable synthetic repository with an enforced base ref:

- With a committed synthetic Critical JWT and High `eval()` finding, complete scan coverage produced a first continuation. On recursive Stop, the actual Codex event had `stop_hook_active: true`; the installed hook returned `continue: false` with a reason reporting two blocking findings at or above High. The agent made no file changes.
- After a synthetic remediation commit, the base-to-HEAD scan completed with zero findings. Codex ended normally without a continuation. AgentShield state recorded a complete gate with zero blockers.
- The isolated package smoke separately exercises scanner failure/unknown behavior, incomplete and blocking states, remediation, and hook adapter responses.

Codex hooks must be reviewed and trusted by the host. They are local host controls, can be disabled or bypassed, and are not tamper-proof delivery locks.

## Install, diagnostics, and uninstall

The documented local tarball was installed into `/tmp/agentshield-beta-install` with `npm install --global --prefix ... --ignore-scripts`. The installed `vibesane --help`, `doctor` (`checks.codexStopHookInstalled: true`), and `mcp-doctor` passed. The exact qualified package was uninstalled, reinstalled from the local archive, rechecked, and uninstalled at the end. The package smoke independently verified the installed Codex project hook and safe hook removal. No npm publication occurred.

## Independent review and limits

- `claude` was not installed or usable; no Claude Code client run or independent Claude review is claimed.
- `docs/AGENTSHIELD_INDEPENDENT_REVIEW_PACKET.md` is prepared for manual independent review. It asks for evidence, severity, confidence, affected lines, exploit scenarios, fixes, regressions, and explicit unverified areas.
- macOS has not been exercised. Windows is explicitly unsupported by this beta CLI/hooks. Do not advertise support outside the qualified Linux x64 environment until platform tests pass.
- Scanner behavior is static heuristic analysis of supported changed files only. No result is application-wide assurance or a security certification.
- External beta remains blocked on independent security review, platform qualification for the intended tester group, and explicit owner approval.

## Current-revision validation attempt (2026-11-24)

- Current attempt revision: `631057ba82161827156c20675ee326a7e9c8c2dc`; package version `0.7.0-beta.3`. Its source code is unchanged from the previously qualified `ab51b79` revision; changes after that point are qualification/report documentation. The current revision still requires its own successful qualification evidence.
- `pnpm --filter @workspace/api-server run build:agentshield`: passed.
- `pnpm --filter @workspace/api-server run test:agentshield:release-qualification`: **failed, verdict `not_qualified`**. Source syntax and build passed; regression, curated and holdout benchmarks, and package smoke did not pass. The runner captured no child-process stdout in this environment, so valid scanner JSON and test details were unavailable. The machine-readable failed attempt is at ignored build output `artifacts/api-server/dist/agentshield-release-validation.json` and was not promoted as a qualification report.
- Direct TAP run for the 23 qualification test files: 10 file-level subtests passed, 13 failed, 0 skipped. A direct run of `test-agentshield-mcp.mjs` reported 20/24 cases passed and four failed: stdio child output/response, cancellation response, and two scanner-child JSON cases. This sandbox's Node child process produces empty stdout when captured through a pipe, including for a trivial child; do not reclassify these as product passes. Several pure policy, gate, auth regression, baseline, Python, SARIF, and route-auth suites did pass.
- Direct CLI changed-file scan: `partial_coverage`, 22 supported files scanned, 9 Markdown paths unsupported, 9 findings. Manual review classified the nine as synthetic detector fixtures in test/benchmark files; no application vulnerability was confirmed. Full scope and sanitized locations are in [`REAL_REPOSITORY_SCAN_2026-11-24.md`](../artifacts/api-server/agentshield-beta/REAL_REPOSITORY_SCAN_2026-11-24.md).
- Direct installed-package MCP stdio smoke: offline tarball installation succeeded, help, doctor, `mcp-doctor`, initialize, tool discovery (five tools), and `status` passed. `scan_changed` failed with `Scanner returned malformed JSON.` in this sandbox. Tarball SHA-256: `9c2ec6013126b0f6ddb864ce32d1919b78df6104f0e34e82ac9af4c14ebb67ba` (23 files). This archive is the previously qualified build; do not imply the current runner rebuilt and verified a new archive.
- On the installed package and a disposable five-file synthetic Git repository, changed-file scanning found six intended synthetic detections (JWT, Supabase privileged client reference, SQL interpolation, generic secret pattern, `eval`, and unsafe YAML), without printing the synthetic JWT value. After safe edits, a complete rescan had zero findings (six removed, none remaining or new). A newly introduced `eval` in another synthetic file was detected as High; removing it returned a complete zero-finding scan. This was CLI scan/rescan evidence, not MCP `verify_remediation`.
- The installed Codex Stop adapter received synthetic Stop payloads while enforcement was enabled. A complete gate could not be obtained because of the same subprocess-output limitation; the hook failed closed with a first `decision: block`, then recursive `continue: false` with an UNKNOWN reason. This verifies the adapter's fail-closed path only, not an actual Codex host session or clean completion.
- `codex --version` returned `codex-cli 0.171.0`; `codex mcp list` reported no configured MCP servers. No host-level AgentShield call was made in Codex during this turn. Claude CLI was absent. Earlier actual Codex acceptance evidence applies only to the exact previously qualified package/revision above.
- Additional in-process synthetic adversarial benchmark: 30 labeled cases, 9 categories, 16 TP / 14 TN / 0 FP / 0 FN; 463 ms. Labels are synthetic rule expectations, not exploit validation. Curated and holdout benchmarks did not produce usable results in this run.
- The existing `pnpm-workspace.yaml` modification predates this work and was left untouched.

### Current private-beta checklist

- Verified in this turn: source scanner builds; real-repository changed-file CLI scan reported partial coverage; installed existing tarball works for offline install, help, diagnostics and MCP startup/discovery/status; synthetic CLI scan/remediation/rescan/new-finding path works; hook fails closed under an UNKNOWN scan; one additional synthetic benchmark completed.
- Still required: rerun release qualification on the exact review commit in an environment where Node child stdout is available; successful MCP scan/list/explain/remediation through an installed coding-agent host; clean and blocking completion-gate responses with host-recognized hooks; offline package smoke including uninstall/reinstall on supported platforms; independent security review with no unresolved Critical/High issues; platform qualification; owner approval and named consenting testers.
- Tester precautions if later approved: use only disposable repositories first, allowlist only intended roots, use synthetic credentials, keep completion enforcement opt-in, review/trust host hooks explicitly, treat incomplete/unsupported scans as UNKNOWN, and do not interpret a clean static scan as certification.
- Known risks: heuristic false positives in test/benchmark sources; changed-files-only scope; unsupported Markdown and platform gaps; host-level hooks can be disabled or bypassed; current-revision qualification and current-host MCP scan remain unverified.
- Rollback: remove the project hooks/skill using the installed `vibesane uninstall-codex` / `vibesane uninstall` commands, restore the prior local archive if needed, then uninstall `@vibesane/agentshield`. Review config and preserve unrelated host entries.


## Cross-platform auto-connect engineering delta — 2026-11-26

A separate candidate branch, `feat/agentshield-cross-platform-autoconnect`, was forked from PR #69 head `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`. Its current source head at the time of this note is `dc8a1184905eb534361ec0ebc183de126d91232b`. It remains a draft engineering candidate and has not been merged or deployed.

The branch introduces package version `0.7.0-beta.4` and the `vibesane connect` command:

- Auto-detects project/CLI markers for Claude Code, Codex CLI and Cursor; `--agent all` explicitly configures all three.
- Writes project-scoped MCP stdio configuration for Claude (`.mcp.json`), Codex (`.codex/config.toml`) and Cursor (`.cursor/mcp.json`).
- `--agent mcp` emits a generic stdio configuration object for manual registration with other MCP-compatible clients.
- Resolves the actual Git root and supplies that exact root in `VIBESANE_ALLOWED_ROOTS_JSON`; preserves unrelated configuration, backs up existing files, rejects symlinked/malformed/conflicting host config, and avoids installing hooks automatically.
- Adds Windows-aware executable quoting, environment allowlisting (including execution-critical Windows variables), case-insensitive canonical path comparisons, and platform-independent Git invocation for read-only commands.
- Adds connector tests and a dedicated Windows/macOS release-qualification workflow.

**No tests or CI workflow have been executed for this revision yet.** Windows and macOS remain unqualified. The historical Linux qualification evidence above applies only to its recorded source revision/package checksum and is not evidence for beta.4. No distribution approval is implied.

The separate “11 findings” report referenced in the follow-up work was not present in the checked-in branch documentation or PR #69 review evidence available for this pass. The historical November 24 real-repository report records 9 heuristic findings and 9 unsupported Markdown paths; those 9 were reviewed as synthetic test/benchmark fixtures, not confirmed application vulnerabilities. It is not the same thing as the 11-finding report and must not be used to close it. The exact 11 finding records, paths, line numbers and scanner evidence still need to be supplied or retrieved before those items can be triaged or marked fixed.
