# VibeSane Foxy 0.7.0-beta.6 — controlled release candidate

**Status: unpublished and not approved for external distribution.** The npm package `@vibesane/foxy` has not been published. Do not treat this document as a public install announcement.

Foxy is a local-first security scanner and MCP server for AI coding agents. It inspects supported repository files, returns actionable findings, and can verify remediation. The MCP surface does not modify repository files or execute project code. Scan, baseline, and queue operations may update Foxy-managed local state.
No remote telemetry is collected or transmitted by the local scanner. No source code is uploaded. Foxy writes only its own local queue/baseline state and configuration explicitly approved by the operator.

## Requirements and supported hosts

- Node.js **24.15.0 or newer** and Git.
- The packaged runtime is self-contained and has no runtime npm dependencies; package installation must disable lifecycle scripts.
- MCP STDIO clients: Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code, VS Code GitHub Copilot, and other compatible clients using MCP STDIO.
- CI qualification is exercised on Windows, macOS, and Ubuntu/Linux. Actual acceptance in each advertised coding-agent host remains a separate requirement.

## Build and install an unpublished local archive

From a trusted checkout of this branch:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build:agentshield
node artifacts/api-server/scripts/package-agentshield-beta.mjs
```

The builder prints the local archive path and SHA-256 evidence. For a POSIX local test install:

```sh
npm install --global --prefix "$HOME/.local" --ignore-scripts \
  "$PWD/artifacts/api-server/dist/vibesane-foxy-0.7.0-beta.6.tgz"
export PATH="$HOME/.local/bin:$PATH"
vibesane --help
vibesane mcp-doctor
```

On Windows, use the generated archive path with `npm install --global --ignore-scripts <archive-path>`, then open a new terminal so npm's global executable directory is on PATH. This is a local build/install workflow only; it does not publish or register the package.

## Connect an agent

Run `vibesane connect` from the intended project repository to detect compatible installed hosts and preview the exact project-scoped MCP configuration changes. Use `vibesane connect --agent all` only after reviewing the plan, or select a single host with `--agent claude`, `codex`, `cursor`, `gemini`, `roo`, or `copilot`. Use `--agent mcp` to print a generic MCP STDIO entry.

The MCP process must receive `VIBESANE_ALLOWED_ROOTS_JSON` as a JSON array of canonical repository roots that the tester explicitly authorizes. Example:

```json
["/absolute/path/to/disposable-repository"]
```

Missing or invalid allowlist configuration denies workspace tools. Restart the coding agent and explicitly approve the MCP server. Use a disposable test repository first. Do not authorize a repository unless the tester is entitled to inspect it.

For the full install, diagnostics, upgrade, rollback, host configuration and uninstall procedures, see [AGENTSHIELD_MCP_SETUP.md](../../../docs/AGENTSHIELD_MCP_SETUP.md). For Codex-in-Codespaces pilot details, see [FOXY_CODEX_CODESPACES_PILOT.md](../../../docs/FOXY_CODEX_CODESPACES_PILOT.md).

## What the beta includes

- Standalone CLI and local scanner with JSON and SARIF output.
- Read-only MCP tools for scanning, findings, rule explanations and remediation verification.
- Consent-first, project-scoped installer/connect/disconnect/uninstall flows with configuration backups and verification.
- Optional Claude Code and Codex completion hooks, plus Cursor Stop adapter. Host-level hooks are opt-in and governed by the user's host configuration.
- SQLite-backed asynchronous queue with idempotency, process leases, heartbeats, cancellation and crash recovery. State is scoped by host namespace and authorized-root fingerprint.
- Offline npm archive with package-root `LICENSE`, `NOTICE` and third-party license notices.

## Security and coverage limits

Foxy performs static heuristic analysis of supported changed files. It is **not** compiler-complete SAST, an exploit validator, a security certification, or proof that an application is secure. The current benchmark suites use synthetic, rule-targeted fixtures; their results must not be described as real-world precision/recall.

Unsupported, ignored, missing, timed-out, truncated, raced or failed scans are incomplete/unknown and must never be treated as clean. Supported changed-file types include JavaScript/TypeScript, Python, SQL, JSON, YAML and `.env`; unsupported changed paths are reported and completion enforcement fails closed.

The local completion gate is cooperative, not tamper-proof. A process running with the same OS-user permissions can change local configuration, disable hooks, bypass MCP calls or modify files directly. Enforce delivery independently using required CI checks, protected branches and human review. Host hooks can be disabled or bypassed by project/host policy.

The local scanner does not upload source code. It may write Foxy-managed local queue/baseline state and limited metadata needed for local verification. No shell, patch, commit or deployment tools are exposed through the MCP server.

## Queue migration

On first beta.5-or-later startup, an exact beta.4 `jobs.json` snapshot is migrated to SQLite only after the legacy lock is confirmed inactive. The original JSON file is retained untouched. Migration imports only records whose canonical workspace is inside the current MCP process's `VIBESANE_ALLOWED_ROOTS_JSON`; records for other repositories are not imported. A valid allowlist is required when legacy records exist.

The beta.5 migration guard prevents older beta.4 processes from acquiring the legacy lock after migration. Stop every beta.4 Foxy process before upgrading. If a stale lock is found, verify all old processes have stopped, inspect the lock and remove it manually before retrying. Downgrade to beta.4 after migration is unsupported. The default SQLite store is isolated by host namespace and allowlist scope. Keep it on a local filesystem, not a network or cloud-synchronized folder.

## Qualification and release gates

The last fully successful three-OS package qualification before the latest release-workflow hardening was source `f97f95a48ffbdd3ef61a3d7da8ef57caf36a4ad3` (477/477 regression tests on each OS). All 33 package file digests and the canonical content-manifest SHA-256 matched across Windows, macOS and Ubuntu/Linux: `39bb5a4893f49c2a035454bb9ac063eb09e41b5a05a826621558bd2280818b98`. The outer `.tgz` wrapper hash differed on Windows, while all extracted package file bytes and per-file hashes matched.

The current branch adds stricter manual OIDC publication and cross-platform evidence aggregation. Check the latest [Foxy qualification run](https://github.com/Darkhero766/Vibeguard/actions/workflows/agentshield-cross-platform.yml) for the exact candidate SHA before relying on test evidence. A green CI run makes the candidate eligible for independent human review; it does not approve a release.

Before any external beta or public launch, the owner must complete legal ownership/license signoff, verify npm organization and package ownership, configure the protected GitHub `npm-release` environment and npm Trusted Publishing, resolve the PR stack/merge state, finish independent security review, and perform actual Claude Code, Codex CLI and Cursor acceptance on the supported OSes. No launch, npm publication or production deployment is authorized by this document.

## Disposable demo fixtures

- `demo/vulnerable` contains deliberately insecure synthetic JS/SQL examples and no real credentials.
- `demo/secure` contains synthetic environment-backed configuration and RLS-enabled SQL.
- Copy a fixture into a new disposable Git repository. Never copy the vulnerable fixture into a production project.
