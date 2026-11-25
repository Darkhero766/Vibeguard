import test from 'node:test';
import assert from 'node:assert/strict';
import { BaselineStore } from './agentshield-baselines.mjs';

test('baseline records are isolated to their workspace', () => {
  let next = 0;
  const store = new BaselineStore({ makeId: () => 'baseline-id-' + String(++next).padStart(8, '0') });
  const record = store.remember('/repo/a', 'fingerprint-a', { status: 'complete' });
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
  const record = store.remember('/repo', 'fingerprint', { status: 'complete' });
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
  const first = store.remember('/repo', 'fp-1', { status: 'complete' });
  const second = store.remember('/repo', 'fp-2', { status: 'complete' });
  const third = store.remember('/repo', 'fp-3', { status: 'complete' });
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
  });
  const restored = new BaselineStore({ ttlMs: 5_000, now: () => now });
  assert.equal(restored.restore(original), true);
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
  });
  const target = new BaselineStore({ ttlMs: 1000, now: () => 100 });
  assert.throws(() => target.restore({ ...record, fingerprint: 'bad' }), /invalid/i);
  assert.throws(() => target.restore({ ...record, expiresAt: record.createdAt + 1001 }), /invalid/i);
  assert.throws(() => target.restore({ ...record, result: { ...record.result, status: 'partial_coverage' } }), /invalid/i);
  assert.equal(target.size, 0);
});
