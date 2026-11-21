import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateManifest } from './vibesane-benchmark-evidence.mjs';
import {
  parseBenchmarkArgs, scanFileName, timingPercentiles, unreviewedSummary,
} from './run-vibesane-realworld-benchmark.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'benchmarks/real-world/phase2-30-manifest.v1.json');
const pilotPath = path.join(root, 'benchmarks/real-world/pilot-manifest.v1.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const pilot = JSON.parse(readFileSync(pilotPath, 'utf8'));
const RULESET = 'b'.repeat(40);

test('30 independently pinned public candidates preserve the five-source pilot', () => {
  assert.equal(validateManifest(manifest), 30);
  assert.deepEqual(manifest.projects.slice(0, 5), pilot.projects);
  assert.equal(new Set(manifest.projects.map(p => p.repo.toLowerCase())).size, 30);
  assert.equal(manifest.projects.filter(p => p.sourceType === 'deliberately_vulnerable').length, 5);
  assert.ok(manifest.projects.reduce((n, p) => n + (p.paths?.length || 0), 0) >= 100);
  assert.ok(manifest.projects.some(p => p.paths?.some(x => x.endsWith('.sql'))));
  assert.ok(manifest.projects.some(p => p.paths?.some(x => x.endsWith('.tsx'))));
  assert.ok(manifest.projects.some(p => p.paths?.some(x => x.endsWith('.ts'))));
  assert.ok(manifest.projects.every(p => p.license !== 'NOASSERTION'));
});

test('runner CLI requires explicit source selection and bounded flags', () => {
  const args = parseBenchmarkArgs(['--manifest', 'm.json', '--output-dir', '/tmp/example', '--all', '--dry-run']);
  assert.equal(args.get('--manifest'), 'm.json');
  assert.equal(args.has('--dry-run'), true);
  assert.throws(() => parseBenchmarkArgs(['--manifest', 'm', '--output-dir', 'd']), /Exactly one/);
  assert.throws(() => parseBenchmarkArgs(['--manifest', 'm', '--output-dir', 'd', '--all', '--repo', 'a/b']), /Exactly one/);
  assert.throws(() => parseBenchmarkArgs(['--manifest', 'm', '--output-dir', 'd', '--all', '--all']), /Duplicate/);
  assert.throws(() => parseBenchmarkArgs(['--manifest', 'm', '--output-dir', 'd', '--all', '--token', 'secret']), /Usage/);
});

test('filename is stable and rejects path injection or mutable refs', () => {
  const p = { repo: 'owner/example', commit: 'a'.repeat(40) };
  assert.equal(scanFileName(p), 'owner__example--' + p.commit + '.json');
  assert.throws(() => scanFileName({ ...p, repo: '../outside' }), /Unsafe/);
  assert.throws(() => scanFileName({ ...p, commit: 'main' }), /Unsafe/);
});

test('p50 and p95 are deterministic nearest-rank observations', () => {
  assert.deepEqual(timingPercentiles([]), { p50Ms: null, p95Ms: null });
  assert.deepEqual(timingPercentiles([400, 100, 300, 200, 500]), { p50Ms: 300, p95Ms: 500 });
  assert.deepEqual(timingPercentiles([9]), { p50Ms: 9, p95Ms: 9 });
});

test('unreviewed sources never manufacture real-world accuracy', () => {
  const p = manifest.projects[5];
  const sub = { schemaVersion: 1, projects: [p] };
  const file = p.paths[0];
  const scan = {
    repo: p.repo, commit: p.commit, rulesetCommit: RULESET,
    engine: 'extended_v2_only', status: 'complete', durationMs: 70,
    filesScanned: p.paths.length, coverage: { complete: true },
    findings: [{ ruleId: 'eval_usage', filePath: file, line: 12, severity: 'High' }],
  };
  const summary = unreviewedSummary(sub, [p], [scan], [], RULESET);
  assert.equal(summary.completedProjects, 1);
  assert.equal(summary.filesScanned, p.paths.length);
  assert.equal(summary.scoring.overall.unreviewed, 1);
  assert.equal(summary.scoring.overall.precision, null);
  assert.equal(summary.scoring.overall.recallOnCuratedTargets, null);
  assert.equal(summary.precision, null);
  assert.equal(summary.recall, null);
  assert.equal(summary.externalRepositoryCodeExecuted, false);
});

test('incomplete scans are not interpreted as success', () => {
  const p = manifest.projects[5];
  const scan = { repo: p.repo, commit: p.commit, rulesetCommit: RULESET,
    engine: 'extended_v2_only', status: 'incomplete', filesScanned: 2,
    durationMs: 44, findings: [], coverage: { complete: false } };
  const result = unreviewedSummary({ schemaVersion: 1, projects: [p] }, [p], [scan], [], RULESET);
  assert.equal(result.completedProjects, 0);
  assert.equal(result.incompleteProjects, 1);
  assert.equal(result.scoring.projects[0].status, 'incomplete');
  assert.equal(result.p50Ms, null);
});

test('dry-run is network-free, needs no Git checkout and never generates labels', () => {
  const run = execFileSync(process.execPath, [
    path.join(root, 'scripts/run-vibesane-realworld-benchmark.mjs'),
    '--manifest', manifestPath, '--output-dir', '/tmp/vibesane-do-not-write',
    '--all', '--dry-run',
  ], { encoding: 'utf8', timeout: 5000 });
  const out = JSON.parse(run);
  assert.equal(out.status, 'dry_run');
  assert.equal(out.candidates.length, 30);
  assert.equal(out.sourceFetched, false);
  assert.equal(out.accuracyMeasured, false);
});
