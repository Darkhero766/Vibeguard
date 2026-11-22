# AgentShield MCP (read-only 0.3.1)

Build the standalone scanner first from a trusted VibeSane checkout:

```bash
pnpm --filter @workspace/api-server run build:agentshield
```

For repository development, run the server with:

```bash
pnpm --filter @workspace/api-server agentshield:mcp
```

The MCP server uses the standard stdio transport: UTF-8 JSON-RPC messages, one JSON object per line. Standard output is reserved for protocol messages; diagnostics are written to standard error.

## Tools

- `status` — scanner readiness only.
- `scan_changed` — read-only static scan of supported changed files and baseline cache.
- `list_findings` — returns the last scan only when file-content fingerprints still match.
- `verify_remediation` — fresh scan and before/after finding comparison.
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

## Safety and coverage

The server verifies that the workspace is an absolute Git root, does not follow changed-file symlinks, hashes changed-file contents, bounds file counts/bytes/time/output, validates exact supported-file coverage, and checks the workspace did not change during a scan. Cached results are invalidated when content changes even if Git's porcelain status remains unchanged.

Unsupported changed files, truncated findings, malformed reports, timeouts, missing scanners, and workspace races produce partial or unknown results—not a clean pass. Static scanning covers only supported changed files and is not a security certification.

The server never runs repository scripts or imports customer application code. Only use it against workspaces the host is authorized to access.
