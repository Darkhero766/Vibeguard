import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TOOL_DEFS,
  compareFindings,
  createLineDecoder,
  explainFinding,
  handleMessage,
  negotiateProtocol,
  normalizeReport,
  validateRpcMessage,
  validateToolArguments,
} from './agentshield-mcp-server.mjs';

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
});

test('line decoder handles partial frames, CRLF and UTF-8 boundaries', () => {
  const decode = createLineDecoder();
  assert.deepEqual(decode('{"jsonrpc":"2.0","method":"ping","params":{"label":"caf'), []);
  assert.deepEqual(decode('é 世界"}}\r\n{"jsonrpc":"2.0","method":"ping"}\n'), [
    '{"jsonrpc":"2.0","method":"ping","params":{"label":"café 世界"}}',
    '{"jsonrpc":"2.0","method":"ping"}',
  ]);
});

test('protocol negotiation selects supported versions and falls back to latest', () => {
  assert.equal(negotiateProtocol('2025-11-25'), '2025-11-25');
  assert.equal(negotiateProtocol('2025-06-18'), '2025-06-18');
  assert.equal(negotiateProtocol('unknown-version'), '2025-11-25');
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
  assert.equal(validateToolArguments('scan_changed', { workspace: '/repo', extra: true }), false);
  assert.equal(validateToolArguments('verify_remediation', { workspace: '/repo' }), true);
  assert.equal(validateToolArguments('explain_finding', { rule_id: 'rls' }), true);
  assert.equal(validateToolArguments('unknown', {}), false);
});

test('unknown methods return JSON-RPC method-not-found errors', async () => {
  const result = await handleMessage({ jsonrpc: '2.0', id: 7, method: 'not/a/method' });
  assert.equal(result.error.code, -32601);
});

test('MCP stdio process speaks newline-delimited JSON-RPC, never Content-Length frames', async () => {
  const script = fileURLToPath(new URL('./agentshield-mcp-server.mjs', import.meta.url));
  const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'] });
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
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    '',
  ].join('\n'));
  const exitCode = await closed;
  const output = stdout.join('');
  assert.equal(exitCode, 0, stderr.join(''));
  assert.equal(output.includes('Content-Length:'), false);
  const messages = output.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(messages.length, 2);
  assert.equal(messages[0].result.serverInfo.name, 'vibesane-agentshield');
  assert.equal(messages[1].result.tools.some((tool) => tool.name === 'verify_remediation'), true);
});
