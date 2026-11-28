// Transactional, cross-process local queue storage for Foxy / AgentShield.
// SQLite serializes writers; worker leases recover jobs after process crashes.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { hostname, homedir } from 'node:os';
import path from 'node:path';
import { mkdir, lstat, chmod, open, readFile, realpath, link, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';

const FOXY_SQLITE_APPLICATION_ID = 1447514958; // ASCII 'VGSN'
const LEGACY_MIGRATION_GUARD = 'FOXY_BETA5_MIGRATION_GUARD_V1';
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const SQLITE_BUSY_CODES = new Set([5, 6]);
const MAX_RECORDS = 200;
const MAX_STATE_BYTES = 8_000_000;
const MAX_IDEMPOTENCY_KEYS_PER_JOB = 16;
const MAX_IDEMPOTENCY_KEYS_TOTAL = MAX_RECORDS * MAX_IDEMPOTENCY_KEYS_PER_JOB;
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

async function enableWalModeWithRetry(database) {
  // SQLite may return SQLITE_BUSY when two new MCP processes concurrently
  // switch the same freshly-created database to WAL. This is an idempotent
  // transition: retry only BUSY/LOCKED, keep the wait bounded, and never
  // accept DELETE/TRUNCATE mode as a fallback.
  const attempts = 32;
  let lastBusyError = null;
  database.exec('PRAGMA busy_timeout=100;');
  try {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const journal = database.prepare('PRAGMA journal_mode=WAL').get();
        if (String(journal?.journal_mode || '').toLowerCase() === 'wal') return;
        throw new Error('Foxy job store requires SQLite WAL mode on a local filesystem; no weaker journal fallback is permitted.');
      } catch (error) {
        const busy = SQLITE_BUSY_CODES.has(Number(error?.errcode))
          || /database (?:is )?(?:locked|busy)|database table is locked/i.test(String(error?.message || ''));
        if (!busy) throw error;
        lastBusyError = error;
        if (attempt + 1 < attempts) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(100, 20 + attempt * 3)));
        }
      }
    }
    throw new Error('Foxy SQLite journal-mode initialization remained busy after bounded retries; no scans were accepted.', {
      cause: lastBusyError,
    });
  } finally {
    database.exec('PRAGMA busy_timeout=10000;');
  }
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
  constructor({ storeDir, legacyStoreDir = storeDir, authorizedRoots = null, workerId, concurrency, maxQueued, workerLeaseMs = 20_000, now = Date.now } = {}) {
    if (!path.isAbsolute(storeDir || '')) throw new Error('Job store path must be absolute.');
    if (!path.isAbsolute(legacyStoreDir || '')) throw new Error('Legacy job store path must be absolute.');
    if (authorizedRoots !== null && (!Array.isArray(authorizedRoots) || authorizedRoots.some((root) => typeof root !== 'string' || !path.isAbsolute(root)))) {
      throw new Error('Authorized roots for legacy job migration must be canonical absolute paths.');
    }
    if (typeof workerId !== 'string' || !workerId) throw new TypeError('Worker ID is required.');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new TypeError('Invalid worker concurrency.');
    if (!Number.isInteger(maxQueued) || maxQueued < 1 || maxQueued > 100) throw new TypeError('Invalid queue bound.');
    if (!Number.isInteger(workerLeaseMs) || workerLeaseMs < 500 || workerLeaseMs > 120_000) throw new TypeError('Worker lease must be between 500 ms and 120 seconds.');
    this.storeDir = storeDir;
    this.legacyStoreDir = legacyStoreDir;
    this.authorizedRoots = authorizedRoots === null ? null : [...new Set(authorizedRoots.map((root) => path.resolve(root)))];
    this.workerId = workerId;
    this.concurrency = concurrency;
    this.maxQueued = maxQueued;
    this.workerLeaseMs = workerLeaseMs;
    this.now = now;
    this.db = null;
    this.databasePath = null;
    this.workerRegistered = false;
    this.host = hostname();
  }

  async initialize() {
    await mkdir(this.storeDir, { recursive: true, mode: 0o700 });
    const beforeDir = await lstat(this.storeDir);
    if (!beforeDir.isDirectory() || beforeDir.isSymbolicLink()) throw new Error('Job store must be a real directory.');
    if (process.platform !== 'win32') await chmod(this.storeDir, 0o700);
    this.storeDir = await realpath(this.storeDir);
    if (process.platform === 'win32') {
      // Windows does not expose POSIX chmod bits as a trustworthy ACL check.
      // Keep the database below the current user profile so its directory ACL
      // inheritance follows the OS-managed user-profile security boundary.
      const profileRoot = await realpath(homedir());
      const relative = path.relative(profileRoot, this.storeDir);
      if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
        throw new Error('On Windows, Foxy SQLite storage must remain inside the current user profile for inherited ACL protection.');
      }
    }
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
    const permissionHandle = await open(this.databasePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await permissionHandle.stat();
      const openedPath = await lstat(this.databasePath);
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
        || !openedPath.isFile() || openedPath.isSymbolicLink()
        || openedPath.dev !== before.dev || openedPath.ino !== before.ino) {
        throw new Error('Foxy SQLite database identity changed while opening; refusing to alter its permissions.');
      }

      // Inspect the database identity before any persistent PRAGMA or
      // permission change. The configured store path may contain an unrelated
      // SQLite database; opening it must not silently convert it to WAL or chmod it.
      this.db.exec('PRAGMA busy_timeout=10000; PRAGMA trusted_schema=OFF;');
      const applicationId = Number(this.db.prepare('PRAGMA application_id').get()?.application_id || 0);
      if (applicationId !== 0 && applicationId !== FOXY_SQLITE_APPLICATION_ID) {
        throw new Error('Refusing to open a SQLite database owned by another application.');
      }
      const schemaObjects = Number(this.db.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'",
      ).get()?.count || 0);
      if (applicationId === 0 && schemaObjects !== 0) {
        throw new Error('Refusing to adopt a non-empty SQLite database without Foxy application identity.');
      }
      const integrity = this.db.prepare('PRAGMA quick_check(1)').get();
      if (String(Object.values(integrity || {})[0] || '').toLowerCase() !== 'ok') {
        throw new Error('Foxy SQLite job store failed its integrity check; no scans were accepted.');
      }
      if (applicationId === 0) this.db.exec('PRAGMA application_id=' + FOXY_SQLITE_APPLICATION_ID);

      // POSIX permissions are enforced through the verified descriptor rather
      // than re-resolving the path. Windows ACLs are inherited from the
      // user-profile-backed store directory; POSIX mode bits are not reliable
      // evidence of Windows access-control entries.
      if (process.platform !== 'win32') await permissionHandle.chmod(0o600);
      const hardened = await permissionHandle.stat();
      if (hardened.dev !== before.dev || hardened.ino !== before.ino
        || (process.platform !== 'win32' && (hardened.mode & 0o077) !== 0)) {
        throw new Error('Foxy SQLite database identity or POSIX owner-only permissions could not be verified.');
      }
    } finally { await permissionHandle.close(); }

    const after = await lstat(this.databasePath);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== before.dev || after.ino !== before.ino) {
      this.db.close();
      this.db = null;
      throw new Error('Foxy SQLite database path changed while opening.');
    }

    // WAL is a persistent database change, so enable it only after ownership
    // and integrity are established.
    this.db.exec('PRAGMA secure_delete=ON; PRAGMA wal_autocheckpoint=1000; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    await enableWalModeWithRetry(this.db);
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
      CREATE TABLE IF NOT EXISTS job_idempotency_keys (
        idempotency_key TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        fingerprint TEXT NOT NULL,
        created_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS job_idempotency_job ON job_idempotency_keys(job_id);
      INSERT INTO queue_meta(key,value) VALUES('schema_version','2')
        ON CONFLICT(key) DO NOTHING;
    `);
    const schemaVersion = this.db.prepare("SELECT value FROM queue_meta WHERE key='schema_version'").get()?.value;
    if (schemaVersion === '1') {
      // Upgrade an intermediate beta.5 schema atomically: keys already stored
      // on legacy job rows become durable aliases in the normalized key table.
      const legacyKeys = this.db.prepare(
        'SELECT idempotency_key, id, fingerprint, created_at FROM jobs WHERE idempotency_key IS NOT NULL ORDER BY created_at, id',
      ).all();
      const insertKey = this.db.prepare(
        'INSERT OR IGNORE INTO job_idempotency_keys(idempotency_key,job_id,fingerprint,created_at) VALUES(?,?,?,?)',
      );
      for (const key of legacyKeys) {
        const existing = this.db.prepare('SELECT fingerprint FROM job_idempotency_keys WHERE idempotency_key=?')
          .get(key.idempotency_key);
        if (existing && existing.fingerprint !== key.fingerprint) {
          throw new Error('Legacy queue contains an idempotency key reused for a different scan; refusing schema migration.');
        }
        insertKey.run(key.idempotency_key, key.id, key.fingerprint, key.created_at);
      }
      this.db.prepare("UPDATE queue_meta SET value='2' WHERE key='schema_version'").run();
    } else if (schemaVersion !== '2') {
      throw new Error('Unsupported Foxy SQLite queue schema version.');
    }

    await this.#migrateLegacySnapshot();
    this.#transaction(() => {
      const now = this.now();
      this.#recoverStaleWorkersTx(now);
      const foreign = this.db.prepare('SELECT id,host FROM workers WHERE host <> ?').all(this.host);
      if (foreign.length) throw new Error('Foxy queue database is active from another host; SQLite WAL stores must remain on one local machine.');
      this.db.prepare('INSERT INTO workers(id,pid,host,started_at,heartbeat_at,concurrency,max_queued) VALUES(?,?,?,?,?,?,?)')
        .run(this.workerId, process.pid, this.host, now, now, this.concurrency, this.maxQueued);
    });
    // Set only after COMMIT succeeds. Startup cleanup must not run SQL against
    // an untrusted/uninitialized database when failure happened before register.
    this.workerRegistered = true;
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

  async #assertNoLiveLegacyLocks(directories) {
    for (const directory of directories) {
      const directoryInfo = await lstat(directory).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      if (!directoryInfo) continue;
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
        throw new Error('Legacy Foxy job store directory is unsafe; inspect it before migration.');
      }
      const legacyLockPath = path.join(directory, 'jobs.lock');
      const lockInfo = await lstat(legacyLockPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      if (!lockInfo) continue;
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
        const lockText = await lockHandle.readFile('utf8');
        const afterRead = await lockHandle.stat();
        if (afterRead.dev !== opened.dev || afterRead.ino !== opened.ino
          || afterRead.size !== opened.size || afterRead.mtimeMs !== opened.mtimeMs
          || Buffer.byteLength(lockText, 'utf8') !== opened.size) {
          throw new Error('Legacy Foxy job lock changed while being read; refusing migration.');
        }
        if (lockText.trim() === LEGACY_MIGRATION_GUARD) {
          legacyOwner = { migrationGuard: true };
        } else {
          legacyOwner = JSON.parse(lockText);
        }
      } finally { await lockHandle.close(); }
      if (legacyOwner.migrationGuard) continue;
      if (legacyOwner.host !== this.host || !Number.isInteger(legacyOwner.pid) || !legacyOwner.token) {
        throw new Error('Legacy Foxy job lock belongs to another host or is invalid; refusing migration.');
      }
      try {
        process.kill(legacyOwner.pid, 0);
        throw new Error('A legacy Foxy process is still using jobs.json. Stop it cleanly before starting this SQLite queue.');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
      // Beta.4 itself may unlink dead-PID locks during its next startup. Do
      // not migrate past such a lock: require an operator to verify every old
      // MCP process is stopped, inspect the stale owner, remove the stale lock,
      // then retry so beta.5 can publish its permanent marker atomically.
      throw new Error('A stale beta.4 Foxy job lock exists. Verify all beta.4 processes are stopped, inspect and remove the stale jobs.lock manually, then retry beta.5 migration.');
    }
  }

  async #ensureLegacyMigrationGuard(directory) {
    const lockPath = path.join(directory, 'jobs.lock');
    const current = await lstat(lockPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    if (current) {
      // A beta.4 stale lock blocks new beta.4 writers already. Preserve it;
      // the PID-aware validation above decides whether it is safe to read.
      await this.#assertNoLiveLegacyLocks([directory]);
      return;
    }

    // Publish a fully-written marker atomically at beta.4's exclusive-create
    // lock path. A direct open('wx') exposes an empty file before writeFile
    // completes, which can make a second beta.5 process misread the lock.
    const temporaryPath = path.join(directory, 'jobs.lock.beta5-' + randomUUID() + '.tmp');
    try {
      const handle = await open(temporaryPath, 'wx', 0o600);
      try {
        await handle.writeFile(LEGACY_MIGRATION_GUARD, 'utf8');
        await handle.sync();
      } finally { await handle.close(); }
      try {
        await link(temporaryPath, lockPath);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        await this.#assertNoLiveLegacyLocks([directory]);
      }
    } finally {
      await unlink(temporaryPath).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
    }
    await this.#assertNoLiveLegacyLocks([directory]);
  }

  async #workspaceWithinAuthorizedRoots(workspace) {
    if (this.authorizedRoots === null) return true;
    if (typeof workspace !== 'string' || !path.isAbsolute(workspace) || workspace.length > 4096) return false;
    let candidate;
    try {
      // Legacy JSON is an untrusted migration input. Resolve symlinks before
      // checking containment so a path lexically below an allowed root cannot
      // import findings from a sibling/outside directory.
      candidate = await realpath(workspace);
      const info = await lstat(candidate);
      if (!info.isDirectory() || info.isSymbolicLink()) return false;
    } catch { return false; }
    return this.authorizedRoots.some((root) => {
      const relative = path.relative(root, candidate);
      return relative === '' || (!path.isAbsolute(relative)
        && relative !== '..' && !relative.startsWith('..' + path.sep));
    });
  }

  async #migrateLegacySnapshot() {
    const marker = this.db.prepare("SELECT value FROM queue_meta WHERE key='json_snapshot_migrated'").get();
    if (marker?.value === '1') return;

    const directories = [...new Set([this.storeDir, this.legacyStoreDir].map((item) => path.resolve(item)))];
    // Check every historical storage directory before reading any snapshot.
    // Beta.4 used one shared directory; beta.5 uses per-host/per-root stores.
    await this.#assertNoLiveLegacyLocks(directories);

    const snapshotPaths = directories.map((directory) => path.join(directory, 'jobs.json'));
    const snapshots = [];
    for (const snapshotPath of snapshotPaths) {
      const info = await lstat(snapshotPath).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      if (info) snapshots.push({ snapshotPath, info });
    }
    if (snapshots.length > 1) {
      const identities = new Set(snapshots.map(({ info }) => `${info.dev}:${info.ino}`));
      if (identities.size > 1) {
        throw new Error('Multiple legacy Foxy job snapshots exist; refusing ambiguous migration.');
      }
    }
    const snapshot = snapshots[0] || null;
    if (snapshot) {
      // Persist a beta.5 guard in the old lock slot before opening jobs.json.
      // It is intentionally retained as a downgrade barrier and recognized by
      // future beta.5 processes; old beta.4 cannot acquire the same lock path.
      await this.#ensureLegacyMigrationGuard(path.dirname(snapshot.snapshotPath));
    }
    this.legacyMigration = (async () => {
      let jobs = [];
      if (snapshot) {
        const { snapshotPath, info } = snapshot;
        if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_STATE_BYTES) {
          throw new Error('Legacy JSON job state is unsafe or over its size limit.');
        }
        const handle = await open(snapshotPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        let raw;
        try {
          const opened = await handle.stat();
          if (opened.dev !== info.dev || opened.ino !== info.ino || opened.size > MAX_STATE_BYTES) {
            throw new Error('Legacy JSON job state changed while opening.');
          }
          raw = await handle.readFile('utf8');
          const after = await handle.stat();
          if (after.dev !== opened.dev || after.ino !== opened.ino
            || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
            || Buffer.byteLength(raw, 'utf8') !== opened.size) {
            throw new Error('Legacy JSON job state changed while being migrated.');
          }
        } finally { await handle.close(); }
        const parsed = JSON.parse(raw);
        if (parsed?.version !== 1 || !Array.isArray(parsed.jobs) || parsed.jobs.length > MAX_RECORDS) {
          throw new Error('Legacy JSON job state format is invalid.');
        }
        for (const job of parsed.jobs) validateLegacyJob(job);
        // A beta.4 snapshot is shared across all roots. Copy only records whose
        // canonical workspace falls inside this MCP configuration's exact
        // allowlist. Do not fan out another repository's findings/paths into
        // this host namespace. A live production migration without a valid
        // allowlist cannot safely import any shared legacy state.
        if (this.authorizedRoots !== null && this.authorizedRoots.length === 0 && parsed.jobs.length) {
          throw new Error('Cannot migrate the shared beta.4 queue without configured authorized roots; configure the MCP allowlist and restart.');
        }
        jobs = [];
        for (const job of parsed.jobs) {
          if (await this.#workspaceWithinAuthorizedRoots(job.workspace)) jobs.push(job);
        }
      }

      // Re-run the same PID-aware check after reading and validating the snapshot.
      // A verified stale lock is harmless; a newly active beta.4 writer blocks import.
      await this.#assertNoLiveLegacyLocks(directories);

      this.#transaction(() => {
        const stillMissing = this.db.prepare("SELECT value FROM queue_meta WHERE key='json_snapshot_migrated'").get();
        if (stillMissing?.value === '1') return;
        const insert = this.db.prepare(`INSERT OR IGNORE INTO jobs(
          id,status,created_at,updated_at,finished_at,priority,sequence,fingerprint,idempotency_key,workspace,owner_worker_id,cancel_requested,payload
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        const insertKey = this.db.prepare(
          'INSERT OR IGNORE INTO job_idempotency_keys(idempotency_key,job_id,fingerprint,created_at) VALUES(?,?,?,?)',
        );
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
          if (job.idempotencyKey) {
            const existing = this.db.prepare('SELECT fingerprint FROM job_idempotency_keys WHERE idempotency_key=?')
              .get(job.idempotencyKey);
            if (existing && existing.fingerprint !== job.fingerprint) {
              throw new Error('Legacy JSON queue reused an idempotency key for a different scan; refusing migration.');
            }
            insertKey.run(job.idempotencyKey, job.id, job.fingerprint, job.createdAt);
          }
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
    const runningForWorker = this.db.prepare(
      "SELECT id,payload,workspace,fingerprint,created_at,priority,sequence,idempotency_key FROM jobs WHERE status='running' AND owner_worker_id=?",
    );
    for (const { id } of stale) {
      const rows = runningForWorker.all(id);
      for (const row of rows) {
        let job;
        let malformed = false;
        try {
          job = JSON.parse(row.payload);
          validateLegacyJob(job);
          if (job.id !== row.id || job.workspace !== row.workspace || job.fingerprint !== row.fingerprint) {
            throw new Error('Persisted job payload does not match its indexed columns.');
          }
        } catch {
          malformed = true;
          // The SQL columns are the durable ownership/index record. Preserve
          // only that minimal metadata and make the result explicitly UNKNOWN;
          // never let one corrupt JSON payload strand a worker lease or block
          // other processes from claiming queued work.
          job = {
            id: row.id,
            type: 'unknown',
            scope: 'unknown',
            status: 'interrupted',
            priority: row.priority,
            sequence: row.sequence,
            workspace: row.workspace,
            baseRef: null,
            idempotencyKey: row.idempotency_key || null,
            fingerprint: row.fingerprint,
            progress: 0,
            createdAt: row.created_at,
            updatedAt: now,
            retries: 0,
            result: null,
            error: 'Persisted scan metadata was corrupt when its worker lease expired. The outcome is UNKNOWN; submit a new scan.',
            finishedAt: now,
          };
        }
        job.status = 'interrupted';
        job.result = null;
        job.error = malformed
          ? 'Persisted scan metadata was corrupt when its worker lease expired. The outcome is UNKNOWN; submit a new scan.'
          : 'The Foxy worker stopped heartbeating before this scan completed. The outcome is UNKNOWN; submit a new scan.';
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
        const existing = this.db.prepare('SELECT job_id,fingerprint FROM job_idempotency_keys WHERE idempotency_key=?')
          .get(job.idempotencyKey);
        if (existing) {
          if (existing.fingerprint !== job.fingerprint) throw new Error('idempotency_key was already used for a different scan.');
          const prior = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(existing.job_id);
          if (!prior) throw new Error('Foxy idempotency index points to a missing job; storage integrity is uncertain.');
          return { job: decodeJob(prior), deduplicated: true };
        }
      }
      const active = this.db.prepare("SELECT * FROM jobs WHERE fingerprint=? AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1").get(job.fingerprint);
      if (active) {
        // Bind every supplied key to the coalesced job. Without this alias row,
        // a key consumed by an active-fingerprint dedup could later be reused
        // for an unrelated scan without the idempotency contract noticing.
        if (job.idempotencyKey) {
          this.#assertIdempotencyKeyCapacity(active.id);
          this.db.prepare('INSERT INTO job_idempotency_keys(idempotency_key,job_id,fingerprint,created_at) VALUES(?,?,?,?)')
            .run(job.idempotencyKey, active.id, job.fingerprint, this.now());
        }
        return { job: decodeJob(active), deduplicated: true };
      }
      const limits = this.db.prepare('SELECT MIN(max_queued) AS max_queued FROM workers').get();
      const maxQueued = limits?.max_queued ?? this.maxQueued;
      const queued = this.db.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status='queued'").get().count;
      if (queued >= maxQueued) throw new Error('Scan queue is full; wait for a slot and retry.');
      this.#insertJobTx(job);
      if (job.idempotencyKey) {
        this.#assertIdempotencyKeyCapacity(job.id);
        this.db.prepare('INSERT INTO job_idempotency_keys(idempotency_key,job_id,fingerprint,created_at) VALUES(?,?,?,?)')
          .run(job.idempotencyKey, job.id, job.fingerprint, job.createdAt);
      }
      this.#pruneTx(this.now());
      return { job: { ...job, workerId: null, cancelRequested: false }, deduplicated: false };
    });
  }

  #assertIdempotencyKeyCapacity(jobId) {
    const perJob = this.db.prepare('SELECT COUNT(*) AS count FROM job_idempotency_keys WHERE job_id=?').get(jobId).count;
    if (perJob >= MAX_IDEMPOTENCY_KEYS_PER_JOB) {
      throw new Error('This scan has reached its idempotency-key alias limit.');
    }
    const total = this.db.prepare('SELECT COUNT(*) AS count FROM job_idempotency_keys').get().count;
    if (total >= MAX_IDEMPOTENCY_KEYS_TOTAL) {
      throw new Error('The Foxy idempotency index is full; wait for retained jobs to expire.');
    }
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
    let counts = this.db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END) AS active, SUM(length(CAST(payload AS BLOB))) AS bytes FROM jobs").get();
    const removeOldest = this.db.prepare("SELECT id FROM jobs WHERE status IN ('completed','failed','cancelled','interrupted') ORDER BY COALESCE(finished_at,updated_at),created_at LIMIT 1");
    while ((counts.total > MAX_RECORDS || counts.bytes > MAX_STATE_BYTES) && counts.total > counts.active) {
      const candidate = removeOldest.get();
      if (!candidate) break;
      this.db.prepare('DELETE FROM jobs WHERE id=?').run(candidate.id);
      counts = this.db.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('queued','running') THEN 1 ELSE 0 END) AS active, SUM(length(CAST(payload AS BLOB))) AS bytes FROM jobs").get();
    }
    if (counts.active > MAX_RECORDS || counts.bytes > MAX_STATE_BYTES) {
      throw new Error('Active Foxy job state exceeds the bounded SQLite storage budget.');
    }
  }

  unregisterWorker() {
    if (!this.db || !this.workerRegistered) return;
    // Commit ownership release and UNKNOWN recovery independently of history
    // pruning. A pruning trigger/disk-space error must not roll back the worker
    // deletion and leave a ghost process counted against global concurrency.
    const now = this.now();
    this.#transaction(() => {
      const rows = this.db.prepare("SELECT id,payload,workspace,fingerprint,created_at,priority,sequence,idempotency_key FROM jobs WHERE status='running' AND owner_worker_id=?").all(this.workerId);
      for (const row of rows) {
        let job;
        let malformed = false;
        try {
          job = JSON.parse(row.payload);
          validateLegacyJob(job);
          if (job.id !== row.id || job.workspace !== row.workspace || job.fingerprint !== row.fingerprint) {
            throw new Error('Persisted job payload does not match its indexed columns.');
          }
        } catch {
          malformed = true;
          // A graceful shutdown must release the worker even if the active
          // payload was damaged. Rebuild a minimal UNKNOWN record from the
          // indexed ownership columns, just as stale-lease recovery does.
          job = {
            id: row.id,
            type: 'unknown',
            scope: 'unknown',
            status: 'interrupted',
            priority: row.priority,
            sequence: row.sequence,
            workspace: row.workspace,
            baseRef: null,
            idempotencyKey: row.idempotency_key || null,
            fingerprint: row.fingerprint,
            progress: 0,
            createdAt: row.created_at,
            updatedAt: now,
            retries: 0,
            result: null,
            error: 'Persisted scan metadata was corrupt during shutdown. The outcome is UNKNOWN; submit a new scan.',
            finishedAt: now,
          };
        }
        job.status = 'interrupted';
        job.result = null;
        job.error = malformed
          ? 'Persisted scan metadata was corrupt during shutdown. The outcome is UNKNOWN; submit a new scan.'
          : 'The Foxy server stopped before this scan completed. The outcome is UNKNOWN.';
        job.updatedAt = now;
        job.finishedAt = now;
        this.db.prepare("UPDATE jobs SET status='interrupted',updated_at=?,finished_at=?,owner_worker_id=NULL,cancel_requested=0,payload=? WHERE id=?")
          .run(now, now, encodeJob(job), row.id);
      }
      this.db.prepare('DELETE FROM workers WHERE id=?').run(this.workerId);
    });
    this.workerRegistered = false;
    // Retention is best-effort after worker release has been durably committed.
    this.#prune();
  }

  close() {
    if (!this.db) return;
    this.db.close();
    this.db = null;
  }
}
