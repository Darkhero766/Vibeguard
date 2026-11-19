# AgentShield Week 5 — launch-readiness engineering report

**Engineering status:** implementation and automated acceptance passed on the Week 5 feature branch.
**Release status:** NOT APPROVED for distribution or production. Authenticated real Claude Code testing, manual target-platform checks, deployment verification, and human review remain pending.
**Date:** November 19, 2026.

## Current architecture

The existing VibeSane website supports GitHub repository scans through its authenticated API route (POST /api/scans). This is a server-side GitHub scan.

AgentShield is a **separate local developer tool** using Claude Code PostToolUse/Stop hooks; it scans supported local source, provides guidance, and runs a final Git worktree scan. It is not a web-based agent that fixes a production website. Local source is not automatically uploaded or synchronized with VibeSane.

The scanner still uses the existing VibeSane detection engine. Monitor is advisory; Assist suggests repairs; opt-in Auto-fix can request bounded Claude repair attempts but cannot override Claude permissions or guarantee a fix. A disappearing static finding does not independently verify secure behavior.

### Week 5 changes

1. Added a dedicated AgentShield information page at /agentshield in the existing React website with desktop/mobile navigation, footer discovery, explicit preview status, supported operating modes, installation prerequisites, GitHub scanner link, and privacy limitations.
2. Added crawlable static HTML and metadata for /agentshield through the existing SEO-page build pipeline.
3. Fixed backend build/type errors: removed duplicate readiness handler/import, repaired admin request logging, typed scan results, adjusted Node-compatible GitHub headers and installation ID narrowing, handled GitHub route inputs and provider token promises, preserved fail-closed robots.txt semantics, corrected SUE evidence typings, and accurately modeled local extended Low findings before API normalization.
4. Made shared library declaration generation an explicit CI step before frontend typecheck.
5. Enforced *required* backend TypeScript checks in Week 5 CI, without continue-on-error.
6. Added 11 new Week 5 tests, including a new 48-case Next.js/Supabase synthetic target-rule evaluation.
7. Preserved 81 existing AgentShield tests (Week 1: 9, Week 2: 21, Week 3: 32, Week 4: 19), existing SUE regression tests, local beta package builder and reversible installation.

No production account, database, environment variables, customer data or hosted infrastructure was modified. No npm package was published and no release was distributed.

## Build and automated evidence

Final verified Week 5 CI: https://github.com/Darkhero766/Vibeguard/actions/runs/44499135067

- Frontend Vite build: PASS.
- Shared TypeScript declaration build: PASS.
- Frontend strict typecheck: PASS.
- Backend bundle build: PASS.
- Backend strict typecheck: PASS (not allowed to fail).
- Existing SUE regression: PASS.
- Week 1 AgentShield: 9/9 PASS.
- Week 2 AgentShield: 21/21 PASS.
- Week 3 AgentShield: 32/32 PASS.
- Week 4 AgentShield: 19/19 PASS.
- Week 5 AgentShield: 11/11 PASS.
- Total AgentShield: **92/92**, no failures.

These are automated/CI observations, not evidence of an authenticated interactive Claude Code run or an actual website deployment.

## New synthetic evaluation — NOT real-world accuracy

The 48 new labeled examples were created independently of the earlier Week 4 benchmark and first evaluated without modifying the rules in response to their results.

- True positives: 24.
- True negatives: 23.
- False positives: 1.
- False negatives: 0.
- Target-rule precision: **96%**.
- Target-rule recall: **100%**.
- False-positive rate: **4.17%**.
- The remaining false positive is a custom application-specific verifySession authorization guard; scanner cannot generally prove what an arbitrary custom function enforces.

This is a small synthetic, target-rule test; it is **not a security accuracy claim for real projects**. Structural authorization, RLS correctness, runtime exploitability and all unsupported attack classes require separate review. No real customer applications were scanned.

## Website onboarding and release boundary

Website preview route: /agentshield, built inside the current VibeSane app. Existing GitHub scanner remains at /scan-public. The new page does not claim a public AgentShield installer, web autofix, automatic local-to-cloud data sync, or deployment approval.

Code/documentation remain on GitHub feature branches until owner review. The installed beta tarball version from Week 4 is 0.4.0-beta.1, unpublished and CI-only. Before any public package link, verify package namespace ownership, legal/compliance requirements and target platform compatibility.

An authorized developer can use the checked-out Week 5 branch and a separate disposable Git repository:

~~~bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build:agentshield
node artifacts/api-server/scripts/vibesane.mjs doctor --cwd /absolute/path/to/disposable-project
node artifacts/api-server/scripts/vibesane.mjs init --cwd /absolute/path/to/disposable-project
node artifacts/api-server/scripts/vibesane.mjs config --cwd /absolute/path/to/disposable-project --mode monitor
node artifacts/api-server/scripts/vibesane.mjs scan --changed --cwd /absolute/path/to/disposable-project --format json
node artifacts/api-server/scripts/vibesane.mjs verify --changed --cwd /absolute/path/to/disposable-project --format text
node artifacts/api-server/scripts/vibesane.mjs uninstall --cwd /absolute/path/to/disposable-project
~~~

Prerequisites: Node 20+, Git, macOS/Linux for the local installer, pnpm for source builds, and an authenticated Claude Code installation for real-agent use. Do not run against production workspaces as the first acceptance test.

## Honest verification statuses

- detected: supported static rule matched.
- repair_requested: guidance was issued to an authorized agent.
- rescan_passed: previous pattern disappeared; not proof of secure behavior.
- verification_passed: only a separately implemented narrow assertion passed.
- unverified: no independent regression evidence is available.
- scan_incomplete / partial: files omitted, scanner failure or race; never interpret as a pass.
- no_changed_files: no supported Git changes; never interpret as a whole-project pass.

API errors, unknown scan results, partial scans, unsupported languages and source ignored by Git are not security passes. Local metadata retention is limited and has its own privacy controls, but not a secure wipe guarantee.

## Real Claude Code acceptance — PENDING

The current execution environment has no authenticated Claude Code executable. The supported hook JSON and Stop recursion behavior were checked against official documentation at https://code.claude.com/docs/en/hooks, and simulated tests pass, but this is **not** a real Claude agent interaction.

When an authorized developer has Claude Code:

1. Use a disposable Git repository with synthetic secrets only.
2. Install the built CLI and inspect /hooks in a real Claude Code session; verify PostToolUse and Stop hooks are active.
3. In Monitor mode, instruct Claude to write a JS file with a **fake** long JWT signing key. Confirm a matching rule is reported but no automatic repair is requested.
4. Opt in to Auto-fix with attempts 2. Allow a minimal change to environment-backed signing key reference using ordinary Claude permissions. Confirm bounded requests, file rescan, and appropriately qualified final output.
5. Have Claude use Bash to create another fake vulnerable file and confirm the final worktree gate detects the Git-visible change.
6. Test scanner missing/failed and no Git changes. Neither may produce a security success claim.
7. Confirm configuration remains reversible and uninstall preserves unrelated .claude settings.
8. Compare resulting logs with the documented security constraints and obtain human security signoff. Do not share transcripts containing secrets.

No live authenticated result, real-user feedback, or customer telemetry was produced in Week 5.

## Reversible rollback

Remove AgentShield hooks from the disposable repository before uninstalling the CLI. Do not delete unrelated .claude configuration.

~~~bash
node artifacts/api-server/scripts/vibesane.mjs config --cwd /absolute/path/to/disposable-project --enabled false
node artifacts/api-server/scripts/vibesane.mjs uninstall --cwd /absolute/path/to/disposable-project
~~~

Revert the Week 5 feature branch or close the draft PR to abandon the website changes. As no deployment or default-branch merge is performed, no production rollback is required.

## Known risks and next release gates

- Independent, real Claude Code terminal acceptance is still pending.
- Real macOS and representative Linux developer installations, including upgrades and broken settings, need owner-approved hands-on acceptance.
- The website /agentshield page is **feature-branch-only** until merge and deployment. Live website route is not verified.
- Static scanner coverage is heuristic; custom authentication middleware remains a difficult false-positive class. Whole-application security is not guaranteed.
- API schema source and generated scanner check catalog should be reviewed together before running future API code generation; do not silently regenerate incompatible schema files.
- GitHub scan UI, plan usage and live protection check runs were inspected and existing code paths preserved, but real credentialed API flows were not exercised.
- Privacy/security human review is still necessary before invitations or source-package distribution.

**Engineering recommendation:** request code/security review of this draft PR. After approval, run the real Claude Code checklist in a test machine, assess the deployed website and GitHub scanner in a staging environment, and only then invite 3–5 consenting private-beta users with explicit owner approval.
