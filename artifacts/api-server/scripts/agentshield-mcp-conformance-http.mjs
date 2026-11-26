#!/usr/bin/env node
// Test-only HTTP adapter for the official MCP conformance runner.
// Production Foxy remains local STDIO. This adapter is loopback-only and reuses
// the exact same createFoxyServer factory/tool handlers as the shipped process.
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createServer } from 'node:http';
import { ScanJobQueue } from './agentshield-jobs.mjs';
import { createFoxyConformanceServer } from './agentshield-mcp-conformance-server.mjs';
import { getBaselineProvenance, resolveAuthorizedRoots, scanChanged, scanFull } from './agentshield-mcp-server.mjs';

const HOST = '127.0.0.1';
const MAX_REQUEST_BYTES = 1_000_000;
const bounded = (value, max = 300) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max);

function hostAllowed(value, port) {
  return value === HOST + ':' + port || value === 'localhost:' + port;
}
function originAllowed(value, port) {
  if (!value) return true;
  try {
    const origin = new URL(value);
    return origin.protocol === 'http:' && (origin.host === HOST + ':' + port || origin.host === 'localhost:' + port);
  } catch { return false; }
}
async function readBoundedBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > MAX_REQUEST_BYTES) throw Object.assign(new Error('Request body exceeded the conformance adapter limit.'), { status: 413 });
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
function responseError(response, status, message) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  response.end(message);
}
async function main() {
  if (!process.env.VIBESANE_ALLOWED_ROOTS_JSON) throw new Error('VIBESANE_ALLOWED_ROOTS_JSON is required for the isolated conformance fixture.');
  await resolveAuthorizedRoots();
  const storeDir = process.env.VIBESANE_JOB_STORE_DIR;
  if (typeof storeDir !== 'string' || !storeDir.startsWith('/')) throw new Error('VIBESANE_JOB_STORE_DIR must be an isolated absolute path.');
  const provenance = await getBaselineProvenance();
  const queue = new ScanJobQueue({
    storeDir,
    baselineProvenance: provenance,
    concurrency: 1,
    maxQueued: 4,
    timeoutMs: 30_000,
    runner: (input, options) => input.scope === 'full'
      ? scanFull({ workspace: input.workspace }, options)
      : scanChanged(input, options),
  });
  await queue.init();
  // Build a fresh McpServer for each HTTP request as required by the SDK's
  // per-request transport model. All requests still share one bounded queue.
  const handler = createMcpHandler(() => createFoxyConformanceServer(queue), {
    legacy: 'stateless',
    onerror: (error) => process.stderr.write('Foxy conformance adapter: ' + bounded(error?.message || error) + '\n'),
  });
  const server = createServer((request, response) => {
    void (async () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      if (!hostAllowed(request.headers.host || '', port) || !originAllowed(request.headers.origin || '', port)) {
        responseError(response, 403, 'Origin or Host is not authorized.');
        return;
      }
      if (request.url !== '/mcp' && request.url !== '/mcp/') {
        responseError(response, 404, 'Not found.');
        return;
      }
      const headers = new Headers();
      for (const [name, raw] of Object.entries(request.headers)) {
        if (['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'expect'].includes(name)) continue;
        if (typeof raw === 'string') headers.set(name, raw);
        else if (Array.isArray(raw)) headers.set(name, raw.join(', '));
      }
      const method = request.method || 'GET';
      const body = ['GET', 'HEAD'].includes(method) ? undefined : await readBoundedBody(request);
      const webRequest = new Request('http://' + request.headers.host + request.url, {
        method,
        headers,
        ...(body?.byteLength ? { body } : {}),
      });
      const result = await handler.fetch(webRequest);
      response.statusCode = result.status;
      result.headers.forEach((value, name) => response.setHeader(name, value));
      if (result.body && !['204', '304'].includes(String(result.status))) {
        for await (const chunk of result.body) {
          if (!response.write(Buffer.from(chunk))) await new Promise(resolve => response.once('drain', resolve));
        }
      }
      response.end();
    })().catch((error) => {
      if (response.headersSent) { response.destroy(); return; }
      responseError(response, Number.isInteger(error?.status) ? error.status : 500, 'Conformance adapter request failed.');
    });
  });
  const requestedPort = Number(process.env.FOXY_CONFORMANCE_PORT || 0);
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw new Error('Invalid FOXY_CONFORMANCE_PORT.');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, HOST, resolve);
  });
  const address = server.address();
  if (!address || typeof address !== 'object') throw new Error('Conformance adapter did not bind a TCP port.');
  process.stdout.write(JSON.stringify({ status: 'ready', url: 'http://' + HOST + ':' + address.port + '/mcp' }) + '\n');
  const close = async () => {
    await new Promise(resolve => server.close(() => resolve()));
    await handler.close?.();
    await queue.close();
  };
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void close().then(() => { process.exitCode = 0; }, () => { process.exitCode = 1; });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
main().catch((error) => {
  process.stderr.write('Foxy MCP conformance adapter failed: ' + bounded(error?.message || error) + '\n');
  process.exitCode = 1;
});
