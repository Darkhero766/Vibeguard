import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'dist', 'public', 'foxy', 'index.html'), 'utf8');
for (const token of [
  '<title>Foxy — Local-First MCP Security for AI Coding Agents | VibeSane</title>',
  'Your AI agent.', 'A safer workspace.', 'Claude Code', 'Codex CLI', 'Cursor',
  'Gemini CLI', 'Roo Code', 'GitHub Copilot', 'vibesane connect',
  'vibesane disconnect --agent all', 'Read-only MCP tools',
  'canonical Git root', 'passed source-matched automated release qualification', 'not a security certification',
  'https://github.com/Darkhero766/Vibeguard/pull/70',
]) assert.ok(html.includes(token), 'Foxy SEO route is missing: ' + token);
assert.match(html, /application\/ld\+json/);
assert.match(html, /<link rel="canonical" href="https:\/\/vibesane\.app\/foxy"/);
console.log('Foxy page route, crawlable content, metadata and qualification boundaries passed.');
