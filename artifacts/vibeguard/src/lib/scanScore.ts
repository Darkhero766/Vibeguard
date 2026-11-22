export type HeuristicFinding = {
  severity: "Critical" | "High" | "Medium";
  check?: string;
  filePath?: string;
  line?: number;
  title?: string;
};

/**
 * Severity-weighted product indicator, not a vulnerability probability or
 * security certification. The rule count is displayed separately.
 */
export function getHeuristicScanScore(
  findings: readonly HeuristicFinding[],
  checksRun?: number,
): number | null {
  if (!Number.isSafeInteger(checksRun) || (checksRun ?? 0) < 1) return null;
  const unique = new Map<string, HeuristicFinding>();
  for (const finding of findings) {
    const key = [
      finding.check ?? finding.title ?? "unknown",
      finding.filePath ?? "unknown",
      finding.line ?? 0,
    ].join(":");
    unique.set(key, finding);
  }
  let penalty = 0;
  for (const finding of unique.values()) {
    penalty += finding.severity === "Critical" ? 18
      : finding.severity === "High" ? 10 : 4;
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}
