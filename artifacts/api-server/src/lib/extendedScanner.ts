import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import type { Finding } from "@workspace/api-zod";

const execFileAsync = promisify(execFile);

type RepositoryFile = { path: string; content: string };

const MAX_FILES = 300;
const MAX_FILE_BYTES = 750_000;
const MAX_TOTAL_BYTES = 12_000_000;
const IGNORED = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "vendor"]);
const TEXT_PATH = /\.(?:[cm]?[jt]sx?|sql|json|ya?ml|md|mdx|toml|ini|conf|xml|html|css|scss|sh|bash|py|rb|go|rs|java|php)$/i;

function shouldRead(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  return (
    (TEXT_PATH.test(path) || /^Dockerfile(?:\..*)?$/i.test(base) || /^\.npmrc$/i.test(base) || /^\.gitignore$/i.test(base)) &&
    !path.split("/").some((part) => IGNORED.has(part))
  );
}

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1").replace(/(^|\s)--.*$/gm, "$1");
}

function makeFinding(
  id: string,
  severity: Finding["severity"],
  title: string,
  description: string,
  filePath: string,
  line: number,
  check: string,
): Finding {
  return { id, severity, title, description, filePath, line: Math.max(1, line), check } as Finding;
}

function regexFindings(
  files: RepositoryFile[],
  rule: { id: string; severity: Finding["severity"]; title: string; description: string; pattern: RegExp; extensions?: RegExp },
): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (rule.extensions && !rule.extensions.test(file.path)) continue;
    for (const match of file.content.matchAll(rule.pattern)) {
      const line = lineAt(file.content, match.index ?? 0);
      const source = file.content.split("\n")[line - 1] ?? "";
      if (/^\s*(?:\/\/|\/\*|\*|#|--)/.test(source)) continue;
      findings.push(makeFinding(`${rule.id}-${file.path}-${line}`, rule.severity, rule.title, rule.description, file.path, line, rule.id));
    }
  }
  return findings;
}

async function readRepository(repoUrl: string, githubToken?: string): Promise<RepositoryFile[]> {
  const parsed = new URL(repoUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/, "");
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com" || !owner || !repo) {
    throw new Error("Invalid GitHub repository URL");
  }

  const parent = await mkdtemp("/tmp/vibesane-extended-");
  const checkout = `${parent}/repo`;
  const cloneUrl = `https://github.com/${owner}/${repo}.git`;
  const resolved = githubToken ? cloneUrl.replace("https://", `https://x-oauth-token:${githubToken}@`) : cloneUrl;

  try {
    await execFileAsync("git", ["clone", "--no-checkout", "--depth", "1", "--no-tags", "--single-branch", "--quiet", resolved, checkout], { timeout: 120_000, maxBuffer: 2_000_000 });
    const { stdout } = await execFileAsync("git", ["-C", checkout, "ls-tree", "-r", "--name-only", "-z", "HEAD"], { timeout: 20_000, maxBuffer: 20_000_000 });
    const paths = stdout.split("\0").filter((p) => p && shouldRead(p)).slice(0, MAX_FILES);
    const files: RepositoryFile[] = [];
    let total = 0;
    for (const path of paths) {
      try {
        const { stdout: content } = await execFileAsync("git", ["-C", checkout, "show", `HEAD:${path}`], { timeout: 10_000, maxBuffer: MAX_FILE_BYTES + 1 });
        const size = Buffer.byteLength(content, "utf8");
        if (!content || size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) continue;
        total += size;
        files.push({ path, content });
      } catch { /* skip unreadable/binary files */ }
    }
    return files;
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function sqlChecks(files: RepositoryFile[]): Finding[] {
  const out: Finding[] = [];
  for (const file of files.filter((f) => /\.sql$/i.test(f.path))) {
    const sql = stripComments(file.content);

    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)/gi)) {
      const table = m[1];
      const after = sql.slice(m.index ?? 0, (m.index ?? 0) + 12000);
      const rls = new RegExp(`alter\\s+table\\s+(?:public\\.)?${table.split(".").pop()}\\s+enable\\s+row\\s+level\\s+security`, "i").test(sql);
      const policy = new RegExp(`create\\s+policy[\\s\\S]{0,1000}on\\s+(?:public\\.)?${table.split(".").pop()}`, "i").test(sql);
      if (rls && !policy) {
        out.push(makeFinding(`rls-policy-${file.path}-${lineAt(file.content, m.index ?? 0)}`, "High", `RLS is enabled but "${table}" has no visible policy`, `Row-Level Security is enabled on ${table}, but no CREATE POLICY statement for the table was found. RLS without policies can unintentionally make every operation fail or tempt developers to bypass RLS.`, file.path, lineAt(file.content, m.index ?? 0), "rls_policy_missing"));
      }
      void after;
    }

    for (const m of sql.matchAll(/grant\s+(?:all|select|insert|update|delete|usage|references|trigger)\b[\s\S]{0,300}?\bto\s+public\b/gi)) {
      out.push(makeFinding(`grant-public-${file.path}-${lineAt(file.content, m.index ?? 0)}`, "High", "Database privileges granted to PUBLIC", "A GRANT statement gives database privileges to PUBLIC. This can expose data or capabilities to every database role, including unauthenticated access paths. Grant only the minimum required role.", file.path, lineAt(file.content, m.index ?? 0), "sql_grant_public"));
    }
    for (const m of sql.matchAll(/grant\s+(?:all|select|insert|update|delete|usage|references|trigger)\b[\s\S]{0,300}?\bto\s+anon\b/gi)) {
      out.push(makeFinding(`grant-anon-${file.path}-${lineAt(file.content, m.index ?? 0)}`, "Critical", "Database privileges granted to anon", "The Supabase anon role is granted direct database privileges. Review whether unauthenticated clients truly need this access and constrain it with RLS policies.", file.path, lineAt(file.content, m.index ?? 0), "sql_grant_anon"));
    }
    for (const m of sql.matchAll(/(?:create|insert)\s+policy[\s\S]{0,1200}\bon\s+storage\.objects[\s\S]{0,1200}\b(?:using|with\s+check)\s*\(\s*true\s*\)/gi)) {
      out.push(makeFinding(`storage-policy-${file.path}-${lineAt(file.content, m.index ?? 0)}`, "High", "Storage policy allows every row", "A storage.objects policy uses a literal TRUE condition, which can make objects readable or writable by every role that can reach the bucket.", file.path, lineAt(file.content, m.index ?? 0), "storage_policy_broad"));
    }
    for (const m of sql.matchAll(/(?:insert\s+into\s+storage\.buckets|update\s+storage\.buckets)[\s\S]{0,500}\bpublic\s*=\s*true\b/gi)) {
      out.push(makeFinding(`storage-public-${file.path}-${lineAt(file.content, m.index ?? 0)}`, "High", "Supabase Storage bucket is explicitly public", "This migration makes a storage bucket public. Confirm that every object in the bucket is intended to be world-readable.", file.path, lineAt(file.content, m.index ?? 0), "storage_public"));
    }
    for (const m of sql.matchAll(/grant\s+execute\s+on\s+function[\s\S]{0,500}\bto\s+(?:public|anon)\b/gi)) {
      out.push(makeFinding(`execute-public-${file.path}-${lineAt(file.content, m.index ?? 0)}`, "High", "Database function executable by public or anon", "A database function is callable by PUBLIC/anon. For privileged functions, this can create an unintended privilege-escalation path.", file.path, lineAt(file.content, m.index ?? 0), "sql_execute_public"));
    }
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function[\s\S]{0,2500}?security\s+definer/gi)) {
      const block = m[0];
      if (!/set\s+search_path\s*=|set_config\s*\(\s*['"]search_path/i.test(block)) {
        out.push(makeFinding(`definer-path-${file.path}-${lineAt(file.content, m.index ?? 0)}`, "High", "SECURITY DEFINER function does not pin search_path", "A SECURITY DEFINER function without a controlled search_path can be exposed to search-path hijacking and object shadowing. Set an explicit trusted search_path.", file.path, lineAt(file.content, m.index ?? 0), "security_definer_search_path"));
      }
    }
  }
  return out;
}

const rules: Array<{ id: string; severity: Finding["severity"]; title: string; description: string; pattern: RegExp; extensions?: RegExp }> = [
  { id: "hardcoded_jwt_secret", severity: "Critical", title: "JWT signing secret is hardcoded", description: "A JWT signing secret appears as a source literal. Keep signing keys server-side in secret storage and rotate exposed credentials.", pattern: /(?:JWT_SECRET|JWT_SIGNING_KEY|jwtSecret)\s*[:=]\s*["'][^"']{12,}["']/g, extensions: /\.(?:[cm]?[jt]sx?|py|rb|go|java|php)$/i },
  { id: "google_api_key", severity: "High", title: "Google API key appears in source", description: "A Google API key pattern was detected in repository source. Restrict, rotate, or move it to the correct server-side secret store as appropriate.", pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { id: "github_token", severity: "Critical", title: "GitHub access token appears in source", description: "A GitHub personal or fine-grained access token appears in source control. Revoke it immediately and move credentials out of the repository.", pattern: /(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{30,}/g },
  { id: "private_key", severity: "Critical", title: "Private key material is committed", description: "A PEM private key block was detected. Private keys should never be committed; revoke or replace the key and remove it from history.", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { id: "database_url", severity: "Critical", title: "Database credential URL is hardcoded", description: "A database connection URL containing credentials appears in source. Move it to a server-side secret and rotate the credential if exposed.", pattern: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'`]{8,}/gi },
  { id: "hardcoded_password", severity: "High", title: "Hardcoded password assignment", description: "A password-like variable is assigned a long literal. Hardcoded credentials remain exposed in version history and should be replaced with secret management.", pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"'\n]{12,}["']/gi },
  { id: "hardcoded_bearer", severity: "High", title: "Hardcoded bearer token", description: "A bearer token is embedded directly in source. Authentication tokens should be injected at runtime and never committed.", pattern: /Bearer\s+[A-Za-z0-9._~+\/-]{20,}/g },
  { id: "sendgrid_key", severity: "Critical", title: "SendGrid API key appears in source", description: "A SendGrid API key pattern was detected. Revoke it and move mail-service credentials to secret storage.", pattern: /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g },
  { id: "twilio_token", severity: "Critical", title: "Twilio credential appears in source", description: "A Twilio auth token-like value was detected near a Twilio credential name. Revoke and replace the credential if it is real.", pattern: /(?:TWILIO_AUTH_TOKEN|twilioAuthToken)\s*[:=]\s*["'][A-Za-z0-9]{20,}["']/gi },
  { id: "slack_token", severity: "High", title: "Slack token appears in source", description: "A Slack bot/user token appears in source control. Revoke it and use a secret manager instead.", pattern: /xox[baprs]-[0-9A-Za-z-]{20,}/g },
  { id: "npm_token", severity: "Critical", title: "npm access token appears in source", description: "An npm automation/access token appears in source. Revoke it and remove it from version control.", pattern: /npm_[A-Za-z0-9]{30,}/g },
  { id: "vercel_token", severity: "High", title: "Vercel token appears in source", description: "A Vercel token-like environment variable is hardcoded. Move deployment credentials to secret storage.", pattern: /(?:VERCEL_TOKEN|vercelToken)\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/g },
  { id: "netlify_token", severity: "High", title: "Netlify token appears in source", description: "A Netlify personal access token-like value is hardcoded. Revoke it if real and move it to deployment secrets.", pattern: /(?:NETLIFY_AUTH_TOKEN|NETLIFY_TOKEN)\s*[:=]\s*["'][A-Za-z0-9_-]{20,}["']/gi },
  { id: "child_process_exec", severity: "Critical", title: "OS command execution API is used", description: "child_process execution APIs can become command-injection vulnerabilities when arguments contain user input. Verify every argument is fixed or safely validated.", pattern: /(?:child_process|from\s+["']node:child_process["'])[\s\S]{0,400}\b(?:exec|execFile|execSync|spawn|spawnSync)\s*\(/g, extensions: /\.(?:[cm]?[jt]sx?|ts|js)$/i },
  { id: "eval_usage", severity: "High", title: "eval() is used", description: "eval executes strings as code and can turn attacker-controlled input into arbitrary code execution. Replace it with structured parsing or explicit dispatch.", pattern: /\beval\s*\(/g, extensions: /\.(?:[cm]?[jt]sx?|py|rb|php)$/i },
  { id: "function_constructor", severity: "High", title: "Function constructor is used", description: "The Function constructor evaluates a string as JavaScript and can become code execution when input is attacker-controlled.", pattern: /\bnew\s+Function\s*\(/g, extensions: /\.(?:[cm]?[jt]sx?)$/i },
  { id: "innerhtml_assignment", severity: "High", title: "innerHTML assignment detected", description: "Assigning innerHTML with untrusted content can create DOM XSS. Prefer textContent or framework-safe rendering and sanitize unavoidable HTML.", pattern: /\.innerHTML\s*=/g, extensions: /\.(?:[cm]?[jt]sx?|html)$/i },
  { id: "dangerous_html", severity: "High", title: "React dangerouslySetInnerHTML is used", description: "dangerouslySetInnerHTML bypasses React's normal escaping. Ensure the HTML is sanitized and never derived directly from untrusted input.", pattern: /dangerouslySetInnerHTML/g, extensions: /\.(?:[cm]?[jt]sx?)$/i },
  { id: "document_write", severity: "Medium", title: "document.write() is used", description: "document.write can create DOM injection problems and can overwrite the document during page load. Prefer DOM APIs or framework rendering.", pattern: /\bdocument\.write\s*\(/g, extensions: /\.(?:[cm]?[jt]sx?|html)$/i },
  { id: "postmessage_wildcard", severity: "Medium", title: "postMessage uses wildcard origin", description: "window.postMessage(..., '*') sends data to any origin. Use an explicit trusted origin when transmitting sensitive data.", pattern: /\.postMessage\s*\([\s\S]{0,300},\s*["']\*["']\s*\)/g, extensions: /\.(?:[cm]?[jt]sx?)$/i },
  { id: "open_redirect", severity: "High", title: "Redirect target comes from request input", description: "Redirecting directly to a request parameter can create an open redirect and phishing primitive. Validate destinations against an allowlist.", pattern: /\b(?:res|response)\.redirect\s*\(\s*(?:req\.(?:query|body|params)|searchParams\.get)/g, extensions: /\.(?:[cm]?[jt]sx?|ts|js)$/i },
  { id: "cors_all_origins", severity: "Medium", title: "CORS allows every origin", description: "A wildcard CORS policy allows arbitrary sites to make cross-origin requests. Avoid wildcard origins when authenticated data is exposed.", pattern: /(?:origin|Access-Control-Allow-Origin)\s*[:=]\s*["']\*["']/gi },
  { id: "cookie_missing_httponly", severity: "Medium", title: "Cookie is set without HttpOnly", description: "A server cookie is created without an explicit HttpOnly flag. Session cookies should normally be inaccessible to JavaScript to reduce token theft through XSS.", pattern: /(?:res|response)\.cookie\s*\([\s\S]{0,500}\{[\s\S]{0,500}\}\s*\)/g, extensions: /\.(?:[cm]?[jt]sx?|ts|js)$/i },
  { id: "cookie_insecure", severity: "Medium", title: "Cookie explicitly disables Secure", description: "A cookie is configured with secure:false. Authentication/session cookies should use Secure in HTTPS deployments.", pattern: /(?:secure\s*:\s*false|secure\s*=\s*false)/gi },
  { id: "cookie_samesite_none", severity: "Medium", title: "Cookie uses SameSite=None", description: "SameSite=None permits cross-site cookie sending and requires Secure. Use it only when cross-site authentication is intentional.", pattern: /sameSite\s*:\s*["']none["']/gi },
  { id: "http_url", severity: "Low", title: "Insecure HTTP URL is hardcoded", description: "A plain HTTP URL appears in source. Use HTTPS for network requests unless the endpoint is deliberately local or otherwise trusted.", pattern: /https?:\/\/[^\s"'`]+/gi, extensions: /\.(?:[cm]?[jt]sx?|json|ya?ml|py|rb|go|java|php)$/i },
  { id: "debug_endpoint", severity: "Medium", title: "Debug/admin endpoint is exposed in source", description: "A route containing debug/internal/admin semantics was detected. Verify it requires strong authentication and is not publicly reachable in production.", pattern: /(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*["'`]\/(?:debug|internal|admin|actuator)(?:\/|["'`])/gi, extensions: /\.(?:[cm]?[jt]sx?|ts|js)$/i },
  { id: "wildcard_dependency", severity: "Medium", title: "Dependency version is unbounded", description: "A package dependency uses *, latest, or a broad range. Pinning versions improves reproducibility and reduces unexpected supply-chain changes.", pattern: /["'][^"']+["']\s*:\s*["'](?:\*|latest)["']/g, extensions: /(^|\/)package\.json$/i },
  { id: "git_dependency", severity: "Medium", title: "Dependency is installed directly from git", description: "A dependency points directly at a git repository. This bypasses normal registry versioning and can change unexpectedly; pin an immutable commit where appropriate.", pattern: /["'](?:git\+https?:\/\/|https?:\/\/github\.com\/[^"']+\.git(?:#|["']))/g, extensions: /(^|\/)package\.json$/i },
  { id: "npmrc_token", severity: "Critical", title: "npm authentication token is committed", description: "An .npmrc file contains an authentication token or registry credential. Revoke it and use CI/developer secret storage instead.", pattern: /(?:_authToken|_password|authToken)\s*=\s*[^\s#]{12,}/gi, extensions: /(^|\/)\.npmrc$/i },
  { id: "docker_socket", severity: "Critical", title: "Docker socket is mounted", description: "Mounting /var/run/docker.sock gives a container access to the Docker daemon and can effectively provide host-level control. Avoid it unless the trust boundary is intentional.", pattern: /\/var\/run\/docker\.sock/g, extensions: /(?:Dockerfile|\.ya?ml)$/i },
  { id: "weak_hash", severity: "High", title: "Weak MD5/SHA-1 hashing is used", description: "MD5 and SHA-1 are unsuitable for password hashing and many integrity/security uses. Use a modern password KDF or SHA-256/384/512 where appropriate.", pattern: /\b(?:md5|sha1|createHash\s*\(\s*["'](?:md5|sha1)["'])/gi },
  { id: "weak_random", severity: "Medium", title: "Math.random() used for security-sensitive-looking value", description: "Math.random is not cryptographically secure. Do not use it for tokens, reset codes, session IDs, secrets, or other security-sensitive values; use a CSPRNG instead.", pattern: /(?:token|secret|password|nonce|otp|session|reset|code|key|id)[A-Za-z0-9_]*\s*=\s*[^\n]*Math\.random\s*\(/gi, extensions: /\.(?:[cm]?[jt]sx?)$/i },
  { id: "path_traversal", severity: "High", title: "Filesystem path is built from request input", description: "Joining filesystem paths with req.query/params/body input can permit ../ traversal. Normalize and constrain the resolved path to an approved root.", pattern: /(?:join|resolve)\s*\([^\n]*(?:req\.(?:query|params|body)|searchParams\.get)/gi, extensions: /\.(?:[cm]?[jt]sx?|ts|js|py|rb|php)$/i },
  { id: "command_injection", severity: "Critical", title: "Command execution uses request-controlled input", description: "An OS command API appears to receive request-derived data. Validate against an allowlist and prefer argument arrays over shell strings.", pattern: /\b(?:exec|execSync|spawn|spawnSync)\s*\([^\n]*(?:req\.(?:query|params|body)|searchParams\.get)/gi, extensions: /\.(?:[cm]?[jt]sx?|ts|js|py|rb|php)$/i },
];

export async function runExtendedSecurityChecks(repoUrl: string, githubToken?: string): Promise<Finding[]> {
  const files = await readRepository(repoUrl, githubToken);
  const findings = [
    ...sqlChecks(files),
    ...rules.flatMap((rule) => regexFindings(files, rule)),
  ];
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.filePath}:${f.line}:${f.check}:${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
