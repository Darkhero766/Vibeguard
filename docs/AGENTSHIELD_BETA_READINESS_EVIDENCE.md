# AgentShield beta readiness evidence (2026-11-24)

## Decision

**Local qualification passed; candidate for independent human security review. External beta is not approved.** The qualification runner returned `validation_passed_review_required`, not release approval. Claude Code is unavailable in this maintainer environment, and the independent review packet is prepared but no Claude review is claimed. The only host and OS exercised end to end were Codex CLI on Linux x64. Keep the external beta limited until an independent reviewer completes the packet, the intended tester platform matrix is qualified, and the owner approves named participants.

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
