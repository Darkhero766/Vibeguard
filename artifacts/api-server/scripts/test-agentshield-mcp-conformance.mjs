#!/usr/bin/env node
// Official 2026-07-28 MCP server requirements against a loopback HTTP adapter.
// Production Foxy remains STDIO and is separately exercised by the real STDIO smoke.
import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.join(here, 'agentshield-mcp-conformance-http.mjs');
const root = path.resolve(here, '..');

function waitForReady(child, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    let pending = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => finish(new Error('Timed out waiting for Foxy conformance adapter readiness.')), timeoutMs);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8000); });
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      let index;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        try {
          const message = JSON.parse(line);
          if (message.status === 'ready' && typeof message.url === 'string') finish(null, { url: message.url, stderr });
        } catch {
          finish(new Error('Conformance adapter emitted unexpected STDOUT: ' + line.slice(0, 300) + '\n' + stderr));
        }
      }
    });
    child.once('error', (error) => finish(error));
    child.once('exit', (code, signal) => {
      if (!settled) finish(new Error('Conformance adapter exited before readiness (code=' + code + ', signal=' + signal + ').\n' + stderr));
    });
  });
}
async function runConformance(url, cwd) {
  const args = ['dlx', '@modelcontextprotocol/conformance@0.2.0-alpha.12', 'server', '--url', url, '--requirements', '2026-07-28', '--verbose'];
  const result = await exec('pnpm', args, {
    cwd,
    timeout: 240_000,
    maxBuffer: 12_000_000,
    windowsHide: true,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' },
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}
async function main() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'foxy-mcp-conformance-'));
  const workspace = path.join(temp, 'workspace');
  const store = path.join(temp, 'queue-store');
  let child;
  let result;
  try {
    await mkdir(path.join(workspace, 'src'), { recursive: true });
    await writeFile(path.join(workspace, 'src', 'index.js'), 'export const conformanceFixture = true;\n');
    await exec('git', ['init', '-q', workspace], { timeout: 10_000 });
    await exec('git', ['-C', workspace, 'config', 'user.name', 'Foxy MCP Conformance']);
    await exec('git', ['-C', workspace, 'config', 'user.email', 'foxy-conformance@example.invalid']);
    await exec('git', ['-C', workspace, 'add', '.']);
    await exec('git', ['-C', workspace, 'commit', '-qm', 'synthetic conformance fixture']);
    const env = {
      ...process.env,
      VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([workspace]),
      VIBESANE_JOB_STORE_NAMESPACE: 'conformance',
      VIBESANE_JOB_STORE_DIR: store,
      FOXY_CONFORMANCE_PORT: '0',
    };
    child = spawn(process.execPath, [serverScript], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const ready = await waitForReady(child);
    result = await runConformance(ready.url, temp);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await new Promise(resolve => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        child.once('exit', resolve);
        const force = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
        force.unref?.();
      });
    }
    await rm(temp, { recursive: true, force: true });
  }
  process.stdout.write(JSON.stringify({
    status: 'passed',
    framework: '@modelcontextprotocol/conformance@0.2.0-alpha.12',
    mode: 'server',
    requirement: '2026-07-28',
    transportUnderTest: 'isolated Streamable HTTP adapter over createFoxyServer',
    productionTransport: 'STDIO (separately exercised by test-agentshield-mcp-smoke.mjs)',
    output: (result.stdout + (result.stderr ? '\n[stderr]\n' + result.stderr : '')).slice(-16_000),
  }) + '\n');
}
main().catch((error) => {
  // pnpm writes its progress to stderr even when the conformance CLI emits
  // the useful scenario report on stdout. Preserve both streams so a failing
  // run cannot hide the actual protocol findings behind package-manager noise.
  const diagnostic = [
    'exitCode: ' + String(error?.code ?? 'unknown'),
    'signal: ' + String(error?.signal ?? 'none'),
    'killed: ' + String(Boolean(error?.killed)),
    '[stdout]',
    String(error?.stdout || '').slice(-16_000) || '(empty)',
    '[stderr]',
    String(error?.stderr || '').slice(-16_000) || '(empty)',
    '[message]',
    String(error?.message || error).slice(-2_000),
  ].join('\n');
  process.stderr.write('Foxy official MCP conformance failed:\n' + diagnostic + '\n');
  process.exitCode = 1;
});
