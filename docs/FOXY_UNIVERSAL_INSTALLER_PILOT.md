# Foxy universal installer — Codespaces pilot

**Feature branch:** `feat/agentshield-cross-platform-autoconnect`  
**Local candidate:** `@vibesane/foxy@0.7.0-beta.6`  
**Command under test:** installed `foxy install` executable  
**Scope:** one disposable Git repository; project-scoped MCP registration only  
**Exact-source qualification:** commit `948a2106a41b8656f46223d20b848dc0bac6c9fd` passed [Foxy qualification workflow #46130854336](https://github.com/Darkhero766/Vibeguard/actions/runs/46130854336) on Windows, macOS and Ubuntu/Linux: 472/472 regression tests and 24/24 installer/connect tests per OS, all source/build gates, MCP STDIO, three synthetic benchmark suites, and offline package/CLI/MCP smoke. All three reports have zero qualification failures and the same 30-file content SHA-256: `278096f6d0c27c6ec248ab672199d64849fd8e321d55215909a3b6adb2394ecf`. This is automated qualification for independent human review, not live-host acceptance or a security certification. The candidate remains unpublished; npm scope ownership/availability is not verified. Do not use a public `npx` command.

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
pnpm --filter @workspace/api-server run test:agentshield:release-qualification
```

The package smoke installs the local archive into an isolated npm prefix and exercises the package metadata, `foxy` executable shim, installer dry-run/no-write, consent denial, install/verification, repeat/idempotency, disconnect and MCP smoke. It does not contact or publish to the npm registry. Record the exact commit SHA, runtime versions and full test output. The current CI qualification has passed all three OSes; live-host acceptance and independent human review remain separate release gates.

For the interactive Codespaces pilot, create a fresh local archive after the smoke test (the smoke test deletes its temporary archive):

```bash
node artifacts/api-server/scripts/package-agentshield-beta.mjs
```

The packer reports the exact archive path, version and SHA-256 in JSON. Expected candidate filename: `artifacts/api-server/dist/vibesane-foxy-0.7.0-beta.6.tgz`. Confirm that the file exists and that the JSON reports `published: false` before proceeding.

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

Install the locally packed candidate into an isolated prefix (do not install globally into the Codespace account):

```bash
export FOXY_ARCHIVE="$FOXY_SOURCE/artifacts/api-server/dist/vibesane-foxy-0.7.0-beta.6.tgz"
export FOXY_PREFIX="$HOME/.local/foxy-beta6"
test -f "$FOXY_ARCHIVE"
npm install --global --ignore-scripts --offline --prefix "$FOXY_PREFIX" "$FOXY_ARCHIVE"
export PATH="$FOXY_PREFIX/bin:$PATH"
foxy --help
```

Preview the selected Codex configuration without writing:

```bash
foxy install --dry-run --agent codex --cwd "$FOXY_TEST_REPO"
```

Review the canonical repository and exact `.codex/config.toml` target. Then install interactively:

```bash
foxy install --agent codex --cwd "$FOXY_TEST_REPO"
```

Type `y` only after the plan matches your expectations. To select another host explicitly, use `claude`, `cursor`, `gemini`, `roo`, or `copilot`. `--agent auto` detects installed supported hosts; `--agent all` configures every adapter and should only be used intentionally.

For non-interactive automation, `--yes` is explicit consent and should be used only after reviewing the plan. The installer writes MCP configuration only. Lifecycle hooks and skills remain separate opt-in commands.

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
foxy disconnect --agent codex --cwd "$FOXY_TEST_REPO"
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

This is an acceptance pilot, not production installation. The feature branch is not a published package; do not run `npx @vibesane/foxy install` or `npx @vibesane/foxy@beta install`. The beta package remains unpublished. No production configuration, package registry, deployment or merge is part of this procedure.
