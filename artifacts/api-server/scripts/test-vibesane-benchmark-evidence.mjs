import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findingKey, validateManifest, scoreEvidence } from './vibesane-benchmark-evidence.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const pin = 'a'.repeat(40);
const rulePin = 'b'.repeat(40);
const baseProject = {
  repo: 'example/project', commit: pin, license: 'MIT',
  sourceType: 'unlabeled_general', coverageMode: 'whole_repo',
};
const finding = (ruleId, filePath, line, severity = 'High') =>
  ({ ruleId, filePath, line, severity });
const verdict = (f, result) => ({
  ruleId: f.ruleId, filePath: f.filePath, line: f.line,
  verdict: result, reviewer: 'reviewer-A',
  evidence: 'Reviewed the exact source and execution context for this rule.',
});
const target = (f, startLine = f.line, endLine = f.line) => ({
  ruleId: f.ruleId, filePath: f.filePath, startLine, endLine,
  reviewer: 'reviewer-B', evidence: 'Curated from a separately reviewed source target.',
});

function fixture() {
  const entries = [
    finding('eval_usage', 'src/a.js', 30),
    finding('database_url', 'src/b.js', 20, 'Critical'),
    finding('cookie_missing_httponly', 'src/c.js', 80, 'Medium'),
    finding('open_redirect', 'src/d.js', 44),
    finding('weak_random', 'src/e.js', 1, 'Medium'),
  ];
  return {
    manifest: { schemaVersion: 1, projects: [{ ...baseProject }] },
    scans: { schemaVersion: 1, projects: [{
      repo: baseProject.repo, commit: pin, rulesetCommit: rulePin,
      status: 'complete', engine: 'extended_v2', filesScanned: 11,
      durationMs: 432, findings: entries,
    }] },
    reviews: { schemaVersion: 1, projects: [{
      repo: baseProject.repo, commit: pin,
      adjudications: [
        verdict(entries[0], 'true_positive'),
        verdict(entries[1], 'false_positive'),
        verdict(entries[2], 'uncertain'),
        verdict(entries[3], 'duplicate'),
      ],
      expectedTargets: [target(entries[0]), target(finding('open_redirect', 'src/d.js', 99))],
    }] },
  };
}

test('five real public-pilot source entries are schema-valid and pinned', () => {
  const manifest = JSON.parse(readFileSync(path.resolve(root, '../benchmarks/real-world/pilot-manifest.v1.json'), 'utf8'));
  assert.equal(validateManifest(manifest), 5);
  assert.ok(manifest.projects.every(p => /^[a-f0-9]{40}$/i.test(p.commit)));
  assert.ok(manifest.projects.some(p => p.sourceType === 'deliberately_vulnerable'));
  assert.ok(manifest.projects.some(p => p.sourceType === 'unlabeled_general'));
});

test('scoring never treats unreviewed, uncertain or duplicate alerts as false positives', () => {
  const f = fixture();
  const r = scoreEvidence(f.manifest, f.scans, f.reviews);
  assert.equal(r.overall.alerts, 5);
  assert.equal(r.overall.truePositive, 1);
  assert.equal(r.overall.falsePositive, 1);
  assert.equal(r.overall.unreviewed, 1);
  assert.equal(r.overall.uncertain, 1);
  assert.equal(r.overall.duplicate, 1);
  assert.equal(r.overall.reviewedForPrecision, 2);
  assert.equal(r.overall.precision, 0.5);
  assert.equal(r.overall.knownTargets, 2);
  assert.equal(r.overall.detectedTargets, 1);
  assert.equal(r.overall.missedTargets, 1);
  assert.equal(r.overall.recallOnCuratedTargets, 0.5);
  assert.equal(r.byRule.eval_usage.truePositive, 1);
  assert.equal(r.byRule.open_redirect.missedTargets, 1);
  assert.equal(r.bySeverity.Critical.falsePositive, 1);
  assert.equal(r.publicationStatus, 'internal_not_independently_certified');
});

test('unlabeled repository findings cannot manufacture precision or recall', () => {
  const f = fixture();
  f.reviews.projects = [];
  const r = scoreEvidence(f.manifest, f.scans, f.reviews);
  assert.equal(r.overall.alerts, 5);
  assert.equal(r.overall.unreviewed, 5);
  assert.equal(r.overall.precision, null);
  assert.equal(r.overall.recallOnCuratedTargets, null);
});

test('missing scans and failed scans are not scored as clean repositories', () => {
  const f = fixture();
  f.scans.projects = [];
  f.reviews.projects = [];
  let r = scoreEvidence(f.manifest, f.scans, f.reviews);
  assert.equal(r.projects[0].status, 'not_scanned');
  assert.equal(r.overall.alerts, 0);
  f.scans.projects = [fixture().scans.projects[0]];
  f.scans.projects[0].status = 'incomplete';
  r = scoreEvidence(f.manifest, f.scans, f.reviews);
  assert.equal(r.projects[0].status, 'incomplete');
  assert.equal(r.overall.precision, null);
});

test('duplicate scan finding identities fail closed instead of artificially changing precision', () => {
  const f = fixture();
  f.scans.projects[0].findings.push({ ...f.scans.projects[0].findings[0] });
  assert.throws(() => scoreEvidence(f.manifest, f.scans, f.reviews), /Duplicate raw finding/);
});

test('orphan and duplicate reviewer labels fail closed', () => {
  const f = fixture();
  f.reviews.projects[0].adjudications.push(verdict(finding('eval_usage', 'src/missing.js', 3), 'true_positive'));
  assert.throws(() => scoreEvidence(f.manifest, f.scans, f.reviews), /does not match observed/);
  f.reviews.projects[0].adjudications.pop();
  f.reviews.projects[0].adjudications.push({ ...f.reviews.projects[0].adjudications[0] });
  assert.throws(() => scoreEvidence(f.manifest, f.scans, f.reviews), /Duplicate adjudication/);
});

test('review evidence, rule identity and path traversal are strictly validated', () => {
  const f = fixture();
  f.reviews.projects[0].adjudications[0].evidence = 'bad';
  assert.throws(() => scoreEvidence(f.manifest, f.scans, f.reviews), /requires evidence/);
  const g = fixture();
  g.scans.projects[0].findings[0].filePath = '../secret.txt';
  assert.throws(() => scoreEvidence(g.manifest, g.scans, g.reviews), /Invalid finding filePath/);
  assert.throws(() => findingKey({ ruleId: 'bad rule', filePath: 'src/a.js', line: 2 }), /Invalid ruleId/);
});

test('subsets reject findings and targets outside declared files', () => {
  const f = fixture();
  f.manifest.projects[0].coverageMode = 'bounded_subset';
  f.manifest.projects[0].paths = ['src/a.js'];
  assert.throws(() => scoreEvidence(f.manifest, f.scans, f.reviews), /outside declared path subset/);
});

test('manifest requires 40-character pins, reviewed license and no duplicate projects', () => {
  const f = fixture();
  f.manifest.projects[0].commit = 'HEAD';
  assert.throws(() => validateManifest(f.manifest), /pinned 40-character/);
  f.manifest.projects[0].commit = pin;
  f.manifest.projects[0].license = 'NOASSERTION';
  assert.throws(() => validateManifest(f.manifest), /License must be reviewed/);
  f.manifest.projects[0].license = 'MIT';
  f.manifest.projects.push({ ...f.manifest.projects[0] });
  assert.throws(() => validateManifest(f.manifest), /Duplicate manifest project/);
});

test('unrecognized data and unverifiable target ranges fail closed', () => {
  const f = fixture();
  f.reviews.projects[0].expectedTargets[0].endLine = 0;
  assert.throws(() => scoreEvidence(f.manifest, f.scans, f.reviews), /Invalid curated target line range/);
  f.reviews.projects[0].expectedTargets[0].endLine = 30;
  f.scans.projects[0].rulesetCommit = 'latest';
  assert.throws(() => scoreEvidence(f.manifest, f.scans, f.reviews), /ruleset commit/);
  f.scans.projects[0].rulesetCommit = rulePin;
  f.scans.projects[0].status = 'incomplete';
  assert.throws(() => scoreEvidence(f.manifest, f.scans, f.reviews), /Incomplete scan cannot be scored/);
});
