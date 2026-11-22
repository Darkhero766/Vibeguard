# AgentShield MCP (read-only v0.2)

Build the scanner first from a trusted VibeSane checkout: `pnpm --filter @workspace/api-server build:agentshield`. Run server: `pnpm --filter @workspace/api-server agentshield:mcp`.

This server uses MCP stdio framing (Content-Length headers) and exposes read-only `scan_changed`, `list_findings`, `explain_finding`, and `status`. Client configuration example:

```json
{ "mcpServers": { "vibesane-agentshield": { "command": "pnpm", "args": ["--filter", "@workspace/api-server", "agentshield:mcp"] } } }
```

Only configure against repositories whose local execution context you trust. The tools do not run repository scripts or expose shell/fix/commit/deploy/network actions. Static heuristics are not a security certification. Scan output is bounded and excludes source excerpts. Timeout, scanner errors and incomplete coverage are UNKNOWN—not clean.
