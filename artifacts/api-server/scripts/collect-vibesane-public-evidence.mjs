#!/usr/bin/env node
/**
 * Opt-in, read-only benchmark collector for a SHA-pinned PUBLIC GitHub repo.
 * Uses only metadata from the scanner. Does not execute cloned code, log
 * secret values, require VibeSane user sessions, or consume product scan quota.
 *
 * Example:
 * node scripts/collect-vibesane-public-evidence.mjs \
 *   --manifest benchmarks/real-world/pilot-manifest.v1.json \
 *   --repo OWASP/NodeGoat --output /tmp/nodegoat-scan.json
 *
 * Optional GITHUB_TOKEN may be supplied in the shell environment; never pass
 * token text on the command line, commit it, or paste it in chat.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { validateManifest } from './vibesane-benchmark-evidence.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_FILES = 300;
const MAX_FILE_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 12_000_000;

function argsMap(argv) {
  if (![6, 8].includes(argv.length)) throw new Error('Usage: --manifest PATH --repo OWNER/REPO --output PATH [--engine extended_v2_only|api_core_plus_extended_v2]');
  const values = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--manifest', '--repo', '--output', '--engine'].includes(argv[i]) || values.has(argv[i]) || !argv[i + 1]) {
      throw new Error('Only --manifest, --repo and --output are supported once each');
    }
    values.set(argv[i], argv[i + 1]);
  }
  if (!values.has('--manifest') || !values.has('--repo') || !values.has('--output') ||
      values.size !== (argv.length / 2)) throw new Error('Missing required collector arguments');
  if (values.has('--engine') && !['extended_v2_only', 'api_core_plus_extended_v2'].includes(values.get('--engine'))) {
    throw new Error('Unsupported explicit scanner engine');
  }
  return values;
}

export async function loadScanner() {
  const entryPoints = [
    path.join(dirname, '../src/lib/extendedScannerV2.ts'),
    path.join(dirname, '../src/lib/githubRepoReader.ts'),
    path.join(dirname, '../src/lib/apiScanner.ts'),
  ];
  const modules = await Promise.all(entryPoints.map(async entry => {
    const built = await build({
      entryPoints: [entry], bundle: true, platform: 'node',
      format: 'esm', target: 'node24', write: false, logLevel: 'silent',
    });
    const url = 'data:text/javascript;base64,' +
      Buffer.from(built.outputFiles[0].contents).toString('base64');
    return import(url);
  }));
  return { ...modules[0], ...modules[1], ...modules[2] };
}

async function requirePublicRepository(project) {
  const [owner, name] = project.repo.split('/');
  // Deliberately unauthenticated: a private repository must be rejected
  // even if the optional token could otherwise access it.
  const response = await fetch('https://api.github.com/repos/' +
    encodeURIComponent(owner) + '/' + encodeURIComponent(name), {
    signal: AbortSignal.timeout(30_000),
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'VibeSane-public-benchmark' },
  });
  if (!response.ok) throw new Error('Benchmark source is not publicly verifiable (HTTP ' + response.status + ')');
  const metadata = await response.json();
  if (metadata.private !== false || metadata.full_name?.toLowerCase() !== project.repo.toLowerCase()) {
    throw new Error('Only verified public GitHub repositories are allowed');
  }
}

async function githubTree(project, token) {
  const [owner, repo] = project.repo.split('/');
  const url = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' +
    encodeURIComponent(repo) + '/git/trees/' + encodeURIComponent(project.commit) + '?recursive=1';
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'VibeSane-public-benchmark',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
  });
  if (!response.ok) throw new Error('Pinned public GitHub tree unavailable (HTTP ' + response.status + ')');
  const payload = await response.json();
  if (!Array.isArray(payload.tree)) throw new Error('GitHub tree response missing entries');
  return payload;
}

function evaluateCoverage(project, tree, shouldRead, files) {
  const paths = project.coverageMode === 'bounded_subset' ? new Set(project.paths) : null;
  const eligible = tree.tree.filter(x => x.type === 'blob' &&
    typeof x.path === 'string' && shouldRead(x.path) && (!paths || paths.has(x.path)));
  const received = new Set(files.map(x => x.path));
  const missingDeclaredPaths = paths ? project.paths.filter(x => !received.has(x)) : [];
  const tooLarge = eligible.some(x => Number(x.size || 0) > MAX_FILE_BYTES);
  const aboveFileCap = eligible.length > MAX_FILES;
  const aboveByteCap = eligible.reduce((sum, x) => sum + Number(x.size || 0), 0) > MAX_TOTAL_BYTES;
  const expectedSet = new Set(eligible.map(x => x.path));
  const unexpected = files.some(x => !expectedSet.has(x.path));
  const eligibleNotFetched = eligible.filter(x => !received.has(x.path)).length;
  const complete = !tree.truncated && !tooLarge && !aboveFileCap && !aboveByteCap &&
    missingDeclaredPaths.length === 0 && eligibleNotFetched === 0 && !unexpected;
  return {
    complete,
    eligibleFiles: eligible.length,
    returnedFiles: files.length,
    eligibleNotFetched,
    missingDeclaredPaths,
    boundedByFileCap: aboveFileCap,
    boundedBySizeBudget: tooLarge || aboveByteCap,
    truncatedTree: !!tree.truncated,
    unexpectedPath: unexpected,
  };
}

export { argsMap, evaluateCoverage };

async function main() {
  const cli = argsMap(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(cli.get('--manifest'), 'utf8'));
  validateManifest(manifest);
  const engine = cli.get('--engine') || 'extended_v2_only';
  const project = manifest.projects.find(p => p.repo === cli.get('--repo'));
  if (!project) throw new Error('Repo not in the pinned public benchmark manifest');
  await requirePublicRepository(project);
  const token = process.env.GITHUB_TOKEN || undefined;
  const start = performance.now();
  const scanner = await loadScanner();
  // Download data only from github.com using the manifest's immutable commit.
  const base = 'https://github.com/' + project.repo + '?ref=' + project.commit;
  const scopedUrl = project.coverageMode === 'bounded_subset'
    ? base + '&paths=' + encodeURIComponent(project.paths.join('\n'))
    : base;
  const [tree, source] = await Promise.all([
    githubTree(project, token),
    scanner.readRepositoryFiles(scopedUrl, token),
  ]);
  const coverage = evaluateCoverage(project, tree, scanner.shouldRead, source.files);
  // This combined engine runs the existing API-core and extended V2 rules on
  // exactly the same immutable source files, without a clone or remote execution.
  // It is a closer core-rule approximation; not the product's hosted checkout,
  // experimental AST/taint pipeline, UI, quota or AI review path.
  const raw = engine === 'api_core_plus_extended_v2'
    ? [...scanner.scanApiFiles(source.files), ...scanner.scanExtendedFilesV2(source.files)]
    : scanner.scanExtendedFilesV2(source.files);
  const findingKeys = new Set();
  const findings = raw.map(f => ({
    ruleId: f.check, severity: f.severity, filePath: f.filePath, line: f.line,
  })).filter(f => {
    const key = JSON.stringify([f.ruleId, f.filePath, f.line]);
    if (findingKeys.has(key)) return false;
    findingKeys.add(key);
    return true;
  });
  const report = {
    schemaVersion: 1,
    projects: [{
      repo: project.repo, commit: project.commit,
      rulesetCommit: process.env.VIBESANE_RULESET_SHA || 'unknown',
      status: coverage.complete ? 'complete' : 'incomplete',
      engine,
      fullProductionParity: false,
      filesScanned: source.files.length,
      scannedFiles: source.files.map(f => f.path).sort(),
      sourceLinesScanned: source.files.reduce((sum, f) => sum + f.content.split('\n').length, 0),
      durationMs: Math.round(performance.now() - start),
      coverage, findings,
    }],
  };
  // A ruleset must always be identified by a real immutable commit.
  if (!/^[a-f0-9]{40}$/i.test(report.projects[0].rulesetCommit)) {
    throw new Error('Set VIBESANE_RULESET_SHA to the exact 40-char scanner commit before collecting evidence');
  }
  writeFileSync(cli.get('--output'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  process.stdout.write(JSON.stringify({
    status: report.projects[0].status, repo: project.repo,
    engine, scanned: source.files.length, findings: findings.length,
    coverage, outputCreated: true, externalCodeExecuted: false,
  }) + '\n');
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write('Collector failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
