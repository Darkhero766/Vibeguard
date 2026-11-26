import { createHash } from "node:crypto";

export type SecurityFinding = {
  id?: string;
  severity: string;
  title: string;
  description?: string;
  filePath: string;
  line: number | null;
  check: string;
  confidence?: string;
  engine?: string;
  recommendation?: string;
};
export type SourceFile = { path: string; content: string };
export type FindingDelta = {
  introduced: SecurityFinding[];
  resolved: SecurityFinding[];
  existing: SecurityFinding[];
};

function severityRank(value: unknown): number {
  switch (value) {
    case "Critical": return 4;
    case "High": return 3;
    case "Medium": return 2;
    case "Low": return 1;
    default: return 0;
  }
}
function normalizeLine(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}
function evidenceFingerprint(finding: SecurityFinding, files: Map<string, string>): string | null {
  if (!Number.isSafeInteger(finding.line) || (finding.line ?? 0) < 1) return null;
  const content = files.get(finding.filePath);
  if (typeof content !== "string") return null;
  const line = content.split(/\r?\n/)[(finding.line as number) - 1];
  if (typeof line !== "string") return null;
  const normalized = normalizeLine(line);
  if (!normalized) return null;
  // Only the digest is kept. Source lines can contain credentials or customer data.
  return createHash("sha256").update(normalized).digest("hex");
}
function semanticKey(finding: SecurityFinding, renameMap: Map<string, string>): string {
  const file = renameMap.get(finding.filePath) ?? finding.filePath;
  return [file, finding.check].join("\u0000");
}
function compareLocation(a: SecurityFinding, b: SecurityFinding): number {
  const left = Number.isSafeInteger(a.line) ? a.line as number : Number.MAX_SAFE_INTEGER;
  const right = Number.isSafeInteger(b.line) ? b.line as number : Number.MAX_SAFE_INTEGER;
  return left - right || a.title.localeCompare(b.title);
}

export function mergeSecurityFindings(...groups: SecurityFinding[][]): SecurityFinding[] {
  const byIdentity = new Map<string, SecurityFinding>();
  for (const finding of groups.flat()) {
    if (!finding || typeof finding.filePath !== "string" || typeof finding.check !== "string"
      || typeof finding.title !== "string") continue;
    const key = [finding.filePath, finding.line ?? "", finding.check, finding.title].join("\u0000");
    const previous = byIdentity.get(key);
    if (!previous || severityRank(finding.severity) > severityRank(previous.severity)) {
      byIdentity.set(key, { ...previous, ...finding });
    }
  }
  return [...byIdentity.values()].sort((a, b) =>
    a.filePath.localeCompare(b.filePath)
    || compareLocation(a, b)
    || a.check.localeCompare(b.check));
}

/**
 * Compare the same static rule against the base and head snapshots. Exact
 * normalized source-line hashes survive line movement, while one-to-one
 * metadata-only findings can fall back to a path/rule match. Ambiguous
 * duplicates are never fuzzy-matched, preventing a new occurrence from being
 * hidden by an unrelated old occurrence.
 */
export function classifyFindingDelta(
  baseline: SecurityFinding[],
  current: SecurityFinding[],
  baselineFiles: SourceFile[],
  currentFiles: SourceFile[],
  renamedPaths: Record<string, string> = {},
): FindingDelta {
  const renames = new Map(Object.entries(renamedPaths));
  const baseContents = new Map(baselineFiles.map(file => [file.path, file.content]));
  const headContents = new Map(currentFiles.map(file => [file.path, file.content]));
  const base = baseline.map(finding => ({
    finding,
    key: semanticKey(finding, renames),
    evidence: evidenceFingerprint(finding, baseContents),
    used: false,
  }));
  const head = current.map(finding => ({
    finding,
    key: semanticKey(finding, new Map()),
    evidence: evidenceFingerprint(finding, headContents),
    used: false,
  }));
  const baseGroups = new Map<string, typeof base>();
  const headGroups = new Map<string, typeof head>();
  for (const entry of base) {
    const group = baseGroups.get(entry.key) ?? [];
    group.push(entry);
    baseGroups.set(entry.key, group);
  }
  for (const entry of head) {
    const group = headGroups.get(entry.key) ?? [];
    group.push(entry);
    headGroups.set(entry.key, group);
  }

  const introduced: SecurityFinding[] = [];
  const resolved: SecurityFinding[] = [];
  const existing: SecurityFinding[] = [];
  for (const [key, oldGroup] of baseGroups) {
    const newGroup = headGroups.get(key) ?? [];
    oldGroup.sort((a, b) => compareLocation(a.finding, b.finding));
    newGroup.sort((a, b) => compareLocation(a.finding, b.finding));
    for (const oldEntry of oldGroup) {
      let match = oldEntry.evidence
        ? newGroup.find(entry => !entry.used && entry.evidence === oldEntry.evidence)
        : undefined;
      // A legacy report may have no source-line metadata. A one-to-one match
      // is safe; many-to-many guesses are not.
      if (!match && !oldEntry.evidence && oldGroup.length === 1 && newGroup.length === 1) {
        match = newGroup[0];
      }
      if (!match) {
        resolved.push(oldEntry.finding);
        continue;
      }
      match.used = true;
      if (severityRank(match.finding.severity) > severityRank(oldEntry.finding.severity)) {
        introduced.push(match.finding);
      } else {
        existing.push(match.finding);
      }
    }
  }
  for (const entry of head) {
    if (!entry.used) introduced.push(entry.finding);
  }
  return {
    introduced: introduced.sort(compareLocation),
    resolved: resolved.sort(compareLocation),
    existing: existing.sort(compareLocation),
  };
}
