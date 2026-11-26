import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import {
  buildCodexMcpBlock,
  buildJsonMcpEntry,
  jobStoreNamespaceForHost,
  connectAgentShield,
  disconnectAgentShield,
  detectAgents,
  parseConnectArgs,
} from './agentshield-connect.mjs';

const exec = promisify(execFile);
const cliPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vibesane.mjs');

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

  const bin = path.join(root, 'bin');
  await mkdir(bin);
  const executable = path.join(bin, 'copilot' + (process.platform === 'win32' ? '.cmd' : ''));
  await writeFile(executable, '');
  assert.deepEqual(await detectAgents({
    cwd: root,
    env: { PATH: bin, USERPROFILE: root },
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
  assert.ok(toml.includes('VIBESANE_ALLOWED_ROOTS_JSON = ' + JSON.stringify(JSON.stringify([entry.workspaceRoot]))));
  assert.match(toml, /VIBESANE_JOB_STORE_NAMESPACE = "foxy-codex"/);
  const claude = buildJsonMcpEntry({ ...entry, host: 'claude' });
  const cursor = buildJsonMcpEntry({ ...entry, host: 'cursor' });
  const gemini = buildJsonMcpEntry({ ...entry, host: 'gemini' });
  const roo = buildJsonMcpEntry({ ...entry, host: 'roo' });
  assert.equal(claude.command, entry.nodePath);
  const copilot = buildJsonMcpEntry({ ...entry, host: 'copilot' });
  assert.equal(claude.type, 'stdio');
  assert.equal(copilot.type, 'stdio');
  assert.equal(claude.env.VIBESANE_ALLOWED_ROOTS_JSON, JSON.stringify([entry.workspaceRoot]));
  assert.equal(claude.env.VIBESANE_JOB_STORE_NAMESPACE, 'foxy-workspace-mcp');
  assert.equal(cursor.type, 'stdio');
  assert.equal(cursor.args[0], entry.serverPath);
  assert.equal(gemini.env.VIBESANE_ALLOWED_ROOTS_JSON, JSON.stringify([entry.workspaceRoot]));
  assert.equal(gemini.env.VIBESANE_JOB_STORE_NAMESPACE, 'foxy-gemini');
  assert.equal(cursor.env.VIBESANE_JOB_STORE_NAMESPACE, 'foxy-cursor');
  assert.equal(roo.env.VIBESANE_JOB_STORE_NAMESPACE, 'foxy-roo');
  assert.equal(copilot.env.VIBESANE_JOB_STORE_NAMESPACE, claude.env.VIBESANE_JOB_STORE_NAMESPACE);
  assert.equal(roo.command, entry.nodePath);

  assert.deepEqual(
    ['claude', 'copilot', 'codex', 'cursor', 'gemini', 'roo'].map(jobStoreNamespaceForHost),
    ['foxy-workspace-mcp', 'foxy-workspace-mcp', 'foxy-codex', 'foxy-cursor', 'foxy-gemini', 'foxy-roo'],
  );
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
  assert.deepEqual(result.results.map((item) => item.host), ['claude', 'codex', 'cursor', 'gemini', 'roo', 'copilot']);
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
  assert.equal(claude.mcpServers['vibesane-agentshield'].env.VIBESANE_JOB_STORE_NAMESPACE, 'foxy-workspace-mcp');
  assert.equal(gemini.mcpServers['vibesane-agentshield'].env.VIBESANE_JOB_STORE_NAMESPACE, 'foxy-gemini');
  assert.equal(roo.mcpServers['vibesane-agentshield'].env.VIBESANE_JOB_STORE_NAMESPACE, 'foxy-roo');
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
  assert.equal(result.server.env.VIBESANE_JOB_STORE_NAMESPACE, 'foxy-manual');
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
  assert.deepEqual(removed.results.map((item) => item.status), ['removed', 'removed', 'removed', 'removed', 'removed', 'shared_config']);
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


test('connect migrates exact legacy JSON and Codex entries to isolated namespaces without losing unrelated settings', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-connect-migrate-'));
  const project = path.join(root, 'project');
  await mkdir(path.join(project, '.codex'), { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', project]);
  const realRoot = await (await import('node:fs/promises')).realpath(project);
  const nodePath = process.execPath;
  const serverPath = path.join(root, 'agentshield-mcp-stdio.mjs');
  const legacyJson = {
    mcpServers: {
      'vibesane-agentshield': {
        type: 'stdio',
        command: nodePath,
        args: [serverPath],
        env: { VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([realRoot]) },
      },
      unrelated: { command: 'keep-me', args: [] },
    },
    custom: true,
  };
  const jsonFile = path.join(project, '.mcp.json');
  await writeFile(jsonFile, JSON.stringify(legacyJson, null, 2));
  const legacyToml = [
    '[features]',
    'experimental = true',
    '',
    '# BEGIN VIBESANE AGENTSHIELD MANAGED MCP ENTRY',
    '[mcp_servers.vibesane_agentshield]',
    'command = ' + JSON.stringify(nodePath),
    'args = [' + JSON.stringify(serverPath) + ']',
    'env = { VIBESANE_ALLOWED_ROOTS_JSON = ' + JSON.stringify(JSON.stringify([realRoot])) + ' }',
    '# END VIBESANE AGENTSHIELD MANAGED MCP ENTRY',
    '',
  ].join('\\n');
  const codexFile = path.join(project, '.codex', 'config.toml');
  await writeFile(codexFile, legacyToml);

  const claude = await connectAgentShield(['--agent', 'claude', '--cwd', project], { nodePath, serverPath });
  const codex = await connectAgentShield(['--agent', 'codex', '--cwd', project], { nodePath, serverPath });
  assert.equal(claude.results[0].status, 'migrated');
  assert.equal(codex.results[0].status, 'migrated');

  const upgraded = JSON.parse(await readFile(jsonFile, 'utf8'));
  assert.equal(upgraded.custom, true);
  assert.deepEqual(upgraded.mcpServers.unrelated, legacyJson.mcpServers.unrelated);
  assert.equal(upgraded.mcpServers['vibesane-agentshield'].env.VIBESANE_JOB_STORE_NAMESPACE, 'foxy-workspace-mcp');
  const upgradedToml = await readFile(codexFile, 'utf8');
  assert.match(upgradedToml, /VIBESANE_JOB_STORE_NAMESPACE = "foxy-codex"/);
  assert.ok(upgradedToml.startsWith('[features]'));
  assert.ok((await readdir(project)).some((name) => name.includes('.vibesane-backup-')));
});

test('connect refuses malformed and oversized host configuration without rewriting or backing it up', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-config-bounds-'));
  const project = path.join(root, 'project');
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', project]);

  const config = path.join(project, '.mcp.json');
  const malformed = '{"mcpServers":';
  await writeFile(config, malformed);
  await assert.rejects(
    connectAgentShield(['--agent', 'claude', '--cwd', project]),
    SyntaxError,
  );
  assert.equal(await readFile(config, 'utf8'), malformed);
  assert.ok(!(await readdir(project)).some((name) => name.includes('.vibesane-backup-')));

  const oversized = JSON.stringify({ padding: 'x'.repeat(256_001) });
  await writeFile(config, oversized);
  await assert.rejects(
    connectAgentShield(['--agent', 'claude', '--cwd', project]),
    /oversized host MCP configuration/,
  );
  assert.equal(await readFile(config, 'utf8'), oversized);
  assert.ok(!(await readdir(project)).some((name) => name.includes('.vibesane-backup-')));
});

test('connect refuses symlinked JSON and Codex TOML configuration files', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-config-symlink-'));
  const project = path.join(root, 'project');
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', project]);
  await mkdir(path.join(project, '.codex'));

  const externalJson = path.join(root, 'external.json');
  const externalToml = path.join(root, 'external.toml');
  const jsonTarget = path.join(project, '.mcp.json');
  const tomlTarget = path.join(project, '.codex', 'config.toml');
  const jsonText = JSON.stringify({ mcpServers: { preserved: { command: 'do-not-touch' } } });
  const tomlText = '[features]\\nexperimental = true\\n';
  await writeFile(externalJson, jsonText);
  await writeFile(externalToml, tomlText);

  try {
    await symlink(externalJson, jsonTarget);
    await symlink(externalToml, tomlTarget);
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip('This Windows environment does not permit creating symbolic links for the safety fixture.');
      return;
    }
    throw error;
  }

  await assert.rejects(
    connectAgentShield(['--agent', 'claude', '--cwd', project]),
    /symlinked|identity changed/i,
  );
  await assert.rejects(
    connectAgentShield(['--agent', 'codex', '--cwd', project]),
    /symlinked|identity changed/i,
  );
  assert.equal(await readFile(externalJson, 'utf8'), jsonText);
  assert.equal(await readFile(externalToml, 'utf8'), tomlText);
  assert.ok(!(await readdir(project)).some((name) => name.includes('.vibesane-backup-')));
});


test('legacy setup command rejects malformed and oversized host MCP config without mutation', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-legacy-config-'));
  const project = path.join(root, 'project');
  await mkdir(project);
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', project]);

  const config = path.join(project, '.mcp.json');
  const malformed = '{"mcpServers":';
  await writeFile(config, malformed);
  await assert.rejects(
    exec(process.execPath, [cliPath, 'setup', '--host', 'claude', '--cwd', project]),
    (error) => error?.code === 2 && String(error.stdout).includes('"status":"error"'),
  );
  assert.equal(await readFile(config, 'utf8'), malformed);
  assert.ok(!(await readdir(project)).some((name) => name.includes('.vibesane-backup-')));

  const oversized = JSON.stringify({ padding: 'x'.repeat(256_001) });
  await writeFile(config, oversized);
  await assert.rejects(
    exec(process.execPath, [cliPath, 'setup', '--host', 'claude', '--cwd', project]),
    (error) => error?.code === 2 && String(error.stdout).includes('"status":"error"'),
  );
  assert.equal(await readFile(config, 'utf8'), oversized);
  assert.ok(!(await readdir(project)).some((name) => name.includes('.vibesane-backup-')));
});

test('doctor refuses a symlinked project host configuration directory', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-legacy-doctor-'));
  const project = path.join(root, 'project');
  const outside = path.join(root, 'outside');
  await mkdir(project);
  await mkdir(outside);
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', project]);
  await writeFile(path.join(outside, 'settings.json'), JSON.stringify({ hooks: {} }));

  try {
    await symlink(outside, path.join(project, '.claude'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip('This Windows environment does not permit creating directory symbolic links for the safety fixture.');
      return;
    }
    throw error;
  }

  await assert.rejects(
    exec(process.execPath, [cliPath, 'doctor', '--cwd', project]),
    (error) => {
      assert.equal(error?.code, 2);
      const report = JSON.parse(error.stdout);
      assert.equal(report.checks.settingsReadable, false);
      return true;
    },
  );
  assert.equal(await readFile(path.join(outside, 'settings.json'), 'utf8'), JSON.stringify({ hooks: {} }));
});


test('Codex uninstall refuses a symlinked .agents parent and preserves external skill files', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-codex-uninstall-'));
  const project = path.join(root, 'project');
  const outside = path.join(root, 'outside');
  const externalSkillDir = path.join(outside, 'skills', 'vibesane-agentshield');
  await mkdir(project);
  await mkdir(externalSkillDir, { recursive: true });
  await mkdir(path.join(project, '.codex'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', project]);

  const sourceSkill = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../skills/vibesane-agentshield/SKILL.md');
  const skill = await readFile(sourceSkill, 'utf8');
  const externalSkill = path.join(externalSkillDir, 'SKILL.md');
  await writeFile(externalSkill, skill);

  // Install a real Stop hook first so the test proves uninstall is transactional:
  // an unsafe skill path must be rejected before any managed hook is removed.
  await exec(process.execPath, [cliPath, 'init-codex', '--cwd', project]);
  const hooksFile = path.join(project, '.codex', 'hooks.json');
  const hooksBefore = await readFile(hooksFile, 'utf8');
  await rm(path.join(project, '.agents'), { recursive: true, force: true });

  try {
    await symlink(outside, path.join(project, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip('This Windows environment does not permit creating directory symbolic links for the safety fixture.');
      return;
    }
    throw error;
  }

  await assert.rejects(
    exec(process.execPath, [cliPath, 'uninstall-codex', '--cwd', project]),
    (error) => error?.code === 2 && String(error.stdout).includes('"status":"error"'),
  );
  assert.equal(await readFile(externalSkill, 'utf8'), skill);
  assert.equal(await readFile(hooksFile, 'utf8'), hooksBefore, 'Refused uninstall must not partially remove the Stop hook.');
});


test('doctor refuses symlinked Codex config.toml without following it', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agentshield-codex-doctor-'));
  const project = path.join(root, 'project');
  await mkdir(path.join(project, '.codex'), { recursive: true });
  t.after(() => rm(root, { recursive: true, force: true }));
  await exec('git', ['init', project]);

  const external = path.join(root, 'external.toml');
  const original = '[mcp_servers.safe]\\ncommand = "node"\\nargs = []\\n';
  await writeFile(external, original);
  try {
    await symlink(external, path.join(project, '.codex', 'config.toml'));
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) {
      t.skip('This Windows environment does not permit creating symbolic links for the safety fixture.');
      return;
    }
    throw error;
  }

  await assert.rejects(
    exec(process.execPath, [cliPath, 'doctor', '--cwd', project]),
    (error) => {
      assert.equal(error?.code, 2);
      const report = JSON.parse(error.stdout);
      assert.equal(report.checks.settingsReadable, false);
      return true;
    },
  );
  assert.equal(await readFile(external, 'utf8'), original);
});
