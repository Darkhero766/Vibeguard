// Transactional, cross-process local queue storage for Foxy / AgentShield.
// SQLite serializes writers; worker leases recover jobs after process crashes.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import { mkdir, lstat, chmod, open, readFile, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const MAX_RECORDS = 200;
const MAX_STATE_BYTES = 8_000_000;
const TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000;

function encodeJob(job) {
  const { workerId, cancelRequested, ...persisted } = job;
  return JSON.stringify(persisted);
}

function decodeJob(row) {
  if (!row) return null;
  let job;
  try { job = JSON.parse(row.payload); } catch { throw new Error('Foxy SQLite job payload is not valid JSON.'); }
  return { ...job, workerId: row.owner_worker_id || null, cancelRequested: Boolean(row.cancel_requested) };
}

function validateLegacyJob(job) {
  if (!job || typeof job !== 'object' || Array.isArray(job)
    || typeof job.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(job.id)
    || !['queued', 'running', ...TERMINAL].includes(job.status)
    || typeof job.workspace !== 'string' || !path.isAbsolute(job.workspace) || job.workspace.length > 4096
    || typeof job.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(job.fingerprint)
    || !['changed', 'full'].includes(job.scope)
    || !Number.isInteger(job.priority) || job.priority < 0 || job.priority > 3
    || !Number.isFinite(job.createdAt) || !Number.isFinite(job.updatedAt)
    || !Number.isInteger(job.progress) || job.progress < 0 || job.progress > 100
    || !Number.isInteger(job.retries) || job.retries < 0 || job.retries > 2) {
    throw new Error('Legacy JSON job state contains an invalid record; refusing migration.');
  }
  if (job.status === 'completed') {
    if (!job.result || typeof job.result !== 'object' || Array.isArray(job.result)
      || !['complete', 'partial_coverage'].includes(job.result.status)
      || !Array.isArray(job.result.findings) || job.result.findings.length > 1000
      || job.result.findings.some((finding) => !finding || typeof finding !== 'object' || Array.isArray(finding))
      || !Number.isSafeInteger(job.result.filesScanned) || job.result.filesScanned < 0
      || !Number.isSafeInteger(job.result.totalFindings) || job.result.totalFindings < job.result.findings.length) {
      throw new Error('Legacy completed job result is invalid; refusing migration.');
    }
  }
  if (job.status !== 'completed' && job.result !== null) throw new Error('Legacy non-completed job unexpectedly contains a result.');
}

export class ScanJobStore {
  constructor({ storeDir, workerId, concurrency, maxQueued, workerLeaseMs = 20_000, now = Date.now } = {}) {
    if (!path.isAbsolute(storeDir || '')) throw new Error('Job store path must be absolute.');
    if (typeof workerId !== 'string' || !workerId) throw new TypeError('Worker ID is required.');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new TypeError('Invalid worker concurrency.');
    if (!Number.isInteger(maxQueued) || maxQueued < 1 || maxQueued > 100) throw new TypeError('Invalid queue bound.');
    if (!Number.isInteger(workerLeaseMs) || workerLeaseMs < 500 || workerLeaseMs > 120_000) throw new TypeError('Worker lease must be between 500 ms and 120 seconds.');
    this.storeDir = storeDir;
    this.workerId = workerId;
    this.concurrency = concurrency;
    this.maxQueued = maxQueued;
    this.workerLeaseMs = workerLeaseMs;
    this.now = now;
    this.db = null;
    this.databasePath = null;
    this.host = hostname();
  }

  async initialize() {
    await mkdir(this.storeDir, { recursive: true, mode: 0o700 });
    const beforeDir = await lstat(this.storeDir);
    if (!beforeDir.isDirectory() || beforeDir.isSymbolicLink()) throw new Error('Job store must be a real directory.');
    await chmod(this.storeDir, 0o700);
    this.storeDir = await realpath(this.storeDir);
    this.databasePath = path.join(this.storeDir, 'jobs.sqlite3');

    let before = await lstat(this.databasePath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    if (!before) {
      try {
        const handle = await open(this.databasePath, 'wx', 0o600);
        try { await handle.sync(); } finally { await handle.close(); }
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
      before = await lstat(this.databasePath);
    }
    if (!before.isFile() || before.isSymbolicLink()) throw new Error('Foxy SQLite database path is not a regular file.');
    const verify = await open(this.databasePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await verify.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
        throw new Error('Foxy SQLite database identity changed during open.');
      }
    } finally { await verify.close(); }

    this.db = new DatabaseSync(this.databasePath);
    await chmod(this.databasePath, 0o600);
    const after = await lstat(this.databasePath);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino) {
      this.db.close();
      this.db = null;
      throw new Error('Foxy SQLite database path changed while opening.');
    }

    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; PRAGMA trusted_schema=OFF;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS workers (
        id TEXT PRIMARY KEY,
        pid INTEGER NOT NULL,
        host TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        heartbeat_at INTEGER NOT NULL,
        concurrency INTEGER NOT NULL,
        max_queued INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed','cancelled','interrupted')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        finished_at INTEGER,
        priority INTEGER NOT NULL,
        sequence INTEGER NOT NULL,
        fingerprint TEXT NOT NULL,
        idempotency_key TEXT,
        workspace TEXT NOT NULL,
        owner_worker_id TEXT,
        cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)),
        payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status, created_at);
      CREATE INDEX IF NOT EXISTS jobs_fingerprint_status ON jobs(fingerprint, status);
      CREATE INDEX IF NOT EXISTS jobs_idempotency ON jobs(idempotency_key);
      CREATE INDEX IF NOT EXISTS jobs_owner_status ON jobs(owner_worker_id, status);
      INSERT INTO queue_meta(key,value) VALUES('schema_version','1')
        ON CONFLICT(key) DO NOTHING;
    `);
    const schemaVersion = this.db.prepare("SELECT value FROM queue_meta WHERE key='schema_version'").get()?.value;
    if (schemaVersion !== '1') throw new Error('Unsupported Foxy SQLite queue schema version.');

    await this.#migrateLegacySnapshot();
    this.#transaction(() => {
      const now = this.now();
      this.#recoverStaleWorkersTx(now);
      const foreign = this.db.prepare('SELECT id,host FROM workers WHERE host <> ?').all(this.host);
      if (foreign.length) throw new Error('Foxy queue database is active from another host; SQLite WAL stores must remain on one local machine.');
      this.db.prepare('INSERT INTO workers(id,pid,host,started_at,heartbeat_at,concurrency,max_queued) VALUES(?,?,?,?,?,?,?)')
        .run(this.workerId, process.pid, this.host, now, now, this.concurrency, this.maxQueued);
    });
    this.#prune();
  }

  #transaction(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  async #migrateLegacySnapshot() {
    const marker = this.db.prepare("SELECT value FROM queue_meta WHERE key='json_snapshot_migrated'").get();
    if (marker?.value === '1') return;
    const legacyPath = path.join(this.storeDir, 'jobs.json');
    const legacyLockPath = path.join(this.storeDir, 'jobs.lock');

    // A beta.4 process still holding the JSON snapshot lock may write after
    // we've read it. Never migrate a moving snapshot or race the old writer.
    const lockInfo = await lstat(legacyLockPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    if (lockInfo) {
      if (!lockInfo.isFile() || lockInfo.isSymbolicLink() || lockInfo.size > 4096) {
        throw new Error('Legacy Foxy job lock is unsafe; stop all Foxy processes and inspect the lock before migration.');
      }
      const lockHandle = await open(legacyLockPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      let legacyOwner;
      try {
        const opened = await lockHandle.stat();
        if (opened.dev !== lockInfo.dev || opened.ino !== lockInfo.ino || opened.size > 4096) {
          throw new Error('Legacy Foxy job lock changed while opening; refusing migration.');
        }
        legacyOwner = JSON.parse(await lockHandle.readFile('utf8'));
      } finally { await lockHandle.close(); }
      if (legacyOwner.host !== this.host || !Number.isInteger(legacyOwner.pid) || !legacyOwner.token) {
        throw new Error('Legacy Foxy job lock belongs to another host or is invalid; refusing migration.');
      }
      try {
        process.kill(legacyOwner.pid, 0);
        throw new Error('A legacy Foxy process is still using jobs.json. Stop it cleanly before starting this SQLite queue.');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }

    const info = await lstat(legacyPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    this.legacyMigration = (async () => {
      let jobs = [];
      if (info) {
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_STATE_BYTES) {
          throw new Error('Legacy JSON job state is unsafe or over its size limit.');
        }
        const handle = await open(legacyPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        let raw;
        try {
          const opened = await handle.stat();
          if (opened.dev !== info.dev || opened.ino !== info.ino || opened.size > MAX_STATE_BYTES) {
            throw new Error('Legacy JSON job state changed while opening.');
          }
          raw = await handle.readFile('utf8');
        } finally { await handle.close(); }
        const parsed = JSON.parse(raw);
        if (parsed?.version !== 1 || !Array.isArray(parsed.jobs) || parsed.jobs.length > MAX_RECORDS) {
          throw new Error('Legacy JSON job state format is invalid.');
        }
        jobs = parsed.jobs;
        for (const job of jobs) validateLegacyJob(job);
      }
      this.#transaction(() => {
        const stillMissing = this.db.prepare("SELECT value FROM queue_meta WHERE key='json_snapshot_migrated'").get();
        if (stillMissing?.value === '1') return;
        const insert = this.db.prepare(`INSERT OR IGNORE INTO jobs(
          id,status,created_at,updated_at,finished_at,priority,sequence,fingerprint,idempotency_key,workspace,owner_worker_id,cancel_requested,payload
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        for (const source of jobs) {
          const job = { ...source };
          let status = job.status;
          if (status === 'running') {
            status = 'interrupted';
            job.status = status;
            job.result = null;
            job.error = 'The server process ended before this scan completed. The outcome is UNKNOWN; submit a new scan.';
            job.finishedAt = this.now();
            job.updatedAt = job.finishedAt;
          }
          insert.run(
            job.id, status, job.createdAt, job.updatedAt, job.finishedAt ?? null, job.priority, job.sequence ?? job.createdAt,
            job.fingerprint, job.idempotencyKey ?? null, job.workspace, null, 0, encodeJob(job),
          );
        }
        this.db.prepare("INSERT INTO queue_meta(key,value) VALUES('json_snapshot_migrated','1') ON CONFLICT(key) DO UPDATE SET value='1'").run();
      });
    })();
    return this.legacyMigration;
  }

  #recoverStaleWorkersTx(now) {
    const cutoff = now - this.workerLeaseMs;
    const stale = this.db.prepare('SELECT id FROM workers WHERE heartbeat_at < ?').all(cutoff);
    const update = this.db.prepare('UPDATE jobs SET status=?,updated_at=?,finished_at=?,owner_worker_id=NULL,cancel_requested=0,payload=? WHERE id=?');
    for (const { id } of stale) {
      const rows = this.db.prepare("SELECT id,payload FROM jobs WHERE status='running' AND owner_worker_id=?").all(id);
      for (const row of rows) {
        const job = JSON.parse(row.payload);
        job.status = 'interrupted';
        job.result = null;
        job.error = 'The Foxy worker stopped heartbeating before this scan completed. The outcome is UNKNOWN; submit a new scan.';
        job.updatedAt = now;
        job.finishedAt = now;
        update.run('interrupted', now, now, encodeJob(job), job.id);
      }
      this.db.prepare('DELETE FROM workers WHERE id=?').run(id);
    }
  }

  heartbeat() {
    return this.#transaction(() => {
      const now = this.now();
      this.#recoverStaleWorkersTx(now);
      const updated = this.db.prepare('UPDATE workers SET heartbeat_at=? WHERE id=? AND host=?')
        .run(now, this.workerId, this.host);
      if (updated.changes !== 1) throw new Error('Foxy worker lease was lost; local scans must fail closed.');
    });
  }

  createJob(job) {
    return this.#transaction(() => {
      this.#recoverStaleWorkersTx(this.now());
      if (job.idempotencyKey) {
        const existing = this.db.prepare('SELECT * FROM jobs WHERE idempotency_key=? ORDER BY created_at DESC LIMIT 1').get(job.idempotencyKey);
        if (existing) {
          const prior = decodeJob(existing);
          if (prior.fingerprint !== job.fingerprint) throw new Error('idempotency_key was already used for a different scan.');
          return { job: prior, deduplicated: true };
        }
      }
      const active = this.db.prepare("SELECT * FROM jobs WHERE fingerprint=? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1").get(job.fingerprint);
      if (active) return { job: decodeJob(active), deduplicated: true };
      const limits = this.db.prepare('SELECT MIN(max_queued) AS max_queued FROM workers').get();
      const maxQueued = limits?.max_queued ?? this.maxQueued;
      const queued = this.db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status='queued'").get().count;
      if (queued >= maxQueued) throw new Error('Scan queue is full; wait for a slot and retry.');
      this.#insertJobTx(job);
      this.#pruneTx(this.now());
      return { job: { ...job, workerId: null, cancelRequested: false }, deduplicated: false };
    });
  }

  #insertJobTx(job) {
    const payload = encodeJob(job);
    this.db.prepare(`INSERT INTO jobs(
      id,status,created_at,updated_at,finished_at,priority,sequence,fingerprint,idempotency_key,workspace,owner_worker_id,cancel_requested,payload
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      job.id, job.status, job.createdAt, job.updatedAt, job.finishedAt ?? null, job.priority, job.sequence ?? job.createdAt,
      job.fingerprint, job.idempotencyKey ?? null, job.workspace, null, 0, payload,
    );
  }

  claimNext() {
    return this.#transaction(() => {
      const now = this.now();
      this.#recoverStaleWorkersTx(now);
      const worker = this.db.prepare('SELECT * FROM workers WHERE id=? AND host=?').get(this.workerId, this.host);
      if (!worker || now - worker.heartbeat_at > this.workerLeaseMs) throw new Error('Foxy worker lease expired before claiming work.');
      const limit = this.db.prepare('SELECT MIN(concurrency) AS concurrency FROM workers').get()?.concurrency ?? this.concurrency;
      const running = this.db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status='running'").get().count;
      if (running >= limit) return null;
      const queued = this.db.prepare("SELECT * FROM jobs WHERE status='queued'").all().map(decodeJob);
      if (!queued.length) return null;
      queued.sort((a, b) => {
        const aScore = a.priority + Math.floor(Math.max(0, now - a.createdAt) / 15_000);
        const bScore = b.priority + Math.floor(Math.max(0, now - b.createdAt) / 15_000);
        return bScore - aScore || (a.sequence ?? a.createdAt) - (b.sequence ?? b.createdAt);
      });
      const job = queued[0];
      job.status = 'running';
      job.startedAt = now;
      job.updatedAt = now;
      job.progress = 1;
      job.workerId = this.workerId;
      job.cancelRequested = false;
      const changed = this.db.prepare(`UPDATE jobs SET status='running',updated_at=?,owner_worker_id=?,cancel_requested=0,payload=?
        WHERE id=? AND status='queued'`).run(now, this.workerId, encodeJob(job), job.id);
      if (changed.changes !== 1) return null;
      return job;
    });
  }

  updateProgress(id, progress) {
    return this.#transaction(() => {
      const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
      if (!row || row.status !== 'running' || row.owner_worker_id !== this.workerId || row.cancel_requested) return null;
      const job = decodeJob(row);
      job.progress = Math.max(job.progress, Math.min(99, Math.floor(Number(progress) || 0)));
      job.updatedAt = this.now();
      this.db.prepare('UPDATE jobs SET updated_at=?,payload=? WHERE id=? AND owner_worker_id=? AND status=\'running\'')
        .run(job.updatedAt, encodeJob(job), id, this.workerId);
      return job;
    });
  }

  getJob(id) {
    return decodeJob(this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id));
  }

  listJobs() {
    return this.db.prepare('SELECT * FROM jobs ORDER BY created_at').all().map(decodeJob);
  }

  isCancelRequested(id) {
    const row = this.db.prepare('SELECT cancel_requested,owner_worker_id,status FROM jobs WHERE id=?').get(id);
    return Boolean(row && row.status === 'running' && row.owner_worker_id === this.workerId && row.cancel_requested);
  }

  requestCancel(id) {
    return this.#transaction(() => {
      const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
      if (!row) return null;
      const job = decodeJob(row);
      if (job.status === 'queued') {
        const now = this.now();
        job.status = 'cancelled';
        job.error = 'Scan was cancelled before it started.';
        job.finishedAt = now;
        job.updatedAt = now;
        this.db.prepare("UPDATE jobs SET status='cancelled',updated_at=?,finished_at=?,owner_worker_id=NULL,cancel_requested=0,payload=? WHERE id=? AND status='queued'")
          .run(now, now, encodeJob(job), id);
        return { job, queued: true };
      }
      if (job.status === 'running') {
        const now = this.now();
        job.cancelRequested = true;
        job.updatedAt = now;
        this.db.prepare("UPDATE jobs SET updated_at=?,cancel_requested=1,payload=? WHERE id=? AND status='running'")
          .run(now, encodeJob(job), id);
        return { job, queued: false };
      }
      return { job, queued: false };
    });
  }

  finishJob(job) {
    return this.#transaction(() => {
      const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(job.id);
      if (!row || row.status !== 'running' || row.owner_worker_id !== this.workerId) return null;
      const current = decodeJob(row);
      const now = this.now();
      if (row.cancel_requested) {
        job.status = 'cancelled';
        job.result = null;
        job.error = 'Scan was cancelled.';
      }
      job.updatedAt = Math.max(job.updatedAt || 0, now);
      if (TERMINAL.has(job.status)) job.finishedAt = now;
      job.workerId = null;
      job.cancelRequested = false;
      this.db.prepare('UPDATE jobs SET status=?,updated_at=?,finished_at=?,owner_worker_id=NULL,cancel_requested=0,payload=? WHERE id=? AND owner_worker_id=? AND status=\'running\'')
        .run(job.status, job.updatedAt, job.finishedAt ?? null, encodeJob(job), job.id, this.workerId);
      this.#pruneTx(now);
      return { ...job };
    });
  }

  #prune() {
    return this.#transaction(() => this.#pruneTx(this.now()));
  }

  #pruneTx(now) {
    this.db.prepare("DELETE FROM jobs WHERE status IN ('completed','failed','cancelled','interrupted') AND finished_at IS NOT NULL AND finished_at <= ?")
      .run(now - TERMINAL_RETENTION_MS);
    let counts = this.db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END) AS active, SUM(length(payload)) AS bytes FROM jobs").get();
    const removeOldest = this.db.prepare("SELECT id FROM jobs WHERE status IN ('completed','failed','cancelled','interrupted') ORDER BY COALESCE(finished_at,updated_at),created_at LIMIT 1");
    while ((counts.total > MAX_RECORDS || counts.bytes > MAX_STATE_BYTES) && counts.total > counts.active) {
      const candidate = removeOldest.get();
      if (!candidate) break;
      this.db.prepare('DELETE FROM jobs WHERE id=?').run(candidate.id);
      counts = this.db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END) AS active, SUM(length(payload)) AS bytes FROM jobs").get();
    }
    if (counts.active > MAX_RECORDS || counts.bytes > MAX_STATE_BYTES) {
      throw new Error('Active Foxy job state exceeds the bounded SQLite storage budget.');
    }
  }

  unregisterWorker() {
    return this.#transaction(() => {
      const now = this.now();
      const rows = this.db.prepare("SELECT id,payload FROM jobs WHERE status='running' AND owner_worker_id=?").all(this.workerId);
      for (const row of rows) {
        const job = JSON.parse(row.payload);
        job.status = 'interrupted';
        job.result = null;
        job.error = 'The Foxy server stopped before this scan completed. The outcome is UNKNOWN.';
        job.updatedAt = now;
        job.finishedAt = now;
        this.db.prepare("UPDATE jobs SET status='interrupted',updated_at=?,finished_at=?,owner_worker_id=NULL,cancel_requested=0,payload=? WHERE id=?")
          .run(now, now, encodeJob(job), job.id);
      }
      this.db.prepare('DELETE FROM workers WHERE id=?').run(this.workerId);
      this.#pruneTx(now);
    });
  }

  close() {
    if (!this.db) return;
    this.db.close();
    this.db = null;
  }
}
