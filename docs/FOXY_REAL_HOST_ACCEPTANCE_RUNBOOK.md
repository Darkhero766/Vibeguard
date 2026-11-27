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
4. Inspect the exact host configuration diff. Confirm only the managed vibesane-agentshield entry was added or safely migrated, its VIBESANE_ALLOWED_ROOTS_JSON contains only the canonical fixture root, its VIBESANE_JOB_STORE_NAMESPACE matches the host configuration domain, existing unrelated entries remain semantically unchanged, and a backup exists. Repeat from an exact legacy beta entry and verify it migrates; modify one byte/field in a managed entry and verify the connector refuses to overwrite it.
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
- **GitHub Copilot in VS Code and Copilot CLI:** The current beta uses the workspace-root `.mcp.json`, which is also Claude Code's project file. Both clients share the `foxy-workspace-mcp` local SQLite queue namespace; simultaneous processes are intended to coordinate through transactional claims, worker leases and cancellation state. The global `$COPILOT_HOME/mcp-config.json` or `~/.copilot/mcp-config.json` destination is not written by `vibesane connect`. The new multi-process tests are pending exact-source Windows/macOS CI and real-host acceptance. Do not describe concurrency as release-verified until those checks pass.

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
- Two or more distinct host processes for the same authorized repository launched concurrently. Confirm they attach to the same SQLite DB when their host config shares a namespace; submit unique and duplicate idempotency keys; verify only one execution per idempotency key and the global worker cap; verify both processes can read job state and results; cancel a job from a different process; then terminate one worker abruptly and confirm only its running jobs become interrupted/UNKNOWN while another worker continues processing queued work.
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

## Multi-instance SQLite queue acceptance gate

The beta.5 candidate replaces the process-exclusive JSON snapshot with a local SQLite WAL database. Connections to the same host-namespace/workspace store coordinate writes through short BEGIN IMMEDIATE transactions. Each MCP process registers a worker row and refreshes a lease; job claims are atomic and the global concurrency/backpressure policy is enforced per shared store. Cancellation is stored centrally and observed by the owning worker's heartbeat. A stale worker lease turns that worker's running jobs into interrupted/UNKNOWN, never into clean results or automatic retries.

Host namespaces determine which MCP processes share a queue: Claude/Copilot share the workspace-root .mcp.json namespace; Codex, Cursor, Gemini and Roo each have dedicated namespaces; generic hand-entered MCP uses its own namespace. Same-namespace processes intentionally share queue history, idempotency and concurrency policy.

**Hard storage boundary:** this database uses SQLite WAL and must live on one machine's local filesystem. Do not place it on NFS, SMB, network shares, or cloud-synchronized directories. Startup must reject non-WAL mode, an unrelated database application ID, failed quick_check, and a live worker on another host.

The exact-source qualification suite must prove, on both Windows and macOS:
- independent processes can register against one DB without startup races;
- duplicate submissions with the same idempotency key coalesce and key reuse with a different fingerprint is rejected;
- the SQL worker-claim transaction never exceeds the shared concurrency limit;
- a process can observe another process's status/results and request cancellation;
- cancellation wins over a completion race and the owning process persists cancelled;
- abrupt termination expires the worker lease and marks only that worker's active jobs interrupted/UNKNOWN;
- queued work is subsequently claimable by surviving workers;
- two simultaneous beta.5 startups migrate a beta.4 snapshot exactly once, and startup refuses while the old jobs.lock owner is alive;
- graceful close, bounded retention, local permissions, and DB integrity remain correct.

These are code/test expectations until the workflow for the exact current PR head completes. Do not claim unrestricted simultaneous host support from the architecture alone.

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
