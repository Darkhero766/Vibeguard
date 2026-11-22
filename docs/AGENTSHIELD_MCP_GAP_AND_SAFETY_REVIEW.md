# AgentShield MCP gap and integration safety review

## Verdict (2026-11-22)

AgentShield is a local Claude Code hook/controller and CLI workflow. The inspected Phase 1/2 branch includes a bounded controller, changed-file gate, policy/state lifecycle, verification, installer, experimental AST worker, and capability registry. **An actual MCP server implementation was not identified in the reviewed paths.** Do not advertise AgentShield as an MCP server yet.

## Existing boundaries that are useful

- Static scanning is invoked as a child process with a timeout and output budget.
- The final gate fingerprints Git status and selected file bytes before/after scanning and rejects coverage gaps or concurrent changes.
- AST/taint analysis is optional and runs in a separate bounded worker.
- Local advisory AI is optional; source, paths, credentials and full findings are not sent to the local model request.
- Repair modes default to monitor; bounded attempts, time and state retention are configurable.
- State stores finding metadata rather than source snippets.

## Risks to address before exposing MCP tools

1. **Workspace confinement:** every tool must resolve and canonicalize the workspace and refuse paths outside it, symlink escape, non-regular files, and unsupported path forms.
2. **Tool scope:** start with read-only `scan_changed`, `status`, and `explain_finding`. Do not expose shell execution, arbitrary file reads, or generic patch application.
3. **Untrusted repo context:** treat repository content, comments, manifests, issue text and findings as untrusted data—not instructions. Tool descriptions and server prompts must reinforce this.
4. **Scan completeness:** tool responses must distinguish complete, partial, failed, timed-out, and zero-supported-files states. No state should be represented as a security pass.
5. **Resource limits:** cap files, bytes, AST nodes, execution time, response size, tool calls, and concurrency. Return explicit budget exhaustion.
6. **No hidden side effects:** read-only tools must not install hooks, change config, modify files, commit, deploy, access cloud credentials, or run repo scripts.
7. **Fix workflow separation:** future patch capability must be opt-in, diff-first, permission-controlled, sandboxed, and followed by targeted tests plus rescan. Verification cannot be claimed from a disappearing heuristic alone.
8. **Transport and secret hygiene:** MCP stdio must reserve stdout for protocol messages, use stderr for diagnostics, avoid forwarding environment secrets to scanner subprocesses, and avoid logging raw source or secret-bearing findings.
9. **Version/evidence:** responses should include scanner version, ruleset/version, workspace identifier only as a local-safe hash, coverage details and evidence references.

## Recommended minimal MCP v0 contract

- `scan_changed`: scan supported changed files; read-only. Return status, scanner/ruleset version, counts, severity breakdown, coverage and bounded finding summaries.
- `list_findings`: list findings from the current completed scan; no source dump.
- `explain_finding`: return deterministic guidance keyed by rule ID, with caveats and verification suggestions.
- `verify_changed`: run the final gate and relevant preconfigured tests only; never run arbitrary project scripts automatically.
- `status`: report scanner readiness, workspace confinement status, last scan status and whether the last scan was complete.

Do **not** add `apply_fix`, `run_command`, `shell`, `commit`, or `deploy` to v0.

## Acceptance tests required for implementation

- path traversal, symlink and workspace escape rejection;
- oversized workspace, file, input, output and request rejection;
- scan timeout, process failure, malformed JSON and partial coverage return UNKNOWN;
- changed files during scan invalidate result;
- malicious repository instructions cannot alter tool policy;
- stdout remains protocol-clean and diagnostics stay on stderr;
- concurrent calls are bounded and cancellation/timeout behavior is deterministic;
- findings never include raw secret values in default tool responses;
- no file modification occurs in read-only tool calls;
- scanner/ruleset version and completeness are always included.

## Current status

This document is an audit/engineering specification, not implementation or verification evidence. MCP support remains **not implemented/verified** until a server and the acceptance suite are added and run in a real local checkout.