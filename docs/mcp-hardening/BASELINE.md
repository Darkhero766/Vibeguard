# MCP hardening baseline — 2026-11-24

## Scope and checkout state

The checkout is `/workspaces/Vibeguard`, on `feat/agentshield-beta-coding-agent-install` at `d4535a7` (`docs(agentshield): record beta validation evidence`). The branch is eight commits ahead of its upstream tracking ref. The worktree already contains a user edit to `pnpm-workspace.yaml` that removes `onlyBuiltDependencies` and adds `allowBuilds: esbuild: false`; this audit did not edit that file. No repository-level `AGENTS.md` was found.

The MCP implementation currently present is the **VibeSane AgentShield** local beta implementation, not a separate production VibeSane MCP package. Its code is in `artifacts/api-server/scripts/agentshield-mcp-server.mjs`, its standalone scanner is built from AgentShield code, and its setup and evidence are in `docs/AGENTSHIELD_MCP_SETUP.md` and `artifacts/api-server/agentshield-beta/`. This audit stays within that integration and does not alter separate AgentShield Phase 1/2 work.

## Architecture observed

- **Entry point and transport:** `agentshield-mcp-server.mjs`; custom newline-delimited JSON-RPC over stdio. STDOUT is protocol output, diagnostics go to STDERR. It supports the 2026-07-28 stateless discovery/per-request metadata flow and legacy initialize versions through 2025-03-26.
- **Tools:** `status`, `scan_changed`, `list_findings`, `verify_remediation`, and `explain_finding`. All advertise read-only annotations, reject unknown input keys, and have bounded schemas. There is no file-write, shell, network, commit, or deploy tool.
- **Authorization:** `VIBESANE_ALLOWED_ROOTS_JSON` is required for workspace tools. Roots and workspaces are canonicalized, pinned to filesystem identity for the server lifetime, checked as Git roots, and constrained by path containment. Missing/invalid policy fails closed.
- **Scanner:** MCP invokes the standalone `dist/agentshield.mjs` through `execFile`, with fixed environment, 15-second timeout, bounded output, changed paths, and optional base ref. Scanner results are parsed and checked against the exact expected changed path set. Filesystem snapshots are hashed before and after scanning to reject races.
- **Coverage:** changed staged, modified, untracked and optional base-to-HEAD paths are identified. Supported JS/TS, Python, SQL, JSON and YAML paths are scanned; Markdown is unsupported. Build/dependency/vendor directories and other configured paths are intentionally ignored and disclosed. Partial, ignored-only, unsupported-only, empty, and malformed outcomes are not represented as a clean pass.
- **Findings and baselines:** findings are normalized, bounded, omit source excerpts, and sanitize severities/confidence. Baselines are short-lived, size-bounded, scoped to workspace and content fingerprint. Remediation verification rescans and compares removed, remaining and new findings; its claim is explicitly static-only.
- **Hooks and Codex:** Codex setup documents a stdio server and a separately installed completion hook. Hook policy is opt-in/configurable. Prior readiness evidence records actual Codex-client and hook checks for a prior package/revision, not this HEAD. Codex CLI 0.172.0 is available in this environment, but no fresh Codex host session has yet been run against this checkout.
- **Optional engines:** no Semgrep, Trivy, OSV-Scanner, Gitleaks or CodeQL adapter is wired into this MCP scan path. AST/cross-file capabilities exist elsewhere in AgentShield and are opt-in; they should not be presumed active in the MCP scan.
- **Tests and CI:** package scripts provide targeted MCP/transport, Python, gate, SARIF, baseline, AgentShield scanner, hybrid/AST/taint and many VibeSane/API tests. No single root `test` script enumerates the complete suite. Relevant CI workflows and release scripts are under `.github/workflows` and `artifacts/api-server/scripts`.

## Baseline execution

Historical note: “369 passing tests” is a reported result for an earlier checkpoint. It is not the current result and cannot be inferred from the current package scripts.

| Run | Result |
|---|---|
| `pnpm --filter @workspace/api-server run test:agentshield:mcp` in the managed sandbox | Failed to get useful child-process output because the sandbox returned empty stdout from piped Node subprocesses. A trivial child writing `hello` also returned empty stdout. This reproduces the environment limitation, not a scanner JSON defect by itself. |
| Same MCP command outside the sandbox | **62 passed, 0 failed** across MCP, gate, Python, SARIF and baseline suites. |
| `pnpm --filter @workspace/api-server run test:agentshield:phase12` outside the sandbox | **163 passed, 0 failed**. |
| `pnpm --filter @workspace/api-server run test:agentshield:release-qualification` outside the sandbox | **Validation passed, review required** at `d4535a725963e152c1192554eede566cc2adee20`: source syntax, scanner build, **369/369 regression tests**, curated/holdout/additional-adversarial benchmarks, and isolated offline package/MCP smoke all passed. No steps failed or skipped. The generated evidence is `artifacts/api-server/dist/agentshield-release-validation.json`. |
| Direct built scanner on the repository | Returned valid JSON, `status: complete`, scanning the one currently changed supported YAML file (`pnpm-workspace.yaml`). It did not scan the entire repository. |

The release runner is the current confirmation that the historical **369 passing tests** still pass for this exact revision. It is a local product qualification for an unpublished beta artifact, not a security certification or production release. Its reported synthetic benchmark labels are rule expectations, not exploit validation or real-world precision/recall. No cold/warm/incremental latency distribution, P95, memory, or throughput measurement was produced.

Benchmark details from that qualification report:

- Curated synthetic target-rule corpus: 120 cases, 12 categories; TP 60, TN 59, FP 1, FN 0 (precision 0.984, recall 1.00). The one false positive was an application-specific authentication guard.
- Holdout synthetic target-rule corpus: 24 cases, 6 categories; TP 12, TN 11, FP 1, FN 0 (precision 0.923, recall 1.00). Its auth challenge also produced a custom-guard false positive.
- Independently authored adversarial synthetic corpus: 30 cases, 9 categories; TP 16, TN 14, FP 0, FN 0. These are rule-expectation labels and not independent exploit validation.

The corpus descriptions and labels are explicitly heuristic/curated; do not use these scores as production scanner precision/recall claims.

## Historical gaps checked against current evidence

- **Markdown:** remains unsupported in the changed-file MCP scan. The current checked-in real-repository report records 31 changed paths, 22 supported files scanned, 9 Markdown paths unsupported, `partial_coverage`, and 9 heuristic findings. Those findings were reviewed as synthetic test/benchmark fixtures; none was confirmed as an application vulnerability. The scan did not cover unchanged files or the full tree.
- **Malformed scanner JSON:** the checked-in real-repository MCP observation reports `Scanner returned malformed JSON`. This is reproducible in the managed sandbox because child stdout is empty even for a trivial process. The direct scanner emits valid JSON and the MCP suite passes outside the sandbox. Thus no product parser bug is established by this reproduction; host-level verification remains valuable.
- **Codex transport and hooks:** an earlier installed-package evidence document contains successful Codex MCP client and completion-hook checks for a previous exact artifact. These do not qualify the current HEAD/package. Current unit/integration tests cover stdio transport and lifecycle gate logic, but a fresh host session is still missing.
- **Fresh Codex CLI attempt:** Codex CLI 0.172.0 was invoked with an ephemeral MCP server configuration and a status-only request. It stopped before starting a session because Codex could not initialize its in-process app server in the read-only Codex home; Codex also reported that project-local MCP configuration was untrusted. No trust was persisted and no user configuration was changed.
- **Coverage and remediation:** coverage is path-accounted for the changed-file scope and fails closed on unsupported paths. Verification compares findings after a fresh scan and labels its evidence static-only. It does not independently establish runtime exploitability or fix correctness.

## Reproduction commands

```sh
pnpm --filter @workspace/api-server run test:agentshield:mcp
pnpm --filter @workspace/api-server run test:agentshield:phase12
VIBESANE_ALLOWED_ROOTS_JSON='["/absolute/path/to/repository"]' \
  node artifacts/api-server/dist/agentshield.mjs scan --changed --cwd /absolute/path/to/repository --format json
```

The last command scans changed files only and must not be described as a full-tree assessment.
