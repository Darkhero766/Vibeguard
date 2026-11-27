# VibeSane engineering state

**Snapshot date:** 27 November 2026  
**Repository:** `Darkhero766/Vibeguard`  
**Purpose:** portable source of truth for new engineering sessions. This file records observed state, not intentions or assumptions. Recheck GitHub refs and runs before every write.

## Product boundaries

VibeSane has separate but related workstreams:

1. **VibeSane web/GitHub SaaS** — remote repository analysis, account and repository ownership, billing, quotas, scan reporting, SUE product audit and GitHub integration.
2. **Foxy / AgentShield local MCP** — a local stdio MCP server and CLI for coding-agent workflows. Its documented MCP surface is read-only; the coding agent edits through its own host permissions. Local scanning does not make the SaaS release gates complete.
3. **AgentShield lifecycle hooks** — separate, optional host hooks. MCP registration does not install hooks, grant permission, or make host completion enforcement tamper-proof.

Do not conflate SUE checks, SaaS Phase 1/2, AgentShield Week 1–6, or Foxy MCP conformance evidence.

## Current branch and PR state

### PR #70 — Foxy beta.5 cross-platform connector and multi-process queue

- State: **open, draft, unmerged**.
- Branch: `feat/agentshield-cross-platform-autoconnect`.
- Exact current source head: `d02820b0fe7e0d6e6479d5482733a1d57ab857f3`.
- Target branch: `feat/agentshield-beta-coding-agent-install`; target/base SHA is still the older `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`, while PR #69 is now at `ed5bf64...`. GitHub reports `mergeable=false`. Do not rebase, force-push or merge until the full stacked ancestry/diff is reviewed and the owner approves.
- Package version: `0.7.0-beta.5`; minimum runtime Node.js `24.15.0` because it uses built-in `node:sqlite`.
- Prior connector qualification [run #75](https://github.com/Darkhero766/Vibeguard/actions/runs/45861790387) passed on older source head `a9b4fc87fa202a0aaeab60f43ed6ec361e5ec01c`: 429/429 regression tests and 12/12 connector checks on Windows and macOS. It does **not** qualify beta.5, the SQLite queue or migration changes.
- Exact current head workflow/status: **no matching run/check surfaced** for `d02820b...`. Treat the new queue implementation and all tests below as unqualified until the exact current SHA runs the Windows/macOS matrix.
- Host namespaces: Codex, Cursor, Gemini and Roo use dedicated namespaces; Claude Code and Copilot share the workspace-root `.mcp.json` namespace; generic MCP uses `foxy-manual`. `resolveJobStoreDirectory()` combines the namespace with a SHA-256 scope of the exact `VIBESANE_ALLOWED_ROOTS_JSON` value, separating different authorized-root sets.
- The process-exclusive JSON snapshot queue was replaced by `agentshield-jobs-store.mjs`: SQLite WAL; `BEGIN IMMEDIATE` transactions; atomic worker claims; global concurrency/backpressure per scoped DB; per-process worker registration/heartbeats; renewable leases; cross-process cancellation; and crash recovery. A worker whose lease expires has its running jobs marked `interrupted`/UNKNOWN, never resumed as clean.
- SQLite schema v2 includes a normalized `job_idempotency_keys` table with unique keys and cascading job references. Multiple client keys can alias one fingerprint-coalesced job; reuse of any key for a different scan is rejected, including after completion and across processes.
- Database startup verifies file identity and owner-only permissions, Foxy application ID, WAL mode and `quick_check`; it uses full synchronous commits and secure delete. SQLite is local-machine storage only, not NFS/SMB/network/cloud-synced storage.
- **Beta.4 migration:** beta.4 used one shared `~/.local/state/vibesane/agentshield/jobs.json` across projects. Beta.5 reads that legacy snapshot into each new host/allowlist-scoped DB, but imports only records whose canonical `workspace` is contained in that process's authorized roots. Jobs for sibling/unconfigured repositories are excluded. The original shared JSON remains untouched as a recovery copy. A missing/invalid allowlist with existing legacy jobs fails closed. All beta.4 MCP processes must be stopped before migration; a live `jobs.lock` blocks migration. A verified dead-PID lock is not deleted automatically, so an operator must inspect the file and clean it manually when appropriate.
- Regression tests added but **not yet source-matched CI-validated**: filtered shared beta.4 migration; live legacy writer refusal; stale-lock behavior; no-roots refusal; two independent workers sharing one DB with global concurrency cap; cross-process idempotency/alias reservation; cross-process cancellation; abrupt worker crash recovery; SQLite file/application-ID/WAL/quick-check/permission safeguards; byte-accurate bounded retention; no-ghost-worker cleanup after prune failure; concurrent init/close; namespace/root store-path derivation; and packaged Node-runtime/manifest checks.
- Real Claude/Cursor/Codex/Gemini/Roo/Copilot installed-host acceptance and independent security review remain open release gates.

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

- PR #69's official MCP 2026-07-28 conformance gate and full release qualification passed in run #71. The test-only HTTP adapter is loopback-only and uses synthetic resources/prompts/tools; the shipping STDIO server remains the actual 10-tool read-only Foxy catalog. Its smoke test asserts fixture tools are absent.
- PR #69 release evidence: 423 passing unit/integration/regression tests, with no failed/skipped release steps. Curated, holdout and adversarial benchmark corpora are synthetic rule-expectation tests, not real-world scanner accuracy, exploit validation or certification.
- PR #70's earlier connector matrix passed on older beta.4 source SHA `a9b4fc...` in run #75. The beta.5/SQLite implementation and current source are not covered by that run.
- Beta.5 contains cross-process tests for shared queue/global worker cap, idempotency and aliases, cancellation, crash recovery, filtered beta.4 migration, stale/live lock behavior, SQLite integrity, and worker lifecycle. These are **test cases present in source**, not pass evidence until the exact source revision completes CI.
- Node.js 24.15.0+ is required for the built-in SQLite backend. The store is local-machine only; network/cloud-synchronized filesystems are unsupported.
- Real-host install/restart/approval/tool calls/unauthorized-root denial/disconnect remain uncompleted across the advertised host/OS matrix. Independent human security review remains outstanding.

## Open engineering work — priority order

1. **Exact-source qualification:** obtain the Windows/macOS qualification workflow on current PR #70 head `d02820b...`. Do not reuse beta.4 run #75 as evidence for beta.5. Review the actual job logs and package artifact.
2. **Cross-process semantics:** after CI runs, review global concurrency, fairness/queue progress, duplicate-key races, alias persistence, cancellation/completion ordering, lease expiry, abrupt process crash, filtered beta.4 migration and shutdown races on both platforms.
3. **Real host acceptance:** test install, restart, host trust/approval, tool calls, unauthorized-root denial, disconnect and config preservation for each advertised host/version/OS using disposable synthetic repositories. Include simultaneous same-namespace host processes.
4. **Reconcile the stacked PRs:** PR #70 target SHA is stale relative to PR #69 and reports `mergeable=false`. Review ancestry and diffs; no force push, rebase or merge without explicit approval.
5. **Independent security review:** obtain a real reviewer report against the exact candidate, with severity, reproducible scenario, remediation and retest. Retrieve the exact 11-finding evidence set before declaring issues resolved.
6. **Installer/config race hardening:** review concurrent host-config edits, atomic replacement, symlink/junction and parent-directory behavior, backup and interruption recovery.
7. **SaaS release gates:** issue #62 tracks independently labeled scanner-accuracy evidence; issue #63 tracks production security/migration/credentialed staging gates. Both remain separate from Foxy MCP and neither authorizes production changes.

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
