#!/usr/bin/env node
// Offline install/CLI/MCP smoke test for the unpublished AgentShield beta.
// Uses only a synthetic disposable Git repository; never runs customer project code.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const dist = path.join(root, 'dist');
const stage = path.join(dist, 'agentshield-beta-stage');
const temp = await mkdtemp(path.join(os.tmpdir(), 'agentshield-package-smoke-'));
const installPrefix = path.join(temp, 'install');
const fixture = path.join(temp, 'fixture');
let archive = null;

async function run(program, args, options = {}) {
  return exec(program, args, {
    cwd: root, timeout: 60_000, maxBuffer: 4_000_000, windowsHide: true,
    ...options,
  });
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function runMcp(executable, payload, expectedResponses = 3) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Packaged MCP server timed out.'));
    }, 15_000);
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    }
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      const count = stdout.split('\n').filter(Boolean).length;
      if (count >= expectedResponses && child.stdin.writable) child.stdin.end();
    });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => finish(error));
    child.on('close', code => {
      if (code !== 0) return finish(new Error('Packaged MCP process exited ' + code + ': ' + stderr.slice(0, 500)));
      const lines = stdout.split(/\r?\n/).filter(Boolean);
      let messages;
      try { messages = lines.map(line => JSON.parse(line)); }
      catch { return finish(new Error('Packaged MCP process emitted non-JSON stdout.')); }
      if (messages.length !== expectedResponses) return finish(new Error('Packaged MCP process returned an unexpected response count.'));
      finish(null, { messages, stderr: stderr.slice(0, 500) });
    });
    child.stdin.write(payload);
  });
}

try {
  assert(process.platform === 'darwin' || process.platform === 'linux',
    'Package smoke currently supports macOS/Linux only.');
  assert(Number(process.versions.node.split('.')[0]) >= 20, 'Node.js 20 or newer is required.');

  await run(process.execPath, [path.join(scriptsDir, 'build-agentshield.mjs')]);
  const pack = await run(process.execPath, [path.join(scriptsDir, 'package-agentshield-beta.mjs')]);
  const packaged = JSON.parse(pack.stdout);
  assert(packaged.status === 'packaged_local_only' && packaged.published === false,
    'Packaging must remain local-only.');
  assert(packaged.version === '0.7.0-beta.3', 'Unexpected AgentShield beta package version.');
  assert(typeof packaged.archive === 'string' && typeof packaged.sha256 === 'string',
    'Packaging did not return an archive path and SHA-256.');
  archive = packaged.archive;
  const packagedReadme = await run('tar', ['-xOf', archive, 'package/README.md']);
  assert(packagedReadme.stdout.includes('--completion-gate enforce'),
    'Packaged README omits Claude Code completion enforcement instructions.');

  await run('npm', ['install', '--global', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--prefix', installPrefix, archive], {
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_offline: 'true' },
  });
  const binDir = path.join(installPrefix, 'bin');
  const cli = path.join(binDir, 'vibesane');
  const mcp = path.join(binDir, 'vibesane-mcp');

  const help = await run(cli, ['--help'], { cwd: temp });
  assert(help.stdout.includes('VibeSane AgentShield'), 'Installed CLI help did not execute.');
  await mkdir(path.join(fixture, 'src'), { recursive: true });
  await writeFile(path.join(fixture, 'src', 'index.js'), 'export const baseline = true;\n');
  await run('git', ['init', '-q', fixture]);
  await run('git', ['-C', fixture, 'config', 'user.name', 'AgentShield Package Smoke']);
  await run('git', ['-C', fixture, 'config', 'user.email', 'agentshield-smoke@example.invalid']);
  await run('git', ['-C', fixture, 'add', '.']);
  await run('git', ['-C', fixture, 'commit', '-qm', 'synthetic fixture baseline']);
  await writeFile(path.join(fixture, 'src', 'index.js'), 'export const changed = true;\n');

  const doctor = await run(cli, ['doctor', '--cwd', fixture], { cwd: temp });
  const health = JSON.parse(doctor.stdout);
  assert(health.status === 'ready', 'Installed CLI doctor did not report ready.');
  const scan = await run(cli, ['scan', '--changed', '--cwd', fixture, '--format', 'json'], { cwd: temp });
  const report = JSON.parse(scan.stdout);
  assert(report.status === 'complete' && report.filesScanned === 1,
    'Installed package did not complete the synthetic changed-file scan.');

  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'agentshield-package-smoke', version: '1.0.0' },
    } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'status', arguments: {} } },
  ];
  const mcpResult = await runMcp(mcp, requests.map(x => JSON.stringify(x)).join('\n') + '\n');
  const byId = new Map(mcpResult.messages.map(message => [message.id, message]));
  assert(byId.get(1)?.result?.protocolVersion === '2025-11-25', 'MCP initialize did not negotiate the expected protocol.');
  const tools = byId.get(2)?.result?.tools;
  assert(Array.isArray(tools) && tools.some(tool => tool.name === 'scan_changed')
    && tools.some(tool => tool.name === 'verify_remediation'), 'Packaged MCP tool discovery is incomplete.');
  assert(byId.get(3)?.result?.content?.length > 0 && !byId.get(3)?.result?.isError,
    'Packaged MCP status call failed.');

  process.stdout.write(JSON.stringify({
    status: 'package_smoke_passed',
    version: packaged.version,
    packageSha256: packaged.sha256,
    packageBytes: packaged.archiveBytes,
    packagedFiles: packaged.fileCount,
    checks: ['build', 'npm-pack-manifest', 'isolated-install', 'cli-help', 'doctor', 'synthetic-scan', 'mcp-initialize', 'mcp-tools-list', 'mcp-status'],
    fixture: 'synthetic-disposable-git-repository',
    published: false,
  }) + '\n');
} catch (error) {
  process.stderr.write('AgentShield package smoke failed: ' + String(error?.message || error) + '\n');
  process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true }).catch(() => {});
  await rm(stage, { recursive: true, force: true }).catch(() => {});
  if (archive) await rm(archive, { force: true }).catch(() => {});
}
