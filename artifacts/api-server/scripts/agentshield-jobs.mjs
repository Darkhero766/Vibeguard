// Bounded cross-process scan queue. SQLite transactions coordinate workers;
// renewable leases recover crashed work as UNKNOWN, never as a clean result.
import { randomUUID, createHash } from 'node:crypto';
import { ScanJobStore } from './agentshield-jobs-store.mjs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { lstat, realpath } from 'node:fs/promises';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const MAX_JOB_FINDINGS = 1000;
const BASELINE_TTL_MS = 30 * 60 * 1000;
const bounded = (value, max = 300) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max);
function safeBaselinePath(value) {
  if (typeof value !== 'string' || !value || value.length > 400
    || path.isAbsolute(value) || /^[A-Za-z]:/.test(value)
    || /[\x00-\x1f\x7f]/.test(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  return !normalized.split('/').includes('..') && !normalized.startsWith('/');
}
function validBaselineProvenance(value) {
  return Boolean(value && typeof value === 'object'
    && typeof value.scannerFingerprint === 'string' && /^[a-f0-9]{64}$/i.test(value.scannerFingerprint)
    && typeof value.rulesetVersion === 'string' && value.rulesetVersion.length > 0 && value.rulesetVersion.length <= 200
    && Number.isSafeInteger(value.reportSchemaVersion) && value.reportSchemaVersion > 0);
}
function sameBaselineProvenance(left, right) {
  return validBaselineProvenance(left) && validBaselineProvenance(right)
    && left.scannerFingerprint === right.scannerFingerprint
    && left.rulesetVersion === right.rulesetVersion
    && left.reportSchemaVersion === right.reportSchemaVersion;
}
function validBaselineContext(context, job, now, expectedProvenance) {
  const result = job?.result;
  return Boolean(validBaselineProvenance(context) && sameBaselineProvenance(context, expectedProvenance)
    && context && job && typeof context.scanId === 'string'
    && context.scanId.length >= 16 && context.scanId.length <= 80
    && context.scanId === result?.scanId
    && context.workspace === job.workspace
    && typeof context.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(context.fingerprint)
    && Number.isSafeInteger(context.createdAt) && Number.isSafeInteger(context.expiresAt)
    && context.createdAt <= now && context.expiresAt > now && context.expiresAt > context.createdAt
    && context.expiresAt - context.createdAt <= BASELINE_TTL_MS
    && result?.status === 'complete'
    && Array.isArray(result.findings) && result.findings.length <= 50
    && result.findingsTruncated !== true
    && Array.isArray(result.scannedPaths) && result.scannedPaths.length > 0
    && result.scannedPaths.every(safeBaselinePath)
    && new Set(result.scannedPaths).size === result.scannedPaths.length
    && Number.isSafeInteger(result.filesScanned)
    && result.filesScanned === result.scannedPaths.length
    && Number.isSafeInteger(result.totalFindings)
    && result.totalFindings >= result.findings.length
    && result.findings.every((finding) => finding && typeof finding === 'object' && !Array.isArray(finding)
      && safeBaselinePath(finding.filePath) && result.scannedPaths.includes(finding.filePath)
      && typeof finding.ruleId === 'string' && finding.ruleId.length <= 100
      && ['Critical', 'High', 'Medium', 'Low', 'Unknown'].includes(finding.severity)
      && ['high', 'medium', 'low', 'unrated'].includes(finding.confidence)
      && (Number.isSafeInteger(finding.line) && finding.line > 0 || finding.line === null)
      && typeof finding.title === 'string' && finding.title.length <= 180
      && typeof finding.recommendation === 'string' && finding.recommendation.length <= 300));
}

export class ScanJobQueue extends EventEmitter {
  constructor({
    storeDir,
    runner,
    concurrency = 2,
    maxQueued = 16,
    timeoutMs = 60_000,
    maxRetries = 1,
    now = Date.now,
    baselineProvenance = null,
    workerLeaseMs = 20_000,
    heartbeatIntervalMs = 4_000,
  } = {}) {
    super();
    if (typeof runner !== 'function') throw new TypeError('A scan job runner is required.');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new TypeError('Concurrency must be between 1 and 4.');
    if (!Number.isInteger(maxQueued) || maxQueued < 1 || maxQueued > 100) throw new TypeError('Queue limit must be between 1 and 100.');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300_000) throw new TypeError('Job timeout must be between 1 and 300 seconds.');
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) throw new TypeError('Retries must be between 0 and 2.');
    if (baselineProvenance !== null && !validBaselineProvenance(baselineProvenance)) throw new TypeError('Invalid scanner/ruleset/report provenance.');
    if (!Number.isInteger(workerLeaseMs) || workerLeaseMs < 500 || workerLeaseMs > 120_000
      || !Number.isInteger(heartbeatIntervalMs) || heartbeatIntervalMs < 50
      || heartbeatIntervalMs * 3 >= workerLeaseMs) {
      throw new TypeError('Worker heartbeat must be at least three times faster than its 500 ms–120 s lease.');
    }
    this.storeDir = storeDir;
    this.runner = runner;
    this.concurrency = concurrency;
    this.maxQueued = maxQueued;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.now = now;
    this.baselineProvenance = baselineProvenance;
    this.workerLeaseMs = workerLeaseMs;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.workerId = randomUUID();
    this.jobs = new Map();
    this.controllers = new Map();
    this.tasks = new Set();
    this.waiters = new Map();
    this.active = 0;
    this.initialized = false;
    this.storageFault = false;
    this.closingPromise = null;
    this.heartbeatTimer = null;
    this.pumpingPromise = null;
    this.store = null;
  }

  async init() {
    if (this.initialized) return;
    if (this.storageFault) throw new Error('Foxy job-store initialization previously failed; repair storage and restart the MCP server.');
    if (this.initializingPromise) return this.initializingPromise;
    const pending = this.initializeStore();
    this.initializingPromise = pending;
    try {
      await pending;
    } finally {
      if (this.initializingPromise === pending) this.initializingPromise = null;
    }
  }

  async initializeStore() {
    try {
      this.store = new ScanJobStore({
        storeDir: this.storeDir,
        workerId: this.workerId,
        concurrency: this.concurrency,
        maxQueued: this.maxQueued,
        workerLeaseMs: this.workerLeaseMs,
        now: this.now,
      });
      await this.store.initialize();
      this.#refreshJobs();
      this.initialized = true;
      this.heartbeatTimer = setInterval(() => this.#heartbeat(), this.heartbeatIntervalMs);
      this.heartbeatTimer.unref?.();
      void this.#pump();
    } catch (error) {
      this.initialized = false;
      this.storageFault = true;
      // Initialization can fail after the worker row was registered but before
      // the queue became available. Remove that row so other processes do not
      // count a failed starter until its lease expires.
      try { this.store?.unregisterWorker(); } catch {}
      try { this.store?.close(); } catch {}
      throw new Error('Foxy SQLite queue initialization failed; no scans were accepted. Repair the local queue database and restart the MCP server.', { cause: error });
    }
  }

  #refreshJobs() {
    if (!this.store) return;
    this.jobs = new Map(this.store.listJobs().map((job) => [job.id, job]));
  }

  #heartbeat() {
    if (!this.initialized || this.closing || this.storageFault) return;
    try {
      this.store.heartbeat();
      for (const [id, controller] of this.controllers) {
        if (!controller.signal.aborted && this.store.isCancelRequested(id)) {
          controller.abort(new Error('Scan cancellation requested by another MCP process.'));
        }
      }
      this.#refreshJobs();
      void this.#pump();
    } catch (error) {
      this.#markStorageFault(error);
    }
  }

  #markStorageFault(error) {
    if (this.storageFault) return;
    this.storageFault = true;
    this.storageError = bounded(error?.message || 'Queue storage is unhealthy.', 240);
    for (const controller of this.controllers.values()) {
      if (!controller.signal.aborted) controller.abort(new Error('Job storage is unhealthy; scan outcome is UNKNOWN.'));
    }
    this.emit('storage-fault', { message: this.storageError });
  }

  #notify(job) {
    if (!job) return;
    this.emit('job', { ...job });
    for (const resolve of this.waiters.get(job.id) || []) resolve();
    this.waiters.delete(job.id);
  }

  async submit({ workspace, base_ref: baseRef = null, idempotency_key: idempotencyKey = null, priority = 0, scope = 'changed' } = {}) {
    await this.init();
    if (this.storageFault) throw new Error('Foxy job storage is unhealthy; restart the MCP server after repairing its state directory.');
    if (typeof workspace !== 'string' || !path.isAbsolute(workspace) || workspace.length > 4096) throw new Error('Workspace must be an absolute path.');
    if (baseRef !== null && (typeof baseRef !== 'string' || baseRef.length > 200)) throw new Error('Invalid base_ref.');
    if (idempotencyKey !== null && (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 120)) throw new Error('Invalid idempotency_key.');
    if (!['changed', 'full'].includes(scope)) throw new Error('scope must be changed or full.');
    if (scope === 'full' && baseRef !== null) throw new Error('base_ref is supported only for changed-file scans.');
    if (!Number.isInteger(priority) || priority < 0 || priority > 3) throw new Error('Priority must be from 0 to 3.');

    const resolvedWorkspace = path.resolve(workspace);
    const inputInfo = await lstat(resolvedWorkspace).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    if (inputInfo && (!inputInfo.isDirectory() || inputInfo.isSymbolicLink())) throw new Error('Workspace must be a real directory.');
    const canonicalWorkspace = inputInfo ? await realpath(resolvedWorkspace) : resolvedWorkspace;
    const fingerprint = createHash('sha256').update(JSON.stringify([canonicalWorkspace, baseRef, scope])).digest('hex');
    const now = this.now();
    const job = {
      id: randomUUID(),
      type: scope === 'full' ? 'scan_full' : 'scan_changed',
      scope,
      status: 'queued',
      priority,
      sequence: now,
      workspace: canonicalWorkspace,
      baseRef,
      idempotencyKey,
      fingerprint,
      progress: 0,
      createdAt: now,
      updatedAt: now,
      retries: 0,
      result: null,
      error: null,
    };

    let created;
    try {
      created = this.store.createJob(job);
    } catch (error) {
      if (/queue is full|idempotency_key was already used/.test(String(error?.message))) throw error;
      this.#markStorageFault(error);
      throw new Error('Foxy could not commit the scan job to the shared SQLite queue; no scan was accepted.');
    }
    this.jobs.set(created.job.id, created.job);
    this.#notify(created.job);
    if (!created.deduplicated) void this.#pump();
    return { job_id: created.job.id, status: created.job.status, deduplicated: created.deduplicated };
  }

  #pump() {
    if (!this.initialized || this.closing || this.storageFault) return Promise.resolve();
    if (this.pumpingPromise) return this.pumpingPromise;
    this.pumpingPromise = (async () => {
      while (this.initialized && !this.closing && !this.storageFault && this.active < this.concurrency) {
        const job = this.store.claimNext();
        if (!job) break;
        this.jobs.set(job.id, job);
        this.active++;
        this.#notify(job);
        const task = this.#run(job);
        this.tasks.add(task);
        task.finally(() => this.tasks.delete(task)).catch(() => {});
      }
    })().catch((error) => {
      this.#markStorageFault(error);
    }).finally(() => {
      this.pumpingPromise = null;
    });
    return this.pumpingPromise;
  }

  async #run(job) {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = AbortSignal.any([controller.signal, timeout]);
    try {
      if (signal.aborted) throw signal.reason || new Error('Scan cancelled.');
      const result = await this.runner(
        { workspace: job.workspace, base_ref: job.baseRef, scope: job.scope },
        {
          signal,
          progress: (value) => {
            const progress = Math.max(job.progress, Math.min(99, Math.floor(Number(value) || 0)));
            if (progress - job.progress < 5 || this.storageFault) return;
            try {
              const updated = this.store.updateProgress(job.id, progress);
              if (updated) {
                Object.assign(job, updated);
                this.jobs.set(job.id, updated);
                this.#notify(updated);
              }
            } catch (error) {
              this.#markStorageFault(error);
            }
          },
        },
      );
      if (signal.aborted) throw signal.reason || new Error('Scan cancelled.');
      if (!result || !['complete', 'partial_coverage'].includes(result.status) || !Array.isArray(result.findings)
        || result.findings.length > MAX_JOB_FINDINGS || !Number.isSafeInteger(result.filesScanned) || result.filesScanned < 0
        || !Number.isSafeInteger(result.totalFindings) || result.totalFindings < result.findings.length) {
        throw new Error('Scan coverage is incomplete; no clean result was recorded.');
      }
      let resultBytes;
      try { resultBytes = Buffer.byteLength(JSON.stringify(result)); } catch { resultBytes = Infinity; }
      if (resultBytes > 1_500_000) throw new Error('Scan result exceeded its output budget; coverage is unknown.');
      job.status = 'completed';
      job.progress = 100;
      job.result = result;
      job.error = null;
    } catch (error) {
      if (this.storageFault) {
        job.status = 'failed';
        job.result = null;
        job.error = 'Job state persistence failed; scan outcome is UNKNOWN.';
      } else if (this.closing) {
        job.status = 'interrupted';
        job.result = null;
        job.error = 'Server stopped before this scan completed.';
      } else if (controller.signal.aborted) {
        job.status = 'cancelled';
        job.result = null;
        job.error = 'Scan was cancelled.';
      } else if (timeout.aborted) {
        job.status = 'failed';
        job.result = null;
        job.error = 'Scan exceeded its time limit; coverage is unknown.';
      } else if (job.retries < this.maxRetries && ['EAGAIN', 'EMFILE', 'ETIMEDOUT'].includes(error?.code)) {
        job.retries++;
        job.status = 'queued';
        job.sequence = this.now();
        job.error = 'Transient scan error; retry queued.';
      } else {
        job.status = 'failed';
        job.result = null;
        job.error = bounded(error?.message || 'Scan failed; coverage is unknown.');
      }
    } finally {
      this.controllers.delete(job.id);
      job.updatedAt = this.now();
      if (TERMINAL.has(job.status)) job.finishedAt = this.now();
      try {
        const persisted = this.store.finishJob(job);
        if (!persisted) throw new Error('Worker lease was lost before the scan result could be committed.');
        this.jobs.set(job.id, persisted);
        this.#notify(persisted);
      } catch (error) {
        this.#markStorageFault(error);
      } finally {
        this.active = Math.max(0, this.active - 1);
        if (!this.closing && !this.storageFault) void this.#pump();
      }
    }
  }

  getRestorableBaselines() {
    this.#refreshJobs();
    const now = this.now();
    return [...this.jobs.values()]
      .filter((job) => job.status === 'completed' && job.scope === 'changed'
        && validBaselineContext(job.result?.baselineContext, job, now, this.baselineProvenance))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((job) => {
        const { baselineContext, ...result } = job.result;
        return { ...baselineContext, result };
      });
  }

  getStatus(id) {
    const job = this.store?.getJob(id) || null;
    if (!job) {
      this.jobs.delete(id);
      return null;
    }
    this.jobs.set(id, job);
    const result = job.result;
    const now = this.now();
    const queueWaitEnd = job.startedAt ?? (TERMINAL.has(job.status) ? job.finishedAt ?? now : now);
    const executionEnd = job.finishedAt ?? now;
    return {
      job_id: job.id,
      type: job.type,
      scope: job.scope,
      status: job.status,
      priority: job.priority,
      progress: job.progress,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
      started_at: job.startedAt ?? null,
      finished_at: job.finishedAt ?? null,
      retries: job.retries,
      queue_wait_ms: Math.max(0, queueWaitEnd - job.createdAt),
      execution_ms: Number.isFinite(job.startedAt) ? Math.max(0, executionEnd - job.startedAt) : null,
      scan_status: result?.status ?? null,
      findings_count: result?.totalFindings ?? result?.findings?.length ?? null,
      error: job.error ? bounded(job.error, 240) : null,
    };
  }

  getResults(id, { offset = 0, limit = 20 } = {}) {
    const job = this.store?.getJob(id) || null;
    if (!job) {
      this.jobs.delete(id);
      return null;
    }
    this.jobs.set(id, job);
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Use offset >= 0 and limit from 1 to 50.');
    if (job.status !== 'completed') return { job_id: id, status: job.status, findings: [], note: job.error || 'Results are not complete yet.' };
    const findings = job.result.findings || [];
    const context = job.result.baselineContext;
    const now = this.now();
    const baselineAvailable = validBaselineContext(context, job, now, this.baselineProvenance);
    const baselineExpired = Boolean(context && Number.isSafeInteger(context.expiresAt) && context.expiresAt <= now);
    const baselineStale = Boolean(context && !baselineExpired && validBaselineProvenance(context)
      && !sameBaselineProvenance(context, this.baselineProvenance));
    const baselineRemaining = baselineAvailable ? context.expiresAt - now : context ? 0 : null;
    return {
      job_id: id,
      status: job.status,
      summary: {
        scanStatus: job.result.status,
        filesScanned: job.result.filesScanned,
        totalFindings: job.result.totalFindings ?? findings.length,
        coverage: job.result.coverage,
        findingsTruncated: job.result.findingsTruncated === true,
      },
      scan_id: baselineAvailable ? context.scanId : null,
      baseline_expires_in_ms: baselineAvailable ? baselineRemaining : context ? 0 : null,
      baseline_expired: baselineExpired,
      baseline_stale: baselineStale,
      baseline_unavailable: Boolean(context && !baselineAvailable && !baselineExpired && !baselineStale),
      offset,
      limit,
      findings: findings.slice(offset, offset + limit),
      next_offset: offset + limit < findings.length ? offset + limit : null,
    };
  }

  async wait(id, timeoutMs = 10_000) {
    const current = this.getStatus(id);
    if (!current || TERMINAL.has(current.status)) return current;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 30_000) throw new Error('wait_ms must be from 0 to 30000.');
    if (!timeoutMs) return current;
    const deadline = Date.now() + timeoutMs;
    let latest = current;
    while (Date.now() < deadline) {
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now())));
        timer.unref?.();
      });
      latest = this.getStatus(id);
      if (!latest || TERMINAL.has(latest.status)) return latest;
    }
    return this.getStatus(id);
  }

  async cancel(id) {
    await this.init();
    if (this.storageFault) throw new Error('Foxy job storage is unhealthy; cancellation cannot be confirmed.');
    let outcome;
    try { outcome = this.store.requestCancel(id); }
    catch (error) {
      this.#markStorageFault(error);
      throw new Error('Foxy could not persist cancellation; the queue is unhealthy and scan outcome is UNKNOWN.');
    }
    if (!outcome) return null;
    this.jobs.set(id, outcome.job);
    if (outcome.queued) {
      this.#notify(outcome.job);
      void this.#pump();
    } else if (outcome.job.status === 'running') {
      this.controllers.get(id)?.abort(new Error('Scan cancellation requested.'));
    }
    return this.getStatus(id);
  }

  async close() {
    if (this.closingPromise) return this.closingPromise;
    if (!this.initialized) {
      try { this.store?.close(); } catch {}
      return;
    }
    this.closingPromise = (async () => {
      this.closing = true;
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      // Let an in-flight claim transaction finish observing the closing flag
      // before unregistering this worker and closing the shared SQLite handle.
      if (this.pumpingPromise) await this.pumpingPromise;
      for (const controller of this.controllers.values()) controller.abort(new Error('Server shutting down.'));
      await Promise.allSettled([...this.tasks]);
      try {
        this.store.unregisterWorker();
        this.#refreshJobs();
      } catch (error) {
        this.#markStorageFault(error);
      } finally {
        this.store.close();
        this.initialized = false;
        this.closing = false;
      }
    })();
    try { await this.closingPromise; }
    finally { this.closingPromise = null; }
  }
}
