#!/usr/bin/env node
// Build a self-contained, unpublished, offline-installable AgentShield beta tarball.
// Packaging never publishes to a registry and never executes customer project code.
import { mkdir, cp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(root, 'dist', 'agentshield-beta-stage');
const out = path.join(root, 'dist');
export const PACKAGE_VERSION = '0.7.0-beta.3';
const scripts = [
  'vibesane.mjs',
  'agentshield-controller.mjs',
  'agentshield-hook.mjs',
  'agentshield-stop.mjs',
  'agentshield-cursor-stop.mjs',
  'agentshield-policy.mjs',
  'agentshield-gate.mjs',
  'agentshield-verifier.mjs',
  'agentshield-install.mjs',
  'agentshield-capabilities.mjs',
  'agentshield-hybrid.mjs',
  'agentshield-mcp-server.mjs',\n  'agentshield-python.mjs',
  'agentshield-python.mjs',
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

  // Bundle TypeScript plus the AST worker; the installed CLI has no runtime npm dependencies.
  await build({
    entryPoints: [path.join(root, 'scripts/agentshield-ast-worker.mjs')],
    outfile: path.join(stage, 'scripts/agentshield-ast-worker.cjs'),
    platform: 'node',
    format: 'cjs',
    bundle: true,
    target: 'node20',
    minify: true,
    sourcemap: false,
    legalComments: 'eof',
  });
  const require = createRequire(import.meta.url);
  const tsLicense = await readFile(
    path.join(path.dirname(require.resolve('typescript/package.json')), 'LICENSE.txt'),
    'utf8',
  );
  await writeFile(path.join(stage, 'THIRD_PARTY_NOTICES.txt'), [
    'VibeSane AgentShield internal beta — third-party component notice',
    'The bundled JS/TS AST worker includes the TypeScript compiler by Microsoft.',
    'TypeScript is licensed under the MIT license. Copyright Microsoft Corporation.',
    '',
    tsLicense,
  ].join('\n'));

  const manifest = {
    name: '@vibesane/agentshield',
    version: PACKAGE_VERSION,
    private: true,
    description: 'VibeSane AgentShield local security beta with Claude Code hooks, Cursor Stop integration and read-only MCP server (unpublished)',
    type: 'module',
    bin: {
      vibesane: './scripts/vibesane.mjs',
      'vibesane-mcp': './scripts/agentshield-mcp-server.mjs',
      'vibesane-cursor-stop': './scripts/agentshield-cursor-stop.mjs',
    },
    engines: { node: '>=20' },
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
    '# VibeSane AgentShield (unpublished developer preview)',
    '',
    'Local static security scanning, Claude Code hooks, Cursor Stop feedback, and a read-only MCP server.',
    'Requires Node.js >=20, Git, and macOS/Linux. This is an opt-in beta, not a security certification.',
    '',
    '## Install locally',
    'npm install --global ./vibesane-agentshield-' + PACKAGE_VERSION + '.tgz',
    'vibesane --help',
    'vibesane doctor --cwd /absolute/path/to/project',
    '',
    '## Coding agents',
    'MCP command: vibesane-mcp (Codex, Claude Code, Cursor MCP, and other compatible stdio clients).',
    'Claude Code hooks: vibesane init --cwd /absolute/path/to/project',
    'Codex project workflow: vibesane init-codex --cwd /absolute/path/to/project (installs the included skill without overwriting files).',
    'Cursor Stop hook: merge the included cursor-hooks.json into the project .cursor/hooks.json; do not overwrite existing hooks.',
    'For a bounded Cursor remediation loop, explicitly set vibesane config --mode auto-fix --cwd /absolute/path/to/project.',
    'Host hook permissions and user approvals remain authoritative.',
    '',
    '## Scan and verify',
    'vibesane scan --changed --cwd /absolute/path/to/project',
    'vibesane verify --changed --cwd /absolute/path/to/project',
    'vibesane capabilities --format text',
    '',
    'AgentShield scans supported changed files using static heuristics. Unsupported languages, incomplete scans, and unverified behavior must not be described as clean.',
    'MCP exposes read-only tools; it does not expose shell, patch, commit, deploy, or network capabilities.',
    'The optional AST/hybrid checks are experimental and opt-in. Local AI, when configured separately, is advisory only.',
    'No source code is uploaded by the local scanner. Run only against repositories the host is authorized to access.',
    'Uninstall Claude Code hooks with vibesane uninstall --cwd /absolute/path/to/project; remove the Cursor hook entry manually.',
    '',
  ].join('\n'));
  const { stdout } = await exec('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', out, stage,
  ], {
    timeout: 30000,
    maxBuffer: 250000,
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
  process.stdout.write(JSON.stringify({
    status: 'packaged_local_only',
    version: PACKAGE_VERSION,
    archive,
    sha256: digest,
    archiveBytes: metadata.size,
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
