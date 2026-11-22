import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  TOOL_DEFS,
  compareFindings,
  createLineDecoder,
  explainFinding,
  handleMessage,
  negotiateProtocol,
  normalizeReport,
  scanChanged,
  validateRpcMessage,
  validateToolArguments,
  workspaceSnapshot,
} from './agentshield-mcp-server.mjs';

const exec = promisify(execFile);

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
  assert.match(response.result.instructions, /verify_remediation/);
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
  assert.equal(called.result._meta['io.modelcontextprotocol/serverInfo'].version, '0.7.0-beta.3');
  const payload = JSON.parse(called.result.content[0].text);
  assert.equal(payload.ruleId, 'rls');
});

test('modern requests require per-request protocol metadata', async () => {
  const result = await handleMessage({ jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} });
  assert.equal(result.error.code, -32602);
  const wrongEra = await handleMessage({
    jsonrpc: '2.0', id: 9, method: 'tools/list',
    params: { _meta: { ...modernMeta, 'io.modelcontextprotocol/protocolVersion': '2025-11-25' } },
  });
  assert.equal(wrongEra.error.code, -32001);
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
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: modernMeta } }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: modernMeta } }),
    JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }),
    JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    '',
  ].join('\n'));
  const exitCode = await closed;
  const output = stdout.join('');
  assert.equal(exitCode, 0, stderr.join(''));
  assert.equal(output.includes('Content-Length:'), false);
  const messages = output.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(messages.length, 4);
  assert.equal(messages[0].result.supportedVersions[0], '2026-07-28');
  assert.equal(messages[1].result.resultType, 'complete');
  assert.equal(messages[2].result.serverInfo.name, 'vibesane-agentshield');
  assert.equal(messages[3].result.tools.some((tool) => tool.name === 'verify_remediation'), true);
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
