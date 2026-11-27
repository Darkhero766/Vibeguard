import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, open, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const jobWorkspacePath = (name) => path.join(os.tmpdir(), 'foxy-job-workspaces', name);
import { ScanJobQueue } from './agentshield-jobs.mjs';

const complete = (findings = []) => ({ status: 'complete', filesScanned: 1, findings,
  totalFindings: findings.length, coverage: 'synthetic complete fixture', findingsTruncated: false });
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
function errorCauseMessages(error) {
  const messages = [];
  const seen = new Set();
  for (let current = error; current && !seen.has(current); current = current.cause) {
    seen.add(current);
    if (typeof current.message === 'string') messages.push(current.message);
  }
  return messages.join('\\n');
}
function queueInitFailure(pattern) {
  return (error) => {
    assert.match(String(error?.message || ''), /Foxy SQLite queue initialization failed/);
    assert.match(String(error?.cause?.message || ''), pattern);
    return true;
  };
}
async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill();
  await exited;
}

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
    for (let i = 0; i < 1000; i++) {
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

test('legacy JSON migration checks the old shared beta.4 lock before reading its snapshot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foxy-legacy-live-writer-'));
  const storeDir = path.join(root, 'namespaced-store');
  const legacyStoreDir = path.join(root, 'shared-beta4-store');
  await mkdir(legacyStoreDir, { recursive: true });
  const snapshot = { version: 1, jobs: [] };
  await writeFile(path.join(legacyStoreDir, 'jobs.json'), JSON.stringify(snapshot));
  await writeFile(path.join(legacyStoreDir, 'jobs.lock'), JSON.stringify({
    pid: process.pid,
    host: os.hostname(),
    token: 'legacy-writer-live-fixture',
  }));
  const queue = new ScanJobQueue({
    storeDir, legacyStoreDir, authorizedRoots: [jobWorkspacePath('authorized')],
    runner: async () => complete(),
  });
  try {
    await assert.rejects(queue.init(), queueInitFailure(/legacy Foxy process is still using jobs\.json/));
    assert.equal(queue.initialized, false);
    assert.deepEqual(JSON.parse(await readFile(path.join(legacyStoreDir, 'jobs.json'), 'utf8')), snapshot);
    assert.equal(queue.store?.db, null, 'failed migration must close the SQLite handle');
  } finally {
    await queue.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a verified stale beta.4 lock blocks migration until operator cleanup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foxy-legacy-stale-lock-'));
  const storeDir = path.join(root, 'namespaced-store');
  const legacyStoreDir = path.join(root, 'shared-beta4-store');
  await mkdir(legacyStoreDir, { recursive: true });
  const workspace = jobWorkspacePath('stale-lock-repo');
  await mkdir(workspace, { recursive: true });
  const now = Date.now();
  const id = '66666666-6666-4666-8666-666666666666';
  const snapshot = {
    version: 1,
    jobs: [{
      id, type: 'scan_full', scope: 'full', status: 'queued', priority: 0,
      sequence: now, workspace, baseRef: null, idempotencyKey: null,
      fingerprint: 'f'.repeat(64), progress: 0, createdAt: now, updatedAt: now,
      retries: 0, result: null, error: null,
    }],
  };
  const snapshotPath = path.join(legacyStoreDir, 'jobs.json');
  const lockPath = path.join(legacyStoreDir, 'jobs.lock');
  const snapshotText = JSON.stringify(snapshot);
  const lockText = JSON.stringify({
    pid: 2147483647,
    host: os.hostname(),
    token: 'verified-dead-legacy-writer',
  });
  await writeFile(snapshotPath, snapshotText);
  await writeFile(lockPath, lockText);
  try {
    assert.throws(() => process.kill(2147483647, 0), (error) => error?.code === 'ESRCH',
      'the stale-lock fixture PID must not refer to a live process');
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  const queue = new ScanJobQueue({
    storeDir, legacyStoreDir, authorizedRoots: [await realpath(workspace)],
    runner: async () => complete(),
  });
  try {
    await assert.rejects(queue.init(), queueInitFailure(/stale beta\.4 Foxy job lock exists/));
    assert.equal(queue.initialized, false);
    assert.equal(queue.store.db, null, 'migration failure closes the unregistered SQLite handle');
    assert.equal(await readFile(lockPath, 'utf8'), lockText,
      'a stale beta.4 lock must be left untouched for operator inspection');
    assert.equal(await readFile(snapshotPath, 'utf8'), snapshotText,
      'migration must not touch the source snapshot while a stale lock exists');
    assert.equal(await access(path.join(storeDir, 'jobs.sqlite3')).then(() => true), true,
      'the isolated database may exist, but migration must not register a worker or import records');
    const check = new DatabaseSync(path.join(storeDir, 'jobs.sqlite3'));
    try {
      assert.equal(check.prepare('SELECT COUNT(*) AS count FROM workers').get().count, 0);
      assert.equal(check.prepare('SELECT COUNT(*) AS count FROM jobs').get().count, 0);
    } finally { check.close(); }
  } finally {
    await queue.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('beta.4 shared JSON migration imports only jobs under the current MCP allowlist', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foxy-legacy-root-filter-'));
  const storeDir = path.join(root, 'host-scoped-store');
  const legacyStoreDir = path.join(root, 'shared-beta4-store');
  await mkdir(legacyStoreDir, { recursive: true });
  const now = Date.now();
  const allowedWorkspace = jobWorkspacePath('legacy-repo-a');
  const otherWorkspace = jobWorkspacePath('legacy-repo-b');
  await mkdir(allowedWorkspace, { recursive: true });
  await mkdir(otherWorkspace, { recursive: true });
  const makeJob = (id, workspace, fingerprint) => ({
    id,
    type: 'scan_full',
    scope: 'full',
    status: 'running',
    priority: 0,
    sequence: now,
    workspace,
    baseRef: null,
    idempotencyKey: null,
    fingerprint,
    progress: 35,
    createdAt: now,
    updatedAt: now,
    retries: 0,
    result: null,
    error: null,
  });
  const allowedId = '33333333-3333-4333-8333-333333333333';
  const excludedId = '44444444-4444-4444-8444-444444444444';
  const snapshot = {
    version: 1,
    jobs: [
      makeJob(allowedId, allowedWorkspace, 'c'.repeat(64)),
      makeJob(excludedId, otherWorkspace, 'd'.repeat(64)),
    ],
  };
  const snapshotText = JSON.stringify(snapshot);
  const snapshotPath = path.join(legacyStoreDir, 'jobs.json');
  await writeFile(snapshotPath, snapshotText);
  const queue = new ScanJobQueue({
    storeDir,
    legacyStoreDir,
    authorizedRoots: [await realpath(allowedWorkspace)],
    runner: async () => complete(),
  });
  try {
    await queue.init();
    assert.equal(queue.getStatus(allowedId).status, 'interrupted');
    assert.match(queue.getStatus(allowedId).error, /UNKNOWN/);
    assert.equal(queue.getStatus(excludedId), null,
      'jobs belonging to another authorized repository must not enter this host store');
    const rows = queue.store.db.prepare('SELECT id FROM jobs ORDER BY id').all();
    assert.deepEqual(rows.map((row) => row.id), [allowedId]);
    assert.equal(await readFile(snapshotPath, 'utf8'), snapshotText,
      'the original shared beta.4 snapshot remains an untouched recovery copy');
    assert.equal(queue.store.db.prepare("SELECT value FROM queue_meta WHERE key='json_snapshot_migrated'").get().value, '1');
  } finally {
    await queue.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('beta.4 migration resolves symlinked workspace paths before importing findings', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foxy-legacy-symlink-filter-'));
  const storeDir = path.join(root, 'host-store');
  const legacyStoreDir = path.join(root, 'shared-beta4-store');
  const authorizedRoot = path.join(root, 'authorized');
  const legitimateWorkspace = path.join(authorizedRoot, 'repo-good');
  const externalWorkspace = path.join(root, 'outside-repo');
  const symlinkedWorkspace = path.join(authorizedRoot, 'repo-linked-outside');
  await mkdir(legacyStoreDir, { recursive: true });
  await mkdir(legitimateWorkspace, { recursive: true });
  await mkdir(externalWorkspace, { recursive: true });
  await symlink(externalWorkspace, symlinkedWorkspace,
    process.platform === 'win32' ? 'junction' : 'dir');
  const now = Date.now();
  const allowedId = '99999999-9999-4999-8999-999999999999';
  const escapedId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const makeJob = (id, workspace, fingerprint) => ({
    id, type: 'scan_full', scope: 'full', status: 'running', priority: 0,
    sequence: now, workspace, baseRef: null, idempotencyKey: null,
    fingerprint, progress: 25, createdAt: now, updatedAt: now,
    retries: 0, result: null, error: null,
  });
  const snapshot = {
    version: 1,
    jobs: [
      makeJob(allowedId, legitimateWorkspace, '9'.repeat(64)),
      makeJob(escapedId, symlinkedWorkspace, 'a'.repeat(64)),
    ],
  };
  const snapshotPath = path.join(legacyStoreDir, 'jobs.json');
  const snapshotText = JSON.stringify(snapshot);
  await writeFile(snapshotPath, snapshotText);
  const queue = new ScanJobQueue({
    storeDir, legacyStoreDir, authorizedRoots: [await realpath(authorizedRoot)],
    runner: async () => complete(),
  });
  try {
    await queue.init();
    assert.equal(queue.getStatus(allowedId).status, 'interrupted');
    assert.equal(queue.getStatus(escapedId), null,
      'a symlink lexically below an authorized root must not import findings from outside the root');
    assert.deepEqual(
      queue.store.db.prepare('SELECT id FROM jobs ORDER BY id').all().map((row) => row.id),
      [allowedId],
    );
    assert.equal(await readFile(snapshotPath, 'utf8'), snapshotText,
      'migration leaves the shared source snapshot unchanged');
  } finally {
    await queue.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('concurrent beta.5 host stores share a durable beta.4 migration guard without cross-root leakage', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foxy-legacy-concurrent-migration-'));
  const legacyStoreDir = path.join(root, 'shared-beta4-store');
  const storeA = path.join(root, 'host-a-store');
  const storeB = path.join(root, 'host-b-store');
  await mkdir(legacyStoreDir, { recursive: true });
  const now = Date.now();
  const workspaceA = jobWorkspacePath('legacy-concurrent-a');
  const workspaceB = jobWorkspacePath('legacy-concurrent-b');
  await mkdir(workspaceA, { recursive: true });
  await mkdir(workspaceB, { recursive: true });
  const idA = '77777777-7777-4777-8777-777777777777';
  const idB = '88888888-8888-4888-8888-888888888888';
  const makeJob = (id, workspace, fingerprint) => ({
    id, type: 'scan_full', scope: 'full', status: 'running', priority: 0,
    sequence: now, workspace, baseRef: null, idempotencyKey: null,
    fingerprint, progress: 15, createdAt: now, updatedAt: now,
    retries: 0, result: null, error: null,
  });
  const snapshot = {
    version: 1,
    jobs: [
      makeJob(idA, workspaceA, '7'.repeat(64)),
      makeJob(idB, workspaceB, '8'.repeat(64)),
    ],
  };
  const snapshotText = JSON.stringify(snapshot);
  const snapshotPath = path.join(legacyStoreDir, 'jobs.json');
  const lockPath = path.join(legacyStoreDir, 'jobs.lock');
  await writeFile(snapshotPath, snapshotText);
  const queueA = new ScanJobQueue({
    storeDir: storeA, legacyStoreDir, authorizedRoots: [await realpath(workspaceA)],
    runner: async () => complete(),
  });
  const queueB = new ScanJobQueue({
    storeDir: storeB, legacyStoreDir, authorizedRoots: [await realpath(workspaceB)],
    runner: async () => complete(),
  });
  try {
    // Deliberately race two independent scoped DB initializations against the
    // same old snapshot. The exclusive legacy lock path arbitrates the first
    // writer; subsequent beta.5 processes recognize the static guard marker.
    await Promise.all([queueA.init(), queueB.init()]);
    assert.equal(queueA.getStatus(idA).status, 'interrupted');
    assert.equal(queueA.getStatus(idB), null);
    assert.equal(queueB.getStatus(idB).status, 'interrupted');
    assert.equal(queueB.getStatus(idA), null);
    assert.equal(await readFile(snapshotPath, 'utf8'), snapshotText,
      'both migrations must leave the shared source snapshot byte-for-byte unchanged');
    assert.equal((await readFile(lockPath, 'utf8')).trim(), 'FOXY_BETA5_MIGRATION_GUARD_V1',
      'the old lock path becomes a durable beta.5 downgrade guard');
    await assert.rejects(open(lockPath, 'wx', 0o600), (error) => error?.code === 'EEXIST',
      'a beta.4 process using exclusive-create locking must not be able to start');
  } finally {
    await Promise.all([queueA.close(), queueB.close()]);
    await rm(root, { recursive: true, force: true });
  }
});

test('legacy shared migration fails closed when an old snapshot exists but no roots are authorized', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'foxy-legacy-no-roots-'));
  const storeDir = path.join(root, 'host-scoped-store');
  const legacyStoreDir = path.join(root, 'shared-beta4-store');
  await mkdir(legacyStoreDir, { recursive: true });
  const snapshot = { version: 1, jobs: [] };
  snapshot.jobs.push({
    id: '55555555-5555-4555-8555-555555555555',
    type: 'scan_full',
    scope: 'full',
    status: 'queued',
    priority: 0,
    sequence: 1,
    workspace: jobWorkspacePath('unknown-allowlist'),
    baseRef: null,
    idempotencyKey: null,
    fingerprint: 'e'.repeat(64),
    progress: 0,
    createdAt: 1,
    updatedAt: 1,
    retries: 0,
    result: null,
    error: null,
  });
  const snapshotPath = path.join(legacyStoreDir, 'jobs.json');
  const snapshotText = JSON.stringify(snapshot);
  await writeFile(snapshotPath, snapshotText);
  const queue = new ScanJobQueue({
    storeDir,
    legacyStoreDir,
    authorizedRoots: [],
    runner: async () => complete(),
  });
  try {
    await assert.rejects(queue.init(), (error) => /without configured authorized roots/.test(String(error?.cause?.message || '')));
    assert.equal(queue.initialized, false);
    assert.equal(await readFile(snapshotPath, 'utf8'), snapshotText);
  } finally {
    await queue.close();
    await rm(root, { recursive: true, force: true });
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
    import { ScanJobQueue } from ${JSON.stringify(pathToFileURL(queueModule).href)};
    import { writeSync } from 'node:fs';
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
    // Any process may claim any queued job in the shared queue. Do not close
    // this worker after only its own submissions finish: it may still own a
    // peer's job. Wait for the shared store to become fully quiescent first.
    for (let attempt = 0; attempt < 3000; attempt++) {
      const jobs = queue.store.listJobs();
      if (jobs.length === 6 && jobs.every((job) => job.status === 'completed')) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (attempt === 2999) {
        const states = queue.store.listJobs().map((job) => ({ id: job.id, status: job.status, error: job.error }));
        throw new Error('Timed out waiting for all shared jobs to complete: ' + JSON.stringify(states));
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
        const schemaReady = db.prepare("SELECT 1 AS ready FROM sqlite_master WHERE type='table' AND name='jobs'").get();
        if (schemaReady) {
          const running = db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status='running'").get().count;
          peakRunning = Math.max(peakRunning, running);
        }
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
    await Promise.all(children.map(stopChild));
    db?.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('a fingerprint-coalesced idempotency alias remains reserved after the job completes', async (t) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-idempotency-alias-'));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new ScanJobQueue({
    storeDir,
    runner: async () => { await gate; return complete(); },
  });
  try {
    const first = await queue.submit({ workspace: jobWorkspacePath('same-active-fingerprint') });
    for (let attempt = 0; attempt < 100 && queue.getStatus(first.job_id)?.status !== 'running'; attempt++) await tick();
    assert.equal(queue.getStatus(first.job_id).status, 'running');
    const alias = await queue.submit({
      workspace: jobWorkspacePath('same-active-fingerprint'),
      idempotency_key: 'fingerprint-coalesced-alias',
    });
    assert.equal(alias.job_id, first.job_id);
    assert.equal(alias.deduplicated, true);
    const persistedAlias = queue.store.db.prepare(
      'SELECT job_id,fingerprint FROM job_idempotency_keys WHERE idempotency_key=?',
    ).get('fingerprint-coalesced-alias');
    assert.equal(persistedAlias.job_id, first.job_id);
    assert.equal(persistedAlias.fingerprint, queue.store.getJob(first.job_id).fingerprint);

    release();
    const terminal = await queue.wait(first.job_id, 5000);
    assert.equal(terminal.status, 'completed');
    await assert.rejects(
      queue.submit({
        workspace: jobWorkspacePath('different-scan-same-key'),
        idempotency_key: 'fingerprint-coalesced-alias',
      }),
      /idempotency_key was already used for a different scan/,
    );
  } finally {
    release();
    await queue.close();
    await rm(storeDir,{recursive:true,force:true});
  }
});

test('fingerprint-coalesced idempotency aliases have a bounded per-job limit', async (t) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-idempotency-alias-limit-'));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const queue = new ScanJobQueue({
    storeDir,
    runner: async () => { await gate; return complete(); },
  });
  try {
    const first = await queue.submit({ workspace: jobWorkspacePath('alias-limit-repo') });
    for (let attempt = 0; attempt < 100 && queue.getStatus(first.job_id)?.status !== 'running'; attempt++) await tick();
    assert.equal(queue.getStatus(first.job_id).status, 'running');
    for (let index = 0; index < 16; index++) {
      const alias = await queue.submit({
        workspace: jobWorkspacePath('alias-limit-repo'),
        idempotency_key: 'bounded-alias-' + index,
      });
      assert.equal(alias.job_id, first.job_id);
      assert.equal(alias.deduplicated, true);
    }
    await assert.rejects(
      queue.submit({
        workspace: jobWorkspacePath('alias-limit-repo'),
        idempotency_key: 'bounded-alias-overflow',
      }),
      /idempotency-key alias limit/,
    );
    assert.equal(queue.store.db.prepare('SELECT COUNT(*) AS count FROM job_idempotency_keys WHERE job_id=?')
      .get(first.job_id).count, 16);
    assert.equal(queue.getStatus(first.job_id).status, 'running');
    assert.equal(queue.storageFault, false,
      'an alias capacity limit must not poison the shared SQLite queue');
    release();
    assert.equal((await queue.wait(first.job_id, 5000)).status, 'completed');
  } finally {
    release();
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('two processes coalesce the same idempotency key and reject key reuse for another scan', async (t) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-cross-process-idempotency-'));
  const queueModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'agentshield-jobs.mjs');
  const source = `
    import { ScanJobQueue } from ${JSON.stringify(pathToFileURL(queueModule).href)};
    import { writeSync } from 'node:fs';
    const [storeDir, label] = process.argv.slice(1);
    const queue = new ScanJobQueue({
      storeDir, concurrency: 2, maxQueued: 8,
      runner: async () => {
        await new Promise((resolve) => setTimeout(resolve, 180));
        return { status: 'complete', filesScanned: 1, findings: [], totalFindings: 0,
          coverage: 'idempotency fixture', findingsTruncated: false };
      },
    });
    await queue.init();
    const first = await queue.submit({
      workspace: '/tmp/foxy-shared-idempotency-workspace',
      idempotency_key: 'shared-across-processes',
    });
    writeSync(1, 'FIRST ' + label + ' ' + first.job_id + ' ' + String(first.deduplicated) + '\\n');
    let state;
    for (let attempt = 0; attempt < 500; attempt++) {
      state = queue.getStatus(first.job_id);
      if (state && ['completed','failed','cancelled','interrupted'].includes(state.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (state?.status !== 'completed') throw new Error('Shared idempotent job did not complete: ' + state?.status);
    let mismatchRejected = false;
    try {
      await queue.submit({
        workspace: '/tmp/foxy-different-idempotency-workspace',
        idempotency_key: 'shared-across-processes',
      });
    } catch (error) {
      mismatchRejected = /idempotency_key was already used/.test(String(error?.message));
    }
    if (!mismatchRejected) throw new Error('Reusing an idempotency key for a different scan was not rejected.');
    writeSync(1, 'DONE ' + label + '\\n');
    await queue.close();
  `;
  const children = ['alpha','beta'].map((label) => spawn(process.execPath, [
    '--input-type=module','-e',source,storeDir,label,
  ], { stdio: ['ignore','pipe','pipe'], windowsHide: true }));
  let output = '';
  let errors = '';
  for (const child of children) {
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
  }
  t.after(() => { for (const child of children) if (child.exitCode === null) child.kill(); });
  let db = null;
  try {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && !children.every((child) => child.exitCode !== null)) {
      if (!db && await (await import('node:fs/promises')).stat(path.join(storeDir,'jobs.sqlite3')).then(()=>true).catch(()=>false)) {
        db = new DatabaseSync(path.join(storeDir,'jobs.sqlite3'));
        db.exec('PRAGMA busy_timeout=10000;');
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(children.every((child) => child.exitCode !== null), 'idempotency processes timed out; '+errors+output);
    assert.deepEqual(children.map((child) => child.exitCode), [0,0], errors || output);
    const firstLines = [...output.matchAll(/^FIRST (alpha|beta) ([a-f0-9-]{36}) (true|false)$/gm)];
    assert.equal(firstLines.length, 2, output);
    assert.equal(firstLines[0][2], firstLines[1][2], 'both clients must receive the same job ID');
    assert.deepEqual(new Set(firstLines.map((match) => match[3])), new Set(['true','false']),
      'exactly one process creates the job while the other deduplicates it');
    assert.match(output,/DONE alpha/);
    assert.match(output,/DONE beta/);
    assert.ok(db);
    const jobs = db.prepare('SELECT id,status FROM jobs').all();
    assert.equal(jobs.length,1,'one durable job must exist for the shared idempotency key');
    assert.equal(jobs[0].status,'completed');
  } finally {
    await Promise.all(children.map(stopChild));
    db?.close();
    await rm(storeDir,{recursive:true,force:true});
  }
});

test('a second MCP process can cancel a job owned by another process', async (t) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-cross-process-cancel-'));
  const queueModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'agentshield-jobs.mjs');
  const workerSource = `
    import { ScanJobQueue } from ${JSON.stringify(pathToFileURL(queueModule).href)};
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
    import { ScanJobQueue } from ${JSON.stringify(pathToFileURL(queueModule).href)};
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
  let canceler = null;
  let workerOut = '';
  let workerErr = '';
  worker.stdout.on('data', (chunk) => { workerOut += chunk.toString(); });
  worker.stderr.on('data', (chunk) => { workerErr += chunk.toString(); });
  t.after(() => {
    if (worker.exitCode === null) worker.kill();
    if (canceler?.exitCode === null) canceler.kill();
  });
  try {
    const readyUntil = Date.now() + 10_000;
    while (!/^RUNNING [a-f0-9-]{36}$/m.test(workerOut) && Date.now() < readyUntil && worker.exitCode === null) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const id = workerOut.match(/^RUNNING ([a-f0-9-]{36})$/m)?.[1];
    assert.ok(id, 'first process should own a running job; ' + workerErr + workerOut);

    canceler = spawn(process.execPath, ['--input-type=module', '-e', `
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
    await Promise.all([stopChild(worker), stopChild(canceler)]);
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('a crashed subprocess lease turns its running job into interrupted on recovery', async (t) => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-process-crash-'));
  const queueModule = path.join(path.dirname(fileURLToPath(import.meta.url)), 'agentshield-jobs.mjs');
  const source = `
    import { ScanJobQueue } from ${JSON.stringify(pathToFileURL(queueModule).href)};
    import { writeSync } from 'node:fs';
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
    await stopChild(child);
    await rm(storeDir, { recursive: true, force: true });
  }
});

test('stale-worker recovery releases concurrency when the persisted job payload is corrupt', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-corrupt-stale-payload-'));
  const owner = new ScanJobQueue({
    storeDir,
    concurrency: 1,
    workerLeaseMs: 800,
    heartbeatIntervalMs: 100,
    runner: (_input, { signal }) => new Promise((_resolve, reject) => {
      const abort = () => reject(signal.reason || new Error('aborted'));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }),
  });
  const recovered = new ScanJobQueue({
    storeDir,
    concurrency: 1,
    workerLeaseMs: 800,
    heartbeatIntervalMs: 100,
    runner: async () => complete(),
  });
  try {
    await owner.init();
    const started = await owner.submit({ workspace: jobWorkspacePath('corrupt-payload-recovery') });
    for (let attempt = 0; attempt < 100 && owner.getStatus(started.job_id)?.status !== 'running'; attempt++) await tick();
    assert.equal(owner.getStatus(started.job_id).status, 'running');

    // Simulate an abrupt process stall and corrupt the JSON payload while
    // retaining its SQL ownership/index columns.
    clearInterval(owner.heartbeatTimer);
    owner.heartbeatTimer = null;
    owner.store.db.prepare('UPDATE jobs SET payload=? WHERE id=?').run('{not-json', started.job_id);
    owner.store.db.prepare('UPDATE workers SET heartbeat_at=? WHERE id=?')
      .run(Date.now() - 5000, owner.workerId);

    await recovered.init();
    const state = recovered.getStatus(started.job_id);
    assert.equal(state.status, 'interrupted');
    assert.match(state.error, /metadata was corrupt.*UNKNOWN/i);
    assert.equal(recovered.getResults(started.job_id).status, 'interrupted');
    assert.equal(recovered.store.db.prepare('SELECT COUNT(*) AS count FROM workers').get().count, 1,
      'the corrupt stale owner must be removed; only the recovering worker remains registered');
  } finally {
    await owner.close();
    await recovered.close();
    await rm(storeDir,{recursive:true,force:true});
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
    const completionDeadline = Date.now() + 30_000;
    while (Date.now() < completionDeadline
      && ids.some((id) => queue.getStatus(id)?.status !== 'completed')) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const unfinished = ids.map((id) => queue.getStatus(id))
      .filter((status) => status?.status !== 'completed');
    assert.deepEqual(unfinished, [],
      'all durably accepted jobs must finish within 30 seconds: ' + JSON.stringify(unfinished));
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
  let releaseRunner;
  const runnerGate = new Promise((resolve) => { releaseRunner = resolve; });
  const queue = new ScanJobQueue({ storeDir, runner: async () => { await runnerGate; return complete(); } });
  try {
    await assert.rejects(queue.submit({ workspace: alias }), /real directory/);
    const first = await queue.submit({ workspace });
    const second = await queue.submit({ workspace: path.join(alias, 'repo') });
    assert.equal(second.job_id, first.job_id,
      'a duplicate request through a symlinked parent must coalesce while the original scan is active');
    assert.equal(second.deduplicated, true);
    releaseRunner();
    await queue.wait(first.job_id, 5000);
  } finally {
    releaseRunner();
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


test('Windows SQLite store directories must remain inside the current user profile', async () => {
  if (process.platform !== 'win32') return;
  const storeDir = path.parse(os.homedir()).root;
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await assert.rejects(queue.init(), (error) =>
      /must remain inside the current user profile/.test(errorCauseMessages(error)),
    'Windows store rejection must preserve the user-profile boundary error through initialization wrappers.');
    assert.equal(queue.initialized, false);
    assert.equal(queue.store?.db, null,
      'an out-of-profile path must be rejected before opening a SQLite database');
  } finally {
    await queue.close();
  }
});

test('queue refuses a symlinked SQLite database without modifying its target', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-db-symlink-'));
  const target = path.join(storeDir, 'attacker-controlled-target');
  const databasePath = path.join(storeDir, 'jobs.sqlite3');
  await writeFile(target, 'do-not-modify');
  await symlink(target, databasePath);
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await assert.rejects(queue.init(), (error) => /regular file/.test(String(error?.cause?.message || '')));
    assert.equal(await readFile(target, 'utf8'), 'do-not-modify');
    assert.equal(queue.initialized, false);
  } finally {
    await queue.close();
    await rm(storeDir, { recursive: true, force: true });
  }
});



test('SQLite store rejects foreign and untagged databases before changing journal mode or file permissions', async () => {
  const cases = [
    { name: 'foreign application identity', applicationId: 123456789 },
    { name: 'unowned non-empty schema', applicationId: 0 },
  ];
  for (const fixture of cases) {
    const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-foreign-db-'));
    const databasePath = path.join(storeDir, 'jobs.sqlite3');
    const foreign = new DatabaseSync(databasePath);
    foreign.exec('CREATE TABLE unrelated_data(value TEXT);');
    foreign.exec('PRAGMA application_id=' + fixture.applicationId + '; PRAGMA journal_mode=DELETE;');
    foreign.close();

    let originalMode = null;
    if (process.platform !== 'win32') {
      const file = await open(databasePath, 'r+');
      try { await file.chmod(0o644); originalMode = (await file.stat()).mode & 0o777; }
      finally { await file.close(); }
    }

    const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
    try {
      await assert.rejects(queue.init(), (error) => {
        const message = String(error?.cause?.message || '');
        return fixture.applicationId === 0
          ? /non-empty SQLite database without Foxy application identity/.test(message)
          : /owned by another application/.test(message);
      });
      const verify = new DatabaseSync(databasePath, { readOnly: true });
      try {
        assert.equal(verify.prepare('PRAGMA journal_mode').get().journal_mode, 'delete',
          'rejected storage must not be converted to WAL');
        assert.equal(verify.prepare('PRAGMA application_id').get().application_id, fixture.applicationId);
        assert.equal(verify.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name='unrelated_data'").get().count, 1,
          'rejected storage must retain its original schema');
      } finally { verify.close(); }
      if (originalMode !== null) {
        const file = await open(databasePath, 'r');
        try { assert.equal((await file.stat()).mode & 0o777, originalMode, 'rejected storage permissions must remain unchanged'); }
        finally { await file.close(); }
      }
    } finally {
      await queue.close();
      await rm(storeDir, { recursive: true, force: true });
    }
  }
});

test('worker registration is durably removed when startup pruning fails', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-startup-prune-failure-'));
  const first = new ScanJobQueue({ storeDir, runner: async () => complete() });
  const databasePath = path.join(storeDir, 'jobs.sqlite3');
  let observer = null;
  const second = new ScanJobQueue({ storeDir, runner: async () => complete() });
  try {
    await first.init();
    await first.close();
    observer = new DatabaseSync(databasePath);
    observer.exec('PRAGMA busy_timeout=10000;');
    const expired = {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'failed',
      createdAt: 1,
      updatedAt: 1,
      finishedAt: 1,
      priority: 0,
      sequence: 1,
      fingerprint: 'b'.repeat(64),
      workspace: jobWorkspacePath('expired-history'),
      result: null,
      error: 'expired fixture',
    };
    observer.exec(`
      CREATE TRIGGER reject_expired_history
      BEFORE DELETE ON jobs
      WHEN OLD.status IN ('completed','failed','cancelled','interrupted')
      BEGIN SELECT RAISE(ABORT, 'synthetic retention failure'); END;
    `);
    observer.prepare(`INSERT INTO jobs(
      id,status,created_at,updated_at,finished_at,priority,sequence,fingerprint,idempotency_key,
      workspace,owner_worker_id,cancel_requested,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      expired.id, expired.status, expired.createdAt, expired.updatedAt, expired.finishedAt,
      expired.priority, expired.sequence, expired.fingerprint, null, expired.workspace, null, 0, JSON.stringify(expired),
    );
    observer.close();
    observer = null;

    await assert.rejects(second.init(), /SQLite queue initialization failed/);
    const check = new DatabaseSync(databasePath);
    try {
      assert.equal(check.prepare('SELECT COUNT(*) AS count FROM workers').get().count, 0,
        'failed startup must not leave a worker row counted against shared concurrency');
      assert.equal(check.prepare('SELECT COUNT(*) AS count FROM jobs WHERE id=?').get(expired.id).count, 1,
        'retention failure must not erase the expired history fixture');
    } finally { check.close(); }
  } finally {
    observer?.close();
    await first.close();
    await second.close();
    await rm(storeDir,{recursive:true,force:true});
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
    await assert.rejects(queue.init(), (error) => /regular file/.test(String(error?.cause?.message || '')));
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

test('close waits for in-flight initialization before releasing the SQLite worker', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-init-close-race-'));
  const queue = new ScanJobQueue({ storeDir, runner: async () => complete() });
  const originalInitialize = queue.initializeStore.bind(queue);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  queue.initializeStore = async () => { await gate; return originalInitialize(); };
  let closeSettled = false;
  try {
    const initialization = queue.init();
    await tick();
    const closing = queue.close().finally(() => { closeSettled = true; });
    await tick();
    assert.equal(closeSettled, false, 'close must wait for pending store initialization');
    release();
    await Promise.all([initialization, closing]);
    assert.equal(queue.initialized, false);
    assert.equal(queue.store.db, null);
    const check = new DatabaseSync(path.join(storeDir, 'jobs.sqlite3'));
    try {
      assert.equal(check.prepare('SELECT COUNT(*) AS count FROM workers').get().count, 0,
        'shutdown must release the worker registered by the completed initialization');
    } finally { check.close(); }
  } finally {
    release();
    await queue.close();
    await rm(storeDir,{recursive:true,force:true});
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


test('graceful shutdown recovers a corrupt running payload as UNKNOWN and releases its worker slot', async () => {
  const storeDir = await mkdtemp(path.join(os.tmpdir(), 'foxy-shutdown-corrupt-'));
  let signalStarted;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const queue = new ScanJobQueue({
    storeDir,
    concurrency: 1,
    runner: async (_input, { signal }) => {
      signalStarted();
      await new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason || new Error('aborted'));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
      return complete();
    },
  });
  try {
    const submitted = await queue.submit({ workspace: jobWorkspacePath('foxy-shutdown-corrupt'), scope: 'full' });
    await started;
    const databasePath = path.join(storeDir, 'jobs.sqlite3');
    queue.store.db.prepare('UPDATE jobs SET payload=? WHERE id=?').run('{corrupt-json', submitted.job_id);
    // Prevent the in-flight runner's normal finish path from repairing the
    // payload first. This forces unregisterWorker() to exercise its shutdown
    // corruption fallback and prove that worker ownership is still released.
    queue.store.finishJob = () => false;

    await queue.close();
    assert.equal(queue.storageFault, true, 'the failed normal finish must be recorded as a storage fault');

    const verify = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.equal(verify.prepare('SELECT COUNT(*) AS count FROM workers').get().count, 0,
        'graceful shutdown must not strand a worker row after payload corruption');
      const row = verify.prepare('SELECT status,owner_worker_id,payload FROM jobs WHERE id=?').get(submitted.job_id);
      assert.equal(row.status, 'interrupted');
      assert.equal(row.owner_worker_id, null);
      const recovered = JSON.parse(row.payload);
      assert.equal(recovered.status, 'interrupted');
      assert.equal(recovered.result, null);
      assert.match(recovered.error, /UNKNOWN/i);
    } finally { verify.close(); }
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
    // The fixture advances its logical clock to test priority aging. Keep the
    // worker lease beyond that artificial interval.
    workerLeaseMs: 120_000,
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
