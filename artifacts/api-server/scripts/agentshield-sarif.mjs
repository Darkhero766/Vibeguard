// SARIF 2.1.0 serialization for AgentShield findings.
// Only normalized finding metadata is emitted; source snippets and secret values are never included.
const LEVEL = Object.freeze({
  Critical: 'error',
  High: 'error',
  Medium: 'warning',
  Low: 'note',
});
function text(value, max = 1000) {
  return typeof value === 'string'
    ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ').slice(0, max)
    : '';
}
function relativeUri(value) {
  const normalized = text(value, 1000).replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)
    || normalized.split('/').some((segment) => segment === '..')) return null;
  return normalized.split('/').map((segment) => encodeURIComponent(segment)).join('/');
}
function stableFingerprint(parts) {
  // SARIF's partialFingerprints are opaque correlation hints, not proof of identity.
  return parts.map((part) => encodeURIComponent(String(part ?? ''))).join('|').slice(0, 1000);
}
export function toSarif(report = {}) {
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const mapped = [];
  const rules = new Map();
  for (const finding of findings) {
    const ruleId = text(finding?.ruleId, 100);
    const uri = relativeUri(finding?.filePath);
    if (!ruleId || !uri) continue;
    const severity = LEVEL[finding.severity] || 'warning';
    const title = text(finding.title, 240) || ruleId;
    const description = text(finding.description, 1200);
    const recommendation = text(finding.recommendation, 800);
    const confidence = ['high', 'medium', 'low'].includes(finding.confidence) ? finding.confidence : 'unrated';
    const engine = text(finding.engine, 80) || 'static_heuristics';
    if (!rules.has(ruleId)) {
      rules.set(ruleId, {
        id: ruleId,
        shortDescription: { text: title },
        help: { text: recommendation || description || 'Review this static security finding.' },
        properties: { tags: ['security'], confidence, engine },
      });
    }
    const line = Number.isSafeInteger(finding.line) && finding.line > 0 ? finding.line : 1;
    mapped.push({
      ruleId,
      level: severity,
      message: { text: description ? title + ': ' + description : title },
      locations: [{
        physicalLocation: {
          artifactLocation: { uri },
          region: { startLine: line },
        },
      }],
      partialFingerprints: {
        agentShieldFinding: stableFingerprint([ruleId, uri, line, title]),
      },
      properties: {
        severity: text(finding.severity, 20) || 'Unknown',
        confidence,
        engine,
        recommendation,
      },
    });
  }
  const status = ['complete', 'partial_coverage', 'scan_incomplete', 'error'].includes(report.status)
    ? report.status : 'unknown';
  const complete = status === 'complete';
  const notifications = complete ? [] : [{
    level: 'warning',
    message: {
      text: text(report.coverage, 500) || text(report.note, 500)
        || 'Scan was incomplete or partial. Do not interpret this SARIF result as a clean pass.',
    },
  }];
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: {
        driver: {
          name: 'VibeSane AgentShield',
          semanticVersion: '0.7.0-beta.3',
          informationUri: 'https://vibesane.app',
          rules: [...rules.values()],
        },
      },
      invocations: [{
        executionSuccessful: complete,
        toolExecutionNotifications: notifications,
        properties: {
          status,
          filesScanned: Number.isSafeInteger(report.filesScanned) ? report.filesScanned : 0,
          unsupportedChangedFileCount: Number.isSafeInteger(report.unsupportedChangedFileCount)
            ? report.unsupportedChangedFileCount : 0,
          securityGuarantee: false,
        },
      }],
      results: mapped,
      properties: {
        coverage: text(report.coverage, 500)
          || 'Static security heuristics over supported changed files only. Not a security certification.',
        securityGuarantee: false,
      },
    }],
  };
}
