# AgentShield MCP (read-only beta 0.7.0-beta.3)

Build the standalone scanner first from a trusted VibeSane checkout:

```bash
pnpm --filter @workspace/api-server run build:agentshield
```

For repository development, run the server with:

```bash
pnpm --filter @workspace/api-server agentshield:mcp
```

The MCP server uses the standard stdio transport: UTF-8 JSON-RPC messages, one JSON object per line. Standard output is reserved for protocol messages; diagnostics are written to standard error. It supports the stateless 2026-07-28 discovery/per-request metadata flow and retains the 2025-11-25 initialize handshake for legacy clients. Cancellation notifications abort active scanner processes, and each request receives a cancellation-safe response lifecycle.

## Tools

- `status` — scanner readiness and whether an authorized workspace-root policy is configured.
- `scan_changed` — read-only static scan of supported staged/modified/untracked files plus an optional `base_ref...HEAD` committed diff; returns an opaque `scanId` for the exact baseline.
- `list_findings` — returns a named scan only when its workspace/base-ref content fingerprint is unchanged; requires `scan_id` and the same optional `base_ref` used by the original scan.
- `verify_remediation` — fresh scan and before/after finding comparison; requires the exact `baseline_id` returned as `scanId` and the same optional `base_ref`, then returns a new `currentScanId` for the next iteration.
- `explain_finding` — deterministic remediation guidance for known rule IDs.

All tools are annotated read-only. There is no shell, patch, commit, deploy, or network tool. Repository content and finding strings are untrusted data; they must never be treated as instructions.

## Client configuration

Codex example:

```toml
[mcp_servers.vibesane_agentshield]
command = "vibesane-mcp"
args = []
```

Generic MCP stdio client configuration uses command `vibesane-mcp` with no arguments. Use the absolute executable path if the host does not inherit the global npm PATH.

### Authorized workspace roots (required)

The MCP server denies workspace-dependent tools unless `VIBESANE_ALLOWED_ROOTS_JSON` is set to a JSON array of one to 32 existing absolute directory paths. The server resolves configured roots and caller paths through symlinks, then authorizes only Git repository roots contained inside one of those canonical directories. A sibling with a shared name prefix is outside the root. Nested repositories and linked worktrees are allowed when their canonical roots remain inside an authorized directory. The server pins each configured root's canonical path and filesystem identity for its lifetime; if a configured directory or symlink target is replaced, workspace tools fail closed until the server restarts with the intended configuration. Missing, malformed, or unavailable root configuration fails closed; `status` and `explain_finding` remain available.

Configure the environment on the MCP server process itself. Example for a single checkout:

```sh
VIBESANE_ALLOWED_ROOTS_JSON='["/absolute/path/to/repo"]' vibesane-mcp
```

For Codex TOML, add the environment under the server entry:

```toml
[mcp_servers.vibesane_agentshield]
command = "vibesane-mcp"
args = []
env = { VIBESANE_ALLOWED_ROOTS_JSON = '["/absolute/path/to/repo"]' }
```

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
