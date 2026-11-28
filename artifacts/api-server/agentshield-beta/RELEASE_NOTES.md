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

## Latest exact-source package qualification — 28 November 2026

The latest completed three-platform qualification is source `a0651317c1cb16170d563867adcf5ddff08d5927`, [workflow #46169706820](https://github.com/Darkhero766/Vibeguard/actions/runs/46169706820). Windows, macOS and Ubuntu/Linux all completed successfully.

- Regression suite: **479/479 passed on each platform**, with zero failures, cancellations or skips.
- Workspace TypeScript build, VibeSane frontend/API typechecks and frontend/standalone Foxy preview builds passed.
- Cross-platform connector regression tests and MCP STDIO integration smoke passed.
- Curated, holdout and additional adversarial synthetic benchmark gates passed.
- Offline package installation, CLI, MCP and launcher smoke passed.
- Package: `@vibesane/foxy@0.7.0-beta.6`; 33 packaged files.
- Canonical package-content SHA-256, identical across all three platforms: `2a0405717fd3a8873e74eded393de73a286c70fd71a2626c24cab841cc7a95fa`.
- Each report: `validation_passed_review_required`, release decision `candidate_for_independent_human_review`, `qualificationFailures=[]`, `failedSteps=[]`.

This qualification is tied to package source `a0651317c1cb16170d563867adcf5ddff08d5927`, not every later commit on PR #70. The current PR head at the last audit was `68f06d84865fdd17c2677d64a4821263efee5cce`, four commits ahead. The only changed paths in that four-commit delta are the Foxy web page, SEO generation and associated page/preview assertions; no API Foxy runtime/package source or publishing workflow changed. Those newer web/SEO changes have not yet had an exact-head Actions rerun, so rerun their page/build/preview checks before relying on the current branch's rendered install panel as newly validated.

The older licensing run #46159923973 failed on all three platforms at the regression gate (472/475). Its three stale license-update assertions were corrected in follow-up commits; it is historical and superseded by the successful 479/479 run above.

The package remains unpublished. This automated result is not an independent security review, real installed-host acceptance, security certification or publication approval.
## Security and coverage limits

Scanning is static heuristic analysis of supported changed files, not compiler-complete SAST, exploit validation or security certification. The benchmarks use synthetic, rule-targeted fixtures; they do not establish real-world precision/recall. A clean result is not proof that an application is secure.

Unsupported, ignored, missing, timed-out, truncated, raced or failed scans are incomplete/unknown and must not be treated as clean. The local completion gate is cooperative, not tamper-proof: a same-user process can alter local configuration, disable hooks, bypass MCP calls or modify files directly. Host hooks remain subject to host/project policy and permissions. Enforce delivery independently using required CI checks, protected branches and human review.

Manual acceptance in actual Claude Code, Codex CLI and Cursor versions on the supported operating systems remains required. The qualification workflow uses synthetic fixtures and does not certify all real repositories or host versions.

## Before any public launch

The owner must confirm legal rights and ownership assignments for all Foxy-authored material, approve third-party license attributions, verify npm organization/package ownership, configure the protected GitHub `npm-release` environment and npm Trusted Publishing, protect release tags, resolve the stacked PR merge conflicts, obtain an independent security review, and complete real-host acceptance. Publication is manual and gated; the workflow defaults to validation-only and cannot publish unless the owner explicitly opts in after all OS checks and environment approval.

Foxy is a local-first product. No source upload, telemetry, external beta invitation, npm publication, website install-button enablement or production deployment has been performed by this candidate preparation.
