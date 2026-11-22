import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
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
const codexStopHook = path.join(scriptsDir, 'agentshield-codex-stop.mjs');
const vibesaneEntry = path.join(scriptsDir, 'vibesane.mjs');

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

test('JWT detector handles typed declarations and object properties but ignores comments and placeholders', async (t) => {
  const source = [
    'const jwtSecret: string = "' + 'A'.repeat(36) + '";',
    'const config = { JWT_SIGNING_KEY: "' + 'B'.repeat(36) + '" };',
    '// const JWT_SECRET = "' + 'C'.repeat(36) + '";',
    'const example = { JWT_SECRET: "replace_me_with_a_real_key" };',
    'const runtimeSecret = process.env.JWT_SECRET;',
    'const message = "JWT_SECRET: ' + String.fromCharCode(92) + '"' + 'D'.repeat(36) + String.fromCharCode(92) + '"";',
  ].join('\n') + '\n';
  const { cwd } = await fixture(t, 'src/auth.ts', source);
  const result = await scan(cwd);
  assert.equal(result.code, 1);
  const jwtFindings = result.report.findings.filter((f) => f.ruleId === 'hardcoded_jwt_secret');
  assert.equal(jwtFindings.length, 2);
  assert.deepEqual(jwtFindings.map((f) => f.line), [1, 2]);
  assert.ok(!result.stdout.includes('A'.repeat(36)));
  assert.ok(!result.stdout.includes('B'.repeat(36)));
  assert.ok(!result.stdout.includes('C'.repeat(36)));
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

test('CLI reports partial coverage when ignored directories change alongside supported source', async (t) => {
  const { cwd } = await fixture(t, 'src/app.js', 'export const reviewed = true;\n');
  await mkdir(path.join(cwd, 'vendor'), { recursive: true });
  await writeFile(path.join(cwd, 'vendor', 'generated.js'), 'export const ignored = true;\n');
  const result = await scan(cwd);
  assert.equal(result.code, 2);
  assert.equal(result.report.status, 'partial_coverage');
  assert.equal(result.report.filesScanned, 1);
  assert.deepEqual(result.report.ignoredChangedPaths, ['vendor/generated.js']);
  assert.equal(result.report.ignoredChangedFileCount, 1);
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
  await run('git', ['-C', cwd, 'branch', 'agentshield-base']);
  const secret = 'K'.repeat(40);
  await writeFile(target, 'const MY_API_TOKEN = "' + secret + '";\n');
  await commitFixture(cwd, 'synthetic committed credential');
  const result = await scan(cwd, ['--changed', '--base-ref', 'agentshield-base']);
  assert.equal(result.code, 1);
  assert.equal(result.report.status, 'complete');
  assert.equal(result.report.baseRef.length, 40);
  assert.deepEqual(result.report.scannedPaths, ['src/auth.ts']);
  assert.ok(result.report.findings.some(f => f.severity === 'High'));
  assert.ok(!result.stdout.includes(secret));

  await writeFile(target, 'export const apiTokenIsLoadedFromServerConfig = true;\n');
  await commitFixture(cwd, 'synthetic remediation');
  const clean = await scan(cwd, ['--changed', '--base-ref', 'agentshield-base']);
  assert.equal(clean.code, 0);
  assert.equal(clean.report.status, 'complete');
  assert.deepEqual(clean.report.scannedPaths, ['src/auth.ts']);
  assert.equal(clean.report.findings.length, 0);
});

test('base-ref scan follows a committed rename and scans the destination path', async (t) => {
  const { cwd, target } = await fixture(t, 'src/old.js', 'export const value = true;\n');
  await commitFixture(cwd, 'synthetic base');
  await run('git', ['-C', cwd, 'branch', 'agentshield-base']);
  const renamed = path.join(cwd, 'src', 'renamed.js');
  await run('git', ['-C', cwd, 'mv', target, renamed]);
  await commitFixture(cwd, 'synthetic rename');
  const result = await scan(cwd, ['--changed', '--base-ref', 'agentshield-base']);
  assert.equal(result.code, 0);
  assert.equal(result.report.status, 'complete');
  assert.deepEqual(result.report.scannedPaths, ['src/renamed.js']);
});

test('base-ref scan treats committed deletions and missing refs as incomplete', async (t) => {
  const { cwd, target } = await fixture(t, 'src/deleted.js', 'export const value = true;\n');
  await commitFixture(cwd, 'synthetic base');
  await run('git', ['-C', cwd, 'branch', 'agentshield-base']);
  await run('git', ['-C', cwd, 'rm', '-q', target]);
  await commitFixture(cwd, 'synthetic deletion');
  const deleted = await scan(cwd, ['--changed', '--base-ref', 'agentshield-base']);
  assert.equal(deleted.code, 2);
  assert.equal(deleted.report.status, 'scan_incomplete');
  assert.deepEqual(deleted.report.missingChangedPaths, ['src/deleted.js']);

  const missingBase = await scan(cwd, ['--changed', '--base-ref', 'origin/not-fetched']);
  assert.equal(missingBase.code, 2);
  assert.equal(missingBase.report.status, 'error');
});


test('Claude Code Stop hook enforces commit-aware base-to-HEAD scope', async (t) => {
  const { cwd, target } = await fixture(t, 'src/auth.ts', 'export const safe = true;\n');
  await commitFixture(cwd, 'synthetic base');
  await run('git', ['-C', cwd, 'branch', 'agentshield-base']);
  const token = 'P'.repeat(40);
  await writeFile(target, 'const MY_API_TOKEN = "' + token + '";\n');
  await commitFixture(cwd, 'synthetic committed blocker');

  const controlHome = await mkdtemp(path.join(os.tmpdir(), 'agentshield-committed-control-'));
  t.after(async () => { await rm(controlHome, { recursive: true, force: true }); });
  const rootHash = createHash('sha256').update(cwd).digest('hex').slice(0, 28);
  await writeFile(path.join(controlHome, rootHash + '.json'), JSON.stringify({
    completionGate: 'enforce', mode: 'assist', baseRef: 'agentshield-base', blockingSeverity: 'High',
  }));
  const env = {
    ...process.env,
    VIBESANE_AGENTSHIELD_CONFIG_HOME: controlHome,
    VIBESANE_AGENTSHIELD_STATE_HOME: path.join(controlHome, 'state'),
  };
  const event = { hook_event_name: 'Stop', cwd, session_id: 'committed-diff-enforcement-test' };
  const blocked = await spawnWithInput(process.execPath, [stopHook], JSON.stringify(event), env);
  assert.equal(blocked.code, 0);
  assert.equal(JSON.parse(blocked.stdout).decision, 'block');

  await writeFile(target, 'export const apiTokenIsLoadedFromServerConfig = true;\n');
  await commitFixture(cwd, 'synthetic committed remediation');
  const cleared = await spawnWithInput(process.execPath, [stopHook], JSON.stringify(event), env);
  assert.equal(cleared.code, 0);
  assert.equal(cleared.stdout.trim(), '');
});


test('CLI refuses a changed-file symlink instead of following it', async (t) => {
  const { cwd } = await fixture(t, 'src/placeholder.js', 'export const safe = true;\n');
  const outside = path.join(os.tmpdir(), 'agentshield-cli-outside-' + process.pid + '.js');
  t.after(async () => { await rm(outside, { force: true }); });
  await writeFile(outside, 'const MY_API_TOKEN = "' + 'X'.repeat(40) + '";\n');
  await symlink(outside, path.join(cwd, 'src', 'linked.js'));
  const result = await scan(cwd);
  assert.equal(result.code, 2);
  assert.equal(result.report.status, 'scan_incomplete');
  assert.deepEqual(result.report.unsafeChangedPaths, ['src/linked.js']);
  assert.ok(!result.stdout.includes('X'.repeat(40)));
});


test('Codex Stop hook blocks committed findings and permits a clean remediation commit', async (t) => {
  const { cwd, target } = await fixture(t, 'src/auth.ts', 'export const safe = true;\n');
  await commitFixture(cwd, 'synthetic base');
  await run('git', ['-C', cwd, 'branch', 'agentshield-base']);
  const secret = 'C'.repeat(40);
  await writeFile(target, 'const MY_API_TOKEN = "' + secret + '";\n');
  await commitFixture(cwd, 'synthetic committed blocker');

  const controlHome = await mkdtemp(path.join(os.tmpdir(), 'agentshield-codex-control-'));
  t.after(async () => { await rm(controlHome, { recursive: true, force: true }); });
  const rootHash = createHash('sha256').update(cwd).digest('hex').slice(0, 28);
  await writeFile(path.join(controlHome, rootHash + '.json'), JSON.stringify({
    completionGate: 'enforce', mode: 'assist', baseRef: 'agentshield-base', blockingSeverity: 'High',
  }));
  const env = {
    ...process.env,
    VIBESANE_AGENTSHIELD_CONFIG_HOME: controlHome,
    VIBESANE_AGENTSHIELD_STATE_HOME: path.join(controlHome, 'state'),
  };
  const event = { hook_event_name: 'Stop', cwd, session_id: 'codex-agentshield-test',
    turn_id: 'turn-1', permission_mode: 'default' };
  const blocked = await spawnWithInput(process.execPath, [codexStopHook], JSON.stringify(event), env);
  assert.equal(blocked.code, 0);
  const payload = JSON.parse(blocked.stdout);
  assert.equal(payload.decision, 'block');
  assert.match(payload.reason, /ENFORCEMENT/);

  await writeFile(target, 'export const apiTokenIsLoadedFromServerConfig = true;\n');
  await commitFixture(cwd, 'synthetic committed remediation');
  const cleared = await spawnWithInput(process.execPath, [codexStopHook], JSON.stringify(event), env);
  assert.equal(cleared.code, 0);
  assert.equal(cleared.stdout.trim(), '');
});

test('Codex installer preserves existing hooks, installs idempotently, and uninstalls only its own entry', async (t) => {
  const { cwd } = await fixture(t, 'src/index.js', 'export const value = 1;\n');
  const codexDir = path.join(cwd, '.codex');
  await mkdir(codexDir, { recursive: true });
  const hooksFile = path.join(codexDir, 'hooks.json');
  const original = {
    description: 'Existing project hooks',
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: 'node existing-start.mjs' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'node existing-stop.mjs', timeout: 12 }] }],
    },
  };
  await writeFile(hooksFile, JSON.stringify(original));

  const first = await run(process.execPath, [vibesaneEntry, 'init-codex', '--cwd', cwd]);
  assert.match(first.stdout, /Review and trust the hook with \/hooks/);
  const installed = JSON.parse(await readFile(hooksFile, 'utf8'));
  assert.equal(installed.description, original.description);
  assert.deepEqual(installed.hooks.SessionStart, original.hooks.SessionStart);
  assert.ok(installed.hooks.Stop.some(entry => entry.hooks.some(item => item.command === 'node existing-stop.mjs')));
  const managed = installed.hooks.Stop.flatMap(entry => entry.hooks)
    .filter(item => item.command?.includes('agentshield-codex-stop.mjs'));
  assert.equal(managed.length, 1);
  assert.equal(managed[0].timeout, 30);
  assert.ok(await readFile(path.join(cwd, '.agents/skills/vibesane-agentshield/SKILL.md'), 'utf8'));

  await run(process.execPath, [vibesaneEntry, 'init-codex', '--cwd', cwd]);
  const repeated = JSON.parse(await readFile(hooksFile, 'utf8'));
  assert.equal(repeated.hooks.Stop.flatMap(entry => entry.hooks)
    .filter(item => item.command?.includes('agentshield-codex-stop.mjs')).length, 1);

  await run(process.execPath, [vibesaneEntry, 'uninstall-codex', '--cwd', cwd]);
  const removed = JSON.parse(await readFile(hooksFile, 'utf8'));
  assert.deepEqual(removed.hooks.SessionStart, original.hooks.SessionStart);
  assert.ok(removed.hooks.Stop.flatMap(entry => entry.hooks)
    .some(item => item.command === 'node existing-stop.mjs'));
  assert.equal(removed.hooks.Stop.flatMap(entry => entry.hooks)
    .some(item => item.command?.includes('agentshield-codex-stop.mjs')), false);
  await assert.rejects(readFile(path.join(cwd, '.agents/skills/vibesane-agentshield/SKILL.md')));
});

test('Codex installer refuses to overwrite a customized skill or malformed hooks config', async (t) => {
  const { cwd } = await fixture(t, 'src/index.js', 'export const value = 1;\n');
  const skillDir = path.join(cwd, '.agents/skills/vibesane-agentshield');
  await mkdir(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, 'SKILL.md');
  await writeFile(skillPath, '# User-customized skill\n');
  const hooksFile = path.join(cwd, '.codex/hooks.json');
  await mkdir(path.dirname(hooksFile), { recursive: true });
  await writeFile(hooksFile, JSON.stringify({ hooks: { Stop: 'not-an-array' } }));
  const result = await spawnWithInput(process.execPath,
    [vibesaneEntry, 'init-codex', '--cwd', cwd], '');
  assert.equal(result.code, 2);
  assert.equal(await readFile(skillPath, 'utf8'), '# User-customized skill\n');
  assert.equal(JSON.parse(await readFile(hooksFile, 'utf8')).hooks.Stop, 'not-an-array');
});
