import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { benchmark } from './benchmark-agentshield-accuracy.mjs';
import { WEEK5_EVALUATION } from './agentshield-week5-evaluation.mjs';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = name => readFile(path.join(root, name), 'utf8');
const scanner = path.join(root, 'artifacts/api-server/dist/agentshield.mjs');

test('new Week 5 synthetic evaluation has unique cases, verified labels and multiple Next.js/Supabase categories', () => {
  assert.ok(WEEK5_EVALUATION.length >= 40);
  assert.equal(new Set(WEEK5_EVALUATION.map(x => x.id)).size, WEEK5_EVALUATION.length);
  assert.ok(new Set(WEEK5_EVALUATION.map(x => x.category)).size >= 5);
  assert.ok(WEEK5_EVALUATION.some(x => x.expected === true));
  assert.ok(WEEK5_EVALUATION.some(x => x.expected === false));
  for (const x of WEEK5_EVALUATION) {
    assert.equal(typeof x.expected, 'boolean');
    assert.ok(x.path && x.content && x.ruleId && x.rationale);
  }
});

test('Week 5 untouched synthetic evaluation reports all predictions and misses without filtering', async () => {
  const result = await benchmark({ cases: WEEK5_EVALUATION, kind: 'week5-new-untouched' });
  assert.equal(result.totalCases, WEEK5_EVALUATION.length);
  assert.equal(result.results.tp + result.results.fp + result.results.tn + result.results.fn, result.totalCases);
  assert.equal(result.misclassifications.length, result.results.fp + result.results.fn);
  console.log('WEEK5_FRESH_EVALUATION=' + JSON.stringify({
    total: result.totalCases, tp: result.results.tp, fp: result.results.fp,
    tn: result.results.tn, fn: result.results.fn,
    precision: result.results.precision, recall: result.results.recall,
    falsePositiveRate: result.results.falsePositiveRate,
    misses: result.misclassifications.map(x => x.caseId),
  }));
});

test('AgentShield page is integrated into real web routing', async () => {
  const route = await read('artifacts/vibeguard/src/App.tsx');
  assert.match(route, /AgentShieldPage/);
  assert.match(route, /path === '\/agentshield'/);
  assert.match(route, /<AgentShieldPage\s*\/>/);
});

test('desktop and mobile navigation and footer link to AgentShield', async () => {
  const nav = await read('artifacts/vibeguard/src/components/Nav.tsx');
  const footer = await read('artifacts/vibeguard/src/components/Footer.tsx');
  assert.ok(nav.split('href="/agentshield"').length >= 3);
  assert.match(footer, /href="\/agentshield"/);
});

test('web claims distinguish local beta and existing GitHub scanner', async () => {
  const page = await read('artifacts/vibeguard/src/pages/AgentShieldPage.tsx');
  for (const phrase of ['Web Scanner', 'AgentShield Local', 'Claude Code', 'private-beta',
    'No public installer', 'Static resolution', 'not automatically uploaded']) {
    assert.ok(page.toLowerCase().includes(phrase.toLowerCase()), 'Missing disclosure: '+phrase);
  }
  assert.ok(!/npx\s+vibesane|npm\s+install\s+-g\s+vibesane/.test(page));
  assert.ok(!/href="[^"]*\.tgz"/.test(page));
});

test('SEO build generates AgentShield static metadata route', async () => {
  const doc = await read('artifacts/vibeguard/dist/public/agentshield/index.html');
  assert.match(doc, /<title>AgentShield for Claude Code \| VibeSane<\/title>/);
  assert.match(doc, /https:\/\/vibesane\.app\/agentshield/);
});

test('existing GitHub scan API and auth/rate limits are preserved', async () => {
  const routes = await read('artifacts/api-server/src/routes/scans.ts');
  for (const term of ['scanRepositoryViaApi', 'runExtendedSecurityChecksV2',
    'optionalAuth', 'ensurePlanForUser', 'rateLimit', '/scans']) assert.ok(routes.includes(term));
});

test('current Claude Stop protocol is used without a permission bypass', async () => {
  const controller = await read('artifacts/api-server/scripts/agentshield-controller.mjs');
  assert.match(controller, /decision: 'block', reason:/);
  assert.match(controller, /event\.stop_hook_active/);
  assert.doesNotMatch(controller, /dangerously-skip-permissions|--permission-mode\s+bypassPermissions/);
});

test('local scanner handles a synthetic credential with redacted findings', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agentshield-w5-'));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await exec('git', ['init', '-q', dir]);
  await mkdir(path.join(dir,'src'));
  const fake='W'.repeat(36);
  await writeFile(path.join(dir,'src/jwt.ts'), 'const JWT_SECRET = "'+fake+'";');
  let out;
  try { out=await exec(process.execPath,[scanner, 'scan', '--changed', '--cwd', dir, '--format', 'json']); }
  catch(e) { assert.equal(e.code,1); out={stdout:e.stdout}; }
  const report=JSON.parse(out.stdout);
  assert.ok(report.findings.some(f=>f.ruleId==='hardcoded_jwt_secret'));
  assert.ok(!out.stdout.includes(fake));
});

test('public beta candidate remains unpublished and disables install scripts', async () => {
  const builder = await read('artifacts/api-server/scripts/package-agentshield-beta.mjs');
  assert.match(builder, /'UNLICENSED'/);
  assert.match(builder, /name:\s*'@vibesane\/foxy'/);
  assert.match(builder, /publishConfig:\s*\{\s*access:\s*'public'/);
  assert.doesNotMatch(builder, /private: true/);
  assert.match(builder, /--ignore-scripts/);
  assert.match(builder, /published:\s*false/);
  assert.doesNotMatch(builder, /npm publish|npm publish --access/);
});

test('nonproduction demo and private-beta review checklist remain available', async () => {
  const checklist = await read('artifacts/api-server/agentshield-beta/RELEASE_CHECKLIST.md');
  const docs = await read('artifacts/api-server/agentshield-beta/README.md');
  assert.match(checklist, /Claude Code/);
  assert.match(checklist, /explicitly approves/);
  assert.match(docs, /No remote telemetry/i);
});
