# AgentShield private-beta pilot kit

**Status:** reviewer/pilot materials prepared; no external beta approval or public release. The current exact-source CI candidate is `f8d2bafbeaac4811f740cc1bbf089385f6e8d0e5`.

## Install and connect the coding agent

For the current Codex-in-Codespaces pilot use [`docs/FOXY_CODEX_CODESPACES_PILOT.md`](../../../docs/FOXY_CODEX_CODESPACES_PILOT.md). For independent security review use [`docs/FOXY_CLAUDE_INDEPENDENT_REVIEW_BRIEF.md`](../../../docs/FOXY_CLAUDE_INDEPENDENT_REVIEW_BRIEF.md). General MCP setup remains in [`docs/AGENTSHIELD_MCP_SETUP.md`](../../../docs/AGENTSHIELD_MCP_SETUP.md). It builds and installs the unpublished local package, configures the required `VIBESANE_ALLOWED_ROOTS_JSON` allowlist, verifies diagnostics and tool discovery, installs hooks, and documents upgrade, rollback, and uninstall.

Short form from the trusted repository root (Node.js 24.15+, Git, pnpm; exact-source beta.5 Windows/macOS CI passed on `a777754de234ed2e469cd9822ad4a1f5f881e095`; live-host acceptance and independent review remain open):

```sh
pnpm --filter @workspace/api-server run build:agentshield
node artifacts/api-server/scripts/package-agentshield-beta.mjs
npm install --global --prefix "$HOME/.local" --ignore-scripts \
  "$PWD/artifacts/api-server/dist/vibesane-agentshield-0.7.0-beta.5.tgz"
VIBESANE_ALLOWED_ROOTS_JSON='["/absolute/path/to/disposable-repo"]' \
  "$HOME/.local/bin/vibesane" mcp-doctor
```

Run `vibesane connect` from the project root to register MCP for detected Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code and GitHub Copilot targets. Use `vibesane connect --agent all` to configure all six targets (Claude Code and Copilot share the workspace `.mcp.json` entry), or `vibesane connect --agent mcp` for a generic STDIO entry. The command preserves unrelated settings, backs up existing configuration and authorizes only the current repository. Restart the agent and approve the MCP server. It does not install lifecycle hooks. The MCP server must receive the same allowlist through the host's MCP `env` field. Never broaden it beyond repositories the tester authorizes for scanning. Use the documented host-specific configuration and the disposable fixture before any intended beta repository.

This is a disposable, synthetic demonstration of local code scanning and coding-agent hook responses. Do not deploy these fixtures, connect production credentials, or assume a clean static scan proves application security.


## Beta.4 queue upgrade

Beta.4 stored all local job history in one shared `~/.local/state/vibesane/agentshield/jobs.json`. Beta.5 creates a separate SQLite database per MCP host namespace and authorized-root scope. On first startup it reads the beta.4 snapshot and imports only jobs whose canonical workspace is inside that process's `VIBESANE_ALLOWED_ROOTS_JSON`; data belonging to other repositories is never copied into this store. The source JSON is retained untouched. Migration refuses to proceed while an older beta.4 process holds `jobs.lock`, and it fails closed if legacy jobs exist but the current server has no valid allowlist. If no old lock exists, beta.5 atomically publishes and retains `FOXY_BETA5_MIGRATION_GUARD_V1` at that lock path as a downgrade barrier. Pre-existing stale locks also block migration and are preserved unchanged; verify all beta.4 processes are stopped, inspect/remove the stale lock manually, then retry. Stop all beta.4 Foxy processes before the first beta.5 launch; downgrade to beta.4 after migration is unsupported.

The default SQLite path is isolated by host namespace and a SHA-256 scope of `VIBESANE_ALLOWED_ROOTS_JSON`. `VIBESANE_JOB_STORE_DIR` relocates the base directory only; the namespace/root suffix is still appended. On Windows the resolved path must remain below the current user profile so it inherits profile ACLs.

## First run

Exact-source beta.5 qualification passed on Windows and macOS in [Actions run #46114784990](https://github.com/Darkhero766/Vibeguard/actions/runs/46114784990) at `${candidate}`: 462/462 regression tests on each OS, MCP STDIO integration, accuracy benchmarks, offline package installation and package content-manifest verification all passed. The 29-file package manifest SHA-256 is identical on both platforms (`b4ab8da681923e558184b3f156c05a29d6057cc03125d7d91803323ec5793cdd`); the outer tarball checksums/bytes differ by OS archive representation, while all packaged file contents and per-file hashes match. This does not replace actual coding-agent host acceptance or independent security review. Do not distribute the current candidate until those gates and owner approval are complete.

Use the current trusted VibeSane feature checkout (Node.js >=24.15.0, Git and pnpm). The beta.5 SQLite queue has passed exact-source Windows/macOS CI, but real-host acceptance for Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code and GitHub Copilot remains open:

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

The Codex CLI MCP and Stop-hook paths still require live acceptance on this exact candidate and on the intended Codespaces host. The exact-source Windows/macOS CI run is not a real host session. Claude Code, macOS and Windows installed-host acceptance remain pending. External beta remains **blocked** until an independent security review, the supported-platform installation checks for the intended tester group, and explicit owner approval are complete.
