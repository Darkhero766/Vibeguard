import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const run = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const artifact = path.resolve(scriptsDir, '..');
const cli = path.join(artifact, 'dist/agentshield.mjs');
const hook = path.join(scriptsDir, 'agentshield-hook.mjs');
const installer = path.join(scriptsDir, 'agentshield-install.mjs');
const stopHook = path.join(scriptsDir, 'agentshield-stop.mjs');

async function spawnWithInput(executable, args, input = '', env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env });
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
  await run('git', ['-C', cwd, 'branch', '-M', 'main']);
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


test('Claude Code Stop hook enforces blockers then allows a complete clean rescan', async (t) => {
  const secret = 'S'.repeat(38);
  const { cwd, target } = await fixture(t, 'src/auth.ts', 'const MY_API_TOKEN = "' + secret + '";\n');
  const controlHome = await mkdtemp(path.join(os.tmpdir(), 'agentshield-stop-control-'));
  const stateHome = path.join(controlHome, 'state');
  t.after(async () => { await rm(controlHome, { recursive: true, force: true }); });

  const rootHash = createHash('sha256').update(cwd).digest('hex').slice(0, 28);
  await writeFile(path.join(controlHome, rootHash + '.json'), JSON.stringify({
    completionGate: 'enforce',
    mode: 'assist',
    blockingSeverity: 'High',
  }));

  const env = {
    ...process.env,
    VIBESANE_AGENTSHIELD_CONFIG_HOME: controlHome,
    VIBESANE_AGENTSHIELD_STATE_HOME: stateHome,
  };
  const event = { hook_event_name: 'Stop', cwd, session_id: 'agentshield-enforce-test' };
  const blocked = await spawnWithInput(process.execPath, [stopHook], JSON.stringify(event), env);
  assert.equal(blocked.code, 0);
  const blockPayload = JSON.parse(blocked.stdout);
  assert.equal(blockPayload.decision, 'block');
  assert.match(blockPayload.reason, /ENFORCEMENT/);

  await writeFile(target, 'export const apiTokenIsLoadedFromServerConfig = true;\n');
  const cleared = await spawnWithInput(process.execPath, [stopHook], JSON.stringify(event), env);
  assert.equal(cleared.code, 0);
  assert.equal(cleared.stdout.trim(), '');
});


test('Claude Code Stop hook blocks enforce mode when there are no changed files to scan', async (t) => {
  const { cwd } = await fixture(t, 'src/index.js', 'export const baseline = true;\n');
  await run('git', ['-C', cwd, 'add', '.']);
  await run('git', ['-C', cwd, '-c', 'user.name=AgentShield Test', '-c',
    'user.email=agentshield-test@example.invalid', 'commit', '-qm', 'synthetic clean baseline']);

  const controlHome = await mkdtemp(path.join(os.tmpdir(), 'agentshield-empty-control-'));
  t.after(async () => { await rm(controlHome, { recursive: true, force: true }); });
  const rootHash = createHash('sha256').update(cwd).digest('hex').slice(0, 28);
  await writeFile(path.join(controlHome, rootHash + '.json'), JSON.stringify({
    completionGate: 'enforce', mode: 'assist', enabled: true,
  }));
  const env = {
    ...process.env,
    VIBESANE_AGENTSHIELD_CONFIG_HOME: controlHome,
    VIBESANE_AGENTSHIELD_STATE_HOME: path.join(controlHome, 'state'),
  };
  const result = await spawnWithInput(process.execPath, [stopHook],
    JSON.stringify({ hook_event_name: 'Stop', cwd, session_id: 'empty-worktree-test' }), env);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, 'block');
  assert.match(payload.reason, /no Git-visible changed files/i);
});

test('Claude Code Stop hook blocks if enforcement is enabled but scanner is disabled', async (t) => {
  const { cwd } = await fixture(t, 'src/index.js', 'export const changed = true;\n');
  const controlHome = await mkdtemp(path.join(os.tmpdir(), 'agentshield-disabled-control-'));
  t.after(async () => { await rm(controlHome, { recursive: true, force: true }); });
  const rootHash = createHash('sha256').update(cwd).digest('hex').slice(0, 28);
  await writeFile(path.join(controlHome, rootHash + '.json'), JSON.stringify({
    completionGate: 'enforce', enabled: false,
  }));
  const env = {
    ...process.env,
    VIBESANE_AGENTSHIELD_CONFIG_HOME: controlHome,
    VIBESANE_AGENTSHIELD_STATE_HOME: path.join(controlHome, 'state'),
  };
  const result = await spawnWithInput(process.execPath, [stopHook],
    JSON.stringify({ hook_event_name: 'Stop', cwd, session_id: 'disabled-scanner-test' }), env);
  assert.equal(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decision, 'block');
  assert.match(payload.reason, /scanner is disabled/i);
});


async function commitFixture(cwd, message) {
  await run('git', ['-C', cwd, 'add', '-A']);
  await run('git', ['-C', cwd, '-c', 'user.name=AgentShield Test', '-c',
    'user.email=agentshield-test@example.invalid', 'commit', '-qm', message]);
}

test('base-ref scan detects committed changes even when the worktree is clean', async (t) => {
  const { cwd, target } = await fixture(t, 'src/auth.ts', 'export const safe = true;\n');
  await commitFixture(cwd, 'synthetic base');
  const secret = 'K'.repeat(40);
  await writeFile(target, 'const MY_API_TOKEN = "' + secret + '";\n');
  await commitFixture(cwd, 'synthetic committed credential');
  const result = await scan(cwd, ['--changed', '--base-ref', 'main']);
  assert.equal(result.code, 1);
  assert.equal(result.report.status, 'complete');
  assert.equal(result.report.baseRef.length, 40);
  assert.deepEqual(result.report.scannedPaths, ['src/auth.ts']);
  assert.ok(result.report.findings.some(f => f.severity === 'High'));
  assert.ok(!result.stdout.includes(secret));

  await writeFile(target, 'export const apiTokenIsLoadedFromServerConfig = true;\n');
  await commitFixture(cwd, 'synthetic remediation');
  const clean = await scan(cwd, ['--changed', '--base-ref', 'main']);
  assert.equal(clean.code, 0);
  assert.equal(clean.report.status, 'complete');
  assert.deepEqual(clean.report.scannedPaths, ['src/auth.ts']);
  assert.equal(clean.report.findings.length, 0);
});

test('base-ref scan follows a committed rename and scans the destination path', async (t) => {
  const { cwd, target } = await fixture(t, 'src/old.js', 'export const value = true;\n');
  await commitFixture(cwd, 'synthetic base');
  const renamed = path.join(cwd, 'src', 'renamed.js');
  await run('git', ['-C', cwd, 'mv', target, renamed]);
  await commitFixture(cwd, 'synthetic rename');
  const result = await scan(cwd, ['--changed', '--base-ref', 'main']);
  assert.equal(result.code, 0);
  assert.equal(result.report.status, 'complete');
  assert.deepEqual(result.report.scannedPaths, ['src/renamed.js']);
});

test('base-ref scan treats committed deletions and missing refs as incomplete', async (t) => {
  const { cwd, target } = await fixture(t, 'src/deleted.js', 'export const value = true;\n');
  await commitFixture(cwd, 'synthetic base');
  await run('git', ['-C', cwd, 'rm', '-q', target]);
  await commitFixture(cwd, 'synthetic deletion');
  const deleted = await scan(cwd, ['--changed', '--base-ref', 'main']);
  assert.equal(deleted.code, 2);
  assert.equal(deleted.report.status, 'scan_incomplete');
  assert.deepEqual(deleted.report.missingChangedPaths, ['src/deleted.js']);

  const missingBase = await scan(cwd, ['--changed', '--base-ref', 'origin/not-fetched']);
  assert.equal(missingBase.code, 2);
  assert.equal(missingBase.report.status, 'error');
});
