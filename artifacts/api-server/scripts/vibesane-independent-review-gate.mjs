#!/usr/bin/env node
/**
 * Internal-only human review reconciliation. Never invents labels or asserts
 * human identity from a filename. Two independent self-attestations must be
 * separately verified by a release owner before any public performance claim.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { findingKey, scoreEvidence, validateManifest } from './vibesane-benchmark-evidence.mjs';

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const targetKey = t => JSON.stringify([t.ruleId, t.filePath, t.startLine, t.endLine]);
const pid = p => p.repo.toLowerCase() + '@' + p.commit.toLowerCase();
const docs = entries => new Map(entries.map(p => [pid(p), p]));
const identity = label => JSON.stringify([label.verdict, label.severityAssessment || null]);

function declaredHuman(review, which) {
  const m = review?.reviewMetadata;
  assert(m && /^[a-zA-Z0-9._-]{3,80}$/.test(m.reviewerId || ''), which + ': missing reviewer identity');
  assert(m.role === 'qualified_human_security_reviewer',
    which + ': must be an explicitly identified qualified human reviewer');
  assert(m.independentFromScannerTeam === true, which + ': independence attestation required');
  assert(typeof m.qualifications === 'string' && m.qualifications.trim().length >= 12,
    which + ': qualifications/evidence required');
  assert(/^\d{4}-\d{2}-\d{2}T/.test(m.signedAt || '') &&
    Number.isFinite(Date.parse(m.signedAt)), which + ': signedAt timestamp required');
  return m;
}

function consensusLabel(one, two, winner, aId, bId, thirdId) {
  const evidence = [one.evidence, two.evidence, winner?.evidence].filter(Boolean).join(' | ').slice(0, 1000);
  const selection = winner || one;
  const label = {
    ruleId: selection.ruleId, filePath: selection.filePath, line: selection.line,
    verdict: selection.verdict, reviewer: winner
      ? 'resolved:' + thirdId : 'concordant:' + aId + '+' + bId,
    evidence,
  };
  if (label.verdict === 'true_positive') {
    label.severityAssessment = selection.severityAssessment;
    label.severityEvidence = [one.severityEvidence, two.severityEvidence,
      winner?.severityEvidence].filter(Boolean).join(' | ').slice(0, 1000);
  }
  return label;
}

export function reconcileIndependentReviews(manifest, scans, first, second, decisions = null) {
  validateManifest(manifest);
  const blank = { schemaVersion: 1, projects: [] };
  const raw = scoreEvidence(manifest, scans, blank);
  assert(raw.projects.length === manifest.projects.length &&
    raw.projects.every(p => p.status === 'complete'),
    'Release review requires complete scans for every frozen project');
  assert(scans.projects?.length === manifest.projects.length,
    'Missing or extra scanned projects');
  const a = declaredHuman(first, 'review A');
  const b = declaredHuman(second, 'review B');
  assert(a.reviewerId !== b.reviewerId, 'Reviewers must have distinct verified identities');
  scoreEvidence(manifest, scans, first);
  scoreEvidence(manifest, scans, second);

  const resolver = decisions ? declaredHuman(decisions, 'disagreement resolver') : null;
  if (resolver) {
    assert(![a.reviewerId, b.reviewerId].includes(resolver.reviewerId),
      'Disagreement resolver must be a third independent human reviewer');
    scoreEvidence(manifest, scans, decisions);
  }

  const byScan = docs(scans.projects);
  const byA = docs(first.projects || []);
  const byB = docs(second.projects || []);
  const byR = docs(decisions?.projects || []);
  const projectReviews = [];
  let resolvedDisagreements = 0;
  let targetCount = 0;
  let uncertain = 0;
  let unreviewed = 0;
  for (const project of manifest.projects) {
    const id = pid(project);
    const scan = byScan.get(id);
    const pa = byA.get(id);
    const pb = byB.get(id);
    assert(pa && pb && Array.isArray(pa.adjudications) && Array.isArray(pb.adjudications) &&
      Array.isArray(pa.expectedTargets) && Array.isArray(pb.expectedTargets),
      'Both independent reviewers must cover every project: ' + id);
    const mapA = new Map(pa.adjudications.map(l => [findingKey(l), l]));
    const mapB = new Map(pb.adjudications.map(l => [findingKey(l), l]));
    const mr = new Map((byR.get(id)?.adjudications || []).map(l => [findingKey(l), l]));
    assert(mapA.size === pa.adjudications.length && mapB.size === pb.adjudications.length,
      'Duplicate finding review identity: ' + id);
    const reconciled = [];
    for (const finding of scan.findings) {
      const key = findingKey(finding);
      const la = mapA.get(key), lb = mapB.get(key);
      assert(la && lb, 'Unreviewed finding in human files: ' + id + ' ' + key);
      assert(la.reviewer === a.reviewerId && lb.reviewer === b.reviewerId,
        'Finding-level attribution does not match independent reviewers: ' + id);
      if (la.verdict === 'true_positive') assert(la.severityAssessment &&
        typeof la.severityEvidence === 'string' && la.severityEvidence.trim().length >= 12,
        'Review A must independently assess the severity of true positives');
      if (lb.verdict === 'true_positive') assert(lb.severityAssessment &&
        typeof lb.severityEvidence === 'string' && lb.severityEvidence.trim().length >= 12,
        'Review B must independently assess the severity of true positives');
      const conflict = identity(la) !== identity(lb);
      const winner = conflict ? mr.get(key) : null;
      if (conflict) {
        assert(winner, 'Unresolved contradictory verdict/severity: ' + id + ' ' + key);
        assert(winner.reviewer === resolver?.reviewerId,
          'Disagreement requires third named independent resolver');
        if (winner.verdict === 'true_positive') assert(winner.severityAssessment &&
          typeof winner.severityEvidence === 'string' && winner.severityEvidence.trim().length >= 12,
          'Resolver must justify final true-positive severity');
        resolvedDisagreements++;
      } else {
        assert(!mr.has(key), 'Do not let resolver overwrite agreeing independent verdicts');
      }
      const label = consensusLabel(la, lb, winner, a.reviewerId, b.reviewerId, resolver?.reviewerId);
      if (label.verdict === 'uncertain') uncertain++;
      reconciled.push(label);
    }
    assert(mr.size === reconciled.filter(l => l.reviewer.startsWith('resolved:')).length,
      'Resolver supplied extra or unmatched findings: ' + id);
    const targetsA = new Map(pa.expectedTargets.map(t => [targetKey(t), t]));
    const targetsB = new Map(pb.expectedTargets.map(t => [targetKey(t), t]));
    assert(targetsA.size === targetsB.size &&
      [...targetsA.keys()].every(key => targetsB.has(key)),
      'Disputed curated missed targets require independent review before recall scoring: ' + id);
    for (const target of targetsA.values()) assert(target.reviewer === a.reviewerId &&
      targetsB.get(targetKey(target)).reviewer === b.reviewerId,
      'Curated target reviewer attribution mismatch: ' + id);
    const targets = [...targetsA.values()].map(t => ({
      ...t, reviewer: 'concordant:' + a.reviewerId + '+' + b.reviewerId,
      evidence: [t.evidence, targetsB.get(targetKey(t)).evidence].join(' | ').slice(0, 1000),
    }));
    targetCount += targets.length;
    projectReviews.push({ repo: project.repo, commit: project.commit,
      adjudications: reconciled, expectedTargets: targets });
    unreviewed += scan.findings.length - reconciled.length;
  }
  const consensus = { schemaVersion: 1,
    reviewMetadata: { kind: 'human_self_attested_two_reviewer_consensus',
      reviewerIds: [a.reviewerId, b.reviewerId],
      resolverId: resolver?.reviewerId || null, independentIdentityVerified: false,
      externallyAudited: false },
    projects: projectReviews };
  const scored = scoreEvidence(manifest, scans, consensus);
  const internallyComplete = unreviewed === 0 && uncertain === 0 &&
    targetCount > 0 && scored.overall.severityNotReviewed === 0;
  return {
    schemaVersion: 1, documentType: 'INTERNAL_SELF_ATTESTED_CONSENSUS_NOT_PUBLIC_CERTIFICATION',
    structurallyComplete: internallyComplete, independentIdentityVerified: false,
    humanQualificationsExternallyVerified: false, accuracyVerified: false,
    reviewCounts: { reviewers: 2, resolvedDisagreements, uncertain, unreviewed, targets: targetCount },
    scoring: scored, consensus,
    nextAction: 'Independent human identity/qualification audit, root-cause review, whole-product test, and explicit release-owner signoff remain mandatory',
  };
}

function main(args) {
  assert(args.length === 8 || args.length === 10,
    'Usage: --manifest FILE --scans FILE --review-a FILE --review-b FILE [--resolutions FILE]');
  const opts = new Map();
  for (let i = 0; i < args.length; i += 2) {
    assert(['--manifest', '--scans', '--review-a', '--review-b', '--resolutions'].includes(args[i]) &&
      args[i + 1] && !opts.has(args[i]), 'Duplicate, missing or unsupported review gate option');
    opts.set(args[i], args[i + 1]);
  }
  for (const k of ['--manifest', '--scans', '--review-a', '--review-b'])
    assert(opts.has(k), 'Missing ' + k);
  const read = k => JSON.parse(readFileSync(opts.get(k), 'utf8'));
  const result = reconcileIndependentReviews(read('--manifest'), read('--scans'),
    read('--review-a'), read('--review-b'),
    opts.has('--resolutions') ? read('--resolutions') : null);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.structurallyComplete) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write('Independent-review gate failed: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
