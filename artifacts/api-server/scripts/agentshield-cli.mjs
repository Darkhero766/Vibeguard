#!/usr/bin/env node
// VibeSane AgentShield: local-only analysis of changed files. Bundled with esbuild.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { scanApiFiles } from '../src/lib/apiScanner.ts';
import { scanExtendedFilesV2 } from '../src/lib/extendedScannerV2.ts';
import { scanPythonFiles } from './agentshield-python.mjs';

const run = promisify(execFile);
const MAX_FILES = 100;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 8_000_000;
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|pyi?|sql|json|ya?ml)$/i;
const ENV_FILE = /(^|\/)\.env(?:\.[\w-]+)?$/i;
const IGNORE_PARTS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', 'vendor']);
const severities = { Critical: 4, High: 3, Medium: 2, Low: 1 };

function options(args) {
  if (args[0] !== 'scan') throw new Error('Usage: vibesane scan --changed [--format json|text] [--cwd PATH]');
  const out = { changed: false, file: null, cwd: process.cwd(), format: 'text' };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--changed') out.changed = true;
    else if (arg === '--json') out.format = 'json';
    else if (['--cwd', '--file', '--format'].includes(arg)) {
      if (!args[i + 1]) throw new Error('Missing value for ' + arg);
      out[arg.slice(2)] = args[++i];
    } else throw new Error('Unknown argument: ' + arg);
  }
  if (out.file && out.changed) throw new Error('Choose --file or --changed, not both.');
  if (!out.file && !out.changed) throw new Error('Specify --changed or --file PATH.');
  if (!['json', 'text'].includes(out.format)) throw new Error('Format must be json or text.');
  return out;
}

async function git(cwd, args) {
  try {
    const result = await run('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', cwd, ...args], {
      encoding: 'utf8', timeout: 7000, maxBuffer: 2_000_000, windowsHide: true,
    });
    return result.stdout;
  } catch {
    throw new Error('Git could not inspect the project; verify that the directory is a local Git repository.');
  }
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
    const status = item.slice(0, 2);
    const name = item.slice(3);
    if (status.includes('R') || status.includes('C')) i++; // -z renames include an additional old path
    if (status.includes('D') || status.includes('!')) continue;
    files.push(name);
  }
  return [...new Set(files)].sort();
}

async function loadFiles(opts) {
  const cwd = path.resolve(opts.cwd);
  const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim();
  const rootReal = await realpath(root);
  const targets = opts.file
    ? [path.isAbsolute(opts.file) ? path.relative(rootReal, opts.file) : path.relative(rootReal, path.resolve(cwd, opts.file))]
    : changedPaths(await git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']));
  const selected = targets.filter(validFile);
  const unsupportedChangedPaths = opts.file ? [] : targets.filter((file) => !ignoredPath(file) && !validFile(file));
  if (opts.file && selected.length === 0) throw new Error('The specified file is outside the repository or has an unsupported extension.');
  if (targets.length > MAX_FILES) throw new Error('Changed-file limit exceeded (100); narrow the scan.');
  const files = [];
  let bytes = 0;
  for (const rel of selected) {
    const absolute = path.resolve(rootReal, rel);
    const safeRelative = path.relative(rootReal, absolute);
    if (safeRelative.startsWith('..') || path.isAbsolute(safeRelative)) throw new Error('File escaped the repository root.');
    let info;
    try { info = await lstat(absolute); }
    catch (error) { if (error?.code === 'ENOENT') continue; throw new Error('Unable to inspect a selected file.'); }
    if (!info.isFile()) continue; // do not follow symlinks, devices or directories
    if (info.size > MAX_FILE_BYTES || bytes + info.size > MAX_TOTAL_BYTES) throw new Error('Source size limit exceeded; scan fewer or smaller files.');
    const verified = await realpath(absolute);
    if (verified !== rootReal && !verified.startsWith(rootReal + path.sep)) throw new Error('File escaped the repository root.');
    let content;
    try { content = await readFile(absolute, 'utf8'); }
    catch { throw new Error('Unable to read a selected file.'); }
    bytes += Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_TOTAL_BYTES) throw new Error('Source size limit exceeded.');
    files.push({ path: safeRelative.split(path.sep).join('/'), content });
  }
  if (opts.file && files.length === 0) throw new Error('The selected file was not safely readable.');
  return {
    files,
    mode: opts.file ? 'file' : 'changed',
    selected: selected.length,
    unsupportedChangedPaths,
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
    const key = [f.filePath, f.line, f.check, f.title].join(':');
    if (unique.has(key)) continue;
    unique.set(key, {
      id: redact(f.id, 300), ruleId: redact(f.check, 80), severity: f.severity,
      confidence: ['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'unrated',
      engine: redact(f.engine || 'core_heuristics', 80),
      title: redact(f.title, 240), description: redact(f.description, 900),
      recommendation: fixes[f.check] || 'Review the finding and follow the mitigation in its description.',
      filePath: redact(f.filePath, 500), line: Number(f.line) || 1,
    });
  }
  return [...unique.values()].sort((a, b) =>
    (severities[b.severity] || 0) - (severities[a.severity] || 0) ||
    a.filePath.localeCompare(b.filePath) || a.line - b.line);
}

function output(result, format) {
  if (format === 'json') { process.stdout.write(JSON.stringify(result) + '\n'); return; }
  if (result.status !== 'complete') {
    process.stdout.write('VibeSane AgentShield: ' + result.status + '. ' +
      (result.error || 'Some changed files were not analyzed; this is not a clean result.') + '\n');
    for (const file of (result.unsupportedChangedPaths || []).slice(0, 20)) {
      process.stdout.write('  Unsupported: ' + file + '\n');
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
    const { files, mode, selected, unsupportedChangedPaths } = await loadFiles(opts);
    const findings = analyze(files);
    const partial = unsupportedChangedPaths.length > 0;
    const report = {
      schemaVersion: 1, tool: 'VibeSane AgentShield',
      status: partial ? 'partial_coverage' : 'complete', mode,
      filesSelected: selected, filesScanned: files.length, scannedPaths: files.map((f) => f.path), findings,
      unsupportedChangedPaths: unsupportedChangedPaths.slice(0, 30),
      unsupportedChangedFileCount: unsupportedChangedPaths.length,
      coverage: partial
        ? 'Partial static heuristic analysis. Unsupported changed files were not analyzed; do not report a clean result.'
        : 'Static heuristic analysis of selected files only; untested vulnerabilities may remain.',
      scannedAt: new Date().toISOString(),
    };
    output(report, format);
    if (partial) return 2;
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
