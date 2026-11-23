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

/**
 * Mask comments and string/template literal contents without changing source
 * offsets or line numbers. Regex-only stripping can be led astray by ordinary
 * apostrophes in comments ("can't") and `//` within quoted URLs.
 * A masked fake role guard must never count as real authorization.
 */
function maskJsNonExecutable(source: string): string {
  let mode: "code" | "line" | "block" | "single" | "double" | "template" = "code";
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (mode === "code") {
      if (char === "/" && next === "/") { mode = "line"; out += "  "; i++; continue; }
      if (char === "/" && next === "*") { mode = "block"; out += "  "; i++; continue; }
      if (char === "'") { mode = "single"; out += " "; continue; }
      if (char === '"') { mode = "double"; out += " "; continue; }
      if (char === String.fromCharCode(96)) { mode = "template"; out += " "; continue; }
      out += char;
      continue;
    }
    if (mode === "line") {
      if (char === "\n") { mode = "code"; out += "\n"; }
      else out += " ";
      continue;
    }
    if (mode === "block") {
      if (char === "*" && next === "/") { mode = "code"; out += "  "; i++; }
      else out += char === "\n" ? "\n" : " ";
      continue;
    }
    if (char === "\\") {
      out += " ";
      if (i + 1 < source.length) { i++; out += source[i] === "\n" ? "\n" : " "; }
      continue;
    }
    if ((mode === "single" && char === "'") ||
        (mode === "double" && char === '"') ||
        (mode === "template" && char === String.fromCharCode(96))) {
      mode = "code"; out += " "; continue;
    }
    if (char === "\n" && mode !== "template") { mode = "code"; out += "\n"; continue; }
    out += char === "\n" ? "\n" : " ";
  }
  return out;
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

  // Parse individual schema-qualified function bodies, not the "public" schema.
  // This handles dollar-quoted PL/pgSQL and SQL bodies; other body forms are
  // unclassified rather than misreported as confirmed unprotected RPCs.
  for (const file of sqlFiles) {
    const sql = stripSqlComments(file.content);
    const starts = [...sql.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+((?:(?:"[A-Za-z_][\w$]*"|[A-Za-z_][\w$]*)\s*\.\s*)?(?:"[A-Za-z_][\w$]*"|[A-Za-z_][\w$]*))\s*\(/gi)];
    for (let i = 0; i < starts.length; i++) {
      const match = starts[i];
      const stop = starts[i + 1]?.index ?? sql.length;
      const declaration = sql.slice(match.index ?? 0, stop).slice(0, 30000);
      const as = /\bas\s+(\$[A-Za-z_0-9]*\$)/i.exec(declaration);
      if (!as) continue;
      const startBody = (as.index ?? 0) + as[0].length;
      const endBody = declaration.indexOf(as[1], startBody);
      if (endBody < 0) continue;
      const header = declaration.slice(0, as.index);
      const suffix = declaration.slice(endBody + as[1].length).split(";")[0];
      if (!/\bsecurity\s+definer\b/i.test(header + " " + suffix)) continue;
      // A trigger-returning function is not an ordinary callable PostgREST RPC.
      if (/\breturns\s+trigger\b/i.test(header)) continue;
      const body = declaration.slice(startBody, endBody);
      // PL/pgSQL commonly binds auth.uid() into a local UUID and refuses a
      // null user before doing privileged work. Recognize that guard without
      // claiming that it authorizes arbitrary cross-tenant operations.
      const uidBinding = /\b([A-Za-z_]\w*)\s+(?:uuid|text)\s*:=\s*auth\.uid\s*\(\s*\)/i.exec(body);
      const rejectsMissingUid = Boolean(uidBinding &&
        new RegExp("\\bif\\s+" + uidBinding[1] +
          "\\s+is\\s+null\\s+then\\s+raise\\s+exception\\b", "i").test(body));
      const guarded = /\b(?:where|if|and|or|using|with\s+check)\b[\s\S]{0,240}\bauth\.(?:uid|jwt)\s*\(/i.test(body) ||
        /\bif\s+(?:not\s+)?(?:public\.)?is_[A-Za-z_]*(?:admin|owner|member|authorized)\s*\([^)]*\)\s+then[\s\S]{0,300}\braise\s+exception\b/i.test(body) ||
        rejectsMissingUid;
      const line = lineAt(file.content, match.index ?? 0);
      // Authenticated does not mean authorized to move someone else's rows.
      // Keep sensitive data-recovery code visible without falsely saying it
      // lacks an authentication guard.
      const transfersOwners =
        /\bupdate\s+(?:public\.)?[A-Za-z_]\w*\s+set\s+owner_id\s*=\s*[A-Za-z_]\w*\s+where\s+owner_id\s*=\s*[A-Za-z_]\w*/i.test(body) &&
        /\bfrom\s+(?:public\.)?profiles\b/i.test(body) &&
        /\bauth\.uid\s*\(/i.test(body);
      if (transfersOwners && guarded) {
        findings.push(finding(
          "tenant-recovery-" + file.path + "-" + line, "High",
          "Privileged account recovery transfers ownership between users",
          "A SECURITY DEFINER function checks authentication but transfers existing data to a different owner using profile records. Review verified-email trust, profile editability, effective EXECUTE grants and concurrent recovery before treating this as safe; this is not proof of exploitability.",
          file.path, line, "privileged_account_recovery",
        ));
        continue;
      }
      // An authenticated SECURITY DEFINER function must not upgrade another
      // account just because auth.uid() is non-null. This is a review lead,
      // not a claim that RPC EXECUTE grants make it exploitable.
      const explicitAdminGuard = /\bif\s+(?:not\s+)?(?:public\.)?is_[A-Za-z_]*(?:admin|owner|authorized)\s*\([^)]*\)\s+then[\s\S]{0,300}\braise\s+exception\b/i.test(body);
      const suspiciousEntitlementUpdate = [...body.matchAll(/\bupdate\s+(?:public\.)?usage\s+set\s+([^;]{0,700})/gi)]
        .some(update => {
          const statement = update[1];
          if (!/\bplan\s*=\s*'pro'/i.test(statement)) return false;
          const target = /\bwhere\s+(?:(?:[A-Za-z_]\w*)\.)?(?:owner|user_id)\s*=\s*([A-Za-z_]\w*)\b/i.exec(statement)?.[1] ?? "";
          if (!/^(?:p_|param_|input_|target_)(?:target_)?(?:user|owner|account|id)[A-Za-z0-9_]*$/i.test(target)) return false;
          // The matched parameter is an identifier, so it is already safe to
          // embed in a bounded RegExp. Owner == auth.uid() is not vulnerable.
          const directBinding = new RegExp("\\b" + target + "\\s*(?:=|is\\s+not\\s+distinct\\s+from)\\s*auth\\.uid\\s*\\(", "i").test(body) ||
            new RegExp("\\bauth\\.uid\\s*\\(\\s*\\)\\s*=\\s*" + target + "\\b", "i").test(body);
          const rejectedCrossAccount = new RegExp(
            "\\bif\\s+" + target + "\\s*(?:<>|!=)\\s*auth\\.uid\\s*\\(\\s*\\)\\s+then[\\s\\S]{0,220}\\braise\\s+exception\\b",
            "i").test(body);
          return !directBinding && !rejectedCrossAccount && !explicitAdminGuard;
        });
      if (suspiciousEntitlementUpdate) {
        findings.push(finding(
          "entitlement-write-" + file.path + "-" + line, "High",
          "Privileged subscription grant may target another account",
          "A SECURITY DEFINER function sets usage.plan to Pro using a caller-supplied owner parameter. A login check does not bind that target to auth.uid(). Verify actual function EXECUTE grants, independent admin authorization and deployed migration state before asserting exploitability.",
          file.path, line, "privileged_entitlement_write",
        ));
        continue;
      }
      if (guarded) continue;
      const funcName = match[1].split(".").at(-1)?.replaceAll('"', "") ?? match[1];
      findings.push(finding(
        "rpc-" + file.path + "-" + line, "High",
        'SECURITY DEFINER function "' + funcName + '" lacks a detected in-body authorization guard',
        "No recognizable in-body access check was found. Verify actual EXECUTE grants, trigger/RPC reachability, and deployed migration state before asserting exploitability.",
        file.path, line, "unprotected_rpc",
      ));
    }
  }

  // RLS restricts rows, not columns. An unrestricted authenticated UPDATE
  // grant plus owner-only profile RLS may permit role self-promotion if a
  // privileged admin function trusts that role. Separate migration roots
  // never contribute evidence to one another.
  const profileScopes = new Map<string, {
    grant: { path: string; line: number } | null;
    selfUpdate: boolean;
    trustsRole: boolean;
  }>();
  for (const file of sqlFiles) {
    const sql = stripSqlComments(file.content);
    const key = lineage(file.path);
    const state = profileScopes.get(key) ?? { grant: null, selfUpdate: false, trustsRole: false };
    for (const policy of sql.matchAll(/\b(?:create|drop)\s+policy\b[^;]{0,1600}\bon\s+(?:public\.)?profiles\b[^;]*;/gi)) {
      if (/^\s*drop\b/i.test(policy[0])) {
        state.selfUpdate = false;
        continue;
      }
      if (!/\bfor\s+update\b/i.test(policy[0])) continue;
      const sections = policy[0].split(/\bwith\s+check\b/i);
      const using = sections[0];
      const checked = sections[1] ?? "";
      state.selfUpdate = /\busing\s*\(/i.test(using) &&
        /\bauth\.uid\s*\(/i.test(using) &&
        /\bauth\.uid\s*\(/i.test(checked) &&
        !/\brole\b/i.test(checked);
    }
    if (/\bis_platform_admin\s*\(/i.test(sql) && /\brole\s*=\s*'admin'/i.test(sql)) {
      state.trustsRole = true;
    }
    for (const grant of sql.matchAll(/\b(grant|revoke)\s+(all(?:\s+privileges)?|update(?:\s*\([^)]*\))?)\s+on\s+(?:table\s+)?(?:public\.)?profiles\s+(?:to|from)\s+authenticated\s*;/gi)) {
      if (grant[1].toLowerCase() === "revoke") state.grant = null;
      else if (!/\bupdate\s*\(/i.test(grant[2])) state.grant = {
        path: file.path, line: lineAt(file.content, grant.index ?? 0),
      };
    }
    profileScopes.set(key, state);
  }
  for (const state of profileScopes.values()) {
    if (!state.grant || !state.selfUpdate || !state.trustsRole) continue;
    findings.push(finding(
      "role-self-promotion-" + state.grant.path + "-" + state.grant.line,
      "High",
      "Profile self-update may permit promotion to an administrative role",
      "A table-wide authenticated UPDATE grant, self-update RLS policy and role-based admin helper appear together. Check column privileges, all effective policies and deployed migration order before confirming the escalation.",
      state.grant.path, state.grant.line, "role_self_promotion",
    ));
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

    // Calling Map.delete/Set.delete is not a database write. Find the first
    // actual candidate mutation instead of blindly taking any .delete().
    // This is important for webhook routes staging in-memory subscriptions.
    const write = [...file.content.matchAll(/\.(?:insert|update|delete|upsert)\s*\(/gi)]
      .find(candidate => {
        const beforeCandidate = file.content.slice(0, candidate.index ?? 0);
        const receiver = /([A-Za-z_$][\w$]*)\s*$/.exec(beforeCandidate)?.[1] ?? "";
        if (!receiver) return true;
        const declaredCollection = new RegExp(
          "\\b(?:const|let|var)\\s+" + receiver +
          "\\s*(?::[^=\\n]+)?=\\s*new\\s+(?:Map|Set)\\b", "i").test(file.content);
        return !declaredCollection;
      })?.index ?? -1;
    if (write >= 0 && /(?:^|\/)app\/api(?:\/[^/]+)*\/route\.[cm]?tsx?$/i.test(file.path)) {
      const before = file.content.slice(0, write);
      // Recognize a locally checked, awaited authorization guard without trusting
      // comments, unguarded calls, or an unrelated middleware filename.
      // Exclude quoted source from the heuristic: a string containing
      // 'if (!session) return' must not be mistaken for an auth check.
      const activeBeforeWrite = maskJsNonExecutable(before);
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
        // A verified source comparison (pinned ArnasDon/wacrm) exposed routes
        // that await requireRole from a server-side account-auth module.
        // Treat that as a contextual review lead, NOT as a proved missing
        // login check, and do not entirely suppress a possible vulnerability.
        // Calls to unrelated helpers or in another route must remain High.
        const importedAccountRole = /\bimport\s*\{[^}]*\brequireRole\b[^}]*\}\s*from\s*['"]@\/lib\/auth\/account['"]/m.test(file.content);
        const handlers = [...activeBeforeWrite.matchAll(/\bexport\s+(?:async\s+function\s+(?:GET|POST|PUT|PATCH|DELETE)\s*\(|const\s+(?:GET|POST|PUT|PATCH|DELETE)\s*=)/g)];
        const lastHandler = handlers.at(-1)?.index ?? -1;
        const beforeInHandler = lastHandler >= 0 ? activeBeforeWrite.slice(lastHandler) : "";
        const awaitedRoleHelper = importedAccountRole && /\bawait\s+requireRole\s*\(/.test(beforeInHandler);
        // Signed provider webhooks must not require a signed-in user. They
        // authenticate the provider with a signature instead. Keep a review
        // warning when the verifier and mutation are in the same handler.
        const webhookPath = /(?:^|\/)(?:webhooks?\/stripe|stripe\/webhook)\/route\.[cm]?tsx?$/i.test(file.path);
        const signedWebhook = webhookPath && /\bstripe\.webhooks\.constructEvent\s*\(/.test(beforeInHandler);
        const contextualGuard = awaitedRoleHelper || signedWebhook;
        const line = lineAt(file.content, write);
        findings.push(finding(
          "write-" + file.path + "-" + line,
          contextualGuard ? "Medium" : "High",
          awaitedRoleHelper
            ? "Database write follows an imported role guard; verify its implementation"
            : signedWebhook
              ? "Database write follows Stripe signature verification; review webhook trust"
              : "Database write is missing an auth check",
          awaitedRoleHelper
            ? "The handler awaits requireRole imported from an account-auth module before the write. Inspect the imported helper, throw/deny behavior, route boundaries and database RLS before claiming an unauthenticated mutation. This warning is retained for manual review."
            : signedWebhook
              ? "A Stripe webhook signature-verification call precedes the mutation. Confirm invalid signatures abort the handler, the signed object controls the write target and replay is handled. This is not evidence of a missing browser login."
              : "This API route writes to the database without a detected authentication check before the write.",
          file.path, line, "unauthenticated_write",
        ));
      }
    }
  }

  // Detect JWT signing keys separately so callers get a stable, rule-specific
  // result. Match the original source for literal values, but use the lexical
  // mask to reject candidates inside comments or quoted strings. This is a
  // bounded source heuristic, not an AST or runtime proof. Never emit values.
  for (const file of files.filter(f => /\.[cm]?[jt]sx?$/i.test(f.path))) {
    const executable = maskJsNonExecutable(file.content);
    const jwtAssignments = [
      /\b(?:const|let|var)\s+(JWT_SECRET|JWT_SIGNING_KEY|jwtSecret)\s*(?::\s*[^=;\r\n]+)?=\s*(["'])([^"'\r\n]{16,256})\2/g,
      /\b(JWT_SECRET|JWT_SIGNING_KEY)\s*:\s*(["'])([^"'\r\n]{16,256})\2/g,
    ];
    for (const pattern of jwtAssignments) {
      for (const match of file.content.matchAll(pattern)) {
        const identifier = match[1];
        const valueOffset = match[0].indexOf(match[2]);
        const activeDeclaration = executable.slice(match.index ?? 0, (match.index ?? 0) + valueOffset);
        if (!activeDeclaration.includes(identifier)) continue;
        const literal = match[3].trim();
        if (/^(?:example|placeholder|changeme|replace|your_|dummy|fake|not_a_secret|test_only)/i.test(literal)) continue;
        const line = lineAt(file.content, match.index ?? 0);
        findings.push(finding(
          "jwt-secret-" + file.path + "-" + line,
          "High",
          "JWT signing secret is hardcoded in source",
          "A JWT signing key name is assigned a long string literal in source. This static heuristic does not prove runtime use; move real signing material to protected server-side key management and rotate any key that may have been exposed. The literal is intentionally excluded from this finding.",
          file.path, line, "hardcoded_jwt_secret" as Finding["check"],
        ));
      }
    }
    // Recognize straightforward compile-time concatenation as a literal secret
    // too. The value is used only for placeholder checks and never reported.
    const joinedJwtAssignments = /\b(?:const|let|var)\s+(JWT_SECRET|JWT_SIGNING_KEY|jwtSecret)\s*(?::\s*[^=;\r\n]+)?=\s*(["'])([^"'\r\n]{8,128})\2\s*\+\s*(["'])([^"'\r\n]{8,128})\4/g;
    for (const match of file.content.matchAll(joinedJwtAssignments)) {
      const identifier = match[1];
      const valueOffset = match[0].indexOf(match[2]);
      const activeDeclaration = executable.slice(match.index ?? 0, (match.index ?? 0) + valueOffset);
      const literal = (match[3] + match[5]).trim();
      if (!activeDeclaration.includes(identifier) || literal.length < 16
        || /^(?:example|placeholder|changeme|replace|your_|dummy|fake|not_a_secret|test_only)/i.test(literal)) continue;
      const line = lineAt(file.content, match.index ?? 0);
      findings.push(finding(
        "jwt-secret-" + file.path + "-" + line,
        "High",
        "JWT signing secret is hardcoded in source",
        "A JWT signing key name is assigned concatenated string literals in source. This static heuristic does not prove runtime use; move real signing material to protected server-side key management and rotate any key that may have been exposed. The literal is intentionally excluded from this finding.",
        file.path, line, "hardcoded_jwt_secret" as Finding["check"],
      ));
    }
    const encodedJwtAssignments = /\b(?:const|let|var)\s+(JWT_SECRET|JWT_SIGNING_KEY|jwtSecret)\s*(?::\s*[^=;\r\n]+)?=\s*(?:Buffer\.from|atob)\s*\(\s*(["'])([A-Za-z0-9+/_=-]{24,512})\2/g;
    for (const match of file.content.matchAll(encodedJwtAssignments)) {
      const identifier = match[1];
      const valueOffset = match[0].indexOf(match[2]);
      const activeDeclaration = executable.slice(match.index ?? 0, (match.index ?? 0) + valueOffset);
      const decoded = Buffer.from(match[3], 'base64').toString('utf8').trim();
      if (!activeDeclaration.includes(identifier) || decoded.length < 16
        || /^(?:example|placeholder|changeme|replace|your_|dummy|fake|not_a_secret|test_only)/i.test(decoded)) continue;
      const line = lineAt(file.content, match.index ?? 0);
      findings.push(finding(
        "jwt-secret-" + file.path + "-" + line,
        "High",
        "JWT signing secret is encoded in source",
        "A JWT signing key is initialized from an encoded source literal. Encoding does not protect a committed signing secret; use protected server-side key management and rotate any key that may have been exposed. The literal is intentionally excluded from this finding.",
        file.path, line, "hardcoded_jwt_secret" as Finding["check"],
      ));
    }
  }

  // Detect hardcoded authentication constants, including short passwords
  // actually compared to requester input. Never emit credential literals.
  for (const file of files.filter(f => /\.[cm]?[jt]sx?$/i.test(f.path))) {
    const source = file.content.replace(/\/\*[\s\S]*?\*\//g,
      block => block.replace(/[^\n]/g, " "));
    const staticAuth = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|AUTH_TOKEN|API_TOKEN|API_KEY|PASS|PASSWORD|SECRET|AUTH_KEY))\s*=\s*(['"])([^'"\r\n]{4,128})\2/gi;
    for (const match of source.matchAll(staticAuth)) {
      const identifier = match[1];
      // JWT literals already have a dedicated detector and a narrow repair
      // verification contract. Avoid a second generic finding for the same key.
      if (/^(?:JWT_SECRET|JWT_SIGNING_KEY)$/.test(identifier)) continue;
      const literal = match[3].trim();
      if (/^(?:example|placeholder|changeme|replace|your_|dummy|fake|not_a_secret)/i.test(literal)) continue;
      const compared = new RegExp("(?:===|!==|==|!=)\\s*" + identifier + "\\b|\\b" +
        identifier + "\\s*(?:===|!==|==|!=)").test(source.slice((match.index ?? 0) + match[0].length));
      if (literal.length < 16 && !compared) continue;
      const line = lineAt(file.content, match.index ?? 0);
      findings.push(finding(
        "static-auth-" + file.path + "-" + line,
        "High",
        "Authentication credential is hardcoded in source",
        "An authentication token, key or password is assigned a literal in source. Review whether this is an active credential or non-production example; remove active credentials and rotate them without printing them in findings.",
        file.path, line, "hardcoded_secret",
      ));
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
