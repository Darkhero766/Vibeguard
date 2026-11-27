# VibeSane engineering state

**Snapshot date:** 27 November 2026 (updated after the beta.5 storage review and design pass)  
**Repository:** `Darkhero766/Vibeguard`  
**Purpose:** portable source of truth for new engineering sessions. This file records observed state, not intentions or assumptions. Recheck GitHub refs and runs before every write.

## Product boundaries

VibeSane has separate but related workstreams:

1. **VibeSane web/GitHub SaaS** — remote repository analysis, account and repository ownership, billing, quotas, scan reporting, SUE product audit and GitHub integration.
2. **Foxy / AgentShield local MCP** — a local stdio MCP server and CLI for coding-agent workflows. Its documented MCP surface is read-only; the coding agent edits through its own host permissions. Local scanning does not make the SaaS release gates complete.
3. **AgentShield lifecycle hooks** — separate, optional host hooks. MCP registration does not install hooks, grant permission, or make host completion enforcement tamper-proof.

Do not conflate SUE checks, SaaS Phase 1/2, AgentShield Week 1–6, or Foxy MCP conformance evidence.

## Current branch and PR state

### PR #70 — Foxy beta.5 cross-platform connector and transactional multi-process queue

- State: **open, draft, unmerged**.
- Branch: `feat/agentshield-cross-platform-autoconnect`.
- Latest implementation candidate before the state-handoff commit: `a1d9865a32f9cd0840513086533d92c8e5d1ae3d`. It contains the storage-integrity and corrupt-shutdown fixes plus the first graphite/lime/warm-white design pass across the homepage, shared navigation, Foxy page and AgentShield page.
- Target branch: `feat/agentshield-beta-coding-agent-install`; base SHA remains `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`, while PR #69 has advanced to `ed5bf64...`. GitHub reports `mergeable=false`. Do not rebase, force-push, retarget or merge until stacked ancestry/diffs are reviewed and the owner approves.
- Package version: `0.7.0-beta.5`; minimum runtime Node.js `24.15.0` for built-in `node:sqlite`.
- Prior connector qualification [run #75](https://github.com/Darkhero766/Vibeguard/actions/runs/45861790387) passed on older source SHA `a9b4fc87fa202a0aaeab60f43ed6ec361e5ec01c`: 429/429 release tests plus 12/12 connector tests on Windows and macOS. It does **not** qualify beta.5, SQLite, migration or current source.
- Current exact-source status: no Foxy Actions workflow run or commit-status context exists for `a1d9865...`. Do not call beta.5 CI-qualified. The prior run #75 is for beta.4 SHA `a9b4fc...` only. No Actions workflow was triggered because the project handoff reports the Actions quota exhausted; no local result is claimed. The active runtime available for local execution was Node.js 22.16.0, below the package's required Node.js 24.15.0, and a suitable source checkout/runner was not available for this session.
- Host namespaces: Codex, Cursor, Gemini and Roo have dedicated namespaces; Claude Code and Copilot share workspace-root `.mcp.json`; generic MCP is `foxy-manual`. The default store path appends a SHA-256 fingerprint of the exact `VIBESANE_ALLOWED_ROOTS_JSON` to the namespace. `VIBESANE_JOB_STORE_DIR` is now a relocatable base directory and still receives the namespace/root suffix, so it cannot silently collapse host scopes.
- The queue uses SQLite WAL and `BEGIN IMMEDIATE` transactions, atomic global claims, per-process heartbeat/leases, cross-process status and cancellation, queue backpressure, and crash recovery. Stale worker jobs become `interrupted`/UNKNOWN and are not automatically retried as clean.
- SQLite schema v2 has a normalized unique `job_idempotency_keys` table with cascading references. Multiple client keys may alias a fingerprint-coalesced job; any key reuse for a different scan is rejected, including after completion/across processes. Aliases are capped at 16 per job and 3,200 total.
- Startup checks database file identity, Foxy application ID, WAL mode and `quick_check`; POSIX stores are restricted to owner-only directory/file modes. On Windows, POSIX chmod bits are not used as ACL evidence: the canonical store directory must remain below the current user profile and inherits the profile's ACL. Network, NFS, SMB and cloud-synced directories are unsupported.
- **Beta.4 migration:** beta.4 used one shared `~/.local/state/vibesane/agentshield/jobs.json` across repositories. Beta.5 reads that snapshot into host/allowlist-scoped DBs but imports only jobs whose canonical workspace is under the current process's authorized roots. Other-repository jobs are excluded; source JSON remains untouched. An absent/invalid allowlist with legacy records fails closed. A live beta.4 `jobs.lock` blocks migration. If no lock exists, beta.5 atomically publishes the durable `FOXY_BETA5_MIGRATION_GUARD_V1` marker at the same exclusive-create lock path before reading the snapshot; older beta.4 processes fail closed on that occupied/invalid legacy lock. A pre-existing verified stale beta.4 lock blocks migration and is left unchanged; the operator must verify all beta.4 processes are stopped, inspect/remove the stale lock manually, then retry. All beta.4 MCP processes must be stopped before upgrading; rollback to beta.4 after beta.5 migration is unsupported.
- New regressions present but **not yet source-matched CI-validated**: cross-root filtered shared migration with realpath/symlink/junction escape rejection; two simultaneous beta.5 stores sharing one legacy snapshot; durable lock marker/old-writer exclusion; live and stale beta.4 lock refusal; no-roots refusal; two-process global worker cap and idempotency; alias capacity without queue poisoning; cross-process cancellation; abrupt worker crash recovery including corrupt persisted payloads; SQLite integrity/file identity; foreign/unowned database refusal before WAL/permission mutation; graceful-shutdown recovery of corrupt active payloads; byte-accurate retention; no-ghost-worker startup cleanup; concurrent init/close; custom-root namespace isolation; Windows user-profile boundary; and package runtime/manifest tests. The queue test file currently defines 39 cases; this is not a passing result.
- Real installed-host acceptance for Claude/Codex/Cursor/Gemini/Roo/Copilot and independent human security review remain open release gates.

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

- PR #69's official MCP 2026-07-28 conformance gate and release qualification passed in run #71. The conformance HTTP adapter is test-only/loopback and uses synthetic fixtures; the shipping STDIO surface remains read-only.
- PR #69's recorded release evidence: 423 tests passed with no failed/skipped release steps. Benchmark corpora are synthetic rule-expectation fixtures, not real-world scanner accuracy, exploit validation or certification.
- PR #70's previous connector matrix passed on the older beta.4 source SHA in run #75. That run is not evidence for the current beta.5/SQLite implementation.
- GitGuardian's separate secret scan reports no secrets on the earlier beta.5 commit `f292e6a...`; this is not a build, test or security review.
- The implementation candidate `a1d9865...` has no matching Foxy Actions qualification or commit-status context. Queue tests and the website design changes are committed source, not verified passes/build output. A docs-only state-handoff commit will follow these implementation commits.
- Node.js 24.15.0+ is required. SQLite storage is local-machine only; Windows storage is restricted to the canonical current-user profile path, while POSIX storage is checked for owner-only mode bits.
- Real-host install/restart/approval/tool calls/unauthorized-root denial/disconnect and independent human review remain incomplete.

## Open engineering work — priority order

1. **Exact-source Windows/macOS qualification:** run the Foxy workflow on the exact new branch head when Actions quota is available, using Node.js 24.15.0+; capture per-platform job logs and artifacts. Do not reuse beta.4 run #75.
2. **Review actual CI results:** inspect Windows/macOS jobs, all 33+ queue tests, cross-process migration/claim/idempotency/cancellation/crash tests, package output, Node engine and generated README.
3. **Live host acceptance:** install/restart/approve/use/disconnect for real Claude/Codex/Cursor/Gemini/Roo/Copilot versions on Windows/macOS with disposable repos; include simultaneous same-namespace processes and upgrade from beta.4.
4. **Stack reconciliation:** PR #70 base is stale relative to PR #69 and GitHub says `mergeable=false`. Review complete commit ancestry and diff before any rebase/retarget; no force-push or merge without approval.
5. **Independent security review:** get an external reviewer report against the exact candidate, with severity, reproduction, remediation and retest evidence. Retrieve the exact prior 11-finding list before calling any issue closed.
6. **SaaS accuracy/launch gates:** issue #62 tracks independently labeled scanner-accuracy evidence; issue #63 tracks production security/migration/credentialed staging. Neither is resolved by Foxy CI or authorizes a production deployment.
7. **Website design qualification:** the first graphite `#0B1112` / lime `#C7F36A` / warm-white `#F4F6F0` pass is now committed to the shared design tokens, main scanner landing page, navigation, Foxy and AgentShield pages. Still required: actual Vite production build, route/SEO preview tests, desktop/mobile browser QA, keyboard/reduced-motion/accessibility review, and visual QA against the real signed-in dashboard and report states. The UI changes are not build-verified.


## 27 November 2026 session delta

### Storage integrity fixes committed — not yet executed

- Implementation commit: `099e6c20ea992927514e7fca849aaa998d5d9658` — SQLite identity/integrity validation now precedes persistent WAL and file-permission changes; non-empty databases without the Foxy application ID are rejected.
- Regression commit: `0289be5eacd98a3fee9a3a5220db0832659b3adb` — foreign/unowned database non-mutation tests and graceful-shutdown corrupt-payload recovery test.
- Graceful shutdown now validates active payload/index agreement. Corrupt payloads are rebuilt from the SQL ownership columns into an interrupted/UNKNOWN result, then the worker row is released transactionally.
- These are source-level review fixes; no test execution or CI qualification is claimed.

### VibeSane visual-system first pass committed — not yet build-verified

- UI commits: `6d9631099b94aec46102c03f09182a5ddc58e408`, `7ee15d33a616f8b085704fa9f2fee822d72fffab`, `80872c6e3552f573b798632cfff0c0526f4b57ca`, `8f1158b805b09c09d2feadf270f36930fdfbb1bc`, `a1d9865a32f9cd0840513086533d92c8e5d1ae3d`.
- The pass aligns shared design tokens, navigation, the working scanner homepage, Foxy and AgentShield to graphite/lime/warm-white. Existing scan/account flows and historical-only beta.4 metrics are retained; no invented accuracy, customer, or certification claims were added.
- The public experience is not build-verified. The next design gate is a real production build plus route, responsive, accessibility, keyboard, reduced-motion and signed-in scanner/report QA.

### Additional integration boundary confirmed

- `agentshield-mcp-sdk.mjs` creates the queue from `resolveAuthorizedRoots()`; a missing/invalid allowlist maps to an empty root list for migration isolation, and every `scan_start` independently calls `authorizeWorkspace()` before queue submission.
- `VIBESANE_JOB_STORE_DIR` relocates the base storage directory without removing host namespace or allowlist fingerprint scoping.
- This source inspection found no reason to relax the explicit root-authorization requirement. Continue to treat host integration and independent review as release gates.

### Session validation boundary

- No Actions workflow was triggered; project handoff reports quota exhaustion.
- No Windows/macOS run or commit-status context exists for the new implementation candidate. Existing beta.4 run #75 is historical.
- No local test/build result is claimed: available Node.js 22.16.0 is below the required 24.15.0, and no source-matched suitable runner was available.
- Production remains untouched; PR #70 remains draft and unmerged; no npm publication or public beta distribution.

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
