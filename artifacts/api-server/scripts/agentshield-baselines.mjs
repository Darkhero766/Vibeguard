import { randomUUID } from 'node:crypto';

export class BaselineStore {
  constructor({
    maxEntries = 50,
    ttlMs = 30 * 60 * 1000,
    now = () => Date.now(),
    makeId = randomUUID,
  } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new TypeError('maxEntries must be a positive integer.');
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new TypeError('ttlMs must be a positive integer.');
    if (typeof now !== 'function' || typeof makeId !== 'function') throw new TypeError('now and makeId must be functions.');
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
    this.makeId = makeId;
    this.records = new Map();
  }
  prune() {
    const now = this.now();
    for (const [id, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(id);
    }
    if (this.records.size > this.maxEntries) {
      const oldest = [...this.records.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
      for (const [id] of oldest.slice(0, this.records.size - this.maxEntries)) this.records.delete(id);
    }
  }
  remember(workspace, fingerprint, result) {
    if (typeof workspace !== 'string' || !workspace || typeof fingerprint !== 'string' || !fingerprint) {
      throw new TypeError('workspace and fingerprint are required.');
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('A scan result object is required.');
    this.prune();
    const scanId = this.makeId();
    if (typeof scanId !== 'string' || scanId.length < 16 || scanId.length > 80 || this.records.has(scanId)) {
      throw new Error('Baseline ID generator returned an invalid or duplicate ID.');
    }
    const createdAt = this.now();
    const record = { scanId, workspace, fingerprint, result, createdAt, expiresAt: createdAt + this.ttlMs };
    this.records.set(scanId, record);
    this.prune();
    return record;
  }
  get(scanId, workspace) {
    this.prune();
    if (typeof scanId !== 'string' || scanId.length < 16 || scanId.length > 80) return null;
    const record = this.records.get(scanId);
    if (!record || record.workspace !== workspace) return null;
    return record;
  }
  delete(scanId) {
    return this.records.delete(scanId);
  }
  get size() {
    this.prune();
    return this.records.size;
  }
}
