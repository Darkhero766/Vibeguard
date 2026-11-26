// AgentShield repair policy and state machine. No source code, secrets or code snippets are persisted.
import { createHash } from 'node:crypto';

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true, mode: 'monitor', maxAttempts: 2, timeBudgetSeconds: 120,
  blockingSeverity: 'High', completionGate: 'advisory', baseRef: null, verification: { syntaxCheck: false, approved: false },
  privacy: { retentionHours: 24 }, acknowledgements: [],
});
export const SEVERITY = { Critical: 4, High: 3, Medium: 2, Low: 1 };
const VALID_MODES = ['monitor', 'assist', 'auto-fix'];
const GUIDANCE = Object.freeze({
  hardcoded_secret: ['Move credentials to a server-side secret manager and rotate any real exposure.', 'Do not commit replacement credentials.', 'Re-scan and confirm old credentials are revoked.', 'Human must review credential rotation.'],
  hardcoded_jwt_secret: ['Read the JWT signing key from protected server environment configuration.', 'Do not generate or commit a replacement signing key.', 'Re-scan, confirm a configured secret is used, then test JWT issuance and validation in an isolated environment.', 'Human must review token invalidation and key rotation.'],
  unsafe_sql_template: ['Use positional parameters or a trusted parameterizing query builder.', 'Do not silently change query semantics or interpolate identifiers as values.', 'Re-scan and run authorized SQL injection regression cases in an isolated database.', 'Human must review dynamic identifiers and database privileges.'],
  unauthenticated_write: ['Verify authentication and resource ownership before the write.', 'Do not remove legitimate access or assume client-supplied IDs are trustworthy.', 'Re-scan and test unauthorized and authorized requests with synthetic identities.', 'Human must review authorization policy.'],
  service_role_client: ['Keep service-role credentials only in server-side code and secret storage.', 'Do not put privileged keys in public or client environment variables.', 'Re-scan client bundles and exercise equivalent behavior using least-privileged test accounts.', 'Human must review whether privileged operations are necessary.'],
  rls: ['Enable Row-Level Security and add least-privilege policies for applicable tables.', 'Do not enable restrictive RLS blindly without considering availability and migrations.', 'Re-scan and test tenant isolation using synthetic accounts in a disposable database.', 'Human must review schema and permissions.'],
  rls_policy_missing: ['Review RLS policies for the table and add narrowly scoped authorization where needed.', 'Do not disable RLS just to make requests pass.', 'Verify intended access and tenant isolation in a disposable database.', 'Human must review the migration.'],
});
const FALLBACK = ['Review this heuristic finding and propose a minimal risk-reducing change.', 'Do not alter business behavior without review.', 'Re-scan and use approved, relevant regression tests.', 'Escalate ambiguous security behavior for human review.'];

export function parseConfig(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Configuration must be a JSON object.');
  for (const key of Object.keys(raw)) if (!Object.hasOwn(DEFAULT_CONFIG, key)) throw new Error('Unknown AgentShield setting: ' + key);
  const config = {
    ...DEFAULT_CONFIG,
    ...raw,
    verification: { ...DEFAULT_CONFIG.verification, ...(raw.verification || {}) },
    privacy: { ...DEFAULT_CONFIG.privacy, ...(raw.privacy || {}) },
  };
  if (!Array.isArray(config.acknowledgements) || config.acknowledgements.length > 100)
    throw new Error('acknowledgements must contain at most 100 scoped entries.');
  for (const item of config.acknowledgements) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
      !/^[a-z][a-z0-9_]{0,100}$/.test(item.ruleId || '') ||
      typeof item.filePath !== 'string' || item.filePath.length > 400 ||
      item.filePath.startsWith('/') || item.filePath.split('/').includes('..') ||
      !['false-positive', 'accepted-risk', 'compensating-control'].includes(item.reasonCode) ||
      !Number.isSafeInteger(item.expiresAt) || item.expiresAt <= 0) {
      throw new Error('Invalid scoped acknowledgement.');
    }
  }
  if (typeof config.enabled !== 'boolean') throw new Error('enabled must be a boolean.');
  if (!VALID_MODES.includes(config.mode)) throw new Error('mode must be monitor, assist, or auto-fix.');
  if (!['advisory', 'enforce'].includes(config.completionGate)) throw new Error('completionGate must be advisory or enforce.');
  if (config.baseRef !== null && (typeof config.baseRef !== 'string' || config.baseRef.length > 200
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(config.baseRef) || config.baseRef.includes('..')
    || config.baseRef.includes('//') || config.baseRef.includes('@{') || config.baseRef.endsWith('/')
    || config.baseRef.endsWith('.') || config.baseRef.startsWith('-'))) {
    throw new Error('baseRef must be a safe local Git ref or commit SHA.');
  }
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1 || config.maxAttempts > 4) throw new Error('maxAttempts must be between 1 and 4.');
  if (!Number.isInteger(config.timeBudgetSeconds) || config.timeBudgetSeconds < 15 || config.timeBudgetSeconds > 900) throw new Error('timeBudgetSeconds must be between 15 and 900.');
  if (!Object.hasOwn(SEVERITY, config.blockingSeverity)) throw new Error('Invalid blockingSeverity.');
  for (const [name, shape] of [['verification', { syntaxCheck: true, approved: true }], ['privacy', { retentionHours: 24 }]]) {
    const input = raw[name] || {};
    if (typeof input !== 'object' || Array.isArray(input)) throw new Error(name + ' must be an object.');
    for (const key of Object.keys(input)) if (!Object.hasOwn(shape, key)) throw new Error('Unknown ' + name + ' setting: ' + key);
  }
  if (typeof config.verification.syntaxCheck !== 'boolean' || typeof config.verification.approved !== 'boolean') throw new Error('verification flags must be boolean.');
  if (!Number.isInteger(config.privacy.retentionHours) || config.privacy.retentionHours < 0 || config.privacy.retentionHours > 168) throw new Error('retentionHours must be between 0 and 168.');
  if (config.mode === 'auto-fix' && config.privacy.retentionHours === 0) throw new Error('auto-fix requires short-lived local metadata to enforce retry limits.');
  return config;
}

// Centralized Stop-hook result mapping so enforcement behavior can be tested independently.
export function completionGateDecision({
  status = 'complete', blocking = 0, blockingSeverity = 'High', completionGate = 'advisory',
  unscannedCount = 0, repairMessage = null, repeatedGate = false, alreadyRequested = false, mode = 'monitor',
} = {}) {
  const enforced = completionGate === 'enforce';
  if (status === 'scan_incomplete') {
    const reason = 'VibeSane AgentShield: FINAL SCAN INCOMPLETE. Security status UNKNOWN; resolve the scan failure or run an approved verification before delivery.';
    return enforced ? { decision: 'block', reason } : { systemMessage: reason };
  }
  if (status === 'no_changed_files') {
    const reason = 'VibeSane AgentShield: no Git-visible changed files were available. No security scan or delivery evidence exists; inspect the commit/worktree scope before delivery.';
    return enforced ? { decision: 'block', reason } : { systemMessage: reason };
  }
  if (unscannedCount > 0) {
    const reason = 'VibeSane AgentShield: final scan did not cover previously flagged files; result PARTIAL, not verified. Review or rescan the previously flagged files before delivery.';
    return enforced ? { decision: 'block', reason } : { systemMessage: reason };
  }
  if (repairMessage) {
    return { decision: 'block', reason: repairMessage,
      hookSpecificOutput: { hookEventName: 'Stop', additionalContext: repairMessage } };
  }
  if (blocking > 0 && enforced) {
    const reason = 'VibeSane AgentShield ENFORCEMENT: ' + blocking + ' blocking finding(s) at or above '
      + blockingSeverity + ' remain in the changed-file scan. Remediate and rescan, or have an authorized maintainer change the gate policy.';
    return { decision: 'block', reason, hookSpecificOutput: { hookEventName: 'Stop', additionalContext: reason } };
  }
  if (blocking > 0) {
    if (repeatedGate || (mode === 'auto-fix' && alreadyRequested)) return null;
    return { systemMessage: 'VibeSane AgentShield: final static scan found ' + blocking +
      ' finding(s) at or above ' + blockingSeverity + '. ' +
      (mode === 'auto-fix' ? 'Repair budget exhausted or continuation suppressed; request human review.' : 'Advisory mode; no completion block.') };
  }
  return null;
}

function hash(text) { return createHash('sha256').update(text).digest('hex').slice(0, 28); }
export function keyForFinding(f) { return hash([f.filePath, f.ruleId, f.title].join('\0')); }
export function stableFindings(findings) {
  const groups = new Map();
  for (const f of findings || []) {
    if (!f || !Object.hasOwn(SEVERITY, f.severity) || typeof f.filePath !== 'string' || typeof f.ruleId !== 'string') continue;
    const key = keyForFinding(f);
    const prev = groups.get(key);
    if (prev) prev.count += 1;
    else groups.set(key, {
      key, filePath: f.filePath.slice(0, 400), ruleId: f.ruleId.slice(0, 100),
      title: String(f.title || '').slice(0, 180), severity: f.severity, count: 1,
    });
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
function fingerprint(items) { return hash(items.map((f) => f.key + ':' + f.count).join('\n')); }
export function freshState() { return { version: 2, files: {}, updatedAt: 0 }; }
function timeline(old = [], event, now) { return [...old, { event, at: now }].slice(-16); }
function activeBudget(entry, config, now) {
  return entry.attempts < config.maxAttempts && now - entry.firstSeen <= config.timeBudgetSeconds * 1000;
}
export function trackFile(state, filePath, fileFindings, config, { now = Date.now(), edited = false } = {}) {
  const next = structuredClone(state || freshState());
  const old = next.files[filePath] || null;
  const findings = stableFindings(fileFindings);
  const sig = fingerprint(findings);
  const hadFindings = Boolean(old?.active?.length);
  const changed = Boolean(old && old.signature !== sig);
  const attempts = (old?.attempts || 0) + (edited && hadFindings ? 1 : 0);
  const firstSeen = hadFindings ? old.firstSeen : now;
  const history = Array.isArray(old?.history) ? old.history : [];
  let events = history;
  let scanState = 'clean', verificationState = 'not_applicable';
  if (findings.length) {
    scanState = old ? 'rescan_failed' : 'detected';
    verificationState = 'unverified';
    if (!old) events = timeline(events, 'detected', now);
    else if (edited) {
      events = timeline(events, 'repair_attempted', now);
      events = timeline(events, 'rescan_failed', now);
    } else if (changed) events = timeline(events, 'rescan_failed', now);
  } else if (hadFindings) {
    scanState = 'rescan_passed';
    verificationState = 'unverified';
    events = timeline(events, 'rescan_passed', now);
    events = timeline(events, 'unverified', now);
  }
  const entry = {
    filePath, signature: sig, active: findings, attempts: findings.length ? attempts : (old?.attempts || 0),
    firstSeen: findings.length ? firstSeen : (old?.firstSeen || now), updatedAt: now,
    scanState, verificationState, history: events, lastStopSignature: changed ? null : old?.lastStopSignature || null,
    lastRepairSignature: old?.lastRepairSignature || null,
  };
  const budget = findings.length && activeBudget(entry, config, now);
  const novel = !old || changed;
  const sendRepair = config.enabled && config.mode === 'auto-fix' && budget && novel;
  if (sendRepair) {
    entry.history = timeline(entry.history, 'repair_requested', now);
    entry.lastRepairSignature = sig;
  }
  next.files[filePath] = entry;
  // Keep per-session metadata bounded. Never silently claim complete coverage
  // once older entries have been evicted.
  const keys = Object.keys(next.files);
  if (keys.length > 200) {
    keys.sort((a, b) => (next.files[a].updatedAt || 0) - (next.files[b].updatedAt || 0));
    for (const key of keys.slice(0, keys.length - 200)) delete next.files[key];
    next.prunedEntries = (next.prunedEntries || 0) + keys.length - 200;
  }
  next.updatedAt = now;
  return { state: next, entry, novel, sendRepair, exhausted: findings.length && !budget };
}
export function guidanceFor(ruleId) {
  const [strategy, avoid, verify, review] = GUIDANCE[ruleId] || FALLBACK;
  return { strategy, avoid, verify, review };
}
export function severityBlocks(severity, threshold) { return SEVERITY[severity] >= SEVERITY[threshold]; }
export function summarize(state, config) {
  const entries = Object.values(state.files || {});
  const active = entries.flatMap((e) => e.active || []);
  return {
    filesTracked: entries.length, stateTruncated: Boolean(state.prunedEntries),
    severityBreakdown: { Critical: active.filter(f => f.severity === 'Critical').reduce((n, f) => n + f.count, 0),
      High: active.filter(f => f.severity === 'High').reduce((n, f) => n + f.count, 0),
      Medium: active.filter(f => f.severity === 'Medium').reduce((n, f) => n + f.count, 0),
      Low: active.filter(f => f.severity === 'Low').reduce((n, f) => n + f.count, 0) },
    activeFindings: active.reduce((n, f) => n + f.count, 0),
    blocking: active.filter((f) => severityBlocks(f.severity, config.blockingSeverity)).reduce((n, f) => n + f.count, 0),
    attempts: entries.reduce((n, e) => n + e.attempts, 0),
    files: entries.map((e) => ({ filePath: e.filePath, scanState: e.scanState, verificationState: e.verificationState,
      attempts: e.attempts, findings: e.active, history: e.history })).slice(0, 100),
  };
}
