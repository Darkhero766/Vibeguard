# AgentShield Week 4 private-beta release gate

**Engineering completion is not approval to distribute.** Keep this gate fail-closed and update with real evidence.

- [ ] Draft PR reviewed and approved by owner / security reviewer
- [ ] All Week 1–4 AgentShield tests pass on target commit
- [ ] Existing SUE tests pass and GitHub scanner unchanged except explicitly reviewed detector updates
- [ ] Accuracy benchmark includes 100+ labeled cases, real TP/TN/FP/FN, category metrics and limitations
- [ ] Detector regressions run on realistic hold-out fixtures beyond the benchmark corpus
- [ ] Offline beta tarball installed and removed successfully in CI with lifecycle scripts disabled
- [ ] No source data or private secrets included in package or uploaded by local scanning
- [ ] Real authenticated Claude Code PostToolUse, Stop and Bash-file acceptance scenario passed
- [ ] Mac and Linux environment checks passed on actual intended platforms
- [ ] Existing API-wide TypeScript errors resolved or explicitly isolated from the supported shipping architecture
- [ ] Threat model and false-positive caveats reviewed with engineer
- [ ] Documentation, rollback and pilot report templates complete
- [ ] Owner explicitly approves distribution to 3–5 consenting users

No beta invitations, telemetry, npm publication or default-branch merge occur automatically.
