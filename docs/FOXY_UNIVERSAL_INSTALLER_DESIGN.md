# Foxy Universal Installer — Design and Acceptance Plan

Status: implementation candidate for PR #70. The beta.6 package candidate has passed exact-source automated qualification on Windows, macOS and Linux; no package publication, production deployment, or customer/host configuration has been performed.

## Implementation status

A first CLI implementation is now present on `feat/agentshield-cross-platform-autoconnect`:

- `artifacts/api-server/scripts/agentshield-universal-install.mjs` implements plan, consent, detection, connector delegation, idempotent re-open verification and conservative rollback.
- `artifacts/api-server/scripts/vibesane.mjs` exposes `vibesane install`.
- The offline beta package builder includes the installer entrypoint.
- Unit tests cover argument parsing, runtime/platform preflight, plan targeting, success verification, rollback, migration preservation and ambiguous write outcomes.
- Offline package smoke covers non-interactive consent denial, dry-run/no-write, explicit-consent installation, idempotent repeat and managed-entry disconnect.
- The release validator now requires installer-specific package evidence.

The complete beta.6 candidate passed exact-source qualification at commit `ca9de05d00672d9a3148deec13ee2e280f1996eb` in [workflow run #46140045503](https://github.com/Darkhero766/Vibeguard/actions/runs/46140045503) on Windows, macOS and Ubuntu/Linux. Each platform passed 472/472 regression tests, the cross-platform connector regression step, MCP STDIO integration, curated/holdout/additional-adversarial synthetic benchmarks, and the offline package/CLI/MCP smoke. All three qualification reports returned `validation_passed_review_required` / `candidate_for_independent_human_review`, with zero failed qualification steps.

The packaged candidate is `@vibesane/foxy@0.7.0-beta.6`, 30 files, Node.js `>=24.15.0`, with both `foxy` and `vibesane` executable aliases mapped to the same CLI. Its canonical package-content SHA-256 is `edf7851ec847dce63f24c66b59b396bae770d69e9e4e52843709df1778a816b8` on all three operating systems. The package builder and smoke test report `published: false`; no npm publication has occurred. The `@vibesane` namespace ownership/availability has not been verified.

The npm metadata uses the `beta` dist-tag. After (and only after) registry ownership is confirmed and an owner-approved beta publication, the channel-specific command is `npx @vibesane/foxy@beta install`. The untagged `npx @vibesane/foxy install` resolves the registry's `latest` tag and is the intended stable-channel UX after a stable release. Neither command works from this unpublished local candidate. See [Universal Installer Codespaces pilot](FOXY_UNIVERSAL_INSTALLER_PILOT.md).

## Product objective

Make Foxy installation a short, predictable, auditable flow. Preferred stable-channel user experience after a separately approved stable release:

```sh
npx @vibesane/foxy install
```

The locally packed candidate declares `@vibesane/foxy` with a `foxy` executable mapped to the consent-first installer. Cross-platform package smoke invokes the npm-generated executable (or inspects the Windows shim and executes its target), checks CLI dispatch, runs `foxy install --dry-run`, and proves that the dry run leaves the target configuration absent. The exact package has passed Windows/macOS/Linux automated qualification, but **the public registry command is still unavailable**: the package remains unpublished, the scope's ownership/availability has not been verified, and independent human review, live-host acceptance and explicit release approval remain required.

## Principles and non-goals

- Security boundaries are invariant: explicit workspace roots, read-only MCP tools, no shell/patch/commit/deploy capability, conservative failure behavior.
- Installer never executes project code, downloads arbitrary scripts, or implicitly scans broad directories.
- Installation is transactional where possible, with snapshot, managed markers, compare-before-write, atomic replacement and rollback.
- Never overwrite user configuration outside Foxy-owned managed blocks/entries. Conflicts stop and show a repair path.
- No auto-trust, no auto-enabling enforcement, no blanket home-directory authorization.
- Detection is advisory: detected agent does not imply permission to mutate its configuration.
- First-run UX supports selecting agents, workspaces and whether optional hooks/skills are installed.
- Offline or registry outage should fail cleanly and explain options.
- No installer claims an agent integration is supported until it has automated and live-host acceptance.

## Architecture

### 1. Bootstrap / CLI
A minimal package entry point with commands:
- `install` (interactive by default; explicit non-interactive flags)
- `detect`
- `doctor`
- `list` / `status`
- `uninstall` (per agent and per project; preserve unrelated settings)
- `repair` (diagnose only by default; repairs require explicit selection)

The bootstrap package should be small and avoid network calls after package resolution. A published package must have pinned/verified integrity and a reproducible release process. Beta packaging may use a local archive.

### 2. Agent detection registry

Initial project-scoped adapter targets are:

| Host | Project MCP configuration | Important constraint |
|---|---|---|
| Codex CLI | `.codex/config.toml` | Codex loads project config only for trusted projects. Foxy does not grant trust. |
| Claude Code | `.mcp.json` | Project MCP approval remains with Claude Code/user. |
| Cursor | `.cursor/mcp.json` | Project file is merged with user-level configuration by Cursor. |
| Gemini CLI | `.gemini/settings.json` | MCP server definition is project scoped; host trust stays separate. |
| Roo Code | `.roo/mcp.json` | Project configuration can be loaded by Roo Code. |
| GitHub Copilot CLI / Copilot harness | workspace-root `.mcp.json` | This is the portable workspace format. A separate user-level Copilot CLI file is not written. |

The adapter uses workspace-root `.mcp.json` for Claude and Copilot because the portable Copilot workspace format shares the top-level `mcpServers` structure. It does not write legacy VS Code editor-managed `.vscode/mcp.json` files; current VS Code guidance says new native Copilot configurations use `$COPILOT_HOME/mcp-config.json` or workspace-root `.mcp.json`, and legacy editor-managed files are not read directly by the Copilot harness. See the [official VS Code MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration).

This registry is additive to the existing connectors: detection evidence must never be treated as a trust/approval grant. Host config formats and file locations must be re-checked against upstream docs before adding a new adapter.

Independent detector modules with declared:
- Agent identifier and supported OS
- Detection evidence (CLI path, config directory, environment indicator)
- Configuration target(s), format, project/user scope
- Installer and uninstall adapter
- Hook/skill support and acceptance status

Detection must distinguish present, probable, absent, unsupported, ambiguous and unsafe-to-modify. Do not infer a host's trust state.

Initial matrix (candidate, subject to implementation):
- Codex CLI: project-scoped MCP configuration and separately opt-in hooks/skills
- Claude Code: project-scoped MCP and opt-in hooks; preserve settings
- Cursor: project configuration and opt-in rules/hooks only after acceptance
- Gemini CLI, Roo, Copilot: detector first; adapter status explicitly experimental until verified
- Generic MCP configuration: manual adapter only; no automatic mutation of arbitrary host files

### 3. Workspace authorization
- Resolve target to a canonical Git root when the user chooses a project.
- Reject symlink/junction or identity changes during authorization-sensitive writes.
- Never authorize parent directories or multiple roots by default.
- Show the exact canonical path before write.
- MCP server startup revalidates configured roots and reports diagnostics without leaking path data.
- Root changes require explicit consent; no silent widening.

### 4. Install transaction
For each agent and scope:
1. Preflight: OS, Node runtime, project path, permissions, host config format, available backup space, conflicting managed entries.
2. Present a plan (target paths, exact actions, hooks/skills optional, root scope).
3. Obtain explicit consent.
4. Capture bounded exact snapshots and file identity/hash.
5. Apply only Foxy-managed entry/block; use lock, temp file, fsync where available, compare-before-rename, atomic replace.
6. Validate parse and exact managed configuration, absolute executable paths and root scope.
7. Run diagnostic verification; do not launch or trust the AI host.
8. Commit transaction record (redacted metadata and hashes; no secrets/path disclosure in telemetry).
9. On failure, restore only if target still matches installer-written identity; otherwise stop and leave recovery instructions. Never clobber intervening edits.

### 5. Optional hooks and skills
- Separate from MCP connection and default OFF.
- Show trigger, command, timeout, scope, and limitation (host-side hooks can be disabled or bypassed).
- No completion enforcement on initial install.
- Install/uninstall is additive and marker-based.
- Hook failure is UNKNOWN/advisory unless a user explicitly configures a reviewed policy; installer never claims tamper-proof completion control.

### 6. UX
Interactive:
- Detect agents
- Choose one or more detected agents
- Choose project root (current Git root default; display canonical root)
- MCP connection: default selected
- Hooks/skills: separate opt-in choices
- Review concise plan and confirm
- Progress, validation and result
- Copy diagnostics / safe recovery commands

Non-interactive:
- Requires explicit agent(s), root and flags for optional hook installation.
- Refuses ambiguous/conflicting targets.
- Output structured JSON with stable result codes, redacted path handling and no secret values.

### 7. Failure codes
Stable machine-readable categories: runtime_missing, unsupported_host, host_not_detected, ambiguous_target, unsafe_path, config_conflict, lock_busy, write_denied, validation_failed, rollback_conflict, host_unverified, install_partial, success. Human output should identify next safe action.

### 8. Uninstall
- Remove only the Foxy-owned entry or block identified by markers and validated contents.
- Never delete entire host settings/config directories.
- Hooks and MCP removal are separate selectable actions.
- Preserve user edits and unrelated entries.
- If markers are missing or target changed, produce a diff/recovery plan and refuse destructive cleanup.
- Uninstall does not remove workspace files, scan data or backups unless user separately selects them and previews them.

## Package and supply-chain requirements

- Verify package provenance and content manifest; pinned dependencies and lockfile.
- Reproducible build and signed/tagged release where feasible.
- No install lifecycle script that executes project content.
- Publish only after external review and staged acceptance; package name availability and registry ownership must be verified before release.
- Do not publish a beta from this design or PR.

## Security test matrix

### Unit tests
Detector evidence and ambiguity; parser adapters; managed-block idempotency; path canonicalization; symlink/junction rejection; quoting; malformed configs; conflict detection; redaction; stable error codes; consent flow.

### Transaction tests
Concurrent installs; lock timeout; interrupted writes; target mutation between snapshot and rename; disk-full; permission errors; malformed target; backup corruption; rollback conflict; repeat install; uninstall after user edits; crash recovery.

### Authorization tests
Nested root, parent root, sibling repository, path traversal, symlink escape, case/Unicode path edge cases, environment override, root removal/change, multiple roots and unauthorized scan denial.

### Cross-platform
Linux (Codespaces), macOS, Windows. Test native path and host config formats, package-manager and runtime variations. Do not assume POSIX permissions or shell quoting on Windows.

### Integration and live-host acceptance
For every agent:
- installation plan matches actual writes
- host sees the exact MCP server and tool set
- host does not receive extra authorized roots
- tool calls work in disposable synthetic repository
- unauthorized sibling denied
- optional hook trust/behavior inspected separately
- uninstall preserves unrelated settings
- collect evidence and version/OS/hash

## Rollout gates

1. Design reviewed.
2. Implement adapters for Codex and Claude first (other detectors can remain informational).
3. Unit/transaction/security tests.
4. Linux, macOS and Windows qualification.
5. Independent security review.
6. Live host pilot in disposable workspace.
7. Beta packaging/release review.
8. Explicit approval before publishing.

## Acceptance criteria for the first installer pilot

- One-command bootstrap is documented and works on clean supported systems.
- Detects Codex/Claude without falsely claiming other agent support.
- Project-root scope is explicit and verified.
- MCP install is idempotent; optional hook install remains opt-in.
- All writes are confined to declared targets.
- Conflict, failure and rollback paths have test coverage.
- Uninstall removes Foxy-managed artifacts only.
- Tests pass on Windows, macOS and Linux.
- No production deployment, public publication, merge or release without separate approval.


## Final Beta.6 release evidence — 28 November 2026

The exact qualified source is `ca9de05d00672d9a3148deec13ee2e280f1996eb`; the final three-platform run is [#46140045503](https://github.com/Darkhero766/Vibeguard/actions/runs/46140045503). Windows, macOS and Ubuntu/Linux all passed 472/472 regression tests, MCP STDIO, all three synthetic benchmark sets and offline package/CLI/MCP smoke. All release reports have zero failed steps. The 30-file package-content SHA-256 is `edf7851ec847dce63f24c66b59b396bae770d69e9e4e52843709df1778a816b8` on all three operating systems.

The package remains unpublished and npm namespace ownership/availability is unverified. After separate owner-approved beta publication, the beta one-line bootstrap is `npx @vibesane/foxy@beta install`. The stable-channel example above remains a future post-stable-release UX; neither command is available against the local-only archive. Automated qualification does not complete live host acceptance or independent security review.


## Final Beta.6 implementation and Install MCP experience — 28 November 2026

The exact qualified Beta.6 source is `ca9de05d00672d9a3148deec13ee2e280f1996eb`; [workflow #46140045503](https://github.com/Darkhero766/Vibeguard/actions/runs/46140045503) passed on Windows, macOS and Ubuntu/Linux. Each OS reports 472/472 regression tests, 30 package files and the same content SHA-256 `edf7851ec847dce63f24c66b59b396bae770d69e9e4e52843709df1778a816b8`. The two-process SQLite initialization regression passes on each OS.

The website `/foxy` experience now includes:
- An Install MCP hero/footer entry point that takes users to the installation instructions.
- A one-line Beta.6 command card showing `npx -y @vibesane/foxy@beta install` after publication.
- A copy action guarded by `VITE_FOXY_BETA_INSTALL_ENABLED === 'true'`; the missing/false default remains disabled while unpublished.
- Step-by-step explanation of project root, target preview, explicit CLI consent and host trust.
- A static SEO route and no-JavaScript staging preview with matching evidence and a disabled button.

The browser never writes host configuration. Once the package is published with owner approval, the website flag can be set only after verifying npm namespace ownership and package provenance/signing. The CLI remains responsible for project-scoped config, consent, write verification and rollback. Hooks/skills and completion enforcement remain separate opt-ins.
