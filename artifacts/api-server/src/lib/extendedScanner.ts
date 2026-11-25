import type { Finding } from "@workspace/api-zod";
import { readRepositoryFiles } from "./githubRepoReader";
import { scanPotentialPlaintextPasswords } from "./passwordStorageScanner";

type RepositoryFile = { path: string; content: string };

// Extended heuristics include Low findings. The generated web API Finding
// schema currently exposes only Critical/High/Medium; normalize Low at API boundaries.
export type ExtendedFinding = Omit<Finding, "severity"> & {
  severity: Finding["severity"] | "Low";
};

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1").replace(/(^|\s)--.*$/gm, "$1");
}

function makeFinding(
  id: string,
  severity: ExtendedFinding["severity"],
  title: string,
  description: string,
  filePath: string,
  line: number,
  check: string,
): ExtendedFinding {
  return { id, severity, title, description, filePath, line: Math.max(1, line), check } as ExtendedFinding;
}

/**
 * Ignore lexically inert payload strings only when a simple, still-open
 * single-line variable initializer proves the detector match is text.
 * Any complex expression (template interpolation, parser ambiguity) keeps
 * its original finding. This is intentionally NOT a general JS lexer.
 */
function inSimpleLiteralInitializer(content: string, index: number): boolean {
  const lineStart = content.lastIndexOf("\n", index - 1) + 1;
  const prefix = content.slice(lineStart, index);
  return /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(['"])(?:\\.|(?!\1)[^\\])*$/u.test(prefix);
}

// Keep offsets stable while excluding JavaScript comments and quoted text from
// rules that look for executable identifiers. This lexer is deliberately
// conservative: template literals are treated as text because the JWT literal
// rule does not support them as assignments.
function maskJavaScriptInert(source: string): string {
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i], next = source[i + 1];
    if (mode === 'code') {
      if (ch === '/' && next === '/') { mode = 'line'; out += '  '; i++; continue; }
      if (ch === '/' && next === '*') { mode = 'block'; out += '  '; i++; continue; }
      if (ch === "'") { mode = 'single'; out += ' '; continue; }
      if (ch === '"') { mode = 'double'; out += ' '; continue; }
      if (ch === '`') { mode = 'template'; out += ' '; continue; }
      out += ch;
      continue;
    }
    if (mode === 'line') {
      if (ch === '\n') { mode = 'code'; out += '\n'; } else out += ' ';
      continue;
    }
    if (mode === 'block') {
      if (ch === '*' && next === '/') { mode = 'code'; out += '  '; i++; }
      else out += ch === '\n' ? '\n' : ' ';
      continue;
    }
    if (ch === '\\') {
      out += ' ';
      if (i + 1 < source.length) {
        out += source[i + 1] === '\n' ? '\n' : ' ';
        i++;
      }
      continue;
    }
    if ((mode === 'single' && ch === "'") || (mode === 'double' && ch === '"')
      || (mode === 'template' && ch === '`')) mode = 'code';
    out += ch === '\n' ? '\n' : ' ';
  }
  return out;
}

/**
 * Only suppress a missing HttpOnly heuristic when the third argument is a
 * directly preceding constant object with an explicit literal true value.
 * No spreads, intervening statements, shadowed assignments, or mutations
 * can be proven by this bounded rule, so they stay reviewable warnings.
 */
function safeAdjacentCookieOptions(content: string, matchIndex: number, matchedCall: string): boolean {
  const arg = /,\s*([A-Za-z_$][\w$]*)\s*\)$/u.exec(matchedCall);
  if (!arg) return false;
  const prefix = content.slice(Math.max(0, matchIndex - 450), matchIndex);
  const declaration = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\{([^{}]{0,260})\}\s*;\s*$/u.exec(prefix);
  if (!declaration || declaration[1] !== arg[1]) return false;
  const object = declaration[2];
  if (/\.\.\.|\b(?:get|set)\s+[A-Za-z_$]/u.test(object)) return false;
  return /\bhttpOnly\s*:\s*true\b/iu.test(object);
}

function regexFindings(
  files: RepositoryFile[],
  rule: { id: string; severity: ExtendedFinding["severity"]; title: string; description: string; pattern: RegExp; extensions?: RegExp },
): ExtendedFinding[] {
  const findings: ExtendedFinding[] = [];
  for (const file of files) {
    if (rule.extensions && !rule.extensions.test(file.path)) continue;
    const executable = rule.id === 'hardcoded_jwt_secret' && /\.[cm]?[jt]sx?$/i.test(file.path)
      ? maskJavaScriptInert(file.content)
      : null;
    // A block comment may contain runnable-looking examples across many lines.
    // Preserve offsets so reports keep the original source line numbers.
    const matchingContent = rule.id === "cookie_missing_httponly"
      ? file.content.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
      : file.content;
    for (const match of matchingContent.matchAll(rule.pattern)) {
      if (executable && executable[match.index ?? 0] === ' ') continue;
      if (rule.id === 'hardcoded_jwt_secret') {
        const literal = /["']([^"']*)["']$/.exec(match[0])?.[1]?.trim() ?? '';
        if (/^(?:example|placeholder|changeme|replace|your_|dummy|fake|not_a_secret|test_only)/i.test(literal)) continue;
      }
      // Explicit HttpOnly:true is not evidence of a missing cookie protection.
      if (rule.id === "cookie_missing_httponly" &&
          (/\bhttpOnly\s*:\s*true\b/i.test(match[0]) ||
           safeAdjacentCookieOptions(file.content, match.index ?? 0, match[0]))) continue;
      // A quoted regression-test payload is text, not an executed eval/DOM write.
      if ((rule.id === "eval_usage" || rule.id === "innerhtml_assignment") &&
          inSimpleLiteralInitializer(file.content, match.index ?? 0)) continue;
      const line = lineAt(file.content, match.index ?? 0);
      const source = file.content.split("\n")[line - 1] ?? "";
      // PEM key delimiters begin with dashes; they are not SQL comments.
      if (rule.id !== "private_key" && /^\s*(?:\/\/|\/\*|\*|#|--)/.test(source)) continue;
      findings.push(makeFinding(`${rule.id}-${file.path}-${line}`, rule.severity, rule.title, rule.description, file.path, line, rule.id));
    }
  }
  return findings;
}

async function readRepository(repoUrl: string, githubToken?: string): Promise<RepositoryFile[]> {
  const result = await readRepositoryFiles(repoUrl, githubToken);
  return result.files.filter((file) => {
    const base = file.path.split("/").pop() ?? "";
    return /\.(?:[cm]?[jt]sx?|sql|json|ya?ml|md|mdx|toml|ini|conf|xml|html|css|scss|sh|bash|py|rb|go|rs|java|php|pem|key)$/i.test(file.path) || /^Dockerfile(?:\..*)?$/i.test(base) || /^\.npmrc$/i.test(base) || /^\.gitignore$/i.test(base) || /(^|\/)\.env(?:\.[\w-]+)?$/i.test(file.path);
  });
}

function sqlChecks(files: RepositoryFile[]): ExtendedFinding[] {
  const out: ExtendedFinding[] = [];
  for (const file of files.filter((f) => /\.sql$/i.test(f.path))) {
    const sql = stripComments(file.content);

    // With RLS, a table without a policy is inaccessible to every client
    // even when table grants exist. Distinguish intentional deny-by-default
    // (explicit revoke for PUBLIC/anon/authenticated, no subsequent grant)
    // from accidental missing policies.
    const globalRevoke = [...sql.matchAll(
      /revoke\s+all\s+privileges\s+on\s+all\s+tables\s+in\s+schema\s+public\s+from\s+([^;]+);/gi,
    )].some((m) => {
      const roles = m[1].split(",").map((role) => role.trim().toLowerCase());
      return ["public", "anon", "authenticated"].every((role) => roles.includes(role));
    });
    const globalClientRegrant =
      /\bgrant\s+[^;]{0,200}\bon\s+all\s+tables\s+in\s+schema\s+public\s+to\s+(?:public|anon|authenticated)\b/i.test(sql);

    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.]+)/gi)) {
      const table = m[1];
      const name = table.split(".").pop()!;
      const rls = new RegExp(String.raw`alter\s+table\s+(?:public\.)?${name}\s+enable\s+row\s+level\s+security`, "i").test(sql);
      const policy = new RegExp(String.raw`create\s+policy[\s\S]{0,1000}on\s+(?:public\.)?${name}\b`, "i").test(sql);
      const tableClientRegrant = new RegExp(
        String.raw`\bgrant\s+[^;]{0,200}\bon\s+(?:table\s+)?(?:public\.)?${name}\s+to\s+(?:public|anon|authenticated)\b`, "i",
      ).test(sql);
      const intentionallyDenied = globalRevoke && !globalClientRegrant && !tableClientRegrant;
      if (rls && !policy && !intentionallyDenied) {
        out.push(makeFinding(`rls-policy-${file.path}-${lineAt(file.content, m.index ?? 0)}`, "High", `RLS is enabled but "${table}" has no visible policy`, `Row-Level Security is enabled on ${table}, but no CREATE POLICY statement for the table was found. RLS without policies can unintentionally make every operation fail or tempt developers to bypass RLS.`, file.path, lineAt(file.content, m.index ?? 0), "rls_policy_missing"));
      }
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
      // CREATE FUNCTION may declare SET search_path *after* SECURITY DEFINER.
      // Check the remaining option header, but never trust text in AS $ body.
      const optionsAfterDefiner = sql.slice((m.index ?? 0) + block.length,
        (m.index ?? 0) + block.length + 300).split(/\bas\s+\$[A-Za-z0-9_]*\$/i)[0];
      if (!/set\s+search_path\s*(?:=|to)\s*|set_config\s*\(\s*['"]search_path/i.test(block + optionsAfterDefiner)) {
        out.push(makeFinding(`definer-path-${file.path}-${lineAt(file.content, m.index ?? 0)}`, "High", "SECURITY DEFINER function does not pin search_path", "A SECURITY DEFINER function without a controlled search_path can be exposed to search-path hijacking and object shadowing. Set an explicit trusted search_path.", file.path, lineAt(file.content, m.index ?? 0), "security_definer_search_path"));
      }
    }
  }
  return out;
}

const rules: Array<{ id: string; severity: ExtendedFinding["severity"]; title: string; description: string; pattern: RegExp; extensions?: RegExp }> = [
  { id: "hardcoded_jwt_secret", severity: "Critical", title: "JWT signing secret is hardcoded", description: "A JWT signing secret appears as a source literal. Keep signing keys server-side in secret storage and rotate exposed credentials.", pattern: /(?:JWT_SECRET|JWT_SIGNING_KEY|jwtSecret)(?:\s*:\s*(?:Readonly\s*<\s*)?(?:string|String)\s*>?)?\s*[:=]\s*["'][^"']{12,}["']/g, extensions: /\.(?:[cm]?[jt]sx?|py|rb|go|java|php)$/i },
  { id: "google_api_key", severity: "High", title: "Google API key appears in source", description: "A Google API key pattern was detected in repository source. Restrict, rotate, or move it to the correct server-side secret store as appropriate.", pattern: /AIza[0-9A-Za-z_-]{35}/g },
  { id: "github_token", severity: "Critical", title: "GitHub access token appears in source", description: "A GitHub personal or fine-grained access token appears in source control. Revoke it immediately and move credentials out of the repository.", pattern: /(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{30,}/g },
  { id: "private_key", severity: "Critical", title: "Private key material is committed", description: "A PEM private key block was detected. Private keys should never be committed; revoke or replace the key and remove it from history.", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { id: "database_url", severity: "Critical", title: "Database credential URL is hardcoded", description: "A database connection URL containing credentials appears in source. Move it to a server-side secret and rotate the credential if exposed.", pattern: /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^@\s"'`\/<>{}:]+:[^@\s"'`\/<>{}]+@[^\/\s"'`]+/gi },
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
  { id: "cookie_missing_httponly", severity: "Medium", title: "Cookie is set without HttpOnly", description: "A server cookie is created without an explicit HttpOnly flag. Session cookies should normally be inaccessible to JavaScript to reduce token theft through XSS.", pattern: /(?:res|response)\.cookie\s*\(\s*[^,;\n]{1,140},[\s\S]{0,360}?\)/g, extensions: /\.(?:[cm]?[jt]sx?|ts|js)$/i },
  { id: "cookie_insecure", severity: "Medium", title: "Cookie explicitly disables Secure", description: "A cookie is configured with secure:false. Authentication/session cookies should use Secure in HTTPS deployments.", pattern: /(?:secure\s*:\s*false|secure\s*=\s*false)/gi },
  { id: "cookie_samesite_none", severity: "Medium", title: "Cookie uses SameSite=None", description: "SameSite=None permits cross-site cookie sending and requires Secure. Use it only when cross-site authentication is intentional.", pattern: /sameSite\s*:\s*["']none["']/gi },
  { id: "http_url", severity: "Low", title: "Insecure HTTP URL is hardcoded", description: "A plain HTTP URL appears in source. Use HTTPS for network requests unless the endpoint is deliberately local or otherwise trusted.", pattern: /https?:\/\/[^\s"'`]+/gi, extensions: /\.(?:[cm]?[jt]sx?|json|ya?ml|py|rb|go|java|php)$/i },
  { id: "debug_endpoint", severity: "Medium", title: "Debug/admin endpoint is exposed in source", description: "A route containing debug/internal/admin semantics was detected. Verify it requires strong authentication and is not publicly reachable in production.", pattern: /(?:app|router)\.(?:get|post|put|patch|delete)\s*\(\s*["'`]\/(?:debug|internal|admin|actuator)(?:\/|["'`])/gi, extensions: /\.(?:[cm]?[jt]sx?|ts|js)$/i },
  { id: "wildcard_dependency", severity: "Medium", title: "Dependency version is unbounded", description: "A package dependency uses *, latest, or a broad range. Pinning versions improves reproducibility and reduces unexpected supply-chain changes.", pattern: /["'][^"']+["']\s*:\s*["'](?:\*|latest)["']/g, extensions: /(^|\/)package\.json$/i },
  { id: "git_dependency", severity: "Medium", title: "Dependency is installed directly from git", description: "A dependency points to a Git repository or a mutable branch tarball. Pin an immutable commit rather than depending on moving repository contents.", pattern: /["'](?:git\+https?:\/\/|https?:\/\/github\.com\/[^"']+\.git(?:#|["'])|https?:\/\/github\.com\/[^"'\s]+\/tarball\/(?:master|main|develop|HEAD)(?=["']))/g, extensions: /(^|\/)package\.json$/i },
  { id: "npmrc_token", severity: "Critical", title: "npm authentication token is committed", description: "An .npmrc file contains an authentication token or registry credential. Revoke it and use CI/developer secret storage instead.", pattern: /(?:_authToken|_password|authToken)\s*=\s*[^\s#]{12,}/gi, extensions: /(^|\/)\.npmrc$/i },
  { id: "docker_socket", severity: "Critical", title: "Docker socket is mounted", description: "Mounting /var/run/docker.sock gives a container access to the Docker daemon and can effectively provide host-level control. Avoid it unless the trust boundary is intentional.", pattern: /\/var\/run\/docker\.sock/g, extensions: /(?:Dockerfile|\.ya?ml)$/i },
  // Search executable hashing calls, not arbitrary occurrences of algorithm names.
  // package-lock.json integrity fields commonly contain thousands of sha1-*
  // checksums: they are dependency metadata, not application hash operations.
  { id: "weak_hash", severity: "High", title: "Weak MD5/SHA-1 hashing is used", description: "MD5 and SHA-1 are unsuitable for password hashing and many integrity/security uses. Use a modern password KDF or SHA-256/384/512 where appropriate.", pattern: /\b(?:createHash|createHmac)\s*\(\s*["'](?:md5|sha1)["']\s*\)|\b(?:md5|sha1)\s*\(|\b(?:digest)\s*\(\s*["'](?:sha-1|sha1|md5)["']/gi, extensions: /\.(?:[cm]?[jt]sx?|py|rb|go|rs|java|php)$/i },
  { id: "weak_random", severity: "Medium", title: "Math.random() used for security-sensitive-looking value", description: "Math.random is not cryptographically secure. Do not use it for tokens, reset codes, session IDs, secrets, or other security-sensitive values; use a CSPRNG instead.", pattern: /(?:token|secret|password|nonce|otp|session|reset|code|key|id)[A-Za-z0-9_]*\s*=\s*[^\n]*Math\.random\s*\(|\battachCsrfToken\s*\([^;\n]{0,220}\bMath\.random\s*\(|\b(?:password|passwd|passphrase|secret|token|nonce|otp|sessionId|csrfToken|resetToken|apiKey)\s*:\s*Math\.random\s*\(/gi, extensions: /\.(?:[cm]?[jt]sx?)$/i },
  { id: "path_traversal", severity: "High", title: "Filesystem path is built from request input", description: "Joining filesystem paths with req.query/params/body input can permit ../ traversal. Normalize and constrain the resolved path to an approved root.", pattern: /(?:join|resolve)\s*\([^\n]*(?:req\.(?:query|params|body)|searchParams\.get)/gi, extensions: /\.(?:[cm]?[jt]sx?|ts|js|py|rb|php)$/i },
  { id: "command_injection", severity: "Critical", title: "Command execution uses request-controlled input", description: "An OS command API appears to receive request-derived data. Validate against an allowlist and prefer argument arrays over shell strings.", pattern: /\b(?:exec|execSync|spawn|spawnSync)\s*\([^\n]*(?:req\.(?:query|params|body)|searchParams\.get)/gi, extensions: /\.(?:[cm]?[jt]sx?|ts|js|py|rb|php)$/i },
];

/**
 * Bounded same-function taint signal for a named child_process.exec alias.
 * Only handles obvious CommonJS aliases, local declaration propagation and
 * string-concatenated shell arguments. Source is inspected, never executed.
 * This is not full interprocedural taint analysis.
 */
function aliasedShellTaintFindings(files: RepositoryFile[]): ExtendedFinding[] {
  const output: ExtendedFinding[] = [];
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/i.test(file.path)) continue;
    const imported = /\b(?:const|let|var)\s+([A-Za-z_][\w]*)\s*=\s*require\s*\(\s*['"](?:node:)?child_process['"]\s*\)\s*\.\s*exec\b/g;
    const aliases = [...file.content.matchAll(imported)].map(m => m[1]);
    if (aliases.length === 0) continue;
    const tainted = new Set<string>();
    const lines = file.content.split("\n");
    let blockComment = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (/^\s*\/\*/.test(raw)) blockComment = true;
      if (blockComment) {
        if (/\*\//.test(raw)) blockComment = false;
        continue;
      }
      if (/^\s*(?:\/\/|#|\*)/.test(raw)) continue;
      // Do not propagate request taint across unrelated named handlers.
      if (/\b(?:exports\.[\w$]+\s*=\s*function|function\s+[A-Za-z_$][\w$]*\s*\()/.test(raw)) {
        tainted.clear();
      }
      const declared = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.+)/.exec(raw);
      if (declared) {
        const [, name, expression] = declared;
        const fromRequest = /\b(?:req|request)\.(?:body|params|query)\b/.test(expression);
        const fromTaintedVar = [...tainted].some(v =>
          new RegExp("\\b" + v.replace(/[$]/g, "\\$") + "\\b").test(expression));
        if (fromRequest || fromTaintedVar) tainted.add(name);
        else tainted.delete(name);
      }
      // Match only a literal shell prefix concatenated with a proven local
      // tainted value. A plain exec('constant') is not enough to assert CI.
      for (const alias of aliases) {
        const call = new RegExp("\\b" + alias + "\\s*\\(\\s*['\\\"][^'\\\"\\n]*['\\\"]\\s*\\+\\s*([A-Za-z_$][\\w$]*)\\b").exec(raw);
        if (!call || !tainted.has(call[1])) continue;
        const line = i + 1;
        output.push(makeFinding(
          "command_injection-" + file.path + "-" + line,
          "Critical",
          "Request-derived value reaches a shell string",
          "A local value derived from req.body/query/params is concatenated into a child_process.exec shell command. Verify reachability and reject shell string concatenation.",
          file.path, line, "command_injection",
        ));
      }
    }
  }
  return output;
}

/**
 * Bounded source-to-sink signals for common Next.js request-query flows.
 * This is NOT full AST/taint analysis. Only flag a path actually reaching
 * a filesystem operation, or a navigation target coming from a URL query.
 * Keep the matched code, credential and request data out of reports.
 */
function scopedQuerySinks(files: RepositoryFile[]): ExtendedFinding[] {
  const out: ExtendedFinding[] = [];
  for (const file of files) {
    if (!/\.[cm]?[jt]sx?$/i.test(file.path)) continue;
    const cleaned = file.content.replace(/\/\*[\s\S]*?\*\//g,
      block => block.replace(/[^\n]/g, " "))
      .replace(/(^|\s)\/\/[^\n]*/gm, block => block.replace(/[^\n]/g, " "));
    const lines = cleaned.split("\n");
    const hasQuerySource = /\b(?:parseQuery\s*\(\s*searchParams|searchParams\.get\s*\(|req\.query\b)/.test(cleaned);
    if (!hasQuerySource) continue;
    const queryTainted = new Set<string>();
    const joinedPaths = new Map<string, number>();
    for (let i=0;i<lines.length;i++) {
      const line = lines[i];
      // Handler boundaries prevent a variable declared by one route from
      // becoming evidence for an unrelated route in the same module.
      if (/^\s*(?:export\s+)?(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\s*\(/.test(line)) {
        queryTainted.clear();
        joinedPaths.clear();
      }
      const assigned = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)/.exec(line);
      if (assigned) {
        const rhs=assigned[2];
        if (/\bsearchParams\.get\s*\(/.test(rhs) ||
            (/^\s*parsed\.data\.[A-Za-z_$][\w$]*/.test(rhs) &&
             /\bparseQuery\s*\(\s*searchParams\b/.test(cleaned))) {
          queryTainted.add(assigned[1]);
        } else {
          queryTainted.delete(assigned[1]);
        }
      }
      const combined = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:path\.)?(?:join|resolve)\s*\(\s*[^,\n]{1,120},\s*([A-Za-z_$][\w$]*)\s*\)/.exec(line);
      if (combined) {
        if (queryTainted.has(combined[2])) joinedPaths.set(combined[1],i+1);
        else joinedPaths.delete(combined[1]);
      }
      const sink = /\b(?:readFile|readdir|stat|open|createReadStream|writeFile)\s*\(\s*([A-Za-z_$][\w$]*)\b/.exec(line);
      if (sink && joinedPaths.has(sink[1]) && i+1-(joinedPaths.get(sink[1])||0)<35) {
        const n=i+1;
        out.push(makeFinding(
          "request-path-to-filesystem-"+file.path+"-"+n,
          "High",
          "Request query path may escape a filesystem root",
          "A value derived from a request query is joined to a base directory and passed into a filesystem operation. Review canonical path containment and enforce a fixed approved root.",
          file.path,n,"path_traversal",
        ));
      }
      const locationTarget = /\b(?:(?:window|document)\.location\.href\s*=\s*|(?:window|document)\.location\.(?:assign|replace)\s*\(\s*)([A-Za-z_$][\w$]*)\b/.exec(line);
      if (locationTarget && queryTainted.has(locationTarget[1])) {
        const n=i+1;
        out.push(makeFinding(
          "query-to-browser-redirect-"+file.path+"-"+n,
          "High",
          "Browser redirect uses URL query input",
          "A client navigation destination is derived from a URL query parameter. Restrict destinations to same-origin or explicitly approved hosts before assigning window.location.",
          file.path,n,"open_redirect",
        ));
      }
    }
  }
  return out;
}

export function scanExtendedFiles(files: RepositoryFile[]): ExtendedFinding[] {
  const findings = [
    ...sqlChecks(files),
    ...scanPotentialPlaintextPasswords(files),
    ...aliasedShellTaintFindings(files),
    ...scopedQuerySinks(files),
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

export async function runExtendedSecurityChecks(repoUrl: string, githubToken?: string): Promise<ExtendedFinding[]> {
  const files = await readRepository(repoUrl, githubToken);
  return scanExtendedFiles(files);
}
