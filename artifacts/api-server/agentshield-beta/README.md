# AgentShield private-beta pilot kit

**Status:** materials prepared, no real pilot participants recruited and no release approved.

This is a disposable, synthetic demonstration of local code scanning and Claude Code hook responses. Do not deploy these fixtures, connect production credentials, or assume a clean static scan proves application security.

## First run

Use the VibeSane checkout on the Week 4 feature branch (Node.js >=20, Git, pnpm and macOS/Linux):

1. Build: run pnpm install --frozen-lockfile and pnpm --filter @workspace/api-server run build:agentshield.
2. From a disposable **Git repository**, run node artifacts/api-server/scripts/vibesane.mjs doctor --cwd /absolute/path/to/project.
3. Install locally with node artifacts/api-server/scripts/vibesane.mjs init --cwd /absolute/path/to/project.
4. Open Claude Code in that project; inspect /hooks and verify AgentShield's PostToolUse and Stop entries are loaded.
5. Start in Monitor mode (default). Use a synthetic vulnerable fixture; confirm it reports the issue without altering source.
6. Only after explicit opt-in, use config --mode assist or config --mode auto-fix --attempts 2.
7. Run verify --changed; note that no scanned files, an incomplete scan and absence of findings are different states.
8. Run uninstall --cwd /absolute/path/to/project before removing the package.

Use the unified CLI entry from the installed beta tarball, or from the checked-out scripts/vibesane.mjs. No hosted API or source-code upload is required by the local scanner.

## Demo fixtures

- demo/vulnerable contains fake, deliberately insecure JS/SQL examples and **no real secrets**.
- demo/secure contains synthetic environment-backed configuration and RLS-enabled SQL.
- Copy one variant into a *new disposable Git directory*. Run git init. Never copy the vulnerable demo into a production project.
- The demo is not intended to run as an application; it tests static detections only.

## Modes

Monitor = show findings, no automatic repair requests or completion blocking.
Assist = provide proposed minimal fixes and ask for developer approval.
Auto-fix = request bounded Claude repair under the permissions Claude already has, with a maximum of two attempts by default. It does not silently apply patches.

## Privacy and feedback

Static source code stays local when using the scanner. It writes only limited local file/rule/session metadata, timestamps and fingerprints for the repair coordinator; optional feedback is manually supplied. No remote telemetry or invitations are enabled.

Please use PILOT_FEEDBACK.md if and when a consenting developer completes an approved pilot, and BUG_REPORT.md for reproducible issues. Uninstall first when discontinuing use.

Beta release remains **blocked** until a real authenticated Claude Code end-to-end acceptance run, supported-platform installation checks, security review, and explicit owner approval.
