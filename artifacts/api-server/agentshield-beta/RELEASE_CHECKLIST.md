# AgentShield private-beta release gate

**Engineering completion is not approval to distribute.** Keep this gate fail-closed and update with real evidence.

- [ ] Current feature commit independently reviewed; all Critical/High issues resolved
- [ ] Local release qualification passes on the exact candidate commit; preserve its JSON report
- [ ] Accuracy benchmark category results and known false positives reviewed
- [ ] Local unpublished tarball installed, exercised, removed and reinstalled in an isolated prefix
- [ ] At least one real coding-agent MCP client (Codex CLI or Claude Code) completes discovery, scan, explain, remediation and verification
- [ ] Authorized and unauthorized synthetic workspace tests pass through the actual client
- [ ] Completion hook behavior is validated on each host that will be supported to pilot participants (Codex Stop and Claude Code Stop where applicable)
- [ ] Linux, macOS and Windows installation checks pass on actual intended versions, including native path handling, subprocess environment, config updates, symlink refusal and uninstall
- [ ] Windows CI and real Windows host acceptance pass before advertising Windows support
- [ ] Package contents, checksum, Node requirement and third-party notices reviewed
- [ ] Verify the exact npm archive declares `Apache-2.0` and includes the full `LICENSE`, `NOTICE`, and `THIRD_PARTY_NOTICES.txt`; retain the archive manifest and SHA-256 for the exact source SHA
- [ ] Confirm the Apache-2.0 grant is limited to the Foxy distributable and does not accidentally license the rest of the VibeSane monorepo or hosted services
- [ ] Verify copyright assignment/authority for every Foxy-authored file attributed to Md Faizal; check employer, client, contractor, co-founder and prior-contributor rights before distribution
- [ ] Audit all bundled/transitive components in the final archive and confirm each license/notice is present and compatible
- [ ] Confirm `@vibesane` npm organization and package ownership from the intended npm owner account; enable 2FA and restrict publish membership
- [ ] Review `.github/workflows/foxy-publish.yml`: it is manual-only, defaults to preflight (`confirm_publication=false`), validates `foxy-v<package-version>`, pins all jobs to the immutable event SHA, and requires all three OS qualification jobs before the publish job can run
- [ ] Protect the `foxy-v*` tag pattern with a repository ruleset; restrict tag creation/update to release maintainers and prevent tag mutation after approval
- [ ] Configure GitHub Environment `npm-release` with required owner/reviewer approval, prevent self-review where available, and restrict deployments to approved release tags
- [ ] Configure and independently verify npm Trusted Publishing (OIDC) for exact owner `Darkhero766`, repo `Vibeguard`, workflow filename `foxy-publish.yml`, environment `npm-release`; no long-lived npm token
- [ ] Run the owner-gated workflow once with `confirm_publication=false` against the exact release tag, inspect all OS qualification artifacts and archive checksums, then rerun with `true` only after explicit owner approval
- [ ] Verify every Foxy contribution has a valid DCO sign-off (`Signed-off-by`) or separately documented rights grant
- [ ] Allowlist is narrow, validated, and host MCP status reports it configured
- [ ] Beta limitations, troubleshooting, rollback, feedback and private vulnerability-reporting instructions are supplied
- [ ] Security reviewer reports no unresolved Critical/High findings
- [ ] Owner explicitly approves distribution to named consenting testers

No beta invitations, telemetry, npm publication, production deployment, GitHub Actions run or default-branch merge occur automatically. Engineering qualification alone does not authorize distribution.
