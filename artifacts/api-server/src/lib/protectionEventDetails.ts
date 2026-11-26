import type { ProtectionEventDetails } from "@workspace/db";

export type ProtectionEventReport = {
  findings?: Array<{
    id?: unknown;
    severity?: unknown;
    title?: unknown;
    filePath?: unknown;
    line?: unknown;
    check?: unknown;
  }>;
  scanMode?: string;
  scanIncomplete?: boolean;
  coveragePartial?: boolean;
  changedFiles?: number;
  filesScanned?: number;
  checksRun?: number;
  resolvedFindingsCount?: number;
  existingFindingsCount?: number;
  unscannedChangedFileCount?: number;
  unscannedChangedFiles?: unknown[];
  coverageReasons?: unknown[];
};

function boundedCount(value: unknown): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(number, 100_000) : 0;
}
function safeSummaryText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/[\x00-\x1f\x7f<>\x60|]/g, "_")
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,})\b/g, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .slice(0, maxLength);
}
function safeSummaryPath(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 4096
    || value.startsWith("/") || value.includes("\\")
    || value.split("/").some(part => !part || part === "." || part === "..")) return null;
  return safeSummaryText(value, 350);
}
export function buildProtectionEventDetails(report: ProtectionEventReport): ProtectionEventDetails {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const safeFindings = findings.slice(0, 25).flatMap((finding) => {
    const severity = finding?.severity;
    const filePath = safeSummaryPath(finding?.filePath);
    if (!["Critical", "High", "Medium"].includes(String(severity)) || !filePath) return [];
    const line = boundedCount(finding.line);
    const check = safeSummaryText(finding.check, 75).replace(/[^a-zA-Z0-9_.-]/g, "_");
    const id = safeSummaryText(finding.id, 120);
    const title = safeSummaryText(finding.title, 160);
    if (!id || !check || !title) return [];
    return [{ id, severity: severity as "Critical" | "High" | "Medium", title, filePath, line: line || null, check }];
  });
  const coverageReasons = Array.isArray(report.coverageReasons)
    ? report.coverageReasons.slice(0, 6).map(reason => safeSummaryText(reason, 220)).filter(Boolean)
    : [];
  const unscannedChangedFiles = Array.isArray(report.unscannedChangedFiles)
    ? report.unscannedChangedFiles.slice(0, 12).map(safeSummaryPath).filter((value): value is string => Boolean(value))
    : [];
  const scanMode: ProtectionEventDetails["scanMode"] =
    report.scanMode === "delta" || report.scanMode === "full" ? report.scanMode : "unknown";
  return {
    version: 1,
    scanMode,
    scanIncomplete: report.scanIncomplete === true,
    coveragePartial: report.coveragePartial === true || report.scanIncomplete === true,
    changedFiles: boundedCount(report.changedFiles),
    filesScanned: boundedCount(report.filesScanned),
    checksRun: boundedCount(report.checksRun),
    resolvedFindingsCount: boundedCount(report.resolvedFindingsCount),
    existingFindingsCount: boundedCount(report.existingFindingsCount),
    unscannedChangedFileCount: boundedCount(report.unscannedChangedFileCount),
    coverageReasons,
    unscannedChangedFiles,
    findings: safeFindings,
  };
}
