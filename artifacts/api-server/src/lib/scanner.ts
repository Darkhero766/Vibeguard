import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import type { Finding, ScanReport } from "@workspace/api-zod";
import { logger } from "./logger";

type RepositoryFile = {
  path: string;
  content: string;
};

const execFileAsync = promisify(execFile);
const MAX_FILES = 100;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 8_000_000;
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|sql)$/i;
const IGNORED_PATH_PARTS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  "vendor",
]);

const SELF_EXCLUDED_PATHS = [
  "artifacts/api-server/src/lib/scanner.ts",
];

// Per-file line ranges that contain UI copy / documentation mentioning security
// terms — these lines should not be flagged by pattern-matching checks.
const COPY_EXCLUDED_LINE_RANGES: Record<string, [number, number][]> = {
  "artifacts/vibeguard/src/App.tsx": [[287, 287]],
};

function isInCopyExclusion(filePath: string, line: number): boolean {
  const ranges = COPY_EXCLUDED_LINE_RANGES[filePath];
  if (!ranges) return false;
  return ranges.some(([start, end]) => line >= start && line <= end);
}

function parseRepoUrl(repoUrl: string): { owner: string; repo: string; cloneUrl: string } {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl);
  } catch {
    throw new Error("Enter a valid public GitHub repository URL.");
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error("Only github.com repository URLs are supported.");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("Use a repository URL in the format https://github.com/owner/repo.");
  }

  const repo = parts[1].replace(/\.git$/, "");
  if (!/^[A-Za-z0-9_.-]+$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error("That does not look like a GitHub repository URL.");
  }

  return {
    owner: parts[0],
    repo,
    cloneUrl: `https://github.com/${parts[0]}/${repo}.git`,
  };
}

function shouldRead(path: string): boolean {
  return (
    (SOURCE_EXTENSIONS.test(path) || /(^|\/)\.env(\.[\w-]+)?$/i.test(path)) &&
    !path.split("/").some((part) => IGNORED_PATH_PARTS.has(part)) &&
    !SELF_EXCLUDED_PATHS.includes(path)
  );
}

function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const deduped: Finding[] = [];

  for (const finding of findings) {
    const key = `${finding.filePath}:${finding.line}:${finding.check}:${finding.title}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(finding);
    }
  }

  return deduped;
}

async function fetchRepositoryFiles(
  cloneUrl: string,
  repo: string,
  githubToken?: string,
): Promise<{
  repo: string;
  files: RepositoryFile[];
}> {
  const parent = await mkdtemp("/tmp/vibeguard-");
  const checkout = `${parent}/repo`;

  // Embed OAuth token in the clone URL for authenticated (private) access.
  // Credentials are never logged — we pass the URL directly to the git subprocess.
  const resolvedCloneUrl = githubToken
    ? cloneUrl.replace("https://", `https://x-oauth-token:${githubToken}@`)
    : cloneUrl;

  try {
    await execFileAsync(
      "git",
      ["clone", "--no-checkout", "--depth", "1", "--no-tags", "--single-branch", "--quiet", resolvedCloneUrl, checkout],
      { timeout: 120_000, maxBuffer: 2_000_000 },
    );

    const { stdout } = await execFileAsync(
      "git",
      ["-C", checkout, "ls-tree", "-r", "--name-only", "-z", "HEAD"],
      { timeout: 20_000, maxBuffer: 10_000_000 },
    );
    const paths = stdout
      .split("\0")
      .filter((entry) => entry && shouldRead(entry))
      .slice(0, MAX_FILES);
    const files: RepositoryFile[] = [];
    let totalBytes = 0;

    for (const relativePath of paths) {
      const { stdout: content } = await execFileAsync(
        "git",
        ["-C", checkout, "show", `HEAD:${relativePath}`],
        { timeout: 20_000, maxBuffer: MAX_FILE_BYTES + 1 },
      );
      const size = Buffer.byteLength(content, "utf8");
      if (!content || size > MAX_FILE_BYTES || totalBytes + size > MAX_TOTAL_BYTES) {
        continue;
      }
      totalBytes += size;
      files.push({ path: relativePath, content });
    }

    return { repo, files };
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("Repository not found")
        ? "Repository not found. Check the URL and make sure you have access."
        : "GitHub could not be reached. Please try again.";
    const wrapped = new Error(message);
    Object.assign(wrapped, { status: message.startsWith("Repository") ? 404 : 502 });
    throw wrapped;
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function lineAt(content: string, line: number): string {
  return content.split("\n")[line - 1] ?? "";
}

function isServerOnlyPath(path: string): boolean {
  return (
    /(^|\/)(?:api|server|actions|middleware)(?:\/|$)/i.test(path) ||
    /\.(?:server|action)\.[cm]?[jt]sx?$/i.test(path) ||
    /(?:route|middleware)\.[cm]?[jt]sx?$/i.test(path)
  );
}

function isLikelyApiRoute(path: string): boolean {
  return /(?:^|\/)app\/api(?:\/[^/]+)*\/route\.ts$/i.test(path);
}

function findApiRouteFiles(files: RepositoryFile[]): RepositoryFile[] {
  const routeFiles = files.filter((file) => isLikelyApiRoute(file.path));
  for (const file of routeFiles) {
    logger.info({ path: file.path }, "API route found");
  }
  return routeFiles;
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function finding(
  id: string,
  severity: Finding["severity"],
  title: string,
  description: string,
  filePath: string,
  line: number,
  check: Finding["check"],
): Finding {
  return { id, severity, title, description, filePath, line, check };
}

function scanRls(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files.filter((item) => /\.sql$/i.test(item.path))) {
    const cleanContent = stripSqlComments(file.content);
    const createPattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+)/gi;
    for (const match of cleanContent.matchAll(createPattern)) {
      const tableName = match[1];
      const line = lineNumberAt(file.content, match.index ?? 0);
      const escapedTableName = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const enablePattern = new RegExp(
        `alter\\s+table\\s+${escapedTableName}\\s+enable\\s+row\\s+level\\s+security`,
        "i",
      );

      if (!enablePattern.test(cleanContent)) {
        findings.push(
          finding(
            `rls-${file.path}-${line}`,
            "Critical",
            `RLS is not enabled on "${tableName}"`,
            `Table ${tableName} has no Row-Level Security policy.`,
            file.path,
            line,
            "rls",
          ),
        );
      }
    }
  }

  return findings;
}

function scanUnauthenticatedWrites(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];
  const writePattern = /\.(?:insert|update|delete|upsert)\s*\(/i;
  const authPattern =
    /auth\.getUser\s*\(|auth\.uid\s*\(|getServerSession\s*\(|session\.user\b/i;

  for (const file of findApiRouteFiles(files)) {
    const writeIndex = file.content.search(writePattern);
    if (writeIndex < 0 || authPattern.test(file.content.slice(0, writeIndex))) {
      continue;
    }

    findings.push(
      finding(
        `write-${file.path}-${lineNumberAt(file.content, writeIndex)}`,
        "High",
        "Database write is missing an auth check",
        "This route writes to the database with no detected auth check before the write.",
        file.path,
        lineNumberAt(file.content, writeIndex),
        "unauthenticated_write",
      ),
    );
  }

  return findings;
}

function scanClientServiceRole(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];
  const serviceRolePattern = /service_role|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY/gi;

  for (const file of files.filter(
    (item) =>
      /\.(?:[cm]?[jt]sx?)$/i.test(item.path) &&
      !isServerOnlyPath(item.path),
  )) {
    for (const match of file.content.matchAll(serviceRolePattern)) {
      const line = lineNumberAt(file.content, match.index ?? 0);
      const sourceLine = lineAt(file.content, line);
      if (/^\s*(?:\/\/|\/\*|\*|#)/.test(sourceLine)) {
        continue;
      }
      if (isInCopyExclusion(file.path, line)) {
        continue;
      }
      findings.push(
        finding(
          `service-role-${file.path}-${line}`,
          "Critical",
          "Supabase service_role key is referenced in client code",
          "The service_role key bypasses Row-Level Security and must stay on the server. Referencing it in client-side code can expose full database access to every visitor.",
          file.path,
          line,
          "service_role_client",
        ),
      );
    }
  }
  return findings;
}

function scanUnprotectedRpc(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files.filter((item) => /\.sql$/i.test(item.path))) {
    const cleanContent = file.content
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const fnPattern =
      /create\s+(?:or\s+replace\s+)?function\s+(\w+)\s*\([^)]*\)[\s\S]*?security\s+definer([\s\S]*?)(?:^\s*\$\$|\$function\$)/gim;

    for (const match of cleanContent.matchAll(fnPattern)) {
      const fnName = match[1];
      const line = lineNumberAt(file.content, match.index ?? 0);
      const hasPermissionCheck =
        /auth\.uid\s*\(|auth\.role\s*\(|raise\s+exception/i.test(match[0]);

      if (!hasPermissionCheck) {
        findings.push(
          finding(
            `rpc-${file.path}-${line}`,
            "High",
            `Security definer function "${fnName}" has no visible permission check`,
            `This function runs with elevated database privileges (SECURITY DEFINER) but its body has no auth.uid(), auth.role(), or exception check found. Any caller may be able to invoke it with full access.`,
            file.path,
            line,
            "unprotected_rpc",
          ),
        );
      }
    }
  }

  return findings;
}

function scanCommittedEnvFile(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];
  const envFilePattern = /(^|\/)\.env(\.local|\.production|\.development)?$/i;

  for (const file of files) {
    if (envFilePattern.test(file.path)) {
      findings.push(
        finding(
          `env-file-${file.path}`,
          "Critical",
          "A .env file is committed to the repository",
          "This file is tracked in git, meaning any secrets inside it are exposed in the repository (and remain in git history even if deleted later). Rotate any keys in this file immediately and add it to .gitignore.",
          file.path,
          1,
          "committed_env_file",
        ),
      );
    }
  }

  return findings;
}

function scanGenericSecrets(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];
  const patterns: Array<{ pattern: RegExp; name: string; description: string }> = [
    {
      pattern: /sk_live_[a-zA-Z0-9]{20,}/g,
      name: "Stripe live secret key hardcoded in source",
      description:
        "A Stripe live-mode secret key (sk_live_…) is present in source code. Anyone with this key can charge customers and access your full Stripe account. Remove it, move the value to an environment variable, and rotate the key immediately.",
    },
    {
      pattern: /AKIA[0-9A-Z]{16}/g,
      name: "AWS access key ID hardcoded in source",
      description:
        "An AWS access key ID (AKIA…) is hardcoded in source. This key can be used to access AWS services and may allow serious damage to your infrastructure. Remove it, use environment variables or IAM roles instead, and revoke the key immediately.",
    },
    {
      pattern: /(?:api[_-]?key|secret[_-]?key)\s*[:=]\s*["'][a-zA-Z0-9_\-]{20,}["']/gi,
      name: "Hardcoded API or secret key assignment",
      description:
        "A variable named api_key, apiKey, secret_key, or secretKey is assigned a long string literal directly in source. Hardcoding secrets exposes them in version history even after removal. Use environment variables instead.",
    },
  ];

  for (const file of files.filter(
    (item) =>
      /\.(?:[cm]?[jt]sx?)$/i.test(item.path) &&
      !isServerOnlyPath(item.path),
  )) {
    for (const { pattern, name, description } of patterns) {
      for (const match of file.content.matchAll(pattern)) {
        const line = lineNumberAt(file.content, match.index ?? 0);
        const sourceLine = lineAt(file.content, line);
        if (/^\s*(?:\/\/|\/\*|\*|#)/.test(sourceLine)) continue;
        if (isInCopyExclusion(file.path, line)) continue;
        findings.push(
          finding(
            `secret-${file.path}-${line}-${name}`,
            "Critical",
            name,
            description,
            file.path,
            line,
            "hardcoded_secret",
          ),
        );
      }
    }
  }

  return findings;
}

function scanCorsWildcard(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];
  const configFilePattern = /(?:^|\/)next\.config\.[cm]?[jt]sx?$/i;
  const corsPattern = /['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/gi;

  for (const file of files.filter((item) => configFilePattern.test(item.path))) {
    for (const match of file.content.matchAll(corsPattern)) {
      const line = lineNumberAt(file.content, match.index ?? 0);
      findings.push(
        finding(
          `cors-${file.path}-${line}`,
          "Medium",
          "CORS wildcard allows any origin",
          "Setting Access-Control-Allow-Origin to \"*\" lets any website make cross-origin requests to your API from a visitor's browser, including requests that carry session cookies. Restrict this to your specific frontend domain instead.",
          file.path,
          line,
          "cors_wildcard",
        ),
      );
    }
  }

  return findings;
}

export async function scanPublicRepository(
  repoUrl: string,
  githubToken?: string,
): Promise<ScanReport> {
  const { owner, repo, cloneUrl } = parseRepoUrl(repoUrl);
  const repository = await fetchRepositoryFiles(cloneUrl, repo, githubToken);
  const findings = deduplicateFindings([
    ...scanClientServiceRole(repository.files),
    ...scanGenericSecrets(repository.files),
    ...scanUnauthenticatedWrites(repository.files),
    ...scanRls(repository.files),
    ...scanUnprotectedRpc(repository.files),
    ...scanCorsWildcard(repository.files),
    ...scanCommittedEnvFile(repository.files),
  ]).sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);

  return {
    repo: `${owner}/${repository.repo}`,
    repoUrl,
    findings,
    filesScanned: repository.files.length,
    scannedAt: new Date().toISOString(),
  };
}
