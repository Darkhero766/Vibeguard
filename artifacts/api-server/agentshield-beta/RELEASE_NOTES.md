# AgentShield 0.7.0-beta.3

Unpublished, local-only controlled beta candidate targeting macOS and Linux with Node.js 20 or newer. Linux x64 is qualified by the current evidence; macOS has not been exercised.

## Included

- A standalone local scanner and CLI with JSON and SARIF output.
- A read-only stdio MCP server with status, changed-file scan, findings, rule explanations and remediation verification tools.
- Required canonical workspace-root allowlisting through `VIBESANE_ALLOWED_ROOTS_JSON`.
- MCP pins configured root identities before processing client requests and fails closed if a configured root is replaced.
- Codex project skill and Stop hook, Claude Code project hooks, and a Cursor Stop adapter.
- `vibesane doctor` reports Claude Code and Codex hook configuration status; `vibesane mcp-doctor` validates the root allowlist without printing paths.
- Local package build/install support; the package is not published to npm.

## Security and coverage limits

Scanning is static heuristic analysis of supported changed files, not compiler-complete SAST or security certification. A clean result is not proof that an application is secure. Unsupported, ignored, missing, timed-out, truncated, raced or failed scans are incomplete/unknown and must not be treated as clean. Host hooks are user-configurable controls and can be disabled or bypassed. MCP tools are read-only; the coding agent uses its own permissions to make changes.

The beta does not support Windows. See the setup guide for the exact allowlist, MCP client, completion-gate, upgrade and uninstall steps. Keep the built archive and checksum locally; do not publish them.
