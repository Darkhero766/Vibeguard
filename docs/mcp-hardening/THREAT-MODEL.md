# MCP threat model — 2026-11-24

> **Superseding beta.5 implementation update — 2026-11-28:** The current candidate exposes ten MCP tools: five synchronous repository-scan/information tools and five asynchronous queue tools (`scan_start`, `scan_status`, `scan_wait`, `scan_results`, `scan_cancel`). Foxy never writes repository files or executes project code. It does write Foxy-managed local state: synchronous remediation baselines are in-memory; asynchronous job state and restorable baseline metadata are persisted in the user-scoped SQLite queue. Tool annotations distinguish these local mutations from read-only calls.
>
> Persisted baselines are now bound to the scanner artifact fingerprint, MCP runtime fingerprint, ruleset/version string and report-schema version. The runtime fingerprint covers `agentshield-mcp-server.mjs`, `agentshield-mcp-sdk.mjs`, `agentshield-jobs.mjs`, `agentshield-jobs-store.mjs`, `agentshield-baselines.mjs` and `agentshield-version.mjs`. Missing or mismatched provenance does not restore a usable remediation baseline. The implementation originated in `089c2ac...`; follow-up commits `e3edce0...` and `65cd27b...` fixed the restore-field and async-context propagation regressions caught by the first run. The current candidate is `65cd27b474db7863e1795a7d4dd59d44045e7177`; exact-source Windows/macOS run [#46109329318](https://github.com/Darkhero766/Vibeguard/actions/runs/46109329318) was still in progress when this note was updated. The previous run #46108972740 correctly reported `not_qualified` and `do_not_distribute`; do not mark the current candidate qualified until both jobs finish successfully.
>
> The 2026-11-24 observations below remain useful threat-model context, but the current implementation notes above supersede stale statements about tool count, read-only annotations and process-local-only baseline state.

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
| Tool poisoning / shadowing | Fixed ten-tool catalog across synchronous scan/info and asynchronous queue workflows; strict schemas; no arbitrary tool execution. | Clients may expose same-name tools from other servers. Document distinct server identity and never trust agent-supplied tool catalog text as policy. |
| MCP permission escalation | Repository tools remain read-only; no shell, project-file write, commit, deploy or network tool. `scan_changed`/`verify_remediation` update in-memory baselines; `scan_start`/`scan_cancel` update Foxy-owned SQLite queue state, with annotations that disclose these side effects. | A local user can intentionally configure a broad root. `status` should reveal configured state without disclosing paths. |
| Authorization race | Root identity pinned; each workspace call reauthorizes; scan baseline tied to canonical workspace. | Verify the startup authorization promise is awaited before accepting any request and continue exercising root replacement races. |
| Cross-request/session leakage | Findings are keyed by explicit scan/job IDs, workspace identity and content fingerprint. Async baselines are persisted only with bounded expiry and matching scanner/MCP runtime/ruleset/schema provenance; synchronous baselines remain process-local. | Verify concurrent calls and shared host namespaces never cross-return findings or restore a baseline after implementation drift. |
| Token/secret leakage | Fixed child environment excludes caller secrets; findings omit source excerpts; errors are bounded/generic; no external validation. | CLI diagnostics and any future engine outputs must be redacted before logs/MCP. Test synthetic marker secrets in every path. |
| Malformed inputs/output | Strict JSON-RPC/tool validation, output and input limits, scanner schema/path checks, abort support. | JSON parser currently expects a single JSON value in stdout. Non-JSON logs, invalid encoding, truncation and oversized output must fail UNKNOWN, never normalize to clean. |
| Resource exhaustion | Limits on input/output, file count/bytes, result count, subprocess time, Git operations and baseline TTL/count. | Need independent tests for concurrent-call caps and memory under worst-case output; do not increase limits without measurement. |
| Concurrent requests | Request-level cancellation map and snapshot checks; no implicit mutable current scan. | Validate simultaneous scans, duplicate IDs, cancellation races and per-request isolation over actual stdio. |
| Insecure caching / stale results | Baselines bind workspace identity, changed-file content fingerprint, resolved base commit, scanner artifact fingerprint, MCP runtime fingerprint, ruleset/version and report schema; workspace and scanner provenance are rechecked before use. | The fingerprint is an integrity/version boundary, not a signature or protection against a compromised local account/package installer. Independently review package provenance and runtime-file inventory. |
| Unsupported/incomplete scan appears clean | Unsupported and ignored paths produce partial coverage; zero supported paths have explicit non-clean states; result validation checks exact scanned path set. | Markdown is a confirmed coverage gap; the current real-repository scan reports it as partial. Unsupported content is not inspected. |
| Insecure error reporting | Errors are bounded; unauthorized path response is generic; source excerpts are excluded. | Preserve tests to prevent exception details, command output, environment values or paths from entering MCP errors/logs. |
| Dependency/supply chain | Lockfile, package scripts and package build exist; current server has no new MCP SDK runtime dependency. | Review package provenance and pinning in release process. Do not install external engines by default. |
| Unsafe temp files / excessive FS access | Server is read-only; selected files and scanner paths are bounded; no temp-write workflow in MCP handler observed. | External engines must not create predictable temp files or scan beyond authorized roots; sandbox any new process adapter. |
| Completion hook overclaim | Hook is a separate, explicit host lifecycle integration; test logic distinguishes advisory/enforce and incomplete states. | A tool being discoverable does not cause the agent to call it. Do not claim auto-blocking without current host-level lifecycle evidence. |

## Highest-priority validated gaps

1. Markdown and agent-instruction files remain outside the scanner's supported changed-file extensions. Their content is accounted for in workspace fingerprints and produces partial coverage, but it is not analyzed.
2. Real installed-host acceptance remains open for the advertised host/platform matrix. A successful STDIO/package smoke does not prove a host parses, trusts, launches, or disconnects Foxy correctly.
3. Independent security review remains open, including authorization/root replacement, SQLite ownership and migration, cross-process cancellation, host-config preservation, subprocess environment and package provenance.
4. The official conformance result for another PR or an earlier server revision must not be attributed to this ten-tool beta.5 candidate without exact-source evidence. Current beta.5 CI includes MCP STDIO/protocol smoke; retain a source-matched protocol-conformance review as a separate evidence item.
5. The managed-sandbox empty-child-stdout observation is environment-specific; it is not by itself proof of a product parser defect. Use supported CI/host runners for qualification and preserve UNKNOWN behavior on malformed output.

## Untrusted-content handling rules

- Never execute repository instructions, MCP server commands, hooks, build scripts or skills as part of a scan.
- Never allow source comments, Markdown, tool descriptions or scanner fields to modify authorization, tool catalog, process environment or scanner arguments.
- Treat engine output as hostile structured data. Validate type, bounds, path membership, severity enum and location before returning it.
- Do not send source, findings, credentials or repository metadata to external services by default.
- Preserve `INCOMPLETE`/`UNKNOWN` on parse errors, timeouts, unsupported files, races and engine failure.


## 28 November 2026 — current candidate status override

This section supersedes older candidate-SHA and in-progress-status notes earlier in this document.

- **Current code candidate:** `8ff17de5c5f9ce788e3447ae47263c77136cc3db`.
- **Exact-source Windows/macOS qualification:** [run #46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971) passed on both platforms, 454/454 tests per OS; both artifacts report `validation_passed_review_required`.
- **Current PR state:** PR #70 remains draft, open and unmerged. No production deployment or package publication was performed.
- **Earlier source results:** `a777754...` passed the prior 453/453-per-platform run #46055587747. Runtime-provenance candidate `089c2ac...` failed its source-matched run #46108972740 due to missing provenance propagation and a test-scope issue; follow-up commits fixed those. Candidate `65cd27b...` passed macOS but failed Windows at 453/454 in run #46109329318 due to a concurrent SQLite WAL-initialization lock. These failures remain part of the qualification history.
- **Latest fixes:** commit `24e08b1...` adds the installed bundled `agentshield-mcp-stdio.mjs` executable to the MCP runtime fingerprint. Commit `8ff17de...` adds bounded retries only for SQLite BUSY/LOCKED during WAL initialization, then restores the normal busy timeout. It still refuses any journal mode other than WAL.


The runtime fingerprint includes the bundled STDIO executable launched by installed hosts and six supporting MCP/queue modules: `agentshield-mcp-server.mjs`, `agentshield-mcp-sdk.mjs`, `agentshield-jobs.mjs`, `agentshield-jobs-store.mjs`, `agentshield-baselines.mjs` and `agentshield-version.mjs`. Missing or changed provenance prevents a persisted remediation baseline from being reused. This fingerprint is integrity/version binding, not a package signature or proof against a compromised local account or installer.

Independent reviewers should verify that the ESM bundle's `import.meta.url` resolves to the installed entrypoint on Windows and macOS, confirm the bundle is actually hashed at runtime, and test WAL contention under slow startup and endpoint-security file scanning. The retry budget must fail closed when exhausted.


## 28 November 2026 — final automated evidence update

The current code candidate `8ff17de5c5f9ce788e3447ae47263c77136cc3db` passed source-matched Windows/macOS qualification [#46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971). Each platform report records 454/454 tests, zero failed/cancelled/skipped tests, all release validator stages passed, and status `validation_passed_review_required`. The package contains 29 files on each OS with identical canonical content SHA-256 `42d5d09d7a5473020b0e7706f0a3bcf07172180db657a9c85c1aa663cb3571e6`.

The runtime baseline fingerprint now includes the installed bundled `agentshield-mcp-stdio.mjs` plus the six unbundled MCP/queue modules. The queue's WAL startup transition retries only transient SQLite BUSY/LOCKED conditions for a bounded period and refuses to proceed unless WAL is confirmed. This was qualified on Windows and macOS in the exact-source run.

This automated result does not close the independent review, real-host acceptance, or release-operations threat-model items. It is not certification and does not grant production authorization. Continue to treat Markdown agent instruction files as unsupported scan content/partial coverage; do not imply they are analyzed.
