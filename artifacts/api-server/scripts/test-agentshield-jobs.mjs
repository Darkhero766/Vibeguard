import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const jobWorkspacePath = (name) => path.join(os.tmpdir(), 'foxy-job-workspaces', name);
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
    const first = await queue.submit({ workspace: jobWorkspacePath('repo-one') });
    for (let i = 0; i < 40 && queue.getStatus(first.job_id)?.status !== 'running'; i++) await tick();
    assert.equal(queue.getStatus(first.job_id).status, 'running');
    const publicStatus = queue.getStatus(first.job_id);
    assert.equal(Object.hasOwn(publicStatus, 'workspace'), false);
    assert.equal(Object.hasOwn(publicStatus, 'fingerprint'), false);
    assert.equal(Object.hasOwn(publicStatus, 'idempotencyKey'), false);
    const waiting = queue.wait(first.job_id, 10_000);
    const duplicate = await queue.submit({ workspace: jobWorkspacePath('repo-one') });
    assert.equal(duplicate.job_id, first.job_id);
    assert.equal(duplicate.deduplicated, true);
    const second = await queue.submit({ workspace: jobWorkspacePath('repo-two') });
    await assert.rejects(queue.submit({ workspace: jobWorkspacePath('repo-three') }), /queue is full/);
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
      if (workspace === jobWorkspacePath('foxy-flaky')) {
        const count = (attempts.get(workspace) || 0) + 1;
        attempts.set(workspace, count);
        if (count === 1) throw Object.assign(new Error('transient'), { code: 'EAGAIN' });
      } else throw new Error('scanner output was invalid');
      return complete();
    } });
  try {
    const retried = await queue.submit({ workspace: jobWorkspacePath('foxy-flaky') });
    const failed = await queue.submit({ workspace: jobWorkspacePath('foxy-broken') });
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
    assert.equal(attempts.get(jobWorkspacePath('foxy-flaky')), 2);
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
    const { job_id: id } = await queue.submit({ workspace: jobWorkspacePath('foxy-timeout') });
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
    const { job_id: id } = await queue.submit({ workspace: jobWorkspacePath('repo-restart') });
    for (let i = 0; i < 40 && queue.getStatus(id)?.status !== 'running'; i++) await tick();
    assert.equal((await queue.cancel(id)).status, 'running');
    for (let i = 0; i < 40 && queue.getStatus(id)?.status !== 'cancelled'; i++) await tick();
    assert.equal(queue.getStatus(id).status, 'cancelled');
  } finally { await queue.close(); }

  const persistentRunner = (_input, { signal }) => new Promise((_resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener('abort', () => reject(new Error('shutdown')), { once: true });
  });
  const queue2 = new ScanJobQueue({
    storeDir, runner: persistentRunner, workerLeaseMs: 1000, heartbeatIntervalMs: 100,
  });
  const { job_id: interruptedId } = await queue2.submit({ workspace: jobWorkspacePath('repo-interrupted') });
  for (let i = 0; i < 40 && queue2.getStatus(interruptedId)?.status !== 'running'; i++) await tick();
  assert.equal(queue2.getStatus(interruptedId).status, 'running');
  // Simulate a process that stopped heartbeating without graceful shutdown.
  clearInterval(queue2.heartbeatTimer);
  queue2.store.db.prepare('UPDATE workers SET heartbeat_at=? WHERE id=?')
    .run(Date.now() - 5000, queue2.workerId);
  const queue3 = new ScanJobQueue({
    storeDir, runner: async () => complete(), workerLeaseMs: 1000, heartbeatIntervalMs: 100,
  });
  try {
    await queue3.init();
    assert.equal(queue3.getStatus(interruptedId).status, 'interrupted');
    assert.equal(queue3.getResults(interruptedId).status, 'interrupted');
    await queue3.close();
  } finally {
    await queue2.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('legacy JSON migration refuses to race a still-running pre-SQLite Foxy process', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-legacy-live-writer-'));
  const snapshot = { version: 1, jobs: [] };
  await writeFile(path.join(storeDir, 'jobs.json'), JSON.stringify(snapshot));
  await writeFile(path.join(storeDir, 'jobs.lock'), JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    token: 'legacy-writer-live-fixture',
  }));
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await assert.rejects(queue.init(), /legacy Foxy process is still using jobs\.json/);
    assert.equal(queue.initialized, false);
    assert.deepEqual(JSON.parse(await readFile(path.join(storeDir, 'jobs.json'), 'utf8')), snapshot);
    assert.equal(queue.store?.db, null, 'failed migration must close the SQLite handle');
  } finally {
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('legacy JSON queue state migrates once into SQLite and interrupted work stays UNKNOWN', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-legacy-migration-'));
  const now = Date.now();
  const legacyId = '11111111-1111-4111-8111-111111111111';
  const legacy = {
    version: 1,
    jobs: [{
      id: legacyId,
      type: 'scan_full',
      scope: 'full',
      status: 'running',
      priority: 0,
      sequence: now - 1000,
      workspace: jobWorkspacePath('legacy-repo'),
      baseRef: null,
      idempotencyKey: null,
      fingerprint: 'a'.repeat(64),
      progress: 35,
      createdAt: now - 1000,
      updatedAt: now - 500,
      retries: 0,
      result: null,
      error: null,
    }],
  };
  await writeFile(path.join(storeDir, 'jobs.json'), JSON.stringify(legacy));
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await queue.init();
    assert.equal(queue.getStatus(legacyId).status, 'interrupted');
    assert.match(queue.getStatus(legacyId).error, /UNKNOWN/);
    assert.equal(queue.store.db.prepare("SELECT value FROM queue_meta WHERE key='json_snapshot_migrated'").get().value, '1');
    assert.equal(JSON.parse(await readFile(path.join(storeDir, 'jobs.json'), 'utf8')).jobs.length, 1,
      'the original snapshot is retained as a migration recovery copy');
  } finally {
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('two independent Node processes share one SQLite queue and enforce a global worker limit', async (t) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-multiprocess-'));
  const queueModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'agentshield-jobs.mjs');
  const childSource = `
    import { ScanJobQueue } from ${JSON.stringify(queueModule)};
    import path from 'node:path';
    const [storeDir, label] = process.argv.slice(1);
    const queue = new ScanJobQueue({
      storeDir, concurrency: 1, maxQueued: 12,
      runner: async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return { status: 'complete', filesScanned: 1, findings: [], totalFindings: 0,
          coverage: 'cross-process synthetic fixture', findingsTruncated: false };
      },
    });
    await queue.init();
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const result = await queue.submit({
        workspace: path.join(process.cwd(), 'foxy-multiprocess-' + label + '-' + i),
        idempotency_key: label + '-' + i,
      });
      ids.push(result.job_id);
    }
    writeSync(1, 'SUBMITTED ' + JSON.stringify({ label, ids }) + '\\n');
    for (const id of ids) {
      for (let attempt = 0; attempt < 500; attempt++) {
        const state = queue.getStatus(id);
        if (state && ['completed', 'failed', 'cancelled', 'interrupted'].includes(state.status)) {
          if (state.status !== 'completed') throw new Error('Unexpected terminal state: ' + state.status);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (attempt === 499) throw new Error('Timed out waiting for shared queue job ' + id);
      }
    }
    writeSync(1, 'DONE ' + label + '\\n');
    await queue.close();
  `;
  const start = (label) => spawn(process.execPath, ['--input-type=module', '-e', childSource, storeDir, label], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const children = [start('alpha'), start('beta')];
  t.after(() => { for (const child of children) if (child.exitCode === null) child.kill(); });
  let output = '';
  let errors = '';
  for (const child of children) {
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
  }
  const dbPath = path.join(storeDir, 'jobs.sqlite3');
  let db = null;
  let peakRunning = 0;
  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      if (!db && await (await import('node:fs/promises')).stat(dbPath).then(() => true).catch(() => false)) {
        db = new DatabaseSync(dbPath);
        db.exec('PRAGMA busy_timeout=10000;');
      }
      if (db) {
        const running = db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status='running'").get().count;
        peakRunning = Math.max(peakRunning, running);
      }
      if (children.every((child) => child.exitCode !== null)) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(children.every((child) => child.exitCode !== null),
      'both worker processes must finish before the test deadline; ' + errors + output);
    const exits = children.map((child) => child.exitCode);
    assert.deepEqual(exits, [0, 0], errors || output);
    assert.match(output, /SUBMITTED .*alpha/);
    assert.match(output, /SUBMITTED .*beta/);
    assert.match(output, /DONE alpha/);
    assert.match(output, /DONE beta/);
    assert.ok(db, 'both workers must have used the same on-disk database');
    const rows = db.prepare('SELECT status,COUNT(*) AS count FROM jobs GROUP BY status').all();
    assert.equal(rows.reduce((sum, row) => sum + row.count, 0), 6);
    assert.equal(rows.find((row) => row.status === 'completed')?.count, 6);
    assert.equal(peakRunning, 1, 'the SQLite transaction must enforce the global concurrency cap across processes');
  } finally {
    db?.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('a second MCP process can cancel a job owned by another process', async (t) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-cross-process-cancel-'));
  const queueModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'agentshield-jobs.mjs');
  const workerSource = `
    import { ScanJobQueue } from ${JSON.stringify(queueModule)};
    const [storeDir] = process.argv.slice(1);
    const keepAlive = setInterval(() => {}, 1000);
    const queue = new ScanJobQueue({
      storeDir, concurrency: 1, workerLeaseMs: 1200, heartbeatIntervalMs: 100,
      runner: (_input, { signal }) => new Promise((_resolve, reject) => {
        const cancel = () => reject(signal.reason || new Error('cancelled'));
        if (signal.aborted) cancel();
        else signal.addEventListener('abort', cancel, { once: true });
      }),
    });
    await queue.init();
    const { job_id: id } = await queue.submit({ workspace: '/tmp/foxy-cross-process-cancel-fixture' });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (queue.getStatus(id)?.status === 'running') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (queue.getStatus(id)?.status !== 'running') throw new Error('Worker failed to claim cancellation fixture.');
    writeSync(1, 'RUNNING ' + id + '\\n');
    const final = await queue.wait(id, 8000);
    writeSync(1, 'FINAL ' + final?.status + '\\n');
    await queue.close();
    clearInterval(keepAlive);
  `;
  const cancelSource = `
    import { ScanJobQueue } from ${JSON.stringify(queueModule)};
    const [storeDir, id] = process.argv.slice(1);
    const queue = new ScanJobQueue({
      storeDir, concurrency: 1, workerLeaseMs: 1200, heartbeatIntervalMs: 100,
      runner: async () => ({ status: 'complete', filesScanned: 0, findings: [],
        totalFindings: 0, coverage: 'unused cancel-worker runner', findingsTruncated: false }),
    });
    await queue.init();
    const result = await queue.cancel(id);
    writeSync(1, 'REQUEST ' + result?.status + '\\n');
    await queue.close();
  `;
  const worker = spawn(process.execPath, ['--input-type=module', '-e', `
    import { writeSync } from 'node:fs';
    ${workerSource}
  `, storeDir], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let workerOut = '';
  let workerErr = '';
  worker.stdout.on('data', (chunk) => { workerOut += chunk.toString(); });
  worker.stderr.on('data', (chunk) => { workerErr += chunk.toString(); });
  t.after(() => { if (worker.exitCode === null) worker.kill(); });
  try {
    const readyUntil = Date.now() + 10_000;
    while (!/^RUNNING [a-f0-9-]{36}$/m.test(workerOut) && Date.now() < readyUntil && worker.exitCode === null) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const id = workerOut.match(/^RUNNING ([a-f0-9-]{36})$/m)?.[1];
    assert.ok(id, 'first process should own a running job; ' + workerErr + workerOut);

    const canceler = spawn(process.execPath, ['--input-type=module', '-e', `
      import { writeSync } from 'node:fs';
      ${cancelSource}
    `, storeDir, id], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let cancelOut = '';
    let cancelErr = '';
    canceler.stdout.on('data', (chunk) => { cancelOut += chunk.toString(); });
    canceler.stderr.on('data', (chunk) => { cancelErr += chunk.toString(); });
    const cancelExit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Cross-process cancellation client timed out: ' + cancelErr)), 10_000);
      canceler.once('exit', (code) => { clearTimeout(timer); resolve(code); });
      canceler.once('error', reject);
    });
    assert.equal(cancelExit, 0, cancelErr);
    assert.match(cancelOut, /REQUEST running/);

    const workerExit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker did not observe cross-process cancellation: ' + workerErr + workerOut)), 10_000);
      worker.once('exit', (code) => { clearTimeout(timer); resolve(code); });
      worker.once('error', reject);
    });
    assert.equal(workerExit, 0, workerErr);
    assert.match(workerOut, /FINAL cancelled/);
  } finally {
    if (worker.exitCode === null) worker.kill();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('a crashed subprocess lease turns its running job into interrupted on recovery', async (t) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-process-crash-'));
  const queueModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'agentshield-jobs.mjs');
  const source = `
    import { ScanJobQueue } from ${JSON.stringify(queueModule)};
    const [storeDir] = process.argv.slice(1);
    const queue = new ScanJobQueue({
      storeDir, concurrency: 1, workerLeaseMs: 800, heartbeatIntervalMs: 100,
      runner: () => new Promise(() => {}),
    });
    await queue.init();
    const result = await queue.submit({ workspace: '/tmp/foxy-crashed-worker-fixture' });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (queue.getStatus(result.job_id)?.status === 'running') {
        writeSync(1, 'RUNNING ' + result.job_id + '\\n');
        process.exit(0);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Worker did not claim its scan before the crash fixture timed out.');
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source, storeDir], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  try {
    const exitCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Crash fixture subprocess timed out. ' + stderr)), 10_000);
      child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
      child.once('error', reject);
    });
    assert.equal(exitCode, 0, stderr);
    const id = stdout.trim().match(/^RUNNING ([a-f0-9-]{36})$/)?.[1];
    assert.ok(id, stdout);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const recovered = new ScanJobQueue({
      storeDir, runner: async () => complete(), workerLeaseMs: 800, heartbeatIntervalMs: 100,
    });
    try {
      await recovered.init();
      assert.equal(recovered.getStatus(id).status, 'interrupted');
      assert.match(recovered.getStatus(id).error, /UNKNOWN/);
    } finally { await recovered.close(); }
  } finally {
    await rm(storeDir, { recursive: true, force: true });
  }
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
      ids.push((await queue.submit({ workspace: jobWorkspacePath(`parallel-${i}`) })).job_id);
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
    const { job_id: id } = await queue.submit({ workspace: jobWorkspacePath('repo-partial') });
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
      workspace: jobWorkspacePath('idempotent-repo'), idempotency_key: 'same-request',
    })));
    assert.equal(new Set(submissions.map((item) => item.job_id)).size, 1);
    assert.equal(submissions.filter((item) => !item.deduplicated).length, 1);
    await assert.rejects(queue.submit({ workspace: jobWorkspacePath('other-repo'), idempotency_key: 'same-request' }), /different scan/);
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
    const { job_id: activeId } = await queue.submit({ workspace: jobWorkspacePath('long-running-repo') });
    for (let i = 0; i < 40 && queue.getStatus(activeId)?.status !== 'running'; i++) await tick();
    for (let i = 0; i < 205; i++) {
      const submitted = await queue.submit({ workspace: jobWorkspacePath(`history-${i}`) });
      await queue.cancel(submitted.job_id);
    }
    assert.equal(queue.getStatus(activeId)?.status, 'running');
    const persisted = queue.store.db.prepare('SELECT status FROM jobs WHERE id=?').get(activeId);
    assert.equal(persisted.status, 'running', 'SQLite retention must never evict an active job');
    release();
  } finally { release(); await queue.close(); await rm(storeDir, { recursive: true, force: true }); }
});


test('wait timeout removes its waiter instead of retaining stale callbacks', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-wait-timeout-'));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new ScanJobQueue({ storeDir, runner: async () => { await gate; return complete(); } });
  try {
    const { job_id: id } = await queue.submit({ workspace: jobWorkspacePath('foxy-wait-timeout') });
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
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await queue.init();
    queue.store.db.exec('PRAGMA query_only=ON');
    await assert.rejects(queue.submit({ workspace: jobWorkspacePath('foxy-persist-failure') }), /could not commit the scan job/i);
    assert.equal(queue.jobs.size, 0);
    assert.equal(queue.active, 0);
    assert.equal(queue.storageFault, true);
    await assert.rejects(queue.submit({ workspace: jobWorkspacePath('foxy-next-submit') }), /storage is unhealthy/i);
  } finally {
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
    workspace: jobWorkspacePath('foxy-baseline-recovery'),
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
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new ScanJobQueue({ storeDir, concurrency: 1, runner: async () => { await gate; return complete(); } });
  try {
    const first = await queue.submit({ workspace: jobWorkspacePath('foxy-cancel-running') });
    for (let i = 0; i < 40 && queue.getStatus(first.job_id)?.status !== 'running'; i++) await tick();
    const queued = await queue.submit({ workspace: jobWorkspacePath('foxy-cancel-queued') });
    queue.store.db.exec('PRAGMA query_only=ON');
    await assert.rejects(queue.cancel(queued.job_id), /could not persist cancellation/i);
    assert.equal(queue.storageFault, true);
    assert.equal(queue.getStatus(queued.job_id).status, 'queued',
      'a failed cancellation write must not be reported as durable cancellation');
    assert.equal(queue.active, 1);
  } finally {
    release();
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});


test('expired or malformed persisted baseline contexts never return usable scan IDs', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-expired-baseline-'));
  const fixedNow = 50_000;
  const context = {
    scanId: 'baseline-expired-0001',
    workspace: jobWorkspacePath('foxy-expired-baseline'),
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
    workspace: jobWorkspacePath('foxy-invalid-findings'),
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


test('queue refuses a symlinked SQLite database without modifying its target', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-db-symlink-'));
  const target = path.join(storeDir, 'attacker-controlled-target');
  const databasePath = path.join(storeDir, 'jobs.sqlite3');
  await writeFile(target, 'do-not-modify');
  await symlink(target, databasePath);
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await assert.rejects(queue.init(), /regular file/);
    assert.equal(await readFile(target, 'utf8'), 'do-not-modify');
    assert.equal(queue.initialized, false);
  } finally {
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});



test('initialization fails closed when the SQLite database path is a directory', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-initial-db-failure-'));
  await mkdir(path.join(storeDir, 'jobs.sqlite3'));
  let runnerCalls = 0;
  const queue = new ScanJobQueue({
    storeDir,
    runner: async () => { runnerCalls++; return complete(); },
  });
  try {
    await assert.rejects(queue.init(), /regular file/);
    assert.equal(queue.initialized, false);
    assert.equal(queue.storageFault, true);
    assert.equal(queue.jobs.size, 0);
    assert.equal(runnerCalls, 0);
    await assert.rejects(queue.submit({ workspace: jobWorkspacePath('foxy-initial-failure') }), /initialization previously failed/i);
  } finally {
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('concurrent init calls share one SQLite worker registration', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-concurrent-init-'));
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await Promise.all([queue.init(), queue.init(), queue.init()]);
    assert.equal(queue.initialized, true);
    assert.equal(queue.store.db.prepare('SELECT COUNT(*) AS count FROM workers').get().count, 1);
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
      if (workspace === jobWorkspacePath('foxy-aging-active')) {
        signalActive();
        await activeGate;
      } else executionOrder.push(workspace);
      return complete();
    },
  });
  try {
    await queue.init();
    await queue.submit({ workspace: jobWorkspacePath('foxy-aging-active'), scope: 'full' });
    await activeStarted;
    const older = await queue.submit({ workspace: jobWorkspacePath('foxy-aging-older'), scope: 'full', priority: 0 });
    now += 60_000;
    const newer = await queue.submit({ workspace: jobWorkspacePath('foxy-aging-newer'), scope: 'full', priority: 3 });
    const olderStatus = queue.getStatus(older.job_id);
    assert.ok(olderStatus.queue_wait_ms >= 60_000);
    assert.equal(olderStatus.execution_ms, null);
    releaseActive();
    await queue.wait(newer.job_id, 5000);
    await queue.wait(older.job_id, 5000);
    assert.deepEqual(executionOrder, [jobWorkspacePath('foxy-aging-older'), jobWorkspacePath('foxy-aging-newer')]);
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
