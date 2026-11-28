# AgentShield coding-agent beta (0.7.0-beta.5)

## What this beta does

VibeSane AgentShield is a local security-feedback layer for AI coding agents. It combines a deterministic static scanner, a repository-read-only MCP server, host-specific lifecycle adapters, and a reusable Codex skill.

The intended loop is:

1. Establish a baseline scan of supported changed files.
2. Return bounded findings and rule-specific remediation guidance to the coding agent.
3. Let the coding agent propose or perform a minimal repair within the host's existing permissions.
4. Run a fresh post-edit scan.
5. Compare removed, remaining, and newly introduced findings.
6. Report clean, remaining, partial, or unknown outcomes without misrepresenting a partial scan as a pass.

**The MCP server never edits repository files, runs project scripts, commits, deploys, or calls a remote model.** It does update Foxy-managed local baseline and SQLite queue state. The coding agent applies repository changes using its own normal tools and permissions.

## Requirements

- Node.js 24.15.0 or newer (the MCP queue uses the built-in `node:sqlite` module)
- Git
- Windows and macOS are included in the automated Foxy qualification workflow. Linux is supported by the runtime design but is not covered by that two-platform qualification run.
- Automated CI does not equal live-host acceptance: each supported host/version combination still requires authenticated setup, restart, approval, tool-call and disconnect validation on a real machine.
- A local Git repository
- A trusted, MCP-capable coding-agent host

## Multi-process queue and recovery

The MCP queue is stored in a local SQLite database using WAL mode, full synchronous commits, and short `BEGIN IMMEDIATE` transactions. Each MCP process registers a worker lease and heartbeats; database transactions serialize idempotency, backpressure and global worker claims across processes. A running job is owned by exactly one worker. Cancellation is written to SQLite and observed by that owner. A worker that stops heartbeating has its running jobs marked `interrupted` with an UNKNOWN outcome; they are never automatically retried or described as clean. Queued jobs remain available to another live process. Completed records and remediation baselines are retained within the bounded history/TTL policy.

The SQLite database is local-machine state; do not put the job store on NFS, SMB, cloud-synced or other network filesystems. Processes on a different host are rejected. The default path includes the host namespace and a SHA-256 scope of the exact `VIBESANE_ALLOWED_ROOTS_JSON`. `VIBESANE_JOB_STORE_DIR`, when set, is a relocatable base directory and still receives those isolation suffixes; it does not make hosts share one DB. On Windows the canonical store path must remain below the current user profile so the database inherits that profile's ACL. POSIX directory/file mode checks are used only on POSIX platforms.

Beta.4 used one shared `~/.local/state/vibesane/agentshield/jobs.json` for every project. On beta.5 startup, Foxy reads that shared snapshot and migrates only jobs whose canonical workspace is inside the current MCP process's `VIBESANE_ALLOWED_ROOTS_JSON` allowlist. Records belonging to other repositories are never copied into this host/workspace database. The source snapshot is retained untouched as a recovery copy. Migration refuses to proceed while any legacy `jobs.lock` owner is still alive, and fails closed when a shared snapshot exists but the current process has no valid authorized roots. Stop every older Foxy MCP process before the first beta.5 start.

## Install the local beta

After receiving the maintainer-built tarball:

```bash
npm install --global ./vibesane-agentshield-0.7.0-beta.5.tgz
vibesane --help
vibesane doctor --cwd /absolute/path/to/project
```

The tarball is local and unpublished. The package script checks its file manifest and SHA-256 digest when it is built. This documentation does not imply that the archive has already been built or runtime-tested.

## Windows PowerShell install (candidate only)

Windows packaging and installer changes are being validated separately. **Do not use this path for production or unrestricted rollout until the Windows release workflow and real-host acceptance are green.** From a trusted checkout of the candidate branch, after that qualification passes:

```powershell
pnpm install --no-frozen-lockfile
pnpm --filter @workspace/api-server run build:agentshield
node .\artifacts\api-server\scripts\package-agentshield-beta.mjs

$installPrefix = Join-Path $env:LOCALAPPDATA 'VibeSane'
New-Item -ItemType Directory -Force -Path $installPrefix | Out-Null
$archive = (Resolve-Path '.\artifacts\api-server\dist\vibesane-agentshield-0.7.0-beta.5.tgz').Path
npm install --global --prefix $installPrefix --ignore-scripts $archive

$vibesane = Join-Path $installPrefix 'vibesane.cmd'
& $vibesane doctor --cwd (Get-Location).Path
& $vibesane connect --agent auto --cwd (Get-Location).Path
```

Restart the selected agent and approve the MCP server. To configure every included project-level format, use `connect --agent all`. To remove the exact managed entries later, run `disconnect --agent all`. If your npm global prefix or install path differs, use the actual `vibesane.cmd` path created by npm. These commands are documented as a candidate workflow, not proof of Windows support.
## Completion gate and host enforcement

The default `completionGate` is `advisory` for compatibility. To opt into commit-aware enforcement in a Claude Code project, install the hooks and configure a base reference that is present in the local clone:

```bash
vibesane init --cwd /absolute/path/to/project
git -C /absolute/path/to/project fetch origin main
vibesane config --mode assist --completion-gate enforce --base-ref origin/main --cwd /absolute/path/to/project
vibesane status --cwd /absolute/path/to/project
```

Use a locally available target/base branch (commonly `origin/main`), tag, or commit SHA that resolves to a commit **strictly behind and ancestral to the current `HEAD`**. A ref that resolves to `HEAD` itself, or to an unrelated/ahead commit, is rejected; this prevents a dirty-only scope from being mistaken for a complete topic-branch diff. Run the agent on a topic/feature branch ahead of that pinned base and refresh the configured remote-tracking ref before starting a new coding session. Shallow clones that do not contain the required ancestry must fetch the missing history or use a suitable available ref.

**Current file coverage:** the CLI currently selects JavaScript/TypeScript, Python, SQL, JSON, YAML and `.env` files. Markdown, Dockerfiles, arbitrary configuration formats, lockfiles not matching supported extensions, generated/binary files and other unsupported paths are not analyzed. Because enforcement is fail-closed, an unsupported changed path makes the final result UNKNOWN/blocking. This is intentional rather than treating an uninspected file as safe; teams that routinely modify docs or unsupported manifests need a separately reviewed policy or broader scanner coverage before enabling enforce mode for those changes. Enforced completion also fails closed when any changed path falls under the scanner's intentionally ignored directories (`node_modules`, `.next`, `dist`, `build`, `coverage`, or `vendor`), even if other supported files were scanned; ignored paths are not silently counted as reviewed.

With `baseRef` configured, the final gate scans the base-to-HEAD committed diff plus staged, modified, and untracked worktree changes. Renames are scanned at their destination path. Deleted, unsupported, unsafe, missing, or out-of-budget changed paths prevent a clean result. The base SHA and worktree content are fingerprinted before and after scanning, so moving the base ref or mutating files during the scan invalidates the result.

With enforcement enabled, Claude Code and Codex Stop adapters use their respective host response contracts to request continuation when coverage is incomplete, the base reference is unavailable, no changed paths exist to evidence a scan, previously flagged files are not covered, AgentShield is disabled, or findings at/above the configured blocking severity remain. **A configured target `baseRef` is mandatory for enforced completion**: if it is absent, the final gate fails closed even when dirty files exist, because a dirty-only scan cannot prove that earlier committed changes were covered. A first block/continuation gives the agent one opportunity to remediate; an exhausted remediation budget does not convert a blocker into a pass. When Claude Code or Codex re-enters Stop with `stop_hook_active: true` and the blocker or UNKNOWN condition remains, AgentShield returns `continue: false` with a visible stop reason instead of issuing another continuation. The user can then inspect the blocked status, remediate and start another turn. Codex's initial `decision: block` asks Codex to continue with the supplied reason as a new prompt; it does not undo completed tool calls. If a Stop hook cannot execute or parse its event, it emits a fail-closed response. Developers can still interrupt the host, disable/untrust hooks, or explicitly change local policy, so this remains a host-level control, not a tamper-proof boundary.

For a one-off CLI scan without persisting a policy, use `vibesane scan --changed --base-ref origin/main --cwd /absolute/path/to/project`.

**Host distinction:** Claude Code Stop and Codex Stop support an explicit first continuation/block response when their project hooks are installed, reviewed/trusted and `completionGate: enforce` is configured. If the host re-enters Stop with `stop_hook_active: true` and the condition is still unresolved, the hook ends that turn with `continue: false` and a visible stop reason to avoid a repeated continuation loop. Cursor's `followup_message` continues the agent loop within its configured `loop_limit`. These remain host-level controls, not tamper-proof prohibitions on a developer ending the session or changing local policy. Do not describe these integrations as security certification or an unbypassable delivery lock.

`monitor` reports findings only; `assist` asks the agent to propose a repair; `auto-fix` may request bounded repair under host permissions. `completionGate: enforce` is independent of repair mode and can block even when automatic repair is disabled.

## One-command MCP connection

From the root of the Git repository:

```bash
vibesane connect
```

The connector detects project markers and available CLIs for Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code and Copilot where the host environment exposes a supported marker. Copilot uses the shared workspace-root `.mcp.json` entry; this does not configure a global Copilot user file. It then writes the corresponding project-scoped MCP entries:

- Claude Code: `.mcp.json`
- Codex: `.codex/config.toml`
- Cursor: `.cursor/mcp.json`
- Gemini CLI: `.gemini/settings.json`
- Roo Code: `.roo/mcp.json`
- VS Code Copilot: the workspace-root `.mcp.json` entry is shared with Claude. In VS Code’s Copilot harness, the workspace-root destination is offered in guided setup when `chat.mcp.workspaceRootConfig.enabled` is enabled; an existing native workspace-root `.mcp.json` remains a valid source when that setting is off. The connector does not write Copilot’s global `$COPILOT_HOME/mcp-config.json` / `~/.copilot/mcp-config.json` file.

Useful variants:

```bash
vibesane connect --agent all
vibesane connect --agent claude
vibesane connect --agent codex
vibesane connect --agent cursor
vibesane connect --agent gemini
vibesane connect --agent roo
vibesane connect --agent copilot
vibesane connect --agent mcp
```

`auto` is the default and configures detected project hosts. VS Code Copilot is detected from the VS Code/Copilot host environment when that marker is available. `all` configures all five supported project-level host formats; VS Code Copilot shares the `.mcp.json` entry. `mcp` prints a generic stdio server object that can be copied into another MCP-compatible host. The connector resolves the Git root itself, writes an explicit `VIBESANE_ALLOWED_ROOTS_JSON` allowlist for that root, backs up existing config files, preserves unrelated settings, and refuses malformed, symlinked or conflicting configuration. It does not run project scripts, install hooks, change agent permissions, or connect to an account remotely. Restart the host and approve the local server when prompted.

The generic mode is for hosts that implement MCP stdio. It cannot automatically configure products that do not expose MCP or a documented extension/configuration API. MCP is a common tool transport, not a universal adapter for every proprietary agent. Lifecycle hooks remain host-specific and are installed separately only after review.

Disconnect the managed project integrations:

```bash
vibesane disconnect --agent all
```

This removes only exact, unchanged AgentShield entries from the supported host files. Existing unrelated MCP entries are preserved, and a backup is created before each modification. A host entry that has been customized is left untouched and reported as an error; review it manually before removal.

The generated project configuration includes absolute local executable/script paths. Treat it as machine-specific local configuration; do not commit it for teammates unless the installation layout and trust policy are intentionally shared. For Codex, project `.codex/config.toml` is loaded only after the repository is trusted.

Windows and macOS automated qualification is source-matched to the commit linked from the Foxy qualification PR. This is platform-runner evidence, not a claim that every installed Claude/Codex/Cursor/Gemini/Roo/Copilot release has passed live acceptance. Before any public distribution, run the real-host matrix on named app versions, record successful tool calls and disconnect behavior, and obtain an independent security review. Cursor enterprise MCP Network Controls may also require an administrator to allow the local command server in the applicable configuration.

## Connect the coding agents

### Codex

Register the project-scoped MCP server from the repository root:

```bash
vibesane connect --agent codex
```

This writes `.codex/config.toml` with the current Node executable, the packaged MCP entry point and an exact repository-root allowlist. Codex loads project-scoped config only after you trust the repository. If you configure Codex manually instead, include the `VIBESANE_ALLOWED_ROOTS_JSON` environment value; a server entry without that allowlist will deny workspace tools.

Install the bundled project skill and project Stop hook from the repository root:

```bash
vibesane init-codex --cwd /absolute/path/to/project
```

This creates `.agents/skills/vibesane-agentshield/SKILL.md` and adds a Stop command entry to `.codex/hooks.json`, preserving unrelated hook entries. Re-running is idempotent; it refuses to overwrite a customized skill or malformed hook config. Review and trust the project hook using `/hooks` before relying on it. Codex Stop then returns the official `decision: block` + `reason` response when the AgentShield policy blocks. Set `completionGate` to `enforce` and configure a local target base ref as described above.

Codex also receives the server's MCP initialization instructions. The Stop hook enforces completion; the MCP + skill workflow supplies structured findings and remediation verification. Remove the AgentShield hook and unchanged bundled skill with `vibesane uninstall-codex --cwd /absolute/path/to/project`; modified skills and unrelated hooks are left untouched.

### Claude Code

Register the project-scoped MCP server:

```bash
vibesane connect --agent claude
```

Install the Claude Code PostToolUse and Stop hooks in the project:

```bash
vibesane init --cwd /absolute/path/to/project
```

The hooks scan after supported file edits and at the end of an agent turn. The Stop integration can request a bounded continuation for unresolved blocking findings when the project is explicitly configured with `auto-fix`. Host approval prompts and permissions remain authoritative.

### Cursor

Register the project-scoped MCP server:

```bash
vibesane connect --agent cursor
```

For the Stop lifecycle feedback loop, merge the packaged `cursor-hooks.json` entry into the project's existing `.cursor/hooks.json` file. **Do not replace the file or remove other hooks.** The sample uses:

```json
{
  "version": 1,
  "hooks": {
    "stop": [
      {
        "command": "vibesane-cursor-stop",
        "timeout": 20,
        "loop_limit": 2
      }
    ]
  }
}
```

Use an absolute executable path if Cursor does not inherit the global npm executable directory. The adapter reads the project path supplied by Cursor's `CURSOR_PROJECT_DIR` hook environment variable and returns Cursor's `followup_message` response shape. The loop is capped by Cursor's loop limit and AgentShield's own retry state.

Cursor hook support can continue an agent turn; it does not create a tamper-proof security gate or guarantee that every action is intercepted.

## MCP workflow

The synchronous MCP surface exposes five tools. `status`, `list_findings`, and `explain_finding` are pure queries; `scan_changed` and `verify_remediation` update Foxy-managed in-memory baseline state and therefore are not annotated read-only. Complete scans return isolated scan IDs (30-minute expiry, 50 retained baselines) so parallel coding-agent runs cannot silently overwrite one another's baseline:

- `status`: checks whether the scanner is bundled and ready.
- `scan_changed`: fresh scan of supported changed files; returns a unique `scanId` for the complete baseline.
- `list_findings`: requires `scan_id` and returns that exact scan only when the content fingerprint is unchanged.
- `verify_remediation`: requires the baseline `baseline_id`; compares removed, remaining, and new findings, then returns a `currentScanId` for the next iteration.
- `explain_finding`: deterministic mitigation, avoid, verification, and human-review guidance for known rule IDs.

Recommended agent sequence:

```text
status
scan_changed(workspace = absolute repository root) -> store scanId
[agent reviews findings and makes an approved minimal fix]
verify_remediation(workspace = same root, baseline_id = scanId)
[use returned currentScanId for the next bounded remediation iteration]
```

Interpret results carefully:

| Result | Meaning |
|---|---|
| `rescan_clean` | No baseline findings remain in this complete static re-scan. Runtime behavior is not proven. |
| `findings_remain` | One or more baseline findings remain. |
| `new_findings_detected` | The rescan introduced or exposed new findings. |
| `partial_coverage` / `verification_incomplete` | Unsupported changed files or truncated results prevent a complete conclusion. |
| `scan_incomplete` / `unknown` | A safe scan result could not be established. |
| `no_baseline` / `no_changes_since_baseline` | There is no usable before/after comparison. |

Never interpret missing results, a timeout, malformed output, zero supported files, or a changed workspace during scanning as a clean pass.

## Coverage and limitations

The current scanner has its strongest coverage on JavaScript and TypeScript, selected Supabase/SQL rules, a SARIF 2.1.0 export for integration, and a new limited Python heuristic layer (subprocess shell injection, request-shaped pickle, unsafe YAML loading, disabled TLS verification, insecure temporary files, and request-shaped eval/exec). It also has selected pattern rules for Go, Ruby, PHP, Rust, and Java, plus JSON, YAML, and environment files. This is not complete language-aware SAST. The experimental AST/taint checks are opt-in and cover selected JavaScript/TypeScript patterns.

There is no complete compiler-aware SAST for any language in this beta. Python and the selected Go/Ruby/PHP/Rust/Java rules are limited regex heuristics, not AST or whole-program analysis. C#, C/C++, Kotlin, and Swift have no dedicated SAST coverage. The MCP bridge reports unsupported changed files as partial coverage rather than silently ignoring them.

Static heuristics can produce false positives and false negatives. A clean changed-file scan is not proof of exploitability, runtime behavior, dependency safety, full-application authorization, or production security. No security certification is provided.

## Safe beta validation

Use disposable repositories and synthetic examples only (dummy credentials, synthetic identities, and non-production databases). Validate:

1. MCP startup and `status` from each host.
2. A supported vulnerable fixture and a clean fixture.
3. Cache invalidation after changing an already-dirty file.
4. Unsupported-language changes produce partial coverage.
5. A remediation removes a baseline finding, leaves another, and introduces a new one.
6. A workspace mutation during scan fails closed.
7. Claude Code and Cursor lifecycle hooks respect the host's loop/approval controls.

Run the local MCP test suite from a trusted checkout:

```bash
pnpm --filter @workspace/api-server test:agentshield:mcp
```

No GitHub Actions validation is part of this process. Until the maintainer builds the tarball and executes the local tests and host-client acceptance checks, this is a prepared beta candidate, not a validated release.
