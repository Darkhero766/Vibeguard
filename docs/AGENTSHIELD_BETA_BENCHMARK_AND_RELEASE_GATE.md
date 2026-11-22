# AgentShield beta release validation and benchmark scorecard

## Purpose
This is the release gate for the installable AgentShield beta. It is intentionally local and must not use GitHub Actions. It must be run on a trusted checkout with synthetic fixtures. The benchmark is evidence, not a security certification.

## Required test layers
1. **Unit/regression:** protocol, scanner rules, gate, baselines, SARIF, sanitization, cancellation.
2. **Transport:** process-level MCP client sends initialize/discovery, tool calls, malformed frames, cancellation, concurrent requests; stdout contains protocol only.
3. **Package:** build scanner, package tarball, verify manifest and SHA-256, install in isolated prefix, execute all package binaries, uninstall.
4. **Agent-host acceptance:** Codex, Claude Code and Cursor separately. Verify host discovery, first scan, explicit fix workflow, rescan, loop budget, permission handling and no false completion.
5. **Benchmark:** clean and intentionally vulnerable synthetic fixtures; record TP/FP/TN/FN, scan completeness, runtime, output size, and rule-specific confidence. Do not score unsupported coverage as true negative.
6. **Safety:** malicious repository text that attempts to instruct the agent, dummy secrets in findings, path traversal, symlinked files, dirty-file mutation during scan, unsupported language changes, scanner timeout and partial output.

## Minimum fixture suite
- Clean fixtures: JS/TS API route, Python utility, SQL schema, environment/config examples without secrets.
- Secrets: synthetic AWS-like key, generic bearer token, private-key marker; test masking and output exclusion.
- Injection: SQL interpolation; Python subprocess shell=True with request input; safe argv variant.
- Deserialization: request-shaped pickle vs trusted local cache.
- YAML: unsafe load vs safe loader.
- TLS: verify=False and unverified context vs secure configuration.
- Authorization: missing auth in selected route patterns; explicit auth and ownership checks.
- Supabase: privileged service key client-side, RLS disabled, permissive policies, server-only key.
- Regression: fix baseline finding, leave one finding, introduce a new finding, duplicate findings, line movement, changed path and unsupported changed path.

## Completion-gate acceptance cases

The local suite must prove all of the following for Claude Code Stop with `completionGate: enforce`:

- A complete scan with no findings at/above threshold does not block.
- A complete scan with a blocker returns the host's explicit block decision.
- An incomplete, timed-out, malformed, zero-coverage, duplicated-path, or raced scan blocks.
- Findings outside the reported scan path set invalidate the result.
- Previously flagged files omitted from the final scan block.
- An exhausted auto-fix budget never changes a blocking result into a pass.
- `advisory` mode preserves report-only behavior.
- Cursor follow-up and Codex MCP/skill workflows are tested as non-equivalent to hard delivery enforcement.

## Metrics and thresholds for beta claims
- **False-clean rate on blocker fixtures:** 0. Any missed expected blocker is a release blocker for that rule's advertised coverage.
- **Coverage honesty:** 100% of unsupported/partial/timeout/race cases must not return a passing status.
- **Output privacy:** 0 source excerpts or dummy credential values in MCP/SARIF diagnostics unless specifically designed for safe redacted display.
- **Delta correctness:** all expected removed/remaining/new finding multiplicities match fixture ground truth.
- **Transport reliability:** malformed and cancelled requests must not corrupt the stdio stream or create late responses.
- **Installability:** package installs and binaries start on a clean supported Node 20+ environment.
- **FP:** measure and publish per-rule false-positive counts; do not hide them in aggregate precision.

## Report template
Record beta build hash, platform, Node version, package SHA-256, fixture commit/hash, tests executed, test counts, scan time, TP/FP/TN/FN by rule, incomplete-scan behavior, integration host/version, known defects, and release decision. Mark anything not executed as NOT TESTED.

## Release readiness
A beta distribution requires: local test suite pass, package build/install smoke test, MCP process transport tests, at least one supported host acceptance test, synthetic fixture benchmark, review of package contents, and a dependency-stack consolidation plan. No Actions/CI invocation is permitted for this project validation.
