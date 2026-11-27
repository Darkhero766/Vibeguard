# VibeSane engineering state

**Snapshot date:** 28 November 2026 (updated after exact-source beta.5 Windows/macOS release qualification)  
**Repository:** `Darkhero766/Vibeguard`  
**Purpose:** portable source of truth for new engineering sessions. This file records observed state, not intentions or assumptions. Recheck GitHub refs and runs before every write.

## Product boundaries

VibeSane has separate but related workstreams:

1. **VibeSane web/GitHub SaaS** — remote repository analysis, account and repository ownership, billing, quotas, scan reporting, SUE product audit and GitHub integration.
2. **Foxy / AgentShield local MCP** — a local stdio MCP server and CLI for coding-agent workflows. Its MCP tools are repository-read-only: they never edit repository files or execute project code. Scan baselines and asynchronous job state are written only to Foxy-managed in-memory/user-scoped local storage; the coding agent edits through its own host permissions. Local scanning does not make the SaaS release gates complete.
3. **AgentShield lifecycle hooks** — separate, optional host hooks. MCP registration does not install hooks, grant permission, or make host completion enforcement tamper-proof.

Do not conflate SUE checks, SaaS Phase 1/2, AgentShield Week 1–6, or Foxy MCP conformance evidence.

## Current branch and PR state

### PR #70 — Foxy beta.5 cross-platform connector and transactional multi-process queue

- State: **open, draft, unmerged**.
- Branch: `feat/agentshield-cross-platform-autoconnect`.
- Latest exact-source candidate: `a777754de234ed2e469cd9822ad4a1f5f881e095`. It pins MCP workspace authorization to startup root identities, corrects MCP local-state side-effect annotations, centralizes the beta.5 version, fixes queue test races and Windows profile-boundary fixtures, makes offline package archives repeatable on each OS, and exports a canonical per-file content manifest used by the release validator. Exact-source Windows/macOS qualification passed in run #46055587747; report details follow.
- Target branch: `feat/agentshield-beta-coding-agent-install`; merge base `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`. Current branch comparison: PR #70 is 357 commits ahead and 23 behind its base; GitHub reports `mergeable=false`. Preserve the diverged stack. Do not rebase, force-push, retarget or merge until the full ancestry/diff is reviewed and the owner approves.
- Package version: `0.7.0-beta.5`; minimum runtime Node.js `24.15.0` for built-in `node:sqlite`.
- Earlier connector run #75 was beta.4-only and is historical. Latest beta.5 exact-source Windows/macOS qualification is [run #46055587747](https://github.com/Darkhero766/Vibeguard/actions/runs/46055587747), passed on source SHA `a777754de234ed2e469cd9822ad4a1f5f881e095`.
- Exact-source beta.5 status: **PASSED** on Windows and macOS in run #46055587747. Each platform passed 453/453 regression tests (0 failed), strict frontend/API typechecks, website build and Foxy preview, connector regressions, MCP STDIO integration/protocol, curated/holdout/additional synthetic benchmarks, and offline package/install/CLI/MCP smoke. Both qualification artifacts report `validation_passed_review_required` / `candidate_for_independent_human_review`. Both 29-file packages have identical file SHA-256 manifests and aggregate content digest `7e65e968cbea7f9396148cdb3cfa6483efbf492aba4bf899ac675036812c401a`. The outer tarball hashes differ by host (`d4307e511b0c5c3c1b62f5e6361245b15ed94a54c5c42bf4ed7d2bab27a9dba9` macOS; `c64808c374e2fba9c7ec37ee75fdea71b49accc8c07bcaeb665836114ebd5af7` Windows) although all file digests match. This is archive/container metadata, not package file-content divergence. Workflow uses a feature-branch `push` trigger; no base/default branch changes were made. Node 24.15.0+ was used.
- Host namespaces: Codex, Cursor, Gemini and Roo have dedicated namespaces; Claude Code and Copilot share workspace-root `.mcp.json`; generic MCP is `foxy-manual`. The default store path appends a SHA-256 fingerprint of the exact `VIBESANE_ALLOWED_ROOTS_JSON` to the namespace. `VIBESANE_JOB_STORE_DIR` is now a relocatable base directory and still receives the namespace/root suffix, so it cannot silently collapse host scopes.
- The queue uses SQLite WAL and `BEGIN IMMEDIATE` transactions, atomic global claims, per-process heartbeat/leases, cross-process status and cancellation, queue backpressure, and crash recovery. Stale worker jobs become `interrupted`/UNKNOWN and are not automatically retried as clean.
- SQLite schema v2 has a normalized unique `job_idempotency_keys` table with cascading references. Multiple client keys may alias a fingerprint-coalesced job; any key reuse for a different scan is rejected, including after completion/across processes. Aliases are capped at 16 per job and 3,200 total.
- Startup checks database file identity, Foxy application ID, WAL mode and `quick_check`; POSIX stores are restricted to owner-only directory/file modes. On Windows, POSIX chmod bits are not used as ACL evidence: the canonical store directory must remain below the current user profile and inherits the profile's ACL. Network, NFS, SMB and cloud-synced directories are unsupported.
- **Beta.4 migration:** beta.4 used one shared `~/.local/state/vibesane/agentshield/jobs.json` across repositories. Beta.5 reads that snapshot into host/allowlist-scoped DBs but imports only jobs whose canonical workspace is under the current process's authorized roots. Other-repository jobs are excluded; source JSON remains untouched. An absent/invalid allowlist with legacy records fails closed. A live beta.4 `jobs.lock` blocks migration. If no lock exists, beta.5 atomically publishes the durable `FOXY_BETA5_MIGRATION_GUARD_V1` marker at the same exclusive-create lock path before reading the snapshot; older beta.4 processes fail closed on that occupied/invalid legacy lock. A pre-existing verified stale beta.4 lock blocks migration and is left unchanged; the operator must verify all beta.4 processes are stopped, inspect/remove the stale lock manually, then retry. All beta.4 MCP processes must be stopped before upgrading; rollback to beta.4 after beta.5 migration is unsupported.
- Queue/store, MCP, package and adversarial regression fixtures are now included in the exact-source release suite: 453/453 total regression tests passed on Windows and macOS. This does not mean every production-readiness checklist item has independent reviewer sign-off; host-level and operational assumptions remain open for manual/independent review.
- Real installed-host acceptance for Claude/Codex/Cursor/Gemini/Roo/Copilot and independent human security review remain open release gates.

### PR #69 — Foxy beta.3 MCP/server candidate

- State: **open, draft, unmerged**.
- Branch: `feat/agentshield-beta-coding-agent-install`.
- Branch status: advanced 23 commits from the PR #70 common base as last compared on 27 November. Re-query the exact head SHA and workflow state before any future stack repair.
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

**Important drift to resolve:** PR #69's branch is 23 commits ahead of the PR #70 common base; PR #70 is 296 commits ahead of that same base and GitHub reports `mergeable=false`. This is a diverged stacked dependency, not an ordinary fast-forward. Preserve both branches and complete a full merge-base/diff review before proposing a stack repair. Do not force-push, rewrite history, retarget or merge without explicit authorization.

## What is actually verified

- PR #69's official MCP 2026-07-28 conformance gate and release qualification passed in run #71. The conformance HTTP adapter is test-only/loopback and uses synthetic fixtures; the shipping STDIO surface is repository-read-only, with scan baselines and job queue state confined to Foxy-managed local storage.
- PR #69's recorded release evidence: 423 tests passed with no failed/skipped release steps. Benchmark corpora are synthetic rule-expectation fixtures, not real-world scanner accuracy, exploit validation or certification.
- PR #70 exact-source beta.5 CI now passes on Windows/macOS in run #46055587747. The older run #75 remains beta.4 historical evidence only.
- GitGuardian's separate secret scan reports no secrets on the earlier beta.5 commit `f292e6a...`; this is not a build, test or security review.
- Source candidate `a777754de234ed2e469cd9822ad4a1f5f881e095` has matching Windows/macOS CI and per-platform artifacts. The 453/453 result is a full automated suite, not security certification or real host acceptance.
- Node.js 24.15.0+ is required. SQLite storage is local-machine only; Windows storage is restricted to the canonical current-user profile path, while POSIX storage is checked for owner-only mode bits.
- Real-host install/restart/approval/tool calls/unauthorized-root denial/disconnect and independent human review remain incomplete.

## Open engineering work — priority order

1. **Live host acceptance:** install/restart/approve/use/disconnect on real Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code and VS Code/Copilot versions on Windows/macOS using disposable repos; verify unauthorized roots, cancellations, config preservation and simultaneous same-namespace processes.
2. **Independent security review:** send the exact candidate SHA and package content manifest to an independent reviewer; close or explicitly risk-accept each of the prior 11 findings with severity, reproduction, remediation and retest evidence.
3. **Stack reconciliation:** PR #70 remains 357 ahead / 23 behind its base and `mergeable=false`; review full ancestry/diff and propose a stack plan before any retarget/rebase.
4. **Release provenance and operations:** review per-file manifest, host-specific archive checksums, upgrade/downgrade and stale-lock procedures, data retention, support intake and recovery documentation.
5. **Production authorization:** remains not granted. No publication, merge or deployment is authorized by passing CI.
6. **SaaS accuracy/launch gates:** issue #62 tracks independently labeled scanner-accuracy evidence; issue #63 tracks production security/migration/credentialed staging. Neither is resolved by Foxy CI or authorizes a production deployment.
7. **Website design qualification:** the graphite `#0B1112` / lime `#C7F36A` / warm-white `#F4F6F0` system is committed to shared tokens, navigation, main scanner, Foxy, AgentShield and the regenerated static SEO route. The static route now states Node.js 24.15+, identifies beta.4 metrics as historical and says beta.5 exact-source CI is pending. Still required: actual Vite production build, route/SEO preview tests, desktop/mobile browser QA, keyboard/reduced-motion/accessibility review and signed-in scanner/report QA. The UI changes are not build-verified.


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


## 27 November 2026 — release-pipeline and production-readiness delta

### Release validator and package version

- Code commit: `12a1bf37ad9d756c46de8fc108e45fab402b0f5e` — release validator imports `PACKAGE_VERSION` from the package builder and uses it both to validate package smoke evidence and populate the qualification report. This removes a stale hardcoded beta.4 gate that would otherwise make beta.5 permanently unqualified.
- Regression commits: `f362a9b9cd75a9340bd76cb709beec6b3c555d4a`, `52b17cac7876175a9e8af37950ef2ad536daf70b`, `13a74ef706d531c92fbf2c21629b64cac141a36c` — package smoke guards that the validator imports the package version source and contains no beta.4 version gate. The test uses the file's existing assertion helper.
- This is a code-level consistency fix, not an executed release qualification.

### Static website and CI pipeline

- Queue-test quality correction: commit `b4737cf85a5e2fb9a826f2bed1ed99711251959d` disables the in-flight job's normal finish persistence in the corrupt-shutdown fixture. This forces the test through `unregisterWorker()`'s malformed-payload fallback and then verifies interrupted/UNKNOWN plus worker release. It is still an unexecuted test definition.

- SEO/route commits: `06b89eb92ea913ccf39541edb5a4155121e870a6`, `8f059e99be3fce8467c9983428f766711d27f66b`, `a83a993fe6425d6d61bf9177ef876cf78cc834cf` — rebuild the prerendered Foxy route with accessible contrast and the current graphite/lime/warm-white design. Remove the obsolete Node 20+ requirement and false claim that the current candidate passed Windows/macOS qualification. Beta.4's 429/429 and 12/12 counts are labeled historical; beta.5 exact-source CI remains pending.
- Test and workflow commits: `62d897d3c06daa7584c492db3de696732cc193b2`, `c3a462342fbd70f8fabd1d76ec6784b82dbb8c8c`, `f0ae1f34f1c98353f73c71d32c05bd1342477e87`, `15771fcdf7320f746d84945e39a9545a4b45dcd3`, `13a74ef706d531c92fbf2c21629b64cac141a36c` — guard static page runtime/theme/qualification copy, target Node 24.15, add frontend/API strict typechecks, and correct package validator regression guard usage.
- Static Foxy content is source-controlled in `generate-seo-pages.mjs`; the generated public route and standalone preview tests must pass before staging publication.
- No build, typecheck, browser, accessibility or preview test has been executed in this session.

### Release process and sign-off

- Added `docs/FOXY_BETA5_PRODUCTION_READINESS_CHECKLIST.md` in commit `be423b4f47b13b7be1af13b99000ab07bdd94c21`. It defines exact-source CI, queue/migration adversarial tests, the six-host/two-OS manual acceptance matrix, independent review, provenance, production operations and web accessibility sign-offs. All are OPEN; production authorization is NOT GRANTED.
- Updated PR #70 body with the latest code candidate, corrected release gates, environment limitations and the explicit instruction to keep it draft/unmerged; the checklist link is now included.
- Current code candidate: `4dec4fb...`; subsequent branch updates are documentation/checklist records. Re-query the actual branch head before future edits.
- PR #70 remains open/draft/unmerged with `mergeable=false`. Its branch is 296 commits ahead of common base `f6a16dc...`; PR #69's branch is 23 commits ahead of the same base. Do not rebase/retarget/merge without approval.
- No workflow run or commit-status context exists for the exact beta.5 code candidate. Local Node is 22.16.0, no checkout is mounted and GitHub clone failed due unavailable DNS; no local execution result is claimed.
- Production remains untouched; no package published, no merge, no deploy and no Codex use.


### Final website accuracy and contrast review — 27 November 2026

- The production source catalog `artifacts/api-server/src/lib/securityCheckCatalog.ts` contains **54** rules: 11 core and 43 extended. Both `src/routes/scans.ts` and `src/routes/githubWebhook.ts` set `checksRun` from `TOTAL_SECURITY_CHECKS`.
- Commits `61f29aa39a0fc4ae05b8116eef35143498d97eba`, `65d5870b234c0cf9bd15a2df4f6cb28210420171`, `42f08d9d9a79fd1c52c7c8382622d1fcc4ab6468`, `9c4813e9e775c5f0afade7d1a8d348c96d32f8d2` and `142b07e0823b0608f12d938b32068db5b190c0d3` align the homepage, public scan report, dashboard and console labels to 54 and add a regression assertion that counts the actual catalog entries.
- Commits `6408572cb42d54913aea4943b79427cebc029842`, `4089b1f393ee8be29aecfa256d5a313df5c27a3f`, `2b2be4c52b3bf486441b83ef4861f6dcacbb0c27`, `2cbcea5be0e41c8c2a421de5d1c2d4a9a1f7e2af` and `4dec4fb27a9070127904e3c29ece476dad3ad2a4` set the accent token to lime, ensure readable dark foregrounds on light CTA/clean/upgrade/dashboard cards, and add regression guards for both accent theme declarations and mixed-surface contrast classes.
- The last visual/code candidate is now `4dec4fb...`. These tests and copy corrections have not run in a real frontend build or browser.


### 27 November 2026 — workflow trigger and PR ancestry recheck

- Rechecked PR #70 at branch head `f6f52e133ded54815bb9e2e7dbf054e8904add86` before this documentation update. PR #70 is still open, draft, unmerged and `mergeable=false`.
- The feature branch contains `.github/workflows/agentshield-cross-platform.yml`; fetching that exact path from the PR target branch `feat/agentshield-beta-coding-agent-install` returned GitHub 404. Its `pull_request` trigger therefore cannot be relied on for PR #70. `workflow_dispatch` is not an available workaround unless the workflow is registered on the repository's default branch. No workflow run or status exists for the checked head.
- Do not trigger or broaden CI while the Actions quota is exhausted. Once available, add a narrowly scoped `push` trigger for `feat/agentshield-cross-platform-autoconnect`, or register the workflow through an owner-approved base/default-branch change. Then verify the resulting Windows and macOS jobs against the exact PR head.
- Recompared both branches to common base `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`: PR #69 head `ed5bf64a3dced0bd890fd66cf0634e0ae888a951` is 23 commits ahead; PR #70 is 296 commits ahead. The comparison is still diverged and PR #70 remains not mergeable. No rebase, force-push, retarget or merge was performed.
- Updated the PR description and production-readiness checklist to record the CI trigger blocker and exact-head qualification requirement. The two documentation commits are the only changes in this recheck; no product code was modified and no tests were run.


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


## Foxy local qualification runner (27 Nov 2026)

- Added `artifacts/api-server/scripts/run-foxy-qualification.mjs` and `qualify:foxy` package script. It runs a curated local build and regression set (MCP, jobs store, smoke, connector, package, release and scanner output tests), then writes JSON and Markdown reports under `artifacts/api-server/.foxy-qualification/` (or `FOXY_REPORT_DIR`).
- Runner is intentionally local-only: it does not deploy, publish, run migrations or invoke live benchmark scripts. It requires Node 24.15+ and dependencies already installed. It labels host acceptance as not included.
- Usage from repository root after setup: `pnpm --dir artifacts/api-server run qualify:foxy`. For custom report location: `FOXY_REPORT_DIR=... pnpm --dir artifacts/api-server run qualify:foxy`.
- Termux is a useful Android execution host, but compatibility, memory and native build constraints apply; Termux results are Android-platform evidence, not Windows/macOS acceptance.
- This runner has been committed via GitHub API but not executed in this environment; tests/build are therefore **unverified** until run on a Node 24.15+ host with dependencies installed.
