/**
 * Bounded, deliberately narrow heuristic for apparent raw-password storage.
 * Review signal only: callers may already hash parameters. No auto-fixes.
 */
export type PasswordStorageFinding = {
  id: string;
  severity: "High";
  title: string;
  description: string;
  filePath: string;
  line: number;
  check: "plaintext_password_storage";
};

type SourceFile = { path: string; content: string };
const CODE_FILE = /\.[cm]?[jt]sx?$/i;
const DECLARATION = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
const RAW_SHORTHAND = /[,{]\s*password\s*(?=,|\})/i;
const RAW_REQUEST_FIELD = /\bpassword\s*:\s*(?:req\.(?:body|query|params)\.password|request\.body\.password)\b/i;
const HASH_ASSIGNMENT = /\bpassword\s*=\s*(?:await\s+)?(?:bcrypt\.|argon2\.|scrypt\s*\(|hashPassword\s*\(|hashSync\s*\()/i;

function maskComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (s) => " ".repeat(s.length));
}
function lineAt(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

export function scanPotentialPlaintextPasswords(files: SourceFile[]): PasswordStorageFinding[] {
  const findings: PasswordStorageFinding[] = [];
  for (const file of files) {
    if (!CODE_FILE.test(file.path)) continue;
    const source = maskComments(file.content);
    for (const match of source.matchAll(DECLARATION)) {
      const name = match[1];
      const start = (match.index ?? 0) + match[0].length;
      const end = source.indexOf("};", start);
      if (end < 0 || end - start > 900) continue;
      const body = source.slice(start, end + 1);
      const hasRawPassword = RAW_SHORTHAND.test(body) || RAW_REQUEST_FIELD.test(body);
      if (!hasRawPassword) continue;
      const after = source.slice(end + 2, end + 1200);
      const write = new RegExp(
        "[.]\\s*(?:insert|insertOne|insertMany|create)\\s*\\(\\s*" +
        name.replace(/\$/g, "\\$") + "\\s*[,)]",
      );
      if (!write.test(after)) continue;
      const prior = source.slice(Math.max(0, (match.index ?? 0) - 700), match.index ?? 0);
      const beforeWrite = after.split(write)[0];
      if (HASH_ASSIGNMENT.test(prior) ||
          /\b(?:password|[A-Za-z_$][\w$]*\.password)\s*=\s*(?:await\s+)?(?:bcrypt\.|argon2\.|hashPassword\s*\()/i.test(beforeWrite)) {
        continue;
      }
      const line = lineAt(file.content, match.index ?? 0);
      findings.push({
        id: "plaintext-password-storage-" + file.path + "-" + line,
        severity: "High",
        title: "Possible plaintext password persistence",
        description:
          "A record appears to include an untransformed password field before a database insert. " +
          "Verify the value is a one-way password hash (for example Argon2id or bcrypt), not a raw login password. " +
          "This heuristic requires human review and does not establish exploitability.",
        filePath: file.path,
        line,
        check: "plaintext_password_storage",
      });
    }
  }
  return findings;
}
