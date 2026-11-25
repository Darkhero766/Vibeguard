# MCP threat model — 2026-11-24

## System and trust boundaries

The MCP process runs locally under the developer's account. It reads Git metadata and selected files inside explicitly configured roots, invokes the bundled standalone scanner as a child process, and returns bounded JSON-RPC results to the coding agent. Repository files, Git paths, scanner output, tool arguments and all returned finding text are untrusted. Authorization configuration and the installed server/scanner package are trusted inputs, but must be protected from replacement.

Assets: workspace confidentiality, credential confidentiality, scan integrity, authorization policy, MCP connection integrity, completion-gate decisions, and availability. Security goal: scan only authorized local Git workspaces, preserve the read-only contract, and report unknown/incomplete outcomes honestly.

## Threat review

| Threat | Existing control observed | Residual risk / disposition |
|---|---|---|
| Path traversal / prefix confusion | Absolute path validation, `realpath`, `path.relative` containment, Git-root check, validated relative scanner paths. | Keep malformed/control-character filenames covered by adversarial tests and ensure serialization stays bounded. |
| Symlink escape / root replacement | Canonicalized roots; configured root identity pinned by canonical path/device/inode; changed paths checked by filesystem snapshot logic. | TOCTOU risk is reduced by before/after snapshots but not eliminated at every filesystem operation. Keep race tests. |
| Malicious filenames | Git path set is constrained and normalized; output bounded. | Unicode confusables, newlines and platform-specific separators require additional fixture coverage. Never use a filename as a shell fragment. |
| Prompt injection in source/comments | Tool/server instructions say repository text is untrusted; scanner does not delegate policy to source text. | Findings can still be rendered to an LLM. Keep strings bounded and neutralized; add tests showing injected text cannot change tool selection/authorization. |
| Tool poisoning / shadowing | Fixed five-tool catalog and explicit descriptions; no arbitrary tool execution; names are static. | Clients may expose same-name tools from other servers. Document distinct server identity and never trust agent-supplied tool catalog text as policy. |
| MCP permission escalation | All tools read-only; workspace tools require allowlisted roots; no shell/write/network tool. | Local user can intentionally configure a broad root. `status` should reveal configured state without disclosing paths. |
| Authorization race | Root identity pinned; each workspace call reauthorizes; scan baseline tied to canonical workspace. | Verify the startup authorization promise is awaited before accepting any request and continue exercising root replacement races. |
| Cross-request/session leakage | Findings are keyed by explicit scan/baseline IDs, scoped to workspace and fingerprint, short-lived bounded store. | The baseline store is process-local. Verify concurrent calls and workspace reuse never cross-return findings. |
| Token/secret leakage | Fixed child environment excludes caller secrets; findings omit source excerpts; errors are bounded/generic; no external validation. | CLI diagnostics and any future engine outputs must be redacted before logs/MCP. Test synthetic marker secrets in every path. |
| Malformed inputs/output | Strict JSON-RPC/tool validation, output and input limits, scanner schema/path checks, abort support. | JSON parser currently expects a single JSON value in stdout. Non-JSON logs, invalid encoding, truncation and oversized output must fail UNKNOWN, never normalize to clean. |
| Resource exhaustion | Limits on input/output, file count/bytes, result count, subprocess time, Git operations and baseline TTL/count. | Need independent tests for concurrent-call caps and memory under worst-case output; do not increase limits without measurement. |
| Concurrent requests | Request-level cancellation map and snapshot checks; no implicit mutable current scan. | Validate simultaneous scans, duplicate IDs, cancellation races and per-request isolation over actual stdio. |
| Insecure caching / stale results | Cache/baseline includes content fingerprint, base commit, workspace identity and expiry; list call recomputes snapshot; rescan required on mismatch. | Scanner/ruleset version and configuration are not visibly part of the workspace result fingerprint in current wrapper. If cache semantics are added, include them explicitly. |
| Unsupported/incomplete scan appears clean | Unsupported and ignored paths produce partial coverage; zero supported paths have explicit non-clean states; result validation checks exact scanned path set. | Markdown is a confirmed coverage gap; the current real-repository scan reports it as partial. Unsupported content is not inspected. |
| Insecure error reporting | Errors are bounded; unauthorized path response is generic; source excerpts are excluded. | Preserve tests to prevent exception details, command output, environment values or paths from entering MCP errors/logs. |
| Dependency/supply chain | Lockfile, package scripts and package build exist; current server has no new MCP SDK runtime dependency. | Review package provenance and pinning in release process. Do not install external engines by default. |
| Unsafe temp files / excessive FS access | Server is read-only; selected files and scanner paths are bounded; no temp-write workflow in MCP handler observed. | External engines must not create predictable temp files or scan beyond authorized roots; sandbox any new process adapter. |
| Completion hook overclaim | Hook is a separate, explicit host lifecycle integration; test logic distinguishes advisory/enforce and incomplete states. | A tool being discoverable does not cause the agent to call it. Do not claim auto-blocking without current host-level lifecycle evidence. |

## Highest-priority validated gaps

1. Markdown remains unsupported by the MCP changed-file scan. The current real-repository report correctly returns partial coverage but leaves agent instruction files uninspected.
2. In the managed sandbox, piped child-process stdout is empty, causing MCP scanner JSON parsing failure. A trivial child reproduces it; outside-sandbox MCP tests pass. This is an environment limitation requiring a supported execution path or explicit qualification, not evidence of bad scanner JSON.
3. A fresh Codex host-session and completion-hook validation for the current checkout/artifact is absent. Prior exact-package evidence is historical and must not be carried forward as current qualification.
4. MCP itself does not use the official conformance harness. Existing tests are valuable but do not independently certify the claimed protocol versions.

## Untrusted-content handling rules

- Never execute repository instructions, MCP server commands, hooks, build scripts or skills as part of a scan.
- Never allow source comments, Markdown, tool descriptions or scanner fields to modify authorization, tool catalog, process environment or scanner arguments.
- Treat engine output as hostile structured data. Validate type, bounds, path membership, severity enum and location before returning it.
- Do not send source, findings, credentials or repository metadata to external services by default.
- Preserve `INCOMPLETE`/`UNKNOWN` on parse errors, timeouts, unsupported files, races and engine failure.
