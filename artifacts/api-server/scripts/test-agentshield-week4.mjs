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
import { HOLDOUT_CASES } from './agentshield-holdout-corpus.mjs';
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
  assert.equal(pkg.fileCount, 30);
  assert.deepEqual(pkg.contents, [
    'README.md', 'THIRD_PARTY_NOTICES.txt', 'cursor-hooks.json', 'dist/agentshield.mjs', 'package.json',
    'scripts/agentshield-ast-worker.cjs', 'scripts/agentshield-baselines.mjs', 'scripts/agentshield-capabilities.mjs',
    'scripts/agentshield-codex-stop.mjs', 'scripts/agentshield-connect.mjs', 'scripts/agentshield-controller.mjs', 'scripts/agentshield-cursor-stop.mjs',
    'scripts/agentshield-gate.mjs', 'scripts/agentshield-hook.mjs', 'scripts/agentshield-hybrid.mjs',
    'scripts/agentshield-install.mjs', 'scripts/agentshield-jobs-store.mjs', 'scripts/agentshield-jobs.mjs', 'scripts/agentshield-mcp-sdk.mjs',
    'scripts/agentshield-mcp-server.mjs', 'scripts/agentshield-mcp-stdio.mjs', 'scripts/agentshield-policy.mjs',
    'scripts/agentshield-python.mjs', 'scripts/agentshield-sarif.mjs', 'scripts/agentshield-stop.mjs',
    'scripts/agentshield-universal-install.mjs', 'scripts/agentshield-verifier.mjs', 'scripts/agentshield-version.mjs', 'scripts/vibesane.mjs', 'skills/vibesane-agentshield/SKILL.md',
  ]);
  assert.equal(pkg.sha256.length, 64);
  assert.match(pkg.contentSha256, /^[a-f0-9]{64}$/);
  assert.equal(pkg.fileDigests.length, pkg.fileCount);
  assert.deepEqual(pkg.fileDigests.map((file) => file.path), pkg.contents);
  assert.ok(pkg.fileDigests.every((file) => Number.isSafeInteger(file.bytes) && file.bytes >= 0
    && /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.ok(pkg.contents.includes('dist/agentshield.mjs'));
  assert.ok(pkg.contents.includes('scripts/vibesane.mjs'));
  assert.ok(!pkg.contents.some(x => /src\/lib|\.env|benchmark|test-|node_modules|\.ts$/.test(x)));
  const npmRoot = await mkdtemp(path.join(tmpdir(), 'agentshield-w4-offline-install-'));
  t.after(async () => { await rm(npmRoot, { recursive: true, force: true }); });
  // Rebuilding the same staged source tree must produce byte-identical package
  // archives; this catches OS-dependent line endings and timestamps.
  await rm(pkg.archive, { force: true });
  const repeatedPack = JSON.parse((await exec(process.execPath, [packager], {
    timeout: 40000, maxBuffer: 250000, windowsHide: true,
  })).stdout);
  assert.equal(repeatedPack.contentSha256, pkg.contentSha256,
    'Repeated packaging changed the normalized file-content manifest.');
  assert.equal(repeatedPack.sha256, pkg.sha256,
    'Repeated packaging of identical normalized inputs must be byte reproducible.');
  assert.equal(repeatedPack.archiveBytes, pkg.archiveBytes);

  await exec('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
    '--prefix', npmRoot, pkg.archive], { timeout: 45000, maxBuffer: 250000,
    shell: process.platform === 'win32', windowsHide: true,
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false' } });
  const installed = path.join(npmRoot, 'node_modules', '@vibesane', 'foxy');
  const manifest = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@vibesane/foxy');
  assert.equal(manifest.version, pkg.version);
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.publishConfig?.access, 'public');
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
  const installedReadme = await readFile(path.join(installed, 'README.md'), 'utf8');
  assert.match(installedReadme, /never modifies repository files/i);
  assert.match(installedReadme, /local SQLite queue/i);
  assert.match(installedReadme, /in-memory baseline state/i);
  assert.ok((await stat(path.join(installed, 'dist/agentshield.mjs'))).isFile());
  const installedBin = process.platform === 'win32'
    ? path.join(npmRoot, 'node_modules', '.bin', 'vibesane.cmd')
    : path.join(npmRoot, 'node_modules', '.bin', 'vibesane');
  const binInfo = await lstat(installedBin);
  assert.ok(process.platform === 'win32' ? binInfo.isFile() : binInfo.isSymbolicLink(),
    'Installed package CLI shim is missing or has the wrong platform type.');

  const root = await fixture(t);
  const main = path.join(installed, 'scripts/vibesane.mjs');
  const doc = await exec(process.execPath, [main, 'doctor', '--cwd', root], { timeout: 10000 });
  assert.equal(JSON.parse(doc.stdout).status, 'ready');
  await exec(process.execPath, [main, 'init', '--cwd', root], { timeout: 10000 });
  let hooks = JSON.parse(await readFile(path.join(root, '.claude/settings.json'), 'utf8')).hooks;
  assert.equal(hooks.PostToolUse.length, 1);
  assert.equal(hooks.Stop.length, 1);
  // The unpublished installed tarball must genuinely run the parser without
  // a checkout, TypeScript install or application package dependencies.
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src/taint.ts'),
    'const id=req.query.id; const sql="SELECT * FROM users WHERE id="+id; db.query(sql);\n');
  let hybridOutput;
  try {
    hybridOutput = await exec(process.execPath, [main, 'hybrid', '--changed',
      '--enable-ast', '--cwd', root, '--format', 'json'], { timeout: 30000, maxBuffer: 600000 });
  } catch (error) {
    if (error.code !== 1 || typeof error.stdout !== 'string') throw error;
    hybridOutput = { stdout: error.stdout };
  }
  const hybridReport = JSON.parse(hybridOutput.stdout);
  assert.equal(hybridReport.status, 'complete');
  assert.equal(hybridReport.ast.status, 'complete');
  assert.ok(hybridReport.ast.taintFindings.some(f => f.ruleId === 'tainted_sql_sink'));
  assert.equal(hybridReport.ai.status, 'disabled');
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

test('unchecked guard call and commented guard do not suppress API authorization warning', async (t) => {
  const root = await fixture(t);
  const file = path.join(root, 'app/api/orders/route.ts');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "export async function POST() { await requireAuth(); await supabase.from('orders').insert({total:1}); }\n");
  assert.ok((await scan(root)).report.findings.some(f => f.ruleId === 'unauthenticated_write'));
  await writeFile(file, "// const u = await requireAuth(); if (!u) throw Error('unauthorized');\nexport async function POST() { await supabase.from('orders').insert({total:1}); }\n");
  assert.ok((await scan(root)).report.findings.some(f => f.ruleId === 'unauthenticated_write'));
});

test('checked authorization guard and typed JWT literal are distinguished correctly', async (t) => {
  const root = await fixture(t);
  const guardFile = path.join(root, 'app/api/orders/route.ts');
  const secretFile = path.join(root, 'src/auth.ts');
  await mkdir(path.dirname(guardFile), { recursive: true });
  await mkdir(path.dirname(secretFile), { recursive: true });
  await writeFile(guardFile, "export async function POST() { const user = await requireAuth(); if (!user) throw Error('unauthorized'); await supabase.from('orders').insert({total:1}); }\n");
  await writeFile(secretFile, 'const jwtSecret: string = "' + 'J'.repeat(36) + '";\n');
  const findings = (await scan(root)).report.findings;
  assert.ok(!findings.some(f => f.ruleId === 'unauthenticated_write'));
  assert.ok(findings.some(f => f.ruleId === 'hardcoded_jwt_secret'));
});

test('commented auth.getUser does not suppress missing authorization finding', async (t) => {
  const root = await fixture(t);
  const file = path.join(root, 'app/api/orders/route.ts');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "// auth.getUser();\nexport async function POST() { await supabase.from('orders').insert({total:1}); }\n");
  const out = await scan(root);
  assert.ok(out.report.findings.some(f => f.ruleId === 'unauthenticated_write'));
});

test('scoped acknowledgement stays visible but never suppresses a blocking finding', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(path.join(root, 'src/auth.js'), 'const JWT_SECRET = "' + 'Z'.repeat(36) + '";\n');
  const controller = path.join(api, 'scripts/agentshield-controller.mjs');
  const config = await mkdtemp(path.join(tmpdir(), 'agentshield-w4-ack-'));
  t.after(async () => { await rm(config, { recursive: true, force: true }); });
  const env = { ...process.env, VIBESANE_AGENTSHIELD_CONFIG_HOME: path.join(config, 'config'),
    VIBESANE_AGENTSHIELD_STATE_HOME: path.join(config, 'state') };
  const ack = await exec(process.execPath, [controller, 'acknowledge', '--cwd', root,
    '--file', 'src/auth.js', '--rule', 'hardcoded_jwt_secret', '--reason', 'false-positive', '--hours', '24'],
  { timeout: 10000, env });
  const acknowledged = JSON.parse(ack.stdout);
  assert.equal(acknowledged.suppressesBlocking, false);
  assert.equal(acknowledged.suppressesScan, false);
  try {
    await exec(process.execPath, [controller, 'verify', '--changed', '--cwd', root], { timeout: 15000, env });
    assert.fail('The blocking finding must cause a nonzero exit code.');
  } catch (e) {
    assert.equal(e.code, 1);
    const report = JSON.parse(e.stdout);
    assert.ok(report.blocking > 0);
    assert.ok(report.outcomes.some(o => o.acknowledgedRules.includes('hardcoded_jwt_secret')));
    assert.ok(report.severityBreakdown.Critical > 0);
  }
});

test('acknowledgement rejects traversal and unlimited expiration', async (t) => {
  const root = await fixture(t);
  const controller = path.join(api, 'scripts/agentshield-controller.mjs');
  for (const [file, hours] of [['../secret.ts', '24'], ['src/auth.js', '999']]) {
    try {
      await exec(process.execPath, [controller, 'acknowledge', '--cwd', root,
        '--file', file, '--rule', 'hardcoded_jwt_secret', '--reason', 'false-positive', '--hours', hours], { timeout: 10000 });
      assert.fail('Expected invalid acknowledgement rejection.');
    } catch (e) { assert.equal(e.code, 2); }
  }
});

test('independent held-out challenge set discloses weak patterns without altering expectations', async () => {
  assert.equal(HOLDOUT_CASES.length, 24);
  assert.equal(HOLDOUT_CASES.filter(x => x.expected).length, 12);
  const result = await benchmark({ cases: HOLDOUT_CASES, kind: 'holdout' });
  assert.equal(result.totalCases, 24);
  assert.equal(result.results.tp + result.results.tn + result.results.fp + result.results.fn, 24);
  console.log('OBSERVED_AGENTSHIELD_HOLDOUT=' + JSON.stringify({
    ...result.results, misses: result.misclassifications.map(x => x.caseId),
    measuredElapsedMs: result.measuredElapsedMs,
  }));
});

test('human-readable verify shows scoped severity and action without revealing fake credentials', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'src'), { recursive: true });
  const fake = 'K'.repeat(36);
  await writeFile(path.join(root, 'src/auth.js'), 'const JWT_SECRET = "' + fake + '";\n');
  const controller = path.join(api, 'scripts/agentshield-controller.mjs');
  try {
    await exec(process.execPath, [controller, 'verify', '--changed', '--format', 'text', '--cwd', root], { timeout: 15000 });
    assert.fail('Blocking issue must return nonzero exit code.');
  } catch (e) {
    assert.equal(e.code, 1);
    assert.match(e.stdout, /ACTION REQUIRED/);
    assert.match(e.stdout, /Critical 1/);
    assert.doesNotMatch(e.stdout, /K{30}/);
  }
});

test('staging env file is flagged while an example template remains safe', async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, '.env.staging'), 'DEMO_FLAG=placeholder\n');
  assert.ok((await scan(root, ['--file', '.env.staging'])).report.findings.some(f => f.ruleId === 'committed_env_file'));
  await writeFile(path.join(root, '.env.example'), 'DEMO_FLAG=placeholder\n');
  assert.ok(!(await scan(root, ['--file', '.env.example'])).report.findings.some(f => f.ruleId === 'committed_env_file'));
});

test('quoted SQL table names are recognized for missing and enabled RLS', async (t) => {
  const root = await fixture(t);
  const name = path.join(root, 'migrations/quoted.sql');
  await mkdir(path.dirname(name), { recursive: true });
  await writeFile(name, 'CREATE TABLE "public"."reports" (id uuid PRIMARY KEY);\n');
  assert.ok((await scan(root)).report.findings.some(f => f.ruleId === 'rls'));
  await writeFile(name, 'CREATE TABLE "public"."reports" (id uuid PRIMARY KEY); ALTER TABLE "public"."reports" ENABLE ROW LEVEL SECURITY;\n');
  assert.ok(!(await scan(root)).report.findings.some(f => f.ruleId === 'rls'));
});

test('browser runtime service-role exposure is distinguished from anon key', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'src/client.ts');
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(source, 'const key = window.__ENV.SUPABASE_SERVICE_ROLE_KEY;\n');
  assert.ok((await scan(root)).report.findings.some(f => f.ruleId === 'service_role_client'));
  await writeFile(source, 'const key = window.__ENV.SUPABASE_ANON_KEY;\n');
  assert.ok(!(await scan(root)).report.findings.some(f => f.ruleId === 'service_role_client'));
});

test('direct SQL string concatenation is flagged while parameter binding is not', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'src/db.ts');
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(source, "db.query('SELECT * FROM users WHERE id=' + userId);\n");
  assert.ok((await scan(root)).report.findings.some(f => f.ruleId === 'unsafe_sql_template'));
  await writeFile(source, 'db.query("SELECT * FROM users WHERE id=$1", [userId]);\n');
  assert.ok(!(await scan(root)).report.findings.some(f => f.ruleId === 'unsafe_sql_template'));
});

test('readonly typed literal JWT secret is detected but environment source is not', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'src/auth.ts');
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(source, 'const jwtSecret: Readonly<string> = "' + 'T'.repeat(36) + '";\n');
  assert.ok((await scan(root)).report.findings.some(f => f.ruleId === 'hardcoded_jwt_secret'));
  await writeFile(source, 'const jwtSecret: Readonly<string> = process.env.JWT_SECRET;\n');
  assert.ok(!(await scan(root)).report.findings.some(f => f.ruleId === 'hardcoded_jwt_secret'));
});
