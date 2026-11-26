# AgentShield independent security review packet

**Purpose:** supply an independent reviewer with the implementation and adversarial evidence needed to form their own findings. This is not a completed review and contains no requested conclusion.

## Review request

Review the candidate commit as a security engineer. Do not assume it is ready, and do not limit the review to the existing tests. Attempt to reproduce suspected failures safely using disposable synthetic repositories. For every finding, provide severity (Critical/High/Medium/Low/Informational), file and line, exploit scenario, reproducible evidence, recommended fix, confidence, and what you could not verify. Explicitly assess the 20 areas in the beta task: MCP authorization bypass, traversal, symlink escape, identity/switching, scanner evasion and false results, verification, completion-gate bypass/fail-open, timeouts, JSON-RPC validation, output/credential safety, baseline integrity, races, supply chain, installation, and missing adversarial tests.

## Primary implementation paths

- `artifacts/api-server/scripts/agentshield-mcp-server.mjs` — stdio MCP protocol, tool schemas, canonical workspace authorization, scan and verification orchestration, output validation.
- `artifacts/api-server/scripts/agentshield-baselines.mjs` — scan baseline storage and identity.
- `artifacts/api-server/scripts/agentshield-gate.mjs`, `agentshield-controller.mjs`, `agentshield-codex-stop.mjs`, `agentshield-stop.mjs`, `agentshield-hook.mjs` — completion policy and host adapters.
- `artifacts/api-server/scripts/agentshield-cli.mjs`, `vibesane.mjs`, `agentshield-install.mjs`, `agentshield-connect.mjs` — CLI, diagnostics, package hook installation, removal, and cross-host MCP configuration.
- `artifacts/api-server/src/lib/apiScanner.ts`, `extendedScanner.ts`, `extendedScannerV2.ts`, `apiScanner*.ts` — detector implementation.
- `artifacts/api-server/scripts/package-agentshield-beta.mjs` and `artifacts/api-server/package.json` — local package construction and package entry points.
- `artifacts/api-server/scripts/test-agentshield-adversarial.mjs`, `test-agentshield-mcp.mjs`, `test-agentshield-package.mjs`, `test-agentshield-connect.mjs`, `test-agentshield-gate.mjs`, benchmark corpora and `validate-agentshield-release.mjs` — tests and qualification.

Read the relevant current-commit diffs, the authorization regression tests, and the previous security findings below. Treat current tests and benchmark labels as claims to validate, not proof.

## Prior findings to independently recheck

An earlier review found that a client-supplied workspace could access a repository outside the intended authorized root. The current implementation adds a required process-level JSON allowlist, canonicalizes both allowlist and caller paths, authorizes repository roots only under those canonical roots, pins configured-root filesystem identity after resolution, rejects inaccessible/missing authorization configuration, and binds baselines to canonical workspace identity. Adversarial tests claim to cover root replacement, nested repositories/worktrees, sibling-prefix paths, traversal, symlinks, switching, and cross-workspace baselines. Independently test deletion after startup, replacement before/after first authorization, root symlink retargeting, duplicate and aliased roots, casing on case-insensitive filesystems, and concurrent environment/config changes.

The local host hook is a bounded continuation control, not a tamper-proof gate. Assess whether a coding agent or user can reach a clean result after an incomplete scan, invalid/moving base ref, unsupported path, timeout, hook recursion, disabled policy, or exhausted repair budget. Confirm semantics against actual host versions where possible.

## Additional issue found during maintainer verification

Before the latest candidate change, a synthetic reproduction replaced a configured allowlist directory after the MCP process started but before its first workspace request. The replacement repository was then authorized because identity pinning began on first use. The candidate now resolves and pins valid configured roots before accepting requests, and an adversarial test starts the actual local server, replaces the root before the first workspace call, and expects denial. Independently reproduce this boundary and review the startup ordering; do not rely on the regression test alone.

## Cross-platform and auto-connect review delta

The separate branch `feat/agentshield-cross-platform-autoconnect` adds a candidate one-command connector and Windows portability work. The reviewer should inspect the branch diff against PR #69's head and specifically test:

- Project Git-root resolution and exact per-project `VIBESANE_ALLOWED_ROOTS_JSON` scope.
- Host configuration writes to Claude `.mcp.json`, Codex `.codex/config.toml`, and Cursor `.cursor/mcp.json`; preservation of unrelated entries; backups; idempotence; and refusal on malformed, customized or symlinked configuration.
- Windows path quoting, drive-letter and case normalization, junction handling, `PATHEXT` discovery, Node executable path handling, child-process environment, and cleanup on interrupted writes.
- Codex project configuration trust requirements and the actual Windows behavior of command hooks.
- Generic `--agent mcp` output against a second independent MCP stdio client.

A generic MCP entry is only a fallback for hosts that implement MCP stdio; it does not provide a universal adapter to non-MCP agents. Auto-connect configures MCP only. It does not install lifecycle hooks, change host permissions or guarantee agent completion behavior.

The branch adds a Windows/macOS GitHub Actions qualification workflow, but at the time this packet was updated that workflow had not been run. Do not count the new tests, CI definition or Windows-specific code as passing evidence until the exact candidate workflow artifacts and, separately, real host sessions have been reviewed. The package candidate is `0.7.0-beta.4`; prior beta.3 reports are historical only.

## Safe review setup

Use a clean checkout of the exact candidate commit and synthetic Git repositories in a disposable directory. Do not use customer code, real credential material, production services, or destructive actions. Do not publish packages or invoke CI. Avoid copying credentials or private source into prompts. If the reviewer needs a live coding agent, use only its approved normal test account and synthetic content.

Run the local test/qualification commands documented in `docs/AGENTSHIELD_BETA_BENCHMARK_AND_RELEASE_GATE.md`. Preserve exact stdout/stderr, exit codes, commit, platform and package SHA-256 in the review result. Do not change tests, corpus labels, thresholds or blocker behavior during review.

## Evidence provided by this candidate

- `artifacts/api-server/agentshield-beta/qualification-report-2026-11-24.json` is the preserved qualification evidence; its `gitRevision` should match the source candidate being reviewed.
- Actual Codex CLI MCP, authorization-boundary, remediation, and Stop-hook results are recorded in `docs/AGENTSHIELD_BETA_READINESS_EVIDENCE.md`. They apply only to the recorded client version, Linux x64, and synthetic scenarios.
- Claude Code was not available in the maintainer environment during this review preparation. No Claude verdict is claimed.

## Validation delta for revision 631057ba82161827156c20675ee326a7e9c8c2dc

Treat the earlier `ab51b79...` qualification report and Codex acceptance notes as historical evidence for that exact revision and package checksum only. A fresh release-qualification attempt on `631057ba82161827156c20675ee326a7e9c8c2dc` rebuilt the scanner but ended `not_qualified`. In this managed sandbox, tests that spawn Node children through pipes receive empty child stdout; the MCP `scan_changed` call consequently returned `Scanner returned malformed JSON.` A direct CLI scan worked and returned `partial_coverage`. The current actual VibeSane changed-file scan is documented in [`REAL_REPOSITORY_SCAN_2026-11-24.md`](../artifacts/api-server/agentshield-beta/REAL_REPOSITORY_SCAN_2026-11-24.md). Do not treat the earlier Codex client run as a host run on this revision.

Current-attempt evidence: source syntax and scanner build passed; the full TAP run covering 23 test files reported 10 files passed and 13 failed (process-level child stdout/transport failures were observed; individual affected tests need reproduction outside this sandbox); MCP’s direct test file reported 20/24 cases passed and 4 failed; current curated and holdout benchmark scripts could not capture child scanner JSON; the in-process adversarial corpus passed 30 synthetic cases (16 TP, 14 TN, 0 FP, 0 FN; 463 ms measured). Package install smoke did not pass in the qualification runner. These are not release-qualification results.

The package source version remains `0.7.0-beta.3`. Current source HEAD is not qualified by the attempted run. The exact relevant change set can be generated for independent inspection with:

```sh
git diff --find-renames 56222e39d30b7f5280eaacac99c28c34c10a45b0..631057ba82161827156c20675ee326a7e9c8c2dc
```

## Required reviewer report format

For each finding:

```text
ID / severity / confidence:
Title:
Affected files and lines:
Exploit scenario and preconditions:
Reproduction and observed result:
Impact:
Recommended fix:
Regression test:
What remains unverified:
```

Close with an explicit list of reviewed areas, areas not verifiable, and whether any Critical or High issue remains. A reviewer may disagree with the candidate's qualification evidence.
