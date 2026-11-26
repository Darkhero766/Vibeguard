/**
 * Builds the isolated conformance-only MCP server.
 *
 * Never called by the production STDIO entrypoint. This factory reuses the
 * exact Foxy tool factory, then adds deterministic sample capabilities solely
 * for the frozen official conformance profile. Its fixture catalog is not
 * shipped in the beta archive.
 */
import { randomBytes } from 'node:crypto';
import { createRequestStateCodec } from '@modelcontextprotocol/server';
import { createFoxyServer } from './agentshield-mcp-sdk.mjs';
import { registerFoxyConformanceFixtures } from './agentshield-mcp-conformance-fixtures.mjs';

const requestStateCodec = createRequestStateCodec({
  key: randomBytes(32),
  ttlSeconds: 600,
});

export function createFoxyConformanceServer(queue) {
  const server = createFoxyServer(queue, {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      completions: {},
    },
    requestState: { verify: requestStateCodec.verify },
  });
  registerFoxyConformanceFixtures(server, requestStateCodec);
  return server;
}
