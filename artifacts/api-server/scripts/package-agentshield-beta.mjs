#!/usr/bin/env node
// Build a self-contained, offline-installable Foxy CLI beta tarball. This script never publishes.
// Packaging never publishes to a registry and never executes customer project code.
import { mkdir, cp, rm, readFile, writeFile, stat, readdir, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGENTSHIELD_VERSION } from './agentshield-version.mjs';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, 'dist', 'agentshield-beta-stage');
const out = path.join(root, 'dist');
export const PACKAGE_VERSION = AGENTSHIELD_VERSION;
const scripts = [
  'vibesane.mjs',
  'agentshield-universal-install.mjs',
  'agentshield-connect.mjs',
  'agentshield-controller.mjs',
  'agentshield-hook.mjs',
  'agentshield-stop.mjs',
  'agentshield-codex-stop.mjs',
  'agentshield-cursor-stop.mjs',
  'agentshield-policy.mjs',
  'agentshield-gate.mjs',
  'agentshield-verifier.mjs',
  'agentshield-install.mjs',
  'agentshield-capabilities.mjs',
  'agentshield-hybrid.mjs',
  'agentshield-version.mjs',
  'agentshield-mcp-server.mjs',
  'agentshield-safe-git.mjs',
  'agentshield-mcp-sdk.mjs',
  'agentshield-mcp-stdio.mjs',
  'agentshield-jobs.mjs',
  'agentshield-jobs-store.mjs',
  'agentshield-baselines.mjs',
  'agentshield-python.mjs',
  'agentshield-sarif.mjs',
];
const PACKAGE_EPOCH = new Date('2020-01-01T00:00:00.000Z');
const PACKAGE_TEXT_EXTENSIONS = new Set(['.mjs', '.cjs', '.json', '.md', '.txt']);

async function normalizePackageTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await normalizePackageTree(fullPath);
      await utimes(fullPath, PACKAGE_EPOCH, PACKAGE_EPOCH);
      continue;
    }
    if (!entry.isFile() || !PACKAGE_TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      throw new Error('Beta package contains an unexpected non-text or non-regular file: ' + entry.name);
    }
    const original = await readFile(fullPath, 'utf8');
    const normalized = original.replace(/\r\n?/g, '\n');
    if (normalized !== original) await writeFile(fullPath, normalized);
    await utimes(fullPath, PACKAGE_EPOCH, PACKAGE_EPOCH);
  }
  await utimes(directory, PACKAGE_EPOCH, PACKAGE_EPOCH);
}

export function digestPackageFileManifest(fileDigests) {
  if (!Array.isArray(fileDigests) || fileDigests.length < 1 || fileDigests.length > 100) {
    throw new TypeError('Package file manifest must contain between 1 and 100 records.');
  }
  const aggregate = createHash('sha256');
  let previousPath = '';
  for (const file of fileDigests) {
    if (!file || typeof file !== 'object' || Array.isArray(file)
      || typeof file.path !== 'string' || !file.path || file.path.length > 512
      || file.path.startsWith('/') || file.path.includes('\\')
      || file.path.split('/').some((part) => !part || part === '.' || part === '..')
      || (previousPath && previousPath >= file.path)
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new TypeError('Package file manifest contains an invalid, duplicate, or unsorted record.');
    }
    previousPath = file.path;
    aggregate.update(file.path).update('\0').update(String(file.bytes)).update('\0')
      .update(file.sha256).update('\0');
  }
  return aggregate.digest('hex');
}

export function verifyPackageFileManifest(evidence) {
  try {
    return Boolean(evidence && Number.isSafeInteger(evidence.packagedFiles)
      && Array.isArray(evidence.packageFileDigests)
      && evidence.packageFileDigests.length === evidence.packagedFiles
      && /^[a-f0-9]{64}$/.test(evidence.packageContentSha256 || '')
      && digestPackageFileManifest(evidence.packageFileDigests) === evidence.packageContentSha256);
  } catch {
    return false;
  }
}

async function packageContentManifest(stageDirectory, files) {
  const fileDigests = [];
  for (const relativePath of [...files].sort()) {
    const bytes = await readFile(path.join(stageDirectory, ...relativePath.split('/')));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    fileDigests.push({ path: relativePath, bytes: bytes.length, sha256 });
  }
  return { contentSha256: digestPackageFileManifest(fileDigests), fileDigests };
}

async function main() {
  const scanner = path.join(root, 'dist', 'agentshield.mjs');
  if (!(await stat(scanner).catch(() => null))?.isFile()) {
    throw new Error('Build the standalone scanner first: pnpm --filter @workspace/api-server run build:agentshield.');
  }
  await rm(stage, { recursive: true, force: true });
  await mkdir(path.join(stage, 'scripts'), { recursive: true, mode: 0o700 });
  await mkdir(path.join(stage, 'dist'), { recursive: true, mode: 0o700 });
  await mkdir(path.join(stage, 'skills', 'vibesane-agentshield'), { recursive: true, mode: 0o700 });
  await cp(scanner, path.join(stage, 'dist', 'agentshield.mjs'));
  await cp(
    path.join(root, 'skills', 'vibesane-agentshield', 'SKILL.md'),
    path.join(stage, 'skills', 'vibesane-agentshield', 'SKILL.md'),
  );
  for (const file of scripts) {
    await cp(path.join(root, 'scripts', file), path.join(stage, 'scripts', file));
  }

  // The source checkout uses the official SDK packages, while the local beta
  // archive stays self-contained so install and smoke qualification work offline.
  await build({
    entryPoints: [path.join(root, 'scripts/agentshield-mcp-stdio.mjs')],
    outfile: path.join(stage, 'scripts/agentshield-mcp-stdio.mjs'),
    platform: 'node',
    format: 'esm',
    bundle: true,
    target: 'node24',
    sourcemap: false,
    legalComments: 'eof',
  });

  // Bundle TypeScript plus the AST worker; the installed CLI has no runtime npm dependencies.
  await build({
    entryPoints: [path.join(root, 'scripts/agentshield-ast-worker.mjs')],
    outfile: path.join(stage, 'scripts/agentshield-ast-worker.cjs'),
    platform: 'node',
    format: 'cjs',
    bundle: true,
    target: 'node24',
    minify: true,
    sourcemap: false,
    legalComments: 'eof',
  });
  const require = createRequire(import.meta.url);
  const tsLicense = await readFile(
    path.join(path.dirname(require.resolve('typescript/package.json')), 'LICENSE.txt'),
    'utf8',
  );
  const bundledPackages = ['@modelcontextprotocol/server', '@modelcontextprotocol/core', 'zod'];
  const sdkRequire = createRequire(require.resolve('@modelcontextprotocol/server'));
  const bundledLicenses = [];
  for (const name of bundledPackages) {
    let packageRoot = path.dirname(sdkRequire.resolve(name));
    let manifest = null;
    for (let depth = 0; depth < 8; depth++, packageRoot = path.dirname(packageRoot)) {
      manifest = await readFile(path.join(packageRoot, 'package.json'), 'utf8')
        .then(JSON.parse).catch(() => null);
      if (manifest?.name === name) break;
      manifest = null;
    }
    if (!manifest) throw new Error('Could not locate bundled dependency metadata for ' + name + '.');
    const licenseFile = ['LICENSE', 'LICENSE.txt'].map((file) => path.join(packageRoot, file));
    let licenseText = null;
    for (const file of licenseFile) {
      licenseText = await readFile(file, 'utf8').catch(() => null);
      if (licenseText) break;
    }
    if (!licenseText) throw new Error('Missing bundled dependency license for ' + name + '.');
    bundledLicenses.push(`${name} ${manifest.version} (${manifest.license})\n\n${licenseText}`);
  }
  await writeFile(path.join(stage, 'THIRD_PARTY_NOTICES.txt'), [
    'VibeSane Foxy internal beta — third-party component notice',
    'The MCP STDIO entry bundles the official Model Context Protocol TypeScript SDK and Zod.',
    'The bundled JS/TS AST worker includes the TypeScript compiler by Microsoft.',
    ...bundledLicenses,
    'TypeScript (bundled AST worker) is licensed under the MIT license. Copyright Microsoft Corporation.',
    '',
    tsLicense,
  ].join('\n'));

  const manifest = {
    name: '@vibesane/foxy',
    version: PACKAGE_VERSION,
    description: 'VibeSane Foxy local security CLI and read-only MCP server for AI coding agents',
    type: 'module',
    repository: { type: 'git', url: 'https://github.com/Darkhero766/Vibeguard.git' },
    publishConfig: { access: 'public', tag: 'beta' },
    bin: {
      foxy: './scripts/vibesane.mjs',
      vibesane: './scripts/vibesane.mjs',
      'vibesane-mcp': './scripts/agentshield-mcp-stdio.mjs',
      'vibesane-cursor-stop': './scripts/agentshield-cursor-stop.mjs',
    },
    engines: { node: '>=24.15.0' },
    dependencies: {},
    files: [
      'dist/agentshield.mjs',
      'scripts/*.mjs',
      'scripts/*.cjs',
      'skills/**',
      'README.md',
      'THIRD_PARTY_NOTICES.txt',
      'cursor-hooks.json',
    ],
    license: 'UNLICENSED',
  };
  await writeFile(path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  const cursorHooks = {
    version: 1,
    hooks: {
      stop: [{
        command: 'vibesane-cursor-stop',
        timeout: 20,
        loop_limit: 2,
      }],
    },
  };
  await writeFile(path.join(stage, 'cursor-hooks.json'), JSON.stringify(cursorHooks, null, 2) + '\n');

  await writeFile(path.join(stage, 'README.md'), [
    '# VibeSane Foxy ' + PACKAGE_VERSION + ' (unpublished beta candidate)',
    '',
    'Consent-first, project-scoped MCP installer and local static security-scanning CLI for AI coding agents, with optional Codex Stop hooks. The read-only MCP server never modifies customer repositories or executes project code.',
    '**Trust boundary:** Foxy is a cooperative local verification gate, not a tamper-proof security boundary. A coding agent or process running with the same OS-user permissions can alter local configuration, disable hooks, bypass MCP calls, or modify files directly. Enforce delivery independently with required CI checks, protected branches and human review.',
    'Requires Node.js 24.15.0 or newer (Node.js >=24.15.0) and Git. The automated release-qualification matrix runs on Windows, macOS, and Ubuntu/Linux. It covers regression tests, installer/connect behavior, typechecks/builds, MCP STDIO, synthetic benchmarks, and offline package/CLI smoke. Actual live-host acceptance, independent human security review, and explicit release approval are separate gates. This opt-in beta is not a security certification.',
    `The asynchronous MCP queue uses SQLite through Node's built-in node:sqlite module with transactional multi-process job claims, per-process heartbeats, cancellation propagation, and crash recovery. Its default store path includes the host namespace and an allowlist-scope fingerprint. VIBESANE_JOB_STORE_DIR relocates the base directory only; the same isolation suffix remains. On Windows the final store path must remain inside the current user profile. The store must reside on a local filesystem, never a network or cloud-synchronized folder.`,
    `On first beta.5-or-later startup, an exact beta.4 jobs.json snapshot is migrated into SQLite only after the legacy lock is confirmed inactive. The original JSON file is retained untouched as a recovery copy. Beta.4's shared snapshot is filtered by the current MCP process's canonical VIBESANE_ALLOWED_ROOTS_JSON; records for other repositories are not imported into this host/workspace store. A valid allowlist is required when legacy records exist. If no old lock exists, beta.5 atomically publishes and retains FOXY_BETA5_MIGRATION_GUARD_V1 at the old lock path; pre-existing stale locks also block migration and are preserved unchanged until an operator verifies all old processes are stopped, inspects the lock and removes it manually. Stop every beta.4 Foxy process before upgrading; beta.4 downgrade after migration is unsupported.`,
    '',
    '## Install locally',
    'npm install --global ./vibesane-foxy-' + PACKAGE_VERSION + '.tgz',
    'foxy --help',
    '',
    '## One-command bootstrap (after an owner-approved registry publication)',
    'macOS/Linux: curl -fsSL https://vibesane.app/install.sh | bash',
    'Windows PowerShell: $env:FOXY_INSTALL_AGENT=\'auto\'; irm https://vibesane.app/install.ps1 | iex',
    'Target one host on macOS/Linux by appending: -s -- --agent codex. On Windows, replace auto with a supported host name in FOXY_INSTALL_AGENT.',
    'The bootstrap checks Node.js, npm and Git, queries the official npm registry, installs the published beta globally with lifecycle scripts disabled, and invokes the consent-first project installer. It refuses installation when the package/tag is not published. The global executable path keeps MCP registrations stable across npm cache refreshes. These scripts are not live until the website deployment includes them and the owner has approved package publication.',
    'vibesane --help',
    'vibesane doctor --cwd /absolute/path/to/project',
    'After installing a project hook, vibesane doctor reports checks.codexStopHookInstalled or checks.claudeHooksInstalled when the project configuration is readable.',
    'Validate the MCP allowlist without printing paths: VIBESANE_ALLOWED_ROOTS_JSON=\'["/absolute/path/to/project"]\' vibesane mcp-doctor.',
    '',
    '## Coding agents',
    'MCP command: vibesane-mcp (Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code, VS Code Copilot and other compatible MCP stdio clients).',
    'Codex ~/.codex/config.toml: [mcp_servers.vibesane_agentshield], command = absolute vibesane-mcp path, args = [], env = { VIBESANE_ALLOWED_ROOTS_JSON = \'["/absolute/path/to/project"]\' }. Restart Codex and verify MCP status reports workspaceAuthorization configured.',
    'Claude Code project .mcp.json: add mcpServers.vibesane-agentshield with command set to the absolute vibesane-mcp path, args: [], and env.VIBESANE_ALLOWED_ROOTS_JSON set to the JSON-escaped allowlist string. Approve the project server and verify with /mcp.',
    'Examples: vibesane connect --agent claude; vibesane connect --agent codex; vibesane connect --agent cursor; vibesane connect --agent gemini; vibesane connect --agent roo; vibesane connect --agent copilot. VS Code Copilot and Copilot CLI use the shared workspace .mcp.json entry.',
    'One-command MCP registration: vibesane connect auto-detects Claude Code, Codex CLI, Cursor, Gemini CLI, Roo Code and GitHub Copilot CLI from installed commands and project/host markers. Use vibesane connect --agent all to configure all six supported host targets; Claude Code and VS Code Copilot share the workspace .mcp.json entry and are reported separately. Explicit targets include --agent claude, --agent codex, --agent cursor, --agent gemini, --agent roo and --agent copilot. Use --agent mcp to print a generic stdio entry for any other MCP-compatible host; this does not integrate agents that do not support MCP stdio. Remove exact managed entries with vibesane disconnect --agent all; customized entries are refused and backups are retained. This writes only project MCP config, backs up existing files, and preserves unrelated entries. Restart the host and approve the server.',
    'Consent-first installer: run vibesane install in a Git repository to detect supported agents, preview exact project-scoped MCP config targets, and approve one setup operation. Default selection is auto detection; use vibesane install --agent auto to state this explicitly. Use --dry-run to preview without writes, --agent HOST to select a host, --agent all to configure all adapters, and --yes only in automation after reviewing the target plan. It verifies every managed entry by reopening it. MCP configuration does not install hooks or grant host trust; restart each host and approve the server. No source code is executed.',
    'Codex project MCP registration is written to .codex/config.toml; approve/trust the project in Codex before using project-scoped config.',
    'Remove the exact managed MCP entry: vibesane uninstall-mcp --host claude --cwd /absolute/path/to/project or vibesane uninstall-mcp --host cursor --cwd /absolute/path/to/project. Customized entries are left untouched.',
    'Claude Code hooks: vibesane init --cwd /absolute/path/to/project',
    'Claude Code and Codex completion enforcement (opt in): vibesane config --mode assist --completion-gate enforce --base-ref origin/main --cwd /absolute/path/to/project.',
    'Enforce mode scans the target-base-to-HEAD committed diff plus staged, modified, and untracked files. The configured target/upstream base such as origin/main must resolve locally to a commit strictly ancestral to HEAD; a base at HEAD or on unrelated/ahead history fails closed. Keep the ref fetched. Missing history, deleted/unsupported paths, or incomplete scans fail closed.',
    'The gate blocks on unresolved configured-severity findings, incomplete/unknown scans, no changed-path evidence, a disabled scanner, or scan races. Claude Code and Codex receive one continuation opportunity; if the host re-enters Stop and the condition remains unresolved, AgentShield terminates that turn with continue:false and a visible stop reason instead of creating an unbounded loop. A host-level guard is not tamper-proof.',
    'MCP scan_changed also accepts optional base_ref; pass the same value to list_findings and verify_remediation.',
    'For agent-managed changed scans use scan_start with scope changed; scan_results returns a scan_id baseline that is rehydrated after an MCP server restart for the remainder of its original 30-minute TTL. Full scans use scope full and do not create remediation baselines. Poll with scan_wait/status, retrieve at most 50 findings per scan_results page, and cancel queued/running work with scan_cancel. Active jobs are marked interrupted after restart; partial_coverage is never a clean result.',
    'Codex project workflow and Stop hook: vibesane init-codex --cwd /absolute/path/to/project; then review/trust the project hook in Codex with /hooks.',
    'MCP workspace authorization is required: set VIBESANE_ALLOWED_ROOTS_JSON on the vibesane-mcp process to a JSON array of canonical authorized directory roots, for example ["/absolute/path/to/project"]. Missing or invalid configuration denies workspace tools; status and explain_finding remain available. Caller-supplied workspace paths never authorize themselves. Configured filesystem root identities are pinned for the server lifetime; restart MCP after intentionally replacing a root.',
    'Uninstall the Codex Stop hook and unmodified bundled skill: vibesane uninstall-codex --cwd /absolute/path/to/project.',
    'Cursor Stop hook: merge the included cursor-hooks.json into the project .cursor/hooks.json; do not overwrite existing hooks.',
    'For a bounded Cursor remediation loop, explicitly set vibesane config --mode auto-fix --cwd /absolute/path/to/project.',
    'Host hook permissions and user approvals remain authoritative.',
    '',
    '## Scan and verify',
    'vibesane scan --changed --base-ref origin/main --cwd /absolute/path/to/project',
    'vibesane scan --changed --format sarif --cwd /absolute/path/to/project',
    'vibesane verify --changed --cwd /absolute/path/to/project',
    'vibesane capabilities --format text',
    '',
    'AgentShield scans supported changed files using static heuristics and exports SARIF 2.1.0 with severity, confidence, engine and selected CWE references. Unsupported languages, incomplete scans, and unverified behavior must not be described as clean.',
    'Supported changed files: JavaScript/TypeScript, Python, SQL, JSON, YAML and .env. Markdown, Dockerfiles, arbitrary manifests, binary/generated files and other unsupported extensions are not scanned; enforced completion blocks on unsupported changed paths.',
    'MCP never modifies repository files or executes project code. scan_changed and verify_remediation update Foxy-managed in-memory baseline state; scan_start and scan_cancel update only the local SQLite queue. Queue and baseline state stays in Foxy-managed local storage. No shell, patch, commit, deploy, or network tools are exposed.',
    'Foxy project setup writes only explicit project-level MCP config after resolving the Git root. A website cannot silently install it; host approval remains required.',
    'The optional AST/hybrid checks are experimental and opt-in. Local AI, when configured separately, is advisory only.',
    'No source code is uploaded by the local scanner. Run only against repositories the host is authorized to access.',
    'Workspace uninstall: vibesane uninstall --cwd /absolute/path/to/project removes exact Foxy MCP registrations plus matching Claude Code/Codex hooks, preserving unrelated configuration, modified skills, local scan/baseline/queue state and private recovery backups. Remove the global executable separately with npm uninstall --global @vibesane/foxy. Manually copied Cursor hooks are not removed by Foxy.',
    '',
  ].join('\n'));
  // Normalize text bytes and filesystem mtimes before npm packs the archive.
  // This makes the unpublished package reproducible across Windows and macOS.
  await normalizePackageTree(stage);

  const packArgs = ['pack', '--ignore-scripts', '--json', '--pack-destination', out, stage];
  const { stdout } = await exec('npm', packArgs, {
    timeout: 30000,
    maxBuffer: 250000,
    windowsHide: true,
    shell: process.platform === 'win32',
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
  });
  const metadata = JSON.parse(stdout)[0];
  const expected = new Set([
    'package.json',
    'README.md',
    'THIRD_PARTY_NOTICES.txt',
    'cursor-hooks.json',
    'dist/agentshield.mjs',
    'scripts/agentshield-ast-worker.cjs',
    'skills/vibesane-agentshield/SKILL.md',
    ...scripts.map((file) => 'scripts/' + file),
  ]);
  const actual = new Set(metadata.files.map((file) => file.path));
  if (actual.size !== expected.size || [...actual].some((file) => !expected.has(file))) {
    throw new Error('Beta package contains unexpected or missing files.');
  }
  if (metadata.size > 8_000_000) throw new Error('Beta package unexpectedly exceeds 8 MB.');
  const archive = path.join(out, metadata.filename);
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  const contentManifest = await packageContentManifest(stage, actual);
  process.stdout.write(JSON.stringify({
    status: 'packaged_local_only',
    version: PACKAGE_VERSION,
    archive,
    sha256: digest,
    archiveBytes: metadata.size,
    contentSha256: contentManifest.contentSha256,
    fileDigests: contentManifest.fileDigests,
    fileCount: actual.size,
    contents: [...actual].sort(),
    published: false,
  }) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write('AgentShield beta packaging failed: ' + String(error?.message || error) + '\n');
    process.exitCode = 2;
  });
}
