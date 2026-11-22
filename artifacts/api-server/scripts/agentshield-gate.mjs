// AgentShield final worktree gate: reuses the existing scanner and checks for racing edits.
// Never executes customer code, Git hooks, project dependencies, or test scripts.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
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
    if (!flags.includes('!')) entries.push(file);
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
async function git(root, args) {
  const result = await exec('git', [
    '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args,
  ], { timeout: 7000, maxBuffer: 2_000_000, windowsHide: true });
  return result.stdout;
}
function validBaseRef(value) {
  return typeof value === 'string' && value.length <= 200
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.includes('..') && !value.includes('//') && !value.includes('@{')
    && !value.endsWith('/') && !value.endsWith('.') && !value.startsWith('-');
}
async function resolveBaseCommit(root, baseRef) {
  if (!baseRef) return null;
  if (!validBaseRef(baseRef)) throw new Error('Invalid base reference.');
  const output = await git(root, ['rev-parse', '--verify', '--end-of-options', baseRef + '^{commit}'])
    .catch(() => { throw new Error('Configured base reference is unavailable locally.'); });
  const sha = output.trim();
  if (!/^[a-f0-9]{40,64}$/i.test(sha)) throw new Error('Configured base did not resolve to a commit.');
  return sha;
}
function diffChangedPaths(output) {
  const chunks = output.split('\0');
  const files = [];
  for (let i = 0; i < chunks.length;) {
    const status = chunks[i++];
    if (!status) continue;
    if (/^[RC][0-9]*$/.test(status)) {
      const oldPath = chunks[i++], newPath = chunks[i++];
      if (!oldPath || !newPath) throw new Error('Malformed Git rename/copy diff entry.');
      files.push(newPath);
    } else if (/^[AMDTU][0-9]*$/.test(status)) {
      const file = chunks[i++];
      if (!file) throw new Error('Malformed Git changed-path diff entry.');
      files.push(file);
    } else throw new Error('Unsupported Git diff status.');
  }
  return [...new Set(files)].sort();
}

// Hash local bytes before/after the scan. The fingerprints stay in memory only.
// A changed Git status or a changed content fingerprint invalidates the result.
export async function snapshot(root, { baseRef = null } = {}) {
  const real = await realpath(root);
  const status = await git(real, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const worktreePaths = changedEntries(status);
  const baseCommit = await resolveBaseCommit(real, baseRef);
  const committedPaths = baseCommit
    ? diffChangedPaths(await git(real, ['diff', '--name-status', '-z', '--find-renames', baseCommit + '...HEAD', '--']))
    : [];
  const allPaths = [...new Set([...worktreePaths, ...committedPaths])].sort();
  const ignoredChangedPaths = allPaths.filter((file) => {
    const slash = file.replaceAll('\\\\', '/');
    return !slash.startsWith('/') && !slash.split('/').includes('..')
      && slash.split('/').some((part) => IGNORE.has(part));
  });
  const paths = allPaths.filter(supported);
  const unsupportedChangedPaths = allPaths.filter((file) => !ignored(file) && !supported(file));
  if (allPaths.length > 100) throw new Error('Final gate file limit exceeded.');
  let budget = 0;
  const observations = [];
  const missingChangedPaths = [];
  const unsafeChangedPaths = [];
  // Fingerprint all changed non-ignored files, not just supported source files.
  // Unsupported edits must invalidate a previous final-scan result too.
  for (const rel of allPaths.filter((file) => !ignored(file))) {
    const full = path.resolve(real, rel);
    const relative = path.relative(real, full);
    if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Unsafe changed path.');
    let info;
    try { info = await lstat(full); }
    catch (e) {
      if (e?.code === 'ENOENT') { missingChangedPaths.push(rel); observations.push([rel, 'missing']); continue; }
      throw new Error('Unable to inspect changed file.');
    }
    if (!info.isFile() || info.isSymbolicLink()) { unsafeChangedPaths.push(rel); observations.push([rel, 'not_regular']); continue; }
    if (info.size > 1_000_000) throw new Error('A changed file exceeds the final gate file-size budget.');
    budget += info.size;
    if (budget > 8_000_000) throw new Error('Final gate source budget exceeded.');
    const fileReal = await realpath(full);
    if (fileReal !== full || !fileReal.startsWith(real + path.sep)) {
      unsafeChangedPaths.push(rel); observations.push([rel, 'unsafe_path']); continue;
    }
    const handle = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) {
        throw new Error('Changed file identity changed while opening it.');
      }
      const content = await handle.readFile();
      const afterRead = await handle.stat();
      if (afterRead.dev !== opened.dev || afterRead.ino !== opened.ino
        || afterRead.size !== opened.size || afterRead.mtimeMs !== opened.mtimeMs
        || content.byteLength !== opened.size) {
        throw new Error('Changed file mutated while its content was being fingerprinted.');
      }
      observations.push([rel, sha(content)]);
    } finally {
      await handle.close();
    }
    if (supported(rel) && !paths.includes(rel)) throw new Error('Changed file selection became inconsistent.');
  }
  return {
    changedPaths: paths,
    ignoredChangedPaths,
    unsupportedChangedPaths,
    missingChangedPaths,
    unsafeChangedPaths,
    baseCommit,
    fingerprint: sha(status + JSON.stringify(observations) + String(baseCommit || '')),
    observations,
  };
}

export async function finalGate(root, config, scan) {
  try {
    // Invalid policy must never degrade to zero blocking findings / a clean result.
    if (!config || typeof config !== 'object' || !Object.hasOwn(SEVERITY, config.blockingSeverity)) {
      throw new Error('Invalid final-gate configuration.');
    }
    // Enforced completion must cover the committed topic-branch diff as well as
    // dirty worktree files. Without an explicit target base, a dirty-only scan
    // could incorrectly pass while earlier committed changes remain unscanned.
    if (config.completionGate === 'enforce' && !config.baseRef) {
      throw new Error('Completion enforcement requires a configured target base reference.');
    }
    const before = await snapshot(root, { baseRef: config.baseRef || null });
    if (before.changedPaths.length === 0 && before.unsupportedChangedPaths.length === 0) {
      return { status: 'no_changed_files', filesScanned: 0, findings: [], blocking: 0,
        scannedPaths: [], note: 'No Git-visible changed files were available; no security verification was performed.' };
    }
    if (before.unsupportedChangedPaths.length || before.missingChangedPaths.length || before.unsafeChangedPaths.length) {
      throw new Error('Unsupported, deleted, missing, or unsafe changed files prevent complete final coverage.');
    }
    if (config.completionGate === 'enforce' && before.ignoredChangedPaths.length) {
      throw new Error('Changed files under intentionally ignored directories prevent enforced completion coverage.');
    }
    const report = await scan(root, ['--changed', ...(before.baseCommit ? ['--base-ref', before.baseCommit] : [])]);
    if (report.status !== 'complete') throw new Error('Scanner did not return a complete result.');
    const after = await snapshot(root, { baseRef: config.baseRef || null });
    if (before.fingerprint !== after.fingerprint) throw new Error('Files changed while final scan was running.');
    if (after.unsupportedChangedPaths.length || after.missingChangedPaths.length || after.unsafeChangedPaths.length)
      throw new Error('Unsupported, missing, or unsafe changed files appeared during the final scan.');
    if (config.completionGate === 'enforce' && after.ignoredChangedPaths.length)
      throw new Error('Changes under intentionally ignored directories appeared during the final scan.');
    if (!Array.isArray(report.scannedPaths) || !Array.isArray(report.findings)
      || !Number.isSafeInteger(report.filesScanned) || report.filesScanned !== before.changedPaths.length
      || report.scannedPaths.length !== before.changedPaths.length
      || report.scannedPaths.some(file => typeof file !== 'string')
      || new Set(report.scannedPaths).size !== before.changedPaths.length) {
      throw new Error('Final scan returned malformed or duplicated coverage.');
    }
    const covered = new Set(report.scannedPaths);
    if (before.changedPaths.some(file => !covered.has(file))) {
      throw new Error('Final scan omitted changed files; security coverage is incomplete.');
    }
    for (const finding of report.findings) {
      if (!finding || typeof finding !== 'object' || Array.isArray(finding)
        || typeof finding.filePath !== 'string' || !covered.has(finding.filePath)
        || typeof finding.ruleId !== 'string' || !Object.hasOwn(SEVERITY, finding.severity)
        || (finding.line != null && (!Number.isSafeInteger(finding.line) || finding.line < 1))) {
        throw new Error('Final scan returned an invalid or out-of-scope finding.');
      }
    }
    const findings = report.findings.map(f => ({
      filePath: f.filePath.slice(0, 400), line: f.line || 1,
      ruleId: f.ruleId.slice(0, 100), severity: f.severity,
      title: String(f.title || '').slice(0, 180),
    }));
    const blocking = findings.filter(f => SEVERITY[f.severity] >= SEVERITY[config.blockingSeverity]).length;
    return { status: 'complete', filesScanned: report.filesScanned, scannedPaths: report.scannedPaths,
      findings, blocking, changedPaths: before.changedPaths, baseRef: before.baseCommit, fingerprint: after.fingerprint,
      securityGuarantee: false, note: 'Static checks of changed files only. Passing does not certify application security.' };
  } catch {
    return { status: 'scan_incomplete', filesScanned: 0, findings: [], blocking: 0,
      scannedPaths: [], securityGuarantee: false,
      note: 'Final scan failed, omitted files, or detected changing files; security status is UNKNOWN.' };
  }
}
