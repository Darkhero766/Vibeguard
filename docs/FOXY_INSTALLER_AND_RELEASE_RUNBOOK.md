# Foxy installer and release runbook

Status: implementation and release-operational guidance for the unpublished beta candidate. No package publication or deployment is performed by this document.

## User install experience

After owner-approved npm publication and website deployment, the supported bootstrap commands are:

### macOS / Linux

```bash
curl -fsSL https://vibesane.app/install.sh | bash
```

Choose one host explicitly:

```bash
curl -fsSL https://vibesane.app/install.sh | bash -s -- --agent codex
```

### Windows PowerShell

```powershell
$env:FOXY_INSTALL_AGENT='auto'; irm https://vibesane.app/install.ps1 | iex
```

Set `FOXY_INSTALL_AGENT` to `claude`, `codex`, `cursor`, `gemini`, `roo` or `copilot` to target one host.

Both bootstrap scripts:
- require Node.js 24.15.0 or newer, npm and Git;
- query `@vibesane/foxy@beta` from the explicit official npm registry (`https://registry.npmjs.org`);
- stop without installing when that exact package/tag is not available;
- install globally using npm with lifecycle scripts disabled;
- invoke `foxy install`, which previews workspace configuration and requires consent unless the user explicitly supplies `--yes`;
- do not send repository source, secrets or agent conversations to VibeSane Cloud.

The fixed npm-global executable path gives MCP host configs a stable server location and avoids tying them to a transient `npx` cache. The scripts are present in the VibeSane frontend's public asset tree, but their public URLs are not considered live until the website build containing these files is deployed.

## Foxy lifecycle commands

```text
foxy install --agent auto     Detect hosts and preview exact project MCP edits
foxy doctor                   Check local runtime and host configuration
foxy status                   Report local scan/gate status
foxy update                   Update a verified npm-global beta safely
foxy scan --changed           Scan supported changed files
foxy verify --changed         Verify the changed-file remediation state
foxy disconnect --agent all   Remove exact managed MCP entries from supported hosts
foxy uninstall                Remove exact workspace MCP entries plus matching
                              Claude Code and Codex hooks/skill
npm uninstall --global @vibesane/foxy
                              Separately remove the global CLI package
```

`foxy uninstall` intentionally preserves Foxy local scan data, baselines, SQLite queue state, per-user backups and the global npm package. It refuses to remove customized MCP entries or a modified Codex skill. Manually copied Cursor hooks are not silently removed by this command.

## Supported hosts

| Host | Workspace MCP config | Additional integration |
|---|---|---|
| Claude Code | `.mcp.json` | Optional project hooks, separately approved |
| Codex CLI | `.codex/config.toml` | Optional Stop hook and bundled skill |
| Cursor | `.cursor/mcp.json` | No implicit lifecycle hook installation |
| Gemini CLI | `.gemini/settings.json` | MCP registration |
| Roo Code | `.roo/mcp.json` | MCP registration |
| GitHub Copilot / VS Code | Workspace `.mcp.json` | VS Code may require `chat.mcp.workspaceRootConfig.enabled` |

The website offers host selection, but local detection is still authoritative. A website cannot modify the user's machine or grant host trust. After install, users restart the selected agent and approve the project server using that host's trust controls.

## Release gates before enabling the website install button

1. Resolve stacked PR #70 ancestry and keep the security branch independently reviewable.
2. Run current exact-source qualification on Windows, macOS and Ubuntu/Linux. Require all syntax/build, regression, STDIO MCP smoke, curated/holdout/adversarial benchmark, and offline npm package-install checks to pass.
3. Verify the release artifact's source SHA, package content hash, file list and package manifest match on all OSes.
4. Obtain another independent security review of the changed installer, Git config preflight, completion gate, queue, lifecycle and package contents.
5. Obtain live host acceptance for each advertised adapter on supported OSes, including MCP discovery, host trust, scan, status, disconnect, repeat install and uninstall.
6. Verify npm scope/package ownership and the intended package name. Do not assume `@vibesane` is publishable because the package builder creates a local archive.
7. Choose an actual open-source license with the repository owner/legal reviewer. The current generated package declares `UNLICENSED`; that is an intentional release blocker until resolved.
8. Configure npm Trusted Publishing for the exact GitHub owner/repository/workflow and protected environment. Do not create a long-lived npm token for CI.
9. Add required GitHub environment approval, version/tag policy, provenance verification, rollback and incident ownership.
10. Only then enable the website's `VITE_FOXY_BETA_INSTALL_ENABLED` flag in an owner-approved deployment.

## Npm trusted publisher setup (manual owner action)

In the npm package settings, configure the GitHub Actions trusted publisher for:
- package: `@vibesane/foxy`;
- GitHub owner: `Darkhero766`;
- repository: `Vibeguard`;
- exact publish workflow filename and protected GitHub environment.

The workflow must use GitHub-hosted runners and grant only `id-token: write` plus the read access needed for checkout. Use current, full-SHA-pinned GitHub Actions. npm trusted publishing uses short-lived OIDC credentials and can generate provenance for public packages. Provenance links the package to a source/build workflow; it is not a security certification.

No Trusted Publisher has been configured by this work, and no publish workflow has been run.

## VibeSane Cloud boundary

Foxy remains local-first and account-independent. Clerk is an optional VibeSane web identity provider through the current Supabase Auth session flow; Supabase remains the application UUID/session authority. A cloud feature must be independently authenticated, server-authorized and opt-in. Do not upload source, diffs, credentials, environment values, prompts or local database contents by default. Cloud scan reports require explicit consent, minimization, retention, deletion and tenant-isolation controls.

## Known non-release claims

- The completion gate is cooperative, not tamper-proof against the same OS user. Use required CI, protected branches and human review as authoritative external enforcement.
- Benchmark fixtures are controlled and synthetic; passing benchmarks do not establish real-world false-positive/false-negative rates.
- Automated CI does not replace live validation in each advertised AI host.
- This runbook does not configure Clerk/Supabase/Render production services, publish npm, deploy the website or merge either draft PR.
