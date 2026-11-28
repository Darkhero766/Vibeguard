# VibeSane Foxy 0.7.0-beta.6 — unpublished candidate

**Status:** internal release candidate only. The package `@vibesane/foxy` is not published to npm. No public launch, production deployment or external beta distribution is authorized.

## Included

- Standalone local CLI and offline-installable archive.
- Consent-first project-scoped install/connect/disconnect flows for Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code and VS Code GitHub Copilot MCP configuration.
- Local STDIO MCP server with repository-root authorization and no repository write, shell, patch, commit or deployment tools.
- Optional host-controlled Claude Code/Codex completion hooks and Cursor Stop adapter.
- SQLite-backed asynchronous scan queue with per-host/allowlist isolation, idempotency, leases, heartbeats, cancellation and crash recovery.
- Apache-2.0 package metadata plus package-root LICENSE, NOTICE and third-party license notices; the Apache-2.0 grant applies only to the Foxy distribution described by its notices.

## Runtime and package

- Node.js 24.15.0 or newer; Git required.
- No runtime npm dependencies in the published package.
- npm lifecycle scripts are not required; installation/publishing must use `--ignore-scripts`.
- Windows, macOS and Ubuntu/Linux are included in the qualification matrix. Actual host acceptance remains separate.

## Latest recorded package qualification

The last fully successful three-OS package qualification before the current release-workflow aggregation hardening was source `f97f95a48ffbdd3ef61a3d7da8ef57caf36a4ad3`:

- 477/477 regression tests passed on Windows, macOS and Ubuntu/Linux.
- MCP STDIO integration smoke passed.
- Curated, holdout and adversarial synthetic benchmark suites met their configured fixture targets.
- Offline package installation, CLI and MCP smoke passed.
- All 33 package file digests and the canonical package-content manifest SHA-256 matched across platforms: `39bb5a4893f49c2a035454bb9ac063eb09e41b5a05a826621558bd2280818b98`.
- The outer `.tgz` archive hash/size differed on Windows, but the extracted file contents and per-file digests matched exactly.

A later source revision strengthens the manual OIDC publishing workflow and adds strict cross-platform evidence comparison. Its exact-source three-OS CI run must pass before it supersedes the evidence above. See the [Foxy qualification workflow](https://github.com/Darkhero766/Vibeguard/actions/workflows/agentshield-cross-platform.yml).

## Security and coverage limits

Scanning is static heuristic analysis of supported changed files, not compiler-complete SAST, exploit validation or security certification. The benchmarks use synthetic, rule-targeted fixtures; they do not establish real-world precision/recall. A clean result is not proof that an application is secure.

Unsupported, ignored, missing, timed-out, truncated, raced or failed scans are incomplete/unknown and must not be treated as clean. The local completion gate is cooperative, not tamper-proof: a same-user process can alter local configuration, disable hooks, bypass MCP calls or modify files directly. Host hooks remain subject to host/project policy and permissions. Enforce delivery independently using required CI checks, protected branches and human review.

Manual acceptance in actual Claude Code, Codex CLI and Cursor versions on the supported operating systems remains required. The qualification workflow uses synthetic fixtures and does not certify all real repositories or host versions.

## Before any public launch

The owner must confirm legal rights and ownership assignments for all Foxy-authored material, approve third-party license attributions, verify npm organization/package ownership, configure the protected GitHub `npm-release` environment and npm Trusted Publishing, protect release tags, resolve the stacked PR merge conflicts, obtain an independent security review, and complete real-host acceptance. Publication is manual and gated; the workflow defaults to validation-only and cannot publish unless the owner explicitly opts in after all OS checks and environment approval.

Foxy is a local-first product. No source upload, telemetry, external beta invitation, npm publication, website install-button enablement or production deployment has been performed by this candidate preparation.
