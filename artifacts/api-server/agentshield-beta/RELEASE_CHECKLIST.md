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
- [ ] Allowlist is narrow, validated, and host MCP status reports it configured
- [ ] Beta limitations, troubleshooting, rollback, feedback and private vulnerability-reporting instructions are supplied
- [ ] Security reviewer reports no unresolved Critical/High findings
- [ ] Owner explicitly approves distribution to named consenting testers

No beta invitations, telemetry, npm publication, production deployment, GitHub Actions run or default-branch merge occur automatically. Engineering qualification alone does not authorize distribution.
