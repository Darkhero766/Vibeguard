# Foxy beta.6 — Codex CLI pilot in GitHub Codespaces

**Exact code candidate:** `3ec649c01506ae077639595794fd0b0cc445db04`  
**Package version:** `@vibesane/foxy@0.7.0-beta.6` (unpublished local archive)  
**Qualification:** [Windows + macOS + Ubuntu/Linux exact-source run #46137576745](https://github.com/Darkhero766/Vibeguard/actions/runs/46137576745) — 472/472 regression tests per OS  
**Package manifest:** 30 files; shared SHA-256 `f60677328e0c5eb2de94ec4ae44598e973c198e62f15ad4156b061bd6ed42c14`  
**Purpose:** one controlled Codex CLI acceptance session in a Codespace, using the universal installer from the exact qualified source and a disposable synthetic Git repository.

This guide covers real Codex host acceptance for Beta.6. First use [FOXY_UNIVERSAL_INSTALLER_PILOT.md](FOXY_UNIVERSAL_INSTALLER_PILOT.md) to build the local package archive, install it into an isolated npm prefix and register project-scoped MCP with `foxy install --agent codex`. This guide then tests the separate opt-in Codex Stop hook/skill. It does not use the unpublished registry command or install Foxy globally. It requires no Supabase, Render, production or customer credentials.

## Preconditions

- You are in the VibeSane Codespace and have access to the GitHub repository.
- Use a shell with `git`, `nvm`, `codex`, and network access to fetch dependencies.
- The candidate requires Node.js 24.15.0 or newer because the queue uses the built-in `node:sqlite` API. The exact qualification ran on 24.15.0. For the Codespaces pilot, use the patched Node 24 LTS release available on 28 Nov 2026 (24.22.3) rather than an old pre-installed Node. Verify the version before building.
- Use a disposable repository under your Codespaces home directory. Do not point the allowlist at the whole VibeSane source tree or your home directory.

Official references: [Codex CLI MCP configuration](https://learn.chatgpt.com/docs/cli/reference) · [Codex hooks and trust](https://learn.chatgpt.com/docs/hooks) · [Node.js 24 release documentation](https://nodejs.org/en/about/previous-releases).

## 1. Create a separate worktree at the exact candidate

This leaves your current checkout and any uncommitted work untouched.

```bash
git status --short
git fetch origin feat/agentshield-cross-platform-autoconnect
git worktree add --detach ../foxy-codex-pilot-source 3ec649c01506ae077639595794fd0b0cc445db04
cd ../foxy-codex-pilot-source
git rev-parse HEAD
```

The final command must print exactly:

```text
3ec649c01506ae077639595794fd0b0cc445db04
```

Stop if the SHA differs. Do not use `git reset --hard`, force-push, merge or switch your current working branch for this pilot.

## 2. Select Node.js and the pinned pnpm version

```bash
nvm install 24.22.3
nvm use 24.22.3
node --version
node -e "import('node:sqlite').then(() => console.log('node:sqlite available'))"
corepack enable
corepack prepare pnpm@10.34.9 --activate
pnpm --version
```

Expected: Node `v24.22.3`, `node:sqlite available`, and pnpm `10.34.9`.

## 3. Install dependencies, build Foxy and run local preflight tests

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build:agentshield
pnpm --filter @workspace/api-server run test:agentshield:connect
pnpm --filter @workspace/api-server run validate:agentshield:mcp
```

The last command rebuilds the scanner and runs MCP, queue and STDIO smoke tests. Keep the complete terminal output and exit codes. The GitHub qualification run already performed the full release suite on Windows/macOS; these local commands are a Codespaces environment preflight and must be reported separately.

## 4. Create a disposable synthetic repository

Keep the source worktree and the test repository separate. Run this from the candidate source worktree:

```bash
export FOXY_CHECKOUT="$PWD"
export FOXY_TEST_REPO="$HOME/foxy-codex-pilot-fixture"

test ! -e "$FOXY_TEST_REPO" || {
  echo "Fixture path already exists. Choose a new empty path; do not overwrite it."
  exit 1
}
mkdir -p "$FOXY_TEST_REPO/src"
git -C "$FOXY_TEST_REPO" init -q
git -C "$FOXY_TEST_REPO" config user.name "Foxy Pilot"
git -C "$FOXY_TEST_REPO" config user.email "foxy-pilot@example.invalid"

cat > "$FOXY_TEST_REPO/src/auth.ts" <<'EOF'
// Synthetic detector fixture only. This value is not a usable credential.
const JWT_SECRET = "ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
export function tokenConfig() {
  return JWT_SECRET;
}
EOF

git -C "$FOXY_TEST_REPO" status --short
```

The untracked TypeScript file is intentionally in changed-file scope and contains only a fake test string. Do not copy actual source secrets, API keys, tokens or customer code into this fixture.

## 5. Register MCP through the universal installer, then opt in to the separate Codex hook/skill

```bash
foxy install --agent codex --cwd "$FOXY_TEST_REPO"
node "$FOXY_CHECKOUT/artifacts/api-server/scripts/vibesane.mjs" init-codex --cwd "$FOXY_TEST_REPO"
node "$FOXY_CHECKOUT/artifacts/api-server/scripts/vibesane.mjs" doctor --cwd "$FOXY_TEST_REPO"

FOXY_ROOTS="$(node -e 'process.stdout.write(JSON.stringify([process.argv[1]]))' "$FOXY_TEST_REPO")"
VIBESANE_ALLOWED_ROOTS_JSON="$FOXY_ROOTS" \
  node "$FOXY_CHECKOUT/artifacts/api-server/scripts/vibesane.mjs" mcp-doctor
```

Expected results:
- `foxy install` reports that the Codex MCP entry is configured (or already configured after an intentional repeat).
- `init-codex` returns `installed`.
- `doctor` returns `ready`, with the built scanner, Codex MCP and Codex Stop-hook checks true.
- `mcp-doctor` returns `ready` and reports one configured root without printing it.

The MCP config is written only by the universal installer to `$FOXY_TEST_REPO/.codex/config.toml`; the optional hook is written only to `$FOXY_TEST_REPO/.codex/hooks.json`; the skill is written only to `$FOXY_TEST_REPO/.agents/skills/vibesane-agentshield/SKILL.md`. The generated MCP server uses an absolute Node executable and absolute candidate server path, and the environment allowlist contains only the fixture repository.

Review the generated files before launching Codex:

```bash
sed -n '1,120p' "$FOXY_TEST_REPO/.codex/config.toml"
sed -n '1,220p' "$FOXY_TEST_REPO/.codex/hooks.json"
```

Do not broaden `VIBESANE_ALLOWED_ROOTS_JSON`. Do not hand-edit other Codex/global settings for this test.

## 6. Start Codex from the disposable repository

```bash
cd "$FOXY_TEST_REPO"
codex mcp list
codex
```

Inside Codex:

1. Open `/mcp`. Confirm the project MCP server `vibesane_agentshield` is loaded and the ten tools appear.
2. Open `/hooks`. Review the project Stop hook and trust the exact hook if you intend to test lifecycle behavior. Do not bypass trust.
3. Keep the policy in its default monitor/advisory mode. Do not set `completionGate = enforce` for the first pilot.
4. Ask Codex to call `status`. Confirm the workspace authorization is configured and scanner readiness is true.
5. Ask Codex to call `scan_start` with `scope: "changed"` for the fixture path and a fresh unique `idempotency_key`.
6. Poll with `scan_wait` while the job is queued/running. Call `scan_results` after completion. Confirm the output includes the synthetic `hardcoded_jwt_secret` finding and a `scan_id`.
7. Optionally ask Codex to replace the synthetic hard-coded value with `process.env.JWT_SECRET` in `src/auth.ts`, without running any project scripts. Then call `verify_remediation` using the exact `scan_id` returned by `scan_results`. Confirm the rescan reports the change. This is static-rescan evidence, not runtime security proof.
8. Ask Codex to call `scan_start` against an unrelated sibling repository that is outside the allowlist. Confirm it is denied. Do not expect the MCP caller to expand authorization by supplying another workspace path.

The ten tools are `status`, `scan_changed`, `list_findings`, `verify_remediation`, `explain_finding`, `scan_start`, `scan_status`, `scan_wait`, `scan_results`, and `scan_cancel`. The asynchronous queue writes Foxy-owned local SQLite state only; the server does not modify the repository or execute project scripts.

## 7. Capture acceptance evidence

Record:
- Codespaces OS/container image and date.
- `node --version`, `pnpm --version`, and `codex --version`.
- Candidate SHA from `git rev-parse HEAD`.
- `doctor` and `mcp-doctor` JSON.
- `codex mcp list` result and redacted `/mcp` tool discovery.
- `/hooks` trust/review result.
- `status`, `scan_start`, `scan_wait`, `scan_results`, and remediation verification results.
- Unauthorized-root rejection result.
- Any errors, including exact exit codes. Redact home directory/user names from public logs if needed, but do not omit failure details.

Do not claim Codex host acceptance until a real Codex process has loaded the config, discovered the tools, and completed the described calls.

## 8. Uninstall the test configuration

Exit Codex first, then run:

```bash
node "$FOXY_CHECKOUT/artifacts/api-server/scripts/vibesane.mjs" uninstall-codex --cwd "$FOXY_TEST_REPO"
foxy disconnect --agent codex --cwd "$FOXY_TEST_REPO"
```

Review the fixture's `.codex` and `.agents` directories before deleting the test repository. Do not remove the source worktree until you have saved the evidence. When you are finished and the worktree is clean, you may remove only the separate pilot worktree using:

```bash
cd "$FOXY_CHECKOUT"
git worktree remove ../foxy-codex-pilot-source
```

If the source worktree has modifications, Git will refuse removal; preserve and inspect them rather than forcing removal.

## Troubleshooting

- **Codex does not show the MCP server:** confirm you launched Codex from the fixture root, trust the project config when prompted, inspect `codex mcp list`, then restart Codex.
- **Server startup fails:** check Node path in `.codex/config.toml`, verify the server path exists under `$FOXY_CHECKOUT`, rerun build and `mcp-doctor`.
- **Workspace denied:** the fixture path must exactly match the generated allowlist; do not switch to a broader path.
- **No finding:** confirm the synthetic file is still present and untracked/modified, has a supported `.ts` extension, and inspect whether the scanner build succeeded.
- **Hook does not execute:** open `/hooks`, review/trust the current hash, restart Codex and check that the project is trusted. MCP registration and Stop-hook setup are separate capabilities.

## Limits

The source SHA is qualified on Windows, macOS and Ubuntu/Linux in CI, not on the Codespaces image. This pilot is the first real Codex host session for this exact candidate in the owner’s environment. A successful pilot does not complete Claude/Cursor/Gemini/Roo/Copilot acceptance or independent security review. Do not deploy, publish, merge or use production repositories as part of this test.
