#!/usr/bin/env node
// Additional synthetic adversarial corpus. Labels are rule-expectation challenges,
// not exploit validation, certification, or a real-world accuracy estimate.
import { main } from '../dist/agentshield.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const exec = promisify(execFile);

const fakeJwt = 'Z'.repeat(36);
const fakeGh = 'T'.repeat(36);
const tick = String.fromCharCode(96);
const cases = [
  { id: 'jwt_const', category: 'jwt_variants', path: 'src/a.js', ruleId: 'hardcoded_jwt_secret', expected: true, content: `const JWT_SECRET = "${fakeJwt}";`, rationale: 'Synthetic long literal assignment.' },
  { id: 'jwt_typed', category: 'jwt_variants', path: 'src/a.ts', ruleId: 'hardcoded_jwt_secret', expected: true, content: `const jwtSecret: string = '${fakeJwt}';`, rationale: 'Typed synthetic literal assignment.' },
  { id: 'jwt_env', category: 'jwt_variants', path: 'src/a.js', ruleId: 'hardcoded_jwt_secret', expected: false, content: 'const JWT_SECRET = process.env.JWT_SECRET;', rationale: 'Environment-backed secret.' },
  { id: 'jwt_placeholder', category: 'jwt_variants', path: 'src/a.js', ruleId: 'hardcoded_jwt_secret', expected: false, content: 'const JWT_SECRET = "replace_me_with_secret";', rationale: 'Explicit placeholder.' },
  { id: 'jwt_comment', category: 'jwt_variants', path: 'src/a.js', ruleId: 'hardcoded_jwt_secret', expected: false, content: `// const JWT_SECRET = "${fakeJwt}";`, rationale: 'Commented synthetic example.' },
  { id: 'jwt_concatenated', category: 'jwt_variants', path: 'src/a.js', ruleId: 'hardcoded_jwt_secret', expected: true, content: `const JWT_SECRET = '${'Z'.repeat(18)}' + '${'W'.repeat(18)}';`, rationale: 'Synthetic signing material split into two compile-time literals.' },
  { id: 'jwt_encoded', category: 'jwt_variants', path: 'src/a.js', ruleId: 'hardcoded_jwt_secret', expected: true, content: 'const JWT_SECRET = Buffer.from("c3ludGhldGljLWVuY29kZWQtc2VjcmV0LXZhbHVl", "base64").toString();', rationale: 'Synthetic static secret encoded as base64.' },
  { id: 'ghp_fake', category: 'github_token_variants', path: 'src/a.js', ruleId: 'github_token', expected: true, content: `const token = "ghp_${fakeGh}";`, rationale: 'Synthetic token-shaped value.' },
  { id: 'gho_fake', category: 'github_token_variants', path: 'src/a.js', ruleId: 'github_token', expected: true, content: `const token = "gho_${fakeGh}";`, rationale: 'Synthetic OAuth token-shaped value.' },
  { id: 'gh_env', category: 'github_token_variants', path: 'src/a.js', ruleId: 'github_token', expected: false, content: 'const token = process.env.GITHUB_TOKEN;', rationale: 'Environment-backed token.' },
  { id: 'gh_short', category: 'github_token_variants', path: 'src/a.js', ruleId: 'github_token', expected: false, content: 'const token = "ghp_demo";', rationale: 'Short non-credential example.' },
  { id: 'aws_access_id', category: 'aws_credentials', path: 'src/a.js', ruleId: 'hardcoded_secret', expected: true, content: 'const AWS_ACCESS_KEY_ID = "AKIA' + 'A'.repeat(16) + '";', rationale: 'Synthetic AWS-like access-key identifier.' },
  { id: 'aws_secret_key', category: 'aws_credentials', path: 'src/a.js', ruleId: 'hardcoded_secret', expected: true, content: 'const AWS_SECRET_ACCESS_KEY = "SYNTHETIC_ONLY_FAKE_SECRET_0123456789";', rationale: 'Synthetic secret-key-shaped value.' },
  { id: 'aws_env', category: 'aws_credentials', path: 'src/a.js', ruleId: 'hardcoded_secret', expected: false, content: 'const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;', rationale: 'Environment-backed AWS key.' },
  { id: 'sql_template', category: 'sql_context', path: 'src/a.js', ruleId: 'unsafe_sql_template', expected: true, content: `db.query(${tick}SELECT * FROM users WHERE id = ${'${userId}'}${tick});`, rationale: 'Interpolated synthetic SQL value.' },
  { id: 'sql_delete', category: 'sql_context', path: 'src/a.js', ruleId: 'unsafe_sql_template', expected: true, content: `db.query(${tick}DELETE FROM users WHERE id = ${'${id}'}${tick});`, rationale: 'Interpolated synthetic delete value.' },
  { id: 'sql_parameter', category: 'sql_context', path: 'src/a.js', ruleId: 'unsafe_sql_template', expected: false, content: 'db.query("SELECT * FROM users WHERE id = $1", [userId]);', rationale: 'Parameterized value.' },
  { id: 'sql_static', category: 'sql_context', path: 'src/a.js', ruleId: 'unsafe_sql_template', expected: false, content: 'db.query("SELECT id FROM users");', rationale: 'Static SQL.' },
  { id: 'eval_direct', category: 'dynamic_code', path: 'src/a.js', ruleId: 'eval_usage', expected: true, content: ['const result = ev', 'al(userInput);'].join(''), rationale: 'Dynamic evaluation of a synthetic variable.' },
  { id: 'eval_constructor', category: 'dynamic_code', path: 'src/a.js', ruleId: 'function_constructor', expected: true, content: ['const run = new ', 'Function(sourceText);'].join(''), rationale: 'Dynamic function construction.' },
  { id: 'eval_comment', category: 'dynamic_code', path: 'src/a.js', ruleId: 'eval_usage', expected: false, content: ['// ev', 'al(userInput) is prohibited'].join(''), rationale: 'Commented warning.' },
  { id: 'eval_data', category: 'dynamic_code', path: 'src/a.js', ruleId: 'eval_usage', expected: false, content: 'const note = "avoid eval(userInput)";', rationale: 'Quoted documentation string.' },
  { id: 'shell_request', category: 'shell_invocation', path: 'src/a.js', ruleId: 'command_injection', expected: true, content: [
    'exec(',
    'req.query.command);',
  ].join(''), rationale: 'Synthetic request data passed to shell API.' },
  { id: 'shell_static', category: 'shell_invocation', path: 'src/a.js', ruleId: 'command_injection', expected: false, content: 'execFile("tool", ["--version"]);', rationale: 'Static executable and argument list.' },
  { id: 'service_role', category: 'supabase_keys', path: 'src/a.js', ruleId: 'service_role_client', expected: true, content: 'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;', rationale: 'Privileged key reference in source.' },
  { id: 'anon_key', category: 'supabase_keys', path: 'src/a.js', ruleId: 'service_role_client', expected: false, content: 'const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;', rationale: 'Public anonymous key name.' },
  { id: 'yaml_unsafe', category: 'unsafe_yaml', path: 'src/a.py', ruleId: 'python_unsafe_yaml_load', expected: true, content: 'config = yaml.load(untrusted_data)', rationale: 'Unsafe YAML API on synthetic input.' },
  { id: 'yaml_safe', category: 'unsafe_yaml', path: 'src/a.py', ruleId: 'python_unsafe_yaml_load', expected: false, content: 'config = yaml.safe_load(untrusted_data)', rationale: 'Safe YAML loader.' },
  { id: 'pickle_unsafe', category: 'unsafe_deserialization', path: 'src/a.py', ruleId: 'python_unsafe_deserialization', expected: true, content: 'obj = pickle.loads(untrusted_data)', rationale: 'Unsafe deserialization API.' },
  { id: 'json_parse', category: 'unsafe_deserialization', path: 'src/a.py', ruleId: 'python_unsafe_deserialization', expected: false, content: 'obj = json.loads(untrusted_data)', rationale: 'Structured JSON parsing.' },
];

const root = await mkdtemp(path.join(tmpdir(), 'agentshield-independent-benchmark-'));
const start = performance.now();
const totals = { tp: 0, tn: 0, fp: 0, fn: 0 };
const categories = {};
const misclassifications = [];
try {
  await exec('git', ['init', '-q', root]);
  for (const item of cases) {
    const file = path.join(root, item.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, item.content, { mode: 0o600 });
    let output = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = function capture(chunk) { output += String(chunk); return true; };
    let exitCode;
    try { exitCode = await main(['scan', '--file', file, '--cwd', root, '--format', 'json']); }
    finally { process.stdout.write = originalWrite; }
    let scan;
    try { scan = JSON.parse(output); }
    catch { throw new Error(`Scanner returned malformed output for synthetic case ${item.id}.`); }
    if (scan.status !== 'complete' || scan.filesScanned !== 1 || ![0, 1].includes(exitCode)) {
      throw new Error(`Scanner coverage was incomplete for synthetic case ${item.id}.`);
    }
    const detected = scan.findings.some((finding) => finding.ruleId === item.ruleId);
    const bucket = item.expected ? (detected ? 'tp' : 'fn') : (detected ? 'fp' : 'tn');
    totals[bucket]++;
    const category = categories[item.category] ||= { tp: 0, tn: 0, fp: 0, fn: 0 };
    category[bucket]++;
    if (bucket === 'fp' || bucket === 'fn') misclassifications.push({
      caseId: item.id, category: item.category, ruleId: item.ruleId,
      expected: item.expected, detected, errorType: bucket, rationale: item.rationale,
    });
  }
} finally { await rm(root, { recursive: true, force: true }); }

const rates = (counts) => {
  const total = counts.tp + counts.tn + counts.fp + counts.fn;
  return { ...counts, total,
    precision: counts.tp + counts.fp ? counts.tp / (counts.tp + counts.fp) : null,
    recall: counts.tp + counts.fn ? counts.tp / (counts.tp + counts.fn) : null,
    falsePositiveRate: counts.fp + counts.tn ? counts.fp / (counts.fp + counts.tn) : null,
    accuracy: total ? (counts.tp + counts.tn) / total : null };
};
const report = {
  tool: 'VibeSane AgentShield additional adversarial benchmark', schemaVersion: 1,
  benchmarkType: 'synthetic_labeled_target_rule_additional_adversarial',
  corpusVersion: '2026-11-23-independent-audit-1', totalCases: cases.length,
  categoryCount: Object.keys(categories).length, results: rates(totals),
  categories: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, rates(value)])),
  misclassifications, measuredElapsedMs: Math.round(performance.now() - start),
  nodeVersion: process.version, platform: process.platform,
  labelLimitations: 'Independently authored synthetic rule-expectation challenges only; labels are not exploit validation, real-world precision/recall, or security certification. Each case evaluates only its named target rule. False positives need manual review.',
  thresholds: null,
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
