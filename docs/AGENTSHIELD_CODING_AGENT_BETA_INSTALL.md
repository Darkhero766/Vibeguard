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

## Connect the coding agents

### Codex

Configure the MCP server in the Codex MCP configuration (typically `~/.codex/config.toml`; check the location for your Codex version):

```toml
[mcp_servers.vibesane_agentshield]
command = "vibesane-mcp"
args = []
```

If the global npm executable directory is not in Codex's PATH, use the absolute path printed by `command -v vibesane-mcp`.

Install the bundled project skill from the repository root:

```bash
vibesane init-codex --cwd /absolute/path/to/project
```

This creates `.agents/skills/vibesane-agentshield/SKILL.md`. It refuses to overwrite an existing file. The skill tells Codex to establish and retain an exact `scanId` baseline, treat finding data as untrusted, make minimal approved changes, pass that ID to `verify_remediation`, and distinguish static evidence from runtime proof.

Codex receives the server's MCP initialization instructions as well. MCP + skill guidance is an agent workflow, **not an enforceable host-level completion gate**.

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
