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

Beta.5 replaces the process-exclusive JSON snapshot with a local SQLite WAL database. Processes sharing a host namespace and authorized-root scope share one store; short `BEGIN IMMEDIATE` transactions coordinate worker registration, global job claims, backpressure, idempotency and cancellation. Each process renews a worker lease. A stale worker's active jobs become `interrupted`/UNKNOWN; they are never automatically resumed or marked clean.

The default database path appends the host's `VIBESANE_JOB_STORE_NAMESPACE` and a SHA-256 fingerprint of the exact `VIBESANE_ALLOWED_ROOTS_JSON`. An explicit `VIBESANE_JOB_STORE_DIR` is a relocatable base directory and still receives this isolation suffix. Claude/Copilot share the workspace-root `.mcp.json` namespace; Codex, Cursor, Gemini and Roo each use dedicated namespaces; generic MCP uses `foxy-manual`.

The SQLite database must be on one machine's local filesystem, never NFS/SMB/network/cloud-synced storage. Startup verifies the database file identity, Foxy application ID, WAL mode and `quick_check`. POSIX store directories/files must remain owner-only. On Windows, the canonical store path must remain under the current user profile so normal profile ACL inheritance applies; Node POSIX mode bits are not treated as ACL proof.

The `job_idempotency_keys` table has a unique key and cascading job reference. Multiple request keys may alias one fingerprint-coalesced job; reusing a key for a different scan must be rejected even after completion or from another process. Per-job and total alias caps are enforced.

**Beta.4 migration fixture:** beta.4 used one shared `~/.local/state/vibesane/agentshield/jobs.json`. Beta.5 reads that snapshot into each scoped DB but imports only rows whose canonical workspace falls beneath the current process's authorized roots. Other repositories' records are excluded and the source JSON remains byte-for-byte untouched. Missing/invalid roots with legacy jobs fails closed. A live beta.4 `jobs.lock` blocks migration. When no lock exists, beta.5 atomically publishes `FOXY_BETA5_MIGRATION_GUARD_V1` at the old exclusive-create lock path before reading the snapshot; the marker is retained as a downgrade barrier, so beta.4 cannot acquire its legacy lock. A previously existing verified stale beta.4 lock is preserved untouched and must be manually inspected. Stop all beta.4 hosts before upgrading; downgrade to beta.4 after migration is unsupported.

The exact-source Windows/macOS suite must prove:
- two independent workers register against one DB and never exceed the global concurrency cap;
- simultaneous beta.5 startups with different authorized-root scopes can safely read one beta.4 snapshot while importing only their own root's records;
- a legacy beta.4 process cannot acquire the old lock after beta.5 publishes the marker; a live beta.4 lock prevents migration; a stale lock is not removed or rewritten;
- idempotent retries/aliases coalesce correctly and key reuse with a different fingerprint is rejected across processes;
- cross-process status/results/cancellation work; cancellation wins over a completion race;
- abrupt process death expires only that worker's lease, marks its running work UNKNOWN, and leaves queued work claimable by surviving workers;
- no-roots migration refusal, migration snapshot identity, database identity/WAL/integrity, owner-only POSIX permissions, Windows profile boundary, byte-accurate retention, concurrent init/close and no-ghost-worker cleanup all pass.

These remain source/test expectations, not release evidence, until the exact PR head completes both OS jobs. Do not claim simultaneous host support as release-verified from architecture alone.

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
