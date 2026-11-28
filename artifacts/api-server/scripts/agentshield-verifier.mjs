// Safe verifier. Only parse-only checks and a narrow built-in JWT configuration assertion;
// never run app code, arbitrary scripts, package managers, or customer tests.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
const exec = promisify(execFile);
function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function containedBy(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..'
    && !relative.startsWith('..' + path.sep));
}
function verifierChildEnv() {
  const env = { PATH: process.env.PATH || '', NODE_OPTIONS: '' };
  if (process.platform === 'win32') {
    env.SYSTEMROOT = process.env.SYSTEMROOT || '';
    env.WINDIR = process.env.WINDIR || env.SYSTEMROOT;
    env.COMSPEC = process.env.COMSPEC || '';
    env.TEMP = process.env.TEMP || '';
    env.TMP = process.env.TMP || env.TEMP;
    env.USERPROFILE = process.env.USERPROFILE || '';
  }
  return env;
}

async function safeRead(root, relative) {
  const rootReal = await realpath(root);
  const full = path.resolve(rootReal, relative);
  const rel = path.relative(rootReal, full);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return null;
  const info = await lstat(full);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1_000_000) return null;
  const targetReal = await realpath(full);
  if (!samePath(targetReal, full) || !containedBy(rootReal, targetReal)) return null;
  return { full, content: await readFile(full, 'utf8') };
}

export async function verifyResolvedFile(root, filePath, previous, config) {
  const results = [];
  if (!Array.isArray(previous) || previous.length === 0) return results;
  let file;
  try { file = await safeRead(root, filePath); } catch { file = null; }
  if (!file) {
    return previous.map((f) => ({ ruleId: f.ruleId, status: 'unverified', evidence: 'Source unavailable for a separate check.' }));
  }
  let syntax = 'not_requested';
  if (config.verification.syntaxCheck && config.verification.approved) {
    if (/\.(?:[cm]?js)$/i.test(filePath)) {
      try {
        // Node's --check only parses this file; it does not evaluate the application.
        await exec(process.execPath, ['--check', file.full], {
          timeout: 2500, maxBuffer: 4000, windowsHide: true,
          env: verifierChildEnv(),
        });
        syntax = 'passed';
      } catch { syntax = 'failed'; }
    } else syntax = 'unsupported_extension';
  }
  for (const finding of previous) {
    if (syntax === 'failed') {
      results.push({ ruleId: finding.ruleId, status: 'verification_failed', level: 'parse_only', evidence: 'Approved syntax-only check failed.' });
      continue;
    }
    // This narrow regression assertion tests only the specific configuration property.
    // It is NOT a dynamic security or JWT signing/validation test.
    if (finding.ruleId === 'hardcoded_jwt_secret' &&
      /(?:process\.env\.JWT_SECRET|Deno\.env\.get\(\s*['"]JWT_SECRET['"]\s*\))/.test(file.content) &&
      !/(?:JWT_SECRET|JWT_SIGNING_KEY|jwtSecret)\s*[:=]\s*["'][^"']{12,}["']/.test(file.content)) {
      results.push({ ruleId: finding.ruleId, status: 'verification_passed', level: 'narrow_static_regression',
        evidence: 'A second assertion confirms an environment-backed JWT key reference and no matching hardcoded JWT key assignment. Runtime signing, authorization, and secret rotation remain unverified.',
        syntax });
      continue;
    }
    results.push({ ruleId: finding.ruleId, status: 'unverified', level: 'static_rescan_only',
      evidence: 'The original scanner no longer detects this finding; no independent security regression was executed.', syntax });
  }
  return results;
}
