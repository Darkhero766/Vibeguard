# VibeSane AgentShield — Week 3: Final Security Gate & Hardening

**Developer preview.** AgentShield scans local Git working-tree changes, guides Claude Code repairs, and records scoped evidence. It does not certify code secure and has not been tested inside an authenticated interactive Claude Code installation.

## Architecture

1. Reuse the existing VibeSane static detectors and local Week 1 CLI. Customer source files are never executed.
2. PostToolUse (Write, Edit, MultiEdit) scans edited files and returns bounded remediation guidance.
3. Stop runs a fresh changed-file scan across relevant staged, unstaged and untracked Git files, including Bash-created files. It does not parse arbitrary shell commands.
4. Two worktree snapshots surround the scan. Git status and SHA-256 hashes of changed supported local file contents must match. Changes during scanning return scan_incomplete, not a pass.
5. Every selected supported changed file must be covered. Skipped symlinks, oversized files and missing coverage also result in scan_incomplete.
6. Monitor/Assist offer final advisory warnings but do not block Claude. Explicitly opted-in Auto-fix can request one bounded Stop continuation with a documented JSON decision:block and reason; never override permissions.
7. A zero-file result is no_changed_files, never a security pass. Existing narrow JWT verification stays separate from mere regex disappearance.

Supported files: JS/TS variants, SQL, JSON, YAML and .env variants. Budgets: 100 files, 1 MB per file, 8 MB total.

## Build and install

Prerequisites: Git, Node.js 20+, pnpm 10, Claude Code on macOS/Linux.

~~~bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build:agentshield
pnpm --filter @workspace/api-server run test:agentshield
pnpm --filter @workspace/api-server run test:agentshield:week2
pnpm --filter @workspace/api-server run test:agentshield:week3
~~~

Use the new unified wrapper from the checked-out VibeSane project, substituting your own disposable local Git project path:

~~~bash
node artifacts/api-server/scripts/vibesane.mjs doctor --cwd /path/to/project
node artifacts/api-server/scripts/vibesane.mjs init --cwd /path/to/project
node artifacts/api-server/scripts/vibesane.mjs scan --changed --cwd /path/to/project --format json
node artifacts/api-server/scripts/vibesane.mjs verify --changed --cwd /path/to/project
node artifacts/api-server/scripts/vibesane.mjs status --cwd /path/to/project
node artifacts/api-server/scripts/vibesane.mjs config --cwd /path/to/project --mode monitor
node artifacts/api-server/scripts/vibesane.mjs config --cwd /path/to/project --mode assist
node artifacts/api-server/scripts/vibesane.mjs config --cwd /path/to/project --mode auto-fix --attempts 2
node artifacts/api-server/scripts/vibesane.mjs uninstall --cwd /path/to/project
~~~

The Week 1/2 direct CLI and controller commands remain available. Repeated installation is idempotent and preserves unrelated Claude settings/hooks. The installer uses an absolute path to this VibeSane checkout; reinstall after moving it. Doctor reports Node/platform, Git repository, built scanner, settings readability and hook installation independently. A ready scanner does not imply hooksInstalled is true.

## Configuration and safety

Default configuration is Monitor:

~~~json
{
  "enabled": true,
  "mode": "monitor",
  "maxAttempts": 2,
  "timeBudgetSeconds": 120,
  "blockingSeverity": "High",
  "verification": { "syntaxCheck": false, "approved": false },
  "privacy": { "retentionHours": 24 }
}
~~~

Configuration and session state normally live outside the customer repository. AgentShield stores only file/rule metadata, timestamps, SHA-256 fingerprints and bounded histories, never source excerpts, matched credentials or transcripts. Files use private permissions and atomic writes. State is separated by project/session with per-session locks, lock recovery only if the owner cannot be found, retention-based expiration and conservative file pruning. Histories cap at 200 files, and truncation is reported as partial coverage.

No customer source or secrets are uploaded. Git status operations disable repository hooks and Git fsmonitor. The scanner never runs customer source, package scripts, tests or migrations. The optional approved Node syntax verifier only parses JS and is not a security regression.

### Final gate outcomes

- complete: selected supported Git changes were all scanned, and worktree fingerprints stayed stable. Inspect blocking counts separately.
- scan_incomplete: scan failed, files changed during the scan, a supported file was skipped, or size limits were exceeded. Status UNKNOWN; never treat as passed.
- no_changed_files: nothing supported was present in the Git change set; no security pass implied.
- partial: manual verification omitted previously flagged files or session history was truncated.
- rescan_passed: a scanner finding disappeared; independent security verification remains separate.
- verification_passed: only a supported, narrow independent regression assertion (for example environment-backed JWT configuration) passed; not general application security.

Auto-fix continuation is bounded by maxAttempts, timeBudgetSeconds, stable finding fingerprints and stop_hook_active, plus Claude Code's own loop protections. Monitor/Assist are advisory. A scanner failure returns an UNKNOWN warning rather than success.

## Automated evidence

The branch-only GitHub workflow runs Week 1, Week 2, Week 3, and existing SUE regression suites, and builds the standalone scanner. The existing API-wide TypeScript errors are informational and remain separate; green AgentShield CI is not equivalent to a clean production API build.

Simulated end-to-end acceptance creates a disposable Git repository, writes a synthetic JWT secret, generates Claude-compatible hook input, sees a detection, simulates an authorized repair, rescans, and checks the final gate. Additional tests cover Bash-created files, staged changes, symlinks, scan races, state locking, stale locks, invalid state, secret privacy, file renames, installer idempotence, and source prompt injection.

These tests simulate Claude hooks; no authenticated interactive Claude Code turn has been run.


## Measured 100-file performance

On the branch's GitHub Actions Ubuntu runner on November 19, 2026, the 100-file synthetic JavaScript changed-file final gate completed in **95 ms**, measured inside the fixture (the surrounding test took roughly 123 ms). A 101-file fixture correctly returned scan_incomplete. These are single-run synthetic measurements, not a production latency guarantee or representative benchmark of large real-world codebases.

CI evidence: https://github.com/Darkhero766/Vibeguard/actions/runs/44467622980

## Manual live acceptance checklist before release

1. Install into a disposable Git repository on supported macOS/Linux and verify the PostToolUse and Stop hooks using Claude Code's /hooks command.
2. In Monitor, ask Claude to create a JS file with a synthetic JWT secret; confirm it detects the issue and does not edit source on AgentShield's authority.
3. Enable Auto-fix explicitly and ask Claude to address the synthetic issue. Confirm normal developer permissions and a maximum of two repair attempts.
4. Ask Claude to create a second synthetic vulnerable file using Bash; confirm the final Stop gate sees the Git-visible change.
5. Break the scanner temporarily; confirm security status is UNKNOWN rather than passed.
6. Check manual verify, uninstall, no secret values in persisted state, and accurate verification qualifications.
7. Obtain a human security review and a false-positive/negative benchmark before a public beta.

## Rollback

~~~bash
node artifacts/api-server/scripts/vibesane.mjs config --cwd /path/to/project --enabled false
node artifacts/api-server/scripts/vibesane.mjs uninstall --cwd /path/to/project
~~~

Do not delete the whole .claude directory or unrelated settings. Session metadata can be removed only after confirming the exact per-project path. No production deployment or customer source modification is needed.

## Known limitations

- Claude Code interactive compatibility is still unverified across real terminal, IDE and cloud sessions.
- Git-ignored and unchanged files are not included in the changed-file gate. Some deletions and unsupported languages are outside scope.
- Static checks cannot prove SQL safety, authorization correctness, tenant isolation or vulnerability absence.
- Customer test execution, isolated dynamic verification, autonomous patch generation by VibeSane, Windows-native installation, npm publishing, Cursor/Codex adapters and production deployment remain deferred.
- State cleanup is best effort, not guaranteed secure deletion.
- Existing API TypeScript errors remain and should be fixed before production release.
