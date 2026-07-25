import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { promisify } from "node:util";
import type { Finding, ScanReport } from "@workspace/api-zod";

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

function parseRepoUrl(repoUrl: string): { owner: string; repo: string; cloneUrl: string } {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl);
  } catch {
    throw new Error("Enter a valid public GitHub repository URL.");
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") {
    throw new Error("Only public github.com repository URLs are supported.");
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
    SOURCE_EXTENSIONS.test(path) &&
    !path.split("/").some((part) => IGNORED_PATH_PARTS.has(part))
  );
}

async function fetchRepositoryFiles(cloneUrl: string, repo: string): Promise<{
  repo: string;
  files: RepositoryFile[];
}> {
  const parent = await mkdtemp("/tmp/vibeguard-");
  const checkout = `${parent}/repo`;

  try {
    await execFileAsync(
      "git",
      ["clone", "--no-checkout", "--depth", "1", "--no-tags", "--single-branch", "--quiet", cloneUrl, checkout],
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
        ? "Repository not found. Make sure it is public and the URL is correct."
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

function hasAuthBefore(content: string, line: number): boolean {
  const before = content
    .split("\n")
    .slice(0, line)
    .join("\n");
  return /\b(?:getUser|getSession|auth\(\)|auth\.getUser|requireAuth|requireUser|currentUser|withAuth|userId|session)\b/i.test(
    before,
  );
}

function isServerOnlyPath(path: string): boolean {
  return (
    /(^|\/)(?:api|server|actions|middleware)(?:\/|$)/i.test(path) ||
    /\.(?:server|action)\.[cm]?[jt]sx?$/i.test(path) ||
    /(?:route|middleware)\.[cm]?[jt]sx?$/i.test(path)
  );
}

function isLikelyApiRoute(path: string): boolean {
  return (
    /(^|\/)(?:api|routes?)(?:\/|$)/i.test(path) ||
    /(^|\/)(?:app|pages)\/api(?:\/|$)/i.test(path) ||
    /(?:route|server)\.[cm]?[jt]sx?$/i.test(path)
  );
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
  const enabledTables = new Set<string>();
  const tables: Array<{ name: string; filePath: string; line: number }> = [];

  for (const file of files.filter((item) => /\.sql$/i.test(item.path))) {
    const enablePattern =
      /alter\s+table\s+(?:if\s+exists\s+)?(?:"?[\w]+"?\.)?"?([\w]+)"?\s+enable\s+row\s+level\s+security/gi;
    for (const match of file.content.matchAll(enablePattern)) {
      enabledTables.add(match[1].toLowerCase());
    }

    const createPattern =
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?[\w]+"?\.)?"?([\w]+)"?/gi;
    for (const match of file.content.matchAll(createPattern)) {
      const line = lineNumberAt(file.content, match.index ?? 0);
      tables.push({ name: match[1], filePath: file.path, line });
    }
  }

  return tables
    .filter((table) => !enabledTables.has(table.name.toLowerCase()))
    .map((table) =>
      finding(
        `rls-${table.filePath}-${table.line}`,
        "Critical",
        `RLS is not enabled on "${table.name}"`,
        `The "${table.name}" table is created without Row-Level Security being enabled. Supabase tables are exposed through the API by default, so users may be able to read or change rows they should not access.`,
        table.filePath,
        table.line,
        "rls",
      ),
    );
}

function scanUnauthenticatedWrites(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];
  const writePattern =
    /\.(?:from\([^)]*\)\.)?(?:insert|update|upsert|delete)\s*\(/gi;

  for (const file of files.filter(
    (item) => /\.(?:[cm]?[jt]sx?)$/i.test(item.path) && isLikelyApiRoute(item.path),
  )) {
    for (const match of file.content.matchAll(writePattern)) {
      const line = lineNumberAt(file.content, match.index ?? 0);
      if (hasAuthBefore(file.content, line)) {
        continue;
      }
      findings.push(
        finding(
          `write-${file.path}-${line}`,
          "High",
          "Database write is missing an auth check",
          "This API route writes to the database before checking who is making the request. An unauthenticated caller may be able to create, change, or delete data.",
          file.path,
          line,
          "unauthenticated_write",
        ),
      );
    }
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

export async function scanPublicRepository(repoUrl: string): Promise<ScanReport> {
  const { owner, repo, cloneUrl } = parseRepoUrl(repoUrl);
  const repository = await fetchRepositoryFiles(cloneUrl, repo);
  const findings = [
    ...scanClientServiceRole(repository.files),
    ...scanUnauthenticatedWrites(repository.files),
    ...scanRls(repository.files),
  ].sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);

  return {
    repo: `${owner}/${repository.repo}`,
    repoUrl,
    findings,
    filesScanned: repository.files.length,
    scannedAt: new Date().toISOString(),
  };
}
