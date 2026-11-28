# VibeSane engineering state

**Snapshot date:** 28 November 2026 (Beta.6 479/479 three-platform package qualification passed; post-qualification web evidence changes await exact-head recheck)  
**Repository:** `Darkhero766/Vibeguard`  
**Purpose:** portable source of truth for new engineering sessions. This file records observed state, not intentions or assumptions. Recheck GitHub refs and runs before every write.

## Latest verified Foxy checkpoint — 28 November 2026, 479-test run

- Repository: `Darkhero766/Vibeguard`; PR #70 branch `feat/agentshield-cross-platform-autoconnect`.
- PR #70 branch tip before this state-note update: `48af00a84af7a2a7d8ab5de798a502dbf4211e9c`; open/draft/unmerged; GitHub reported `mergeable=false`. Its base is PR #69's feature branch, so the #69/#70 dependency stack still needs a deliberate reconciliation plan.
- Latest completed package qualification: source `a0651317c1cb16170d563867adcf5ddff08d5927`, [Actions run #46169706820](https://github.com/Darkhero766/Vibeguard/actions/runs/46169706820). Windows, macOS and Ubuntu/Linux all passed 479/479 regression tests, all qualification steps, and identical 33-file package manifests.
- Package: `@vibesane/foxy@0.7.0-beta.6`; canonical package-content SHA-256 `2a0405717fd3a8873e74eded393de73a286c70fd71a2626c24cab841cc7a95fa`; npm publication status remains false/unpublished.
- The current pre-documentation PR head was four commits after the qualified package source. The diff is limited to `FoxyPage.tsx`, SEO generation and related page/preview assertions. It does not change packaged Foxy runtime files or the publish workflow. Those latest website/SEO changes have not had an exact-head Actions rerun; do not claim every file at the current PR head is freshly qualified.
- The earlier license qualification run #46159923973 failed 3 stale assertions out of 475; corrected follow-up tests passed in run #46169706820. The later result supersedes that failure.
- Apache-2.0 is scoped to the Foxy distribution; NOTICE attributes 2026 Foxy-authored material to Md Faizal. The author must still verify legal ownership/assignment and third-party rights. npm `@vibesane` ownership, GitHub `npm-release` environment protection and npm OIDC Trusted Publishing are not yet configured.
- Independent security review and real-host acceptance remain open. The completion gate is cooperative, not tamper-proof. CI and synthetic benchmarks are not certification or real-world accuracy evidence.
- Actual host pilot remains owner-run on a disposable synthetic repository; start with Codex Codespaces from the qualified source. Claude Code, Cursor, Gemini CLI, Roo and Copilot each require separate acceptance before claims of support.
- GitGuardian event 35188914 was triaged in the PR conversation as a pre-existing public Supabase anon-key finding at `.replit:65` (`role=anon`), with identical content on main and the PR base. Verify the role in Supabase settings and resolve only that exact event; do not suppress any privileged-key finding. The previously reported VibeSane Security critical score remains a separate signal needing its own current source disposition.
- PR #71 (Clerk) remains a separate draft/unmerged change with the feature flag off; no provider config or production Auth change is authorized.
- No PR merge, npm publication, production deployment, production secret/config mutation, production SQL or production service operation was performed or authorized.

**Resume from:** re-run the website build/page/preview assertions at the latest PR head (without touching production), then send current code and evidence to independent review and conduct owner-run disposable-host acceptance. Keep #70/#71 draft, package unpublished and production untouched.

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
- Latest fully qualified source: `a777754de234ed2e469cd9822ad4a1f5f881e095`. It pins MCP workspace authorization to startup root identities, corrects MCP local-state side-effect annotations, centralizes the beta.5 version, hardens queue/storage behavior and exports a canonical per-file content manifest. Windows/macOS qualification passed in run #46055587747.
- Current code candidate: `65cd27b474db7863e1795a7d4dd59d44045e7177`. It adds a required SHA-256 MCP runtime fingerprint to persisted baseline provenance, covering the server, SDK, queue, queue store, baseline store and version modules. Restore and async queue-context propagation were corrected after the first requalification run exposed three regression failures and a failed MCP STDIO smoke. Exact-source Windows/macOS requalification is run [#46109329318](https://github.com/Darkhero766/Vibeguard/actions/runs/46109329318); confirm its final conclusion before release.
- Target branch: `feat/agentshield-beta-coding-agent-install`; current base SHA `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`. Latest PR metadata at 2026-11-28: PR #70 head `bff625bd3a31635feebca587d8d86c579a22a650`, 378 commits in the PR, 58 changed files, `mergeable=false`, `mergeable_state=dirty`. GitHub compare to the reported base SHA shows 377 ahead / 0 behind; older 357-ahead/23-behind and 296-ahead/23-behind snapshots below are historical and must not be repeated as current. Determine the exact conflict/stack state before proposing a merge strategy. Do not rebase, force-push, retarget or merge without explicit owner approval.
- Package version: `0.7.0-beta.5`; minimum runtime Node.js `24.15.0` for built-in `node:sqlite`.
- Earlier connector run #75 was beta.4-only and is historical. Latest beta.5 exact-source Windows/macOS qualification is [run #46055587747](https://github.com/Darkhero766/Vibeguard/actions/runs/46055587747), passed on source SHA `a777754de234ed2e469cd9822ad4a1f5f881e095`.
- Exact-source beta.5 status: **PASSED** on Windows and macOS in run #46055587747. Each platform passed 453/453 regression tests (0 failed), strict frontend/API typechecks, website build and Foxy preview, connector regressions, MCP STDIO integration/protocol, curated/holdout/additional synthetic benchmarks, and offline package/install/CLI/MCP smoke. Both qualification artifacts report `validation_passed_review_required` / `candidate_for_independent_human_review`. Both 29-file packages have identical file SHA-256 manifests and aggregate content digest `7e65e968cbea7f9396148cdb3cfa6483efbf492aba4bf899ac675036812c401a`. The outer tarball hashes differ by host (`d4307e511b0c5c3c1b62f5e6361245b15ed94a54c5c42bf4ed7d2bab27a9dba9` macOS; `c64808c374e2fba9c7ec37ee75fdea71b49accc8c07bcaeb665836114ebd5af7` Windows) although all file digests match. The outer archive representation differs, but the 29 packaged file byte contents are identical. Workflow uses a feature-branch `push` trigger; no base/default branch changes were made. Node 24.15.0+ was used.
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

**Current mergeability blocker:** GitHub reports PR #70 as `mergeable=false` and `mergeable_state=dirty`. Its current comparison to base SHA `f6a16dc...` is 378 commits ahead and 0 behind, with 58 changed files. Earlier counts (357/23 and 296/23) are historical snapshots; the current blocker needs a fresh conflict/stack review rather than assuming the older divergence still exists. Preserve both branches and do not force-push, rewrite history, retarget or merge without explicit authorization.

## What is actually verified

- PR #69's official MCP 2026-07-28 conformance gate and release qualification passed in run #71. The conformance HTTP adapter is test-only/loopback and uses synthetic fixtures; the shipping STDIO surface is repository-read-only, with scan baselines and job queue state confined to Foxy-managed local storage.
- PR #69's recorded release evidence: 423 tests passed with no failed/skipped release steps. Benchmark corpora are synthetic rule-expectation fixtures, not real-world scanner accuracy, exploit validation or certification.
- PR #70 exact-source beta.5 CI now passes on Windows/macOS in run #46055587747. The older run #75 remains beta.4 historical evidence only.
- GitGuardian's separate secret scan reports no secrets on the earlier beta.5 commit `f292e6a...`; this is not a build, test or security review.
- Historical qualification chain: `a777754...` passed 453/453 per OS; `089c2ac...` failed after provenance propagation defects; `65cd27b...` passed macOS but exposed the Windows WAL startup race at 453/454. These were addressed in `e3edce0...`, `65cd27b...`, `24e08b1...` and `8ff17de...`. The final exact-source result for `8ff17de...` is recorded in the 28 November status section below. Automated qualification and synthetic benchmarks are not security certification or real-host acceptance.
- Node.js 24.15.0+ is required. SQLite storage is local-machine only; Windows storage is restricted to the canonical current-user profile path, while POSIX storage is checked for owner-only mode bits.
- Real-host install/restart/approval/tool calls/unauthorized-root denial/disconnect and independent human review remain incomplete.

## Open engineering work — priority order

1. **Live host acceptance:** install/restart/approve/use/disconnect on real Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code and VS Code/Copilot versions on Windows/macOS using disposable repos; verify unauthorized roots, cancellations, config preservation and simultaneous same-namespace processes.
2. **Independent security review:** send the exact candidate SHA and package content manifest to an independent reviewer; close or explicitly risk-accept each of the prior 11 findings with severity, reproduction, remediation and retest evidence.
3. **Stack reconciliation:** PR #70 currently reports 378 commits ahead / 0 behind its reported base SHA but remains `mergeable_state=dirty`; inspect the concrete conflict files and dependency on PR #69 before proposing a stack plan. No rebase/retarget/merge without approval.
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

- SEO/route commits: `06b89eb92ea913ccf39541edb5a4155121e870a6`, `8f059e99be3fce8467c9983428f766711d27f66b`, `a83a993fe6425d6d61bf9177ef876cf78cc834cf` — rebuild the prerendered Foxy route with accessible contrast and the current graphite/lime/warm-white design. Remove the obsolete Node 20+ requirement and false claim that the current candidate passed Windows/macOS qualification. Beta.4's 429/429 and 12/12 counts are labeled historical; at that earlier checkpoint, beta.5 exact-source CI remained pending.
- Test and workflow commits: `62d897d3c06daa7584c492db3de696732cc193b2`, `c3a462342fbd70f8fabd1d76ec6784b82dbb8c8c`, `f0ae1f34f1c98353f73c71d32c05bd1342477e87`, `15771fcdf7320f746d84945e39a9545a4b45dcd3`, `13a74ef706d531c92fbf2c21629b64cac141a36c` — guard static page runtime/theme/qualification copy, target Node 24.15, add frontend/API strict typechecks, and correct package validator regression guard usage.
- Static Foxy content is source-controlled in `generate-seo-pages.mjs`; the generated public route and standalone preview tests must pass before staging publication.
- No build, typecheck, browser, accessibility or preview test has been executed in this session.

### Release process and sign-off

- Added `docs/FOXY_BETA5_PRODUCTION_READINESS_CHECKLIST.md` in commit `be423b4f47b13b7be1af13b99000ab07bdd94c21`. It defines exact-source CI, queue/migration adversarial tests, the six-host/two-OS manual acceptance matrix, independent review, provenance, production operations and web accessibility sign-offs. All are OPEN; production authorization is NOT GRANTED.
- Updated PR #70 body with the latest code candidate, corrected release gates, environment limitations and the explicit instruction to keep it draft/unmerged; the checklist link is now included.
- Current code candidate: `4dec4fb...`; subsequent branch updates are documentation/checklist records. Re-query the actual branch head before future edits.
- Historical comparison at the earlier PR #70 head `f6f52e1...`: PR #70 was 296 commits ahead of common base `f6a16dc...`; PR #69 was 23 commits ahead. This snapshot is superseded by the current 377-ahead/0-behind comparison and `mergeable_state=dirty` result above. Do not rebase/retarget/merge without approval.
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
- Historical comparison from the earlier branch snapshot: PR #69 head `ed5bf64...` was 23 commits ahead and PR #70 was 296 commits ahead of common base `f6a16dc...`. Current PR #70 comparison is 377 ahead / 0 behind, but GitHub still reports `mergeable_state=dirty`. Treat those older counts as historical; no rebase, force-push, retarget or merge was performed.
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


## 28 November 2026 — persisted baseline runtime provenance

- Commit `089c2ac...` introduced a runtime implementation fingerprint beside the scanner artifact fingerprint, ruleset/version and report-schema version. It covers `agentshield-mcp-server.mjs`, `agentshield-mcp-sdk.mjs`, `agentshield-jobs.mjs`, `agentshield-jobs-store.mjs`, `agentshield-baselines.mjs` and `agentshield-version.mjs`.
- Commit `e3edce0...` fixed the baseline restore adapter and the queue regression fixture scope. Commit `65cd27b...` added the missing runtime hash to the persisted changed-scan context.
- The synchronous baseline store and persistent SQLite queue validators require and compare this field. Old records without the field cannot restore a usable remediation baseline; a changed runtime fingerprint is reported stale and does not expose a usable `scan_id`.
- Regression coverage addresses the fingerprint generator, missing/altered provenance, restore, and cross-restart drift. Exact-source Windows/macOS run #46109329318 was in progress at the time of this update; do not record tests as passed until both jobs report success.
- PR #70 remains draft/open/unmerged. No production change, package publication, public distribution or deploy was performed.


## 28 November 2026 — current candidate status override

This section supersedes older candidate-SHA and in-progress-status notes earlier in this document.

- **Current code candidate:** `8ff17de5c5f9ce788e3447ae47263c77136cc3db`.
- **Exact-source Windows/macOS qualification:** [run #46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971) passed on both platforms, 454/454 tests per OS.
- **Current PR state:** PR #70 remains draft, open and unmerged. No production deployment or package publication was performed.
- **Earlier source results:** `a777754...` passed the prior 453/453-per-platform run #46055587747. Runtime-provenance candidate `089c2ac...` failed its source-matched run #46108972740 due to missing provenance propagation and a test-scope issue; follow-up commits fixed those. Candidate `65cd27b...` passed macOS but failed Windows at 453/454 in run #46109329318 due to a concurrent SQLite WAL-initialization lock. These failures remain part of the qualification history.
- **Latest fixes:** commit `24e08b1...` adds the installed bundled `agentshield-mcp-stdio.mjs` executable to the MCP runtime fingerprint. Commit `8ff17de...` adds bounded retries only for SQLite BUSY/LOCKED during WAL initialization, then restores the normal busy timeout. It still refuses any journal mode other than WAL.


## Launch decision

Two-day timing does not justify waiving the remaining gates. Exact-source Windows/macOS qualification has now passed. The candidate should still not be called public-launch ready until actual host sessions are accepted for every advertised host/platform pair (or the support matrix is narrowed), and an independent security reviewer signs off. If those gates are still open at the target date, use a restricted private beta for the combinations actually tested or defer public distribution. Do not expand Markdown/config scanning or add optional integrations in the final qualification window.


## 28 November 2026 — final Foxy beta.5 exact-source qualification

This section supersedes the older 453/453 and pending-status notes above.

- **Qualified code source:** `8ff17de5c5f9ce788e3447ae47263c77136cc3db`.
- **Exact-source Windows/macOS workflow:** [#46109758971](https://github.com/Darkhero766/Vibeguard/actions/runs/46109758971) — both platform jobs completed successfully.
- **Regression suite:** 454/454 on Windows (win32 x64) and 454/454 on macOS (darwin arm64), Node.js v24.15.0; zero failed, cancelled or skipped cases.
- **Release reports:** both `validation_passed_review_required`, release decision `candidate_for_independent_human_review`, with no failed steps. Reports state `productionTouched: false` and `syntheticFixturesOnly: true`.
- **Package parity:** 29 files each, all per-file digests identical, canonical package content SHA-256 `42d5d09d7a5473020b0e7706f0a3bcf07172180db657a9c85c1aa663cb3571e6`.
- **Main hardening:** persisted baselines bind to scanner provenance and runtime implementation identity, including the bundled installed MCP STDIO entrypoint. Cross-process SQLite startup retries only bounded BUSY/LOCKED errors while requiring WAL mode; the race found in the prior Windows run is covered by the passing 454-test suite.
- **Current PR state:** PR #70 remains draft, open and unmerged. GitHub reports `mergeable=false` / `mergeable_state=dirty`; the latest comparison is 378 commits ahead / 0 behind with 58 changed files. The specific merge-conflict cause still needs review. The post-qualification branch changes are documentation-only. No production deployment, npm publication or public release was performed.

**Still open before public launch:** actual host acceptance on the exact hosts/OS combinations to be advertised; independent external security review and disposition of all 11 prior findings; PR #69/#70 stack reconciliation; package/release provenance and operational rollback; support/recovery procedures; website/browser/accessibility QA and owner authorization. If those remain incomplete at the two-day target, use a restricted private beta only for tested combinations or defer the public release. Passing CI does not waive these gates.


## PR #70 mergeability — 28 November 2026

Latest GitHub PR metadata at current head `bff625bd3a31635feebca587d8d86c579a22a650`: open, draft, unmerged; target branch `feat/agentshield-beta-coding-agent-install` at base SHA `f6a16dcaba163ec15f27e62e2baa96ea8a90f63f`; PR contains 378 commits and 58 changed files; GitHub reports `mergeable=false`, `mergeable_state=dirty`. The compare endpoint reports the head is 378 commits ahead and 0 behind that base SHA. This differs from previous 357/23 and 296/23 snapshots, which are now historical. The exact reason for the dirty merge state still requires a current file-conflict/dependency review. Do not merge, retarget, rebase or force-push during the release window.


## 28 November 2026 — Day 1 adversarial hardening additions

- Static independent-challenge pass found that persisted job JSON could disagree with SQLite indexed columns. A payload could claim a terminal/completed state while the authoritative row remained running. Commit \`3140ed2...\` adds payload/index consistency validation on decode, treats status/results integrity failures as queue-wide storage faults and aborts active scans, and adds a forged-completed-payload regression. Full scans now also bracket scanner/runtime provenance and check ctime on opened files.
- Static independent-challenge pass found a host configuration lost-update window. Commit \`6270f43...\` adds per-file exclusive locks and byte-snapshot checks for connector connect/disconnect. Regression coverage and operator documentation for stale locks are being added. This candidate requires a new exact-source qualification.
- These are same-session adversarial engineering findings, not third-party independent certification. Day 1 is not complete for live host acceptance: the real Claude/Codex/Cursor/Gemini/Roo/Copilot matrix still requires actual application sessions on the exact host versions/OS combinations.


## 28 November 2026 — beta.6 final qualification and Clerk checkpoint

This section is the current source of truth and supersedes earlier candidate SHA, package hash, qualification status and pending-run notes above.

### Foxy beta.6 — final exact-source result

- **Qualified code source:** `3ec649c01506ae077639595794fd0b0cc445db04` on `feat/agentshield-cross-platform-autoconnect`.
- **Exact-source workflow:** [Foxy qualification run #46137576745](https://github.com/Darkhero766/Vibeguard/actions/runs/46137576745) completed successfully on Windows, macOS and Ubuntu/Linux. All three platform jobs completed all 17 workflow steps successfully; zero failed steps.
- **Regression suite:** 472/472 on each platform, Node.js v24.15.0.
- **Other release stages:** workspace/frontend/API typechecks, VibeSane frontend and standalone Foxy preview build, cross-platform connector regression step, MCP STDIO integration, curated/holdout/additional-adversarial synthetic benchmarks, and offline package install/CLI/MCP smoke all passed.
- **Package parity:** 30 files on each platform; same canonical package-content SHA-256 on Windows, macOS and Ubuntu/Linux: `f60677328e0c5eb2de94ec4ae44598e973c198e62f15ad4156b061bd6ed42c14`.
- **Release reports:** `validation_passed_review_required`, release decision `candidate_for_independent_human_review`, with no failed steps. Evidence is synthetic-fixture automated qualification, not live coding-agent host acceptance, third-party security review or certification.
- **Package candidate:** `@vibesane/foxy@0.7.0-beta.6`; executables `foxy` and `vibesane`; Node.js >=24.15.0 and Git required. Archive remains local-only; `published: false`.
- **One-line registry bootstrap:** after an owner-approved beta publication only, the intended command is `npx @vibesane/foxy@beta install`. It is not currently usable because the package is unpublished and npm scope ownership/availability, provenance/signing and publication authorization are not yet verified. The untagged `npx @vibesane/foxy install` is reserved for a future stable/latest channel.
- Package README now states the Beta.6 identity, Windows/macOS/Ubuntu matrix, Node requirement, and separate human review/live-host gates. Package smoke has regression assertions against stale platform/version/publication claims.
- Earlier failed/cancelled qualification attempts are historical diagnostics only. Do not use those to replace the final passing run above.

### VibeSane Clerk authentication — separate draft PR

- **PR:** [#71](https://github.com/Darkhero766/Vibeguard/pull/71), branch `feat/vibesane-clerk-auth-provider`, exact head `e715a029864d35bc244c72a03815a98e4edf8a6`; open, draft, unmerged.
- **CI:** [run #46129251186](https://github.com/Darkhero766/Vibeguard/actions/runs/46129251186) passed on the exact PR head, including TypeScript project references, Clerk auth-contract tests, VibeSane frontend typecheck and frontend build.
- **Architecture:** Clerk is an optional identity provider through Supabase Auth custom OAuth/OIDC provider `custom:clerk`. Supabase remains the application session issuer and UUID authority so current API bearer tokens, ownership, usage/billing/referrals and data links remain compatible.
- **Feature gate:** `VITE_CLERK_AUTH_ENABLED` defaults to false. Do not enable it until a separate Clerk OAuth app and matching Supabase custom provider are configured in isolated staging.
- **Not yet verified:** live Clerk login, new-user provisioning, returning-user account linking, preservation of existing Supabase UUID and billing/Pro ownership, referral attribution, API bearer-token flows, and sign-out. Email matching must not be assumed to link accounts safely.
- No Clerk provider dashboard, secret, Supabase Auth configuration or production environment was changed in this session.

### Current PR and safety state

- PR #70 remains draft, open and unmerged; GitHub currently reports `mergeable=false`. Its stacked relationship with PR #69/base branch is unresolved. Do not rebase, retarget, force-push or merge until ancestry and conflict scope are deliberately reconciled.
- PR #71 remains draft, open and unmerged; do not merge or enable its flag in production.
- No package publication, production deployment, production configuration/secret change, production SQL/migration, Supabase Auth mutation, billing/grant mutation or production service operation was performed.
- Do not treat passing automated qualification as a clean VibeSane security scan. Existing VibeSane Security critical finding / GitGuardian signal recorded above still require inspection and disposition.

### Next bounded work

1. Obtain an independent human security review of exact Foxy code SHA `3ec649c01506ae077639595794fd0b0cc445db04`; preserve the reviewer’s written evidence and disposition.
2. Run real host acceptance on a disposable repository: begin with the Codex Codespaces pilot only when the owner chooses to spend the remaining Codex quota; then separately validate Claude Code, Cursor, Gemini CLI, Roo and Copilot on the exact OS/host combinations to be advertised.
3. Reconcile PR #69/#70 stack ancestry and the current GitHub mergeability/conflict state without force-push or speculative retargeting.
4. Verify npm scope ownership, package provenance/signing, publication permissions, rollback/support procedures; publish only after separate owner approval.
5. For Clerk, configure only the isolated staging OAuth app and Supabase `custom:clerk` provider, then execute the complete new-user and returning-account ownership/entitlement/referral/API/sign-out acceptance checklist. Keep the public flag false until all pass.
6. Inspect and disposition current SaaS security findings and perform the website/browser/accessibility QA already tracked in the release checklist.

**Resume phrase:** “Continue VibeSane from the latest override in `docs/VIBESANE_ENGINEERING_STATE.md`; verify PR #70/#71 and run #46137576745 live before editing. Keep both PRs draft/unmerged, package unpublished, Clerk disabled, and production untouched.”

 
## 28 November 2026 — final Beta.6 UI + SQLite startup qualification override

This is the newest source of truth. It supersedes earlier Beta.6 SHA/package-hash blocks above. Older runs remain useful diagnostic history.

### Exact-source release qualification

- **Qualified exact source:** `ca9de05d00672d9a3148deec13ee2e280f1996eb` on `feat/agentshield-cross-platform-autoconnect`.
- **Workflow:** [Foxy qualification run #46140045503](https://github.com/Darkhero766/Vibeguard/actions/runs/46140045503) completed successfully on Windows, macOS and Ubuntu/Linux. All 17 steps per platform passed.
- **Regression suite:** 472/472 on each platform; 0 failed, 0 cancelled, 0 skipped.
- **Other gates:** source syntax/fingerprinting, scanner build, TypeScript workspace/frontend/API checks, VibeSane and standalone Foxy preview builds, cross-platform connector tests, MCP STDIO, curated/holdout/additional-adversarial benchmarks, and offline package/CLI/MCP smoke all passed.
- **Package:** `@vibesane/foxy@0.7.0-beta.6`; 30 files, `published: false`; identical package-content SHA-256 on all OSes: `edf7851ec847dce63f24c66b59b396bae770d69e9e4e52843709df1778a816b8`.
- **Release reports:** `validation_passed_review_required`, release decision `candidate_for_independent_human_review`; zero failed qualification steps. The reports are synthetic-fixture automated evidence, not live-host acceptance, third-party audit or security certification.

### SQLite first-open race — root cause and fix

- Workflow #46139761242 exposed one macOS regression: 471/472 in the two-independent-process shared SQLite queue test. The failure occurred when a process read `application_id = 0`, another process then claimed the database and created Foxy schema, and the first process used its stale zero ID with the later non-empty schema count, incorrectly treating Foxy's own DB as foreign.
- Commit `ca9de05...` moves application ID, schema-object, quick-check and first-claim operations into a SQLite `BEGIN IMMEDIATE` transaction. The transaction serializes the identity/schema decision across processes, retains the bounded busy timeout and rolls back on any ownership or integrity rejection.
- The regression passed on Windows, macOS and Ubuntu/Linux in run #46140045503. Do not remove the transaction or weaken the refusal of foreign non-empty databases.

### Website Install MCP experience

- The VibeSane `/foxy` page now has an Install MCP entry point and a structured install panel. It explains project root, exact target review, explicit CLI consent and host approval.
- The displayed post-publication beta command is `npx -y @vibesane/foxy@beta install`.
- Copy is fail-closed behind `VITE_FOXY_BETA_INSTALL_ENABLED === 'true'`. A missing/false value leaves the control disabled; the flag is intended only after owner-approved npm publication and package provenance/signing checks.
- The static SEO route and standalone no-JavaScript preview mirror the Beta.6 evidence and disabled publication state. Tests assert the exact workflow URL/hash, no stale Beta.5 qualification copy, disabled action, noindex preview and fail-closed React gate.
- The website cannot write local host configuration or approve an AI host. The local terminal installer still owns canonical Git-root handling, preview/consent, connector writes and verification. Lifecycle hooks/skills and completion enforcement remain separate opt-ins.

### PR, Clerk and production state

- PR #70 remains draft/open/unmerged; GitHub reports `mergeable=false` because PR #69/#70 stack ancestry still needs deliberate reconciliation. Do not rebase, retarget, force-push or merge without an explicit plan.
- PR #71 remains draft/open/unmerged at the previously verified Clerk provider implementation. It is additive through Supabase Auth; the public `VITE_CLERK_AUTH_ENABLED` flag remains false. Live provider configuration and account-linking acceptance have not been performed.
- The Clerk plugin ID was not available in this ChatGPT plugin directory and no Clerk skill was installed. The user was shown the explicit Clerk setup checklist and asked for approval; no Clerk plugin/CLI setup has been started pending that approval.
- No npm publication, production deployment, production auth/provider/secret change, production SQL/migration, billing/grant mutation or production service operation was performed.

### Next bounded work

1. Independent human review of exact source `ca9de05...`, including the SQLite startup transaction, connector mutation/rollback and web install publication gate.
2. Real host acceptance on a disposable synthetic repository; keep MCP trust and hooks separate, and do not use a production repository.
3. Reconcile PR #69/#70 ancestry and mergeability without a speculative rebase/force-push.
4. Verify npm scope ownership, package provenance/signing, rollback/support procedures and explicit owner approval before publishing or enabling the page copy flag.
5. For Clerk, wait for the user's approval before plugin/setup. Preserve Supabase as session/UUID authority; configure only isolated staging and prove returning-account UUID/entitlement/referral/API continuity before considering the public flag.

**Resume phrase:** “Continue VibeSane from the final Beta.6 override in docs/VIBESANE_ENGINEERING_STATE.md; verify PR #70/#71 and workflow #46140045503 live. Keep both PRs draft/unmerged, package unpublished, install-copy flag disabled, Clerk disabled pending approval, and production untouched.”


## 28 November 2026 — resumed UI evidence alignment checkpoint

- Re-opened the current branch and exact Beta.6 evidence after a connection interruption.
- The latest final qualified code source remains `ca9de05d00672d9a3148deec13ee2e280f1996eb`, run [#46140045503](https://github.com/Darkhero766/Vibeguard/actions/runs/46140045503), Windows/macOS/Ubuntu/Linux, 472/472 regression tests per platform, 30-file local package, package-content SHA-256 `edf7851ec847dce63f24c66b59b396bae770d69e9e4e52843709df1778a816b8`.
- Fixed the Foxy page and its source test so its qualification link and package hash point to that final evidence, rather than the older run/hash.
- Added a static preview test assertion pinning the exact qualification run and package hash, so future static SEO/staging output must match the current release evidence.
- Current branch tip at this checkpoint: `3e1a1b5e6600d2d8afe427d11a341fab51d24dfb`; PR #70 remains draft/unmerged and mergeability is unresolved because of its stacked PR ancestry.
- CI run [#46141000337](https://github.com/Darkhero766/Vibeguard/actions/runs/46141000337) is pending for this checkpoint. Earlier workflow run [#46140913728](https://github.com/Darkhero766/Vibeguard/actions/runs/46140913728) remains in progress at a prior docs/test checkpoint; cancelled runs are not qualification evidence.
- Clerk plugin lookup in ChatGPT returned no available plugin. The Clerk setup checklist has not been approved; no plugin/CLI setup or auth changes were performed here.
- Production remains untouched; package remains unpublished; installation page flag remains disabled; PRs #70/#71 remain draft/unmerged.

**Resume:** Verify run #46141000337 and latest branch head live, then continue Day 1/2 universal installer and website install-panel QA. Keep publication, Clerk enablement and production actions out of scope without explicit approval.
