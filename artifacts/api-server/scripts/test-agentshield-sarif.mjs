import test from 'node:test';
import assert from 'node:assert/strict';
import { toSarif } from './agentshield-sarif.mjs';

test('serializes normalized findings to SARIF 2.1.0 without source snippets', () => {
  const result = toSarif({
    status: 'complete',
    filesScanned: 1,
    findings: [{
      ruleId: 'python_shell_injection',
      severity: 'High',
      confidence: 'medium',
      engine: 'python_heuristics',
      title: 'Potential command injection',
      description: 'A request-shaped value reaches shell execution.',
      recommendation: 'Use argv with shell=False.',
      filePath: 'src/export.py',
      line: 12,
      sourceExcerpt: 'RAW_SECRET_SHOULD_NOT_APPEAR',
    }],
  });
  assert.equal(result.version, '2.1.0');
  assert.equal(result.runs[0].tool.driver.name, 'VibeSane AgentShield');
  assert.equal(result.runs[0].results.length, 1);
  assert.equal(result.runs[0].results[0].level, 'error');
  assert.equal(result.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, 'src/export.py');
  assert.equal(result.runs[0].results[0].locations[0].physicalLocation.region.startLine, 12);
  assert.equal(result.runs[0].results[0].properties.confidence, 'medium');
  assert.equal(JSON.stringify(result).includes('RAW_SECRET_SHOULD_NOT_APPEAR'), false);
});

test('partial coverage is explicitly unsuccessful, even when no findings were returned', () => {
  const result = toSarif({
    status: 'partial_coverage',
    filesScanned: 1,
    unsupportedChangedFileCount: 2,
    coverage: 'Unsupported Python and Go changes remain.',
    findings: [],
  });
  assert.equal(result.runs[0].invocations[0].executionSuccessful, false);
  assert.equal(result.runs[0].invocations[0].properties.status, 'partial_coverage');
  assert.equal(result.runs[0].invocations[0].properties.unsupportedChangedFileCount, 2);
  assert.match(result.runs[0].invocations[0].toolExecutionNotifications[0].message.text, /Unsupported/);
});

test('rejects absolute and parent-traversing paths', () => {
  const result = toSarif({
    status: 'complete',
    findings: [
      { ruleId: 'x', filePath: '/etc/passwd', line: 1, severity: 'High' },
      { ruleId: 'y', filePath: '../outside.js', line: 1, severity: 'High' },
      { ruleId: 'z', filePath: 'src/space name.js', line: 1, severity: 'Medium' },
    ],
  });
  assert.equal(result.runs[0].results.length, 1);
  assert.equal(result.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, 'src/space%20name.js');
});
