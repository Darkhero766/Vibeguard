# AgentShield private-beta pilot kit

**Status:** materials prepared, no real pilot participants recruited and no release approved.

## Install and connect the coding agent

For the complete copy-and-paste installation flow for Codex and Claude Code, see [`docs/AGENTSHIELD_MCP_SETUP.md`](../../../docs/AGENTSHIELD_MCP_SETUP.md). It builds and installs the unpublished local package, configures the required `VIBESANE_ALLOWED_ROOTS_JSON` allowlist, verifies diagnostics and tool discovery, installs hooks, and documents upgrade, rollback, and uninstall.

Short form from the trusted repository root (Node.js 24.15+, Git, pnpm; Windows remains qualification-gated):

```sh
pnpm --filter @workspace/api-server run build:agentshield
node artifacts/api-server/scripts/package-agentshield-beta.mjs
npm install --global --prefix "$HOME/.local" --ignore-scripts \
  "$PWD/artifacts/api-server/dist/vibesane-agentshield-0.7.0-beta.5.tgz"
VIBESANE_ALLOWED_ROOTS_JSON='["/absolute/path/to/disposable-repo"]' \
  "$HOME/.local/bin/vibesane" mcp-doctor
```

Run `vibesane connect` from the project root to register MCP for detected Claude Code, Codex CLI and Cursor hosts. Use `vibesane connect --agent all` to configure all three, or `vibesane connect --agent mcp` for a generic stdio entry. The command preserves unrelated settings, backs up existing configuration and authorizes only the current repository. Restart the agent and approve the MCP server. It does not install lifecycle hooks. The MCP server must receive the same allowlist through the host's MCP `env` field. Never broaden it beyond repositories the tester authorizes for scanning. Use the documented host-specific configuration and the disposable fixture before any intended beta repository.

This is a disposable, synthetic demonstration of local code scanning and coding-agent hook responses. Do not deploy these fixtures, connect production credentials, or assume a clean static scan proves application security.

## First run

Use the current trusted VibeSane feature checkout (Node.js >=24.15.0, Git and pnpm). Windows remains an unqualified candidate until Windows CI and real-host acceptance pass:

1. Follow the linked setup guide to build and locally install the beta package, configure the allowlist on the MCP process, and run both diagnostics.
2. Connect Codex or Claude Code using the documented absolute executable path. Confirm MCP `status` and all five discovered tools.
3. Install the applicable project hooks (`vibesane init-codex` for Codex; `vibesane init` for Claude Code). Review and trust hooks in the host before enabling completion enforcement.
4. Start in Monitor mode (default). Use a synthetic vulnerable fixture; confirm the MCP scan reports issues without modifying source.
5. Only after explicit opt-in, use config `--mode assist` or `--mode auto-fix --attempts 2`.
6. Run verification and distinguish no scanned files, incomplete coverage, and a complete scan with no findings.
7. Remove hooks/skills and uninstall the package using the commands in the setup guide when finished.

Use the unified CLI entry from the installed beta tarball, or from the checked-out scripts/vibesane.mjs. No hosted API or source-code upload is required by the local scanner.

## Demo fixtures

- demo/vulnerable contains fake, deliberately insecure JS/SQL examples and **no real secrets**.
- demo/secure contains synthetic environment-backed configuration and RLS-enabled SQL.
- Copy one variant into a *new disposable Git directory*. Run git init. Never copy the vulnerable demo into a production project.
- The demo is not intended to run as an application; it tests static detections only.

## Modes

Monitor = show findings, no automatic repair requests or completion blocking.
Assist = provide proposed minimal fixes and ask for developer approval.
Auto-fix = request a bounded coding-agent repair under the permissions the host already grants, with a maximum of two attempts by default. It does not silently apply patches.

## Privacy and feedback

Static source code stays local when using the scanner. It writes only limited local file/rule/session metadata, timestamps and fingerprints for the repair coordinator; optional feedback is manually supplied. No remote telemetry or invitations are enabled.

Please use PILOT_FEEDBACK.md if and when a consenting developer completes an approved pilot, and BUG_REPORT.md for reproducible issues. Uninstall first when discontinuing use.

The Codex CLI MCP and Stop-hook paths have synthetic real-client evidence on a historical Linux x64 candidate only. Claude Code, macOS and Windows live-host acceptance remain pending. External beta remains **blocked** until an independent security review, the supported-platform installation checks for the intended tester group, and explicit owner approval are complete.
