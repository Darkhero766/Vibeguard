#!/usr/bin/env node
/**
 * Opt-in, sequential, read-only public-source benchmark.
 * Executes only the local VibeSane collector, NEVER fetched repository code.
 * Produces source-free metadata; does not invent human labels or accuracy.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreEvidence, validateManifest } from './vibesane-benchmark-evidence.mjs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '../../..');
const collector = path.join(scriptsDir, 'collect-vibesane-public-evidence.mjs');
const SHA = /^[a-f0-9]{40}$/i;
const scannerPaths = [
  'artifacts/api-server/src/lib/extendedScanner.ts',
  'artifacts/api-server/src/lib/extendedScannerV2.ts',
  'artifacts/api-server/src/lib/githubRepoReader.ts',
  'artifacts/api-server/src/lib/securityCheckCatalog.ts',
  'artifacts/api-server/scripts/collect-vibesane-public-evidence.mjs',
];

export function parseBenchmarkArgs(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all' || arg === '--dry-run') {
      if (values.has(arg)) throw new Error('Duplicate argument: ' + arg);
      values.set(arg, true);
    } else if (['--manifest', '--output-dir', '--repo'].includes(arg) &&
               !values.has(arg) && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      values.set(arg, argv[++i]);
    } else throw new Error('Usage: --manifest FILE --output-dir DIR (--all | --repo OWNER/REPO) [--dry-run]');
  }
  if (!values.has('--manifest') || !values.has('--output-dir') ||
      (values.has('--all') === values.has('--repo'))) {
    throw new Error('Exactly one of --all and --repo is required, with --manifest and --output-dir');
  }
  return values;
}

export function scanFileName(project) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(project.repo) ||
      project.repo.split('/').some(part => part === '.' || part === '..') ||
      !SHA.test(project.commit)) throw new Error('Unsafe or unpinned repository identity');
  return project.repo.replace('/', '__') + '--' + project.commit.toLowerCase() + '.json';
}

export function timingPercentiles(values) {
  if (!values.length) return { p50Ms: null, p95Ms: null };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

function localRulesetSha() {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root, encoding: 'utf8', timeout: 5000,
  }).trim();
  if (!SHA.test(sha)) throw new Error('Cannot pin local scanner commit');
  const dirty = execFileSync('git', ['status', '--porcelain', '--', ...scannerPaths], {
    cwd: root, encoding: 'utf8', timeout: 5000,
  }).trim();
  if (dirty) throw new Error('Scanner files are uncommitted; commit before collecting accuracy evidence');
  return sha.toLowerCase();
}

function readExisting(file, project, ruleset) {
  const document = JSON.parse(readFileSync(file, 'utf8'));
  const scan = document.projects?.[0];
  if (document.schemaVersion !== 1 || document.projects.length !== 1 ||
      scan.repo !== project.repo || scan.commit?.toLowerCase() !== project.commit.toLowerCase() ||
      scan.rulesetCommit?.toLowerCase() !== ruleset ||
      scan.engine !== 'extended_v2_only') {
    throw new Error('Incompatible existing scan for ' + project.repo);
  }
  return scan;
}

export function unreviewedSummary(manifest, selected, scans, failures, ruleset) {
  const scored = scoreEvidence(manifest, { schemaVersion: 1, projects: scans }, {
    schemaVersion: 1, projects: [],
  });
  const complete = scans.filter(scan => scan.status === 'complete');
  return {
    schemaVersion: 1,
    kind: 'unreviewed_public_source_metadata',
    rulesetCommit: ruleset,
    manifestProjects: manifest.projects.length,
    selectedProjects: selected.length,
    completedProjects: complete.length,
    incompleteProjects: scans.length - complete.length,
    failedProjects: failures,
    filesScanned: scans.reduce((sum, scan) => sum + scan.filesScanned, 0),
    ...timingPercentiles(complete.map(scan => scan.durationMs)),
    precision: null,
    recall: null,
    externalRepositoryCodeExecuted: false,
    scoring: scored,
  };
}

async function main(argv) {
  const args = parseBenchmarkArgs(argv);
  const manifestPath = path.resolve(args.get('--manifest'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  validateManifest(manifest);
  const selected = args.has('--all') ? manifest.projects :
    manifest.projects.filter(p => p.repo === args.get('--repo'));
  if (!selected.length) throw new Error('Repository is absent from pinned manifest');

  if (args.has('--dry-run')) {
    process.stdout.write(JSON.stringify({
      status: 'dry_run', candidates: selected.map(project => project.repo),
      sourceFetched: false, accuracyMeasured: false,
    }) + '\n');
    return;
  }

  const ruleset = localRulesetSha();
  const dir = path.resolve(args.get('--output-dir'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!lstatSync(dir).isDirectory() || lstatSync(dir).isSymbolicLink()) {
    throw new Error('Output must be a non-symlink directory');
  }

  const scans = [];
  const failures = [];
  for (const project of selected) {
    const file = path.join(dir, scanFileName(project));
    try {
      if (!existsSync(file)) {
        const p = spawnSync(process.execPath, [
          collector, '--manifest', manifestPath, '--repo', project.repo, '--output', file,
        ], {
          cwd: root, encoding: 'utf8', timeout: 240_000, maxBuffer: 64 * 1024,
          env: { ...process.env, VIBESANE_RULESET_SHA: ruleset },
        });
        if (p.error || p.status !== 0) {
          failures.push({ repo: project.repo, reason: p.error ? 'timeout_or_spawn_error' : 'collector_nonzero' });
          continue;
        }
      }
      scans.push(readExisting(file, project, ruleset));
    } catch {
      failures.push({ repo: project.repo, reason: 'unreadable_or_mismatched_scan' });
    }
  }

  const summary = unreviewedSummary(manifest, selected, scans, failures, ruleset);
  const reportFile = path.join(dir, 'unreviewed-summary.json');
  writeFileSync(reportFile, JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 });
  const complete = failures.length === 0 && summary.incompleteProjects === 0;
  process.stdout.write(JSON.stringify({
    status: complete ? 'collected_unreviewed' : 'incomplete',
    selected: selected.length, scannedCompletely: summary.completedProjects,
    incomplete: summary.incompleteProjects, failed: failures.length,
    reviewedPrecision: null, curatedRecall: null,
    summaryFile: reportFile,
  }) + '\n');
  if (!complete) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write('Read-only benchmark failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
