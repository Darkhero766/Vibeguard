import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, unlink, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { snapshot, finalGate } from './agentshield-gate.mjs';
import { parseConfig, completionGateDecision } from './agentshield-policy.mjs';

const exec = promisify(execFile);
async function repoFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-gate-test-'));
  await exec('git', ['init', '-q', root]);
  await exec('git', ['-C', root, 'branch', '-M', 'main']);
  await exec('git', ['-C', root, 'config', 'user.name', 'AgentShield Test']);
  await exec('git', ['-C', root, 'config', 'user.email', 'agentshield-test@example.invalid']);
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src', 'app.js'), 'export const safe = true;\n');
  await writeFile(path.join(root, 'README.md'), '# baseline\n');
  await exec('git', ['-C', root, 'add', '.']);
  await exec('git', ['-C', root, 'commit', '-qm', 'fixture']);
  return root;
}

test('final gate refuses mixed supported and unsupported changed files', async (t) => {
  const root = await repoFixture();
  try {
    await writeFile(path.join(root, 'src', 'app.js'), 'export const safe = false;\n');
    await writeFile(path.join(root, 'README.md'), '# changed\n');
    const state = await snapshot(root);
    assert.deepEqual(state.changedPaths, ['src/app.js']);
    assert.deepEqual(state.unsupportedChangedPaths, ['README.md']);
    let scannerCalled = false;
    const result = await finalGate(root, { blockingSeverity: 'High' }, async () => {
      scannerCalled = true;
      return { status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js'], findings: [] };
    });
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(scannerCalled, false);
    assert.equal(result.securityGuarantee, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('final gate rejects scanner-reported incomplete status even when file counts match', async () => {
  const root = await repoFixture();
  try {
    await writeFile(path.join(root, 'src', 'app.js'), 'export const safe = false;\n');
    const result = await finalGate(root, { blockingSeverity: 'High' }, async () => ({
      status: 'scan_incomplete',
      filesScanned: 1,
      scannedPaths: ['src/app.js'],
      findings: [],
    }));
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(result.blocking, 0);
    assert.equal(result.securityGuarantee, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('final gate fails closed when a changed supported file was deleted', async () => {
  const root = await repoFixture();
  try {
    await unlink(path.join(root, 'src', 'app.js'));
    const result = await finalGate(root, { blockingSeverity: 'High' }, async () => ({
      status: 'complete', filesScanned: 0, scannedPaths: [], findings: [],
    }));
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(result.securityGuarantee, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('final gate refuses symlinked changed paths before scanner execution', async () => {
  const root = await repoFixture();
  const outside = path.join(os.tmpdir(), 'agentshield-gate-outside-' + process.pid + '.js');
  try {
    await writeFile(outside, 'export const external = true;\n');
    await symlink(outside, path.join(root, 'src', 'linked.js'));
    const state = await snapshot(root);
    assert.deepEqual(state.unsafeChangedPaths, ['src/linked.js']);
    let called = false;
    const result = await finalGate(root, { blockingSeverity: 'High' }, async () => {
      called = true;
      return { status: 'complete', filesScanned: 1, scannedPaths: ['src/linked.js'], findings: [] };
    });
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(called, false);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { force: true });
  }
});

test('final gate rejects an invalid blocking threshold instead of silently allowing', async () => {
  const root = await repoFixture();
  try {
    await writeFile(path.join(root, 'src', 'app.js'), 'export const changed = true;\n');
    const result = await finalGate(root, { blockingSeverity: 'Bogus' }, async () => ({
      status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js'], findings: [],
    }));
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(result.securityGuarantee, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('final gate rejects duplicated scan paths even when the numeric file count matches', async () => {
  const root = await repoFixture();
  try {
    await writeFile(path.join(root, 'src', 'app.js'), 'export const changed = true;\n');
    const result = await finalGate(root, { blockingSeverity: 'High' }, async () => ({
      status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js', 'src/app.js'], findings: [],
    }));
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(result.securityGuarantee, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('final gate rejects findings outside the reported scan path set', async () => {
  const root = await repoFixture();
  try {
    await writeFile(path.join(root, 'src', 'app.js'), 'export const changed = true;\n');
    const result = await finalGate(root, { blockingSeverity: 'High' }, async () => ({
      status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js'],
      findings: [{ filePath: 'README.md', ruleId: 'synthetic_rule', severity: 'Critical', line: 1 }],
    }));
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(result.securityGuarantee, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('final gate counts valid blocking findings at the configured threshold', async () => {
  const root = await repoFixture();
  try {
    await writeFile(path.join(root, 'src', 'app.js'), 'export const changed = true;\n');
    const result = await finalGate(root, { blockingSeverity: 'High' }, async () => ({
      status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js'],
      findings: [{ filePath: 'src/app.js', ruleId: 'synthetic_blocker', severity: 'Critical', line: 1, title: 'Synthetic blocker' }],
    }));
    assert.equal(result.status, 'complete');
    assert.equal(result.blocking, 1);
    assert.equal(result.securityGuarantee, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('final gate rejects a worktree mutation during scanning', async () => {
  const root = await repoFixture();
  try {
    await writeFile(path.join(root, 'src', 'app.js'), 'export const before = true;\n');
    const result = await finalGate(root, { blockingSeverity: 'High' }, async () => {
      await writeFile(path.join(root, 'src', 'app.js'), 'export const raced = true;\n');
      return { status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js'], findings: [] };
    });
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(result.securityGuarantee, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('completion enforcement blocks incomplete and unknown scans', () => {
  const config = parseConfig({ completionGate: 'enforce' });
  const result = completionGateDecision({ status: 'scan_incomplete', config, completionGate: config.completionGate });
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /UNKNOWN/);
});

test('completion enforcement blocks blockers even after auto-fix continuation suppression', () => {
  const config = parseConfig({ completionGate: 'enforce', mode: 'auto-fix' });
  const result = completionGateDecision({ blocking: 1, blockingSeverity: config.blockingSeverity,
    completionGate: config.completionGate, mode: config.mode, repeatedGate: true, alreadyRequested: true });
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /1 blocking finding/);
});

test('advisory completion mode does not silently claim a clean pass', () => {
  const config = parseConfig({ completionGate: 'advisory' });
  const result = completionGateDecision({ blocking: 1, completionGate: config.completionGate, config });
  assert.ok(result.systemMessage.includes('Advisory mode'));
  assert.equal(result.decision, undefined);
});

test('completion policy rejects unknown modes and accepts the explicit enforce setting', () => {
  assert.equal(parseConfig({ completionGate: 'enforce' }).completionGate, 'enforce');
  assert.throws(() => parseConfig({ completionGate: 'always' }), /completionGate/);
});

test('completion enforcement blocks when previously flagged files are not covered', () => {
  const config = parseConfig({ completionGate: 'enforce' });
  const result = completionGateDecision({ completionGate: config.completionGate, unscannedCount: 1 });
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /PARTIAL/);
});

test('completion enforcement blocks when no changed-file evidence exists', () => {
  const config = parseConfig({ completionGate: 'enforce' });
  const result = completionGateDecision({ status: 'no_changed_files', completionGate: config.completionGate });
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /No security scan/);
});

test('advisory mode reports no changed files without claiming a pass', () => {
  const config = parseConfig({ completionGate: 'advisory' });
  const result = completionGateDecision({ status: 'no_changed_files', completionGate: config.completionGate });
  assert.ok(result.systemMessage.includes('No security scan'));
  assert.equal(result.decision, undefined);
});


test('final gate includes committed base diff and uncommitted worktree changes', async () => {
  const root = await repoFixture();
  try {
    await exec('git', ['-C', root, 'branch', 'agentshield-base']);
    await writeFile(path.join(root, 'src', 'app.js'), 'export const safe = false;\n');
    await exec('git', ['-C', root, 'add', '-A']);
    await exec('git', ['-C', root, 'commit', '-qm', 'committed source change']);
    await writeFile(path.join(root, 'src', 'new.ts'), 'export const uncommitted = true;\n');

    const state = await snapshot(root, { baseRef: 'agentshield-base' });
    assert.deepEqual(state.changedPaths, ['src/app.js', 'src/new.ts']);
    assert.equal(state.baseCommit.length, 40);

    let receivedArgs;
    const result = await finalGate(root, { blockingSeverity: 'High', completionGate: 'enforce', baseRef: 'agentshield-base' }, async (_root, args) => {
      receivedArgs = args;
      return {
        status: 'complete',
        filesScanned: 2,
        scannedPaths: ['src/app.js', 'src/new.ts'],
        findings: [],
      };
    });
    assert.equal(result.status, 'complete');
    assert.deepEqual(receivedArgs.slice(0, 1), ['--changed']);
    assert.deepEqual(receivedArgs.slice(1, 3), ['--base-ref', state.baseCommit]);
    assert.equal(result.baseRef, state.baseCommit);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('final gate rejects deleted files in the committed base diff before trusting scanner output', async () => {
  const root = await repoFixture();
  try {
    await exec('git', ['-C', root, 'branch', 'agentshield-base']);
    await exec('git', ['-C', root, 'rm', '-q', 'src/app.js']);
    await exec('git', ['-C', root, 'commit', '-qm', 'delete source']);
    const state = await snapshot(root, { baseRef: 'agentshield-base' });
    assert.deepEqual(state.changedPaths, ['src/app.js']);
    assert.deepEqual(state.missingChangedPaths, ['src/app.js']);
    let called = false;
    const result = await finalGate(root, { blockingSeverity: 'High', baseRef: 'agentshield-base' }, async () => {
      called = true;
      return { status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js'], findings: [] };
    });
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(called, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('final gate fails closed when configured base ref is missing', async () => {
  const root = await repoFixture();
  try {
    const result = await finalGate(root, { blockingSeverity: 'High', baseRef: 'origin/not-fetched' }, async () => {
      throw new Error('must not run');
    });
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(result.securityGuarantee, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('baseRef config accepts a local branch and rejects unsafe Git ref expressions', () => {
  assert.equal(parseConfig({ baseRef: 'origin/main' }).baseRef, 'origin/main');
  assert.equal(parseConfig({ baseRef: 'a'.repeat(40) }).baseRef, 'a'.repeat(40));
  assert.throws(() => parseConfig({ baseRef: '../main' }), /baseRef/);
  assert.throws(() => parseConfig({ baseRef: 'main;touch' }), /baseRef/);
});

test('enforced final gate refuses dirty-only coverage when no target base ref is configured', async () => {
  const root = await repoFixture();
  try {
    await writeFile(path.join(root, 'src', 'app.js'), 'export const dirty = true;\n');
    let scannerCalled = false;
    const result = await finalGate(root, {
      blockingSeverity: 'High',
      completionGate: 'enforce',
      baseRef: null,
    }, async () => {
      scannerCalled = true;
      return { status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js'], findings: [] };
    });
    assert.equal(result.status, 'scan_incomplete');
    assert.equal(result.securityGuarantee, false);
    assert.equal(scannerCalled, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
