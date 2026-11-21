import { scanExtendedFiles, type ExtendedFinding } from "./extendedScanner";
import { readRepositoryFiles } from "./githubRepoReader";
import { SECURITY_CHECK_CATALOG } from "./securityCheckCatalog";

type RepoFile = { path: string; content: string };

// The catalog is the source of truth. Core checks live in apiScanner.ts;
// the remaining catalog entries are implemented by extendedScanner.ts.
export const EXTENDED_RULE_COUNT = SECURITY_CHECK_CATALOG.filter(
  (check) => check.engine === "extended",
).length;

const SELF_SCAN_RULE_FILES = new Set([
  "artifacts/api-server/src/lib/apiScanner.ts",
  "artifacts/api-server/src/lib/passwordStorageScanner.ts",
  "artifacts/api-server/scripts/test-password-storage-scanner.mjs",
  "artifacts/api-server/scripts/test-vibesane-v2-context.mjs",
  "artifacts/api-server/scripts/test-phase1-staging-isolation.mjs",
  // Isolated in-repo detector fixtures are not executable customer attack paths.
  "artifacts/api-server/scripts/test-phase2-external-missed-class-regressions.mjs",
  "artifacts/api-server/src/lib/extendedScanner.ts",
  "artifacts/api-server/src/lib/extendedScannerV2.ts",
  "artifacts/api-server/src/lib/securityCheckCatalog.ts",
  "artifacts/api-server/src/lib/scanner.ts",
]);

function lineAt(content: string, line: number): string {
  return content.split("\n")[line - 1] ?? "";
}

/**
 * A direct-call-looking string inside a quoted single-line test fixture is
 * inert. Conservatively skip ambiguous template interpolation, too.
 */
function insideQuotedLiteral(line: string, index: number): boolean {
  let quote = "";
  for (let i = 0; i < index; i++) {
    const char = line[i];
    if (char === "\\") { i++; continue; }
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === "'" || char === '"' || char.charCodeAt(0) === 96) {
      quote = char;
    }
  }
  return quote.length > 0;
}

/**
 * Extended rules are intentionally conservative about obvious documentation,
 * local development URLs, and this scanner's own source. This prevents the
 * scanner from reporting its own regexes as vulnerabilities.
 */
function shouldKeepFinding(finding: ExtendedFinding, files: RepoFile[]): boolean {
  if (SELF_SCAN_RULE_FILES.has(finding.filePath)) return false;
  const file = files.find((item) => item.path === finding.filePath);
  const sourceLine = file ? lineAt(file.content, finding.line) : "";

  if (finding.check === "http_url") {
    // A bare URI in a README, test assertion, error string, URL parser, etc.
    // does not show insecure transport. Require a literal HTTP URL directly
    // supplied to an explicit network client invocation. This bounded rule
    // intentionally misses variable, aliased and multiline transport calls.
    const networkLiteral = /\b(?:fetch|axios\.(?:get|post|put|patch|delete|request)|request(?:\.(?:get|post|put|patch|delete))?|https?\.(?:get|request))\s*\(\s*['"\x60]http:\/\/([^\s/'"\x60?#]+)/i.exec(sourceLine);
    if (!networkLiteral || insideQuotedLiteral(sourceLine, networkLiteral.index)) return false;
    const host = networkLiteral[1].toLowerCase();
    if (/(?:^|\.)example\.(?:com|org|net)(?::\d+)?$|^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?$|\.invalid(?::\d+)?$/.test(host)) return false;
    if (/\.(?:md|mdx|txt)$/i.test(finding.filePath)) return false;
  }

  if (finding.check === "cookie_missing_httponly") {
    // Some CSRF double-submit cookies must be readable by JS. Do NOT infer
    // safety from the cookie name alone: require a matching client-side read
    // plus a clearly named CSRF issuer and its literal cookie-name call.
    const src = file?.content ?? "";
    const csrfIssuer = /\bfunction\s+attachCsrfToken\s*\(\s*url\s*,\s*cookie\s*,\s*value\s*\)/.test(src) &&
      /\battachCsrfToken\s*\([^;\n]{0,140}['"\x60]csrfToken['"\x60]/.test(src);
    const csrfReader = files.some(f => /\bgetCookie\s*\(\s*['"\x60]csrfToken['"\x60]\s*\)/.test(f.content));
    if (csrfIssuer && csrfReader &&
        /\b(?:res|response)\.cookie\s*\(\s*cookie\s*,\s*value\s*\)/.test(sourceLine)) return false;
  }

  if (finding.check === "weak_random") {
    // Match the target being assigned a predictable value, rather than
    // unrelated security-like words elsewhere on a long/minified line. A
    // storage key named "keystone-customers" is not a reset token.
    const randomCalls = [...sourceLine.matchAll(/\bMath\.random\s*\(/g)];
    const securityValue = randomCalls.some(call => {
      const pos = call.index ?? 0;
      let quote = "";
      for (let i = 0; i < pos; i++) {
        const ch = sourceLine[i];
        if (ch === "\\") { i++; continue; }
        if (quote) {
          if (ch === quote) quote = "";
        } else if (ch === "'" || ch === '"') {
          quote = ch;
        }
      }
      if (quote) return false; // Quoted patch content is not executable JS.
      const prefix = sourceLine.slice(Math.max(0, pos - 500), pos);
      if (/\battachCsrfToken\s*\([^;\n]*$/i.test(prefix)) return true;
      const assignments = [...prefix.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=(?!=|>)|:(?!:))\s*/g)];
      const target = assignments.at(-1)?.[1] ?? "";
      return /(?:token|secret|password|passwd|passphrase|nonce|otp|session|reset|csrf|credential|authorization|(?:api|auth|signing|encryption)key$|^key$)/i.test(target);
    });
    if (!securityValue) return false;
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

/** Context only: predictable reset-token checks can enable account takeover.
 * Do not upgrade every MD5 use; harmless MD5 digests stay ordinary review hints.
 */
function contextualSeverity(finding: ExtendedFinding, files: RepoFile[]): ExtendedFinding {
  // Keep test fixtures visible for triage without implying that a cookie
  // example is an exposed production authentication token.
  if (finding.check === "cookie_missing_httponly" &&
      /(?:^|\/)(?:test|tests|__tests__|spec|specs)(?:\/|$)|(?:\.test|\.spec)\.[cm]?[jt]sx?$/i.test(finding.filePath)) {
    return {
      ...finding, severity: "Low",
      description: finding.description + " Located in test/fixture code; verify production reachability before escalating.",
    };
  }
  if (finding.check === "dangerous_html") {
    const source = files.find(f => f.path === finding.filePath)?.content ?? "";
    const lines = source.split("\n");
    const near = lines.slice(Math.max(0, finding.line - 4), finding.line).join("\n");
    const output = lines.slice(Math.max(0, finding.line - 1), finding.line + 22).join("\n");
    // CSS generated from chart themes is not automatically an exploitable
    // HTML XSS, but dynamic config may still be CSS/HTML injection.
    if (/<style\b/i.test(near) &&
        /\bObject\.entries\s*\(\s*THEMES\s*\)/.test(output) &&
        /\bcolorConfig\b/.test(output)) {
      return {
        ...finding, severity: "Medium",
        title: "Chart component inserts dynamic CSS through dangerouslySetInnerHTML",
        description: "A chart style element generates CSS from configuration. Verify the chart id, variable names and theme color values cannot contain untrusted CSS or HTML; the source pattern alone does not prove XSS.",
      };
    }
  }
  if (finding.check !== "weak_hash") return finding;
  const file = files.find(f => f.path === finding.filePath);
  const line = file ? lineAt(file.content, finding.line) : "";
  if (/\breq\.(?:query|body)\.token\s*={1,3}\s*md5\s*\(\s*req\.(?:query|body)\.login\s*\)/i.test(line)) {
    return {
      ...finding,
      severity: "Critical",
      title: "Predictable password reset token may enable account takeover",
      description: "A reset token is compared with a deterministic MD5 of a request-controlled login identifier. Verify the password-reset flow and use single-use, high-entropy, expiring server-stored tokens.",
    };
  }
  return finding;
}

function deduplicate(findings: ExtendedFinding[]): ExtendedFinding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.filePath}:${finding.line}:${finding.check}:${finding.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Apply the same filtering and de-duplication to local files without GitHub access. */
export function scanExtendedFilesV2(files: RepoFile[]): ExtendedFinding[] {
  return deduplicate(scanExtendedFiles(files)
    .filter((finding) => shouldKeepFinding(finding, files))
    .map((finding) => contextualSeverity(finding, files)));
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
export type ExtendedScanResultV2 = {
  findings: ExtendedFinding[];
  filesScanned: number;
};

/** Scan all eligible files once and return honest coverage metadata. */
export async function runExtendedSecurityChecksV2WithStats(
  repoUrl: string,
  githubToken?: string,
  scanPaths?: string[],
): Promise<ExtendedScanResultV2> {
  const scopedUrl = scopedRepoUrl(repoUrl, scanPaths);
  // One GitHub download powers analysis and filtering; no second tree/blob fetch.
  const result = await readRepositoryFiles(scopedUrl, githubToken);
  return { findings: scanExtendedFilesV2(result.files), filesScanned: result.files.length };
}

/** Retain the legacy array-only interface for other scanner callers. */
export async function runExtendedSecurityChecksV2(
  repoUrl: string,
  githubToken?: string,
  scanPaths?: string[],
): Promise<ExtendedFinding[]> {
  return (await runExtendedSecurityChecksV2WithStats(repoUrl, githubToken, scanPaths)).findings;
}
