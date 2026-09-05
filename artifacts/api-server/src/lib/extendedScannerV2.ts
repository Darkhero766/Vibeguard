import type { Finding } from "@workspace/api-zod";
import { runExtendedSecurityChecks } from "./extendedScanner";
import { readRepositoryFiles } from "./githubRepoReader";
import { SECURITY_CHECK_CATALOG } from "./securityCheckCatalog";

type RepoFile = { path: string; content: string };

// The catalog is the source of truth. The 8 core checks live in scanner.ts;
// the remaining catalog entries are implemented by extendedScanner.ts.
export const EXTENDED_RULE_COUNT = SECURITY_CHECK_CATALOG.filter(
  (check) => check.engine === "extended",
).length;

const SELF_SCAN_RULE_FILES = new Set([
  "artifacts/api-server/src/lib/apiScanner.ts",
  "artifacts/api-server/src/lib/extendedScanner.ts",
  "artifacts/api-server/src/lib/extendedScannerV2.ts",
  "artifacts/api-server/src/lib/securityCheckCatalog.ts",
  "artifacts/api-server/src/lib/scanner.ts",
]);

function lineAt(content: string, line: number): string {
  return content.split("\n")[line - 1] ?? "";
}

/**
 * Extended rules are intentionally conservative about obvious documentation,
 * local development URLs, and this scanner's own source. This prevents the
 * scanner from reporting its own regexes as vulnerabilities.
 */
function shouldKeepFinding(finding: Finding, files: RepoFile[]): boolean {
  if (SELF_SCAN_RULE_FILES.has(finding.filePath)) return false;
  const file = files.find((item) => item.path === finding.filePath);
  const sourceLine = file ? lineAt(file.content, finding.line) : "";

  if (finding.check === "http_url") {
    if (/https:\/\//i.test(sourceLine)) return false;
    if (/http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\b/i.test(sourceLine)) return false;
    if (/\.(?:md|mdx|txt)$/i.test(finding.filePath)) return false;
  }

  if (finding.check === "weak_random" && !/(token|secret|password|nonce|otp|session|reset|csrf|key|credential|auth)/i.test(sourceLine)) {
    return false;
  }

  if (finding.check === "database_url" && /(your_|example|placeholder|changeme|localhost|127\.0\.0\.1)/i.test(sourceLine)) {
    return false;
  }

  if (/\.(?:md|mdx)$/i.test(finding.filePath) && [
    "dangerous_html",
    "eval_usage",
    "document_write",
    "http_url",
    "weak_random",
  ].includes(finding.check)) {
    return false;
  }

  return true;
}

function deduplicate(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.filePath}:${finding.line}:${finding.check}:${finding.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scopedRepoUrl(repoUrl: string, scanPaths?: string[]): string {
  if (!scanPaths?.length) return repoUrl;
  const url = new URL(repoUrl);
  url.searchParams.set("paths", scanPaths.join("\n"));
  return url.toString();
}

export type SecurityScanContext = {
  applicableChecks: number;
  executedChecks: number;
  skippedChecks: number;
};

/**
 * Runs exactly the extended checks represented in SECURITY_CHECK_CATALOG.
 * Experimental detectors are deliberately not counted here; a new detector
 * must first receive a catalog entry so the UI's "50 checks" claim always
 * matches the executable rule set.
 */
export async function runExtendedSecurityChecksV2(
  repoUrl: string,
  githubToken?: string,
  scanPaths?: string[],
): Promise<Finding[]> {
  const scopedUrl = scopedRepoUrl(repoUrl, scanPaths);
  const result = await readRepositoryFiles(scopedUrl, githubToken);
  const baseFindings = await runExtendedSecurityChecks(scopedUrl, githubToken);
  const findings = baseFindings.filter((finding) => shouldKeepFinding(finding, result.files));
  return deduplicate(findings);
}
