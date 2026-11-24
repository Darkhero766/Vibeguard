# AgentShield real-repository scan (2026-11-24)

## Scope and result

- Repository: `/workspaces/Vibeguard` (verified Git root).
- Branch and starting HEAD: `feat/agentshield-beta-coding-agent-install`, `631057ba82161827156c20675ee326a7e9c8c2dc`.
- Base: `origin/feat/agentshield-beta-coding-agent-install`, resolved to `56222e39d30b7f5280eaacac99c28c34c10a45b0`.
- Scope: union of supported staged/modified/untracked files and the base-to-HEAD committed diff. 31 changed paths were identified: 22 supported files scanned and 9 Markdown paths reported unsupported. The pre-existing `pnpm-workspace.yaml` edit was included as a changed YAML file; it was not changed by this validation.
- Result: **`partial_coverage`**, 22 files scanned, 9 unsupported paths, 9 heuristic findings. This is not a clean result and is not full-repository coverage.
- The scanner has no safe full-tree MCP mode. No unchanged source files, ignored build/dependency directories, Markdown contents, or unsupported formats were assessed.
- Evidence was captured from the CLI as JSON and summarized here. Finding values/source excerpts were not copied. No credentials were tested or sent externally.

## Findings

The scanner emits no reliable confidence rating for these findings (`confidence: unrated`). Review of the referenced code shows all nine are in scanner test or benchmark code that stores synthetic vulnerable snippets as strings or writes them into disposable fixtures. None is a confirmed vulnerability in the application code.

| Count | Severity and rule | Location(s) | Assessment |
|---:|---|---|---|
| 1 | Critical `command_injection` | `artifacts/api-server/scripts/benchmark-agentshield-adversarial.mjs:40` | Synthetic request-to-shell code is a benchmark fixture string. False positive for the benchmark implementation; the snippet is not executed by this corpus. |
| 1 | Critical `service_role_client` | `artifacts/api-server/scripts/test-agentshield-week4.mjs:299` | Synthetic browser-side key reference written to a temporary test file to assert detection. False positive for the test harness. |
| 1 | High `hardcoded_secret` | `artifacts/api-server/scripts/benchmark-agentshield-adversarial.mjs:30` | Explicitly synthetic placeholder string in a labeled fixture. No usable credential present. False positive for the benchmark implementation. |
| 2 | High `eval_usage` | `artifacts/api-server/scripts/benchmark-agentshield-adversarial.mjs:36,38` | One intentionally unsafe fixture string and one comment fixture. Both are corpus data, not executed application code. False positives for the benchmark implementation. |
| 1 | High `function_constructor` | `artifacts/api-server/scripts/benchmark-agentshield-adversarial.mjs:37` | Intentionally unsafe fixture string. False positive for the benchmark implementation. |
| 2 | High `service_role_client` | `artifacts/api-server/scripts/benchmark-agentshield-adversarial.mjs:42`; `artifacts/api-server/scripts/test-agentshield-week2.mjs:175` | Synthetic configuration strings/fixture source used to test detection; no actual key value or credential access. False positives for test code. |
| 1 | High `unsafe_sql_template` | `artifacts/api-server/scripts/test-agentshield-week4.mjs:309` | SQL concatenation is written into a disposable fixture to test the rule, not used by the test runner as a database query. False positive for the harness. |

Confirmed application vulnerabilities from this scan: **0**. Likely false positives/intentional detector fixtures: **9**. Potential false negatives: not measurable from this changed-file scan. The scanner’s inability to distinguish test fixture literals from executable application behavior is a demonstrated source of noise.

## MCP observation

The server was launched over stdio with an allowlist containing only this repository. Legacy MCP initialization succeeded, `tools/list` returned the five documented tools, and `status` returned `ready`, `scannerBuilt: true`, and `workspaceAuthorization: configured`. `scan_changed` returned a bounded tool error, `Scanner returned malformed JSON.`

An MCP `explain_finding` call returned bounded guidance without a workspace argument. A `scan_changed` request for the disposable synthetic repository at `/tmp/agentshield-synthetic-631057`, outside the sole allowed root, returned `isError: true` with `Workspace is not authorized or is not an accessible Git repository.` No file from that repository was scanned through the rejected request. The direct authorization regression test file passed in the 23-file TAP run; broader spawned-server adversarial cases remain subject to the child-process limitation below.

The underlying CLI returned a valid JSON `partial_coverage` report when invoked directly. In this managed sandbox, Node subprocess output captured through a pipe is empty (`execFile(process.execPath, ...)` also produced empty output for a trivial child); the server and several process-level tests rely on piped subprocess output. This environmental interaction prevented successful MCP scan/verification and does not establish how a normal developer host behaves. It remains an unresolved integration validation blocker for this run, not evidence of a product fix.

## Coverage and quality notes

- The exact path set was stable within this single scan; repeat-scan fingerprint stability was not verified against this repository because MCP scan execution hit the subprocess-output limitation.
- The CLI returned its structured partial-coverage status and explicit unsupported path list; it did not misreport a clean result.
- Findings are bounded and omit source excerpts in the MCP normalization layer. No secret value was emitted in this report.
- No broader full-repository scan was possible with the changed-files-only scanner. Unsupported Markdown and ignored directories remain unassessed.
- Remediation was not attempted against this repository. No application files were edited.
