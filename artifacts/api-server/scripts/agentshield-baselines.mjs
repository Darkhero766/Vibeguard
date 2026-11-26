import { randomUUID } from 'node:crypto';
import path from 'node:path';

function validProvenance(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.scannerFingerprint === 'string' && /^[a-f0-9]{64}$/i.test(value.scannerFingerprint)
    && typeof value.rulesetVersion === 'string' && value.rulesetVersion.length > 0 && value.rulesetVersion.length <= 200
    && Number.isSafeInteger(value.reportSchemaVersion) && value.reportSchemaVersion > 0);
}
function sameProvenance(left, right) {
  return validProvenance(left) && validProvenance(right)
    && left.scannerFingerprint === right.scannerFingerprint
    && left.rulesetVersion === right.rulesetVersion
    && left.reportSchemaVersion === right.reportSchemaVersion;
}

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
  remember(workspace, fingerprint, result, provenance) {
    if (typeof workspace !== 'string' || !workspace || typeof fingerprint !== 'string' || !fingerprint) {
      throw new TypeError('workspace and fingerprint are required.');
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('A scan result object is required.');
    if (!validProvenance(provenance)) throw new TypeError('A valid scanner/ruleset/report provenance record is required.');
    this.prune();
    const scanId = this.makeId();
    if (typeof scanId !== 'string' || scanId.length < 16 || scanId.length > 80 || this.records.has(scanId)) {
      throw new Error('Baseline ID generator returned an invalid or duplicate ID.');
    }
    const createdAt = this.now();
    const record = { scanId, workspace, fingerprint, result, ...provenance, createdAt, expiresAt: createdAt + this.ttlMs };
    this.records.set(scanId, record);
    this.prune();
    return record;
  }
  restore(record, expectedProvenance) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new TypeError('A baseline record is required.');
    }
    const { scanId, workspace, fingerprint, result, scannerFingerprint,
      rulesetVersion, reportSchemaVersion, createdAt, expiresAt } = record;
    const provenance = { scannerFingerprint, rulesetVersion, reportSchemaVersion };
    const now = this.now();
    const safePath = (value) => typeof value === 'string' && value.length > 0 && value.length <= 400
      && !path.isAbsolute(value) && !/^[A-Za-z]:/.test(value)
      && !/[\x00-\x1f\x7f]/.test(value)
      && !value.replaceAll('\\', '/').split('/').includes('..');
    if (typeof scanId !== 'string' || scanId.length < 16 || scanId.length > 80
      || typeof workspace !== 'string' || !path.isAbsolute(workspace) || workspace.length > 4096
      || typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/i.test(fingerprint)
      || !validProvenance(provenance)
      || (expectedProvenance !== undefined && !sameProvenance(provenance, expectedProvenance))
      || !Number.isSafeInteger(createdAt) || !Number.isSafeInteger(expiresAt)
      || createdAt > now || expiresAt <= now
      || expiresAt <= createdAt || expiresAt - createdAt > this.ttlMs
      || !result || typeof result !== 'object' || Array.isArray(result)
      || result.status !== 'complete' || !Array.isArray(result.findings)
      || result.findings.length > 50 || result.findingsTruncated === true
      || !Array.isArray(result.scannedPaths) || !result.scannedPaths.length
      || result.scannedPaths.some((item) => !safePath(item))
      || new Set(result.scannedPaths).size !== result.scannedPaths.length
      || !Number.isSafeInteger(result.filesScanned)
      || result.filesScanned !== result.scannedPaths.length
      || !Number.isSafeInteger(result.totalFindings) || result.totalFindings < result.findings.length
      || result.findings.some((finding) => !finding || typeof finding !== 'object' || Array.isArray(finding)
        || !safePath(finding.filePath) || !result.scannedPaths.includes(finding.filePath)
        || typeof finding.ruleId !== 'string' || finding.ruleId.length > 100
        || !['Critical', 'High', 'Medium', 'Low', 'Unknown'].includes(finding.severity)
        || !['high', 'medium', 'low', 'unrated'].includes(finding.confidence)
        || !Number.isSafeInteger(finding.line) && finding.line !== null
        || typeof finding.title !== 'string' || finding.title.length > 180
        || typeof finding.recommendation !== 'string' || finding.recommendation.length > 300)) {
      throw new TypeError('Persisted baseline record is invalid.');
    }
    this.prune();
    if (this.records.has(scanId)) return false;
    this.records.set(scanId, { scanId, workspace, fingerprint, result, ...provenance, createdAt, expiresAt });
    this.prune();
    return this.records.has(scanId);
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
