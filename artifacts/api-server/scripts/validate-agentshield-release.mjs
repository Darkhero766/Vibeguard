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
  'test-agentshield-connect.mjs',
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
  'test-agentshield-jobs.mjs',
  'test-agentshield-adversarial.mjs',
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
  'test-vibesane-checks.mjs',
  'test-vibesane-protection-delta.mjs',
];
const results = [];
function tapFailureDetails(output) {
  const lines = String(output || '').split(/\r?\n/);
  const failures = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^not ok \d+ - /.test(lines[i])) continue;
    const block = [];
    for (let j = i; j < lines.length && j < i + 28; j++) {
      if (j > i && /^(?:not ok \d+ - |ok \d+ - |1\.\.\d+|# tests |# pass |# fail )/.test(lines[j])) break;
      block.push(lines[j].slice(0, 1200));
    }
    failures.push(block.join('\n').slice(0, 5000));
    if (failures.length >= 25) break;
  }
  return failures;
}

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
    const completeOutput = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
    const output = completeOutput.slice(-30_000);
    const tap = completeOutput.match(/# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)[\s\S]*?# cancelled (\d+)[\s\S]*?# skipped (\d+)/);
    let evidence = null;
    if (name === 'source-syntax' || name.includes('accuracy-benchmark') || name === 'offline-package-install-cli-mcp-smoke' || name === 'mcp-stdio-integration-smoke') {
      try { evidence = JSON.parse(stdout); } catch { evidence = { parseError: 'Command output was not valid JSON.' }; }
    }
    const item = {
      name, status: 'passed', exitCode: 0, durationMs: Date.now() - started,
      ...(tap ? { tests: Number(tap[1]), passed: Number(tap[2]), failed: Number(tap[3]),
        cancelled: Number(tap[4]), skipped: Number(tap[5]) } : {}),
      ...(name === 'unit-integration-regression' ? { failedTests: tapFailureDetails(completeOutput) } : {}),
      ...(evidence ? { evidence } : {}),
      output: output.slice(-8_000),
    };
    results.push(item);
    return item;
  } catch (error) {
    const stdout = String(error?.stdout || '');
    const stderr = String(error?.stderr || error?.message || '');
    const completeOutput = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
    const output = completeOutput.slice(-30_000);
    const tap = completeOutput.match(/# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)[\s\S]*?# cancelled (\d+)[\s\S]*?# skipped (\d+)/);
    const item = {
      name, status: 'failed', exitCode: Number.isInteger(error?.code) ? error.code : 1,
      durationMs: Date.now() - started,
      ...(tap ? { tests: Number(tap[1]), passed: Number(tap[2]), failed: Number(tap[3]),
        cancelled: Number(tap[4]), skipped: Number(tap[5]) } : {}),
      ...(name === 'unit-integration-regression' ? { failedTests: tapFailureDetails(completeOutput) } : {}),
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
  const syntax = await runStep('source-syntax', process.execPath,
    [path.join(scriptsDir, 'check-agentshield-source-syntax.mjs')]);
  const build = syntax.status === 'passed'
    ? await runStep('build-scanner', process.execPath, [path.join(scriptsDir, 'build-agentshield.mjs')])
    : { name: 'build-scanner', status: 'skipped', reason: 'Source syntax validation failed.' };
  if (build.status === 'skipped') results.push(build);
  if (build.status === 'passed') {
    await runStep('unit-integration-regression', process.execPath,
      ['--test', '--test-reporter=tap', ...TEST_FILES.map(file => path.join(scriptsDir, file))]);
    await runStep('mcp-stdio-integration-smoke', process.execPath,
      [path.join(scriptsDir, 'test-agentshield-mcp-smoke.mjs')], { timeout: 300_000 });
    await runStep('curated-accuracy-benchmark', process.execPath,
      [path.join(scriptsDir, 'benchmark-agentshield-accuracy.mjs')]);
    await runStep('holdout-accuracy-benchmark', process.execPath,
      [path.join(scriptsDir, 'benchmark-agentshield-accuracy.mjs'), '--holdout']);
    await runStep('additional-adversarial-accuracy-benchmark', process.execPath,
      [path.join(scriptsDir, 'benchmark-agentshield-adversarial.mjs')]);
    await runStep('offline-package-install-cli-mcp-smoke', process.execPath,
      [path.join(scriptsDir, 'test-agentshield-package.mjs')]);
  } else {
    for (const name of ['unit-integration-regression', 'mcp-stdio-integration-smoke', 'curated-accuracy-benchmark',
      'holdout-accuracy-benchmark', 'offline-package-install-cli-mcp-smoke']) {
      results.push({ name, status: 'skipped', reason: 'Scanner build failed; dependent validation cannot run.' });
    }
  }

  const failed = results.filter(item => item.status === 'failed');
  const skipped = results.filter(item => item.status === 'skipped');
  const benchmarkItems = results.filter(item => item.name.includes('accuracy-benchmark'));
  const curatedBenchmark = benchmarkItems.find(item => item.name === 'curated-accuracy-benchmark');
  const holdoutBenchmark = benchmarkItems.find(item => item.name === 'holdout-accuracy-benchmark');
  const additionalBenchmark = benchmarkItems.find(item => item.name === 'additional-adversarial-accuracy-benchmark');
  const benchmarkEvidenceValid = Boolean(
    curatedBenchmark?.status === 'passed'
      && curatedBenchmark.evidence?.benchmarkType === 'synthetic_labeled_target_rule_curated'
      && Number.isInteger(curatedBenchmark.evidence?.totalCases)
      && curatedBenchmark.evidence.totalCases >= 120
      && curatedBenchmark.evidence.categoryCount >= 12
      && curatedBenchmark.evidence.categoryResultsMet === true
      && Object.values(curatedBenchmark.evidence.categories || {}).every(category =>
        category.total >= 10 && category.tp + category.fn >= 5 && category.tn + category.fp >= 5)
      && curatedBenchmark.evidence?.targetsMet === true
      && holdoutBenchmark?.status === 'passed'
      && holdoutBenchmark.evidence?.benchmarkType === 'synthetic_labeled_target_rule_holdout'
      && Number.isInteger(holdoutBenchmark.evidence?.totalCases)
      && holdoutBenchmark.evidence.totalCases >= 24
      && holdoutBenchmark.evidence.categoryCount >= 6
      && holdoutBenchmark.evidence.categoryResultsMet === true
      && Object.values(holdoutBenchmark.evidence.categories || {}).every(category =>
        category.total >= 4 && category.tp + category.fn >= 2 && category.tn + category.fp >= 2)
      && holdoutBenchmark.evidence?.targetsMet === true
  );
  const additionalBenchmarkValid = Boolean(
    additionalBenchmark?.status === 'passed'
      && additionalBenchmark.evidence?.benchmarkType === 'synthetic_labeled_target_rule_additional_adversarial'
      && Number.isInteger(additionalBenchmark.evidence?.totalCases)
      && additionalBenchmark.evidence.totalCases >= 20
      && additionalBenchmark.evidence.categoryCount >= 6
      && ['tp', 'tn', 'fp', 'fn'].every(key => Number.isInteger(additionalBenchmark.evidence?.results?.[key]))
      && additionalBenchmark.evidence.results.tp + additionalBenchmark.evidence.results.tn
        + additionalBenchmark.evidence.results.fp + additionalBenchmark.evidence.results.fn
        === additionalBenchmark.evidence.totalCases
  );
  const benchmarkTargetsMet = benchmarkItems.length === 3 && benchmarkEvidenceValid && additionalBenchmarkValid;
  const syntaxStep = results.find(item => item.name === 'source-syntax');
  const syntaxEvidenceValid = Boolean(syntaxStep && syntaxStep.status === 'passed'
    && syntaxStep.evidence?.status === 'syntax_passed'
    && Number.isInteger(syntaxStep.evidence?.checkedFiles)
    && syntaxStep.evidence.checkedFiles >= 46
    && syntaxStep.evidence.passedFiles === syntaxStep.evidence.checkedFiles
    && syntaxStep.evidence.fingerprintedSourceInputs >= 6
    && syntaxStep.evidence.missingSourceInputs?.length === 0
    && ['src/lib/apiScanner.ts', 'src/lib/extendedScannerV2.ts', 'scripts/agentshield-accuracy-corpus.mjs', 'scripts/agentshield-holdout-corpus.mjs', 'package.json', 'skills/vibesane-agentshield/SKILL.md']
      .every(file => syntaxStep.evidence.sourceInputs?.some(input => input.file === file && input.status === 'fingerprinted'))
    && /^[a-f0-9]{64}$/.test(syntaxStep.evidence?.sourceSha256 || ''));
  const testSuite = results.find(item => item.name === 'unit-integration-regression');
  const testSuiteValid = Boolean(testSuite && testSuite.status === 'passed'
    && Number.isInteger(testSuite.tests) && testSuite.tests > 0
    && testSuite.passed === testSuite.tests
    && testSuite.failed === 0 && testSuite.cancelled === 0 && testSuite.skipped === 0);
  const mcpSmokeStep = results.find(item => item.name === 'mcp-stdio-integration-smoke');
  const mcpSmokeValid = Boolean(mcpSmokeStep?.status === 'passed'
    && mcpSmokeStep.evidence?.status === 'passed'
    && mcpSmokeStep.evidence?.protocol === '2026-07-28'
    && Number.isInteger(mcpSmokeStep.evidence?.tools) && mcpSmokeStep.evidence.tools >= 10);
  const packageStep = results.find(item => item.name === 'offline-package-install-cli-mcp-smoke');
  const expectedPackageChecks = [
    'build', 'npm-pack-manifest', 'isolated-offline-install', 'cli-help', 'doctor',
    'one-command-agent-connect',
    'one-command-agent-disconnect',
    'mcp-doctor-valid-config', 'mcp-doctor-malformed-config-denial', 'codex-init-hook',
    'synthetic-committed-scan', 'codex-stop-block', 'codex-stop-remediation',
    'mcp-modern-protocol', 'mcp-tools-list', 'mcp-status', 'mcp-scan',
    'mcp-baseline-tools', 'mcp-explain-finding', 'mcp-workspace-boundary',
    'mcp-queue-saturation', 'mcp-queued-cancellation', 'mcp-invalid-tool-arguments',
    'codex-uninstall',
  ];
  const packageEvidenceValid = Boolean(packageStep && packageStep.status === 'passed'
    && packageStep.evidence?.status === 'package_smoke_passed'
    && packageStep.evidence?.version === '0.7.0-beta.4'
    && packageStep.evidence?.published === false
    && Number.isSafeInteger(packageStep.evidence?.packageBytes) && packageStep.evidence.packageBytes > 0
    && Number.isSafeInteger(packageStep.evidence?.packagedFiles) && packageStep.evidence.packagedFiles >= 20
    && expectedPackageChecks.every(name => packageStep.evidence?.checks?.includes(name))
    && /^[a-f0-9]{64}$/.test(packageStep.evidence?.packageSha256 || ''));
  const gitRevision = await revision();
  const revisionValid = /^[a-f0-9]{40}$/.test(gitRevision || '');
  const allStepsPassed = results.every(item => item.status === 'passed');
  const qualificationFailures = [
    ...(!allStepsPassed ? ['one_or_more_required_commands_failed_or_were_skipped'] : []),
    ...(!syntaxEvidenceValid ? ['source_syntax_or_source_fingerprint_evidence_missing'] : []),
    ...(!testSuiteValid ? ['regression_suite_missing_tap_counts_failed_cancelled_or_skipped_tests'] : []),
    ...(!mcpSmokeValid ? ['real_stdio_mcp_integration_smoke_missing_or_failed'] : []),
    ...(!benchmarkEvidenceValid ? ['curated_or_holdout_benchmark_evidence_missing_or_below_threshold'] : []),
    ...(!additionalBenchmarkValid ? ['additional_adversarial_benchmark_evidence_missing_or_malformed'] : []),
    ...(!packageEvidenceValid ? ['offline_package_install_smoke_or_sha256_evidence_missing'] : []),
    ...(!revisionValid ? ['source_git_revision_unavailable_or_invalid'] : []),
  ];
  const allRequiredPassed = qualificationFailures.length === 0;
  const report = {
    schemaVersion: 1,
    product: 'VibeSane Foxy (AgentShield runtime)',
    qualificationName: 'Foxy qualification',
    packageVersion: '0.7.0-beta.4',
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
    benchmarkEvidenceValid,
    additionalBenchmarkValid,
    syntaxEvidenceValid,
    testSuiteValid,
    mcpSmokeValid,
    packageEvidenceValid,
    qualificationFailures,
    failedSteps: failed.map(item => item.name),
    skippedSteps: skipped.map(item => item.name),
    steps: results,
    limitations: [
      'Passing this runner is not a security certification or proof of application-wide security.',
      'Claude Code and Codex Stop responses are host-level continuation controls; they can be bypassed by changing project policy, disabling/untrusting hooks or interrupting the host.',
      'Cursor uses followup_message continuation; none of the integrations is tamper-proof or an immutable delivery lock.',
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
    benchmarkEvidenceValid,
    additionalBenchmarkValid,
    syntaxEvidenceValid,
    testSuiteValid,
    packageEvidenceValid,
    qualificationFailures,
    failedSteps: report.failedSteps,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (report.status !== 'validation_passed_review_required') process.exitCode = 1;
}
main().catch(error => {
  process.stderr.write('AgentShield release validation runner failed: ' + String(error?.message || error) + '\n');
  process.exitCode = 2;
});
