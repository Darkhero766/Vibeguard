import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const artifact = path.resolve(scriptsDir, '..');
const cli = path.join(artifact, 'dist/agentshield.mjs');
const hook = path.join(scriptsDir, 'agentshield-hook.mjs');
const installer = path.join(scriptsDir, 'agentshield-install.mjs');

async function spawnWithInput(executable, args, input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (s) => { stdout += s; });
    child.stderr.setEncoding('utf8'); child.stderr.on('data', (s) => { stderr += s; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function fixture(t, name, source) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'vibesane-agent-test-'));
  t.after(async () => { await rm(cwd, { recursive: true, force: true }); });
  await run('git', ['init', '-q', cwd]);
  const target = path.join(cwd, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
  return { cwd, target };
}
async function scan(cwd, args = ['--changed']) {
  const result = await spawnWithInput(process.execPath, [cli, 'scan', ...args, '--cwd', cwd, '--format', 'json']);
  return { ...result, report: JSON.parse(result.stdout) };
}

test('hardcoded test credential is detected without echoing its value', async (t) => {
  const fake = 'Z'.repeat(35);
  const { cwd } = await fixture(t, 'src/auth.ts', 'const JWT_SECRET = "' + fake + '";\n');
  const result = await scan(cwd);
  assert.equal(result.code, 1);
  assert.ok(result.report.findings.some((f) => f.ruleId === 'hardcoded_jwt_secret'));
  assert.ok(!result.stdout.includes(fake));
});

test('interpolated SQL query is flagged as a potential injection risk', async (t) => {
  const tick = String.fromCharCode(96);
  const sql = 'db.query(' + tick + 'SELECT * FROM users WHERE id = ' + '$' + '{userId}' + tick + ');\n';
  const { cwd } = await fixture(t, 'src/db.ts', sql);
  const result = await scan(cwd);
  assert.equal(result.code, 1);
  assert.ok(result.report.findings.some((f) => f.ruleId === 'unsafe_sql_template'));
});

test('missing auth before an API database write is detected', async (t) => {
  const source = "export async function POST() { return supabase.from('orders').insert({ total: 1 }); }\n";
  const { cwd } = await fixture(t, 'app/api/orders/route.ts', source);
  const result = await scan(cwd);
  assert.equal(result.code, 1);
  assert.ok(result.report.findings.some((f) => f.ruleId === 'unauthenticated_write'));
});

test('clean JavaScript returns a completed scan with no findings', async (t) => {
  const { cwd } = await fixture(t, 'src/math.js', 'export const sum = (a, b) => a + b;\n');
  const result = await scan(cwd);
  assert.equal(result.code, 0);
  assert.equal(result.report.status, 'complete');
  assert.equal(result.report.filesScanned, 1);
  assert.equal(result.report.findings.length, 0);
});

test('invalid Git working directory reports an error, never a clean scan', async () => {
  const result = await scan('/definitely/no/such/project/agentshield');
  assert.equal(result.code, 2);
  assert.equal(result.report.status, 'error');
});

test('oversized source returns incomplete scan status', async (t) => {
  const { cwd } = await fixture(t, 'src/huge.js', 'x'.repeat(1_000_001));
  const result = await scan(cwd);
  assert.equal(result.code, 2);
  assert.equal(result.report.status, 'error');
});

test('Claude Code PostToolUse hook injects security findings', async (t) => {
  const { cwd, target } = await fixture(t, 'src/auth.ts', 'const JWT_SECRET = "' + 'W'.repeat(35) + '";\n');
  const event = { hook_event_name: 'PostToolUse', tool_name: 'Write', cwd, tool_input: { file_path: target } };
  const result = await spawnWithInput(process.execPath, [hook], JSON.stringify(event));
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(payload.hookSpecificOutput.additionalContext, /hardcoded_jwt_secret/);
});

test('Claude Code hook reports scan failures as unknown', async (t) => {
  const { cwd, target } = await fixture(t, 'src/auth.ts', 'export const value = 1;\n');
  const event = { hook_event_name: 'PostToolUse', tool_name: 'Write', cwd: cwd + '/missing', tool_input: { file_path: target } };
  const result = await spawnWithInput(process.execPath, [hook], JSON.stringify(event));
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.hookSpecificOutput.additionalContext, /unknown/i);
});

test('hook installer preserves existing config and uninstalls reversibly', async (t) => {
  const { cwd } = await fixture(t, 'src/math.js', 'export const n = 1;\n');
  await mkdir(path.join(cwd, '.claude'), { recursive: true });
  const settingsPath = path.join(cwd, '.claude/settings.json');
  const original = { permissions: { allow: ['Read'] }, hooks: { Notification: [{ matcher: '', hooks: [{ type: 'command', command: 'echo existing' }] }] } };
  await writeFile(settingsPath, JSON.stringify(original));
  await run(process.execPath, [installer, 'install', cwd]);
  const installed = JSON.parse(await readFile(settingsPath, 'utf8'));
  assert.equal(installed.permissions.allow[0], 'Read');
  assert.ok(installed.hooks.PostToolUse.length > 0);
  await run(process.execPath, [installer, 'uninstall', cwd]);
  const removed = JSON.parse(await readFile(settingsPath, 'utf8'));
  assert.deepEqual(removed, original);
});
