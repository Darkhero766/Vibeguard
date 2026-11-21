#!/usr/bin/env node
/**
 * Reproducible, metadata-only scoring for explicitly reviewed public-repo scans.
 * Never executes repository code or downloads sources. It cannot independently
 * verify reviewer labels or discover vulnerabilities absent from its target list.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[a-f0-9]{40}$/i;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const VERDICTS = new Set(['true_positive', 'false_positive', 'uncertain', 'duplicate']);
const SEVERITIES = new Set(['Critical', 'High', 'Medium', 'Low', 'Info']);

function ensure(ok, message) {
  if (!ok) throw new Error(message);
}

function validPath(value) {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 500 && !value.startsWith('/') && !value.includes('\\') &&
    !value.split('/').some((part) => part === '' || part === '.' || part === '..');
}

function validRuleId(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_]{1,99}$/.test(value);
}

function validEvidence(value) {
  return typeof value === 'string' && value.trim().length >= 12 && value.length <= 1000;
}

export function findingKey(finding) {
  ensure(validRuleId(finding?.ruleId), 'Invalid ruleId');
  ensure(validPath(finding?.filePath), 'Invalid finding filePath');
  ensure(Number.isSafeInteger(finding?.line) && finding.line > 0, 'Invalid finding line');
  return JSON.stringify([finding.ruleId, finding.filePath, finding.line]);
}

function projectId(entry) {
  return entry.repo + '@' + entry.commit.toLowerCase();
}

export function validateManifest(manifest) {
  ensure(manifest?.schemaVersion === 1 && Array.isArray(manifest.projects), 'Expected manifest schemaVersion 1 and projects array');
  ensure(manifest.projects.length > 0 && manifest.projects.length <= 100, 'Manifest must have 1–100 projects');
  const seen = new Set();
  for (const project of manifest.projects) {
    ensure(REPO.test(project.repo || ''), 'Invalid owner/repo in manifest');
    ensure(SHA.test(project.commit || ''), 'Manifest requires pinned 40-character commit SHA');
    ensure(typeof project.license === 'string' && /^[A-Za-z0-9.+-]{2,60}$/.test(project.license) && project.license !== 'NOASSERTION', 'License must be reviewed');
    ensure(['deliberately_vulnerable', 'unlabeled_general'].includes(project.sourceType), 'Invalid sourceType');
    ensure(['whole_repo', 'bounded_subset'].includes(project.coverageMode), 'Invalid coverageMode');
    if (project.coverageMode === 'bounded_subset') {
      ensure(Array.isArray(project.paths) && project.paths.length > 0 && project.paths.every(validPath), 'Subset requires explicit source paths');
    } else {
      ensure(project.paths === undefined, 'Whole-repo entry cannot have path subset');
    }
    const id = projectId(project);
    ensure(!seen.has(id), 'Duplicate manifest project: ' + id);
    seen.add(id);
  }
  return manifest.projects.length;
}

function bucket() {
  return { alerts: 0, truePositive: 0, falsePositive: 0, uncertain: 0,
    duplicate: 0, unreviewed: 0, knownTargets: 0, detectedTargets: 0,
    missedTargets: 0 };
}

function metrics(b) {
  const reviewedForPrecision = b.truePositive + b.falsePositive;
  return {
    ...b,
    reviewedForPrecision,
    precision: reviewedForPrecision ? b.truePositive / reviewedForPrecision : null,
    recallOnCuratedTargets: b.knownTargets ? b.detectedTargets / b.knownTargets : null,
  };
}

function createIndex(items, name) {
  ensure(Array.isArray(items), name + ' must be an array');
  const lookup = new Map();
  for (const item of items) {
    ensure(REPO.test(item?.repo || '') && SHA.test(item?.commit || ''), 'Invalid project identity in ' + name);
    const id = projectId(item);
    ensure(!lookup.has(id), 'Duplicate project in ' + name + ': ' + id);
    lookup.set(id, item);
  }
  return lookup;
}

export function scoreEvidence(manifest, scanData, reviewData) {
  validateManifest(manifest);
  ensure(scanData?.schemaVersion === 1, 'Scan results require schemaVersion 1');
  ensure(reviewData?.schemaVersion === 1, 'Review results require schemaVersion 1');
  const scans = createIndex(scanData.projects, 'scans');
  const reviews = createIndex(reviewData.projects, 'reviews');
  const allowed = new Set(manifest.projects.map(projectId));
  for (const id of [...scans.keys(), ...reviews.keys()]) ensure(allowed.has(id), 'Unlisted project: ' + id);

  const total = bucket();
  const byRule = new Map();
  const bySeverity = new Map();
  const projects = [];

  const add = (finding, property) => {
    total[property]++;
    if (finding) {
      if (!byRule.has(finding.ruleId)) byRule.set(finding.ruleId, bucket());
      if (property !== 'knownTargets' && property !== 'detectedTargets' && property !== 'missedTargets') {
        if (!bySeverity.has(finding.severity)) bySeverity.set(finding.severity, bucket());
        bySeverity.get(finding.severity)[property]++;
      }
      byRule.get(finding.ruleId)[property]++;
    }
  };

  for (const manifestProject of manifest.projects) {
    const id = projectId(manifestProject);
    const scan = scans.get(id);
    const review = reviews.get(id);
    if (!scan) {
      ensure(!review, 'Review cannot exist without matching scan: ' + id);
      projects.push({ id, status: 'not_scanned' });
      continue;
    }
    ensure(['complete', 'incomplete'].includes(scan.status), 'Invalid scan status: ' + id);
    ensure(typeof scan.engine === 'string' && scan.engine.length > 0, 'Missing scan engine');
    ensure(SHA.test(scan.rulesetCommit || ''), 'Every scan must pin a ruleset commit');
    ensure(Number.isSafeInteger(scan.filesScanned) && scan.filesScanned >= 0, 'Invalid filesScanned');
    ensure(Number.isSafeInteger(scan.durationMs) && scan.durationMs >= 0, 'Invalid durationMs');
    ensure(Array.isArray(scan.findings), 'Missing findings array');
    if (scan.status !== 'complete') {
      ensure(!review || ((review.adjudications || []).length === 0 && (review.expectedTargets || []).length === 0),
        'Incomplete scan cannot be scored');
      projects.push({ id, status: 'incomplete', filesScanned: scan.filesScanned });
      continue;
    }

    const found = new Map();
    for (const finding of scan.findings) {
      const key = findingKey(finding);
      ensure(SEVERITIES.has(finding.severity), 'Invalid severity in ' + id);
      ensure(!found.has(key), 'Duplicate raw finding key; deduplicate before scoring: ' + id);
      if (manifestProject.coverageMode === 'bounded_subset') {
        ensure(manifestProject.paths.includes(finding.filePath), 'Finding outside declared path subset: ' + id);
      }
      found.set(key, finding);
      add(finding, 'alerts');
    }

    const labels = new Map();
    if (review) {
      ensure(Array.isArray(review.adjudications) && Array.isArray(review.expectedTargets), 'Review requires adjudications and expectedTargets arrays');
      for (const label of review.adjudications) {
        const key = findingKey(label);
        ensure(found.has(key), 'Adjudication does not match observed finding: ' + id);
        ensure(!labels.has(key), 'Duplicate adjudication: ' + id);
        ensure(VERDICTS.has(label.verdict), 'Invalid review verdict');
        ensure(validEvidence(label.evidence) && typeof label.reviewer === 'string' && label.reviewer.trim().length >= 2, 'Review requires evidence and reviewer');
        labels.set(key, label);
      }
    }

    for (const [key, finding] of found) {
      const label = labels.get(key);
      const property = label ? ({
        true_positive: 'truePositive',
        false_positive: 'falsePositive',
        uncertain: 'uncertain',
        duplicate: 'duplicate',
      })[label.verdict] : 'unreviewed';
      add(finding, property);
    }

    const targetKeys = new Set();
    for (const target of review?.expectedTargets || []) {
      ensure(validRuleId(target.ruleId) && validPath(target.filePath), 'Invalid curated target');
      ensure(Number.isSafeInteger(target.startLine) && target.startLine > 0 &&
        Number.isSafeInteger(target.endLine) && target.endLine >= target.startLine, 'Invalid curated target line range');
      ensure(validEvidence(target.evidence) && typeof target.reviewer === 'string' && target.reviewer.trim().length >= 2, 'Target requires evidence and reviewer');
      if (manifestProject.coverageMode === 'bounded_subset') {
        ensure(manifestProject.paths.includes(target.filePath), 'Target outside declared path subset');
      }
      const key = JSON.stringify([target.ruleId, target.filePath, target.startLine, target.endLine]);
      ensure(!targetKeys.has(key), 'Duplicate curated target');
      targetKeys.add(key);
      add(target, 'knownTargets');
      const detected = [...found.values()].some(f => f.ruleId === target.ruleId &&
        f.filePath === target.filePath && f.line >= target.startLine && f.line <= target.endLine);
      add(target, detected ? 'detectedTargets' : 'missedTargets');
    }
    projects.push({
      id, status: 'complete', engine: scan.engine,
      filesScanned: scan.filesScanned, durationMs: scan.durationMs,
      alerts: found.size, adjudicated: labels.size, curatedTargets: targetKeys.size,
    });
  }

  return {
    schemaVersion: 1,
    evaluation: 'metadata_only_explicit_adjudications',
    publicationStatus: 'internal_not_independently_certified',
    overall: metrics(total),
    byRule: Object.fromEntries([...byRule.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([rule, value]) => [rule, metrics(value)])),
    bySeverity: Object.fromEntries([...bySeverity.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([severity, value]) => [severity, metrics(value)])),
    projects,
    warnings: [
      'Precision counts only explicitly adjudicated true/false alerts; uncertain, duplicate and unreviewed alerts are excluded.',
      'Recall is limited to separately curated expected targets; unlabeled code cannot be assumed secure or counted as true negative.',
      'The scorer cannot establish exploitation, reviewer independence, source coverage, dataset representativeness, or comparative superiority.',
      'Do not report a percentage without sample counts, manifest pins, ruleset SHA, and evaluation limitations.',
    ],
  };
}

function main(args) {
  const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
  if (args.length === 2 && args[0] === '--validate') {
    const count = validateManifest(read(args[1]));
    process.stdout.write(JSON.stringify({ status: 'valid', pinnedProjects: count, realWorldAccuracyVerified: false }) + '\n');
    return;
  }
  if (args.length === 4 && args[0] === '--score') {
    const summary = scoreEvidence(read(args[1]), read(args[2]), read(args[3]));
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    return;
  }
  throw new Error('Usage: node vibesane-benchmark-evidence.mjs --validate manifest.json OR --score manifest.json scans.json reviews.json');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write('Benchmark evidence validation failed: ' + error.message + '\n'); process.exitCode = 1; }
}
