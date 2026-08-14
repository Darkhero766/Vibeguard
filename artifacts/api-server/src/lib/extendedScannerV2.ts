import type { Finding } from "@workspace/api-zod";
import { runExtendedSecurityChecks } from "./extendedScanner";
import { readRepositoryFiles } from "./githubRepoReader";

type RepoFile = { path: string; content: string };

export const EXTENDED_RULE_COUNT = 50;

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

function shouldKeepFinding(finding: Finding, files: RepoFile[]): boolean {
  if (SELF_SCAN_RULE_FILES.has(finding.filePath)) return false;

  const file = files.find((item) => item.path === finding.filePath);
  const sourceLine = file ? lineAt(file.content, finding.line) : "";

  // The previous HTTP detector matched both http:// and https://. Only plain HTTP is insecure.
  if (finding.check === "http_url") {
    if (/https:\/\//i.test(sourceLine)) return false;
    if (/http:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\b/i.test(sourceLine)) return false;
    if (/\.(?:md|mdx|txt)$/i.test(finding.filePath)) return false;
  }

  // Math.random is fine for visual-only values such as skeleton widths. Flag it only when
  // the surrounding line actually looks security-sensitive.
  if (finding.check === "weak_random" && !/(token|secret|password|nonce|otp|session|reset|csrf|key|credential|auth)/i.test(sourceLine)) {
    return false;
  }

  // Template database URLs are not credentials and should not be treated as live secrets.
  if (finding.check === "database_url" && /(your_|example|placeholder|changeme|localhost|127\.0\.0\.1)/i.test(sourceLine)) {
    return false;
  }

  // The repository intentionally contains safe documentation describing security rules.
  // Findings from markdown are not actionable code vulnerabilities.
  if (/\.(?:md|mdx)$/i.test(finding.filePath) && ["dangerous_html", "eval_usage", "document_write", "http_url", "weak_random"].includes(finding.check)) {
    return false;
  }

  return true;
}

function addTargetedChecks(files: RepoFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files) {
    if (!/\.(?:[cm]?[jt]sx?|mjs|cjs|py|rb|php|go|java)$/i.test(file.path)) continue;

    for (const match of file.content.matchAll(/(?:rejectUnauthorized|checkServerIdentity)\s*[:=]\s*false/gi)) {
      const line = file.content.slice(0, match.index ?? 0).split("\n").length;
      findings.push({
        id: `tls-verification-${file.path}-${line}`,
        severity: "Medium",
        title: "TLS certificate verification disabled",
        description: "Disabling TLS certificate verification defeats server identity checks and can expose credentials to interception.",
        filePath: file.path,
        line,
        check: "tls_verification_disabled",
      } as Finding);
    }

    for (const match of file.content.matchAll(/(?:unserialize|deserialize|yaml\.load\s*\(|pickle\.loads|ObjectInputStream|readObject\s*\()/gi)) {
      const line = file.content.slice(0, match.index ?? 0).split("\n").length;
      findings.push({
        id: `deserialization-${file.path}-${line}`,
        severity: "High",
        title: "Insecure deserialization",
        description: "Deserializing untrusted object data without strict type validation can enable data corruption, denial of service, or code execution. Treat serialized input as untrusted.",
        filePath: file.path,
        line,
        check: "insecure_deserialization",
      } as Finding);
    }
  }

  return findings;
}

export async function runExtendedSecurityChecksV2(repoUrl: string, githubToken?: string): Promise<Finding[]> {
  const result = await readRepositoryFiles(repoUrl, githubToken);
  const baseFindings = await runExtendedSecurityChecks(repoUrl, githubToken);
  const targeted = addTargetedChecks(result.files);
  const findings = [...baseFindings, ...targeted].filter((finding) => shouldKeepFinding(finding, result.files));
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const key = `${finding.filePath}:${finding.line}:${finding.check}:${finding.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
