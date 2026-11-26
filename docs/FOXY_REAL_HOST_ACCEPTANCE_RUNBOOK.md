# Foxy real-host acceptance runbook

## Purpose

This runbook captures the real application acceptance that automated Windows/macOS CI cannot establish. Use it with a locally built, unpublished Foxy candidate from the exact commit under review. Do not use production repositories, production credentials, or a real secrets corpus.

A green CI run is necessary but not sufficient for distribution. The host matrix below remains a human-controlled release gate.

## Candidate evidence

Record before testing:

- Candidate Git commit SHA:
- Package version and SHA-256:
- Operating system and build:
- Node.js version:
- Git version:
- Host application and exact version:
- Test date and operator:
- CI qualification run URL:

## Safe test fixture

Create two disposable local Git repositories:

1. **Authorized fixture** — contains synthetic files only, including one known safe file and one deterministic test fixture that triggers a supported scanner rule.
2. **Unauthorized fixture** — a sibling repository outside the authorized Git root.

Do not put actual credentials in either fixture. Use deliberately fake values that cannot authenticate anywhere.

## Per-host test sequence

For each host that will be advertised as supported:

1. Record the host version and OS build.
2. From the authorized fixture root, run vibesane doctor.
3. Run vibesane connect --agent <host> --cwd <authorized-fixture>.
4. Inspect the exact host configuration diff. Confirm only the managed vibesane-agentshield entry was added, its VIBESANE_ALLOWED_ROOTS_JSON contains only the canonical fixture root, its VIBESANE_JOB_STORE_NAMESPACE matches the host configuration domain, existing unrelated entries remain semantically unchanged, and a backup exists.
5. Restart the host. Approve the MCP server through the host's own trust/permission UI. Confirm the server starts without exposing credentials in its environment or logs.
6. Invoke status; confirm scanner readiness and configured workspace authorization.
7. Invoke scan_changed on the synthetic fixture; confirm the expected rule and bounded result are returned.
8. Invoke list_findings with the returned scan ID; confirm findings remain bound to the same workspace and baseline.
9. Invoke explain_finding for the expected rule; confirm deterministic mitigation guidance is returned.
10. On a disposable copy only, apply the suggested safe change and invoke verify_remediation; confirm the rescan reports the expected delta. This is static-rescan evidence, not runtime proof.
11. Attempt a scan against the unauthorized sibling fixture; confirm it is denied without reading its files.
12. Run vibesane disconnect --agent <host> --cwd <authorized-fixture>. Confirm only the exact unchanged managed entry is removed, unrelated entries remain, and the host stops offering the Foxy server after restart.

Repeat the sequence after a clean reinstall and after a second connect to confirm idempotence. Record all errors; do not silently skip a failed step.

## Host-specific notes

- **Claude Code:** validate the project .mcp.json destination and project trust/approval flow.
- **Codex CLI:** validate .codex/config.toml after the repository is trusted. Do not confuse MCP registration with Codex Stop-hook installation; lifecycle hooks are a separate permission-bearing feature.
- **Cursor:** validate .cursor/mcp.json, restart, and enterprise MCP controls if applicable.
- **Gemini CLI:** validate .gemini/settings.json and the MCP approval behavior for the installed CLI version.
- **Roo Code:** validate .roo/mcp.json and its MCP server enable/approval flow.
- **GitHub Copilot in VS Code and Copilot CLI:** The current beta uses the portable workspace-root .mcp.json format, which is also Claude Code's project file. Both clients can read that workspace entry. The global $COPILOT_HOME/mcp-config.json or ~/.copilot/mcp-config.json destination is not written by vibesane connect. The shared Claude/Copilot entry uses the shared foxy-workspace-mcp namespace; this does not establish safe simultaneous processes because the persistent queue holds an exclusive lock. Until the queue broker / same-host multi-instance design is completed, test these hosts one at a time on a given repository and do not claim simultaneous Claude/Copilot sessions.

## Platform-specific coverage

For both Windows and macOS, exercise:

- A repository path containing spaces and non-ASCII characters.
- A path with platform-native separators.
- A clean install prefix and a path with spaces in the Node.js executable path where practical.
- Repeated connect/disconnect cycles.
- An existing valid configuration with unrelated entries.
- Malformed JSON/TOML, oversized config, symlinked config file and symlinked config directory refusal.
- A customized managed entry and a conflicting server name; both must be left untouched.
- Interruption/failure during setup; no partial JSON/TOML file should be presented as a successful install.
- Two distinct host processes for the same authorized repository launched concurrently. Record whether each starts and can submit/read jobs without lock contention. The current queue lock intentionally permits one process per host-namespace/workspace store; do not count this as passed unless concurrent isolation is verified.
- A second host session after restart, including a tool call and explicit disconnect.

CI runner evidence does not replace these tests on real intended machines.

## Evidence record

| Host | OS | Host version | Connect | Restart / approval | Tool call | Unauthorized path denied | Disconnect | Operator / date |
|---|---|---|---|---|---|---|---|---|
| Claude Code | Windows | Pending | Pending | Pending | Pending | Pending | Pending | |
| Claude Code | macOS | Pending | Pending | Pending | Pending | Pending | Pending | |
| Codex CLI | Windows | Pending | Pending | Pending | Pending | Pending | Pending | |
| Codex CLI | macOS | Pending | Pending | Pending | Pending | Pending | Pending | |
| Cursor | Windows | Pending | Pending | Pending | Pending | Pending | Pending | |
| Cursor | macOS | Pending | Pending | Pending | Pending | Pending | Pending | |
| Gemini CLI | Windows | Pending | Pending | Pending | Pending | Pending | Pending | |
| Gemini CLI | macOS | Pending | Pending | Pending | Pending | Pending | Pending | |
| Roo Code | Windows | Pending | Pending | Pending | Pending | Pending | Pending | |
| Roo Code | macOS | Pending | Pending | Pending | Pending | Pending | Pending | |
| Copilot VS Code | Windows | Pending | Pending | Pending | Pending | Pending | Pending | |
| Copilot VS Code | macOS | Pending | Pending | Pending | Pending | Pending | Pending | |
| Copilot CLI | Windows | Pending | Pending | Pending | Pending | Pending | Pending | |
| Copilot CLI | macOS | Pending | Pending | Pending | Pending | Pending | Pending | |

## Security review gate

An independent reviewer must inspect at least:

- canonical workspace authorization, path traversal, prefix confusion, symlinks and file mutation during scans;
- bounded file reads, scanner subprocess arguments/environment/time/output limits, and cancellation behavior;
- MCP tool schemas, protocol negotiation, read-only annotations, error handling and unexpected JSON-RPC messages;
- job queue persistence, timeout, retry, cancellation, capacity and restart behavior;
- host config write/backup/rollback behavior, malformed/customized config handling and Windows path semantics;
- package file manifest, dependency provenance, checksum and third-party notices;
- disclosure of repository paths, source excerpts, secrets or other sensitive data in logs and artifacts.

Record the review report, reviewer identity, date, severity for each issue, remediation commit and retest evidence. No unresolved Critical or High issue may be waived by a green CI result.

## Release decision

Status remains **private beta / reviewer preview** until all applicable real-host rows are completed, an independent security review is recorded, package provenance is reviewed, and the owner explicitly approves distribution to named testers. This document is a test plan, not evidence that those steps have already happened.
