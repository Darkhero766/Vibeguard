# VibeSane AgentShield — Week 4 private-beta engineering report

**Status:** engineer-tested developer preview. Not approved for external distribution, npm publication, production deployment or public/private beta invitations. An authenticated interactive Claude Code session has not been exercised using the available tools.

## Architecture and changes from Week 3

Week 1–3 scanning, PostToolUse, bounded Stop continuation, existing VibeSane rules, local state, final Git-worktree gate and deterministic fixture tests are retained.

Week 4 adds:

1. A 120-case individually labeled curated scanner corpus and a separate 24-case challenge corpus.
2. Measured precision, recall and false-positive rates with reproducible category details and case IDs for every miss.
3. More precise authorization guard recognition in the existing API scanner. An awaited requireAuth/requireUser assignment counts only when its result is explicitly checked before the write. Commented-out guards are ignored.
4. Detection of typed JWT key literals including Readonly<string>, browser-global service-role keys, quoted SQL table creation and common staging environment files.
5. A local-only heuristic for dynamic SQL string concatenation in addition to template interpolation.
6. A versioned, unpublished beta npm tarball with a self-contained scanner and scripts, no runtime package dependencies, and an explicit package-content allowlist.
7. Offline installation, idempotent hook setup/removal, package content, privacy, adversarial detector and synthetic performance tests.
8. Scoped expiring developer acknowledgements. These mark review only; they **do not suppress a security finding, change severity, or bypass the gate**.
9. Optional readable final verification text via the existing controller's --format text.
10. A synthetic demo, quick start, feedback questionnaire, sanitized bug-report template and fail-closed release checklist.

All code remains on the feature branch. Existing GitHub webhook scanning routes are preserved; the API scanner rules were updated only for reviewed detector patterns.

## Quick start: checkout-based beta

Prerequisites: Node.js 20+, Git, pnpm 10, Claude Code, and macOS or Linux. Use the Week 4 branch and a **separate disposable Git project**.

~~~bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build:agentshield
pnpm --filter @workspace/api-server run test:agentshield:week4

node artifacts/api-server/scripts/vibesane.mjs doctor --cwd /absolute/path/to/test-project
node artifacts/api-server/scripts/vibesane.mjs init --cwd /absolute/path/to/test-project
node artifacts/api-server/scripts/vibesane.mjs scan --changed --cwd /absolute/path/to/test-project --format json
node artifacts/api-server/scripts/vibesane.mjs verify --changed --cwd /absolute/path/to/test-project --format text
~~~

Open Claude Code in that Git project; inspect /hooks. Monitor is the safe default. Switch to Assist or Auto-fix only when authorized:

~~~bash
node artifacts/api-server/scripts/vibesane.mjs config --cwd /absolute/path/to/test-project --mode assist
node artifacts/api-server/scripts/vibesane.mjs config --cwd /absolute/path/to/test-project --mode auto-fix --attempts 2
node artifacts/api-server/scripts/vibesane.mjs status --cwd /absolute/path/to/test-project
~~~

A reviewed finding can be acknowledged without concealing it:

~~~bash
node artifacts/api-server/scripts/vibesane.mjs acknowledge --cwd /absolute/path/to/test-project --file src/auth.js --rule hardcoded_jwt_secret --reason false-positive --hours 24
~~~

Allowed reason codes: false-positive, accepted-risk, compensating-control. Entries expire within 1–168 hours, apply to one file and rule, and are stored in local per-project configuration. They do not alter scan results or gating. A severity threshold can be set through config --threshold Medium|High|Critical|Low; no silent per-rule suppression is included.

Uninstall only AgentShield hooks before removing the checkout/package:

~~~bash
node artifacts/api-server/scripts/vibesane.mjs uninstall --cwd /absolute/path/to/test-project
~~~

Do not delete the entire .claude directory. Reinstall hooks if the AgentShield checkout or package location changes.

## Private offline package

~~~bash
pnpm --filter @workspace/api-server run package:agentshield:beta
~~~

This command locally creates an **unpublished** package archive in the API server's ignored dist directory. Version: 0.4.0-beta.1. The package contains exactly 11 allowlisted files: package metadata, README, bundled scanner and eight runtime scripts. It includes no source corpus, GitHub App route code, production credentials, database client configuration or app dependencies. It sets private:true and has no install/postinstall lifecycle scripts.

The Week 4 tests use npm install --offline --ignore-scripts against the generated archive, inspect the installed bin link, run doctor, install hooks, and uninstall them from a disposable Git repository. The tarball is not uploaded to a release, published on npm, or distributed to participants.

## Security accuracy

There are two separate, synthetic labeled corpora. All results concern **target-rule detection**, not whether a real exploit exists; other rules may raise additional findings. Labels and predictions are published as source fixtures so failures cannot be hidden.

### Curated 120-case corpus (12 supported categories)

| Phase | TP | TN | FP | FN | Precision | Recall | False positive rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Before improvements | 59 | 58 | 2 | 1 | 96.7% | 98.3% | 3.3% |
| After improvements | 60 | 60 | 0 | 0 | 100% | 100% | 0% |

The original failure cases were a typed JWT literal (miss) and two legitimate checked authorization guards (false alarms). The enhanced scanner covers those cases without trusting comments as guards.

**This 100% result is on a small curated synthetic benchmark only. It is not a real-world security accuracy claim.**

### Separately authored 24-case challenge corpus

| Phase | TP | TN | FP | FN | Precision | Recall | False positive rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Before challenge-driven improvements | 7 | 11 | 1 | 5 | 87.5% | 58.3% | 8.3% |
| After challenge-driven improvements | 12 | 11 | 1 | 0 | 92.3% | 100% | 8.3% |

The remaining false positive involves a custom authorizeRequest(...) function. It is intentionally not silently trusted: code-specific guard functions must be reviewed to confirm their security semantics. The fixed cases include SQL concatenation, browser service-role exposure, quoted RLS table names, staging env files, and generic TypeScript JWT key types.

After tuning detectors against the challenge cases, those challenge results are **no longer independent held-out performance evidence**. A new untouched external corpus and a real-developer pilot are needed before making broader accuracy claims.

### Reproduce metrics

~~~bash
pnpm --filter @workspace/api-server run build:agentshield
pnpm --filter @workspace/api-server run benchmark:agentshield
node artifacts/api-server/scripts/benchmark-agentshield-accuracy.mjs --holdout
~~~

The command outputs actual TP/TN/FP/FN, precision, recall, FPR, per-category counts, case IDs for misses, test environment and elapsed time. Source files and synthetic credentials are never included in the report.

## Performance and stability

Measured on one GitHub Actions Linux Ubuntu runner using Node.js 24.22.2, running the Week 4 synthetic final-gate test:

| Changed files | Observed scan time | Test-runner process RSS sample |
| --- | ---: | ---: |
| 1 | 64 ms | ~77 MB |
| 10 | 78 ms | ~78 MB |
| 50 | 113 ms | ~80 MB |
| 100 | 142 ms | ~81 MB |

These samples are from one CI run. The memory readings are **the Node test-runner process's RSS**, not peak combined scanner subprocess memory. They are not production latency or peak memory guarantees. The gate refuses 101 changed supported files with scan_incomplete rather than returning clean. The Week 3 95 ms synthetic 100-file observation is not a controlled same-run comparison.

## Regression and release status

GitHub Actions on the Week 4 branch runs:
- SUE applicability regression.
- Standalone scanner build.
- All Week 1, Week 2 and Week 3 AgentShield suites.
- Week 4 accuracy, packaging, privacy, installation, regression and performance tests.
- Independently printed curated and challenge metrics.

**Known baseline:** the API-wide TypeScript check still reports unrelated pre-existing errors and is informational in this branch's CI. A passing AgentShield-specific suite does not mean production API-wide typechecks/builds are clean. Typecheck errors must be triaged and shipping blockers resolved before production release.

## Operational privacy and threats

- Local CLI reads only selected supported files and Git metadata; no source upload, cloud scan, customer authentication, Supabase connection or repository-code execution is performed.
- The script-based Claude Code hooks execute with the developer's OS permissions. Install only from a trusted checkout; they do not bypass Claude Code edit approval.
- The state coordinator persists bounded path/rule metadata, stable finding fingerprints, repair counts and history in private local files, not source snippets or secret matches.
- Git hooks and fsmonitor are disabled for metadata scans, but a general untrusted Git repository configuration/attributes threat assessment and hostile real-world projects still warrant review before distribution.
- Static findings can be incorrect or incomplete. Missing SQL/auth/RLS findings do not imply vulnerability absence; an acknowledgement also does not.
- No arbitrary customer tests, migrations, package install scripts or application code are run by the scanner.

## Troubleshooting

**Hooks do not appear:** run doctor, check hooksInstalled, verify .claude/settings.json is a regular file in a non-symlinked .claude directory, and inspect /hooks in Claude Code. Restart/reload Claude Code when its documentation requires.

**Scanner missing:** rerun build:agentshield in the VibeSane checkout and reinstall after moving it.

**No changed files:** the final gate reports no_changed_files; create/edit a supported file inside a Git working tree, but never treat no_changed_files as a security pass.

**Scan timeout / oversize / symlink:** status is UNKNOWN or scan_incomplete. Reduce the scope, remove unsafe symlinks or use manual review; never bypass limits by declaring a clean result.

**False positive:** use a sanitized bug report and a narrowly scoped acknowledgement; the gate still treats the finding as unresolved. Do not put credentials or confidential source in feedback.

**Existing hooks changed:** use uninstall from the same installation; it removes AgentShield's specific commands, not unrelated hooks. Recover any hand-edited settings from version control/backups if necessary.

**Authentication/permissions:** source scanning requires no VibeSane cloud token. A live Claude Code test requires a separately authenticated Claude environment and is not included in CI.

## Beta pilot materials

See agentshield-beta/README.md, its vulnerable and secure synthetic source fixtures, PILOT_FEEDBACK.md, BUG_REPORT.md, and RELEASE_CHECKLIST.md.

Pilot target: three to five **consenting, owner-approved** developers using Claude Code. No invitations have been sent; no automatic telemetry is enabled. Manually record installation success, time to first scan, hook failures, false positives, agent repair usefulness, scan timings, permission boundaries, and uninstall success without collecting raw source.

## Live Claude Code acceptance — still required

A real authenticated Claude Code executable was **not available** in the execution environment for this mission.

Before invitation or release:
1. On a supported macOS/Linux machine, install the verified beta package into a disposable Git project and confirm hooks in Claude Code /hooks.
2. In Monitor mode, ask a real Claude session to write a synthetic hardcoded JWT key file. Confirm PostToolUse feedback.
3. Explicitly enable Auto-fix. Request a minimal authorized repair, confirm normal permission prompts, and confirm retry limits.
4. Ask Claude to use Bash to create a separate synthetic vulnerable JS file; verify the Stop final gate catches it.
5. Confirm final static resolution is not claimed to be independently security verified.
6. Deliberately break the scanner; confirm status UNKNOWN, never clean.
7. Verify that settings and source remain intact after uninstall. Review remaining false-positive and false-negative limitations.

## Release decision

**Week 4 engineering deliverables:** implementation, synthetic benchmarks, offline install workflow, automated testing and pilot documentation.

**Private-beta distribution: NOT APPROVED / NOT READY.** Remaining gates include authenticated Claude Code acceptance, real supported-platform pilot checks, API-wide TypeScript/build triage, further untouched independent accuracy evaluation and human security review. No npm publish, default-branch merge, production deploy or user outreach has been authorized.
