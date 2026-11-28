# Foxy universal installer — Codespaces pilot

**Feature branch:** `feat/agentshield-cross-platform-autoconnect`  
**Command under test:** `vibesane install`  
**Scope:** one disposable Git repository; project-scoped MCP registration only  
**Important:** this installer change is newer than the previously qualified beta.5 source SHA. Do not treat the beta.5 Windows/macOS qualification as qualification of this installer implementation.

## What the installer does

- Detects supported agents from the CLI environment and project markers.
- Resolves the selected project to its canonical Git root.
- Prints the exact host configuration files it intends to update.
- Requires an interactive confirmation, or explicit `--yes` for automation.
- Reuses the existing hardened connector for all writes.
- Reopens each managed entry and checks that it is now exactly configured.
- On a later failure, removes only entries newly created in this attempt; existing entries and migrations/backups are preserved.
- Does not install hooks or skills, enable completion enforcement, execute project code, or grant host trust.

## 1. Get the implementation branch

Do this in a Codespace and preserve any existing work:

```bash
git status --short
git fetch origin feat/agentshield-cross-platform-autoconnect
git worktree add --detach ../foxy-installer-pilot origin/feat/agentshield-cross-platform-autoconnect
cd ../foxy-installer-pilot
git rev-parse HEAD
```

Keep this source worktree separate from the disposable test repository.

## 2. Build and test the implementation

Use the repository's pinned toolchain (Node.js 24.15.0 or newer and pnpm 10.34.9):

```bash
node --version
corepack enable
corepack prepare pnpm@10.34.9 --activate
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build:agentshield
pnpm --filter @workspace/api-server run test:agentshield:connect
pnpm --filter @workspace/api-server run test:agentshield:package
```

The connector test command includes the new universal-installer unit tests. The package test builds the local unpublished archive, installs it into a temporary prefix and exercises the installed CLI with a synthetic repository (including consent denial, dry-run/no-write, install/verification, idempotent repeat and disconnect). Record the exact commit SHA, runtime versions and full test output.

For the full local release qualification (longer; still local and non-publishing), run:

```bash
pnpm --filter @workspace/api-server run test:agentshield:release-qualification
```

This includes the source syntax gate, regression suite, synthetic benchmarks and offline package smoke. It does not replace Windows/macOS/Linux CI coverage or live-host acceptance.

## 3. Create a disposable project

```bash
export FOXY_SOURCE="$PWD"
export FOXY_TEST_REPO="$HOME/foxy-installer-pilot-fixture"

test ! -e "$FOXY_TEST_REPO" || {
  echo "Fixture already exists; choose another empty path."
  exit 1
}
mkdir -p "$FOXY_TEST_REPO"
git -C "$FOXY_TEST_REPO" init -q
git -C "$FOXY_TEST_REPO" config user.name "Foxy Installer Pilot"
git -C "$FOXY_TEST_REPO" config user.email "foxy-installer@example.invalid"
```

Do not use a production or customer repository.

## 4. Preview, then install

Preview is non-mutating:

```bash
node "$FOXY_SOURCE/artifacts/api-server/scripts/vibesane.mjs" install --dry-run --agent auto --cwd "$FOXY_TEST_REPO"
```

Review the detected agents and exact target paths. Then install interactively:

```bash
node "$FOXY_SOURCE/artifacts/api-server/scripts/vibesane.mjs" install --agent auto --cwd "$FOXY_TEST_REPO"
```

Type `y` only after the plan matches your expectations. To select one host explicitly, replace `auto` with `codex`, `claude`, `cursor`, `gemini`, `roo`, or `copilot`. `--agent all` configures all six adapters regardless of detection; use it only when you intentionally want every supported config target written.

For a non-interactive run, `--yes` is explicit consent and should be used only after the same plan has been reviewed:

```bash
node "$FOXY_SOURCE/artifacts/api-server/scripts/vibesane.mjs" install --agent codex --cwd "$FOXY_TEST_REPO" --yes
```

The installer writes MCP configuration only. Lifecycle hooks and skills remain separate opt-in commands.

## 5. Verify in the actual host

Restart Codex from the disposable repository and inspect:

- `codex mcp list`
- `/mcp` inside Codex: Foxy should expose the expected 10 MCP tools.
- Call `status`; confirm the MCP process reports the authorized workspace.
- Start a changed-scope scan against a harmless synthetic fixture.
- Confirm an unauthorized sibling repository is denied.
- Do not enable completion enforcement for this first pilot.

MCP configuration being present is not proof that the host trusted or loaded it. Record the host's actual tool-discovery and call results separately.

## 6. Uninstall only Foxy's managed MCP entry

Exit Codex first:

```bash
node "$FOXY_SOURCE/artifacts/api-server/scripts/vibesane.mjs" disconnect --agent codex --cwd "$FOXY_TEST_REPO"
```

Then verify unrelated files/settings remain. Preserve test output and screenshots before deleting the disposable fixture or worktree.

## Evidence to return

- Feature-branch commit SHA and `git status --short`.
- Node, pnpm, OS/container and Codex versions.
- Test command exit code and summary.
- Installer dry-run plan and install result.
- `codex mcp list` and `/mcp` tool catalogue.
- MCP `status`, changed scan and unauthorized sibling denial.
- Disconnect result and proof unrelated configuration was preserved.
- Any errors verbatim, with secrets and personal paths redacted.

## Safety and interpretation

This is an acceptance pilot, not production installation. The feature branch is not a published package; do not run `npx @vibesane/foxy install`. The beta package remains unpublished. No production configuration, package registry, deployment or merge is part of this procedure.
