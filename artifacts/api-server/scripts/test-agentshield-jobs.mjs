import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ScanJobQueue } from './agentshield-jobs.mjs';

const complete = (findings = []) => ({ status: 'complete', filesScanned: 1, findings,
  totalFindings: findings.length, coverage: 'synthetic complete fixture', findingsTruncated: false });
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

test('queue coalesces duplicate jobs, enforces backpressure, and paginates findings', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-jobs-'));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new ScanJobQueue({ storeDir, concurrency: 1, maxQueued: 1,
    runner: async () => { await gate; return complete(Array.from({ length: 123 }, (_, i) => ({ id: i }))); } });
  try {
    const first = await queue.submit({ workspace: '/tmp/repo-one' });
    for (let i = 0; i < 40 && queue.getStatus(first.job_id)?.status !== 'running'; i++) await tick();
    assert.equal(queue.getStatus(first.job_id).status, 'running');
    const duplicate = await queue.submit({ workspace: '/tmp/repo-one' });
    assert.equal(duplicate.job_id, first.job_id);
    assert.equal(duplicate.deduplicated, true);
    const second = await queue.submit({ workspace: '/tmp/repo-two' });
    await assert.rejects(queue.submit({ workspace: '/tmp/repo-three' }), /queue is full/);
    assert.equal((await queue.cancel(second.job_id)).status, 'cancelled');
    release();
    for (let i = 0; i < 40 && queue.getStatus(first.job_id)?.status !== 'completed'; i++) await tick();
    assert.equal(queue.getStatus(first.job_id).status, 'completed');
    assert.deepEqual(queue.getResults(first.job_id, { offset: 1, limit: 1 }).findings, [{ id: 1 }]);
    assert.equal(queue.getResults(first.job_id, { offset: 0, limit: 1 }).next_offset, 1);
    const lastPage = queue.getResults(first.job_id, { offset: 100, limit: 50 });
    assert.equal(lastPage.findings.length, 23);
    assert.equal(lastPage.next_offset, null);
    assert.equal(lastPage.summary.totalFindings, 123);
  } finally { await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});

test('queue retries only bounded transient errors and reports scanner failures as unknown', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-errors-'));
  const attempts = new Map();
  const queue = new ScanJobQueue({ storeDir, concurrency: 1, maxRetries: 1,
    runner: async ({ workspace }) => {
      if (workspace === '/tmp/foxy-flaky') {
        const count = (attempts.get(workspace) || 0) + 1;
        attempts.set(workspace, count);
        if (count === 1) throw Object.assign(new Error('transient'), { code: 'EAGAIN' });
      } else throw new Error('scanner output was invalid');
      return complete();
    } });
  try {
    const retried = await queue.submit({ workspace: '/tmp/foxy-flaky' });
    const failed = await queue.submit({ workspace: '/tmp/foxy-broken' });
    for (let i = 0; i < 100 && queue.getStatus(failed.job_id)?.status !== 'failed'; i++) await tick();
    assert.equal(queue.getStatus(retried.job_id).status, 'completed');
    assert.equal(queue.getStatus(retried.job_id).retries, 1);
    assert.equal(attempts.get('/tmp/foxy-flaky'), 2);
    assert.equal(queue.getStatus(failed.job_id).status, 'failed');
    assert.match(queue.getResults(failed.job_id).note, /invalid/);
    assert.equal(queue.getStatus(failed.job_id).scan_status, null);
  } finally { await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});

test('job timeout fails closed and aborts the scanner signal', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-timeout-'));
  let aborted = false;
  const queue = new ScanJobQueue({ storeDir, timeoutMs: 1000, maxRetries: 0,
    runner: (_input, { signal }) => new Promise((_resolve, reject) => {
      const fail = () => { aborted = true; reject(signal.reason); };
      if (signal.aborted) fail();
      else signal.addEventListener('abort', fail, { once: true });
    }) });
  try {
    const { job_id: id } = await queue.submit({ workspace: '/tmp/foxy-timeout' });
    for (let i = 0; i < 120 && queue.getStatus(id)?.status !== 'failed'; i++) await tick();
    assert.equal(queue.getStatus(id).status, 'failed');
    assert.match(queue.getStatus(id).error, /time limit/);
    assert.equal(queue.getResults(id).summary, undefined);
    assert.equal(aborted, true);
  } finally { await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});

test('running cancellation and restart recovery never turn interrupted work into a pass', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-recovery-'));
  const runner = (_input, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  });
  const queue = new ScanJobQueue({ storeDir, concurrency: 1, runner });
  try {
    const { job_id: id } = await queue.submit({ workspace: '/tmp/repo-restart' });
    for (let i = 0; i < 40 && queue.getStatus(id)?.status !== 'running'; i++) await tick();
    assert.equal((await queue.cancel(id)).status, 'running');
    for (let i = 0; i < 40 && queue.getStatus(id)?.status !== 'cancelled'; i++) await tick();
    assert.equal(queue.getStatus(id).status, 'cancelled');
  } finally { await queue.close(); }

  const persistentRunner = (_input, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener('abort', () => reject(new Error('shutdown')), { once: true });
  });
  const queue2 = new ScanJobQueue({ storeDir, runner: persistentRunner });
  const { job_id: interruptedId } = await queue2.submit({ workspace: '/tmp/repo-interrupted' });
  for (let i = 0; i < 40 && queue2.getStatus(interruptedId)?.status !== 'running'; i++) await tick();
  await queue2.close();
  await writeFile(path.join(storeDir, 'jobs.json'), JSON.stringify({ version: 1, jobs: [{
    id: interruptedId, type: 'scan_full', scope: 'full', status: 'running', priority: 0,
    sequence: 1, workspace: '/tmp/repo-interrupted', baseRef: null, idempotencyKey: null,
    fingerprint: 'a'.repeat(64), progress: 20, createdAt: 1, updatedAt: 2, retries: 0,
    result: null, error: null,
  }] }));
  const queue3 = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await queue3.init();
    assert.equal(queue3.getStatus(interruptedId).status, 'interrupted');
    assert.equal(queue3.getResults(interruptedId).status, 'interrupted');
  } finally { await queue3.close(); await rm(storeDir, { recursive: true, force: true }); }
});

test('configured concurrency is enforced while independent jobs run in parallel', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-concurrency-'));
  let running = 0;
  let peak = 0;
  const queue = new ScanJobQueue({ storeDir, concurrency: 2, maxQueued: 3,
    runner: async () => { running++; peak = Math.max(peak, running); await tick(); await tick(); running--; return complete(); } });
  try {
    const ids = [];
    for (const workspace of ['/tmp/parallel-a', '/tmp/parallel-b', '/tmp/parallel-c']) {
      ids.push((await queue.submit({ workspace })).job_id);
    }
    for (let i = 0; i < 100 && ids.some((id) => queue.getStatus(id)?.status !== 'completed'); i++) await tick();
    assert.equal(peak, 2);
    assert.ok(ids.every((id) => queue.getStatus(id)?.status === 'completed'));
  } finally { await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});

test('partial scan coverage remains visible in completed job results', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-storage-limit-'));
  const queue = new ScanJobQueue({ storeDir, runner: async () => ({ status: 'partial_coverage', filesScanned: 0, findings: [], totalFindings: 0 }) });
  try {
    const { job_id: id } = await queue.submit({ workspace: '/tmp/repo-partial' });
    for (let i = 0; i < 40 && queue.getStatus(id)?.status !== 'completed'; i++) await tick();
    assert.equal(queue.getStatus(id).status, 'completed');
    assert.equal(queue.getResults(id).summary.scanStatus, 'partial_coverage');
  } finally { await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});
