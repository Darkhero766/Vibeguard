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
7. Verify the implemented Apache-2.0 scope, Md Faizal attribution, rights/assignment position and bundled third-party notices against the exact archive. The package license is scoped to Foxy only; it does not license the rest of the monorepo or hosted VibeSane platform.
8. Configure npm Trusted Publishing for the exact GitHub owner/repository/workflow and protected environment. Do not create a long-lived npm token for CI.
9. Add required GitHub environment approval, version/tag policy, provenance verification, rollback and incident ownership.
10. Only then enable the website's `VITE_FOXY_BETA_INSTALL_ENABLED` flag in an owner-approved deployment.

## Licensing and contribution intake

The generated Foxy npm package now declares `Apache-2.0` and contains `LICENSE`, `NOTICE` and generated `THIRD_PARTY_NOTICES.txt`. The license is deliberately scoped to the distributable package; the repository root has no blanket Apache license. Read `docs/FOXY_LICENSE_AND_OWNERSHIP.md` before adding files to the package allowlist. Foxy contributions use DCO sign-off (`git commit -s`); no CLA is required for the current single-license model. DCO enforcement still requires maintainer review and is not enabled as a GitHub branch rule by this change.

Before release, Md Faizal must confirm that the copyright attribution is supportable for every Foxy-authored package component and that no employer, client, contractor, co-founder or prior contributor owns or controls any included rights. A copyright notice or GitHub account name is not proof of legal ownership. Review each bundled dependency against the exact package output.

## Npm trusted publisher setup (manual owner action)

First verify that the `vibesane` npm organization exists and that the intended publishing account has owner/admin rights. Enable 2FA, restrict write/publish membership, and confirm that `@vibesane/foxy` is available to the organization. A 404 from `npm view` is not proof that the scope is unowned.

Only after a separate publish workflow is authored and independently reviewed, configure npm Trusted Publishing for:
- package: `@vibesane/foxy`;
- GitHub owner: `Darkhero766`;
- repository: `Vibeguard`;
- exact publish workflow filename and protected GitHub environment (for example, `npm-release`).

No publishing workflow or Trusted Publisher has been configured by this licensing change. Do not create an npm token or enable publishing until the ownership and independent security gates are complete.

The workflow must use GitHub-hosted runners (self-hosted runners are not currently supported), grant only `id-token: write` plus `contents: read`, and use npm CLI 11.5.1+ with Node.js 22.14.0+ (the Foxy runtime requirement of Node.js 24.15.0 already exceeds this). Use current, full-SHA-pinned GitHub Actions; configure `actions/setup-node` with `registry-url: https://registry.npmjs.org` and disable package-manager caching in the publish job. The `repository.url` in the generated package must exactly match `https://github.com/Darkhero766/Vibeguard.git`. npm validates the exact trusted-publisher workflow filename and, when configured, environment name; verify spelling and case. For a public package from this public repository, npm Trusted Publishing automatically generates provenance. Provenance provides cryptographic workflow/source traceability; it is not a security certification. These requirements are separate from the read-only qualification workflow.

No Trusted Publisher has been configured by this work, and no publish workflow has been run.

## VibeSane Cloud boundary

Foxy remains local-first and account-independent. Clerk is an optional VibeSane web identity provider through the current Supabase Auth session flow; Supabase remains the application UUID/session authority. A cloud feature must be independently authenticated, server-authorized and opt-in. Do not upload source, diffs, credentials, environment values, prompts or local database contents by default. Cloud scan reports require explicit consent, minimization, retention, deletion and tenant-isolation controls.

## Known non-release claims

- The completion gate is cooperative, not tamper-proof against the same OS user. Use required CI, protected branches and human review as authoritative external enforcement.
- Benchmark fixtures are controlled and synthetic; passing benchmarks do not establish real-world false-positive/false-negative rates.
- Automated CI does not replace live validation in each advertised AI host.
- This runbook does not configure Clerk/Supabase/Render production services, publish npm, deploy the website or merge either draft PR.
