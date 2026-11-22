# AgentShield coding-agent beta (0.7.0-beta.2)

## Beta status
This beta exposes AgentShield as a read-only MCP server for MCP-capable coding agents, including Codex, Claude Code and Cursor (client configuration varies). It is a developer-invoked/advisory scanner. **It is not yet a guaranteed automatic pre-delivery gate or agent remediation loop.** Hosts may choose when to call tools. Findings are heuristic; coverage can be incomplete.

## Requirements
- Node.js 20+
- Git
- macOS/Linux beta-tested target (Windows is not yet supported)
- A local repository workspace

## Build and package (maintainer)
From a trusted VibeSane checkout:
```bash
pnpm --filter @workspace/api-server build:agentshield
pnpm --filter @workspace/api-server package:agentshield:beta
```
The packaging script emits an unpublished beta tarball under `artifacts/api-server/dist`, reports a SHA-256 digest and validates its file manifest. Packaging and runtime validation are separate; inspect the output and run acceptance tests before distributing.

## Install the tarball
Once the maintainers share the built tarball:
```bash
npm install --global ./vibesane-agentshield-0.7.0-beta.2.tgz
vibesane --help
vibesane-mcp
```
For per-project installation, install the tarball locally and use the package's installed server path in client configuration. The scanner and MCP server are bundled; no repository scripts are executed by the scanner.

## Codex configuration
Add an MCP server entry in the Codex MCP configuration (typically `~/.codex/config.toml`; verify the location for your Codex version):
```toml
[mcp_servers.vibesane_agentshield]
command = "vibesane-mcp"
args = []
```
Restart Codex, then check its MCP server settings/status and ask it to call AgentShield `status`, followed by `scan_changed` for the absolute path of a disposable Git repository.

## Claude Code
Register the installed command as an MCP server using the Claude Code MCP configuration command for your version, for example:
```bash
claude mcp add vibesane-agentshield -- vibesane-mcp
```
Then verify with the client MCP list/status command and test only in a disposable repository.

## Cursor and other MCP clients
Configure an stdio MCP server with command `vibesane-mcp` and no arguments, using the client's documented configuration format. Restart the client and verify the server is connected.

## Tools
- `status`: readiness; does not imply scan coverage.
- `scan_changed`: read-only static scan of supported changed files.
- `list_findings`: latest complete scan cached in this server process; cache invalidates when workspace state changes.
- `explain_finding`: deterministic general remediation guidance.

No shell, patch, commit, deploy, or network tool is exposed. Scanner errors, incomplete coverage and unavailable scanner are not clean passes. Output is bounded and does not include source excerpts.

## Safe first test
Use a disposable Git repository containing synthetic examples (dummy secrets only). Ask the coding agent to explicitly invoke `scan_changed`, inspect its findings, and verify the scope. Do not use real secrets or customer code during beta evaluation.

## Current limitations
- MCP invocation is advisory/manual or host-selected; this beta cannot reliably intercept every coding-agent delivery.
- It does not autonomously instruct or require the coding agent to repair findings, nor guarantee re-scan after repair.
- Heuristic findings may be false positives or false negatives.
- No security certification or guarantee.
- Read-only MCP implementation is intended to limit risk, but should be run only against repositories you trust and in a workspace the host is authorized to access.
- No automated CI/GitHub Actions validation was executed as part of this beta handoff.
