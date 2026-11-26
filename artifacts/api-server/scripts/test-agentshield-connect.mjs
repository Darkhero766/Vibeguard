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
  disconnectAgentShield,
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
  for (const name of ['.claude', '.codex', '.cursor', '.gemini', '.roo']) await mkdir(path.join(root, name));
  assert.deepEqual(await detectAgents({
    cwd: root,
    env: { PATH: '', USERPROFILE: root },
    platform: process.platform,
  }), ['claude', 'codex', 'cursor', 'gemini', 'roo']);
  assert.deepEqual(await detectAgents({
    cwd: root,
    env: { PATH: '', USERPROFILE: root, VSCODE_PID: '42' },
    platform: process.platform,
  }), ['claude', 'codex', 'cursor', 'gemini', 'roo', 'copilot']);
});

test('Codex TOML and JSON MCP entries escape Windows paths and keep the allowlist narrow', () => {
  const entry = {
  nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    serverPath: 'C:\\Tools\\VibeSane\\agentshield-mcp-stdio.mjs',
    workspaceRoot: 'D:\\Work\\my repo',
  };
  const toml = buildCodexMcpBlock(entry);
  assert.match(toml, /C:\\\\Program Files\\\\nodejs\\\\node\.exe/);
  assert.ok(toml.includes('env = { VIBESANE_ALLOWED_ROOTS_JSON = ' + JSON.stringify(JSON.stringify([entry.workspaceRoot])) + ' }'));
  const claude = buildJsonMcpEntry({ ...entry, host: 'claude' });
  const cursor = buildJsonMcpEntry({ ...entry, host: 'cursor' });
  const gemini = buildJsonMcpEntry({ ...entry, host: 'gemini' });
  const roo = buildJsonMcpEntry({ ...entry, host: 'roo' });
  assert.equal(claude.command, entry.nodePath);
  const copilot = buildJsonMcpEntry({ ...entry, host: 'copilot' });
  assert.equal(claude.type, 'stdio');
  assert.equal(copilot.type, 'stdio');
  assert.equal(claude.env.VIBESANE_ALLOWED_ROOTS_JSON, JSON.stringify([entry.workspaceRoot]));
  assert.equal(cursor.type, 'stdio');
  assert.equal(cursor.args[0], entry.serverPath);
  assert.equal(gemini.env.VIBESANE_ALLOWED_ROOTS_JSON, JSON.stringify([entry.workspaceRoot]));
  assert.equal(roo.command, entry.nodePath);
});

test('one connect command configures Claude, Codex, Cursor, Gemini, Roo and Copilot while preserving existing settings', async (t) => {
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
  await mkdir(path.join(project, '.gemini'));
  await mkdir(path.join(project, '.roo'));

  const claudeFile = path.join(project, '.mcp.json');
  const cursorFile = path.join(project, '.cursor', 'mcp.json');
  const codexFile = path.join(project, '.codex', 'config.toml');
  const geminiFile = path.join(project, '.gemini', 'settings.json');
  const rooFile = path.join(project, '.roo', 'mcp.json');
  const priorClaude = { mcpServers: { other: { command: 'other-agent', args: [] } }, custom: true };
  const priorCursor = { mcpServers: { existing: { type: 'stdio', command: 'kept', args: [] } } };
  const priorCodex = '[features]\nexperimental = true\n';
  const priorGemini = { theme: 'Dark', mcpServers: { existing: { command: 'gemini-existing', args: [] } } };
  const priorRoo = { mcpServers: { existing: { command: 'roo-existing', args: [] } } };
  await writeFile(claudeFile, JSON.stringify(priorClaude, null, 2));
  await writeFile(cursorFile, JSON.stringify(priorCursor, null, 2));
  await writeFile(codexFile, priorCodex);
  await writeFile(geminiFile, JSON.stringify(priorGemini, null, 2));
  await writeFile(rooFile, JSON.stringify(priorRoo, null, 2));

  const result = await connectAgentShield(['--agent', 'all', '--cwd', project], {
  nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    serverPath: 'C:\\Tools\\VibeSane\\agentshield-mcp-stdio.mjs',
    platform: 'win32',
    env: { PATH: '', USERPROFILE: home },
  });

  assert.equal(result.status, 'connected');
  assert.deepEqual(result.results.map((item) => item.host), ['claude', 'codex', 'cursor', 'gemini', 'roo']);
  const claude = JSON.parse(await readFile(claudeFile, 'utf8'));
  const cursor = JSON.parse(await readFile(cursorFile, 'utf8'));
  const codex = await readFile(codexFile, 'utf8');
  const gemini = JSON.parse(await readFile(geminiFile, 'utf8'));
  const roo = JSON.parse(await readFile(rooFile, 'utf8'));
  assert.deepEqual(claude.mcpServers.other, priorClaude.mcpServers.other);
  assert.equal(claude.custom, true);
  assert.equal(cursor.mcpServers.existing.command, 'kept');
  assert.equal(gemini.theme, 'Dark');
  assert.equal(gemini.mcpServers.existing.command, 'gemini-existing');
  assert.equal(roo.mcpServers.existing.command, 'roo-existing');
  assert.equal(gemini.mcpServers['vibesane-agentshield'].env.VIBESANE_ALLOWED_ROOTS_JSON, JSON.stringify([await (await import('node:fs/promises')).realpath(project)]));
  assert.equal(roo.mcpServers['vibesane-agentshield'].env.VIBESANE_ALLOWED_ROOTS_JSON, JSON.stringify([await (await import('node:fs/promises')).realpath(project)]));
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


test('one disconnect command removes only exact managed host entries and preserves unrelated config', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-disconnect-'));
  const project = path.join(root, 'project');
  await mkdir(project, { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', project]);
  for (const dir of ['.codex', '.cursor', '.gemini', '.roo']) await mkdir(path.join(project, dir));
  const options = {
    nodePath: process.execPath,
    serverPath: path.join(root, 'agentshield-mcp-stdio.mjs'),
  };
  await writeFile(path.join(project, '.mcp.json'), JSON.stringify({
    mcpServers: { other: { command: 'keep-me', args: [] } },
  }));
  await writeFile(path.join(project, '.cursor', 'mcp.json'), JSON.stringify({
    mcpServers: { other: { command: 'keep-cursor', args: [] } },
  }));
  await writeFile(path.join(project, '.gemini', 'settings.json'), JSON.stringify({
    theme: 'Dark', mcpServers: { other: { command: 'keep-gemini', args: [] } },
  }));
  await writeFile(path.join(project, '.roo', 'mcp.json'), JSON.stringify({
    mcpServers: { other: { command: 'keep-roo', args: [] } },
  }));
  await writeFile(path.join(project, '.codex', 'config.toml'), '[features]\nexperimental = true\n');
  const connected = await connectAgentShield(['--agent', 'all', '--cwd', project], options);
  assert.equal(connected.status, 'connected');

  const removed = await disconnectAgentShield(['--agent', 'all', '--cwd', project], options);
  assert.equal(removed.status, 'disconnected');
  assert.ok(removed.results.every((item) => item.status === 'removed'));
  const claude = JSON.parse(await readFile(path.join(project, '.mcp.json'), 'utf8'));
  const cursor = JSON.parse(await readFile(path.join(project, '.cursor', 'mcp.json'), 'utf8'));
  const gemini = JSON.parse(await readFile(path.join(project, '.gemini', 'settings.json'), 'utf8'));
  const roo = JSON.parse(await readFile(path.join(project, '.roo', 'mcp.json'), 'utf8'));
  const codex = await readFile(path.join(project, '.codex', 'config.toml'), 'utf8');
  assert.deepEqual(Object.keys(claude.mcpServers), ['other']);
  assert.deepEqual(Object.keys(cursor.mcpServers), ['other']);
  assert.deepEqual(Object.keys(gemini.mcpServers), ['other']);
  assert.deepEqual(Object.keys(roo.mcpServers), ['other']);
  assert.ok(codex.startsWith('[features]'));
  assert.ok(!codex.includes('vibesane_agentshield'));
  assert.ok((await readdir(project)).some((file) => file.includes('.vibesane-backup-')));
});
