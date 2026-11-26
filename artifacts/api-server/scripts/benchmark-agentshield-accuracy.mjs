#!/usr/bin/env node
// Deterministic labeled fixture benchmark. No arbitrary project code execution.
import { BENCHMARK_CASES } from './agentshield-accuracy-corpus.mjs';
import { HOLDOUT_CASES } from './agentshield-holdout-corpus.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const exec = promisify(execFile);
const scanCLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/agentshield.mjs');
function rates(c) {
  const total = c.tp + c.tn + c.fp + c.fn;
  return { ...c, total,
    precision: c.tp + c.fp ? c.tp / (c.tp + c.fp) : null,
    recall: c.tp + c.fn ? c.tp / (c.tp + c.fn) : null,
    falsePositiveRate: c.fp + c.tn ? c.fp / (c.fp + c.tn) : null,
    accuracy: total ? (c.tp + c.tn) / total : null };
}
function fresh() { return { tp: 0, tn: 0, fp: 0, fn: 0 }; }
export async function benchmark({ cases = BENCHMARK_CASES, kind = 'curated' } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'vibesane-accuracy-'));
  const start = performance.now();
  const totals = fresh(), categories = {}, misses = [];
  let offTargetFindings = 0;
  try {
    await exec('git', ['init', '-q', root], { timeout: 5000 });
    for (const tc of cases) {
      const target = path.join(root, tc.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, tc.content, { mode: 0o600 });
      let result;
      try {
        result = await exec(process.execPath, [scanCLI, 'scan', '--file', target,
          '--cwd', root, '--format', 'json'], { timeout: 12000, maxBuffer: 1_500_000,
          windowsHide: true, env: { ...process.env, NODE_OPTIONS: '' } });
      } catch (e) {
        if (e?.code !== 1 || typeof e.stdout !== 'string') {
          const detail = String(e?.stderr || e?.message || 'unknown scanner error').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 320);
          throw new Error('Scanner failed while evaluating case ' + tc.id + ' (exit=' + String(e?.code ?? 'unknown') + '): ' + detail);
        }
        result = { stdout: e.stdout };
      }
      let report;
      try { report = JSON.parse(result.stdout); }
      catch { throw new Error('Scanner produced invalid JSON on ' + tc.id); }
      if (report.status !== 'complete' || report.filesScanned !== 1) throw new Error('Incomplete scan: ' + tc.id);
      const actual = report.findings.some(f => f.ruleId === tc.ruleId);
      offTargetFindings += report.findings.filter(f => f.ruleId !== tc.ruleId).length;
      const bucket = tc.expected ? (actual ? 'tp' : 'fn') : (actual ? 'fp' : 'tn');
      totals[bucket] += 1;
      const cat = categories[tc.category] ||= fresh();
      cat[bucket] += 1;
      if (bucket === 'fn' || bucket === 'fp') {
        misses.push({ caseId: tc.id, category: tc.category, ruleId: tc.ruleId,
          expected: tc.expected, detected: actual, errorType: bucket, rationale: tc.rationale });
      }
    }
    const minimums = kind === 'holdout'
      ? { cases: 24, categories: 6, perCategory: 4, positivesPerCategory: 2, negativesPerCategory: 2 }
      : kind === 'curated'
        ? { cases: 120, categories: 12, perCategory: 10, positivesPerCategory: 5, negativesPerCategory: 5 }
        : null;
    if (!cases.length) throw new Error('Benchmark corpus must contain at least one case.');
    if (minimums && cases.length < minimums.cases) throw new Error('Benchmark corpus is below its required minimum case count.');
    const categoryEntries = Object.entries(categories);
    if (minimums) {
      if (categoryEntries.length < minimums.categories) throw new Error('Benchmark corpus is missing required category coverage.');
      for (const [category, counts] of categoryEntries) {
        const positives = counts.tp + counts.fn;
        const negatives = counts.tn + counts.fp;
        if (positives < minimums.positivesPerCategory || negatives < minimums.negativesPerCategory
          || positives + negatives < minimums.perCategory) {
          throw new Error('Benchmark category has insufficient positive/negative challenge cases: ' + category);
        }
      }
    }
    const categoryResults = Object.fromEntries(
      Object.entries(categories).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, rates(v)]));
    const overall = rates(totals);
    // Per-family floors prevent a strong detector from hiding a completely missed rule family.
    const categoryTargets = kind === 'holdout'
      ? { precision: 0.5, recall: 0.5 }
      : { precision: 0.6, recall: 0.6 };
    const categoryResultsMet = Object.values(categoryResults).every(result =>
      (result.precision ?? 0) >= categoryTargets.precision
      && (result.recall ?? 0) >= categoryTargets.recall);
    const overallTargetsMet = (overall.precision ?? 0) >= 0.9 && (overall.recall ?? 0) >= 0.85;
    const report = { tool: 'VibeSane AgentShield accuracy benchmark', schemaVersion: 1,
      corpusVersion: kind === 'holdout' ? '2026-11-19-holdout-1' : '2026-11-19-1', benchmarkType: 'synthetic_labeled_target_rule_' + kind,
      labelLimitations: 'Curated heuristic expectations, not independent exploit validation. Each case evaluates only its named target rule; holdout labels are challenge expectations, not exploit proof.',
      totalCases: cases.length, categoryCount: Object.keys(categoryResults).length,
      results: overall, categories: categoryResults,
      categoryCaseCounts: Object.fromEntries(Object.entries(categoryResults).map(([name, result]) => [name, result.total])),
      offTargetFindings, misclassifications: misses, measuredElapsedMs: Math.round(performance.now() - start),
      nodeVersion: process.version, platform: process.platform,
      targets: { precision: 0.9, recall: 0.85, perCategory: categoryTargets },
      overallTargetsMet, categoryResultsMet,
      targetsMet: overallTargetsMet && categoryResultsMet };
    return report;
  } finally { await rm(root, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  benchmark(process.argv.includes('--holdout') ? { cases: HOLDOUT_CASES, kind: 'holdout' } : {})
    .then(r => process.stdout.write(JSON.stringify(r, null, 2) + '\n'))
    .catch(e => { process.stderr.write('Accuracy benchmark failed: ' + e.message + '\n'); process.exitCode = 2; });
}
