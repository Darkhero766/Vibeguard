#!/usr/bin/env node
// Local syntax gate for AgentShield release qualification. No network or GitHub Actions.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const FILES = [
  'scripts/check-agentshield-source-syntax.mjs',
  'scripts/agentshield-cli.mjs',
  'scripts/agentshield-gate.mjs',
  'scripts/agentshield-policy.mjs',
  'scripts/agentshield-controller.mjs',
  'scripts/agentshield-mcp-server.mjs',
  'scripts/agentshield-cursor-stop.mjs',
  'scripts/agentshield-stop.mjs',
  'scripts/agentshield-codex-stop.mjs',
  'scripts/vibesane.mjs',
  'scripts/agentshield-baselines.mjs',
  'scripts/agentshield-python.mjs',
  'scripts/agentshield-sarif.mjs',
  'scripts/package-agentshield-beta.mjs',
  'scripts/benchmark-agentshield-accuracy.mjs',
  'scripts/validate-agentshield-release.mjs',
  'scripts/test-agentshield.mjs',
  'scripts/test-agentshield-gate.mjs',
  'scripts/test-agentshield-mcp.mjs',
  'scripts/test-agentshield-package.mjs',
];

// TypeScript scanner inputs are bundled by esbuild rather than node --check,
// but must still be included in source provenance. Also fingerprint the package
// manifest and installed agent skill because they define the delivered artifact.
const SOURCE_INPUTS = [
  'src/lib/apiScanner.ts',
  'src/lib/extendedScannerV2.ts',
  'package.json',
  'skills/vibesane-agentshield/SKILL.md',
];

const checks = [];
const digest = createHash('sha256');
for (const relative of FILES) {
  const file = path.join(root, relative);
  try {
    const bytes = await readFile(file);
    digest.update(relative);
    digest.update('\0');
    digest.update(bytes);
    await exec(process.execPath, ['--check', file], {
      cwd: root, timeout: 15_000, maxBuffer: 100_000, windowsHide: true,
    });
    checks.push({ file: relative, status: 'passed' });
  } catch (error) {
    checks.push({
      file: relative,
      status: 'failed',
      error: String(error?.stderr || error?.message || error).slice(0, 1200),
    });
  }
}
const sourceInputs = [];
for (const relative of SOURCE_INPUTS) {
  try {
    const bytes = await readFile(path.join(root, relative));
    digest.update(relative);
    digest.update('\0');
    digest.update(bytes);
    sourceInputs.push({ file: relative, status: 'fingerprinted', bytes: bytes.byteLength });
  } catch (error) {
    sourceInputs.push({ file: relative, status: 'missing', error: String(error?.message || error).slice(0, 500) });
  }
}
const failed = checks.filter(item => item.status !== 'passed');
const missingInputs = sourceInputs.filter(item => item.status !== 'fingerprinted');
const report = {
  status: failed.length || missingInputs.length ? 'syntax_failed' : 'syntax_passed',
  checkedFiles: checks.length,
  fingerprintedSourceInputs: sourceInputs.filter(item => item.status === 'fingerprinted').length,
  missingSourceInputs: missingInputs.map(item => item.file),
  sourceInputs,
  passedFiles: checks.length - failed.length,
  failedFiles: failed.map(item => item.file),
  sourceSha256: digest.digest('hex'),
  nodeVersion: process.version,
  platform: process.platform,
  checks,
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
