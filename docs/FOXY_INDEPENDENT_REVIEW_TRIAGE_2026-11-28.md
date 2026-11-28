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
| F-03 | Medium | Connector backups and lock artifacts can be written next to project configuration, where a broad `git add .` may capture them or unrelated MCP credentials. | **Open.** Move persistent backups and lock state to a private per-user Foxy state directory. Add crash-safe handling for temporary files. Test that repository status remains unchanged and that backups are owner-only. |
| F-04 | Medium | Absolute Node and package paths plus the workspace allowlist are written into workspace MCP configuration. | **Open.** Decide and implement a local-only per-machine config strategy. Do not silently commit machine-specific paths or overwrite a tracked team configuration. Test two independent machines/users and an npx cache refresh. |
| F-05 | Low/Medium | Codex TOML conflict detection uses a narrow regular expression. | **Open.** Replace it with a proper TOML parser or a conservative table-header parser that recognizes quoted/dotted forms and refuses ambiguous input. Add duplicate-table regression fixtures. |

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
