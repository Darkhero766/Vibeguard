# VibeSane engineering state

**Snapshot date:** 26 November 2026  
**Repository:** `Darkhero766/Vibeguard`  
**Purpose:** portable source of truth for new engineering sessions. This file records observed state, not intentions or assumptions. Recheck GitHub refs and runs before every write.

## Product boundaries

VibeSane has separate but related workstreams:

1. **VibeSane web/GitHub SaaS** — remote repository analysis, account and repository ownership, billing, quotas, scan reporting, SUE product audit and GitHub integration.
2. **Foxy / AgentShield local MCP** — a local stdio MCP server and CLI for coding-agent workflows. Its documented MCP surface is read-only; the coding agent edits through its own host permissions. Local scanning does not make the SaaS release gates complete.
3. **AgentShield lifecycle hooks** — separate, optional host hooks. MCP registration does not install hooks, grant permission, or make host completion enforcement tamper-proof.

Do not conflate SUE checks, SaaS Phase 1/2, AgentShield Week 1–6, or Foxy MCP conformance evidence.

## Current branch and PR state

### PR #70 — Foxy beta.4 cross-platform connector

- State: **open, draft, unmerged**.
- Branch: `feat/agentshield-cross-platform-autoconnect`.
- Exact last verified head: `a9b4fc87fa202a0aaeab60f43ed6ec361e5ec01c`.
- Target branch: `feat/agentshield-beta-coding-agent-install`.
- PR metadata reported target/base SHA `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`, and `mergeable=false`.
- Scope: project-scoped MCP auto-connect for Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code and GitHub Copilot; generic MCP stdio output; canonical Git-root allowlisting; backup/idempotent config; cross-platform path handling; Windows/macOS qualification; Foxy setup page.
- Exact-source GitHub Actions run [45861790387](https://github.com/Darkhero766/Vibeguard/actions/runs/45861790387), run #75: **success** on this PR head. PR evidence records 429/429 release-qualification tests and 12/12 connector regression tests on each of Windows and macOS, plus app/page builds and no-JavaScript preview checks. The validators say `validation_passed_review_required`, not security certification.

### PR #69 — Foxy beta.3 MCP/server candidate

- State: **open, draft, unmerged**.
- Branch: `feat/agentshield-beta-coding-agent-install`.
- Head before this session: `00aec5ed749f1d9f8fc6d3f444b3caf86c47410d`.
- Commit made this session: `b98f0a8bea4d50a67d1bb9c0caae5bc1801e1cb8` — improves official MCP conformance failure diagnostics and enables verbose output.
- Latest observed workflow at snapshot time: [45875988720](https://github.com/Darkhero766/Vibeguard/actions/runs/45875988720), run #65, **in progress**. Do not assume it passes.
- Previous run [45875018297](https://github.com/Darkhero766/Vibeguard/actions/runs/45875018297), run #64, failed at the official MCP 2026-07-28 server requirements step. The ordinary MCP regression suite (91 tests), queue suite (23 tests), and real STDIO smoke passed before that step. The old failure wrapper hid stdout behind pnpm stderr; the new commit fixes observability, not yet the underlying conformance result.

### Stacked PR dependency chain

- #65 `feat/local-validation-no-actions` is based on #61's `feat/agentshield-phase1-phase2-security`.
- #66 MCP audit specification is based on #65.
- #67 read-only MCP server is based on #66.
- #68 Codex validation handoff is based on #67.
- #69 beta.3 packaging is based on #68.
- #70 beta.4 connector is based on #69.

**Important drift to resolve:** PR #69 now has head `b98f0a8...`, while PR #70 metadata still reports its base SHA as `f6a16dc...` and `mergeable=false`. Confirm current branch ancestry and rebase/refresh the stack before any merge discussion. Do not force-push or rewrite history without reviewing the exact diff and expected SHA.

## What is actually verified

- PR #70 cross-platform automated qualification passed on its recorded source head and exact run above.
- PR #69's MCP/unit/queue/stdio checks passed in run #64, but official MCP conformance failed and full release qualification was skipped. Run #65 must be inspected for the actual detailed result.
- The MCP server uses the official SDK and read-only tools; the production transport is stdio. The HTTP transport is test-only and must stay loopback-bound.
- Synthetic benchmark scores are synthetic rule-expectation measurements. They are not real-world scanner precision/recall, exploit validation or certification.
- Real-host installation, restart, approval, tool calls and disconnect have **not** been completed across the host/OS matrix just because platform CI passed.

## Open engineering work — priority order

1. **Official MCP conformance:** inspect run #65 logs and scenario report. Separate protocol defects from harness defects. Fix the implementation when a required behavior is genuinely missing; do not add demo/test tools to the production MCP catalog just to make a test pass. Keep test-only adapters isolated.
2. **Reconcile the stack:** verify PR #70's base ancestry against the latest #69 head, resolve its `mergeable=false` state, and preserve a clean reviewable diff. No merges.
3. **Independent security review:** obtain a real reviewer report against the exact current candidate, with findings, severity, reproducible scenario, remediation and retest. The separate “11 findings” evidence set is not present in the checked-in docs available at this snapshot; retrieve the exact records before declaring them fixed or closed.
4. **Live host acceptance:** complete the runbook using disposable synthetic repositories and exact host versions. Record install/config diff/restart/approval/tool use/unauthorized-root denial/disconnect on each advertised host and OS. Do not claim support from config-generation tests alone.
5. **Installer/config race hardening:** review concurrent host-config edits, atomic replacement semantics, symlink/junction and parent-directory behavior, backup handling and interruption recovery. Add deterministic regression tests before changing the implementation.
6. **SaaS release gates:** issue #62 tracks independently labeled scanner-accuracy evidence; issue #63 tracks production security/migration/credentialed staging gates. Both remain separate from Foxy MCP and neither authorizes production changes.

## Non-negotiable operating constraints

- **Do not use Codex** unless the owner explicitly changes this instruction. The owner previously reported approximately 7% Codex usage remaining; preserve it.
- Work only on the existing feature branches unless a new branch is explicitly needed and its base is verified.
- Do not merge PRs, deploy production, change production services/configuration/secrets, run production SQL, publish npm packages, or perform billing/Auth/grant mutations without separate explicit approval.
- Keep staging/reviewer previews isolated and noindex. A preview is not production.
- No secrets in chat, commits, CI logs or artifacts. Never log source snippets or credential values.
- Do not call a green CI run a security certification. Distinguish test, synthetic benchmark, real-host acceptance, independent review and production evidence.

## Session handoff protocol

At the start of a new chat:
1. Read this file and `START_HERE.md`.
2. Query live GitHub PR metadata and the latest relevant workflow runs; verify exact heads.
3. Check open blockers and dependency ancestry before editing.
4. Make one coherent, reviewable engineering change; avoid duplicating work from earlier PRs.
5. After a meaningful change, update this file with the new commit SHA, exact test/run evidence, what failed, and the next bounded tasks.

**Resume phrase:** “Continue VibeSane engineering from `docs/VIBESANE_ENGINEERING_STATE.md`; verify live GitHub state before changing anything.”
