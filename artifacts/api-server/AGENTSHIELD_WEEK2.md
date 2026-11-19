# VibeSane AgentShield — Week 2 Fix-and-Verify

**Scope:** local Claude Code hook integration, bounded repair feedback, safe rescans and evidence-based status. Developer preview; not vulnerability-free certification.

## Architecture

1. Claude Code writes source via Write, Edit or MultiEdit.
2. PostToolUse invokes the local AgentShield coordinator, which reuses the Week 1 scanner.
3. Fixed internal remediation policies return actionable feedback. Monitor reports only; Assist requests a proposed fix with human approval; Auto-fix requests Claude attempt a fix under permissions already granted.
4. The next edit triggers a rescan and local state transition, recording only rule/file metadata and timestamps. Attempt and time budgets stop repeated repair requests.
5. The Stop hook can ask Claude for at most one continuation per unchanged finding fingerprint, provided the user opted into Auto-fix and stop_hook_active is false.
6. Manual verification scans tracked changes. A narrow independent assertion checks that JWT signing keys moved from a literal assignment to server environment configuration. Other static disappearances remain unverified without independent security tests.
7. An optional approved node --check invocation is parse-only, never executes customer source and is **not** a security regression.

## Build, install, test

Requirements: Node.js 20+, Git, pnpm, Claude Code on macOS/Linux.

~~~bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build:agentshield
pnpm --filter @workspace/api-server run test:agentshield
pnpm --filter @workspace/api-server run test:agentshield:week2
node artifacts/api-server/scripts/agentshield-install.mjs install /path/to/dev-project
~~~

Installer merges AgentShield-specific PostToolUse and Stop hooks into the local project's .claude/settings.json without deleting other hooks. Moving the VibeSane checkout requires reinstalling.

## Modes and configuration

Default is **Monitor**, so no repair requests occur without explicit opt-in. Local per-user, per-project config is at ~/.config/vibesane/agentshield/<project-hash>.json; it is outside the customer's Git repository.

~~~bash
node artifacts/api-server/scripts/agentshield-controller.mjs config --cwd /path/to/dev-project --mode monitor
node artifacts/api-server/scripts/agentshield-controller.mjs config --cwd /path/to/dev-project --mode assist
node artifacts/api-server/scripts/agentshield-controller.mjs config --cwd /path/to/dev-project --mode auto-fix --attempts 2
node artifacts/api-server/scripts/agentshield-controller.mjs config --cwd /path/to/dev-project --syntax-check true
~~~

The opt-in Auto-fix mode **only suggests that Claude attempt a repair**; VibeSane does not silently modify files, give Claude new permissions, dismiss approval dialogs, or guarantee the agent acts.

Example local configuration:

~~~json
{
  "enabled": true,
  "mode": "auto-fix",
  "maxAttempts": 2,
  "timeBudgetSeconds": 120,
  "blockingSeverity": "High",
  "verification": { "syntaxCheck": false, "approved": false },
  "privacy": { "retentionHours": 24 }
}
~~~

Only fixed parse-only JavaScript syntax verification can be enabled; arbitrary customer scripts, npm commands, database migrations and production tests are never executed.

## Status and verification CLI

~~~bash
node artifacts/api-server/scripts/agentshield-controller.mjs status --cwd /path/to/dev-project
node artifacts/api-server/scripts/agentshield-controller.mjs verify --changed --cwd /path/to/dev-project
node artifacts/api-server/scripts/agentshield-controller.mjs verify --file /path/to/dev-project/src/auth.js --cwd /path/to/dev-project
~~~

The status command shows the most recently updated local session; use --session SESSION_ID for a specific Claude Code session. Verification exit codes: 0 = completed without findings above the configured blocking severity; 1 = blocking findings; 2 = incomplete or failed. Code 0 does not certify security.

Example **illustrative** result fields:

~~~json
{
  "tool": "VibeSane AgentShield",
  "status": "complete",
  "mode": "auto-fix",
  "filesScanned": 1,
  "activeFindings": 0,
  "blocking": 0,
  "outcomes": [
    {
      "filePath": "src/auth.js",
      "scanState": "rescan_passed",
      "verificationState": "verification_passed",
      "activeFindings": 0,
      "verificationResults": [
        {
          "ruleId": "hardcoded_jwt_secret",
          "status": "verification_passed",
          "level": "narrow_static_regression",
          "evidence": "Independent assertion checked an environment-backed JWT signing key. Actual JWT signing and key rotation remain unverified."
        }
      ]
    }
  ],
  "securityGuarantee": false
}
~~~

For dynamic SQL, auth and RLS findings that disappear, the expected result is scanState rescan_passed and verificationState unverified unless a supported independent verification actually runs.

## Finding lifecycle and budgets

detected → repair_requested → repair_attempted → rescan_passed / rescan_failed → verification_passed / verification_failed / unverified.

The result uses separate scanState and verificationState because regex absence is not proof of a fix. Findings are grouped by an SHA-256 digest of path, rule ID and title; line number movement does not reset retries. Per-file repeated findings of the same rule are grouped by count. Auto-fix allows two edit/rescan cycles per outstanding file by default and a 120-second budget. The Stop hook honors stop_hook_active and requests at most one continuation per fingerprint.

## Security, limitations, and threat model

- Local code is scanned without uploading to a server. Git metadata is inspected with repository hooks and fsmonitor disabled.
- Customer project files are not executed. The optional syntax verifier only parses JavaScript and is explicitly approved.
- AgentShield stores only local metadata (file/rule IDs, severity, hashed fingerprints, attempt counts and timestamps), not source contents, credentials or tool transcripts. State expires after 24 hours by default and uses private filesystem permissions.
- Invalid files, unsupported extensions, symlinks, scan timeouts and incomplete coverage cannot be reported as clean.
- Finding text is provided as data from fixed policies, not instructions extracted from scanned source. Malicious path names are escaped and truncated.
- The PostToolUse hook cannot prevent an edit that already happened. Stop feedback is not a permanent deployment gate.
- Bash-based file changes, external editors and other coding agents are not covered by the Week 2 Claude hook.
- The verifier reports only scoped evidence. Broad dynamic security regression tests require an explicitly approved, isolated runner, deferred beyond Week 2.
- AgentShield does not guarantee secure or beautiful code; quality and functional test coverage are distinct efforts.

## Demo and evidence

Automated tests simulate Claude hook input. In a disposable Git repository, a synthetic JWT literal is detected and a rule-specific repair is offered. After an authorized edit changes the assignment to process.env.JWT_SECRET, static scanning reports rescan_passed. A separate static assertion checks the configuration change and reports a narrowly scoped verification_passed; actual JWT runtime behavior remains unverified. An interpolated SQL template can disappear after repair, but its security result correctly remains unverified.

An actual interactive Claude Code session has **not** been exercised as part of these synthetic hook tests; the test result must not be represented otherwise.

CI runs the existing Week 1 suite, Week 2 suite and SUE regression on the feature branch with read-only repository permissions. The broader API TypeScript check retains baseline errors and is informational; a green AgentShield workflow does not mean the entire API typechecks cleanly.

## Rollback

~~~bash
node artifacts/api-server/scripts/agentshield-controller.mjs config --cwd /path/to/dev-project --mode monitor
node artifacts/api-server/scripts/agentshield-install.mjs uninstall /path/to/dev-project
~~~

Uninstall removes only hooks from the current VibeSane checkout. No customer application files are modified by VibeSane. Remove local per-project configuration and temporary state separately if desired after verifying the exact paths.

## Deferred

A secure sandbox runner for arbitrary approved customer regression tests, autonomous patch application, richer finding correlation, hosted organization policies, cross-agent integration, and general application security verification are outside this Week 2 scope.
