import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ScanJobQueue } from './agentshield-jobs.mjs';

const complete = (findings = []) => ({ status: 'complete', filesScanned: 1, findings,
  totalFindings: findings.length, coverage: 'synthetic complete fixture', findingsTruncated: false });
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
const TEST_BASELINE_PROVENANCE = Object.freeze({
  scannerFingerprint: 'a'.repeat(64),
  rulesetVersion: 'agentshield-test-ruleset-v1',
  reportSchemaVersion: 1,
});

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
    const publicStatus = queue.getStatus(first.job_id);
    assert.equal(Object.hasOwn(publicStatus, 'workspace'), false);
    assert.equal(Object.hasOwn(publicStatus, 'fingerprint'), false);
    assert.equal(Object.hasOwn(publicStatus, 'idempotencyKey'), false);
    const waiting = queue.wait(first.job_id, 10_000);
    const duplicate = await queue.submit({ workspace: '/tmp/repo-one' });
    assert.equal(duplicate.job_id, first.job_id);
    assert.equal(duplicate.deduplicated, true);
    const second = await queue.submit({ workspace: '/tmp/repo-two' });
    await assert.rejects(queue.submit({ workspace: '/tmp/repo-three' }), /queue is full/);
    assert.equal((await queue.cancel(second.job_id)).status, 'cancelled');
    release();
    await waiting;
    assert.equal(queue.waiters.has(first.job_id), false, 'state notification removes its waiter and timer');
    for (let i = 0; i < 40 && queue.getStatus(first.job_id)?.status !== 'completed'; i++) await tick();
    assert.equal(queue.getStatus(first.job_id).status, 'completed');
    assert.deepEqual(queue.getResults(first.job_id, { offset: 1, limit: 1 }).findings, [{ id: 1 }]);
    assert.equal(queue.getResults(first.job_id, { offset: 0, limit: 1 }).next_offset, 1);
    assert.equal(queue.getResults(first.job_id).scan_id, null,
      'oversized finding sets must not create remediation baselines');
    assert.equal(queue.getResults(first.job_id).baseline_expires_in_ms, null);
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
    // The second submission may fail before the retried job gets its worker
    // slot. Wait for both independent outcomes rather than treating the first
    // terminal job as evidence that the earlier retry has also completed.
    for (let i = 0; i < 200; i++) {
      const retryStatus = queue.getStatus(retried.job_id)?.status;
      const failedStatus = queue.getStatus(failed.job_id)?.status;
      if (retryStatus === 'completed' && failedStatus === 'failed') break;
      await tick();
    }
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
  let signalBothStarted;
  let releaseWorkers;
  const bothStarted = new Promise((resolve) => { signalBothStarted = resolve; });
  const workerGate = new Promise((resolve) => { releaseWorkers = resolve; });
  const queue = new ScanJobQueue({ storeDir, concurrency: 2, maxQueued: 12,
    runner: async () => {
      running++;
      peak = Math.max(peak, running);
      if (running === 2) signalBothStarted();
      await workerGate;
      running--;
      return complete();
    } });
  try {
    const ids = [];
    for (let i = 0; i < 12; i++) {
      ids.push((await queue.submit({ workspace: `/tmp/parallel-${i}` })).job_id);
    }
    // Keep both workers blocked until every submission has completed its durable
    // enqueue. This tests persistence and concurrency without racing a fixed
    // wall-clock delay against slow CI filesystem syncs.
    for (let i = 0; i < 120 && running < 2; i++) await tick();
    assert.equal(running, 2, 'both configured worker slots should become active');
    assert.equal(peak, 2);
    releaseWorkers();
    for (let i = 0; i < 240 && ids.some((id) => queue.getStatus(id)?.status !== 'completed'); i++) await tick();
    assert.ok(ids.every((id) => queue.getStatus(id)?.status === 'completed'),
      'concurrent persistence must not evict accepted jobs from the live queue');
  } finally {
    releaseWorkers();
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
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

test('simultaneous idempotent submissions create exactly one job', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-idempotency-'));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new ScanJobQueue({ storeDir, runner: async () => { await gate; return complete(); } });
  try {
    const submissions = await Promise.all(Array.from({ length: 12 }, () => queue.submit({
      workspace: '/tmp/idempotent-repo', idempotency_key: 'same-request',
    })));
    assert.equal(new Set(submissions.map((item) => item.job_id)).size, 1);
    assert.equal(submissions.filter((item) => !item.deduplicated).length, 1);
    await assert.rejects(queue.submit({ workspace: '/tmp/other-repo', idempotency_key: 'same-request' }), /different scan/);
    release();
  } finally { release(); await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});

test('workspace canonicalization coalesces aliases and rejects a symlink root', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-canonical-'));
  const parent = await mkdtemp(path.join(os.tmpdir(), 'foxy-workspace-'));
  const workspace = path.join(parent, 'repo');
  await mkdir(workspace);
  const alias = `${parent}-link`;
  await symlink(parent, alias);
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await assert.rejects(queue.submit({ workspace: alias }), /real directory/);
    const first = await queue.submit({ workspace });
    const second = await queue.submit({ workspace: path.join(alias, 'repo') });
    assert.equal(second.job_id, first.job_id);
    assert.equal(second.deduplicated, true);
  } finally {
    await queue.close();
    await rm(alias, { force: true });
    await rm(parent, { recursive: true, force: true });
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('persistence retention never evicts an active job', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-retention-'));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new ScanJobQueue({ storeDir, concurrency: 1, runner: async () => { await gate; return complete(); } });
  try {
    const { job_id: activeId } = await queue.submit({ workspace: '/tmp/long-running-repo' });
    for (let i = 0; i < 40 && queue.getStatus(activeId)?.status !== 'running'; i++) await tick();
    for (let i = 0; i < 205; i++) {
      const submitted = await queue.submit({ workspace: `/tmp/history-${i}` });
      await queue.cancel(submitted.job_id);
    }
    assert.equal(queue.getStatus(activeId)?.status, 'running');
    assert.ok(JSON.parse(await (await import('node:fs/promises')).readFile(path.join(storeDir, 'jobs.json'), 'utf8'))
      .jobs.some((job) => job.id === activeId && job.status === 'running'));
    release();
  } finally { release(); await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});


test('wait timeout removes its waiter instead of retaining stale callbacks', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-wait-timeout-'));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new ScanJobQueue({ storeDir, runner: async () => { await gate; return complete(); } });
  try {
    const { job_id: id } = await queue.submit({ workspace: '/tmp/foxy-wait-timeout' });
    for (let i = 0; i < 40 && queue.getStatus(id)?.status !== 'running'; i++) await tick();
    const status = await queue.wait(id, 25);
    assert.equal(status.status, 'running');
    assert.equal(queue.waiters.has(id), false);
  } finally {
    release();
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('failed durable submission rolls back the unaccepted job and fails closed', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-persist-failure-'));
  const statePath = path.join(storeDir, 'jobs.json');
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await queue.init();
    await rm(statePath, { force: true });
    await mkdir(statePath);
    await assert.rejects(queue.submit({ workspace: '/tmp/foxy-persist-failure' }), /could not persist the scan job/i);
    assert.equal(queue.jobs.size, 0);
    assert.equal(queue.active, 0);
    assert.equal(queue.storageFault, true);
    await assert.rejects(queue.submit({ workspace: '/tmp/foxy-next-submit' }), /storage is unhealthy/i);
  } finally {
    await rm(statePath, { recursive: true, force: true });
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('concurrent close calls share one shutdown and release the process lock', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-close-once-'));
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  await queue.init();
  try {
    await Promise.all([queue.close(), queue.close(), queue.close()]);
    assert.equal(queue.initialized, false);
    assert.equal(queue.closingPromise, null);
  } finally {
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});


test('completed changed-scan jobs expose recoverable baseline records after restart', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-baseline-recovery-'));
  const createdAt = Date.now();
  const baselineContext = {
    scanId: 'baseline-persisted-0001',
    workspace: '/tmp/foxy-baseline-recovery',
    fingerprint: 'c'.repeat(64),
    ...TEST_BASELINE_PROVENANCE,
    createdAt,
    expiresAt: createdAt + 60_000,
  };
  const queue = new ScanJobQueue({
    storeDir,
    baselineProvenance: TEST_BASELINE_PROVENANCE,
    runner: async () => ({
      status: 'complete',
      filesScanned: 1,
      scannedPaths: ['src/app.js'],
      findings: [{
        filePath: 'src/app.js',
        line: 1,
        ruleId: 'synthetic_rule',
        severity: 'Low',
        confidence: 'high',
        engine: 'synthetic_fixture',
        title: 'Synthetic finding',
        recommendation: 'Use a safe implementation.',
      }],
      totalFindings: 1,
      coverage: 'synthetic complete fixture',
      findingsTruncated: false,
      scanId: baselineContext.scanId,
      baselineExpiresInMs: 60_000,
      baselineContext,
    }),
  });
  try {
    const { job_id: id } = await queue.submit({ workspace: baselineContext.workspace, scope: 'changed' });
    for (let i = 0; i < 80 && queue.getStatus(id)?.status !== 'completed'; i++) await tick();
    assert.equal(queue.getStatus(id).status, 'completed');
    const results = queue.getResults(id);
    assert.equal(results.scan_id, baselineContext.scanId);
    assert.equal(results.baseline_expired, false);
    assert.equal(Object.hasOwn(results, 'baselineContext'), false);
    const recoverable = queue.getRestorableBaselines();
    assert.equal(recoverable.length, 1);
    assert.equal(recoverable[0].scanId, baselineContext.scanId);
    assert.equal(recoverable[0].workspace, baselineContext.workspace);
    assert.equal(recoverable[0].result.findings.length, 1);
  } finally {
    await queue.close();
    const restored = new ScanJobQueue({ storeDir, baselineProvenance: TEST_BASELINE_PROVENANCE, runner: async () => complete() });
    try {
      await restored.init();
      assert.equal(restored.getRestorableBaselines().length, 1);
    } finally { await restored.close(); await rm(storeDir, { recursive: true, force: true }); }
  }
});


test('queued cancellation persistence failure fails closed instead of pretending it was durable', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-cancel-persist-failure-'));
  const statePath = path.join(storeDir, 'jobs.json');
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new ScanJobQueue({ storeDir, concurrency: 1, runner: async () => { await gate; return complete(); } });
  try {
    const first = await queue.submit({ workspace: '/tmp/foxy-cancel-running' });
    for (let i = 0; i < 40 && queue.getStatus(first.job_id)?.status !== 'running'; i++) await tick();
    const queued = await queue.submit({ workspace: '/tmp/foxy-cancel-queued' });
    await rm(statePath, { force: true });
    await mkdir(statePath);
    await assert.rejects(queue.cancel(queued.job_id), /could not persist cancellation/i);
    assert.equal(queue.storageFault, true);
    assert.equal(queue.getStatus(queued.job_id).status, 'failed');
    assert.match(queue.getStatus(queued.job_id).error, /UNKNOWN/);
    assert.equal(queue.active, 1);
  } finally {
    release();
    await queue.close();
    await rm(statePath, { recursive: true, force: true });
    await rm(storeDir, { recursive: true, force: true });
  }
});


test('expired or malformed persisted baseline contexts never return usable scan IDs', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-expired-baseline-'));
  const fixedNow = 50_000;
  const context = {
    scanId: 'baseline-expired-0001',
    workspace: '/tmp/foxy-expired-baseline',
    fingerprint: 'd'.repeat(64),
    createdAt: 1000,
    expiresAt: 2000,
  };
  const queue = new ScanJobQueue({
    storeDir,
    now: () => fixedNow,
    runner: async () => ({
      status: 'complete',
      filesScanned: 1,
      scannedPaths: ['src/app.js'],
      findings: [],
      totalFindings: 0,
      coverage: 'synthetic complete fixture',
      findingsTruncated: false,
      scanId: context.scanId,
      baselineContext: context,
      baselineExpiresInMs: 0,
    }),
  });
  try {
    const { job_id: id } = await queue.submit({ workspace: context.workspace, scope: 'changed' });
    for (let i = 0; i < 80 && queue.getStatus(id)?.status !== 'completed'; i++) await tick();
    assert.equal(queue.getStatus(id).status, 'completed');
    const results = queue.getResults(id);
    assert.equal(results.scan_id, null);
    assert.equal(results.baseline_expires_in_ms, 0);
    assert.equal(results.baseline_expired, true);
    assert.equal(queue.getRestorableBaselines().length, 0);
  } finally { await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});


test('queue does not expose baseline IDs when persisted finding metadata is malformed', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-baseline-invalid-findings-'));
  const createdAt = Date.now();
  const context = {
    scanId: 'baseline-invalid-findings-01',
    workspace: '/tmp/foxy-invalid-findings',
    fingerprint: 'f'.repeat(64),
    createdAt,
    expiresAt: createdAt + 60_000,
  };
  const queue = new ScanJobQueue({
    storeDir,
    runner: async () => ({
      status: 'complete',
      filesScanned: 1,
      scannedPaths: ['src/app.js'],
      findings: [{
        filePath: '../outside.js', ruleId: 'unsafe_rule', severity: 'High',
        confidence: 'high', line: 1, title: 'Invalid path', recommendation: 'Fix',
      }],
      totalFindings: 1,
      coverage: 'synthetic complete fixture',
      findingsTruncated: false,
      scanId: context.scanId,
      baselineContext: context,
    }),
  });
  try {
    const { job_id: id } = await queue.submit({ workspace: context.workspace, scope: 'changed' });
    for (let i = 0; i < 80 && queue.getStatus(id)?.status !== 'completed'; i++) await tick();
    assert.equal(queue.getStatus(id).status, 'completed');
    const result = queue.getResults(id);
    assert.equal(result.scan_id, null);
    assert.equal(result.baseline_expired, false);
    assert.equal(result.baseline_unavailable, true);
    assert.equal(queue.getRestorableBaselines().length, 0);
  } finally { await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});


test('queue refuses a symlinked process lock without modifying its target', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-lock-symlink-'));
  const target = path.join(storeDir, 'attacker-controlled-target');
  const lockPath = path.join(storeDir, 'jobs.lock');
  await writeFile(target, 'do-not-modify');
  await symlink(target, lockPath);
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await assert.rejects(queue.init(), /Job store lock is unreadable/);
    assert.equal(await readFile(target, 'utf8'), 'do-not-modify');
    assert.equal(queue.initialized, false);
  } finally {
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});



test('initial queue checkpoint failure leaves the queue uninitialized and releases its lock', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-initial-checkpoint-failure-'));
  let runnerCalls = 0;
  const queue = new ScanJobQueue({
    storeDir,
    runner: async () => { runnerCalls++; return complete(); },
    writeSnapshot: async () => { throw new Error('deterministic initial checkpoint failure'); },
  });
  try {
    await assert.rejects(queue.init(), /initial durable checkpoint/i);
    assert.equal(queue.initialized, false);
    assert.equal(queue.storageFault, true);
    assert.equal(queue.jobs.size, 0);
    assert.equal(runnerCalls, 0);
    await assert.rejects(queue.submit({ workspace: '/tmp/foxy-initial-failure' }), /initialization previously failed/i);
    await assert.rejects(readFile(path.join(storeDir, 'jobs.lock'), 'utf8'), { code: 'ENOENT' });
  } finally {
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('concurrent init calls share one initial durable checkpoint', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-concurrent-init-'));
  let writes = 0;
  const queue = new ScanJobQueue({
    storeDir,
    runner: async () => complete(),
    writeSnapshot: async () => { writes++; await tick(); },
  });
  try {
    await Promise.all([queue.init(), queue.init(), queue.init()]);
    assert.equal(queue.initialized, true);
    assert.equal(writes, 1);
  } finally {
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});


test('queue priority aging prevents older normal jobs being starved by newer urgent work', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-priority-aging-'));
  let now = 100_000;
  let releaseActive;
  let signalActive;
  const activeGate = new Promise((resolve) => { releaseActive = resolve; });
  const activeStarted = new Promise((resolve) => { signalActive = resolve; });
  const executionOrder = [];
  const queue = new ScanJobQueue({
    storeDir,
    concurrency: 1,
    now: () => now,
    runner: async ({ workspace }) => {
      if (workspace === '/tmp/foxy-aging-active') {
        signalActive();
        await activeGate;
      } else executionOrder.push(workspace);
      return complete();
    },
  });
  try {
    await queue.init();
    await queue.submit({ workspace: '/tmp/foxy-aging-active', scope: 'full' });
    await activeStarted;
    const older = await queue.submit({ workspace: '/tmp/foxy-aging-older', scope: 'full', priority: 0 });
    now += 60_000;
    const newer = await queue.submit({ workspace: '/tmp/foxy-aging-newer', scope: 'full', priority: 3 });
    const olderStatus = queue.getStatus(older.job_id);
    assert.ok(olderStatus.queue_wait_ms >= 60_000);
    assert.equal(olderStatus.execution_ms, null);
    releaseActive();
    await queue.wait(newer.job_id, 5000);
    await queue.wait(older.job_id, 5000);
    assert.deepEqual(executionOrder, ['/tmp/foxy-aging-older', '/tmp/foxy-aging-newer']);
    const finished = queue.getStatus(older.job_id);
    assert.ok(finished.queue_wait_ms >= 60_000);
    assert.equal(typeof finished.execution_ms, 'number');
    assert.ok(finished.execution_ms >= 0);
  } finally {
    releaseActive();
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});
