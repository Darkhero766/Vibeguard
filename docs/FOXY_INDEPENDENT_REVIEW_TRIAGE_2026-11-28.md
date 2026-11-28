# Foxy independent security review triage — 28 November 2026

## Decision

**Do not publish publicly. Keep the candidate unpublished and in controlled review only.**

The external review by Claude is a useful partial audit, not a complete security assessment. The reviewer inspected the installer, connector, selected MCP authorization and queue code, package builder and one workflow. The reviewer explicitly did not inspect the scanner rules, full MCP server, complete tests, or real Windows/macOS behavior. The reported 472/472 qualification could not be independently fetched during that review.

The 472/472 automated qualification applies only to exact source commit `ca9de05d00672d9a3148deec13ee2e280f1996eb`. Any follow-up change invalidates that exact-source qualification until a new source-matched run passes. Do not carry the old package hash or pass count forward to a changed build.

## Finding-by-finding disposition

| ID | Severity | Finding | Current disposition |
|---|---|---|---|
| F-01 | High | Repository-local Git clean/process filters can execute during Git status inspection. | **Mitigation implemented; validation pending.** New safe-Git preflight inspects pinned snapshots of repository Git config, linked-worktree common config and worktree config. It rejects executable-capable filter, diff, include, alias, fsmonitor, credential-helper and custom-driver settings before MCP/CLI/gate/installer worktree inspection. Regression tests cover clean filter refusal, related config families and linked worktrees. |
| F-02 | High | A same-user coding agent with shell access can change the local controller config, disable the gate or select advisory mode. | **Threat-model limitation, not a local authentication fix.** The local completion gate is cooperative and can be bypassed by a process with the same OS-user permissions. Product/docs must not describe it as tamper-proof or as an authoritative security boundary. Use required CI checks, protected branches, repository rules and human review for authoritative delivery controls. |
| F-03 | Medium | Connector backups and lock artifacts can be written next to project configuration, where a broad `git add .` may capture them or unrelated MCP credentials. | **Initial mitigation implemented; validation pending.** Persistent backups and lock files now live under a per-user Foxy state directory with owner-only directory/file modes on POSIX. Atomic replacement still uses short-lived same-directory temp files to preserve rename atomicity; corresponding patterns are stored in `.git/info/exclude`. Cross-platform permission, crash and repository-status tests must pass before closure. |
| F-04 | Medium | Absolute Node and package paths plus workspace allowlists in project MCP configuration are machine-specific. | **Initial mitigation implemented; validation pending.** The connector refuses to overwrite a tracked workspace MCP config, and adds untracked host config paths to the repository's local `.git/info/exclude` so machine-specific settings are not accidentally committed. The server path is still absolute within a local install; two-user portability and npx cache refresh behavior need host acceptance. |
| F-05 | Low/Medium | Codex TOML conflict detection used a narrow regular expression. | **Conservative parser implemented; validation pending.** It parses bare, quoted/basic/literal and dotted key segments, table and array-of-table headers, root dotted assignments, and inline-table assignments. It refuses ambiguous relevant syntax instead of rewriting it. New fixtures cover quoted/dotted/array-table collisions and safe unrelated entries. |

### F-01 implementation notes

The preflight is in `artifacts/api-server/scripts/agentshield-safe-git.mjs`. It is called before worktree scans in the MCP server, final gate and CLI, and before the connector writes host configuration. The package builder explicitly includes the module, and the package smoke test asserts that the installed archive contains it.

This is a mitigation for executable-capable settings in the repository's local Git configuration. It does **not** justify a claim that arbitrary hostile operating-system environments, hostile global Git configuration, compromised Git binaries or same-user shell access are contained. Qualification and adversarial retesting are still required.

## Additional public-release blockers

1. **npm namespace ownership:** the reviewer reports that `@vibesane` returned 404 and that ownership was not verified. Treat the scope as unowned/unverified until the package owner checks it from the intended npm account. Do not publish or run the registry-based npx command before that check.
2. **Provenance and release automation:** the qualification workflow is not a package-publishing workflow. Add a separate owner-controlled release workflow with npm trusted publishing/OIDC provenance, protected release conditions, source/version verification, package-content manifest verification and a no-implicit-publish default. Never add secrets to frontend variables.
3. **Action pinning:** the inspected `.github/workflows/agentshield-cross-platform.yml` already pins checkout, pnpm/action-setup and setup-node to full commit SHAs. This does not prove every repository workflow is pinned; audit all workflows before release rather than repeating a blanket claim from this one file.
4. **License:** the generated package manifest still says `UNLICENSED`. The owner must select and verify a license before public distribution; do not choose one on the owner's behalf.
5. **Runtime compatibility:** the package requires Node.js `>=24.15.0` because it uses built-in `node:sqlite`. Decide whether that is an acceptable beta support policy or whether a lower runtime is required, then test the exact supported matrix. Do not lower the engine declaration without validating queue behavior.
6. **Benchmark validity:** the accuracy corpus is synthetic and self-labeled. It is useful for deterministic regression tests, not evidence of real-world false-positive/false-negative rates. Collect consented, privacy-safe real repository evaluations before making accuracy claims.
7. **Audit completeness:** finish review of scanner rules, the full MCP server, all test paths, queue race/failure cases, installer rollback, and actual Windows/macOS hosts. No unresolved High/Critical finding may be waived by a green synthetic test suite.

## Current repository state

- PR #70 remains draft/open/unmerged; do not merge it.
- PR #71 (optional Clerk sign-in) remains draft/open/unmerged and is independent of the Foxy security blockers.
- No production deployment, production configuration change, Clerk provider configuration, npm publication or package release is authorized by this review.
- The current PR #70 head includes unqualified follow-up changes. Run the complete source-matched Foxy qualification on that exact head before treating the patch as validated.
- The npm package remains unpublished. The displayed `npx @vibesane/foxy@beta install` command is a future intended command, not a currently verified public install path.

## Next engineering order

1. Run syntax/build and focused F-01 tests on the current PR head; then run full Windows/macOS/Linux qualification and inspect each OS result.
2. Resolve F-03 so secrets/config backups and lock artifacts cannot be committed with the repository.
3. Resolve F-04 and F-05 with cross-host and cross-platform fixtures.
4. Keep F-02 explicitly cooperative; make CI/branch protection the authoritative control rather than adding a misleading local "human confirmation" check.
5. Audit registry ownership, license, runtime support, all GitHub workflows and provenance before any public-release decision.
6. Complete the remaining independent audit scope and real-host acceptance before changing the PR from draft or considering publication.

No item in this document authorizes merge, deployment, production changes or npm publication.


## 28 November 2026 — installer isolation and Codex TOML follow-up

Current remediation source head: \`14ff463148c005c3b2606b96c078baaf00d52045\`.

Implemented on the draft PR #70 branch (not yet qualified):

- Persistent connector backups are written to the platform-specific per-user Foxy state directory under \`backups/\`, with private directory/file permissions on POSIX.
- Host-config lock files use hashed destination names under the per-user Foxy state directory's \`locks/\`; lock cleanup verifies token and file identity before removal.
- The connector refuses to alter tracked workspace MCP config paths. For untracked project-scoped configs, it adds narrowly allowlisted paths to the repository-local \`.git/info/exclude\`, preserving unrelated excludes. It also ignores short-lived atomic-write temp patterns.
- The Codex config conflict check now parses quoted/basic/literal and dotted TOML key segments plus standard and array-of-table headers; relevant ambiguous syntax fails closed.
- Regression tests were added for private backup/lock placement, local excludes, tracked-config refusal, quoted and dotted table names, array-of-table collisions, inline assignments, comments and unrelated server entries.
- The state-directory helper validates the final directory and returns its canonical path to tolerate normal macOS system symlink ancestors.

Validation state:
- The workflow currently running for this candidate is [Foxy qualification run #46153186892](https://github.com/Darkhero766/Vibeguard/actions/runs/46153186892), source SHA \`14ff463148c005c3b2606b96c078baaf00d52045\`.
- Do not close F-03/F-04/F-05 based on source changes alone. Require the exact-head Windows, macOS and Linux connector tests and full qualification, inspect every job, then repeat independent review of the changed code.
- The earlier 472/472 qualification is still historical evidence for \`ca9de05d00672d9a3148deec13ee2e280f1996eb\` only.
- PR #70 remains draft/open/unmerged and still has an unresolved stacked base. No publication, merge or deployment is authorized.


The preceding run for \`14ff463148c005c3b2606b96c078baaf00d52045\` stopped on macOS/Linux in the website SEO-copy regression because its assertion expected the older phrase \`No repository writes\`. The page copy had already been improved to \`Repository files are never modified\`; the test was corrected to assert the more precise claim. Windows was still running when the two jobs failed. Run #46153329425 is the new full-matrix run after this regression fix; its results are pending.


## 28 November 2026 — installer, update and workspace uninstall candidate

Current source revision: \`28286eb5e1fb2a40c8aaa452a6e1205ff1be75ef\`.
Exact-source workflow: [#46156668487](https://github.com/Darkhero766/Vibeguard/actions/runs/46156668487).

Implemented on the draft PR #70 branch:
- POSIX and PowerShell registry-guarded bootstrap assets; global npm install with lifecycle scripts disabled; consent-first project installer; explicit supported-host selection.
- Website OS + host selection with both script source links. The copy/install control remains disabled until owner-approved package publication and website deployment.
- Unified \`foxy uninstall\` removes exact MCP entries and matching Claude/Codex integrations while preserving unrelated config, modified Codex skills, local scan/baseline/queue state, backups and the global CLI.
- \`foxy update\` is restricted to a verified npm-global installation, checks the official beta dist-tag and refuses checkout/transient-cache updates.
- Added runtime bootstrap fail-closed tests, installer syntax tests, updater location-refusal tests, full uninstall integration tests and modified-Codex-skill preservation tests.
- Package metadata now records the source repository; package file count remains 31; broad “read-only MCP” wording was replaced by the precise repository-file/local-state boundary.

Source-matched qualification evidence from run #46156668487:
- Ubuntu: \`validation_passed_review_required\`; 474/474 tests, MCP STDIO smoke, curated/holdout/adversarial benchmarks and offline package install/CLI/MCP smoke all passed. Package hash \`2353e4e66ef89f09c1ca7d02ffd4d360a83b978177d87284abfba151d7ac0103\`; 31 files.
- macOS: same 474/474 count, same passing gates, same 31-file package hash.
- Windows: completed successfully on the same exact source; 474/474 tests, all smoke/benchmark/package checks passed, 31 files and the same package hash. The complete three-OS workflow concluded success.

The release validator's \`validation_passed_review_required\` result is not a security certification or release approval. The prior F-01/F-03/F-05 fixes and new lifecycle code still need the independent reviewer to inspect the exact final source. F-04 also needs host acceptance on two machines/users and a package/cache refresh test.

Remaining release blockers are unchanged: npm scope/package ownership has not been verified, the generated package still declares \`UNLICENSED\`, trusted-publisher settings have not been configured, public package publication has not been approved, live host acceptance is incomplete, the completion gate is cooperative, benchmarks remain controlled/synthetic, and PR #70 still has stacked-base ancestry to resolve.

No merge, publication, deployment, production configuration or production database change was performed.


Final matrix completion: all jobs in run #46156668487 completed successfully on source SHA \`28286eb5e1fb2a40c8aaa452a6e1205ff1be75ef\`.
- Windows: 474/474, package hash \`2353e4e66ef89f09c1ca7d02ffd4d360a83b978177d87284abfba151d7ac0103\`, 31 files, no failed qualification steps.
- macOS: 474/474, same hash, 31 files, no failed qualification steps.
- Ubuntu: 474/474, same hash, 31 files, no failed qualification steps.
- Workflow conclusion: success. Release validator decision remains \`candidate_for_independent_human_review\`, not publish/merge approval.

PR #70 head subsequently advanced to \`3e7072aa9269a47592358975e3843cc243e4b9fc\` for this documentation-only qualification record. The Foxy source files and packaged content are unchanged from the qualified source SHA above.


## Licensing and contribution-policy implementation — 28 November 2026

The draft Foxy package branch now includes a scoped Apache License 2.0 implementation:
- Source license text: `artifacts/api-server/FOXY-LICENSE-APACHE-2.0.txt`.
- Package notice: `artifacts/api-server/FOXY-NOTICE.txt`, identifying Copyright 2026 Md Faizal for Foxy-authored material.
- The npm package builder copies these to archive-root `LICENSE` and `NOTICE`, sets the package SPDX field to `Apache-2.0`, and explicitly allowlists both files.
- Package normalization now accepts extensionless `LICENSE` and `NOTICE` files.
- The package smoke test verifies license metadata and full license/notice contents both in the tarball and after offline installation.
- Release tests assert that the license scope is Foxy-only, the monorepo is not blanket-licensed, and the DCO contribution policy is present.
- `docs/FOXY_LICENSE_AND_OWNERSHIP.md` records the Foxy distribution boundary, copyright/assignment checks, third-party treatment, trademarks, DCO/CLA choice and manual owner actions. `docs/FOXY_CONTRIBUTING.md` describes the sign-off process.

This resolves the generated `UNLICENSED` metadata blocker at source level only. It does not independently prove that Md Faizal owns every included contribution, complete the third-party rights audit, verify the npm organization/scope, configure npm Trusted Publishing, or authorize publication. The package remains unpublished and PR #70 remains draft/open/unmerged. The generated archive must pass a new exact-source Windows/macOS/Linux qualification before these changes are considered validated.


Final license-validation candidate update:
- Current PR #70 head at this note: `bcbe7c1019bcdc0c12ee5ea38d1d498fa70b3076`.
- Exact-source qualification: [workflow #46159923973](https://github.com/Darkhero766/Vibeguard/actions/runs/46159923973), queued/pending when checked; GitHub returned no matrix jobs yet. Do not claim the license/package-builder changes passed until this run has Windows, macOS and Ubuntu jobs completed successfully, and the artifact content hashes match.
- The final package normalizer accepts only known text extensions plus the two exact extensionless filenames `LICENSE` and `NOTICE`; arbitrary extensionless files remain rejected.
- The private-beta release checklist now includes scoped-license, legal assignment, third-party inventory, npm namespace ownership, Trusted Publishing and DCO checks.


## 28 November 2026 — final-day release engineering follow-up

This section supersedes older workflow/package status statements above. It does not close the independent-review findings or grant release approval.

### Licensing regression diagnosis and correction

The first license-candidate matrix run (#46159923973) failed in the same regression suite on Windows, macOS and Ubuntu: 472 passed and 3 failed. A diagnostic field was added to the release validator so the failing TAP test names are included in the JSON summary. The three failures were stale assumptions introduced by the license update, not scanner/MCP runtime failures:

1. The notice test rejected a repository documentation path inside the archive NOTICE. The package notice was corrected to be self-contained and no longer points to a file outside the archive.
2. The week-four package test still expected 31 archive files. It now expects 33 and explicitly includes package-root `LICENSE` and `NOTICE`.
3. The week-five metadata test still required `UNLICENSED`. It now checks the intended `Apache-2.0` SPDX field and the included license/notice inputs.

These are code/test corrections, not passing qualification evidence. A fresh exact-head matrix run is still required.

### Owner-gated npm publication workflow

Draft PR #70 now contains `.github/workflows/foxy-publish.yml` and structural regression coverage. The workflow:
- is `workflow_dispatch` only; there is no push or release trigger;
- defaults `confirm_publication` to `false`, so the default action is qualification-only;
- rejects anything other than a `foxy-v<package-version>` tag whose exact commit is already reachable from `main`;
- checks out the immutable workflow event SHA in every job to avoid re-resolving a mutable tag between validation and publish;
- requires the Windows/macOS/Ubuntu qualification matrix to pass before the optional publish job can run;
- uses GitHub Environment `npm-release`, `id-token: write`, npm CLI 11.5.1+, Node 24.15, no package-manager cache in the publish job, and npm provenance;
- validates the `@vibesane/foxy` name, exact tag/version, Apache-2.0 metadata, required license/notice files, canonical per-file manifest and archive SHA-256 before invoking npm;
- refuses long-lived npm token environment variables and uses `npm publish --ignore-scripts`.

The workflow is only on draft PR #70 and is not available for dispatch until it is integrated into the default branch. No npm Trusted Publisher or GitHub Environment protection has been configured, and no publish workflow has published a package. Owner-only protections (required reviewers, tag ruleset, trusted-publisher settings and legal rights attestation) remain mandatory.

The offline package regression now also rejects npm lifecycle scripts and any runtime npm dependencies in the generated package. The self-contained package is expected to have no runtime npm dependencies.

### Current exact-source status

- Current candidate branch: `feat/agentshield-cross-platform-autoconnect`.
- Latest recorded branch head at this update: `fb9b9c56005538f7fab9ebb7937224e1fc15c122`. Additional release checklist documentation may move the head again; always check the live PR head before citing any test result.
- A three-OS matrix run on a prior licensing candidate exposed the three stale assertions listed above. All three have been corrected in follow-up commits.
- The latest qualification workflow was queued when this note was written. Do not claim any pass count or release qualification until all three jobs complete successfully for the live PR head and their package manifests/checksums match.
- PR #70 remains draft/open/unmerged. GitHub currently reports `mergeable_state=dirty`; its base branch has advanced beyond the commit on which the feature branch was based (23 commits behind in the observed comparison). Resolve the stack/merge conflicts deliberately after qualification; do not force-push or change the base silently.
- F-02 remains an accepted product limitation: a same-OS-user process can bypass a cooperative local gate. Do not market Foxy as tamper-proof or as a certification.

### Owner-only tasks before the launch decision

1. Confirm legal ownership/assignment and the right to license all Foxy-authored files attributed to Md Faizal; approve third-party dependency notices.
2. Verify npm organization and package ownership for `@vibesane/foxy` using the intended npm owner account; enable 2FA and restrict publish membership.
3. Create GitHub Environment `npm-release` with required reviewer approval and restrict deployment branches/tags; protect `foxy-v*` tags with a ruleset.
4. Configure npm Trusted Publishing for GitHub owner `Darkhero766`, repository `Vibeguard`, workflow filename `foxy-publish.yml`, and environment `npm-release`.
5. Complete an independent review of scanner rules, full MCP server, installer rollback, queue race/error recovery, package contents, and real Claude/Codex/Cursor acceptance on the supported OSes.
6. Inspect exact-head, all-OS qualification artifacts and run the manual preflight with `confirm_publication=false`. Publish only after all gates and explicit owner approval.

No merge, production deployment, website install-button enablement, production configuration change, SQL migration, npm publication or automatic beta invitation is authorized by this engineering work.
