import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import {
  buildCodexMcpBlock,
  buildJsonMcpEntry,
  connectAgentShield,
  detectAgents,
  parseConnectArgs,
} from './agentshield-connect.mjs';

const exec = promisify(execFile);

test('connect argument parser defaults to automatic detection and rejects unknown hosts', () => {
  assert.deepEqual(parseConnectArgs([]), { agent: 'auto', cwd: process.cwd() });
  assert.equal(parseConnectArgs(['--agent', 'codex']).agent, 'codex');
  assert.throws(() => parseConnectArgs(['--agent', 'unknown']), /Agent must be/);
  assert.throws(() => parseConnectArgs(['--cwd']), /Missing --cwd/);
});

test('agent detection recognizes project markers without launching agents', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-detect-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['.claude', '.codex', '.cursor']) await mkdir(path.join(root, name));
  assert.deepEqual(await detectAgents({
    cwd: root,
    env: { PATH: '', USERPROFILE: root },
    platform: process.platform,
  }), ['claude', 'codex', 'cursor']);
});

test('Codex TOML and JSON MCP entries escape Windows paths and keep the allowlist narrow', () => {
  const entry = {
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    serverPath: 'C:\\Tools\\VibeSane\\agentshield-mcp-stdio.mjs',
    workspaceRoot: 'D:\\Work\\my repo',
  };
  const toml = buildCodexMcpBlock(entry);
  assert.match(toml, /C:\\\\Program Files\\\\nodejs\\\\node\.exe/);
  assert.match(toml, /D:\\\\Work\\\\my repo/);
  const claude = buildJsonMcpEntry({ ...entry, host: 'claude' });
  const cursor = buildJsonMcpEntry({ ...entry, host: 'cursor' });
  assert.equal(claude.command, entry.nodePath);
  assert.equal(claude.env.VIBESANE_ALLOWED_ROOTS_JSON, JSON.stringify([entry.workspaceRoot]));
  assert.equal(cursor.type, 'stdio');
  assert.equal(cursor.args[0], entry.serverPath);
});

test('one connect command configures Claude, Codex and Cursor while preserving existing settings', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-connect-'));
  const home = path.join(root, 'home');
  const project = path.join(root, 'project');
  await mkdir(project);
  await mkdir(home);
  t.after(() => rm(root, { recursive: true, force: true }));

  await exec('git', ['init', project]);
  await mkdir(path.join(project, '.claude'));
  await mkdir(path.join(project, '.codex'));
  await mkdir(path.join(project, '.cursor'));

  const claudeFile = path.join(project, '.mcp.json');
  const cursorFile = path.join(project, '.cursor', 'mcp.json');
  const codexFile = path.join(project, '.codex', 'config.toml');
  const priorClaude = { mcpServers: { other: { command: 'other-agent', args: [] } }, custom: true };
  const priorCursor = { mcpServers: { existing: { type: 'stdio', command: 'kept', args: [] } } };
  const priorCodex = '[features]\nexperimental = true\n';
  await writeFile(claudeFile, JSON.stringify(priorClaude, null, 2));
  await writeFile(cursorFile, JSON.stringify(priorCursor, null, 2));
  await writeFile(codexFile, priorCodex);

  const result = await connectAgentShield(['--agent', 'all', '--cwd', project], {
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    serverPath: 'C:\\Tools\\VibeSane\\agentshield-mcp-stdio.mjs',
    platform: 'win32',
    env: { PATH: '', USERPROFILE: home },
  });

  assert.equal(result.status, 'connected');
  assert.deepEqual(result.results.map((item) => item.host), ['claude', 'codex', 'cursor']);
  const claude = JSON.parse(await readFile(claudeFile, 'utf8'));
  const cursor = JSON.parse(await readFile(cursorFile, 'utf8'));
  const codex = await readFile(codexFile, 'utf8');
  assert.deepEqual(claude.mcpServers.other, priorClaude.mcpServers.other);
  assert.equal(claude.custom, true);
  assert.equal(cursor.mcpServers.existing.command, 'kept');
  assert.equal(claude.mcpServers['vibesane-agentshield'].env.VIBESANE_ALLOWED_ROOTS_JSON, JSON.stringify([await (await import('node:fs/promises')).realpath(project)]));
  assert.match(codex, /\[mcp_servers\.vibesane_agentshield\]/);
  assert.match(codex, /C:\\\\Program Files\\\\nodejs\\\\node\.exe/);
  assert.ok(codex.startsWith(priorCodex));

  // Re-running is idempotent and never duplicates a Codex managed block.
  const again = await connectAgentShield(['--agent', 'all', '--cwd', project], {
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    serverPath: 'C:\\Tools\\VibeSane\\agentshield-mcp-stdio.mjs',
    platform: 'win32',
    env: { PATH: '', USERPROFILE: home },
  });
  assert.ok(again.results.every((item) => item.status === 'already_configured'));
  const codexAgain = await readFile(codexFile, 'utf8');
  assert.equal(codexAgain.split('BEGIN VIBESANE AGENTSHIELD MANAGED MCP ENTRY').length - 1, 1);

  const files = await readdir(project);
  assert.ok(files.some((file) => file.includes('.vibesane-backup-')));
});

test('generic MCP mode returns a stdio entry scoped to the selected repository', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-generic-'));
  const project = path.join(root, 'project');
  await mkdir(project, { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', project]);
  const result = await connectAgentShield(['--agent', 'mcp', '--cwd', project], {
    nodePath: process.execPath,
    serverPath: path.join(root, 'agentshield-mcp-stdio.mjs'),
  });
  assert.equal(result.status, 'manual_mcp_configuration');
  assert.equal(result.server.env.VIBESANE_ALLOWED_ROOTS_JSON, JSON.stringify([await (await import('node:fs/promises')).realpath(project)]));
});
