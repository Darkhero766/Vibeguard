/**
 * In-memory cache for scan results, keyed by "owner/repo" (lower-cased).
 * Used by the badge endpoint — stores the last result per repo for ~1 hour
 * so repeated badge loads don't re-trigger expensive scans.
 */

import type { ScanReport } from "@workspace/api-zod";

const TTL_MS = 60 * 60 * 1000; // 1 hour

type CacheEntry = {
  report: ScanReport;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();

export function cacheScanResult(repoKey: string, report: ScanReport): void {
  cache.set(repoKey.toLowerCase(), { report, cachedAt: Date.now() });
}

export function getCachedScanResult(repoKey: string): ScanReport | null {
  const entry = cache.get(repoKey.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(repoKey.toLowerCase());
    return null;
  }
  return entry.report;
}
