// Bounded local scan queue. State is an atomic JSON snapshot protected by an
// exclusive process lock; interrupted work is never resumed or reported clean.
import { randomUUID, createHash } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { mkdir, lstat, chmod, open, readFile, rename, unlink, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'interrupted']);
const MAX_STATE_BYTES = 8_000_000;
const MAX_RECORDS = 200;
const bounded = (value, max = 300) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max);

export class ScanJobQueue extends EventEmitter {
  constructor({ storeDir, runner, concurrency = 2, maxQueued = 16, timeoutMs = 60_000, maxRetries = 1, now = Date.now } = {}) {
    super();
    if (typeof runner !== 'function') throw new TypeError('A scan job runner is required.');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new TypeError('Concurrency must be between 1 and 4.');
    if (!Number.isInteger(maxQueued) || maxQueued < 1 || maxQueued > 100) throw new TypeError('Queue limit must be between 1 and 100.');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 300_000) throw new TypeError('Job timeout must be between 1 and 300 seconds.');
    if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) throw new TypeError('Retries must be between 0 and 2.');
    this.storeDir = storeDir;
    this.runner = runner;
    this.concurrency = concurrency;
    this.maxQueued = maxQueued;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.now = now;
    this.jobs = new Map();
    this.controllers = new Map();
    this.tasks = new Set();
    this.waiters = new Map();
    this.active = 0;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    if (!path.isAbsolute(this.storeDir || '')) throw new Error('Job store path must be absolute.');
    await mkdir(this.storeDir, { recursive: true, mode: 0o700 });
    const dirInfo = await lstat(this.storeDir);
    if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) throw new Error('Job store must be a real directory.');
    await chmod(this.storeDir, 0o700);
    this.storeDir = await realpath(this.storeDir);
    this.statePath = path.join(this.storeDir, 'jobs.json');
    this.lockPath = path.join(this.storeDir, 'jobs.lock');
    await this.#acquireLock();
    try {
      const fileInfo = await lstat(this.statePath).catch((e) => e?.code === 'ENOENT' ? null : Promise.reject(e));
      if (fileInfo) {
        if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.size > MAX_STATE_BYTES) throw new Error('Job state file is unsafe or over its size limit.');
        const handle = await open(this.statePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        let raw;
        try { raw = await handle.readFile('utf8'); } finally { await handle.close(); }
        const parsed = JSON.parse(raw);
        await chmod(this.statePath, 0o600);
        if (parsed?.version !== 1 || !Array.isArray(parsed.jobs) || parsed.jobs.length > MAX_RECORDS) throw new Error('Job state format is invalid.');
        for (const job of parsed.jobs) {
          if (!job || typeof job.id !== 'string' || !/^[a-f0-9-]{36}$/.test(job.id)
            || !['queued', 'running', ...TERMINAL].includes(job.status)) throw new Error('Job state record is invalid.');
          if (typeof job.workspace !== 'string' || !path.isAbsolute(job.workspace) || job.workspace.length > 4096
            || typeof job.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(job.fingerprint)
            || !['changed', 'full'].includes(job.scope) || !Number.isInteger(job.priority) || job.priority < 0 || job.priority > 3
            || !Number.isFinite(job.createdAt) || !Number.isFinite(job.updatedAt)
            || !Number.isInteger(job.progress) || job.progress < 0 || job.progress > 100
            || !Number.isInteger(job.retries) || job.retries < 0 || job.retries > 2) throw new Error('Job state fields are invalid.');
          if (job.status === 'completed' && (!job.result || !['complete', 'partial_coverage'].includes(job.result.status)
            || !Array.isArray(job.result.findings) || job.result.findings.length > 1000
            || !Number.isSafeInteger(job.result.filesScanned) || job.result.filesScanned < 0
            || !Number.isSafeInteger(job.result.totalFindings) || job.result.totalFindings < job.result.findings.length)) {
            throw new Error('Completed job result is invalid; refusing to report it.');
          }
          if (job.status !== 'completed' && job.result !== null) throw new Error('Non-completed job contains a result.');
          if (job.status === 'queued' || job.status === 'running') {
            job.status = 'interrupted';
            job.error = 'The server restarted before this scan completed. Submit a new scan.';
            job.result = null;
            job.finishedAt = this.now();
          }
          this.jobs.set(job.id, job);
        }
      }
      this.initialized = true;
      await this.#persist();
    } catch (error) {
      await this.#releaseLock();
      throw error;
    }
  }

  async #acquireLock() {
    const owner = JSON.stringify({ pid: process.pid, host: hostname(), token: randomUUID() });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.lockHandle = await open(this.lockPath, 'wx', 0o600);
        await this.lockHandle.writeFile(owner);
        await this.lockHandle.sync();
        this.lockToken = JSON.parse(owner).token;
        return;
      } catch (error) {
        if (error?.code !== 'EEXIST' || attempt) throw new Error('Another Foxy MCP process owns this job store.');
        let prior;
        try { prior = JSON.parse(await readFile(this.lockPath, 'utf8')); } catch { throw new Error('Job store lock is unreadable; refusing concurrent access.'); }
        if (prior.host !== hostname() || !Number.isInteger(prior.pid) || !prior.token) throw new Error('Job store lock belongs to another host or is invalid.');
        try { process.kill(prior.pid, 0); throw new Error('Another Foxy MCP process owns this job store.'); }
        catch (probe) { if (probe?.code !== 'ESRCH') throw probe; }
        await unlink(this.lockPath);
      }
    }
  }

  async #releaseLock() {
    try {
      if (this.lockHandle) await this.lockHandle.close();
      const current = JSON.parse(await readFile(this.lockPath, 'utf8'));
      if (current.token === this.lockToken) await unlink(this.lockPath);
    } catch { /* a stale lock is recovered by PID check on next startup */ }
    this.lockHandle = null;
  }

  async #persist() {
    const write = async () => {
    // Active work must remain addressable even when old history is trimmed.
    const all = [...this.jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
    const active = all.filter((job) => job.status === 'queued' || job.status === 'running');
    const terminal = all.filter((job) => job.status !== 'queued' && job.status !== 'running');
    const records = [...terminal.slice(-Math.max(0, MAX_RECORDS - active.length)), ...active]
      .sort((a, b) => a.createdAt - b.createdAt);
    this.jobs = new Map(records.map((job) => [job.id, job]));
    const data = JSON.stringify({ version: 1, jobs: records });
    if (Buffer.byteLength(data) > MAX_STATE_BYTES) throw new Error('Job state exceeds its storage budget.');
    const temp = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await open(temp, 'wx', 0o600);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await rename(temp, this.statePath);
    const directory = await open(this.storeDir, constants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
    };
    const next = (this.persisting || Promise.resolve()).then(write);
    this.persisting = next.catch(() => {});
    return next;
  }

  #notify(job) {
    this.emit('job', { ...job });
    for (const resolve of this.waiters.get(job.id) || []) resolve();
    this.waiters.delete(job.id);
  }

  async submit({ workspace, base_ref: baseRef = null, idempotency_key: idempotencyKey = null, priority = 0, scope = 'changed' } = {}) {
    const prior = this.submitting || Promise.resolve();
    let release;
    this.submitting = new Promise((resolve) => { release = resolve; });
    await prior;
    try { return await this.#submit({ workspace, base_ref: baseRef, idempotency_key: idempotencyKey, priority, scope }); }
    finally { release(); }
  }

  async #submit({ workspace, base_ref: baseRef = null, idempotency_key: idempotencyKey = null, priority = 0, scope = 'changed' } = {}) {
    await this.init();
    if (typeof workspace !== 'string' || !path.isAbsolute(workspace) || workspace.length > 4096) throw new Error('Workspace must be an absolute path.');
    if (baseRef !== null && (typeof baseRef !== 'string' || baseRef.length > 200)) throw new Error('Invalid base_ref.');
    if (idempotencyKey !== null && (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 120)) throw new Error('Invalid idempotency_key.');
    if (!['changed', 'full'].includes(scope)) throw new Error('scope must be changed or full.');
    if (scope === 'full' && baseRef !== null) throw new Error('base_ref is supported only for changed-file scans.');
    if (!Number.isInteger(priority) || priority < 0 || priority > 3) throw new Error('Priority must be from 0 to 3.');
    // Canonicalize existing roots for alias-safe deduplication, while rejecting
    // a symlink as the supplied workspace itself. The runner repeats allowlist
    // and repository checks immediately before reading project files.
    const resolvedWorkspace = path.resolve(workspace);
    const inputInfo = await lstat(resolvedWorkspace).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
    if (inputInfo && (!inputInfo.isDirectory() || inputInfo.isSymbolicLink())) throw new Error('Workspace must be a real directory.');
    const canonicalWorkspace = inputInfo ? await realpath(resolvedWorkspace) : resolvedWorkspace;
    const fingerprint = createHash('sha256').update(JSON.stringify([canonicalWorkspace, baseRef, scope])).digest('hex');
    const idempotent = idempotencyKey ? [...this.jobs.values()].find((job) => job.idempotencyKey === idempotencyKey) : null;
    if (idempotent && idempotent.fingerprint !== fingerprint) throw new Error('idempotency_key was already used for a different scan.');
    const existing = idempotent || [...this.jobs.values()].find((job) =>
      job.fingerprint === fingerprint && (job.status === 'queued' || job.status === 'running'));
    if (existing) return { job_id: existing.id, status: existing.status, deduplicated: true };
    const queued = [...this.jobs.values()].filter((job) => job.status === 'queued').length;
    if (queued >= this.maxQueued) throw new Error('Scan queue is full; wait for a slot and retry.');
    const now = this.now();
    const job = { id: randomUUID(), type: scope === 'full' ? 'scan_full' : 'scan_changed', scope, status: 'queued', priority, sequence: now,
      workspace: canonicalWorkspace, baseRef, idempotencyKey, fingerprint, progress: 0,
      createdAt: now, updatedAt: now, retries: 0, result: null, error: null };
    this.jobs.set(job.id, job);
    await this.#persist();
    this.#notify(job);
    this.#pump();
    return { job_id: job.id, status: job.status, deduplicated: false };
  }

  #pump() {
    if (!this.initialized || this.closing) return;
    while (this.active < this.concurrency) {
      const job = [...this.jobs.values()].filter((item) => item.status === 'queued')
        .sort((a, b) => b.priority - a.priority || a.sequence - b.sequence)[0];
      if (!job) break;
      this.active++;
      const task = this.#run(job);
      this.tasks.add(task);
      task.finally(() => this.tasks.delete(task)).catch(() => {});
    }
  }

  async #run(job) {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    job.status = 'running'; job.startedAt = this.now(); job.updatedAt = this.now(); job.progress = 1;
    await this.#persist(); this.#notify(job);
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = AbortSignal.any([controller.signal, timeout]);
    try {
      if (signal.aborted) throw signal.reason || new Error('Scan cancelled.');
      const result = await this.runner({ workspace: job.workspace, base_ref: job.baseRef, scope: job.scope }, { signal,
        progress: (value) => {
          const progress = Math.max(job.progress, Math.min(99, Math.floor(Number(value) || 0)));
          if (progress - job.progress >= 5) { job.progress = progress; job.updatedAt = this.now(); this.#persist().then(() => this.#notify(job)).catch(() => {}); }
        },
      });
      if (signal.aborted) throw signal.reason || new Error('Scan cancelled.');
      if (!result || !['complete', 'partial_coverage'].includes(result.status) || !Array.isArray(result.findings)
        || result.findings.length > 1000 || !Number.isSafeInteger(result.filesScanned) || result.filesScanned < 0
        || !Number.isSafeInteger(result.totalFindings) || result.totalFindings < result.findings.length) {
        throw new Error('Scan coverage is incomplete; no clean result was recorded.');
      }
      let resultBytes;
      try { resultBytes = Buffer.byteLength(JSON.stringify(result)); } catch { resultBytes = Infinity; }
      if (resultBytes > 1_500_000) throw new Error('Scan result exceeded its output budget; coverage is unknown.');
      job.status = 'completed'; job.progress = 100; job.result = result; job.error = null;
    } catch (error) {
      if (this.closing) { job.status = 'interrupted'; job.error = 'Server stopped before this scan completed.'; }
      else if (controller.signal.aborted) { job.status = 'cancelled'; job.error = 'Scan was cancelled.'; }
      else if (timeout.aborted) { job.status = 'failed'; job.error = 'Scan exceeded its time limit; coverage is unknown.'; }
      else if (job.retries < this.maxRetries && ['EAGAIN', 'EMFILE', 'ETIMEDOUT'].includes(error?.code)) {
        job.retries++; job.status = 'queued'; job.sequence = this.now(); job.error = 'Transient scan error; retry queued.';
      } else { job.status = 'failed'; job.error = bounded(error?.message || 'Scan failed; coverage is unknown.'); }
    } finally {
      this.controllers.delete(job.id);
      job.updatedAt = this.now();
      if (TERMINAL.has(job.status)) job.finishedAt = this.now();
      try { await this.#persist(); }
      finally {
        this.#notify(job);
        this.active--;
        this.#pump();
      }
    }
  }

  getStatus(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    const { result, ...summary } = job;
    return { ...summary, scan_status: result?.status ?? null,
      findings_count: result?.totalFindings ?? result?.findings?.length ?? null };
  }

  getResults(id, { offset = 0, limit = 20 } = {}) {
    const job = this.jobs.get(id);
    if (!job) return null;
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Use offset >= 0 and limit from 1 to 50.');
    if (job.status !== 'completed') return { job_id: id, status: job.status, findings: [], note: job.error || 'Results are not complete yet.' };
    const findings = job.result.findings || [];
    return { job_id: id, status: job.status, summary: { scanStatus: job.result.status, filesScanned: job.result.filesScanned,
      totalFindings: job.result.totalFindings ?? findings.length, coverage: job.result.coverage,
      findingsTruncated: job.result.findingsTruncated === true }, offset, limit,
    findings: findings.slice(offset, offset + limit), next_offset: offset + limit < findings.length ? offset + limit : null };
  }

  async wait(id, timeoutMs = 10_000) {
    const current = this.getStatus(id);
    if (!current || TERMINAL.has(current.status)) return current;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 30_000) throw new Error('wait_ms must be from 0 to 30000.');
    if (!timeoutMs) return current;
    await new Promise((resolve) => {
      const set = this.waiters.get(id) || new Set(); set.add(resolve); this.waiters.set(id, set);
      const finish = () => {
        clearTimeout(timer);
        set.delete(resolve);
        if (!set.size) this.waiters.delete(id);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      // Replace the waiter callback so notifications also release the timer.
      set.delete(resolve); set.add(finish);
      timer.unref?.();
    });
    return this.getStatus(id);
  }

  async cancel(id) {
    await this.init();
    const job = this.jobs.get(id);
    if (!job) return null;
    if (job.status === 'queued') { job.status = 'cancelled'; job.error = 'Scan was cancelled before it started.'; job.finishedAt = this.now(); job.updatedAt = this.now(); await this.#persist(); this.#notify(job); }
    else if (job.status === 'running') this.controllers.get(id)?.abort();
    return this.getStatus(id);
  }

  async close() {
    if (!this.initialized) return;
    this.closing = true;
    for (const controller of this.controllers.values()) controller.abort(new Error('Server shutting down.'));
    await Promise.allSettled([...this.tasks]);
    for (const job of this.jobs.values()) if (job.status === 'queued') { job.status = 'interrupted'; job.error = 'Server stopped before this scan started.'; }
    for (const job of this.jobs.values()) if (job.status === 'running') { job.status = 'interrupted'; job.error = 'Server stopped before this scan completed.'; }
    await this.#persist();
    await this.#releaseLock();
    this.initialized = false;
    this.closing = false;
  }
}
