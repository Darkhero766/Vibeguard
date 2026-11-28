#!/usr/bin/env node
// Official MCP client SDK against the real Foxy stdio process and a disposable Git repo.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { scanFull } from './agentshield-mcp-server.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const exec = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const api = path.resolve(scripts, '..');
const root = await mkdtemp(path.join(tmpdir(), 'foxy-mcp-smoke-'));
const repo = path.join(root, 'repo');
const cancelRepo = path.join(root, 'cancel-repo');
const store = path.join(root, 'state');
await mkdir(path.join(repo, 'src'), { recursive: true });
await mkdir(path.join(cancelRepo, 'src'), { recursive: true });
const env = { ...process.env,
  VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([root]),
  VIBESANE_JOB_STORE_DIR: store,
  VIBESANE_JOB_CONCURRENCY: '1',
  VIBESANE_JOB_QUEUE_LIMIT: '4',
};
let client;
let transport;
let stderr = '';
async function connectFoxy() {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(scripts, 'agentshield-mcp-stdio.mjs')],
    cwd: api,
    env,
    stderr: 'pipe',
  });
  transport.stderr?.on('data', (chunk) => { stderr += String(chunk); });
  client = new Client({ name: 'foxy-qualification-client', version: '1.0.0' }, {
    versionNegotiation: { mode: { pin: '2026-07-28' }, probe: { timeoutMs: 3000 } },
  });
  await client.connect(transport, { timeout: 15_000 });
}
async function restartFoxy() {
  await client?.close().catch(() => {});
  await transport?.close().catch(() => {});
  client = null;
  transport = null;
  await connectFoxy();
}
try {
  await exec('git', ['init', '-q', repo]);
  await exec('git', ['-C', repo, 'config', 'user.name', 'Foxy Smoke']);
  await exec('git', ['-C', repo, 'config', 'user.email', 'foxy-smoke@example.invalid']);
  for (let i = 0; i < 12; i++) {
    await writeFile(path.join(repo, 'src', `fixture-${i}.js`), i === 0
      ? 'export function render(value) { return eval(value); }\n'
      : `export const fixture${i} = ${i};\n`);
  }
  await exec('git', ['-C', repo, 'add', '.']);
  await exec('git', ['-C', repo, 'commit', '-qm', 'synthetic scanner fixture']);

  await exec('git', ['init', '-q', cancelRepo]);
  await exec('git', ['-C', cancelRepo, 'config', 'user.name', 'Foxy Smoke']);
  await exec('git', ['-C', cancelRepo, 'config', 'user.email', 'foxy-smoke@example.invalid']);
  await writeFile(path.join(cancelRepo, 'src', 'cancel.js'), 'export const cancelFixture = true;\n');
  await exec('git', ['-C', cancelRepo, 'add', '.']);
  await exec('git', ['-C', cancelRepo, 'commit', '-qm', 'synthetic cancellation fixture']);

  await connectFoxy();
  const deniedStart = await client.callTool({ name: 'scan_start', arguments: {
    workspace: tmpdir(), scope: 'full',
  } });
  assert.equal(deniedStart.isError, true, 'unauthorized workspace must be rejected before queue admission');

  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name);
  for (const name of ['scan_changed', 'scan_start', 'scan_status', 'scan_wait', 'scan_results', 'scan_cancel']) {
    assert.ok(names.includes(name), `Missing MCP tool ${name}`);
  }
  const start = await client.callTool({ name: 'scan_start', arguments: { workspace: repo, scope: 'full', idempotency_key: 'smoke-full-1' } });
  const job = JSON.parse(start.content[0].text);
  assert.match(job.job_id, /^[a-f0-9-]{36}$/);

  const cancelStart = await client.callTool({ name: 'scan_start', arguments: { workspace: cancelRepo, scope: 'full', idempotency_key: 'smoke-cancel-1' } });
  const cancelJob = JSON.parse(cancelStart.content[0].text);
  assert.notEqual(cancelJob.job_id, job.job_id);
  const cancelResult = await client.callTool({ name: 'scan_cancel', arguments: { job_id: cancelJob.job_id } });
  assert.equal(JSON.parse(cancelResult.content[0].text).status, 'cancelled');

  let status;
  for (let i = 0; i < 40; i++) {
    const response = await client.callTool({ name: 'scan_wait', arguments: { job_id: job.job_id, wait_ms: 500 } });
    status = JSON.parse(response.content[0].text);
    if (['completed', 'failed', 'interrupted', 'cancelled'].includes(status.status)) break;
  }
  assert.equal(status.status, 'completed', JSON.stringify(status));
  assert.equal(status.scan_status, 'complete');
  const page = await client.callTool({ name: 'scan_results', arguments: { job_id: job.job_id, offset: 0, limit: 10 } });
  const results = JSON.parse(page.content[0].text);
  assert.equal(results.status, 'completed');
  assert.ok(results.findings.some((finding) => finding.ruleId === 'eval_usage'));
  assert.equal(results.summary.filesScanned, 12);

  // A full scan must fail UNKNOWN if an in-scope file changes after analysis.
  const previousRoots = process.env.VIBESANE_ALLOWED_ROOTS_JSON;
  process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([root]);
  try {
    await assert.rejects(scanFull({ workspace: repo }, {
      progress: (value) => {
        if (value === 90) writeFileSync(path.join(repo, 'src', 'fixture-0.js'),
          'export function render(value) { return String(value); }');
      },
    }), /Workspace changed during the full scan/);
  } finally {
    if (previousRoots === undefined) delete process.env.VIBESANE_ALLOWED_ROOTS_JSON;
    else process.env.VIBESANE_ALLOWED_ROOTS_JSON = previousRoots;
    await writeFile(path.join(repo, 'src', 'fixture-0.js'),
      'export function render(value) { return eval(value); }');
  }

  // A repository over the 100-path budget must disclose exactly what was left unscanned.
  for (let i = 0; i < 90; i++) {
    await writeFile(path.join(repo, 'src', `overflow-${String(i).padStart(3, '0')}.js`),
      `export const overflow${i} = ${i};\n`);
  }
  await exec('git', ['-C', repo, 'add', '.']);
  await exec('git', ['-C', repo, 'commit', '-qm', 'synthetic full-scan overflow fixtures']);
  const overflowPreviousRoots = process.env.VIBESANE_ALLOWED_ROOTS_JSON;
  process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([root]);
  let boundedFull;
  try {
    boundedFull = await scanFull({ workspace: repo });
  } finally {
    if (overflowPreviousRoots === undefined) delete process.env.VIBESANE_ALLOWED_ROOTS_JSON;
    else process.env.VIBESANE_ALLOWED_ROOTS_JSON = overflowPreviousRoots;
  }
  assert.equal(boundedFull.status, 'partial_coverage');
  assert.equal(boundedFull.scannedSourceFileCount, 100);
  assert.equal(boundedFull.supportedSourceFileCount, 102);
  assert.equal(boundedFull.unscannedFileCount, 2);
  assert.equal(boundedFull.unscannedPaths.length, 2);
  assert.equal(boundedFull.securityGuarantee, false);

  // Exercise the changed-file job path and carry its baseline into remediation verification.
  const changedPath = path.join(repo, 'src', 'fixture-1.js');
  await writeFile(changedPath, 'export function render(value) { return eval(value); }');
  const changedStart = await client.callTool({ name: 'scan_start', arguments: {
    workspace: repo, scope: 'changed', idempotency_key: 'smoke-changed-1',
  } });
  const changedJob = JSON.parse(changedStart.content[0].text);
  assert.match(changedJob.job_id, /^[a-f0-9-]{36}$/);
  let changedStatus;
  for (let i = 0; i < 40; i++) {
    const response = await client.callTool({ name: 'scan_wait', arguments: { job_id: changedJob.job_id, wait_ms: 500 } });
    changedStatus = JSON.parse(response.content[0].text);
    if (['completed', 'failed', 'interrupted', 'cancelled'].includes(changedStatus.status)) break;
  }
  assert.equal(changedStatus.status, 'completed', JSON.stringify(changedStatus));
  const changedPage = await client.callTool({ name: 'scan_results', arguments: {
    job_id: changedJob.job_id, offset: 0, limit: 10,
  } });
  const changedResults = JSON.parse(changedPage.content[0].text);
  assert.ok(changedResults.scan_id, 'changed scan must return its remediation baseline ID');
  assert.ok(changedResults.baseline_expires_in_ms > 0);
  assert.ok(changedResults.findings.some((finding) => finding.ruleId === 'eval_usage'));

  assert.equal(Object.hasOwn(changedResults, 'baselineContext'), false,
    'internal baseline storage metadata must never be exposed to MCP callers');
  await writeFile(changedPath, 'export function render(value) { return String(value); }');

  // Restart the real STDIO server. The completed job and its baseline must be
  // recovered from the protected local state store before remediation is verified.
  await restartFoxy();
  const recoveredStatus = await client.callTool({ name: 'scan_status', arguments: { job_id: changedJob.job_id } });
  assert.equal(JSON.parse(recoveredStatus.content[0].text).status, 'completed');
  const recoveredPage = await client.callTool({ name: 'scan_results', arguments: {
    job_id: changedJob.job_id, offset: 0, limit: 10,
  } });
  const recoveredResults = JSON.parse(recoveredPage.content[0].text);
  assert.equal(recoveredResults.scan_id, changedResults.scan_id);
  assert.ok(recoveredResults.baseline_expires_in_ms > 0);

  const verifyResponse = await client.callTool({ name: 'verify_remediation', arguments: {
    workspace: repo, baseline_id: recoveredResults.scan_id,
  } });
  const verification = JSON.parse(verifyResponse.content[0].text);
  assert.equal(verification.status, 'rescan_clean', JSON.stringify(verification));
  assert.ok(verification.currentScanId);

  const version = client.getNegotiatedProtocolVersion?.() || 'SDK negotiated';
  assert.equal(version, '2026-07-28');
  process.stdout.write(JSON.stringify({ status: 'passed', protocol: version, tools: names.length,
    jobStatus: status.status, filesScanned: results.summary.filesScanned,
    findings: results.summary.totalFindings, cancelledJob: cancelJob.job_id }) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ status: 'failed', error: String(error?.stack || error), serverStderr: stderr.slice(-3000) }) + '\n');
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
  await transport?.close().catch(() => {});
  await rm(root, { recursive: true, force: true });
}
