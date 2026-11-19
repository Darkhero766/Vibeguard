# AgentShield Week 1 — local Claude Code security checks

AgentShield scans local changed files using the **existing VibeSane API and extended detection rules**, plus a narrowly scoped experimental dynamic-SQL-template heuristic. This is a local-only developer prototype, **not vulnerability-free certification**.

## Requirements and build

Node.js 20+, Git, pnpm 10, Claude Code and a local Git repository on macOS/Linux.

From the VibeSane checkout:

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build:agentshield
pnpm --filter @workspace/api-server run test:agentshield
```

The output is `artifacts/api-server/dist/agentshield.mjs`. The existing server build clears `dist`, so rerun the AgentShield build afterward if needed.

## Scan a local project

```bash
node /path/to/Vibeguard/artifacts/api-server/dist/agentshield.mjs scan --changed --cwd /path/to/customer-project
node /path/to/Vibeguard/artifacts/api-server/dist/agentshield.mjs scan --changed --cwd /path/to/customer-project --format json
```

`--changed` scans Git working tree changes, including staged, unstaged and untracked files. `--file PATH` scans one file. `--cwd` chooses the target Git repository. `--format json|text` and `--json` control output.

Exit codes: `0` = scan completed with no High/Critical findings (Medium/Low may remain); `1` = at least one High/Critical finding; `2` = scan could not complete, **not a passing result**.

Limits: 100 files, 1 MB/file, 8 MB total. Supported paths: JS/TS variants, SQL, JSON, YAML and .env variants. Unchanged code and excluded/generated directories are not scanned.

Example response, with no real credential:

```json
{
  "schemaVersion": 1,
  "tool": "VibeSane AgentShield",
  "status": "complete",
  "mode": "file",
  "filesSelected": 1,
  "filesScanned": 1,
  "findings": [
    {
      "id": "hardcoded_jwt_secret-src/auth.ts-1",
      "ruleId": "hardcoded_jwt_secret",
      "severity": "Critical",
      "title": "JWT signing secret is hardcoded",
      "description": "A JWT signing secret appears as a source literal.",
      "recommendation": "Use environment-backed key management and rotate exposed signing keys.",
      "filePath": "src/auth.ts",
      "line": 1
    }
  ],
  "coverage": "Static heuristic analysis of selected files only; untested vulnerabilities may remain.",
  "scannedAt": "2026-11-19T00:00:00.000Z"
}
```

## Claude Code setup (reversible)

From VibeSane's checkout:

```bash
node artifacts/api-server/scripts/agentshield-install.mjs install /path/to/customer-project
```

The installer merges a `PostToolUse` hook into the target repository's `.claude/settings.json`, preserving unrelated settings and hook entries. Verify with Claude Code's `/hooks` command.

Claude Code `Write`, `Edit` and `MultiEdit` actions for supported paths trigger the hook. It scans the modified file and sends actionable findings in `hookSpecificOutput.additionalContext`. Failures are explicitly marked unknown, never passed. A PostToolUse hook runs **after** the write; it does not prevent the write or guarantee that Claude acts on a finding.

To remove the specific hook and preserve other settings:

```bash
node artifacts/api-server/scripts/agentshield-install.mjs uninstall /path/to/customer-project
```

Run uninstall from the same VibeSane checkout used during installation. Moving the checkout breaks the hook path until reinstalled. This installer currently supports POSIX shells, not native Windows.

## Security properties and limitations

- Local source files are read directly; no source is uploaded. No GitHub, Supabase, or other network API calls are needed for scans.
- The CLI does not execute customer source code, dependencies, scripts, or repository hooks. Git FSMonitor is disabled for metadata operations.
- Secret match values and source excerpts are not printed. Only file path, line, check ID, severity, explanation and remediation reach the hook.
- Symlinks and excluded directories are not followed. Scans enforce file count and byte budgets, timeouts, and report incomplete/unknown states.
- Detection rules are heuristic and can miss bugs or produce false positives. A scan without findings does not prove an app is secure.
- The `unsafe_sql_template` heuristic is local-only, experimental and outside the existing 50-rule catalog; its result is a potential risk, not proof of SQL injection.
- `PostToolUse` doesn't cover files changed by Bash or external editors. There is no automatic repair, vulnerability-free guarantee, agent-independent gate or hosted customer installation yet.
- Installer changes `.claude/settings.json` only when explicitly invoked. It never updates production credentials, branches, or customer application code.

## Tests

`pnpm --filter @workspace/api-server run test:agentshield` generates isolated temporary Git repositories and verifies a synthetic secret, dynamic SQL, missing API authorization checks, clean code, scanner errors, oversized files, Claude hook feedback and install/uninstall preservation.

A branch-restricted, read-only GitHub Actions workflow also runs these checks without deploying.

## Week 2: automatic fix-and-rescan

Give Claude a bounded set of actionable findings, let it propose changes under human review, rescan edited files, run approved regression tests in isolation, and report `verified`, `unresolved` or `unverified` states separately. Do not claim a vanished regex warning proves the fix secure.
