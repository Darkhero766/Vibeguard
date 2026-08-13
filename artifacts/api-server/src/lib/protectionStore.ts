import { db, protectionEvents, protectedRepositories } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

export type ProtectionReport = { findings?: Array<{ severity: string }> };

export async function saveProtectedRepository(input: { owner: string; repo: string; repoUrl: string; baselineSha: string; score: number; report: ProtectionReport }) {
  const findings = input.report.findings ?? [];
  const counts = {
    critical: findings.filter((f) => f.severity === "Critical").length,
    high: findings.filter((f) => f.severity === "High").length,
    medium: findings.filter((f) => f.severity === "Medium").length,
  };
  const existing = await db.select().from(protectedRepositories).where(eq(protectedRepositories.repo, input.repo)).limit(1);
  if (existing[0]) {
    if (existing[0].owner !== input.owner) throw new Error("This repository is already protected by another VibeSane account.");
    const [updated] = await db.update(protectedRepositories).set({
      repoUrl: input.repoUrl,
      lastSha: input.baselineSha,
      status: "protected",
      lastScore: input.score,
      criticalCount: counts.critical,
      highCount: counts.high,
      mediumCount: counts.medium,
      lastEvent: "baseline",
      lastEventAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(protectedRepositories.repo, input.repo)).returning();
    return updated;
  }

  const [created] = await db.insert(protectedRepositories).values({
    owner: input.owner,
    repo: input.repo,
    repoUrl: input.repoUrl,
    baselineSha: input.baselineSha,
    lastSha: input.baselineSha,
    status: "protected",
    lastScore: input.score,
    criticalCount: counts.critical,
    highCount: counts.high,
    mediumCount: counts.medium,
    lastEvent: "baseline",
    lastEventAt: new Date(),
  }).returning();
  return created;
}

export async function listProtectedRepositories(owner: string) {
  return db.select().from(protectedRepositories).where(eq(protectedRepositories.owner, owner)).orderBy(desc(protectedRepositories.updatedAt));
}

export async function listProtectionEvents(repo: string, limit = 20) {
  return db.select().from(protectionEvents).where(eq(protectionEvents.repo, repo)).orderBy(desc(protectionEvents.createdAt)).limit(limit);
}

export async function getProtectedRepository(repo: string) {
  const rows = await db.select().from(protectedRepositories).where(eq(protectedRepositories.repo, repo)).limit(1);
  return rows[0] ?? null;
}

export async function recordProtectionEvent(input: { repo: string; event: string; sha: string; status: string; report: ProtectionReport }) {
  const findings = input.report.findings ?? [];
  const critical = findings.filter((f) => f.severity === "Critical").length;
  const high = findings.filter((f) => f.severity === "High").length;
  const medium = findings.filter((f) => f.severity === "Medium").length;
  await db.insert(protectionEvents).values({ repo: input.repo, event: input.event, sha: input.sha, status: input.status, findingsCount: findings.length, criticalCount: critical, highCount: high, mediumCount: medium });
  await db.update(protectedRepositories).set({ lastSha: input.sha, lastScore: Math.max(0, 100 - critical * 18 - high * 10 - medium * 4), criticalCount: critical, highCount: high, mediumCount: medium, lastEvent: input.event, lastEventAt: new Date(), updatedAt: new Date() }).where(eq(protectedRepositories.repo, input.repo));
}
