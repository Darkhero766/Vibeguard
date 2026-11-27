import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'dist', 'public', 'foxy', 'index.html'), 'utf8');

for (const token of [
  '<title>Foxy — Local-First MCP Security for AI Coding Agents | VibeSane</title>',
  'Security context for your AI agent.', 'Not extra authority.',
  'Claude Code', 'Codex CLI', 'Cursor', 'Gemini CLI', 'Roo Code', 'GitHub Copilot',
  'vibesane connect --agent auto', 'vibesane disconnect --agent all',
  'Read-only MCP tools', 'canonical Git root',
  '429 / 429', '12 / 12', 'Regression suite', 'Connector regressions', 'Windows + macOS',
  'Live authenticated acceptance', 'independent review',
  'https://github.com/Darkhero766/Vibeguard/actions/workflows/agentshield-cross-platform.yml?query=branch%3Afeat%2Fagentshield-cross-platform-autoconnect',
  'https://github.com/Darkhero766/Vibeguard/pull/70', 'chat.mcp.workspaceRootConfig.enabled', '.mcp.json',
]) assert.ok(html.includes(token), 'Foxy SEO route is missing: ' + token);

assert.match(html, /<main id="main-content"/);
assert.match(html, /id="connect"/);
assert.match(html, /id="security-model"/);
assert.match(html, /id="qualification"/);
assert.match(html, /application\/ld\+json/);
assert.match(html, /<link rel="canonical" href="https:\/\/vibesane\.app\/foxy"/);
assert.match(html, /max-w-\[1180px\]/);
assert.match(html, /font-sans/);
assert.ok(html.includes('Node.js 24.15+'), 'Static Foxy page must state the supported Node.js runtime.');
assert.ok(html.includes('HISTORICAL / BETA.4'), 'Prior beta.4 metrics must be labeled historical.');
assert.ok(html.includes('beta.5 exact-source CI pending'), 'The beta.5 qualification gate must remain visible.');
assert.ok(html.includes('#0b1112') && html.includes('#c7f36a'), 'Static page must match the graphite/lime visual system.');
assert.ok(!html.includes('Node.js 20+'), 'Static page must not advertise the obsolete runtime floor.');
assert.ok(!html.includes('The current candidate passed automated release qualification'), 'Historical beta.4 CI must not be attributed to beta.5.');
console.log('Foxy page route, responsive theme, qualification evidence, semantics and metadata passed.');
