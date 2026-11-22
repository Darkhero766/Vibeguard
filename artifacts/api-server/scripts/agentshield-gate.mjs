// AgentShield final worktree gate: reuses the existing scanner and checks for racing edits.
// Never executes customer code, Git hooks, project dependencies, or test scripts.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const exec = promisify(execFile);
const SOURCE = /\.(?:[cm]?[jt]sx?|pyi?|sql|json|ya?ml)$/i;
const ENV = /(^|\/)\.env(?:\.[\w-]+)?$/i;
const IGNORE = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'coverage', 'vendor']);
const SEVERITY = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const sha = (content) => createHash('sha256').update(content).digest('hex');

export function changedEntries(status) {
  const items = status.split('\0');
  const entries = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    if (item.length < 4 || item[2] !== ' ') throw new Error('Invalid Git status response.');
    const flags = item.slice(0, 2), file = item.slice(3);
    if (flags.includes('R') || flags.includes('C')) i++; // NUL-terminated old path follows
    if (!flags.includes('D') && !flags.includes('!')) entries.push(file);
  }
  return [...new Set(entries)].sort();
}
function ignored(file) {
  const slash = file.replaceAll('\\', '/');
  return slash.startsWith('/') || slash.split('/').some(x => x === '..' || IGNORE.has(x));
}
function supported(file) {
  const slash = file.replaceAll('\\', '/');
  return !ignored(file) && (SOURCE.test(slash) || ENV.test(slash));
}
async function gitStatus(root) {
  const result = await exec('git', [
    '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
    '-C', root, 'status', '--porcelain=v1', '-z', '--untracked-files=all',
  ], { timeout: 7000, maxBuffer: 2_000_000, windowsHide: true });
  return result.stdout;
}

// Hash local bytes before/after the scan. The fingerprints stay in memory only.
// A changed Git status or a changed content fingerprint invalidates the result.
export async function snapshot(root) {
  const real = await realpath(root);
  const status = await gitStatus(real);
  const allPaths = changedEntries(status);
  const paths = allPaths.filter(supported);
  const unsupportedChangedPaths = allPaths.filter((file) => !ignored(file) && !supported(file));
  if (allPaths.length > 100) throw new Error('Final gate file limit exceeded.');
  let budget = 0;
  const observations = [];
  // Fingerprint all changed non-ignored files, not just supported source files.
  // Unsupported edits must invalidate a previous final-scan result too.
  for (const rel of allPaths.filter((file) => !ignored(file))) {
    const full = path.resolve(real, rel);
    const relative = path.relative(real, full);
    if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Unsafe changed path.');
    let info;
    try { info = await lstat(full); }
    catch (e) {
      if (e?.code === 'ENOENT') { observations.push([rel, 'missing']); continue; }
      throw new Error('Unable to inspect changed file.');
    }
    if (!info.isFile() || info.isSymbolicLink()) { observations.push([rel, 'not_regular']); continue; }
    if (info.size > 1_000_000) { observations.push([rel, 'oversize']); continue; }
    budget += info.size;
    if (budget > 8_000_000) throw new Error('Final gate source budget exceeded.');
    const fileReal = await realpath(full);
    if (fileReal !== full || !fileReal.startsWith(real + path.sep)) {
      observations.push([rel, 'unsafe_path']); continue;
    }
    const content = await readFile(full);
    if (content.length > 1_000_000) throw new Error('Changed file grew beyond its size budget.');
    observations.push([rel, sha(content)]);
    if (supported(rel) && !paths.includes(rel)) throw new Error('Changed file selection became inconsistent.');
  }
  return {
    changedPaths: paths,
    unsupportedChangedPaths,
    fingerprint: sha(status + JSON.stringify(observations)),
    observations,
  };
}

export async function finalGate(root, config, scan) {
  try {
    const before = await snapshot(root);
    if (before.changedPaths.length === 0 && before.unsupportedChangedPaths.length === 0) {
      return { status: 'no_changed_files', filesScanned: 0, findings: [], blocking: 0,
        scannedPaths: [], note: 'No Git-visible changed files were available; no security verification was performed.' };
    }
    if (before.unsupportedChangedPaths.length) {
      throw new Error('Unsupported changed files prevent a complete final security gate.');
    }
    const report = await scan(root, ['--changed']);
    const after = await snapshot(root);
    if (before.fingerprint !== after.fingerprint) throw new Error('Files changed while final scan was running.');
    if (after.unsupportedChangedPaths.length) throw new Error('Unsupported changed files appeared during the final scan.');
    const covered = new Set(report.scannedPaths);
    const missing = before.changedPaths.filter(file => !covered.has(file));
    if (missing.length || report.filesScanned !== before.changedPaths.length) {
      throw new Error('Final scan omitted changed files; security coverage is incomplete.');
    }
    const findings = report.findings.map(f => ({
      filePath: String(f.filePath).slice(0, 400), line: Number(f.line) || 1,
      ruleId: String(f.ruleId).slice(0, 100), severity: f.severity,
      title: String(f.title).slice(0, 180),
    }));
    const blocking = findings.filter(f => SEVERITY[f.severity] >= SEVERITY[config.blockingSeverity]).length;
    return { status: 'complete', filesScanned: report.filesScanned, scannedPaths: report.scannedPaths,
      findings, blocking, changedPaths: before.changedPaths, fingerprint: after.fingerprint,
      securityGuarantee: false, note: 'Static checks of changed files only. Passing does not certify application security.' };
  } catch {
    return { status: 'scan_incomplete', filesScanned: 0, findings: [], blocking: 0,
      scannedPaths: [], securityGuarantee: false,
      note: 'Final scan failed, omitted files, or detected changing files; security status is UNKNOWN.' };
  }
}
