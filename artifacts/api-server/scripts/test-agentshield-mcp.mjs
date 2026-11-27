import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { cursorStopEligibility } from './agentshield-controller.mjs';
import { resolveJobStoreDirectory } from './agentshield-mcp-sdk.mjs';
import { createHash } from 'node:crypto';
import {
  TOOL_DEFS,
  compareFindings,
  createLineDecoder,
  explainFinding,
  handleMessage,
  negotiateProtocol,
  normalizeReport,
  scanChanged,
  listFindings,
  verifyRemediation,
  statusTool,
  validateRpcMessage,
  validateToolArguments,
  workspaceSnapshot,
} from './agentshield-mcp-server.mjs';

const exec = promisify(execFile);
process.env.VIBESANE_ALLOWED_ROOTS_JSON = JSON.stringify([os.tmpdir()]);

test('MCP SQLite stores are separated by host namespace and authorized-root scope', () => {
  const home = path.join(os.tmpdir(), 'foxy-store-path-home');
  const roots = JSON.stringify(['/workspace/repo-a']);
  const env = {
    VIBESANE_JOB_STORE_NAMESPACE: 'foxy-cursor',
    VIBESANE_ALLOWED_ROOTS_JSON: roots,
  };
  const scope = createHash('sha256').update(roots).digest('hex').slice(0, 24);
  const expected = path.join(home, '.local', 'state', 'vibesane', 'agentshield', 'foxy-cursor-' + scope);
  assert.equal(resolveJobStoreDirectory(env, home), expected);
  assert.notEqual(
    resolveJobStoreDirectory({ ...env, VIBESANE_JOB_STORE_NAMESPACE: 'foxy-codex' }, home),
    expected,
  );
  assert.notEqual(
    resolveJobStoreDirectory({ ...env, VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify(['/workspace/repo-b']) }, home),
    expected,
  );
  const customBase = path.join(home, 'custom-store');
  const customExpected = path.join(customBase, 'foxy-cursor-' + scope);
  assert.equal(
    resolveJobStoreDirectory({ ...env, VIBESANE_JOB_STORE_DIR: customBase }, home),
    customExpected,
    'a custom state root must preserve host and authorized-root namespacing',
  );
  assert.notEqual(
    resolveJobStoreDirectory({
      ...env,
      VIBESANE_JOB_STORE_NAMESPACE: 'foxy-codex',
      VIBESANE_JOB_STORE_DIR: customBase,
    }, home),
    customExpected,
    'custom storage paths must not collapse separate host namespaces',
  );
  assert.throws(
    () => resolveJobStoreDirectory({ ...env, VIBESANE_JOB_STORE_NAMESPACE: '../escape' }, home),
    /VIBESANE_JOB_STORE_NAMESPACE must be/,
  );
  assert.throws(
    () => resolveJobStoreDirectory({ ...env, VIBESANE_JOB_STORE_DIR: 'relative-store' }, home),
    /must be an absolute local base directory/,
  );
});

test('exposes only documented read-only tools with strict input schemas', () => {
  assert.deepEqual(TOOL_DEFS.map((tool) => tool.name), [
    'scan_changed', 'list_findings', 'verify_remediation', 'explain_finding', 'status',
  ]);
  for (const tool of TOOL_DEFS) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
});

test('guidance is deterministic, bounded and security-scoped', () => {
  const first = explainFinding('hardcoded_secret');
  const second = explainFinding('hardcoded_secret');
  assert.deepEqual(first, second);
  assert.match(first.mitigation, /rotate|revoke/i);
  assert.match(first.avoid, /Do not commit/i);
  assert.match(first.review, /human/i);
  assert.equal(first.securityGuarantee, false);
  assert.equal(explainFinding('unknown_rule').securityGuarantee, false);
  assert.throws(() => explainFinding('x'.repeat(101)));
});

test('scanner report requires exact non-empty changed-file coverage', () => {
  const valid = {
    status: 'complete',
    filesScanned: 1,
    scannedPaths: ['src/api.js'],
    findings: [{ filePath: 'src/api.js', line: 12, check: 'unsafe_sql_template', severity: 'High', title: 'Potential SQL injection', recommendation: 'Use parameters.' }],
  };
  const result = normalizeReport(valid, ['src/api.js']);
  assert.equal(result.status, 'complete');
  assert.equal(result.filesScanned, 1);
  assert.equal(result.findings[0].ruleId, 'unsafe_sql_template');
  assert.equal(result.findings[0].severity, 'High');
  assert.equal(result.securityGuarantee, false);
  assert.equal(JSON.stringify(result).includes('Potential SQL injection'), true);
  assert.throws(() => normalizeReport(valid, ['src/other.js']));
  assert.throws(() => normalizeReport({ ...valid, scannedPaths: ['src/api.js', 'src/missing.js'], filesScanned: 2 }, ['src/api.js']));
  assert.throws(() => normalizeReport({ ...valid, filesScanned: 0, scannedPaths: [], findings: [] }, []));
  assert.throws(() => normalizeReport({ ...valid, status: 'error' }, ['src/api.js']));
  const crowded = { ...valid, findings: Array.from({ length: 60 }, (_, index) => ({
    filePath: 'src/api.js', line: index + 1, ruleId: 'rule-' + index, severity: 'Low', title: 'Finding ' + index,
  })) };
  const bounded = normalizeReport(crowded, ['src/api.js']);
  assert.equal(bounded.status, 'partial_coverage');
  assert.equal(bounded.findings.length, 50);
  assert.equal(bounded.totalFindings, 60);
  assert.equal(bounded.findingsTruncated, true);
  assert.throws(() => normalizeReport({ ...valid, scannedPaths: ['../outside.js'] }, ['../outside.js']));
  assert.throws(() => normalizeReport({ ...valid, scannedPaths: ['src/api.js', 'src/api.js'], filesScanned: 2 }, ['src/api.js']));
});

test('scanner report sanitizes unknown severity and excludes source excerpts', () => {
  const result = normalizeReport({
    status: 'complete',
    filesScanned: 1,
    scannedPaths: ['src/config.js'],
    findings: [{
      filePath: 'src/config.js', line: 4, ruleId: 'secret', severity: 'Injected',
      title: 'Secret candidate', description: 'RAW_SECRET_SHOULD_NOT_LEAK',
      sourceExcerpt: 'const apiKey = "RAW_SECRET_SHOULD_NOT_LEAK"',
    }],
  }, ['src/config.js']);
  assert.equal(result.findings[0].severity, 'Unknown');
  assert.equal(JSON.stringify(result).includes('RAW_SECRET_SHOULD_NOT_LEAK'), false);
});

test('finding comparison distinguishes removed, remaining and newly introduced findings', () => {
  const make = (filePath, ruleId, title = ruleId) => ({ filePath, ruleId, title });
  const baseline = [make('a.js', 'secret'), make('b.js', 'rls')];
  const current = [make('b.js', 'rls'), make('c.js', 'sql')];
  const result = compareFindings(baseline, current);
  assert.deepEqual(result.removed.map((item) => item.filePath), ['a.js']);
  assert.deepEqual(result.remaining.map((item) => item.filePath), ['b.js']);
  assert.deepEqual(result.newFindings.map((item) => item.filePath), ['c.js']);
  const duplicates = compareFindings(
    [make('same.py', 'python_shell_injection', 'Potential command injection')],
    [
      { ...make('same.py', 'python_shell_injection', 'Potential command injection'), line: 4 },
      { ...make('same.py', 'python_shell_injection', 'Potential command injection'), line: 18 },
    ],
  );
  assert.equal(duplicates.removed.length, 1);
  assert.equal(duplicates.newFindings.length, 2);
  const multiplicity = compareFindings(
    [make('dup.js', 'rule-x', 'same finding'), make('dup.js', 'rule-x', 'same finding')],
    [make('dup.js', 'rule-x', 'same finding')],
  );
  assert.equal(multiplicity.remaining.length, 1);
  assert.equal(multiplicity.removed.length, 1);
  assert.equal(multiplicity.newFindings.length, 0);
  const moved = compareFindings(
    [make('move.js', 'rule-move', 'finding at old line')],
    [{ ...make('move.js', 'rule-move', 'finding at old line'), line: 99 }],
  );
  assert.equal(moved.remaining.length, 1);
  assert.equal(moved.removed.length, 0);
  assert.equal(moved.newFindings.length, 0);
});

test('line decoder handles partial frames, CRLF and UTF-8 boundaries', () => {
  const decode = createLineDecoder();
  assert.deepEqual(decode('{"jsonrpc":"2.0","method":"ping","params":{"label":"caf'), []);
  assert.deepEqual(decode('é 世界"}}\r\n{"jsonrpc":"2.0","method":"ping"}\n'), [
    '{"jsonrpc":"2.0","method":"ping","params":{"label":"café 世界"}}',
    '{"jsonrpc":"2.0","method":"ping"}',
  ]);
});

test('line decoder budgets each frame rather than rejecting a valid large message burst', () => {
  const decode = createLineDecoder();
  const burst = Array.from({ length: 30_000 }, (_, index) =>
    JSON.stringify({ jsonrpc: '2.0', method: 'ping', params: { index } })).join('\n') + '\n';
  assert.ok(Buffer.byteLength(burst) > 1_000_000);
  const frames = decode(burst);
  assert.equal(frames.length, 30_000);
  assert.equal(JSON.parse(frames[0]).params.index, 0);
  assert.equal(JSON.parse(frames.at(-1)).params.index, 29_999);
  assert.doesNotThrow(() => decode.end());
});

test('line decoder rejects an oversized individual frame and detects truncated EOF frames', () => {
  const oversized = createLineDecoder();
  assert.throws(() => oversized('x'.repeat(1_000_001)), /message exceeded its size budget/);
  const truncated = createLineDecoder();
  assert.deepEqual(truncated('{"jsonrpc":"2.0"'), []);
  assert.throws(() => truncated.end(), /incomplete JSON-RPC frame/);
  const whitespaceTail = createLineDecoder();
  whitespaceTail(' \r\n  ');
  assert.doesNotThrow(() => whitespaceTail.end());
});

test('already-cancelled scan requests fail before touching a workspace', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    scanChanged({ workspace: '/not-a-real-workspace' }, { signal: controller.signal }),
    { name: 'AbortError' },
  );
});

test('legacy protocol negotiation retains compatible handshake-era versions', () => {
  assert.equal(negotiateProtocol('2025-11-25'), '2025-11-25');
  assert.equal(negotiateProtocol('2025-06-18'), '2025-06-18');
  assert.equal(negotiateProtocol('unknown-version'), '2025-11-25');
});

const modernMeta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'agentshield-test', version: '1.0.0' },
};

test('modern stateless discovery advertises protocol, tools and server identity', async () => {
  const response = await handleMessage({
    jsonrpc: '2.0',
    id: 'discover-1',
    method: 'server/discover',
    params: { _meta: modernMeta },
  });
  assert.equal(response.result.resultType, 'complete');
  assert.equal(response.result.supportedVersions[0], '2026-07-28');
  assert.equal(response.result.capabilities.tools.listChanged, false);
  assert.equal(response.result._meta['io.modelcontextprotocol/serverInfo'].name, 'vibesane-agentshield');
  assert.equal(response.result.cacheScope, 'public');
  assert.ok(response.result.ttlMs > 0);
  assert.match(response.result.instructions, /baseline_id/);
});

test('modern tools/list and tools/call include required stateless result metadata', async () => {
  const listed = await handleMessage({
    jsonrpc: '2.0', id: 'tools-1', method: 'tools/list', params: { _meta: modernMeta },
  });
  assert.equal(listed.result.resultType, 'complete');
  assert.equal(listed.result.cacheScope, 'public');
  assert.equal(listed.result.tools.some((tool) => tool.name === 'verify_remediation'), true);

  const called = await handleMessage({
    jsonrpc: '2.0', id: 'call-1', method: 'tools/call',
    params: { name: 'explain_finding', arguments: { rule_id: 'rls' }, _meta: modernMeta },
  });
  assert.equal(called.result.resultType, 'complete');
  assert.equal(called.result._meta['io.modelcontextprotocol/serverInfo'].version, '0.7.0-beta.5');
  const payload = JSON.parse(called.result.content[0].text);
  assert.equal(payload.ruleId, 'rls');
});

test('legacy requests retain compatibility and modern requests require valid per-request metadata', async () => {
  const legacy = await handleMessage({ jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} });
  assert.equal(legacy.result.tools.length, TOOL_DEFS.length);
  const missingCapabilities = await handleMessage({
    jsonrpc: '2.0', id: 11, method: 'tools/list',
    params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
  });
  assert.equal(missingCapabilities.error.code, -32602);
  const wrongEra = await handleMessage({
    jsonrpc: '2.0', id: 9, method: 'tools/list',
    params: { _meta: { ...modernMeta, 'io.modelcontextprotocol/protocolVersion': '2024-11-05' } },
  });
  assert.equal(wrongEra.error.code, -32022);
  assert.deepEqual(wrongEra.error.data.supported, ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26']);
  const modernPing = await handleMessage({
    jsonrpc: '2.0', id: 10, method: 'ping', params: { _meta: modernMeta },
  });
  assert.equal(modernPing.error.code, -32601);
});

test('initialize responds with instructions and negotiated protocol', async () => {
  const result = await handleMessage({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  });
  assert.equal(result.result.protocolVersion, '2025-06-18');
  assert.equal(result.result.serverInfo.name, 'vibesane-agentshield');
  assert.match(result.result.instructions, /verify_remediation/);
  assert.deepEqual(result.result.capabilities.tools, { listChanged: false });
});

test('notifications are ignored and do not cause tool execution', async () => {
  assert.equal(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.equal(await handleMessage({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }), null);
});

test('JSON-RPC and tool schemas reject malformed input and unexpected keys', async () => {
  assert.equal(validateRpcMessage({ jsonrpc: '2.0', method: 'ping', id: 1 }), true);
  assert.equal(validateRpcMessage([]), false);
  assert.equal(validateRpcMessage({ jsonrpc: '1.0', method: 'ping' }), false);
  assert.equal(validateRpcMessage({ jsonrpc: '2.0', method: 'x'.repeat(201) }), false);
  assert.equal(validateRpcMessage({ jsonrpc: '2.0', method: 'ping', id: { invalid: true } }), false);
  assert.equal(validateToolArguments('status', {}), true);
  assert.equal(validateToolArguments('status', { extra: true }), false);
  assert.equal(validateToolArguments('scan_changed', { workspace: '/repo' }), true);
  assert.equal(validateToolArguments('scan_changed', { workspace: 'relative/path' }), false);
  assert.equal(validateToolArguments('scan_changed', { workspace: '/repo', base_ref: 'origin/main' }), true);
  assert.equal(validateToolArguments('scan_changed', { workspace: '/repo', base_ref: '../main' }), false);
  assert.equal(validateToolArguments('scan_changed', { workspace: '/repo', extra: true }), false);
  assert.equal(validateToolArguments('list_findings', { workspace: '/repo', scan_id: 'scan-identifier-123' }), true);
  assert.equal(validateToolArguments('list_findings', { workspace: '/repo', scan_id: 'scan-identifier-123', base_ref: 'agentshield-base' }), true);
  assert.equal(validateToolArguments('list_findings', { workspace: '/repo' }), false);
  assert.equal(validateToolArguments('list_findings', { workspace: '/repo', scan_id: 'short' }), false);
  assert.equal(validateToolArguments('list_findings', { workspace: '/repo', scan_id: 'scan-identifier-123', extra: true }), false);
  assert.equal(validateToolArguments('verify_remediation', { workspace: '/repo', baseline_id: 'scan-identifier-123' }), true);
  assert.equal(validateToolArguments('verify_remediation', { workspace: '/repo', baseline_id: 'scan-identifier-123', base_ref: 'agentshield-base' }), true);
  assert.equal(validateToolArguments('verify_remediation', { workspace: '/repo' }), false);
  assert.equal(validateToolArguments('verify_remediation', { workspace: '/repo', baseline_id: 'short' }), false);
  assert.equal(validateToolArguments('explain_finding', { rule_id: 'rls' }), true);
  assert.equal(validateToolArguments('unknown', {}), false);
});

test('unknown methods return JSON-RPC method-not-found errors', async () => {
  const result = await handleMessage({ jsonrpc: '2.0', id: 7, method: 'not/a/method' });
  assert.equal(result.error.code, -32601);
});

test('MCP SDK stdio process speaks newline-delimited JSON-RPC after a legacy initialize handshake', async () => {
  const script = fileURLToPath(new URL('./agentshield-mcp-stdio.mjs', import.meta.url));
  const store = await mkdtemp(path.join(os.tmpdir(), 'agentshield-mcp-protocol-state-'));
  const child = spawn(process.execPath, [script], { env: { ...process.env, VIBESANE_JOB_STORE_DIR: store }, stdio: ['pipe', 'pipe', 'pipe'] });
  const stdout = [];
  const stderr = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
  child.stdin.end([
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    '',
  ].join('\n'));
  try {
  const exitCode = await closed;
  const output = stdout.join('');
  assert.equal(exitCode, 0, stderr.join(''));
  assert.equal(output.includes('Content-Length:'), false);
  const messages = output.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(messages.length, 2);
  assert.equal(messages[0].result.protocolVersion, '2025-11-25');
  assert.equal(messages[0].result.serverInfo.name, 'vibesane-agentshield');
  assert.equal(messages[1].result.tools.some((tool) => tool.name === 'verify_remediation'), true);
  assert.equal(messages[1].result.tools.some((tool) => tool.name === 'scan_start'), true);
  } finally { await rm(store, { recursive: true, force: true }); }
});

test('MCP stdio cancellation notification suppresses a queued scan response', async () => {
  const script = fileURLToPath(new URL('./agentshield-mcp-stdio.mjs', import.meta.url));
  const store = await mkdtemp(path.join(os.tmpdir(), 'agentshield-mcp-cancel-state-'));
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([os.tmpdir()]),
      VIBESANE_JOB_STORE_DIR: store },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => resolve(code));
  });
  child.stdin.end([
    JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'tools/call', params: {
      name: 'scan_changed', arguments: { workspace: path.join(os.tmpdir(), 'cancelled-synthetic-workspace') },
    } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 11 } }),
    JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'ping' }),
    '',
  ].join('\n'));
  try {
  assert.equal(await closed, 0, stderr);
  const responses = output.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.deepEqual(responses.map((message) => message.id), [10, 12]);
  assert.equal(responses[0].result.protocolVersion, '2025-11-25');
  assert.deepEqual(responses[1].result, {});
  } finally { await rm(store, { recursive: true, force: true }); }
});


test('MCP returns UNKNOWN when the workspace has no changed files', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-mcp-empty-'));
  try {
    await exec('git', ['init', '-q', root]);
    await exec('git', ['-C', root, 'config', 'user.name', 'AgentShield Test']);
    await exec('git', ['-C', root, 'config', 'user.email', 'agentshield-test@example.invalid']);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'app.js'), 'export const unchanged = true;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'synthetic clean baseline']);
    const result = await scanChanged({ workspace: root });
    assert.equal(result.status, 'no_changed_files');
    assert.equal(result.securityGuarantee, false);
    assert.deepEqual(result.scannedPaths, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP workspace snapshot includes committed base-to-HEAD changes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-mcp-base-ref-'));
  try {
    await exec('git', ['init', '-q', root]);
    await exec('git', ['-C', root, 'branch', '-M', 'main']);
    await exec('git', ['-C', root, 'config', 'user.name', 'AgentShield Test']);
    await exec('git', ['-C', root, 'config', 'user.email', 'agentshield-test@example.invalid']);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'app.js'), 'export const safe = true;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'synthetic base']);
    await exec('git', ['-C', root, 'branch', 'agentshield-base']);
    await writeFile(path.join(root, 'src', 'app.js'), 'export const changed = true;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'committed change']);

    const snapshot = await workspaceSnapshot(root, undefined, 'agentshield-base');
    assert.deepEqual(snapshot.changedPaths, ['src/app.js']);
    assert.deepEqual(snapshot.candidatePaths, ['src/app.js']);
    assert.equal(snapshot.baseCommit.length, 40);
    assert.notEqual(snapshot.fingerprint, (await workspaceSnapshot(root)).fingerprint);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP rejects base_ref at HEAD and base refs from unrelated history', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-mcp-invalid-base-'));
  try {
    await exec('git', ['init', '-q', root]);
    await exec('git', ['-C', root, 'branch', '-M', 'main']);
    await exec('git', ['-C', root, 'config', 'user.name', 'AgentShield Test']);
    await exec('git', ['-C', root, 'config', 'user.email', 'agentshield-test@example.invalid']);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'app.js'), 'export const main = true;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'main base']);
    await assert.rejects(
      workspaceSnapshot(root, undefined, 'main'),
      /current HEAD/,
    );

    await exec('git', ['-C', root, 'checkout', '--orphan', 'unrelated-base']);
    await exec('git', ['-C', root, 'rm', '-rf', '.']);
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'independent.js'), 'export const independent = true;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'unrelated history']);
    await exec('git', ['-C', root, 'checkout', '-q', 'main']);
    await assert.rejects(
      workspaceSnapshot(root, undefined, 'unrelated-base'),
      /ancestor of HEAD/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP committed-diff scan, list and verification retain the same base-ref scope', async (t) => {
  if ((await statusTool()).status !== 'ready') {
    t.skip('Build the standalone scanner before MCP scan acceptance tests.');
    return;
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-mcp-base-loop-'));
  try {
    await exec('git', ['init', '-q', root]);
    await exec('git', ['-C', root, 'branch', '-M', 'main']);
    await exec('git', ['-C', root, 'config', 'user.name', 'AgentShield Test']);
    await exec('git', ['-C', root, 'config', 'user.email', 'agentshield-test@example.invalid']);
    await mkdir(path.join(root, 'src'));
    const source = path.join(root, 'src', 'app.js');
    await writeFile(source, 'export const version = 1;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'synthetic base']);
    await exec('git', ['-C', root, 'branch', 'agentshield-base']);
    await writeFile(source, 'export const version = 2;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'committed update']);

    const first = await scanChanged({ workspace: root, base_ref: 'agentshield-base' });
    assert.equal(first.status, 'complete');
    assert.ok(first.scanId);
    assert.equal(first.baseRef.length, 40);
    const wrongScopeList = await listFindings(root, first.scanId);
    assert.equal(wrongScopeList.status, 'rescan_required');
    const listed = await listFindings(root, first.scanId, { baseRef: 'agentshield-base' });
    assert.equal(listed.status, 'complete');
    assert.equal(listed.scanId, first.scanId);
    const wrongScopeVerify = await verifyRemediation(root, first.scanId);
    assert.equal(wrongScopeVerify.status, 'verification_incomplete');
    assert.match(wrongScopeVerify.note, /base_ref scope differs/i);

    await writeFile(source, 'export const version = 3;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'second committed update']);
    const verified = await verifyRemediation(root, first.scanId, { baseRef: 'agentshield-base' });
    assert.equal(verified.status, 'rescan_clean');
    assert.ok(verified.currentScanId);
    const currentBaseline = await listFindings(root, verified.currentScanId, { baseRef: 'agentshield-base' });
    assert.equal(currentBaseline.status, 'complete');
    assert.equal(currentBaseline.baseRef.length, 40);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP baselines invalidate and report partial coverage when ignored paths change', async (t) => {
  if ((await statusTool()).status !== 'ready') {
    t.skip('Build the standalone scanner before MCP baseline lifecycle tests.');
    return;
  }
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-mcp-ignored-baseline-'));
  try {
    await exec('git', ['init', '-q', root]);
    await exec('git', ['-C', root, 'branch', '-M', 'main']);
    await exec('git', ['-C', root, 'config', 'user.name', 'AgentShield Test']);
    await exec('git', ['-C', root, 'config', 'user.email', 'agentshield-test@example.invalid']);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'app.js'), 'export const safe = true;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'synthetic base']);
    await exec('git', ['-C', root, 'branch', 'agentshield-base']);
    await writeFile(path.join(root, 'src', 'app.js'), 'export const changed = true;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'supported source change']);

    const baselineSnapshot = await workspaceSnapshot(root, undefined, 'agentshield-base');
    const baseline = await scanChanged({ workspace: root, base_ref: 'agentshield-base' });
    assert.equal(baseline.status, 'complete');
    assert.ok(baseline.scanId);

    await mkdir(path.join(root, 'vendor'));
    await writeFile(path.join(root, 'vendor', 'generated.js'), 'export const ignored = true;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'ignored directory change']);

    const snapshot = await workspaceSnapshot(root, undefined, 'agentshield-base');
    assert.deepEqual(snapshot.ignoredChangedPaths, ['vendor/generated.js']);
    assert.notEqual(snapshot.fingerprint, baselineSnapshot.fingerprint);
    const stale = await listFindings(root, baseline.scanId, { baseRef: 'agentshield-base' });
    assert.equal(stale.status, 'rescan_required');

    const rescanned = await scanChanged({ workspace: root, base_ref: 'agentshield-base' });
    assert.equal(rescanned.status, 'partial_coverage');
    assert.equal(rescanned.ignoredChangedFileCount, 1);
    assert.equal(rescanned.scanId, undefined);

    const verification = await verifyRemediation(root, baseline.scanId, { baseRef: 'agentshield-base' });
    assert.equal(verification.status, 'verification_incomplete');
    assert.equal(verification.ignoredChangedFileCount, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('MCP reports partial coverage when only ignored paths change', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-mcp-ignored-only-'));
  try {
    await exec('git', ['init', '-q', root]);
    await exec('git', ['-C', root, 'config', 'user.name', 'AgentShield Test']);
    await exec('git', ['-C', root, 'config', 'user.email', 'agentshield-test@example.invalid']);
    await mkdir(path.join(root, 'vendor'));
    await writeFile(path.join(root, 'vendor', 'generated.js'), 'export const ignored = true;\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'ignored only']);
    await writeFile(path.join(root, 'vendor', 'generated.js'), 'export const changed = true;\n');

    const snapshot = await workspaceSnapshot(root);
    assert.deepEqual(snapshot.candidatePaths, []);
    assert.deepEqual(snapshot.ignoredChangedPaths, ['vendor/generated.js']);
    const result = await scanChanged({ workspace: root });
    assert.equal(result.status, 'partial_coverage');
    assert.equal(result.filesScanned, 0);
    assert.equal(result.ignoredChangedFileCount, 1);
    assert.equal(result.scanId, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('workspace snapshots hash dirty file contents and disclose unsupported changed files', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-mcp-test-'));
  try {
    await exec('git', ['init', '-q', root]);
    await exec('git', ['-C', root, 'config', 'user.name', 'AgentShield Test']);
    await exec('git', ['-C', root, 'config', 'user.email', 'agentshield-test@example.invalid']);
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'app.js'), 'export const safe = true;\n');
    await writeFile(path.join(root, 'README.md'), '# test\n');
    await exec('git', ['-C', root, 'add', '.']);
    await exec('git', ['-C', root, 'commit', '-qm', 'fixture baseline']);

    await writeFile(path.join(root, 'src', 'app.js'), 'export const safe = false;\n');
    await writeFile(path.join(root, 'README.md'), '# changed documentation\n');
    const first = await workspaceSnapshot(root);
    assert.deepEqual(first.candidatePaths, ['src/app.js']);
    assert.deepEqual(first.unsupportedChangedPaths, ['README.md']);

    // Git porcelain stays "modified" for both versions; the content hash must still move.
    await writeFile(path.join(root, 'src', 'app.js'), 'export const safe = true;\n');
    const second = await workspaceSnapshot(root);
    assert.notEqual(first.fingerprint, second.fingerprint);
    assert.deepEqual(second.unsupportedChangedPaths, ['README.md']);
    // Unsupported README content also changes the snapshot while already dirty.
    await writeFile(path.join(root, 'README.md'), '# changed documentation again\n');
    const third = await workspaceSnapshot(root);
    assert.notEqual(second.fingerprint, third.fingerprint);
    assert.deepEqual(third.unsupportedChangedPaths, ['README.md']);

    // Deleted changed source cannot be scanned from current bytes and must fail closed.
    await rm(path.join(root, 'src', 'app.js'));
    await assert.rejects(workspaceSnapshot(root));
  } catch (error) {
    if (error?.code === 'ENOENT') t.skip('Git is required for workspace snapshot tests.');
    else throw error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});



test('Cursor Stop ignores aborted, errored and malformed events without scanning', () => {
  for (const status of ['aborted', 'error', 'unknown', undefined]) {
    assert.deepEqual(cursorStopEligibility({ status, loop_count: 0 }), {
      shouldScan: false, allowFollowup: false,
    });
  }
  assert.deepEqual(cursorStopEligibility({ status: 'completed' }), {
    shouldScan: false, allowFollowup: false,
  });
  assert.deepEqual(cursorStopEligibility({ status: 'completed', loop_count: -1 }), {
    shouldScan: false, allowFollowup: false,
  });
});

test('Cursor Stop follow-ups are bounded by the configured two-iteration budget', () => {
  assert.deepEqual(cursorStopEligibility({ status: 'completed', loop_count: 0 }), {
    shouldScan: true, allowFollowup: true,
  });
  assert.deepEqual(cursorStopEligibility({ status: 'completed', loop_count: 1 }), {
    shouldScan: true, allowFollowup: true,
  });
  assert.deepEqual(cursorStopEligibility({ status: 'completed', loop_count: 2 }), {
    shouldScan: true, allowFollowup: false,
  });
  assert.deepEqual(cursorStopEligibility({ status: 'completed', loop_count: 3 }), {
    shouldScan: true, allowFollowup: false,
  });
});
