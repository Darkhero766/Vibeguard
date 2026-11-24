# AgentShield independent security review packet

**Purpose:** supply an independent reviewer with the implementation and adversarial evidence needed to form their own findings. This is not a completed review and contains no requested conclusion.

## Review request

Review the candidate commit as a security engineer. Do not assume it is ready, and do not limit the review to the existing tests. Attempt to reproduce suspected failures safely using disposable synthetic repositories. For every finding, provide severity (Critical/High/Medium/Low/Informational), file and line, exploit scenario, reproducible evidence, recommended fix, confidence, and what you could not verify. Explicitly assess the 20 areas in the beta task: MCP authorization bypass, traversal, symlink escape, identity/switching, scanner evasion and false results, verification, completion-gate bypass/fail-open, timeouts, JSON-RPC validation, output/credential safety, baseline integrity, races, supply chain, installation, and missing adversarial tests.

## Primary implementation paths

- `artifacts/api-server/scripts/agentshield-mcp-server.mjs` — stdio MCP protocol, tool schemas, canonical workspace authorization, scan and verification orchestration, output validation.
- `artifacts/api-server/scripts/agentshield-baselines.mjs` — scan baseline storage and identity.
- `artifacts/api-server/scripts/agentshield-gate.mjs`, `agentshield-controller.mjs`, `agentshield-codex-stop.mjs`, `agentshield-stop.mjs`, `agentshield-hook.mjs` — completion policy and host adapters.
- `artifacts/api-server/scripts/agentshield-cli.mjs`, `vibesane.mjs`, `agentshield-install.mjs` — CLI, diagnostics, package hook installation and removal.
- `artifacts/api-server/src/lib/apiScanner.ts`, `extendedScanner.ts`, `extendedScannerV2.ts`, `apiScanner*.ts` — detector implementation.
- `artifacts/api-server/scripts/package-agentshield-beta.mjs` and `artifacts/api-server/package.json` — local package construction and package entry points.
- `artifacts/api-server/scripts/test-agentshield-adversarial.mjs`, `test-agentshield-mcp.mjs`, `test-agentshield-package.mjs`, `test-agentshield-gate.mjs`, benchmark corpora and `validate-agentshield-release.mjs` — tests and qualification.

Read the relevant current-commit diffs, the authorization regression tests, and the previous security findings below. Treat current tests and benchmark labels as claims to validate, not proof.

## Prior findings to independently recheck

An earlier review found that a client-supplied workspace could access a repository outside the intended authorized root. The current implementation adds a required process-level JSON allowlist, canonicalizes both allowlist and caller paths, authorizes repository roots only under those canonical roots, pins configured-root filesystem identity after resolution, rejects inaccessible/missing authorization configuration, and binds baselines to canonical workspace identity. Adversarial tests claim to cover root replacement, nested repositories/worktrees, sibling-prefix paths, traversal, symlinks, switching, and cross-workspace baselines. Independently test deletion after startup, replacement before/after first authorization, root symlink retargeting, duplicate and aliased roots, casing on case-insensitive filesystems, and concurrent environment/config changes.

The local host hook is a bounded continuation control, not a tamper-proof gate. Assess whether a coding agent or user can reach a clean result after an incomplete scan, invalid/moving base ref, unsupported path, timeout, hook recursion, disabled policy, or exhausted repair budget. Confirm semantics against actual host versions where possible.

## Additional issue found during maintainer verification

Before the latest candidate change, a synthetic reproduction replaced a configured allowlist directory after the MCP process started but before its first workspace request. The replacement repository was then authorized because identity pinning began on first use. The candidate now resolves and pins valid configured roots before accepting requests, and an adversarial test starts the actual local server, replaces the root before the first workspace call, and expects denial. Independently reproduce this boundary and review the startup ordering; do not rely on the regression test alone.

## Safe review setup

Use a clean checkout of the exact candidate commit and synthetic Git repositories in a disposable directory. Do not use customer code, real credential material, production services, or destructive actions. Do not publish packages or invoke CI. Avoid copying credentials or private source into prompts. If the reviewer needs a live coding agent, use only its approved normal test account and synthetic content.

Run the local test/qualification commands documented in `docs/AGENTSHIELD_BETA_BENCHMARK_AND_RELEASE_GATE.md`. Preserve exact stdout/stderr, exit codes, commit, platform and package SHA-256 in the review result. Do not change tests, corpus labels, thresholds or blocker behavior during review.

## Evidence provided by this candidate

- The local `artifacts/api-server/dist/agentshield-release-validation.json` is generated qualification evidence for the commit recorded inside it; verify its revision matches the reviewed source commit before relying on it.
- Actual Codex CLI MCP, authorization-boundary, remediation, and Stop-hook results are recorded in `docs/AGENTSHIELD_BETA_READINESS_EVIDENCE.md`. They apply only to the recorded client version, Linux x64, and synthetic scenarios.
- Claude Code was not available in the maintainer environment during this review preparation. No Claude verdict is claimed.

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
