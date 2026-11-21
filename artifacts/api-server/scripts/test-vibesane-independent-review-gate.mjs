import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileIndependentReviews } from './vibesane-independent-review-gate.mjs';

const RULESET = 'a'.repeat(40);
const COMMIT = 'b'.repeat(40);
const source = { repo: 'owner/app', commit: COMMIT, license: 'MIT',
  sourceType: 'unlabeled_general', coverageMode: 'bounded_subset',
  paths: ['src/route.ts'] };
const manifest = { schemaVersion: 1, projects: [source] };
const finding = { ruleId: 'open_redirect', filePath: 'src/route.ts', line: 12, severity: 'High' };
const scans = { schemaVersion: 1, projects: [{
  repo: source.repo, commit: COMMIT, rulesetCommit: RULESET,
  status: 'complete', engine: 'api_core_plus_extended_v2',
  filesScanned: 1, scannedFiles: ['src/route.ts'],
  durationMs: 42, coverage: { complete: true },
  findings: [finding],
}] };

const human = id => ({ reviewerId: id, role: 'qualified_human_security_reviewer',
  independentFromScannerTeam: true,
  qualifications: 'Security reviewer with independent source audit experience',
  signedAt: '2026-11-21T10:00:00+05:30' });
function review(id, verdict = 'true_positive', withTarget = true) {
  const result = { schemaVersion: 1, reviewMetadata: human(id), projects: [{
    repo: source.repo, commit: COMMIT,
    adjudications: [{ ...finding, verdict, reviewer: id,
      evidence: 'Verified request query reaches a redirect sink without an allowlist',
      ...(verdict === 'true_positive' ? {
        severityAssessment: 'overstated',
        severityEvidence: 'Authenticated redirect only, reducing severity to medium',
      } : {}) }],
    expectedTargets: withTarget ? [{
      ruleId: 'open_redirect', filePath: 'src/route.ts',
      startLine: 12, endLine: 12, reviewer: id,
      evidence: 'Request-supplied redirect at this precise line is unsafe',
    }] : [],
  }] };
  return result;
}

test('two independent human self-attestations can be reconciled, but are not accuracy certification', () => {
  const report = reconcileIndependentReviews(manifest, scans, review('reviewer-a'), review('reviewer-b'));
  assert.equal(report.structurallyComplete, true);
  assert.equal(report.accuracyVerified, false);
  assert.equal(report.independentIdentityVerified, false);
  assert.equal(report.scoring.overall.precision, 1);
  assert.equal(report.scoring.overall.recallOnCuratedTargets, 1);
  assert.equal(report.reviewCounts.targets, 1);
  assert.equal(report.consensus.projects[0].adjudications[0].reviewer,
    'concordant:reviewer-a+reviewer-b');
});

test('AI-only label cannot silently become independently human reviewed ground truth', () => {
  const a = review('claude-ai');
  a.reviewMetadata.role = 'ai_reviewer';
  assert.throws(() => reconcileIndependentReviews(manifest, scans, a, review('reviewer-b')),
    /qualified human/);
});

test('two copies of the same reviewer cannot satisfy independence', () => {
  assert.throws(() => reconcileIndependentReviews(manifest, scans, review('same-id'), review('same-id')),
    /distinct verified identities/);
});

test('unresolved human verdict conflict fails closed', () => {
  const one = review('reviewer-a');
  const two = review('reviewer-b', 'false_positive', false);
  assert.throws(() => reconcileIndependentReviews(manifest, scans, one, two),
    /Unresolved contradictory/);
});

test('third independent adjudicator cannot override unanimous original verdicts', () => {
  const third = review('third-reviewer');
  assert.throws(() => reconcileIndependentReviews(manifest, scans,
    review('reviewer-a'), review('reviewer-b'), third), /overwrite agreeing/);
});

test('curated missed targets must be independently agreed and proven inside exact scannedFiles', () => {
  const a = review('reviewer-a');
  const b = review('reviewer-b', 'true_positive', false);
  assert.throws(() => reconcileIndependentReviews(manifest, scans, a, b),
    /Disputed curated missed targets/);
  const out = review('reviewer-b');
  out.projects[0].expectedTargets[0].filePath = 'src/unscanned.ts';
  assert.throws(() => reconcileIndependentReviews(manifest, scans,
    a, out), /outside declared path subset/);
});

test('structural completion fails without independently curated positive targets', () => {
  const report = reconcileIndependentReviews(manifest, scans,
    review('reviewer-a', 'true_positive', false),
    review('reviewer-b', 'true_positive', false));
  assert.equal(report.structurallyComplete, false);
  assert.equal(report.scoring.overall.recallOnCuratedTargets, null);
});

test('missing original findings cannot be treated as reviewed', () => {
  const b = review('reviewer-b');
  b.projects[0].adjudications = [];
  assert.throws(() => reconcileIndependentReviews(manifest, scans, review('reviewer-a'), b),
    /Unreviewed finding|without a verified true-positive verdict/);
});
