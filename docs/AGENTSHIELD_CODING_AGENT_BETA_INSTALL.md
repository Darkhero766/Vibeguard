# AgentShield coding-agent beta (0.7.0-beta.3)

## What this beta does

VibeSane AgentShield is a local security-feedback layer for AI coding agents. It combines a deterministic static scanner, a read-only MCP server, host-specific lifecycle adapters, and a reusable Codex skill.

The intended loop is:

1. Establish a baseline scan of supported changed files.
2. Return bounded findings and rule-specific remediation guidance to the coding agent.
3. Let the coding agent propose or perform a minimal repair within the host's existing permissions.
4. Run a fresh post-edit scan.
5. Compare removed, remaining, and newly introduced findings.
6. Report clean, remaining, partial, or unknown outcomes without misrepresenting a partial scan as a pass.

**The MCP server itself is read-only. It never edits code, runs project scripts, commits, deploys, or calls a remote model.** The coding agent applies changes using its own normal tools and permissions.

## Requirements

- Node.js 20 or newer
- Git
- macOS or Linux for this beta; Windows is not supported yet
- A local Git repository
- A trusted, MCP-capable coding-agent host

## Install the local beta

After receiving the maintainer-built tarball:

```bash
npm install --global ./vibesane-agentshield-0.7.0-beta.3.tgz
vibesane --help
vibesane doctor --cwd /absolute/path/to/project
```

The tarball is local and unpublished. The package script checks its file manifest and SHA-256 digest when it is built. This documentation does not imply that the archive has already been built or runtime-tested.

## Completion gate and host enforcement

The default `completionGate` is `advisory` for compatibility. To opt into commit-aware enforcement in a Claude Code project, install the hooks and configure a base reference that is present in the local clone:

```bash
vibesane init --cwd /absolute/path/to/project
git -C /absolute/path/to/project fetch origin main
vibesane config --mode assist --completion-gate enforce --base-ref origin/main --cwd /absolute/path/to/project
vibesane status --cwd /absolute/path/to/project
```

Use a locally available target/base branch (commonly `origin/main`), tag, or commit SHA that is **not the coding branch itself**. Run the agent on a topic/feature branch that is ahead of that pinned base; otherwise committed changes on the base branch are not in the base-to-HEAD diff and an empty scope will block as UNKNOWN. Refresh the configured remote-tracking ref before starting a new coding session. If the ref cannot be resolved or has no common merge base with HEAD, the scan fails closed. Shallow clones that do not contain the required base history must fetch the missing history or use a suitable available ref.

**Current file coverage:** the CLI currently selects JavaScript/TypeScript, Python, SQL, JSON, YAML and `.env` files. Markdown, Dockerfiles, arbitrary configuration formats, lockfiles not matching supported extensions, generated/binary files and other unsupported paths are not analyzed. Because enforcement is fail-closed, an unsupported changed path makes the final result UNKNOWN/blocking. This is intentional rather than treating an uninspected file as safe; teams that routinely modify docs or unsupported manifests need a separately reviewed policy or broader scanner coverage before enabling enforce mode for those changes. Enforced completion also fails closed when any changed path falls under the scanner's intentionally ignored directories (`node_modules`, `.next`, `dist`, `build`, `coverage`, or `vendor`), even if other supported files were scanned; ignored paths are not silently counted as reviewed.

With `baseRef` configured, the final gate scans the base-to-HEAD committed diff plus staged, modified, and untracked worktree changes. Renames are scanned at their destination path. Deleted, unsupported, unsafe, missing, or out-of-budget changed paths prevent a clean result. The base SHA and worktree content are fingerprinted before and after scanning, so moving the base ref or mutating files during the scan invalidates the result.

With enforcement enabled, Claude Code and Codex Stop adapters use their respective host response contracts to request continuation when coverage is incomplete, the base reference is unavailable, no changed paths exist to evidence a scan, previously flagged files are not covered, AgentShield is disabled, or findings at/above the configured blocking severity remain. **A configured target `baseRef` is mandatory for enforced completion**: if it is absent, the final gate fails closed even when dirty files exist, because a dirty-only scan cannot prove that earlier committed changes were covered. The block/continuation persists until a complete scan has no blockers; an exhausted remediation budget does not convert a blocker into a pass. Codex's `decision: block` asks Codex to continue with the supplied reason as a new prompt; it does not undo completed tool calls or create an irreversible delivery lock. If a Stop hook cannot execute or parse its event, it emits a fail-closed response. Developers can still interrupt the host, disable/untrust hooks, or explicitly change local policy, so this remains a host-level control, not a tamper-proof boundary.

For a one-off CLI scan without persisting a policy, use `vibesane scan --changed --base-ref origin/main --cwd /absolute/path/to/project`.

**Host distinction:** Claude Code Stop and Codex Stop support explicit continuation/block responses when their project hooks are installed, reviewed/trusted and `completionGate: enforce` is configured. Codex's `decision: block` creates another continuation prompt; Cursor's `followup_message` also continues the agent loop. Neither is a tamper-proof prohibition on a developer ending the session or changing local policy. Do not describe these integrations as security certification or an unbypassable delivery lock.

`monitor` reports findings only; `assist` asks the agent to propose a repair; `auto-fix` may request bounded repair under host permissions. `completionGate: enforce` is independent of repair mode and can block even when automatic repair is disabled.

## Connect the coding agents

### Codex

Configure the MCP server in the Codex MCP configuration (typically `~/.codex/config.toml`; check the location for your Codex version):

```toml
[mcp_servers.vibesane_agentshield]
command = "vibesane-mcp"
args = []
```

If the global npm executable directory is not in Codex's PATH, use the absolute path printed by `command -v vibesane-mcp`.

Install the bundled project skill and project Stop hook from the repository root:

```bash
vibesane init-codex --cwd /absolute/path/to/project
```

This creates `.agents/skills/vibesane-agentshield/SKILL.md` and adds a Stop command entry to `.codex/hooks.json`, preserving unrelated hook entries. Re-running is idempotent; it refuses to overwrite a customized skill or malformed hook config. Review and trust the project hook using `/hooks` before relying on it. Codex Stop then returns the official `decision: block` + `reason` response when the AgentShield policy blocks. Set `completionGate` to `enforce` and configure a local target base ref as described above.

Codex also receives the server's MCP initialization instructions. The Stop hook enforces completion; the MCP + skill workflow supplies structured findings and remediation verification. Remove the AgentShield hook and unchanged bundled skill with `vibesane uninstall-codex --cwd /absolute/path/to/project`; modified skills and unrelated hooks are left untouched.

### Claude Code

Register the MCP server:

```bash
claude mcp add vibesane-agentshield -- vibesane-mcp
```

Install the Claude Code PostToolUse and Stop hooks in the project:

```bash
vibesane init --cwd /absolute/path/to/project
```

The hooks scan after supported file edits and at the end of an agent turn. The Stop integration can request a bounded continuation for unresolved blocking findings when the project is explicitly configured with `auto-fix`. Host approval prompts and permissions remain authoritative.

### Cursor

Register the MCP server as an stdio server using `vibesane-mcp` and no arguments.

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

The server exposes five read-only tools. Complete scans return isolated scan IDs (30-minute expiry, 50 retained baselines) so parallel coding-agent runs cannot silently overwrite one another's baseline:

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
