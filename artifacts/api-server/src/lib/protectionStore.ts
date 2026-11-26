import { db, protectionEvents, protectedRepositories } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

type RawProtectionFinding = {
  id?: unknown; severity?: unknown; title?: unknown; filePath?: unknown;
  line?: unknown; check?: unknown;
};
export type ProtectionReport = {
  findings?: RawProtectionFinding[];
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
    .replace(/[\\x00-\\x1f\\x7f<>\\x60|]/g, "_")
    .replace(/\\b(?:gh[pousr]_[A-Za-z0-9]{20,}|sk_(?:live|test)_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,})\\b/g, "[redacted]")
    .replace(/\\b[A-Za-z0-9_-]{32,}\\b/g, "[redacted]")
    .slice(0, maxLength);
}
function safeSummaryPath(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 4096
    || value.startsWith("/") || value.includes("\\\\")
    || value.split("/").some(part => !part || part === "." || part === "..")) return null;
  return safeSummaryText(value, 350);
}
function buildProtectionEventDetails(report: ProtectionReport) {
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
  return {
    version: 1 as const,
    scanMode: report.scanMode === "delta" || report.scanMode === "full" ? report.scanMode : "unknown" as const,
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

export async function saveProtectedRepository(input: { owner: string; repo: string; repoUrl: string; baselineSha: string; score: number; report: ProtectionReport }) {
  const findings = input.report.findings ?? [];
  const counts = {
    critical: findings.filter((f) => f.severity === "Critical").length,
    high: findings.filter((f) => f.severity === "High").length,
    medium: findings.filter((f) => f.severity === "Medium").length,
  };

  // Do not parameterize a LIMIT here. Some hosted Postgres/pooler configurations
  // have rejected the generated `LIMIT $2` statement even though the query itself
  // is valid. The result set is tiny because `repo` is UNIQUE, so taking the first
  // row in application code is equivalent and keeps repository protection robust.
  const existingRows = await db
    .select()
    .from(protectedRepositories)
    .where(eq(protectedRepositories.repo, input.repo));
  const existing = existingRows[0];

  if (existing) {
    if (existing.owner !== input.owner) throw new Error("This repository is already protected by another VibeSane account.");
    const [updated] = await db.update(protectedRepositories).set({ repoUrl: input.repoUrl, lastSha: input.baselineSha, status: "protected", lastScore: input.score, criticalCount: counts.critical, highCount: counts.high, mediumCount: counts.medium, lastEvent: "baseline", lastEventAt: new Date(), updatedAt: new Date() }).where(eq(protectedRepositories.repo, input.repo)).returning();
    return updated;
  }

  const [created] = await db.insert(protectedRepositories).values({ owner: input.owner, repo: input.repo, repoUrl: input.repoUrl, baselineSha: input.baselineSha, lastSha: input.baselineSha, status: "protected", lastScore: input.score, criticalCount: counts.critical, highCount: counts.high, mediumCount: counts.medium, lastEvent: "baseline", lastEventAt: new Date(), updatedAt: new Date() }).returning();
  return created;
}

export async function listProtectedRepositories(owner: string) {
  return db.select().from(protectedRepositories).where(eq(protectedRepositories.owner, owner)).orderBy(desc(protectedRepositories.updatedAt));
}

export async function listProtectionEvents(repo: string, limit = 20) {
  return db.select().from(protectionEvents).where(eq(protectionEvents.repo, repo)).orderBy(desc(protectionEvents.createdAt)).limit(limit);
}

export async function getProtectedRepository(repo: string) {
  // `repo` is UNIQUE, so no SQL LIMIT is required. This avoids the hosted
  // Postgres/pooler issue with generated `LIMIT $2` statements.
  const rows = await db.select().from(protectedRepositories).where(eq(protectedRepositories.repo, repo));
  return rows[0] ?? null;
}

export async function recordProtectionEvent(input: { repo: string; event: string; sha: string; baseSha?: string; status: string; report: ProtectionReport; advanceHead?: boolean }) {
  const findings = Array.isArray(input.report.findings) ? input.report.findings : [];
  const critical = findings.filter((f) => f.severity === "Critical").length;
  const high = findings.filter((f) => f.severity === "High").length;
  const medium = findings.filter((f) => f.severity === "Medium").length;
  const details = buildProtectionEventDetails(input.report);
  await db.insert(protectionEvents).values({
    repo: input.repo,
    event: input.event,
    sha: input.sha,
    baseSha: input.baseSha ?? null,
    status: input.status,
    findingsCount: findings.length,
    criticalCount: critical,
    highCount: high,
    mediumCount: medium,
    details,
  });
  const incomplete = details.coveragePartial || details.scanIncomplete;
  const update = {
    lastEvent: incomplete ? "scan_incomplete" : input.event,
    lastEventAt: new Date(),
    updatedAt: new Date(),
    ...(incomplete ? {} : {
      lastScore: Math.max(0, 100 - critical * 18 - high * 10 - medium * 4),
      criticalCount: critical,
      highCount: high,
      mediumCount: medium,
    }),
    ...(input.advanceHead && !incomplete ? { lastSha: input.sha } : {}),
  };
  await db.update(protectedRepositories).set(update).where(eq(protectedRepositories.repo, input.repo));
}
