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
- Current docs branch head: `941812ca0f20a6c1ef5226c5988789fb53d7d67a`. Functional connector qualification was run against code head `a9b4fc87fa202a0aaeab60f43ed6ec361e5ec01c`; later commits on this branch only updated continuity/review documentation.
- Target branch: `feat/agentshield-beta-coding-agent-install`.
- PR metadata reported target/base SHA `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`, and `mergeable=false`.
- Scope: project-scoped MCP auto-connect for Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code and GitHub Copilot; generic MCP stdio output; canonical Git-root allowlisting; backup/idempotent config; cross-platform path handling; Windows/macOS qualification; Foxy setup page.
- Exact-source GitHub Actions run [45861790387](https://github.com/Darkhero766/Vibeguard/actions/runs/45861790387), run #75: **success** on this PR head. PR evidence records 429/429 release-qualification tests and 12/12 connector regression tests on each of Windows and macOS, plus app/page builds and no-JavaScript preview checks. The validators say `validation_passed_review_required`, not security certification.

### PR #69 — Foxy beta.3 MCP/server candidate

- State: **open, draft, unmerged**.
- Branch: `feat/agentshield-beta-coding-agent-install`.
- Current head: `ed5bf64a3dced0bd890fd66cf0634e0ae888a951`.
- This session added: full per-check failure diagnostics, a test-only MCP conformance server/fixture catalog sharing the production SDK factory, canonical media-fixture validation, and a production STDIO regression that proves conformance fixtures never enter the real tool catalog.
- Exact workflow [45878440549](https://github.com/Darkhero766/Vibeguard/actions/runs/45878440549), run #71: **success** on PR head `ed5bf64...`. Backend strict typecheck, 52-file source syntax gate, MCP protocol/queue/real STDIO smoke, official MCP 2026-07-28 server requirements, web static build and full release qualification all passed.
- The release artifact reports `validation_passed_review_required` / `candidate_for_independent_human_review`; artifact checkout revision `2bf0abeff69a554d0043e4a24e91418250ceffa4` is the PR merge-checkout revision recorded inside the report, while workflow `head_sha` is the PR source head `ed5bf64...`.
- Release evidence: 423/423 integration/regression tests; curated benchmark 120 cases (60 TP, 59 TN, 1 FP, 0 FN; precision 98.36%, recall 100%); holdout benchmark 24 cases (12 TP, 11 TN, 1 FP, 0 FN; precision 92.31%, recall 100%); additional synthetic adversarial benchmark 30 cases (16 TP, 14 TN, no FP/FN); 52 syntax-checked files; unpublished offline package 26 files, 1,388,566 bytes, SHA-256 `5e67a63437c39d4dbecbe28a3e8218131317d67a40c3b6c800bd89148dd42c46`.
- These benchmarks are synthetic rule-expectation tests, not real-world exploit validation or scanner accuracy. The report has no failed/skipped steps, but explicitly requires independent review and manual Claude/Cursor/Codex host acceptance. Do not represent it as a security certification.

### Stacked PR dependency chain

- #65 `feat/local-validation-no-actions` is based on #61's `feat/agentshield-phase1-phase2-security`.
- #66 MCP audit specification is based on #65.
- #67 read-only MCP server is based on #66.
- #68 Codex validation handoff is based on #67.
- #69 beta.3 packaging is based on #68.
- #70 beta.4 connector is based on #69.

**Important drift to resolve:** PR #69 now has head `ed5bf64...`, while PR #70 metadata still reports its base SHA as `f6a16dc...` and `mergeable=false`. The beta.4 branch is therefore stale relative to the current beta.3 candidate. Confirm current branch ancestry and review the exact delta before any stack repair. Do not force-push, rewrite history or merge without explicit authorization.

## What is actually verified

- PR #70 cross-platform automated qualification passed on its functional source head and exact run above.
- PR #69's official 2026-07-28 MCP conformance gate and full release qualification passed in run #71. The test-only HTTP adapter is loopback-only and uses synthetic resources/prompts/tools; the shipping STDIO server remains the actual 10-tool read-only Foxy catalog. Its smoke test asserts fixture tools are absent.
- The release artifact records 423 passing unit/integration/regression tests and no failed/skipped release steps. The 120-case and 24-case primary corpora each include one false positive; see exact corpus data in the workflow artifact before making accuracy claims.
- The report’s additional Tasks, custom-header and JSON Schema extension scenarios are not scored in the frozen 2026-07-28 core requirement profile; do not claim those extensions are supported based on the core pass.
- Synthetic benchmark scores are synthetic rule-expectation measurements. They are not real-world scanner precision/recall, exploit validation or certification.
- Real-host installation, restart, approval, tool calls and disconnect have **not** been completed across the host/OS matrix just because platform CI passed.

## Open engineering work — priority order

1. **Live host acceptance:** test project-scoped install, restart, approval, tool calls, unauthorized-root denial, disconnect and config preservation using disposable repos on every advertised host/OS. Record exact app versions; CI configuration tests are not host acceptance.
2. **Multi-host queue isolation:** the connector currently writes the same allowed-root environment for different hosts and does not set `VIBESANE_JOB_STORE_NAMESPACE`; the queue's exclusive lifetime lock means simultaneous MCP processes for the same project may contend on one state store. Design and test host/session isolation or a broker before claiming simultaneous multi-host support.
3. **Reconcile the stack:** PR #70 base SHA is stale relative to #69 and reports `mergeable=false`. Review exact ancestry and diffs; no force push or merge without authorization.
4. **Independent security review:** obtain a real reviewer report against the exact current candidate, with findings, severity, reproducible scenario, remediation and retest. Retrieve the exact 11-finding records before declaring any resolved.
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
