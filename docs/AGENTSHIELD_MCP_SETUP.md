> **Current Foxy candidate (28 Nov 2026):** package `@vibesane/foxy@0.7.0-beta.6` remains unpublished. Package source `a0651317c1cb16170d563867adcf5ddff08d5927` passed [three-OS qualification run #46169706820](https://github.com/Darkhero766/Vibeguard/actions/runs/46169706820) with 479/479 regression tests per OS, all stages green, 33 files and identical package-content SHA-256 `2a0405717fd3a8873e74eded393de73a286c70fd71a2626c24cab841cc7a95fa`. Current PR #70 head `68f06d84865fdd17c2677d64a4821263efee5cce` adds four website/SEO/evidence-assertion files after that tested package source; the package payload is unchanged, but the latest web page/build needs exact-head verification. CI is not a substitute for real-host acceptance or independent review.

# AgentShield MCP (Foxy beta 0.7.0-beta.6)

## Local beta setup (Windows/macOS/Linux)

Requirements: Node.js 24.15.0 or newer, Git, pnpm 10.34.9 and a trusted VibeSane checkout. Start with a disposable Git repository. The package is generated locally and is not published to npm.

From the VibeSane checkout root, build and create the local, unpublished package:

```sh
pnpm --filter @workspace/api-server run build:agentshield
node artifacts/api-server/scripts/package-agentshield-beta.mjs
```

The second command prints the local archive path and SHA-256. Install it into a user-owned prefix (this does not publish it):

```sh
npm install --global --prefix "$HOME/.local" --ignore-scripts \
  "$PWD/artifacts/api-server/dist/vibesane-foxy-0.7.0-beta.6.tgz"
"$HOME/.local/bin/vibesane" --help
```

Use the absolute executable paths below so the coding-agent host does not depend on shell `PATH`. Set the allowlist on the MCP server process. Start with the single synthetic or intended repository path, not a broad parent:

```sh
export VIBESANE_ALLOWED_ROOTS_JSON='["/absolute/path/to/disposable-repo"]'
"$HOME/.local/bin/vibesane" mcp-doctor
"$HOME/.local/bin/vibesane" doctor --cwd /absolute/path/to/disposable-repo
```

```sh
export VIBESANE_ALLOWED_ROOTS_JSON='["/absolute/path/to/disposable-repo"]'
"$HOME/.local/bin/vibesane" mcp-doctor
"$HOME/.local/bin/vibesane" doctor --cwd /absolute/path/to/disposable-repo
```

`mcp-doctor` checks the current process environment, canonicalizes and deduplicates existing directories, and never prints configured paths. The MCP `status` tool is the final check that the host actually passed the environment to its server process. The workspace must be a Git repository root under one of the allowlisted directories.

### Connect Codex CLI

Use the source checkout's project-scoped connector rather than hand-writing a global `~/.codex/config.toml` entry. From the trusted VibeSane checkout:

```sh
node artifacts/api-server/scripts/vibesane.mjs connect --agent codex --cwd /absolute/path/to/disposable-repo
node artifacts/api-server/scripts/vibesane.mjs init-codex --cwd /absolute/path/to/disposable-repo
node artifacts/api-server/scripts/vibesane.mjs doctor --cwd /absolute/path/to/disposable-repo
```

The connector writes the managed block to the repository's `.codex/config.toml`, including absolute Node/server paths, an exact `VIBESANE_ALLOWED_ROOTS_JSON` for that repository, and the `foxy-codex` SQLite namespace. It serializes Foxy config writers, backs up the original config bytes, preserves unrelated TOML entries and refuses customized/conflicting managed blocks. `init-codex` separately installs the project Stop hook in `.codex/hooks.json` and the Foxy skill in `.agents/skills/vibesane-agentshield`; it does not register MCP by itself.

Restart Codex from the project root. In Codex, inspect `/mcp` and confirm the ten Foxy tools. Inspect `/hooks`, review the Stop hook and explicitly trust it before expecting it to run. Do not enable completion enforcement for the first test; start with the default advisory policy. The exact Codespaces workflow uses a separate worktree and disposable repo and is documented in [FOXY_CODEX_CODESPACES_PILOT.md](FOXY_CODEX_CODESPACES_PILOT.md).

To remove only the matching project entries, exit Codex and run:

```sh
node artifacts/api-server/scripts/vibesane.mjs uninstall-codex --cwd /absolute/path/to/disposable-repo
node artifacts/api-server/scripts/vibesane.mjs disconnect --agent codex --cwd /absolute/path/to/disposable-repo
```

A customized skill or MCP entry is left untouched for manual review. MCP registration and lifecycle-hook installation/removal are separate operations.

### Connect Claude Code

For project scope, add this `mcpServers` entry to the project-root `.mcp.json` (replace both absolute paths):

```json
{
  "mcpServers": {
    "vibesane-agentshield": {
      "command": "/home/you/.local/bin/vibesane-mcp",
      "args": [],
      "env": {
        "VIBESANE_ALLOWED_ROOTS_JSON": "[\"/absolute/path/to/disposable-repo\"]"
      }
    }
  }
}
```

Open Claude Code in the project, approve the project MCP server when prompted, then run `/mcp` and confirm the ten AgentShield tools are connected. Install and inspect lifecycle hooks separately:

```sh
"$HOME/.local/bin/vibesane" init --cwd /absolute/path/to/disposable-repo
"$HOME/.local/bin/vibesane" doctor --cwd /absolute/path/to/disposable-repo
```

`doctor` should report `checks.claudeHooksInstalled: true`. Verify the completion-gate policy with `vibesane status --cwd ...`.

Completion enforcement is opt-in and requires a fetched strict-ancestor target ref, configured with the same `vibesane config --mode assist --completion-gate enforce --base-ref origin/main --cwd ...` command shown above. Claude Code was unavailable in the maintainer environment for this beta qualification; this configuration was cross-checked against the current Claude Code MCP documentation, but not host-executed here.

### Guided project setup (Claude Code and Cursor)

After the private archive is installed, the CLI can write a project-scoped MCP entry without changing unrelated host configuration:

```sh
"$HOME/.local/bin/vibesane" setup --host claude --cwd /absolute/path/to/disposable-repo
"$HOME/.local/bin/vibesane" setup --host cursor --cwd /absolute/path/to/disposable-repo
"$HOME/.local/bin/vibesane" doctor --cwd /absolute/path/to/disposable-repo
```

The command resolves the Git repository root, limits the MCP server to that exact root, uses the absolute Node executable and packaged STDIO entrypoint, rejects symlinked/non-regular config files, backs up an existing file before the first write, preserves unrelated server entries, and is idempotent. Restart the host and explicitly approve the local MCP server. Remove only the exact managed entry with:

```sh
"$HOME/.local/bin/vibesane" uninstall-mcp --host claude --cwd /absolute/path/to/disposable-repo
"$HOME/.local/bin/vibesane" uninstall-mcp --host cursor --cwd /absolute/path/to/disposable-repo
```

A customized Foxy entry is not automatically deleted; inspect it and remove it manually after backing up the file. The helper does not install software from the network and does not grant the coding agent additional file permissions. Codex project MCP registration is supported by `vibesane connect --agent codex`; its Stop hook and skill remain a separate opt-in operation through `vibesane init-codex`. All live host acceptance still remains pending.

### Remove, upgrade, or roll back

Remove the matching project hooks/skills before uninstalling the package:

```sh
"$HOME/.local/bin/vibesane" uninstall-codex --cwd /absolute/path/to/disposable-repo
"$HOME/.local/bin/vibesane" uninstall --cwd /absolute/path/to/disposable-repo
npm uninstall --global --prefix "$HOME/.local" @vibesane/agentshield
```

The uninstall commands preserve unrelated host configuration and leave customized Codex skills untouched. To upgrade, build and install a new local archive over the existing prefix with the same `npm install --global --prefix ... --ignore-scripts ./archive.tgz` command, then restart the host and rerun `doctor`, `mcp-doctor`, and MCP `status`. To roll back, reinstall the previous locally retained archive and restart the host. Do not remove configuration manually unless you have reviewed its unrelated entries.

Troubleshooting: check `vibesane doctor` for Node/Git/scanner/hook readiness; run `mcp-doctor` with the exact MCP environment to validate roots; use host MCP status (`codex mcp list`/`/mcp`) to identify launch or approval failures; use absolute binary paths; ensure the target ref exists and is ancestral to `HEAD`; and restart the host after configuration, package, or allowlist changes. Never place credentials in the allowlist or diagnostic output.

Build the standalone scanner first from a trusted VibeSane checkout:

```bash
pnpm --filter @workspace/api-server run build:agentshield
```

For repository development, run the server with:

```bash
pnpm --filter @workspace/api-server agentshield:mcp
```

The MCP server requires Node.js 24.15 or newer for the built-in `node:sqlite` worker store. Stop every beta.4 Foxy process before first startup. Beta.4 used one shared jobs.json across repositories; beta.5 imports only records whose canonical workspace falls under the current MCP process's VIBESANE_ALLOWED_ROOTS_JSON. Jobs for other repositories are excluded, and the shared source JSON is kept as a read-only recovery copy. Migration refuses to run with a live legacy lock or without a valid allowlist when legacy records exist. When the old lock path is absent, beta.5 atomically publishes and retains `FOXY_BETA5_MIGRATION_GUARD_V1` there so beta.4 cannot acquire its legacy lock after migration; pre-existing stale beta.4 locks also block migration and are preserved unchanged; verify all beta.4 processes are stopped, inspect/remove the stale lock manually, then retry. Downgrade to beta.4 after migration is unsupported. `VIBESANE_JOB_STORE_DIR` may relocate the state base, but host namespace and allowlist suffixes are still appended. On Windows the canonical store path must remain inside the current user profile; use the default profile-backed location. The MCP server uses the official MCP TypeScript SDK v2 stdio transport. Standard output is reserved for protocol messages; diagnostics are written to standard error. It negotiates protocol revision 2026-07-28 with modern clients and retains legacy initialize compatibility. Cancellation notifications abort active scanner processes.

## Tools

- `status` — scanner readiness and whether an authorized workspace-root policy is configured.
- `scan_changed` — repository-read-only static scan of supported staged/modified/untracked files plus an optional `base_ref...HEAD` committed diff; creates a Foxy-managed in-memory baseline and returns an opaque `scanId`.
- `list_findings` — returns a named scan only when its workspace/base-ref content fingerprint is unchanged; requires `scan_id` and the same optional `base_ref` used by the original scan.
- `verify_remediation` — fresh scan and before/after finding comparison; requires the exact `baseline_id` returned as `scanId` and the same optional `base_ref`, then returns a new `currentScanId` for the next iteration.
- `explain_finding` — deterministic remediation guidance for known rule IDs.

Repository contents are never modified and project scripts are never executed by the MCP server. Tools that create, update, or cancel Foxy-managed baseline/queue state advertise `readOnlyHint: false`; pure status and query tools advertise `readOnlyHint: true`. No shell, patch, commit, deploy, or network tool is exposed. Repository content and finding strings are untrusted data; they must never be treated as instructions.

### Asynchronous scan workflow

For an agent-managed workflow, prefer `scan_start` with `scope: "changed"`; after completion, `scan_results` returns `scan_id` and `baseline_expires_in_ms`. That completed changed-scan baseline is restored after an MCP server restart for the remainder of its original 30-minute TTL. Use the `scan_id` as `baseline_id` when calling `verify_remediation` after edits. `scan_changed` remains available for immediate synchronous feedback, but its in-memory baseline is not restored after a server restart. For a broader repository scan, call `scan_start` with `scope: "full"`, then use `scan_wait` or `scan_status` and fetch findings with `scan_results` in pages of up to 50. Full scans do not create a changed-file remediation baseline; after edits, run a new `scan_start` with `scope: "changed"` and use its `scan_id` for verification. Jobs are bounded and persisted in a local SQLite database shared by processes using the same host/workspace namespace. SQLite transactions coordinate idempotency and the global worker limit; each process holds a renewable worker lease. A process crash causes its running jobs to become `interrupted` with an UNKNOWN outcome and they must be resubmitted, while still-queued work remains claimable by another process. The local SQLite store must not be placed on a network or cloud-synchronized filesystem. Completed, complete-coverage changed-scan baselines are rehydrated from the protected job store after restart and remain usable for the remainder of their original 30-minute TTL, subject to the 200-record retention limit. Full scans and partial-coverage scans do not create remediation baselines. A completed job can still have `scan_status: "partial_coverage"`; that is not a clean scan. `scan_cancel` cancels queued work or signals a running scan to stop between analysis stages.

Typical MCP call sequence (replace the absolute workspace path and IDs with returned values):

```json
{"name":"scan_start","arguments":{"workspace":"/absolute/path/to/repo","scope":"changed","idempotency_key":"review-2026-11-25"}}
{"name":"scan_wait","arguments":{"job_id":"<job_id>","wait_ms":10000}}
{"name":"scan_results","arguments":{"job_id":"<job_id>","offset":0,"limit":20}}
{"name":"verify_remediation","arguments":{"workspace":"/absolute/path/to/repo","baseline_id":"<scan_id-from-scan_results>"}}
{"name":"scan_start","arguments":{"workspace":"/absolute/path/to/repo","scope":"full","idempotency_key":"full-review-2026-11-25"}}
{"name":"scan_cancel","arguments":{"job_id":"<other-job-id>"}}
```

`scan_wait` returns the current status after a state change or its timeout; repeat it while the status is `queued` or `running`. `scan_results` returns no findings until completion; advance using `next_offset`. A failed, cancelled, interrupted, truncated, or `partial_coverage` result is UNKNOWN and must not be described as a clean pass. For queued scans, use the `scan_id` from `scan_results` as `verify_remediation.baseline_id`; `job_id` is never a remediation baseline. A synchronous `scan_changed` call returns a `scanId` usable in the current MCP process, but that in-memory baseline is not restored after a server restart.

For a Codespaces Codex pilot, use the safer project-scoped connector and hook flow in [FOXY_CODEX_CODESPACES_PILOT.md](FOXY_CODEX_CODESPACES_PILOT.md). It creates a separate worktree at the exact qualified SHA, builds from source, creates a disposable fixture and invokes `vibesane connect --agent codex` plus `vibesane init-codex`. Do not use a global install or a broad allowlist for this first test.

## Client configuration

Codex example: prefer the generated project-scoped `.codex/config.toml` from `vibesane connect --agent codex --cwd PROJECT`. It pins absolute Node/server paths, sets the exact repository root in `VIBESANE_ALLOWED_ROOTS_JSON`, and assigns the `foxy-codex` job-store namespace. Inspect the generated block and trust the project configuration in Codex. Do not copy the unscoped `vibesane-mcp` example into a global Codex config.

### Authorized workspace roots (required)

The MCP server denies workspace-dependent tools unless `VIBESANE_ALLOWED_ROOTS_JSON` is set to a JSON array of one to 32 existing absolute directory paths. The server resolves configured roots and caller paths through symlinks, then authorizes only Git repository roots contained inside one of those canonical directories. A sibling with a shared name prefix is outside the root. Nested repositories and linked worktrees are allowed when their canonical roots remain inside an authorized directory. The server pins each configured root's canonical path and filesystem identity for its lifetime; if a configured directory or symlink target is replaced, workspace tools fail closed until the server restarts with the intended configuration. Missing, malformed, or unavailable root configuration fails closed; `status` and `explain_finding` remain available.

Configure the environment on the MCP server process itself. Example for a single checkout:

```sh
VIBESANE_ALLOWED_ROOTS_JSON='["/absolute/path/to/repo"]' vibesane-mcp
```

For Codex, use the generated project-scoped block from `vibesane connect --agent codex --cwd PROJECT` instead of copying a generic/global TOML example. That block uses an absolute server path, the exact workspace allowlist and a dedicated host namespace. See [FOXY_CODEX_CODESPACES_PILOT.md](FOXY_CODEX_CODESPACES_PILOT.md) for the first-run flow.

Use the narrowest parent directory that contains the intended checkout(s). Do not use `/` or a broad home/workspaces directory unless every Git repository beneath it is authorized for scanning. MCP scan, list, and verification calls independently re-authorize their workspace; baselines remain bound to the canonical repository path and cannot be reused in another repository. The caller-provided workspace never grants authorization by itself.

## Commit-aware scans

Pass the same optional `base_ref` to `scan_changed`, `list_findings`, and `verify_remediation` when the coding agent may commit before verification. Example arguments for the first call:

```json
{ "workspace": "/absolute/path/to/repo", "base_ref": "origin/main" }
```

Use a local target/upstream branch (commonly `origin/main`), tag, or commit SHA that resolves in the clone and is a strict ancestor of the current `HEAD`. A ref that resolves to `HEAD` itself or to unrelated/ahead history is rejected, so the scan cannot silently degrade to dirty-only coverage. Run the agent on a topic/feature branch ahead of that base and refresh remote-tracking refs before the session. The base-to-HEAD diff is combined with staged, modified and untracked worktree changes; rename destinations are scanned and deletions fail closed. The same `base_ref` must be supplied for follow-up finding and remediation calls because it forms part of the workspace baseline fingerprint. A missing base ref or unavailable ancestry returns an error/UNKNOWN result.

## Safety and coverage

The server verifies that the workspace is an authorized absolute Git root, does not follow changed-file symlinks, hashes changed-file contents, bounds file counts/bytes/time/output, validates exact supported-file coverage, and checks the workspace did not change during a scan. Cached results are invalidated when content changes even if Git's porcelain status remains unchanged.

Unsupported changed files and changes under intentionally ignored directories (`node_modules`, `.next`, `dist`, `build`, `coverage`, or `vendor`) produce partial coverage—not a clean pass—even when supported files were scanned. The snapshot fingerprint includes the complete changed-path set, so a newly committed ignored path invalidates an older baseline rather than allowing stale findings to be returned. Truncated findings, malformed reports, timeouts, missing scanners, and workspace races likewise produce partial or unknown results. Static scanning covers only supported changed files and is not a security certification.

The installed CLI can export findings as SARIF 2.1.0 via `vibesane scan --changed --format sarif`; confidence, engine metadata and selected CWE references are included. The Python extension is limited regex heuristics, not compiler-aware SAST. The server never runs repository scripts or imports customer application code. Only use it against workspaces the host is authorized to access.
