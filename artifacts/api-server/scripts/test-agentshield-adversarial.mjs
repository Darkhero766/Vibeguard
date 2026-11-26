import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  handleMessage, listFindings, normalizeReport, resolveAuthorizedRoots, scanChanged,
  validateRpcMessage, validateToolArguments, verifyRemediation, workspaceSnapshot,
} from './agentshield-mcp-server.mjs';
import { main as scanFile } from '../dist/agentshield.mjs';

const exec = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const temporary = new Set();
process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([os.tmpdir()]);

async function tempDir(prefix) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporary.add(dir);
  return dir;
}
async function git(cwd, ...args) {
  return exec('git', ['-c', 'user.name=AgentShield Test', '-c', 'user.email=agentshield@example.invalid', ...args], { cwd });
}
async function repo(prefix = 'agentshield-adversarial-') {
  const dir = await tempDir(prefix);
  await git(dir, 'init', '-q');
  await writeFile(path.join(dir, 'app.js'), 'export const status = "safe";\n');
  await git(dir, 'add', '.');
  await git(dir, 'commit', '-qm', 'synthetic baseline');
  return dir;
}
async function callScan(dir, base_ref) {
  return scanChanged({ workspace: dir, ...(base_ref ? { base_ref } : {}) });
}
test.after(async () => {
  await Promise.all([...temporary].map((dir) => rm(dir, { recursive: true, force: true })));
});

test('workspace authorization canonicalizes roots and rejects missing or malformed policy', async () => {
  const allowed = await tempDir('agentshield-authorized-');
  const repoPath = await repo();
  const allowedRepo = path.join(allowed, 'repository');
  await mkdir(allowedRepo);
  await git(allowedRepo, 'init', '-q');
  await writeFile(path.join(allowedRepo, 'app.js'), 'export const safe = true;\n');
  await git(allowedRepo, 'add', '.');
  await git(allowedRepo, 'commit', '-qm', 'authorized synthetic repository');
  const allowedAlias = allowed + '-root-alias';
  await symlink(allowed, allowedAlias);
  temporary.add(allowedAlias);
  const prior = process.env.VIBESANE_ALLOWED_ROOTS_JSON;
  try {
    process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([allowedAlias, allowed, allowedAlias]);
    assert.deepEqual(await resolveAuthorizedRoots(), [await realpath(allowed)]);
    assert.equal((await workspaceSnapshot(allowedRepo)).root, await realpath(allowedRepo));
    await assert.rejects(workspaceSnapshot(repoPath), /not authorized/i);
    process.env.VIBESANE_ALLOWED_ROOTS_JSON = '';
    for (const raw of ['', '{bad json', JSON.stringify([]), JSON.stringify(['relative/path']),
      JSON.stringify([path.join(allowed, 'missing')])]) {
      process.env.VIBESANE_ALLOWED_ROOTS_JSON = raw;
      await assert.rejects(workspaceSnapshot(repoPath), /not authorized/i);
      for (const [name, args] of [
        ['scan_changed', { workspace: repoPath }],
        ['list_findings', { workspace: repoPath, scan_id: 'a'.repeat(16) }],
        ['verify_remediation', { workspace: repoPath, baseline_id: 'b'.repeat(16) }],
      ]) {
        const response = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
        assert.equal(response.result.isError, true, `${name} must reject invalid workspace-root configuration`);
      }
    }
    process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([allowed]);
  } finally { process.env.VIBESANE_ALLOWED_ROOTS_JSON = prior; }
});

test('replacement of a configured authorization root fails closed for the server lifetime', async () => {
  const previous = process.env.VIBESANE_ALLOWED_ROOTS_JSON;
  const root = await tempDir('agentshield-root-identity-');
  const repoPath = path.join(root, 'repo');
  await mkdir(repoPath);
  await git(repoPath, 'init', '-q');
  await writeFile(path.join(repoPath, 'app.js'), 'export const safe = true;\n');
  await git(repoPath, 'add', '.');
  await git(repoPath, 'commit', '-qm', 'synthetic authorized root identity');
  try {
    process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([root]);
    assert.equal((await workspaceSnapshot(repoPath)).root, await realpath(repoPath));
    const moved = root + '-moved';
    await (await import('node:fs/promises')).rename(root, moved);
    temporary.add(moved);
    await mkdir(root);
    await assert.rejects(resolveAuthorizedRoots(), /not authorized/i);
    await assert.rejects(workspaceSnapshot(path.join(moved, 'repo')), /not authorized/i);
  } finally { process.env.VIBESANE_ALLOWED_ROOTS_JSON = previous; }
});

test('MCP server rejects a configured root replaced after an authorized workspace request', async (t) => {
  const parent = await tempDir('agentshield-startup-root-');
  const allowed = path.join(parent, 'authorized');
  const original = path.join(parent, 'original');
  const replacement = path.join(parent, 'replacement');
  await mkdir(original);
  await mkdir(replacement);
  for (const [directory, label] of [[original, 'original'], [replacement, 'replacement']]) {
    const project = path.join(directory, 'repo');
    await mkdir(project);
    await git(project, 'init', '-q');
    await writeFile(path.join(project, 'app.js'), `export const label = ${JSON.stringify(label)};\n`);
    await git(project, 'add', '.');
    await git(project, 'commit', '-qm', `synthetic ${label} repository`);
  }
  await (await import('node:fs/promises')).rename(original, allowed);
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(scripts, 'agentshield-mcp-stdio.mjs')], cwd: path.resolve(scripts, '..'),
    env: { ...process.env, VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([allowed]),
      VIBESANE_JOB_STORE_DIR: path.join(parent, 'job-state') }, stderr: 'pipe' });
  const client = new Client({ name: 'authorization-test', version: '1' }, {
    versionNegotiation: { mode: { pin: '2026-07-28' }, probe: { timeoutMs: 3000 } },
  });
  t.after(async () => { await client.close().catch(() => {}); await transport.close().catch(() => {}); });
  await client.connect(transport, { timeout: 15_000 });
  const initial = await client.callTool({ name: 'scan_changed', arguments: { workspace: path.join(allowed, 'repo') } });
  assert.match(initial.content?.[0]?.text || '', /no_changed_files/i);
  const moved = path.join(parent, 'authorized-original');
  await (await import('node:fs/promises')).rename(allowed, moved);
  await (await import('node:fs/promises')).rename(replacement, allowed);

  const response = await client.callTool({ name: 'scan_changed', arguments: { workspace: path.join(allowed, 'repo') } });
  assert.equal(response.isError, true, JSON.stringify(response));
  assert.match(JSON.stringify(response), /not authorized/i);
});

test('deletion of a configured authorization root after server use fails closed', async () => {
  const previous = process.env.VIBESANE_ALLOWED_ROOTS_JSON;
  const root = await tempDir('agentshield-deleted-root-');
  const repoPath = path.join(root, 'repo');
  await mkdir(repoPath);
  await git(repoPath, 'init', '-q');
  await writeFile(path.join(repoPath, 'app.js'), 'export const safe = true;\n');
  await git(repoPath, 'add', '.');
  await git(repoPath, 'commit', '-qm', 'synthetic authorized root before deletion');
  try {
    process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([root]);
    assert.equal((await workspaceSnapshot(repoPath)).root, await realpath(repoPath));
    await rm(root, { recursive: true, force: true });
    await assert.rejects(resolveAuthorizedRoots(), /not authorized/i);
    await assert.rejects(workspaceSnapshot(repoPath), /not authorized/i);
  } finally { process.env.VIBESANE_ALLOWED_ROOTS_JSON = previous; }
});

test('authorized root contains nested repositories and Git worktrees but blocks outside and sibling-prefix paths', async () => {
  const parent = await tempDir('agentshield-root-');
  await git(parent, 'init', '-q');
  const allowed = path.join(parent, 'allowed');
  const sibling = path.join(parent, 'allowed-sibling');
  await mkdir(allowed);
  const nested = path.join(allowed, 'nested');
  await mkdir(nested);
  await git(nested, 'init', '-q');
  await writeFile(path.join(nested, 'x.js'), 'export const clean = true;\n');
  await git(nested, 'add', '.');
  await git(nested, 'commit', '-qm', 'nested baseline');
  const outside = await repo('agentshield-outside-');
  await mkdir(sibling);
  const siblingRepo = path.join(sibling, 'repo');
  await mkdir(siblingRepo);
  await git(siblingRepo, 'init', '-q');
  await writeFile(path.join(siblingRepo, 'x.js'), 'export {};\n');
  await git(siblingRepo, 'add', '.');
  await git(siblingRepo, 'commit', '-qm', 'sibling baseline');
  const worktree = path.join(allowed, 'linked-worktree');
  await git(nested, 'worktree', 'add', '-q', '-b', 'worktree-test', worktree);
  const previous = process.env.VIBESANE_ALLOWED_ROOTS_JSON;
  try {
    process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([allowed]);
    await assert.rejects(workspaceSnapshot(parent), /not authorized/i);
    assert.equal((await workspaceSnapshot(nested)).root, await realpath(nested));
    assert.equal((await workspaceSnapshot(path.join(allowed, 'nested', '..', 'nested'))).root, await realpath(nested));
    assert.equal((await workspaceSnapshot(worktree)).root, await realpath(worktree));
    await assert.rejects(workspaceSnapshot(outside), /not authorized/i);
    await assert.rejects(workspaceSnapshot(siblingRepo), /not authorized/i);
    const traversal = path.join(allowed, '..', path.basename(sibling), 'repo');
    await assert.rejects(workspaceSnapshot(traversal), /not authorized/i);
    const alias = path.join(allowed, 'outside-alias');
    await symlink(outside, alias);
    temporary.add(alias);
    await assert.rejects(workspaceSnapshot(alias), /not authorized/i);
  } finally { process.env.VIBESANE_ALLOWED_ROOTS_JSON = previous; }
});

test('every workspace MCP tool enforces authorization and baselines remain repository-bound', async () => {
  const parent = await tempDir('agentshield-mcp-allowed-');
  const firstRepo = path.join(parent, 'first');
  const secondRepo = path.join(parent, 'second');
  const outsideRepo = await repo('agentshield-mcp-outside-');
  await mkdir(firstRepo); await mkdir(secondRepo);
  for (const dir of [firstRepo, secondRepo]) {
    await git(dir, 'init', '-q');
    await writeFile(path.join(dir, 'app.js'), 'const JWT_SECRET = "' + 'A'.repeat(36) + '";\n');
    await git(dir, 'add', '.');
    await git(dir, 'commit', '-qm', 'synthetic baseline');
    await writeFile(path.join(dir, 'changed.js'), 'export const changed = true;\n');
  }
  const prior = process.env.VIBESANE_ALLOWED_ROOTS_JSON;
  try {
    delete process.env.VIBESANE_ALLOWED_ROOTS_JSON;
    const call = (name, args) => handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    for (const [name, args] of [
      ['scan_changed', { workspace: outsideRepo }],
      ['list_findings', { workspace: outsideRepo, scan_id: 'a'.repeat(16) }],
      ['verify_remediation', { workspace: outsideRepo, baseline_id: 'b'.repeat(16) }],
    ]) assert.equal((await call(name, args)).result.isError, true, `${name} must fail closed without root configuration`);
    const status = await call('status', {});
    assert.equal(status.result.isError, false);
    assert.match(status.result.content[0].text, /not_configured/);
    assert.equal((await call('explain_finding', { rule_id: 'hardcoded_secret' })).result.isError, false);
    process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([parent]);
    const baseline = await scanChanged({ workspace: firstRepo });
    assert.equal(baseline.status, 'complete');
    assert.equal((await listFindings(secondRepo, baseline.scanId)).status, 'baseline_not_found');
    assert.equal((await verifyRemediation(secondRepo, baseline.scanId)).status, 'no_baseline');
    process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([secondRepo]);
    await assert.rejects(listFindings(firstRepo, baseline.scanId), /not authorized/i);
    await assert.rejects(verifyRemediation(firstRepo, baseline.scanId), /not authorized/i);
    const blockedSwitch = await call('scan_changed', { workspace: firstRepo });
    assert.equal(blockedSwitch.result.isError, true);
  } finally { process.env.VIBESANE_ALLOWED_ROOTS_JSON = prior; }
});

test('outside-repository and nested-repository workspace paths fail closed', async () => {
  const outer = await repo();
  const nested = path.join(outer, 'nested');
  await mkdir(nested);
  await git(nested, 'init', '-q');
  await writeFile(path.join(nested, 'x.js'), 'const x = 1;\n');
  await git(nested, 'add', '.');
  await git(nested, 'commit', '-qm', 'nested baseline');
  await assert.rejects(callScan(outer), /regular file/);
  assert.equal((await callScan(nested)).status, 'no_changed_files');
});

test('symlink repository roots and changed symlink files are rejected', async () => {
  const dir = await repo();
  const rootAlias = path.join(path.dirname(dir), path.basename(dir) + '-alias');
  await symlink(dir, rootAlias);
  temporary.add(rootAlias);
  await assert.rejects(callScan(rootAlias), /not authorized/i);
  const outside = path.join(await tempDir('agentshield-outside-'), 'secret.js');
  await writeFile(outside, 'const token = "synthetic-outside-value";\n');
  await symlink(outside, path.join(dir, 'linked.js'));
  await assert.rejects(callScan(dir), /regular file/);
});

test('path traversal and malformed scanner coverage cannot become a clean result', () => {
  assert.equal(validateToolArguments('scan_changed', { workspace: 'relative/path' }), false);
  assert.throws(() => normalizeReport({ status: 'complete', filesScanned: 1, scannedPaths: ['../outside.js'], findings: [] }, ['../outside.js']));
  assert.throws(() => normalizeReport({ status: 'complete', filesScanned: 0, scannedPaths: [], findings: [] }, []));
  assert.throws(() => normalizeReport({ status: 'complete', filesScanned: 1, scannedPaths: ['app.js'], findings: [] }, ['missing.js']));
});

test('staged, unstaged and untracked files are included, including hidden source files', async () => {
  const dir = await repo();
  await writeFile(path.join(dir, 'staged.js'), 'export const x = 1;\n');
  await git(dir, 'add', 'staged.js');
  await writeFile(path.join(dir, 'app.js'), 'export const status = "changed";\n');
  await writeFile(path.join(dir, '.hidden.ts'), 'export const x = "hidden";\n');
  const result = await (await import('./agentshield-mcp-server.mjs')).workspaceSnapshot(dir);
  assert.deepEqual(result.candidatePaths, ['.hidden.ts', 'app.js', 'staged.js']);
});

test('zero changed files, unsupported files and ignored paths are never reported clean', async () => {
  const dir = await repo();
  assert.equal((await callScan(dir)).status, 'no_changed_files');
  await writeFile(path.join(dir, 'notes.md'), 'synthetic documentation\n');
  assert.equal((await callScan(dir)).status, 'partial_coverage');
  await rm(path.join(dir, 'notes.md'));
  await mkdir(path.join(dir, 'node_modules'));
  await writeFile(path.join(dir, 'node_modules', 'ignored.js'), 'const x = 1;\n');
  assert.equal((await callScan(dir)).status, 'partial_coverage');
});

test('empty and binary repositories expose no unsupported clean pass', async () => {
  const dir = await repo();
  await writeFile(path.join(dir, 'blob.bin'), Buffer.from([0, 1, 2, 3]));
  assert.equal((await callScan(dir)).status, 'partial_coverage');
});

test('deleted tracked files and bad base refs do not silently disappear', async () => {
  const dir = await repo();
  await rm(path.join(dir, 'app.js'));
  await assert.rejects(callScan(dir), /ENOENT|no such file/i);
  await writeFile(path.join(dir, 'app.js'), 'export const safe = true;\n');
  await assert.rejects(callScan(dir, '--upload-pack=malicious'), /Invalid base_ref/);
  await assert.rejects(callScan(dir, 'missing-ref'), /base_ref/i);
});

test('oversized files and excessive changed-file counts fail closed', async () => {
  const dir = await repo();
  await writeFile(path.join(dir, 'large.js'), 'x'.repeat(1_000_001));
  await assert.rejects(callScan(dir), /size budget/);
  await rm(path.join(dir, 'large.js'));
  for (let i = 0; i < 101; i++) await writeFile(path.join(dir, `f${i}.js`), 'export {};\n');
  await assert.rejects(callScan(dir), /Changed-file limit/);
});

test('scanner rejects reports that omit files, duplicate paths, leak excerpts or truncate findings', () => {
  const report = { status: 'complete', filesScanned: 1, scannedPaths: ['safe.js'], findings: [] };
  assert.throws(() => normalizeReport({ ...report, scannedPaths: ['safe.js', 'safe.js'], filesScanned: 2 }, ['safe.js']));
  assert.throws(() => normalizeReport({ ...report, findings: [{ filePath: '../outside', title: 'secret' }] }, ['safe.js']));
  const crowded = { ...report, findings: Array.from({ length: 51 }, () => ({ filePath: 'safe.js', severity: 'High', sourceExcerpt: 'SYNTHETIC_SECRET' })) };
  const normalized = normalizeReport(crowded, ['safe.js']);
  assert.equal(normalized.status, 'partial_coverage');
  assert.equal(normalized.findings.length, 50);
  assert.equal(JSON.stringify(normalized).includes('SYNTHETIC_SECRET'), false);
});

test('JSON-RPC rejects malformed envelopes and strict tool schemas reject extra input', () => {
  assert.equal(validateRpcMessage({ jsonrpc: '1.0', method: 'tools/list', id: 1 }), false);
  assert.equal(validateRpcMessage({ jsonrpc: '2.0', method: 'x'.repeat(201), id: 1 }), false);
  assert.equal(validateToolArguments('status', { surprise: true }), false);
  assert.equal(validateToolArguments('unknown', {}), false);
});

test('line framing handles fragmented requests and rejects oversized buffers', async () => {
  const { createLineDecoder } = await import('./agentshield-mcp-server.mjs');
  const decode = createLineDecoder();
  assert.deepEqual(decode('{"jsonrpc":"2.0",'), []);
  assert.deepEqual(decode('"id":1,"method":"tools/list"}\n'), ['{"jsonrpc":"2.0","id":1,"method":"tools/list"}']);
  assert.throws(() => decode('x'.repeat(1_000_001)), /budget/);
});

test('unsupported methods and invalid tool calls return protocol errors', async () => {
  const { handleMessage } = await import('./agentshield-mcp-server.mjs');
  const unsupported = await handleMessage({ jsonrpc: '2.0', id: 3, method: 'shutdown' });
  assert.equal(unsupported.error.code, -32601);
  const invalidTool = await handleMessage({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'status', arguments: { extra: true } } });
  assert.equal(invalidTool.result.isError, true);
});

test('pickle deserialization flags explicitly untrusted synthetic values but not ordinary local cache values', async () => {
  const { scanPythonFiles } = await import('./agentshield-python.mjs');
  const findings = scanPythonFiles([
    { path: 'unsafe.py', content: 'obj = pickle.loads(untrusted_data)\n' },
    { path: 'cache.py', content: 'obj = pickle.loads(cache_bytes)\n' },
  ]);
  assert.deepEqual(findings.map((finding) => finding.filePath), ['unsafe.py']);
  assert.equal(findings[0].check, 'python_unsafe_deserialization');
});

test('base64-encoded synthetic JWT signing material is detected without echoing the value', async () => {
  const dir = await repo();
  const encoded = Buffer.from('synthetic-encoded-jwt-secret-value').toString('base64');
  const file = path.join(dir, 'encoded.ts');
  await writeFile(file, `const JWT_SECRET = Buffer.from("${encoded}", "base64").toString();\n`);
  let output = '';
  const originalWrite = process.stdout.write;
  process.stdout.write = function capture(chunk) { output += String(chunk); return true; };
  try { await scanFile(['scan', '--file', file, '--cwd', dir, '--format', 'json']); }
  finally { process.stdout.write = originalWrite; }
  const report = JSON.parse(output);
  assert.equal(report.findings.some((finding) => finding.ruleId === 'hardcoded_jwt_secret'), true);
  assert.equal(output.includes(encoded), false);
});
