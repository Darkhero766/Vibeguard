# Foxy Universal Installer — Design and Acceptance Plan

Status: design proposal for PR #70; no install, publication, production deployment, or host configuration performed by this document.

## Product objective

Make Foxy installation a short, predictable, auditable flow. Preferred user experience:

```sh
npx @vibesane/foxy install
```

This is a target command, not an existing or qualified command. The current beta remains a checkout-based installation until implementation, packaging and host acceptance prove otherwise.

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
