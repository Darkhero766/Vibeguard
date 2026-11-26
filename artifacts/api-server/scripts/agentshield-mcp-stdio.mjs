#!/usr/bin/env node
import { serveFoxyStdio } from './agentshield-mcp-sdk.mjs';

serveFoxyStdio().catch((error) => {
  process.stderr.write('Foxy MCP server could not start: ' + String(error?.message || 'startup failed').slice(0, 200) + '\n');
  process.exitCode = 1;
});
