import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeReport, scanChanged, validateRpcMessage, validateToolArguments,
} from './agentshield-mcp-server.mjs';
import { main as scanFile } from '../dist/agentshield.mjs';

const exec = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const temporary = new Set();

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
  await assert.rejects(callScan(rootAlias), /non-symlink directory/);
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
