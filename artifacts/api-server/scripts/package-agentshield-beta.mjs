#!/usr/bin/env node
// Build a self-contained, unpublished, offline-testable beta tarball.
// No production credentials, server runtime, or network publishing required.
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
export const PACKAGE_VERSION = '0.7.0-beta.2';
const scripts = ['vibesane.mjs', 'agentshield-controller.mjs', 'agentshield-hook.mjs',
  'agentshield-stop.mjs', 'agentshield-policy.mjs', 'agentshield-gate.mjs',
  'agentshield-verifier.mjs', 'agentshield-install.mjs',
  'agentshield-capabilities.mjs', 'agentshield-hybrid.mjs', 'agentshield-mcp-server.mjs'];
async function main() {
  const scanner = path.join(root, 'dist', 'agentshield.mjs');
  if (!(await stat(scanner).catch(() => null))?.isFile()) {
    throw new Error('Build the standalone scanner first: pnpm run build:agentshield.');
  }
  await rm(stage, { recursive: true, force: true });
  await mkdir(path.join(stage, 'scripts'), { recursive: true, mode: 0o700 });
  await mkdir(path.join(stage, 'dist'), { recursive: true, mode: 0o700 });
  await cp(scanner, path.join(stage, 'dist', 'agentshield.mjs'));
  for (const file of scripts) await cp(path.join(root, 'scripts', file), path.join(stage, 'scripts', file));
  // Bundle the TypeScript compiler and the reviewed AST/taint worker into a
  // portable, isolated CJS process. The installed package has ZERO runtime
  // dependencies and never runs repository install scripts.
  await build({
    entryPoints:[path.join(root,'scripts/agentshield-ast-worker.mjs')],
    outfile:path.join(stage,'scripts/agentshield-ast-worker.cjs'),
    platform:'node',format:'cjs',bundle:true,target:'node20',
    minify:true,sourcemap:false,legalComments:'eof',
  });
  const require=createRequire(import.meta.url);
  const tsLicense=await readFile(path.join(path.dirname(require.resolve('typescript/package.json')),
    'LICENSE.txt'),'utf8');
  await writeFile(path.join(stage,'THIRD_PARTY_NOTICES.txt'),[
    'VibeSane AgentShield internal beta — third-party component notice',
    'The bundled JS/TS AST worker includes the TypeScript compiler by Microsoft.',
    'TypeScript is licensed under the MIT license. Copyright Microsoft Corporation.',
    '',
    tsLicense,
  ].join('\\n'));
  const manifest = {
    name: '@vibesane/agentshield', version: PACKAGE_VERSION, private: true,
    description: 'VibeSane AgentShield local security beta with Claude Code hooks and read-only MCP server (unpublished)',
    type: 'module', bin: { vibesane: './scripts/vibesane.mjs', 'vibesane-mcp': './scripts/agentshield-mcp-server.mjs' },
    engines: { node: '>=20' },
    files: ['dist/agentshield.mjs', 'scripts/*.mjs', 'scripts/*.cjs', 'README.md', 'THIRD_PARTY_NOTICES.txt'],
    license: 'UNLICENSED',
  };
  await writeFile(path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(stage, 'README.md'), [
    '# VibeSane AgentShield (unpublished developer preview)',
    'Local static security scanning, Claude Code hooks, and read-only MCP server integration.',
    'No application-wide security guarantee. Static checks may be incomplete.',
    'Run vibesane doctor --cwd /absolute/path/to/project, then vibesane init --cwd /absolute/path/to/project.',
    'Use vibesane capabilities --format json to see supported and unsupported languages.',
    'Experimental hybrid: vibesane hybrid --changed --enable-ast --cwd /path/to/project.',
    'Optional local AI requires an explicit --enable-local-ai opt-in and an independently installed local model.',
    'Use vibesane uninstall --cwd /absolute/path/to/project before uninstalling the package.',
    'MCP: run vibesane-mcp from a built package; MCP tools are advisory and do not enforce a host completion gate.',\n    'Requires Node >=20, Git, and macOS/Linux. Beta: do not treat as a security certification.',
  ].join('\n') + '\n');
  const { stdout } = await exec('npm', ['pack', '--ignore-scripts', '--json',
    '--pack-destination', out, stage], { timeout: 30000, maxBuffer: 250000,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' } });
  const metadata = JSON.parse(stdout)[0];
  const expected = new Set(['package.json', 'README.md', 'THIRD_PARTY_NOTICES.txt', 'dist/agentshield.mjs', 'scripts/agentshield-ast-worker.cjs', ...scripts.map(x => 'scripts/' + x)]);
  const actual = new Set(metadata.files.map(x => x.path));
  if (actual.size !== expected.size || [...actual].some(x => !expected.has(x))) {
    throw new Error('Beta package has unexpected or missing files.');
  }
  if (metadata.size > 8_000_000) throw new Error('Beta package unexpectedly exceeds 8 MB.');
  const archive = path.join(out, metadata.filename);
  const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
  process.stdout.write(JSON.stringify({ status: 'packaged_local_only', version: PACKAGE_VERSION,
    archive, sha256: digest, archiveBytes: metadata.size, fileCount: actual.size,
    contents: [...actual].sort(), published: false }) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(e => { process.stderr.write('AgentShield beta packaging failed: ' + e.message + '\n'); process.exitCode = 2; });
}
