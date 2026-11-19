import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat, lstat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { BENCHMARK_CASES } from './agentshield-accuracy-corpus.mjs';
import { benchmark } from './benchmark-agentshield-accuracy.mjs';
import { finalGate } from './agentshield-gate.mjs';
import { parseConfig } from './agentshield-policy.mjs';

const exec = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const api = path.resolve(scripts, '..');
const scanner = path.join(api, 'dist/agentshield.mjs');
const packager = path.join(scripts, 'package-agentshield-beta.mjs');
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'agentshield-w4-project-'));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  await exec('git', ['init', '-q', root], { timeout: 5000 });
  return root;
}
async function scan(root, args = ['--changed']) {
  try {
    const result = await exec(process.execPath, [scanner, 'scan', ...args, '--cwd', root, '--format', 'json'],
      { timeout: 14000, maxBuffer: 1_500_000, windowsHide: true });
    return { report: JSON.parse(result.stdout), code: 0, stdout: result.stdout };
  } catch (e) {
    if (typeof e.stdout !== 'string' || ![1,2].includes(e.code)) throw e;
    return { report: JSON.parse(e.stdout), code: e.code, stdout: e.stdout };
  }
}

test('labeled benchmark corpus has >=100 individual cases and 12 target categories', () => {
  assert.ok(BENCHMARK_CASES.length >= 100);
  assert.equal(new Set(BENCHMARK_CASES.map(x => x.id)).size, BENCHMARK_CASES.length);
  assert.ok(new Set(BENCHMARK_CASES.map(x => x.category)).size >= 12);
  for (const c of BENCHMARK_CASES) {
    assert.equal(typeof c.expected, 'boolean');
    assert.ok(c.ruleId && c.path && c.content && c.rationale);
  }
});

test('accuracy benchmark runs all labeled cases and reports transparent confusion counts', async () => {
  const r = await benchmark();
  assert.equal(r.totalCases, BENCHMARK_CASES.length);
  assert.equal(r.results.tp + r.results.tn + r.results.fp + r.results.fn, r.totalCases);
  assert.equal(r.misclassifications.length, r.results.fp + r.results.fn);
  assert.equal(r.categoryCount, new Set(BENCHMARK_CASES.map(c => c.category)).size);
  assert.ok(r.results.precision >= 0 && r.results.precision <= 1);
  assert.ok(r.results.recall >= 0 && r.results.recall <= 1);
  console.log('OBSERVED_ACCURACY_SUMMARY=' + JSON.stringify({
    total: r.totalCases, tp: r.results.tp, tn: r.results.tn, fp: r.results.fp, fn: r.results.fn,
    precision: r.results.precision, recall: r.results.recall, falsePositiveRate: r.results.falsePositiveRate,
    targetsMet: r.targetsMet, missed: r.misclassifications.map(x => x.caseId), elapsedMs: r.measuredElapsedMs,
  }));
});

test('unpublished local beta package contains no server runtime or source corpus', async (t) => {
  const { stdout } = await exec(process.execPath, [packager], { timeout: 40000, maxBuffer: 250000 });
  const pkg = JSON.parse(stdout);
  assert.equal(pkg.status, 'packaged_local_only');
  assert.equal(pkg.published, false);
  assert.equal(pkg.fileCount, 11);
  assert.equal(pkg.sha256.length, 64);
  assert.ok(pkg.contents.includes('dist/agentshield.mjs'));
  assert.ok(pkg.contents.includes('scripts/vibesane.mjs'));
  assert.ok(!pkg.contents.some(x => /src\/lib|\.env|benchmark|test-|node_modules|\.ts$/.test(x)));
  const npmRoot = await mkdtemp(path.join(tmpdir(), 'agentshield-w4-offline-install-'));
  t.after(async () => { await rm(npmRoot, { recursive: true, force: true }); });
  await exec('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--prefix', npmRoot, pkg.archive], { timeout: 45000, maxBuffer: 250000,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' } });
  const installed = path.join(npmRoot, 'node_modules', '@vibesane', 'agentshield');
  const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.private, true);
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
  assert.ok((await stat(path.join(installed, 'dist/agentshield.mjs'))).isFile());
  assert.ok((await lstat(path.join(npmRoot, 'node_modules/.bin/vibesane'))).isSymbolicLink());

  const root = await fixture(t);
  const main = path.join(installed, 'scripts/vibesane.mjs');
  const doc = await exec(process.execPath, [main, 'doctor', '--cwd', root], { timeout: 10000 });
  assert.equal(JSON.parse(doc.stdout).status, 'ready');
  await exec(process.execPath, [main, 'init', '--cwd', root], { timeout: 10000 });
  let hooks = JSON.parse(await readFile(path.join(root, '.claude/settings.json'), 'utf8')).hooks;
  assert.equal(hooks.PostToolUse.length, 1);
  assert.equal(hooks.Stop.length, 1);
  await exec(process.execPath, [main, 'uninstall', '--cwd', root], { timeout: 10000 });
  hooks = JSON.parse(await readFile(path.join(root, '.claude/settings.json'), 'utf8')).hooks || {};
  assert.equal(hooks.PostToolUse, undefined);
  assert.equal(hooks.Stop, undefined);
});

test('packaged scanner detects a synthetic secret without printing its value', async (t) => {
  const root = await fixture(t);
  const key = 'Y'.repeat(40);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src/auth.ts'), 'const JWT_SECRET = "' + key + '";');
  const out = await scan(root);
  assert.equal(out.code, 1);
  assert.ok(out.report.findings.some(f => f.ruleId === 'hardcoded_jwt_secret'));
  assert.ok(!out.stdout.includes(key));
});

test('final-gate synthetic performance covers 1, 10, 50 and 100 changed files', async (t) => {
  const root = await fixture(t);
  const measurements = [];
  await mkdir(path.join(root, 'src'), { recursive: true });
  for (const count of [1, 10, 50, 100]) {
    for (let n = 0; n < count; n++) await writeFile(path.join(root, 'src/file-' + n + '.js'),
      'export const value' + n + ' = ' + n + ';\n');
    const before = performance.now();
    const result = await finalGate(root, parseConfig({}), async (cwd, args) => {
      const out = await scan(cwd, args);
      if (out.code === 2) throw new Error('scanner incomplete');
      return out.report;
    });
    measurements.push({ count, durationMs: Math.round(performance.now() - before),
      rssBytes: process.memoryUsage().rss });
    assert.equal(result.status, 'complete');
    assert.equal(result.filesScanned, count);
    assert.equal(result.blocking, 0);
  }
  console.log('OBSERVED_AGENTSHIELD_W4_PERFORMANCE=' + JSON.stringify({
    platform: process.platform, node: process.version, measurements }));
});

test('101 changed files never produce a final-gate pass', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'src'), { recursive: true });
  for (let n = 0; n < 101; n++) await writeFile(path.join(root, 'src/limit-' + n + '.js'), 'export const x = 1;\n');
  const result = await finalGate(root, parseConfig({}), async (cwd, args) => (await scan(cwd, args)).report);
  assert.equal(result.status, 'scan_incomplete');
});

test('offline scanner handles malformed source as static data without executing it', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'broken.js'), '(() => { throw Error("DO NOT EXECUTE");');
  const result = await scan(root);
  assert.notEqual(result.code, 2);
  assert.equal(result.report.filesScanned, 1);
});
