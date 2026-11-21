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
  // Retain character offsets and newlines for precise findings and event order.
  const blank = (match: string) => match.replace(/[^\n]/g, " ");
  return sql.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/--[^\n]*/g, blank);
}

export function scanApiFiles(files: RepositoryFile[]): Finding[] {
  const findings: Finding[] = [];

  // Process the supplied migrations in file order. A CREATE TABLE without RLS
  // is not a surviving vulnerability if a later supplied migration enables RLS
  // or drops the table. For bounded source subsets this only represents the
  // provided evidence, NOT the complete live database migration state.
  const sqlFiles = files.filter(f => /\.sql$/i.test(f.path))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const states = new Map<string, { filePath: string; line: number; enabled: boolean; name: string }>();
  // A monorepo can contain multiple independent projects, each with a
  // migrations/ directory. Never let one project's ALTER/DROP conceal a
  // separate project's unprotected table with the same SQL name.
  const lineage = (p: string) => {
    const normalized = p.replace(/\\/g, "/");
    const marker = /(^|\/)migrations?\//ig;
    const found = [...normalized.matchAll(marker)].at(-1);
    return found ? normalized.slice(0, (found.index ?? 0) + found[0].length)
      : normalized.slice(0, normalized.lastIndexOf("/") + 1);
  };
  const tableDdl = /\b(create\s+table\s+(?:if\s+not\s+exists\s+)?|drop\s+table\s+(?:if\s+exists\s+)?|alter\s+table\s+(?:if\s+exists\s+)?)(?:"?([A-Za-z_]\w*)"?\s*\.\s*)?"?([A-Za-z_]\w*)"?/gi;
  for (const file of sqlFiles) {
    const sql = stripSqlComments(file.content);
    for (const match of sql.matchAll(tableDdl)) {
      const schema = (match[2] || "public").toLowerCase();
      const table = match[3].toLowerCase();
      const id = lineage(file.path) + "\u0000" + schema + "." + table;
      const action = match[1].trim().toLowerCase();
      const line = lineAt(file.content, match.index ?? 0);
      if (action.startsWith("create")) {
        states.set(id, { filePath: file.path, line, enabled: false, name: id });
      } else if (action.startsWith("drop")) {
        states.delete(id);
      } else {
        const state = states.get(id);
        if (!state) continue;
        const afterName = sql.slice((match.index ?? 0) + match[0].length);
        if (/^\s+enable\s+row\s+level\s+security\b/i.test(afterName)) state.enabled = true;
        if (/^\s+disable\s+row\s+level\s+security\b/i.test(afterName)) state.enabled = false;
      }
    }
  }
  for (const state of states.values()) {
    if (!state.enabled) findings.push(finding(
      `rls-${state.filePath}-${state.line}`,
      "Critical",
      `No RLS enable statement found for "${state.name}" in scanned migrations`,
      `Table ${state.name} is created without a surviving ENABLE ROW LEVEL SECURITY statement in supplied SQL files. Full migration history, grants and live state must be checked before claiming exposure.`,
      state.filePath, state.line, "rls",
    ));
  }

  for (const file of sqlFiles) {
    const sql = stripSqlComments(file.content);
    for (const match of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(\w+)[\s\S]{0,2500}?security\s+definer/gi)) {
      const line = lineAt(file.content, match.index ?? 0);
      if (!/auth\.uid\s*\(|auth\.role\s*\(|raise\s+exception/i.test(match[0])) {
        findings.push(finding(`rpc-${file.path}-${line}`, "High", `Security definer function "${match[1]}" has no visible permission check`, "A SECURITY DEFINER function has no visible auth or permission check in its body.", file.path, line, "unprotected_rpc"));
      }
    }
  }

  for (const file of files.filter((f) => /\.(?:[cm]?[jt]sx?)$/i.test(f.path))) {
    const serviceRoleUsage = /(?:process\.env\.[A-Z0-9_]*SERVICE_ROLE_KEY|import\.meta\.env\.[A-Z0-9_]*SERVICE_ROLE_KEY|(?:window|globalThis)\.__ENV\.[A-Z0-9_]*SERVICE_ROLE_KEY|Deno\.env\.get\(\s*["'][^"']*SERVICE_ROLE_KEY[^"']*["']\)|createClient\s*\([\s\S]{0,500}(?:service[_-]?role|SERVICE_ROLE_KEY))/gi;
    for (const match of file.content.matchAll(serviceRoleUsage)) {
      const line = lineAt(file.content, match.index ?? 0);
      if (/(^|\/)api\/|(^|\/)server\/|(^|\/)middleware\.|\.server\./i.test(file.path)) continue;
      // A shared utils/ module containing a server-side admin credential is NOT
      // automatically a browser bundle leak. Keep it visible as a High review
      // lead, reserve Critical for explicit client-bound source. A client import
      // graph / emitted build is still required to confirm actual disclosure.
      const browserBound = /^\s*["']use client["']\s*;?/m.test(file.content.slice(0, 400)) ||
        /(^|\/)(?:components|client|hooks)\//i.test(file.path) ||
        /\.client\.[cm]?[jt]sx?$/i.test(file.path) ||
        /(?:window|globalThis)\.__ENV\./.test(match[0]) ||
        /import\.meta\.env\./.test(match[0]);
      findings.push(finding(
        `service-role-${file.path}-${line}`,
        browserBound ? "Critical" : "High",
        browserBound
          ? "Service-role credential referenced in browser-targeted source"
          : "Service-role credential referenced in a shared module; check import boundary",
        browserBound
          ? "A browser-targeted module references a service-role credential. Verify whether the credential is embedded in client bundles and whether the path is reachable."
          : "This may be a legitimate server-only Supabase admin helper. Inspect imports, build output and public environment exposure before claiming a client secret leak.",
        file.path, line, "service_role_client",
      ));
    }

    const write = file.content.search(/\.(?:insert|update|delete|upsert)\s*\(/i);
    if (write >= 0 && /(?:^|\/)app\/api(?:\/[^/]+)*\/route\.[cm]?tsx?$/i.test(file.path)) {
      const before = file.content.slice(0, write);
      // Recognize a locally checked, awaited authorization guard without trusting
      // comments, unguarded calls, or an unrelated middleware filename.
      // Exclude quoted source from the heuristic: a string containing
      // 'if (!session) return' must not be mistaken for an auth check.
      const activeBeforeWrite = before
        .replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, ' ')
        .replace(/\x60(?:\\.|[^\x60])*\x60/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, ' ');
      // A call to getUser/getServerSession is NOT authorization by itself.
      // Require a checked, explicitly denying branch before the mutation.
      // This is intentionally conservative: custom middleware may still need
      // human review, and absence of this finding is not proof of auth.
      // Only a direct immediate rejection (or one in a simple braced block)
      // counts as proof of denial. A return hidden in a nested conditional or
      // callback must NOT clear an unauthenticated-write finding.
      const authorizedValue = /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:requireAuth\s*\([^)]*\)|requireUser\s*\([^)]*\)|auth\.getUser\s*\([^)]*\)|getServerSession\s*\([^)]*\)|session\.user)\s*;/g;
      let protectedByGuard = false;
      for (const guard of activeBeforeWrite.matchAll(authorizedValue)) {
        const variable = guard[1].replaceAll('$', '\\$');
        const checkedVariable = guard[0].includes('auth.getUser')
          ? variable + String.raw`\.data\.user` : variable;
        const denial = new RegExp('\\bif\\s*\\(\\s*!\\s*' + checkedVariable +
          '\\s*\\)\\s*(?:\\{\\s*)?(?:return|throw)\\b');
        if (denial.test(activeBeforeWrite.slice((guard.index ?? 0) + guard[0].length))) {
          protectedByGuard = true;
          break;
        }
      }
      if (!protectedByGuard) {
        const line = lineAt(file.content, write);
        findings.push(finding(`write-${file.path}-${line}`, "High", "Database write is missing an auth check", "This API route writes to the database without a detected authentication check before the write.", file.path, line, "unauthenticated_write"));
      }
    }
  }

  for (const file of files.filter((f) => /(^|\/)\.env(?:\.(?!(?:example|sample|template)$)[\w-]+)?$/i.test(f.path))) {
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
  const findings = scanApiFiles(files);
  return { repo: `${owner}/${repo}`, repoUrl, findings, filesScanned: files.length, scannedAt: new Date().toISOString() };
}
