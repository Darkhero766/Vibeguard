import test from 'node:test';
import assert from 'node:assert/strict';
import { BaselineStore } from './agentshield-baselines.mjs';

const TEST_PROVENANCE = Object.freeze({
  scannerFingerprint: 'b'.repeat(64),
  runtimeFingerprint: 'c'.repeat(64),
  rulesetVersion: 'agentshield-test-ruleset-v1',
  reportSchemaVersion: 1,
});

test('baseline records are isolated to their workspace', () => {
  let next = 0;
  const store = new BaselineStore({ makeId: () => 'baseline-id-' + String(++next).padStart(8, '0') });
  const record = store.remember('/repo/a', 'fingerprint-a', { status: 'complete' }, TEST_PROVENANCE);
  assert.equal(store.get(record.scanId, '/repo/a').fingerprint, 'fingerprint-a');
  assert.equal(store.get(record.scanId, '/repo/b'), null);
  assert.equal(store.get('short', '/repo/a'), null);
});

test('baselines expire according to the injected clock', () => {
  let now = 1000;
  const store = new BaselineStore({
    ttlMs: 500,
    now: () => now,
    makeId: () => 'baseline-expiry-0001',
  });
  const record = store.remember('/repo', 'fingerprint', { status: 'complete' }, TEST_PROVENANCE);
  assert.equal(record.expiresAt, 1500);
  assert.ok(store.get(record.scanId, '/repo'));
  now = 1500;
  assert.equal(store.get(record.scanId, '/repo'), null);
  assert.equal(store.size, 0);
});

test('baseline store prunes the oldest record when the cap is exceeded', () => {
  let now = 0;
  let next = 0;
  const store = new BaselineStore({
    maxEntries: 2,
    ttlMs: 10_000,
    now: () => ++now,
    makeId: () => 'baseline-cap-' + String(++next).padStart(8, '0'),
  });
  const first = store.remember('/repo', 'fp-1', { status: 'complete' }, TEST_PROVENANCE);
  const second = store.remember('/repo', 'fp-2', { status: 'complete' }, TEST_PROVENANCE);
  const third = store.remember('/repo', 'fp-3', { status: 'complete' }, TEST_PROVENANCE);
  assert.equal(store.size, 2);
  assert.equal(store.get(first.scanId, '/repo'), null);
  assert.ok(store.get(second.scanId, '/repo'));
  assert.ok(store.get(third.scanId, '/repo'));
});

test('baseline store validates identifiers and content inputs', () => {
  const store = new BaselineStore();
  assert.throws(() => store.remember('', 'fp', { status: 'complete' }));
  assert.throws(() => store.remember('/repo', '', { status: 'complete' }));
  assert.throws(() => new BaselineStore({ maxEntries: 0 }));
});


test('restored baselines retain their ID, workspace binding and original expiry', () => {
  let now = 10_000;
  const source = new BaselineStore({ ttlMs: 5_000, now: () => now, makeId: () => 'persisted-baseline-0001' });
  const original = source.remember('/workspace/repo', 'a'.repeat(64), {
    status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js'],
    findings: [], totalFindings: 0, findingsTruncated: false,
  }, TEST_PROVENANCE);
  const restored = new BaselineStore({ ttlMs: 5_000, now: () => now });
  assert.equal(restored.restore(original, TEST_PROVENANCE), true);
  assert.equal(restored.get(original.scanId, '/workspace/repo').fingerprint, 'a'.repeat(64));
  assert.equal(restored.get(original.scanId, '/other/repo'), null);
  now = original.expiresAt;
  assert.equal(restored.get(original.scanId, '/workspace/repo'), null);
});

test('restored baselines reject altered, incomplete and over-lifetime records', () => {
  const source = new BaselineStore({ ttlMs: 1000, now: () => 100 });
  const record = source.remember('/workspace/repo', 'b'.repeat(64), {
    status: 'complete', filesScanned: 1, scannedPaths: ['src/app.js'],
    findings: [], totalFindings: 0, findingsTruncated: false,
  }, TEST_PROVENANCE);
  const target = new BaselineStore({ ttlMs: 1000, now: () => 100 });
  assert.throws(() => target.restore({ ...record, fingerprint: 'bad' }), /invalid/i);
  assert.throws(() => target.restore({ ...record, expiresAt: record.createdAt + 1001 }), /invalid/i);
  assert.throws(() => target.restore({ ...record, result: { ...record.result, status: 'partial_coverage' } }), /invalid/i);
  assert.equal(target.size, 0);
});

test('restored baselines reject Windows traversal and control characters in scanned paths', () => {
  const now = 1000;
  const store = new BaselineStore({ ttlMs: 5000, now: () => now });
  const base = {
    scanId: 'baseline-safe-path-0001',
    workspace: '/workspace/repo',
    fingerprint: 'e'.repeat(64),
    ...TEST_PROVENANCE,
    createdAt: 1000,
    expiresAt: 5000,
    result: {
      status: 'complete',
      filesScanned: 1,
      scannedPaths: ['src/app.js'],
      findings: [],
      totalFindings: 0,
      findingsTruncated: false,
    },
  };
  const traversalPath = '..' + String.fromCharCode(92) + 'outside.js';
  assert.throws(() => store.restore({
    ...base, result: { ...base.result, scannedPaths: [traversalPath] },
  }), /invalid/i);
  const controlPath = 'src/' + String.fromCharCode(0) + 'app.js';
  assert.throws(() => store.restore({
    ...base, result: { ...base.result, scannedPaths: [controlPath] },
  }), /invalid/i);
  assert.equal(store.size, 0);
});



test('restored baselines reject scanner, MCP runtime, ruleset and report-schema drift', () => {
  const now = 2000;
  const store = new BaselineStore({ ttlMs: 5000, now: () => now });
  const record = {
    scanId: 'baseline-provenance-0001',
    workspace: '/workspace/repo',
    fingerprint: 'c'.repeat(64),
    ...TEST_PROVENANCE,
    createdAt: now,
    expiresAt: now + 4000,
    result: {
      status: 'complete',
      filesScanned: 1,
      scannedPaths: ['src/app.js'],
      findings: [],
      totalFindings: 0,
      findingsTruncated: false,
    },
  };
  assert.equal(store.restore(record, TEST_PROVENANCE), true);
  assert.throws(() => store.restore({ ...record, scannerFingerprint: 'd'.repeat(64) }, TEST_PROVENANCE), /invalid/i);
  assert.throws(() => store.restore({ ...record, runtimeFingerprint: 'd'.repeat(64) }, TEST_PROVENANCE), /invalid/i);
  const legacyRecord = { ...record };
  delete legacyRecord.runtimeFingerprint;
  assert.throws(() => store.restore(legacyRecord, TEST_PROVENANCE), /invalid/i);
  assert.throws(() => store.restore({ ...record, rulesetVersion: 'agentshield-next-ruleset' }, TEST_PROVENANCE), /invalid/i);
  assert.throws(() => store.restore({ ...record, reportSchemaVersion: 2 }, TEST_PROVENANCE), /invalid/i);
});
