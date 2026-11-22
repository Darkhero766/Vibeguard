#!/usr/bin/env node
// Reproducible local AgentShield release qualification. Never uses GitHub Actions.
// Tests run only against synthetic/local fixtures; package smoke uses a disposable install prefix.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const dist = path.join(root, 'dist');
const reportPath = path.join(dist, 'agentshield-release-validation.json');
const TEST_FILES = [
  'test-agentshield.mjs',
  'test-agentshield-week2.mjs',
  'test-agentshield-week3.mjs',
  'test-agentshield-week4.mjs',
  'test-agentshield-week5.mjs',
  'test-agentshield-hybrid.mjs',
  'test-agentshield-ast.mjs',
  'test-agentshield-taint.mjs',
  'test-agentshield-release.mjs',
  'test-agentshield-models.mjs',
  'test-scan-score.mjs',
  'test-agentshield-mcp.mjs',
  'test-agentshield-python.mjs',
  'test-agentshield-gate.mjs',
  'test-agentshield-sarif.mjs',
  'test-agentshield-baselines.mjs',
  'test-agentshield-phase12.mjs',
  'test-agentshield-crossfile.mjs',
  'test-agentshield-route-auth.mjs',
  'test-agentshield-supabase-policy.mjs',
  'test-agentshield-auth-regression.mjs',
  'test-vibesane-sql-context.mjs',
  'test-phase1-github-http-contract.mjs',
  'test-phase1-crypto.mjs',
  'test-phase1-dodo-environment.mjs',
  'test-phase1-dodo-signature.mjs',
  'test-phase1-dodo-sync-http.mjs',
  'test-staging-access.mjs',
  'test-phase1-dodo-webhook-retry.mjs',
  'test-phase1-github-installation-ownership.mjs',
  'test-password-storage-scanner.mjs',
  'test-public-scan-allowance-http.mjs',
  'test-scan-failure-isolation-http.mjs',
  'test-phase1-github-oauth-handoff.mjs',
  'test-scan-repository-url-http.mjs',
  'test-vibesane-v2-context.mjs',
  'test-phase1-staging-isolation.mjs',
  'test-vibesane-checks.mjs',
];
const results = [];
const env = {
  ...process.env,
  NODE_OPTIONS: '',
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_offline: 'true',
};

async function runStep(name, program, args, { cwd = root, timeout = 900_000 } = {}) {
  const started = Date.now();
  try {
    const { stdout = '', stderr = '' } = await exec(program, args, {
      cwd, env, timeout, maxBuffer: 12_000_000, windowsHide: true,
    });
    const output = (stdout + (stderr ? '\n[stderr]\n' + stderr : '')).slice(-30_000);
    const tap = output.match(/# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)/);
    let evidence = null;
    if (name.includes('accuracy-benchmark') || name === 'offline-package-install-cli-mcp-smoke') {
      try { evidence = JSON.parse(stdout); } catch { evidence = { parseError: 'Command output was not valid JSON.' }; }
    }
    const item = {
      name, status: 'passed', exitCode: 0, durationMs: Date.now() - started,
      ...(tap ? { tests: Number(tap[1]), passed: Number(tap[2]), failed: Number(tap[3]) } : {}),
      ...(evidence ? { evidence } : {}),
      output: output.slice(-8_000),
    };
    results.push(item);
    return item;
  } catch (error) {
    const stdout = String(error?.stdout || '');
    const stderr = String(error?.stderr || error?.message || '');
    const output = (stdout + (stderr ? '\n[stderr]\n' + stderr : '')).slice(-30_000);
    const tap = output.match(/# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)/);
    const item = {
      name, status: 'failed', exitCode: Number.isInteger(error?.code) ? error.code : 1,
      durationMs: Date.now() - started,
      ...(tap ? { tests: Number(tap[1]), passed: Number(tap[2]), failed: Number(tap[3]) } : {}),
      output,
    };
    results.push(item);
    return item;
  }
}

async function revision() {
  try {
    const { stdout } = await exec('git', ['rev-parse', 'HEAD'], { cwd: root, env, timeout: 5000 });
    return stdout.trim();
  } catch { return null; }
}
async function main() {
  const build = await runStep('build-scanner', process.execPath, [path.join(scriptsDir, 'build-agentshield.mjs')]);
  if (build.status === 'passed') {
    await runStep('unit-integration-regression', process.execPath,
      ['--test', ...TEST_FILES.map(file => path.join(scriptsDir, file))]);
    await runStep('curated-accuracy-benchmark', process.execPath,
      [path.join(scriptsDir, 'benchmark-agentshield-accuracy.mjs')]);
    await runStep('holdout-accuracy-benchmark', process.execPath,
      [path.join(scriptsDir, 'benchmark-agentshield-accuracy.mjs'), '--holdout']);
    await runStep('offline-package-install-cli-mcp-smoke', process.execPath,
      [path.join(scriptsDir, 'test-agentshield-package.mjs')]);
  } else {
    for (const name of ['unit-integration-regression', 'curated-accuracy-benchmark',
      'holdout-accuracy-benchmark', 'offline-package-install-cli-mcp-smoke']) {
      results.push({ name, status: 'skipped', reason: 'Scanner build failed; dependent validation cannot run.' });
    }
  }

  const failed = results.filter(item => item.status === 'failed');
  const skipped = results.filter(item => item.status === 'skipped');
  const benchmarkItems = results.filter(item => item.name.includes('accuracy-benchmark'));
  const benchmarkTargetsMet = benchmarkItems.length === 2 && benchmarkItems.every(item =>
    item.status === 'passed' && item.evidence?.targetsMet === true);
  const testSuite = results.find(item => item.name === 'unit-integration-regression');
  const testSuiteValid = Boolean(testSuite && testSuite.status === 'passed'
    && Number.isInteger(testSuite.tests) && testSuite.tests > 0 && testSuite.failed === 0);
  const packageStep = results.find(item => item.name === 'offline-package-install-cli-mcp-smoke');
  const packageEvidenceValid = Boolean(packageStep && packageStep.status === 'passed'
    && packageStep.evidence?.status === 'package_smoke_passed'
    && packageStep.evidence?.version === '0.7.0-beta.3'
    && /^[a-f0-9]{64}$/.test(packageStep.evidence?.packageSha256 || ''));
  const gitRevision = await revision();
  const revisionValid = /^[a-f0-9]{40}$/.test(gitRevision || '');
  const allRequiredPassed = results.every(item => item.status === 'passed')
    && testSuiteValid && packageEvidenceValid && revisionValid;
  const report = {
    schemaVersion: 1,
    product: 'VibeSane AgentShield',
    packageVersion: '0.7.0-beta.3',
    status: allRequiredPassed && benchmarkTargetsMet ? 'validation_passed_review_required' : 'not_qualified',
    releaseDecision: allRequiredPassed && benchmarkTargetsMet
      ? 'candidate_for_independent_human_review'
      : 'do_not_distribute',
    createdAt: new Date().toISOString(),
    gitRevision,
    revisionValid,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    githubActionsUsed: false,
    productionTouched: false,
    syntheticFixturesOnly: true,
    benchmarkTargetsMet,
    testSuiteValid,
    packageEvidenceValid,
    failedSteps: failed.map(item => item.name),
    skippedSteps: skipped.map(item => item.name),
    steps: results,
    limitations: [
      'Passing this runner is not a security certification or proof of application-wide security.',
      'Claude Code Stop enforcement is host-level and remains bypassable by changing project policy or interrupting the host.',
      'Codex MCP/skill and Cursor follow-up integrations are not equivalent to a hard delivery gate.',
      'Manual acceptance in actual Codex, Claude Code and Cursor versions is still required.',
      'Release branch dependency consolidation and independent human review are still required.',
    ],
  };
  await mkdir(dist, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const summary = {
    status: report.status,
    releaseDecision: report.releaseDecision,
    reportPath,
    gitRevision: report.gitRevision,
    revisionValid,
    steps: results.map(({ name, status, tests, passed, failed: testFailed }) => ({
      name, status, tests, passed, failed: testFailed,
    })),
    benchmarkTargetsMet,
    testSuiteValid,
    packageEvidenceValid,
    failedSteps: report.failedSteps,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (report.status !== 'validation_passed_review_required') process.exitCode = 1;
}
main().catch(error => {
  process.stderr.write('AgentShield release validation runner failed: ' + String(error?.message || error) + '\n');
  process.exitCode = 2;
});
