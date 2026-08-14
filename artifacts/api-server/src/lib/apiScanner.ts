import type { Finding, ScanReport } from "@workspace/api-zod";
import { readRepositoryFiles } from "./githubRepoReader";

type RepositoryFile = { path: string; content: string };

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function finding(id: string, severity: Finding["severity"], title: string, description: string, filePath: string, line: number, check: Finding["check"]): Finding {
  return { id, severity, title, description, filePath, line, check };
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function scan(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];

  for (const file of files.filter((f) => /\.sql$/i.test(f.path))) {
    const sql = stripSqlComments(file.content);
    for (const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi)) {
      const schema = match[1];
      const table = match[2];
      const line = lineAt(file.content, match.index ?? 0);
      const qualifiedTable = schema ? `${schema}.${table}` : table;
      const escapedSchema = schema?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const escapedTable = table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tableRef = escapedSchema ? `${escapedSchema}\\.${escapedTable}` : escapedTable;
      const enablePattern = new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?${tableRef}\\s+enable\\s+row\\s+level\\s+security`, "i");
      if (!enablePattern.test(sql)) {
        findings.push(finding(`rls-${file.path}-${line}`, "Critical", `RLS is not enabled on "${qualifiedTable}"`, `Table ${qualifiedTable} has no Row-Level Security enabled.`, file.path, line, "rls"));
      }
    }

    for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(\w+)[\s\S]{0,2500}?security\s+definer/gi)) {
      const line = lineAt(file.content, match.index ?? 0);
      if (!/auth\.uid\s*\(|auth\.role\s*\(|raise\s+exception/i.test(match[0])) {
        findings.push(finding(`rpc-${file.path}-${line}`, "High", `Security definer function "${match[1]}" has no visible permission check`, "A SECURITY DEFINER function has no visible auth or permission check in its body.", file.path, line, "unprotected_rpc"));
      }
    }
  }

  for (const file of files.filter((f) => /\.(?:[cm]?[jt]sx?)$/i.test(f.path))) {
    const serviceRoleUsage = /(?:process\.env\.[A-Z0-9_]*SERVICE_ROLE_KEY|import\.meta\.env\.[A-Z0-9_]*SERVICE_ROLE_KEY|Deno\.env\.get\(\s*["'][^"']*SERVICE_ROLE_KEY[^"']*["']\)|createClient\s*\([\s\S]{0,500}(?:service[_-]?role|SERVICE_ROLE_KEY))/gi;
    for (const match of file.content.matchAll(serviceRoleUsage)) {
      const line = lineAt(file.content, match.index ?? 0);
      if (/(^|\/)api\/|(^|\/)server\/|(^|\/)middleware\.|\.server\./i.test(file.path)) continue;
      findings.push(finding(`service-role-${file.path}-${line}`, "Critical", "Supabase service_role key is referenced in client code", "The service_role key bypasses Row-Level Security and must stay server-side. A client bundle must never receive this credential.", file.path, line, "service_role_client"));
    }

    const write = file.content.search(/\.(?:insert|update|delete|upsert)\s*\(/i);
    if (write >= 0 && /(?:^|\/)app\/api(?:\/[^/]+)*\/route\.[cm]?tsx?$/i.test(file.path)) {
      const before = file.content.slice(0, write);
      if (!/auth\.getUser\s*\(|auth\.uid\s*\(|getServerSession\s*\(|session\.user\b/i.test(before)) {
        const line = lineAt(file.content, write);
        findings.push(finding(`write-${file.path}-${line}`, "High", "Database write is missing an auth check", "This API route writes to the database without a detected authentication check before the write.", file.path, line, "unauthenticated_write"));
      }
    }
  }

  for (const file of files.filter((f) => /(^|\/)\.env(?:\.local|\.production|\.development)?$/i.test(f.path))) {
    findings.push(finding(`env-${file.path}`, "Critical", "A .env file is committed to the repository", "Environment files can expose API keys, database passwords, and service credentials.", file.path, 1, "committed_env_file"));
  }

  for (const file of files.filter((f) => /(^|\/)\.env\.(?:example|sample|template)$/i.test(f.path))) {
    const patterns = [/eyJ[A-Za-z0-9_-]{20,}/g, /sk_live_[A-Za-z0-9]{10,}/g, /AKIA[0-9A-Z]{16}/g, /ghp_[A-Za-z0-9]{30,}/g];
    for (const pattern of patterns) {
      for (const match of file.content.matchAll(pattern)) {
        const line = lineAt(file.content, match.index ?? 0);
        findings.push(finding(`fake-env-${file.path}-${line}`, "High", "Real credentials in .env.example", "A credential-like value was found in a template environment file. Templates should contain placeholders only.", file.path, line, "fake_env_example"));
      }
    }
  }

  for (const file of files.filter((f) => /next\.config\.[cm]?[jt]sx?$/i.test(f.path))) {
    for (const match of file.content.matchAll(/["']Access-Control-Allow-Origin["']\s*:\s*["']\*["']/gi)) {
      const line = lineAt(file.content, match.index ?? 0);
      findings.push(finding(`cors-${file.path}-${line}`, "Medium", "CORS wildcard allows any origin", "Access-Control-Allow-Origin is configured as a wildcard.", file.path, line, "cors_wildcard"));
    }
  }

  return findings;
}

export async function scanRepositoryViaApi(repoUrl: string, githubToken?: string): Promise<ScanReport> {
  const { owner, repo, files } = await readRepositoryFiles(repoUrl, githubToken);
  const findings = scan(files);
  return { repo: `${owner}/${repo}`, repoUrl, findings, filesScanned: files.length, scannedAt: new Date().toISOString() };
}
