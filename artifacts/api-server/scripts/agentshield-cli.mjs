#!/usr/bin/env node
// VibeSane AgentShield: local-only analysis of changed files. Bundled with esbuild.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lstat, realpath, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { assertSafeGitConfiguration } from './agentshield-safe-git.mjs';
import { scanApiFiles } from '../src/lib/apiScanner.ts';
import { scanExtendedFilesV2 } from '../src/lib/extendedScannerV2.ts';
import { scanPythonFiles } from './agentshield-python.mjs';
import { toSarif } from './agentshield-sarif.mjs';

const run = promisify(execFile);
const MAX_FILES = 100;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 8_000_000;
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|pyi?|sql|json|ya?ml)$/i;
const ENV_FILE = /(^|\/)\.env(?:\.[\w-]+)?$/i;
const IGNORE_PARTS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', 'vendor']);
const severities = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function options(args) {
  if (args[0] !== 'scan') throw new Error('Usage: vibesane scan (--changed | --all | --file PATH) [--base-ref REF] [--format json|text] [--cwd PATH]');
  const out = { changed: false, all: false, file: null, baseRef: null, cwd: process.cwd(), format: 'text' };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--changed') out.changed = true;
    else if (arg === '--all') out.all = true;
    else if (arg === '--json') out.format = 'json';
    else if (['--cwd', '--file', '--format', '--base-ref'].includes(arg)) {
      if (!args[i + 1]) throw new Error('Missing value for ' + arg);
      const key = arg === '--base-ref' ? 'baseRef' : arg.slice(2);
      out[key] = args[++i];
    } else throw new Error('Unknown argument: ' + arg);
  }
  if ([out.file !== null, out.changed, out.all].filter(Boolean).length > 1) throw new Error('Choose --file, --changed or --all.');
  if (!out.file && !out.changed && !out.all) throw new Error('Specify --changed, --all or --file PATH.');
  if (out.baseRef && !out.changed) throw new Error('--base-ref can only be used with --changed.');
  if (out.baseRef && !validBaseRef(out.baseRef)) throw new Error('Invalid --base-ref. Use a local branch, remote-tracking ref, tag, or commit SHA.');
  if (!['json', 'text', 'sarif'].includes(out.format)) throw new Error('Format must be json, text or sarif.');
  return out;
}

async function git(cwd, args) {
  try {
    const result = await run('git', ['-c', 'core.fsmonitor=false', '-C', cwd, ...args], {
      encoding: 'utf8', timeout: 7000, maxBuffer: 2_000_000, windowsHide: true,
    });
    return result.stdout;
  } catch {
    throw new Error('Git could not inspect the project; verify that the directory is a local Git repository.');
  }
}

async function explicitFileRelative(rootReal, cwd, file) {
  const input = path.resolve(cwd, file);
  // Resolve the parent directory only. Keeping the final path component lexical
  // lets lstat/open reject a final symlink rather than silently following it.
  const parent = await realpath(path.dirname(input));
  return path.relative(rootReal, path.join(parent, path.basename(input)));
}
function containedBy(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..'
    && !relative.startsWith('..' + path.sep));
}
function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function ignoredPath(rel) {
  const normalized = rel.replaceAll('\\', '/');
  return normalized.startsWith('/') || normalized.split('/').includes('..')
    || normalized.split('/').some((part) => IGNORE_PARTS.has(part));
}
function validFile(rel) {
  const normalized = rel.replaceAll('\\', '/');
  return !ignoredPath(normalized) && (SOURCE_FILE.test(normalized) || ENV_FILE.test(normalized));
}

function changedPaths(porcelain) {
  const chunks = porcelain.split('\0');
  const files = [];
  for (let i = 0; i < chunks.length; i++) {
    const item = chunks[i];
    if (!item) continue;
    if (item.length < 4 || item[2] !== ' ') throw new Error('Git returned malformed worktree status.');
    const status = item.slice(0, 2);
    const name = item.slice(3);
    if (status.includes('R') || status.includes('C')) i++;
    if (!status.includes('!')) files.push(name);
  }
  return [...new Set(files)].sort();
}

function validBaseRef(value) {
  return typeof value === 'string' && value.length <= 200
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.includes('..') && !value.includes('//') && !value.includes('@{')
    && !value.endsWith('/') && !value.endsWith('.') && !value.startsWith('-');
}

function diffChangedPaths(output) {
  const chunks = output.split('\0');
  const files = [];
  for (let i = 0; i < chunks.length;) {
    const status = chunks[i++];
    if (!status) continue;
    if (/^[RC][0-9]*$/.test(status)) {
      const oldPath = chunks[i++];
      const newPath = chunks[i++];
      if (!oldPath || !newPath) throw new Error('Git returned a malformed rename/copy entry.');
      files.push(newPath);
    } else if (/^[AMDTU][0-9]*$/.test(status)) {
      const file = chunks[i++];
      if (!file) throw new Error('Git returned a malformed changed path.');
      files.push(file);
    } else throw new Error('Git returned an unsupported diff status.');
  }
  return [...new Set(files)].sort();
}

async function resolveBaseCommit(cwd, baseRef) {
  if (!baseRef) return null;
  if (!validBaseRef(baseRef)) throw new Error('Invalid base reference.');
  const checked = await run('git', ['-c', 'core.fsmonitor=false',
    '-C', cwd, 'rev-parse', '--verify', '--end-of-options', baseRef + '^{commit}'], {
    encoding: 'utf8', timeout: 7000, maxBuffer: 10_000, windowsHide: true,
  }).catch(() => { throw new Error('Base reference is unavailable locally; fetch it or configure an existing commit/ref.'); });
  const sha = checked.stdout.trim();
  if (!/^[a-f0-9]{40,64}$/i.test(sha)) throw new Error('Git did not resolve the configured base to a commit.');
  const head = (await git(cwd, ['rev-parse', '--verify', 'HEAD'])).trim();
  if (sha === head) throw new Error('Base reference points to current HEAD; use a distinct target base that is an ancestor of the coding branch.');
  try {
    await git(cwd, ['merge-base', '--is-ancestor', sha, 'HEAD']);
  } catch {
    throw new Error('Base reference must be an ancestor of HEAD; update or rebase the coding branch onto the target base.');
  }
  return sha;
}

async function loadFiles(opts) {
  const cwd = path.resolve(opts.cwd);
  const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim();
  const rootReal = await realpath(root);
  await assertSafeGitConfiguration(rootReal);
  const worktreePaths = opts.file || opts.all ? [] : changedPaths(await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  const baseCommit = opts.baseRef ? await resolveBaseCommit(rootReal, opts.baseRef) : null;
  const committedPaths = baseCommit
    ? diffChangedPaths(await git(cwd, ['diff', '--name-status', '-z', '--find-renames', baseCommit + '...HEAD', '--']))
    : [];
  const explicitTarget = opts.file ? await explicitFileRelative(rootReal, cwd, opts.file) : null;
  const targets = opts.file
    ? [explicitTarget]
    : opts.all
      ? (await git(cwd, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean).sort()
      : [...new Set([...worktreePaths, ...committedPaths])].sort();
  const boundedTargets = opts.all ? targets.slice(0, MAX_FILES) : targets;
  const overLimitPaths = opts.all ? targets.slice(MAX_FILES) : [];
  const selected = boundedTargets.filter(validFile);
  const ignoredChangedPaths = opts.file ? [] : boundedTargets.filter((file) => {
    const normalized = file.replaceAll('\\', '/');
    return !normalized.startsWith('/') && !normalized.split('/').includes('..')
      && normalized.split('/').some((part) => IGNORE_PARTS.has(part));
  });
  const unsupportedChangedPaths = opts.file ? [] : [...boundedTargets.filter((file) => !ignoredPath(file) && !validFile(file)), ...overLimitPaths];
  if (opts.file && selected.length === 0) throw new Error('The specified file is outside the repository or has an unsupported extension.');
  if (!opts.all && targets.length > MAX_FILES) throw new Error('Changed-file limit exceeded (100); narrow the scan.');
  const files = [];
  const missingChangedPaths = [];
  const unsafeChangedPaths = [];
  let bytes = 0;
  for (const rel of selected) {
    const absolute = path.resolve(rootReal, rel);
    const safeRelative = path.relative(rootReal, absolute);
    if (!containedBy(rootReal, absolute)) throw new Error('File escaped the repository root.');
    let info;
    try { info = await lstat(absolute); }
    catch (error) {
      if (error?.code === 'ENOENT' && !opts.file) { missingChangedPaths.push(rel); continue; }
      throw new Error('Unable to inspect a selected file.');
    }
    if (!info.isFile() || info.isSymbolicLink()) { unsafeChangedPaths.push(rel); continue; } // never follow symlinks or special files
    if (info.size > MAX_FILE_BYTES || bytes + info.size > MAX_TOTAL_BYTES) throw new Error('Source size limit exceeded; scan fewer or smaller files.');
    const verified = await realpath(absolute);
    if (!containedBy(rootReal, verified)) throw new Error('File escaped the repository root.');
    let content;
    const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)).catch(() => {
      throw new Error('Unable to open a selected file without following symlinks.');
    });
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino) {
        throw new Error('Selected file identity changed while opening it.');
      }
      content = await handle.readFile('utf8');
      const afterRead = await handle.stat();
      if (afterRead.dev !== opened.dev || afterRead.ino !== opened.ino
        || afterRead.size !== opened.size || afterRead.mtimeMs !== opened.mtimeMs
        || Buffer.byteLength(content, 'utf8') !== opened.size) {
        throw new Error('Selected file changed while it was being read.');
      }
    } finally {
      await handle.close();
    }
    bytes += Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_TOTAL_BYTES) throw new Error('Source size limit exceeded.');
    files.push({ path: safeRelative.split(path.sep).join('/'), content });
  }
  if (opts.file && files.length === 0) throw new Error('The selected file was not safely readable.');
  return {
    files,
    mode: opts.file ? 'file' : opts.all ? 'full' : 'changed',
    selected: selected.length,
    ignoredChangedPaths,
    unsupportedChangedPaths,
    missingChangedPaths,
    unsafeChangedPaths,
    baseRef: baseCommit,
  };
}

// Narrow supplementary heuristic, not counted in the existing 50-rule catalog.
function unsafeSqlTemplate(files) {
  const findings = [];
  const dynamicSql = /\.(?:query|execute)\s*\(\s*`\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]{0,300}?\$\{[^}]+\}[\s\S]{0,300}?`/gi;
  const dynamicConcat = /\.(?:query|execute)\s*\(\s*["']\s*(?:SELECT|INSERT|UPDATE|DELETE)\b[^"'\n]{0,280}["']\s*\+\s*[A-Za-z_$][\w$]*/gi;
  for (const file of files) {
    if (!/\.(?:[cm]?[jt]sx?)$/i.test(file.path)) continue;
    for (const match of file.content.matchAll(dynamicSql)) {
      const line = file.content.slice(0, match.index || 0).split('\n').length;
      findings.push({
        id: 'unsafe-sql-template-' + file.path + '-' + line,
        check: 'unsafe_sql_template', severity: 'High',
        title: 'Potential unsafe dynamic SQL template',
        description: 'A SQL query template contains expression interpolation. This may permit SQL injection if the interpolated value is untrusted.',
        filePath: file.path, line,
      });
    }
    for (const match of file.content.matchAll(dynamicConcat)) {
      const line = file.content.slice(0, match.index || 0).split('\n').length;
      findings.push({
        id: 'unsafe-sql-concat-' + file.path + '-' + line,
        check: 'unsafe_sql_template', severity: 'High',
        title: 'Potential unsafe SQL string concatenation',
        description: 'A SQL query appears to concatenate a dynamic expression. If untrusted, this may permit SQL injection.',
        filePath: file.path, line,
      });
    }
  }
  return findings;
}

const fixes = {
  python_shell_injection: 'Use subprocess argument arrays with shell=False; validate any user-controlled arguments.',
  python_unsafe_deserialization: 'Do not unpickle untrusted data; use schema-validated JSON or another safe format.',
  python_unsafe_yaml_load: 'Use yaml.safe_load or SafeLoader and validate the parsed object.',
  python_tls_verification_disabled: 'Enable TLS certificate verification and configure a trusted CA when needed.',
  python_insecure_tempfile: 'Use NamedTemporaryFile, TemporaryDirectory, or mkstemp to create files securely.',
  python_dynamic_code_from_input: 'Remove eval/exec on untrusted data and replace it with a fixed operation map.',
  python_scan_limit: 'Run a dedicated Python SAST tool or review the file in smaller bounded units.',
  unsafe_sql_template: 'Use parameterized queries or a safe query builder; never interpolate untrusted values into SQL.',
  unauthenticated_write: 'Validate the session and resource ownership before database writes.',
  service_role_client: 'Keep privileged database keys only in server-side configuration.',
  rls: 'Enable Row-Level Security and add narrowly scoped access policies.',
  hardcoded_secret: 'Move credentials into secret storage and rotate any exposed key.',
  github_token: 'Revoke the exposed token and use a credential store.',
  hardcoded_jwt_secret: 'Use environment-backed key management and rotate exposed signing keys.',
};

function redact(value, max = 1400) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max);
}

function analyze(files) {
  const combined = [
    ...scanApiFiles(files),
    ...scanExtendedFilesV2(files),
    ...unsafeSqlTemplate(files),
    ...scanPythonFiles(files),
  ];
  const unique = new Map();
  for (const f of combined) {
    const key = f.check === 'hardcoded_jwt_secret'
      ? [f.filePath, f.line, f.check].join(':')
      : [f.filePath, f.line, f.check, f.title].join(':');
    const normalized = {
      id: redact(f.id, 300), ruleId: redact(f.check, 80), severity: f.severity,
      confidence: ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'unrated',
      engine: redact(f.engine || 'core_heuristics', 80),
      title: redact(f.title, 240), description: redact(f.description, 900),
      recommendation: fixes[f.check] || 'Review the finding and follow the mitigation in its description.',
      filePath: redact(f.filePath, 500), line: Number(f.line) || 1,
    };
    const existing = unique.get(key);
    if (existing) {
      if (f.check === 'hardcoded_jwt_secret'
        && (severities[f.severity] || 0) > (severities[existing.severity] || 0)) {
        unique.set(key, normalized);
      }
      continue;
    }
    unique.set(key, normalized);
  }
  return [...unique.values()].sort((a, b) =>
    (severities[b.severity] || 0) - (severities[a.severity] || 0) ||
    a.filePath.localeCompare(b.filePath) || a.line - b.line);
}

function output(result, format) {
  if (format === 'json') { process.stdout.write(JSON.stringify(result) + '\n'); return; }
  if (format === 'sarif') { process.stdout.write(JSON.stringify(toSarif(result)) + '\n'); return; }
  if (result.status !== 'complete') {
    process.stdout.write('VibeSane AgentShield: ' + result.status + '. ' +
      (result.error || 'Some changed files were not analyzed; this is not a clean result.') + '\n');
    for (const file of (result.ignoredChangedPaths || []).slice(0, 20)) {
      process.stdout.write('  Ignored (not scanned): ' + file + '\n');
    }
    for (const file of (result.unsupportedChangedPaths || []).slice(0, 20)) {
      process.stdout.write('  Unsupported: ' + file + '\n');
    }
    for (const file of (result.missingChangedPaths || []).slice(0, 20)) {
      process.stdout.write('  Deleted before scan: ' + file + '\n');
    }
    for (const file of (result.unsafeChangedPaths || []).slice(0, 20)) {
      process.stdout.write('  Unsafe file type: ' + file + '\n');
    }
    return;
  }
  process.stdout.write('VibeSane AgentShield: ' + result.filesScanned + ' files scanned; ' + result.findings.length + ' findings.\n');
  for (const f of result.findings) {
    process.stdout.write('[' + f.severity + '] ' + f.filePath + ':' + f.line + ' ' + f.title + ' (' + f.ruleId + ')\n');
    process.stdout.write('  ' + f.recommendation + '\n');
  }
  process.stdout.write('Static checks only; this is not proof that the project is free of vulnerabilities.\n');
}

export async function main(argv = process.argv.slice(2)) {
  let format = argv.includes('--json') || argv.includes('json') ? 'json' : 'text';
  try {
    const opts = options(argv);
    format = opts.format;
    const { files, mode, selected, ignoredChangedPaths, unsupportedChangedPaths, missingChangedPaths, unsafeChangedPaths, baseRef } = await loadFiles(opts);
    const findings = analyze(files);
    const partial = unsupportedChangedPaths.length > 0 || ignoredChangedPaths.length > 0;
    const analysisLimited = findings.some((finding) => finding.ruleId === 'python_scan_limit');
    const incomplete = missingChangedPaths.length > 0 || unsafeChangedPaths.length > 0 || analysisLimited;
    const report = {
      schemaVersion: 1, tool: 'VibeSane AgentShield',
      status: incomplete ? 'scan_incomplete' : partial ? 'partial_coverage' : 'complete', mode,
      filesSelected: selected, filesScanned: files.length, scannedPaths: files.map((f) => f.path), findings,
      ...(baseRef ? { baseRef } : {}),
      ignoredChangedPaths: ignoredChangedPaths.slice(0, 30),
      ignoredChangedFileCount: ignoredChangedPaths.length,
      unsupportedChangedPaths: unsupportedChangedPaths.slice(0, 30),
      unsupportedChangedFileCount: unsupportedChangedPaths.length,
      missingChangedPaths: missingChangedPaths.slice(0, 30),
      unsafeChangedPaths: unsafeChangedPaths.slice(0, 30),
      coverage: incomplete
        ? analysisLimited
          ? 'One or more source files exceeded an analyzer budget and were not fully analyzed; security status is UNKNOWN.'
          : 'One or more changed files were deleted or unsafe to read; security status is UNKNOWN.'
        : partial
          ? 'Partial static heuristic analysis. Unsupported or intentionally ignored changed files were not analyzed; do not report a clean result.'
          : 'Static heuristic analysis of selected files only; untested vulnerabilities may remain.',
      scannedAt: new Date().toISOString(),
    };
    output(report, format);
    if (partial || incomplete) return 2;
    return findings.some((f) => f.severity === 'Critical' || f.severity === 'High') ? 1 : 0;
  } catch (err) {
    const report = { schemaVersion: 1, tool: 'VibeSane AgentShield', status: 'error',
      error: redact(err?.message || 'Unexpected scanning error.', 220), findings: [] };
    output(report, format);
    return 2;
  }
}

if (process.argv[1] && /(?:agentshield|vibesane)(?:-cli)?\.m?js$/i.test(path.basename(process.argv[1]))) {
  main().then((code) => { process.exitCode = code; });
}
