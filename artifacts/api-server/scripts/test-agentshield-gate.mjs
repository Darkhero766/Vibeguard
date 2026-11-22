import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { snapshot, finalGate } from './agentshield-gate.mjs';

const exec = promisify(execFile);
async function repoFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-gate-test-'));
  await exec('git', ['init', '-q', root]);
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
