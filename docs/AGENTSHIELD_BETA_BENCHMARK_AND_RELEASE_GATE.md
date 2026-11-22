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
- With a configured `base_ref`, committed changes ahead of that pinned base are scanned even when the worktree is clean. If the base-to-HEAD diff and worktree are both empty, enforce mode returns UNKNOWN and blocks; without a configured `base_ref`, a clean worktree cannot establish that committed work was scanned.
- Disabling AgentShield while completion enforcement is configured returns a block.
- An incomplete, timed-out, malformed, zero-coverage, duplicated-path, or raced scan blocks.
- Findings outside the reported scan path set invalidate the result.
- Previously flagged files omitted from the final scan block.
- An exhausted auto-fix budget never changes a blocking result into a pass.
- `advisory` mode preserves report-only behavior.
- Cursor follow-up and Codex MCP/skill workflows are tested as non-equivalent to hard delivery enforcement.

The accuracy runner measures true positives, false positives, true negatives and false negatives for every named target rule. Release qualification requires aggregate precision ≥0.90 and recall ≥0.85, **and** per-category precision/recall ≥0.60 on the 120-case curated set, and ≥0.50 on every category in the separately authored holdout set. The report must include all category metrics, misclassifications and off-target finding counts. These synthetic labels are useful regression evidence, not proof of exploitability or real-world recall.

## Metrics and thresholds for beta claims
- **False-clean rate on blocker fixtures:** 0. Any missed expected blocker is a release blocker for that rule's advertised coverage.
- **Coverage honesty:** 100% of unsupported/partial/timeout/race cases must not return a passing status.
- **Output privacy:** 0 source excerpts or dummy credential values in MCP/SARIF diagnostics unless specifically designed for safe redacted display.
- **Delta correctness:** all expected removed/remaining/new finding multiplicities match fixture ground truth.
- **Transport reliability:** malformed and cancelled requests must not corrupt the stdio stream or create late responses.
- **Installability:** package installs and binaries start on a clean supported Node 20+ environment.
- **FP:** measure and publish per-rule false-positive counts; do not hide them in aggregate precision.

## One-command local qualification

From `artifacts/api-server`, run `pnpm run test:agentshield:release-qualification`. It builds the scanner, executes the AgentShield scanner/MCP/gate/baseline/SARIF and related synthetic security regression suites, runs curated and separate holdout accuracy benchmarks, then runs the isolated offline package/install/CLI/MCP smoke. It writes `dist/agentshield-release-validation.json`. A passing result only qualifies the candidate for independent human review; real host acceptance, release stack consolidation, and security review remain mandatory.

## Local package smoke command

Run `node ./scripts/test-agentshield-package.mjs` from `artifacts/api-server` on a supported macOS/Linux Node 20+ workstation. It builds the scanner, creates the unpublished tarball, installs it into a temporary npm prefix, checks the CLI and doctor, scans a synthetic committed diff from a pinned fixture base, exercises MCP initialize/tool-list/status over stdio, then removes temporary files. This smoke command is not evidence until its output is captured from an actual run.

## Report template
Record beta build hash, platform, Node version, package SHA-256, fixture commit/hash, tests executed, test counts, scan time, TP/FP/TN/FN by rule, incomplete-scan behavior, integration host/version, known defects, and release decision. Mark anything not executed as NOT TESTED.

## Commit-aware scope implemented; acceptance still required

The scanner, Claude completion gate and MCP tools now accept a configured base reference. They combine the base-to-HEAD committed diff with staged, modified and untracked worktree paths. The gate fingerprints the resolved base SHA and file contents before/after scanning. Renames are mapped to destination paths; committed deletions, unsupported paths, malformed diffs, missing refs and scan races fail closed. MCP clients must pass the same `base_ref` to `scan_changed`, `list_findings` and `verify_remediation`. The ref must be a target/upstream branch distinct from the coding branch; an empty base-to-HEAD diff and empty worktree are UNKNOWN, not a clean pass.

Claude project setup example:

```bash
git fetch origin main
vibesane config --mode assist --completion-gate enforce --base-ref origin/main --cwd /absolute/path/to/project
```

The current CLI scans JavaScript/TypeScript, Python, SQL, JSON, YAML and `.env` paths. Markdown, Dockerfiles, unsupported manifests, binary/generated files and other unknown extensions are reported as unsupported; enforce mode blocks rather than silently skipping them. This is a known usability limitation that must be addressed with additional analyzers or an explicit, reviewed path-policy feature before broad organizational rollout.

The configured ref must exist locally, be the target/upstream of the topic branch (not the current coding branch), and should be refreshed before each coding session. Missing history in shallow clones, an unavailable ref or no common merge base results in UNKNOWN. Codex/Cursor still do not have a host-level hard completion gate equivalent to Claude Code Stop.

The new regression tests cover committed changes after a clean commit, remediation committed after the blocker, renamed files, deleted files, missing refs, dirty worktree paths unioned with committed changes, MCP workspace fingerprints and Claude Stop enforcement over committed changes. These are **test cases added, not test results** until the local qualification runner actually executes.

## Release readiness
A beta distribution requires: local test suite pass, package build/install smoke test, MCP process transport tests, at least one supported host acceptance test, synthetic fixture benchmark, review of package contents, and a dependency-stack consolidation plan. No Actions/CI invocation is permitted for this project validation.
