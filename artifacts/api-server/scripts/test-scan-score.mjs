import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(dir, '../../vibeguard/src/lib/scanScore.ts');
const built = await build({
  entryPoints: [entry], bundle: true, write: false, format: 'esm',
  platform: 'node', logLevel: 'silent',
});
const { getHeuristicScanScore } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].contents).toString('base64')
);

test('heuristic score uses stable severity penalties and deduplicates the same location', () => {
  assert.equal(getHeuristicScanScore([], 54), 100);
  assert.equal(getHeuristicScanScore([{ severity: 'Critical', check: 'jwt', filePath: 'src/a.ts', line: 2 }], 54), 82);
  assert.equal(getHeuristicScanScore([
    { severity: 'High', check: 'rls', filePath: 'migrations/1.sql', line: 4 },
    { severity: 'High', check: 'rls', filePath: 'migrations/1.sql', line: 4 },
    { severity: 'Medium', check: 'http', filePath: 'src/a.ts', line: 9 },
  ], 54), 86);
  assert.equal(getHeuristicScanScore([
    { severity: 'Critical', filePath: 'a', line: 1 },
    { severity: 'Critical', filePath: 'b', line: 1 },
  ], 54), 64);
  assert.equal(getHeuristicScanScore([{ severity: 'Critical', filePath: 'a', line: 1 }], undefined), null);
  assert.equal(getHeuristicScanScore([{ severity: 'Critical', filePath: 'a', line: 1 }], 0), null);
});

test('many Critical findings clamp the indicator to zero', () => {
  const findings = Array.from({ length: 10 }, (_, i) => ({
    severity: 'Critical', filePath: 'f' + i, line: i,
  }));
  assert.equal(getHeuristicScanScore(findings, 54), 0);
});
