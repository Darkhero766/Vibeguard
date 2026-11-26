#!/usr/bin/env node
// Cross-platform, project-scoped AgentShield MCP registration.
// Never starts a host, executes repository code, or grants workspace authority beyond this Git root.
import os from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chmod, lstat, mkdir, open, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const SERVER_LABEL = 'vibesane-agentshield';
const SERVER_FILE = 'agentshield-mcp-stdio.mjs';
const MAX_HOST_CONFIG_BYTES = 256_000;
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

function envValue(env, name) {
  const key = Object.keys(env || {}).find((item) => item.toLowerCase() === name.toLowerCase());
  return key ? env[key] : undefined;
}

export function parseConnectArgs(args = []) {
  let agent = 'auto';
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent') {
      if (!args[i + 1]) throw new Error('Missing --agent value.');
      agent = args[++i].toLowerCase();
    } else if (args[i] === '--cwd') {
      if (!args[i + 1]) throw new Error('Missing --cwd value.');
      cwd = path.resolve(args[++i]);
    } else {
      throw new Error('Use connect [--agent auto|all|claude|codex|cursor|gemini|roo|copilot|mcp] [--cwd PROJECT].');
    }
  }
  if (!['auto', 'all', 'claude', 'codex', 'cursor', 'gemini', 'roo', 'copilot', 'mcp'].includes(agent)) {
    throw new Error('Agent must be auto, all, claude, codex, cursor, gemini, roo, copilot, or mcp.');
  }
  return { agent, cwd };
}

async function isDirectory(directory) {
  try {
    const info = await lstat(directory);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function commandOnPath(command, env = process.env, platform = process.platform) {
  const rawPath = envValue(env, 'PATH') || '';
  const extensions = platform === 'win32'
    ? (envValue(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';')
    : [''];
  for (const directory of rawPath.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, command + extension.toLowerCase());
      try {
        const info = await stat(candidate);
        if (info.isFile()) return candidate;
      } catch {}
      if (platform === 'win32' && extension !== extension.toLowerCase()) {
        try {
          const info = await stat(path.join(directory, command + extension));
          if (info.isFile()) return path.join(directory, command + extension);
        } catch {}
      }
    }
  }
  return null;
}

export async function detectAgents({ cwd, env = process.env, platform = process.platform } = {}) {
  const home = platform === 'win32'
    ? envValue(env, 'USERPROFILE') || envValue(env, 'HOME') || os.homedir()
    : envValue(env, 'HOME') || envValue(env, 'USERPROFILE') || os.homedir();
  const root = cwd ? path.resolve(cwd) : process.cwd();
  const [claudeProject, codexProject, cursorProject, geminiProject, rooProject,
    claudeCli, codexCli, cursorCli, geminiCli, copilotCli] = await Promise.all([
    isDirectory(path.join(root, '.claude')),
    isDirectory(path.join(root, '.codex')),
    isDirectory(path.join(root, '.cursor')),
    isDirectory(path.join(root, '.gemini')),
    isDirectory(path.join(root, '.roo')),
    commandOnPath('claude', env, platform),
    commandOnPath('codex', env, platform),
    commandOnPath('cursor', env, platform),
    commandOnPath('gemini', env, platform),
    commandOnPath('copilot', env, platform),
  ]);
  const claude = Boolean(claudeCli || claudeProject || envValue(env, 'CLAUDE_CODE'));
  const codex = Boolean(codexCli || codexProject || envValue(env, 'CODEX_HOME'));
  const cursor = Boolean(cursorCli || cursorProject || envValue(env, 'CURSOR_AGENT') || envValue(env, 'CURSOR_PROJECT_DIR')
    || await isDirectory(path.join(home, '.cursor')));
  const gemini = Boolean(geminiCli || geminiProject || envValue(env, 'GEMINI_CLI'));
  const roo = rooProject || Boolean(envValue(env, 'ROO_CODE'));
  const copilot = Boolean(copilotCli || envValue(env, 'VSCODE_PID') || envValue(env, 'COPILOT_HOME') || envValue(env, 'GITHUB_COPILOT'));
  return ['claude', 'codex', 'cursor', 'gemini', 'roo', 'copilot'].filter((name) =>
    name === 'claude' ? claude : name === 'codex' ? codex : name === 'cursor' ? cursor
      : name === 'gemini' ? gemini : name === 'roo' ? roo : copilot);
}

function safeTomlString(value) {
  // JSON strings are valid TOML basic strings and correctly escape Windows paths and quotes.
  return JSON.stringify(value);
}

export function buildCodexMcpBlock({ nodePath, serverPath, workspaceRoot }) {
  const allowlist = JSON.stringify([workspaceRoot]);
  return [
    '# BEGIN VIBESANE AGENTSHIELD MANAGED MCP ENTRY',
    '[mcp_servers.vibesane_agentshield]',
    'command = ' + safeTomlString(nodePath),
    'args = [' + safeTomlString(serverPath) + ']',
    'env = { VIBESANE_ALLOWED_ROOTS_JSON = ' + safeTomlString(allowlist)
      + ', VIBESANE_JOB_STORE_NAMESPACE = "foxy-codex" }',
    '# END VIBESANE AGENTSHIELD MANAGED MCP ENTRY',
  ].join('\n');
}

export function jobStoreNamespaceForHost(host) {
  // Claude Code and Copilot can both consume the workspace-root .mcp.json,
  // so deliberately give that shared configuration one namespace. Each
  // host with its own config destination gets an isolated persistent queue.
  const namespaces = {
    claude: 'foxy-workspace-mcp',
    copilot: 'foxy-workspace-mcp',
    codex: 'foxy-codex',
    cursor: 'foxy-cursor',
    gemini: 'foxy-gemini',
    roo: 'foxy-roo',
    mcp: 'foxy-manual',
  };
  return namespaces[host] || 'foxy-manual';
}

export function buildJsonMcpEntry({ host, nodePath, serverPath, workspaceRoot }) {
  const entry = {
    command: nodePath,
    args: [serverPath],
    env: {
      VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([workspaceRoot]),
      VIBESANE_JOB_STORE_NAMESPACE: jobStoreNamespaceForHost(host),
    },
  };
  return ['claude', 'cursor', 'copilot'].includes(host) ? { type: 'stdio', ...entry } : entry;
}

async function projectRoot(cwd) {
  const { stdout } = await exec('git', [
    '-c', 'core.fsmonitor=false',
    '-C', cwd, 'rev-parse', '--show-toplevel',
  ], { timeout: 7000, maxBuffer: 4000, windowsHide: true });
  const root = await realpath(stdout.trim());
  const info = await stat(root);
  const home = await realpath(os.homedir()).catch(() => path.resolve(os.homedir()));
  if (!info.isDirectory() || samePath(root, path.parse(root).root) || samePath(root, home)) {
    throw new Error('Select a Git repository below the filesystem and home-directory roots.');
  }
  return root;
}

async function ensureSafeDirectory(directory) {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('Refusing a symlinked or non-directory host configuration path.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(directory, { mode: 0o700 });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Host configuration directory changed during creation.');
  }
}

async function readRegularHostConfig(file, description = 'host MCP configuration') {
  const before = await lstat(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_HOST_CONFIG_BYTES) {
    throw new Error('Refusing a symlinked, non-regular or oversized ' + description + '.');
  }
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size > MAX_HOST_CONFIG_BYTES) {
      throw new Error('Host configuration identity changed while opening it.');
    }
    const buffer = Buffer.alloc(opened.size);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    const after = await handle.stat();
    if (after.dev !== opened.dev || after.ino !== opened.ino
      || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
      || bytesRead !== opened.size) {
      throw new Error('Host configuration changed or was truncated while being read.');
    }
    return buffer.toString('utf8');
  } finally {
    await handle.close();
  }
}

async function readJsonConfig(file) {
  try {
    const raw = await readRegularHostConfig(file);
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed host MCP configuration.');
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function backupFile(file) {
  const before = await lstat(file).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_HOST_CONFIG_BYTES) {
    throw new Error('Refusing to back up a non-regular, symlinked or oversized host configuration.');
  }
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size > MAX_HOST_CONFIG_BYTES) {
      throw new Error('Host configuration identity changed before backup.');
    }
    const buffer = Buffer.alloc(opened.size);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const chunk = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (chunk.bytesRead === 0) break;
      bytesRead += chunk.bytesRead;
    }
    const after = await handle.stat();
    if (after.dev !== opened.dev || after.ino !== opened.ino
      || after.size !== opened.size || after.mtimeMs !== opened.mtimeMs
      || bytesRead !== opened.size) {
      throw new Error('Host configuration changed or was truncated during backup.');
    }
    const backup = file + '.vibesane-backup-' + new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID();
    try {
      await writeFile(backup, buffer, { flag: 'wx', mode: 0o600 });
      if (process.platform !== 'win32') await chmod(backup, 0o600);
      return backup;
    } catch (error) {
      await unlink(backup).catch(() => {});
      throw error;
    }
  } finally {
    await handle.close();
  }
}

async function atomicWrite(file, content) {
  const temp = file + '.agentshield-' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, content, { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function configureJsonHost(host, root, nodePath, serverPath) {
  const configDir = host === 'cursor' ? path.join(root, '.cursor')
    : host === 'gemini' ? path.join(root, '.gemini')
      : host === 'roo' ? path.join(root, '.roo') : root;
  if (host === 'cursor' || host === 'gemini' || host === 'roo') await ensureSafeDirectory(configDir);
  const file = host === 'cursor' ? path.join(configDir, 'mcp.json')
    : host === 'gemini' ? path.join(configDir, 'settings.json')
      : host === 'roo' ? path.join(configDir, 'mcp.json') : path.join(root, '.mcp.json');
  const config = await readJsonConfig(file);
  if (config.mcpServers != null && (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers))) {
    throw new Error('Refusing malformed mcpServers configuration.');
  }
  const servers = config.mcpServers || {};
  const desired = buildJsonMcpEntry({ host, nodePath, serverPath, workspaceRoot: root });
  if (servers[SERVER_LABEL] != null) {
    if (sameJson(servers[SERVER_LABEL], desired)) return { host, status: 'already_configured', configFile: file };
    throw new Error('A different MCP entry already uses ' + SERVER_LABEL + '; it was left untouched.');
  }
  const backup = await backupFile(file);
  config.mcpServers = { ...servers, [SERVER_LABEL]: desired };
  await atomicWrite(file, JSON.stringify(config, null, 2) + '\n');
  return { host, status: 'configured', configFile: file, backup };
}

async function configureCodex(root, nodePath, serverPath) {
  const directory = path.join(root, '.codex');
  await ensureSafeDirectory(directory);
  const file = path.join(directory, 'config.toml');
  let existing = '';
  try {
    existing = await readRegularHostConfig(file, 'Codex config.toml');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const block = buildCodexMcpBlock({ nodePath, serverPath, workspaceRoot: root });
  const marker = '# BEGIN VIBESANE AGENTSHIELD MANAGED MCP ENTRY';
  if (existing.includes(marker)) {
    const start = existing.indexOf(marker);
    const endMarker = '# END VIBESANE AGENTSHIELD MANAGED MCP ENTRY';
    const end = existing.indexOf(endMarker, start);
    if (end < 0) throw new Error('The managed Codex MCP block is damaged; refusing to rewrite it.');
    const current = existing.slice(start, end + endMarker.length);
    if (current === block) return { host: 'codex', status: 'already_configured', configFile: file };
    throw new Error('The managed Codex MCP block was customized; refusing to overwrite it.');
  }
  if (/^\s*\[mcp_servers\.vibesane_agentshield\]\s*$/m.test(existing)
    || /^\s*mcp_servers\s*=\s*\{/m.test(existing)) {
    throw new Error('A conflicting Codex MCP entry exists; it was left untouched.');
  }
  const backup = await backupFile(file);
  const prefix = existing && !existing.endsWith('\n') ? existing + '\n' : existing;
  await atomicWrite(file, prefix + (prefix ? '\n' : '') + block + '\n');
  return { host: 'codex', status: 'configured', configFile: file, backup };
}

async function disconnectJsonHost(host, root, nodePath, serverPath) {
  const configDir = host === 'cursor' ? path.join(root, '.cursor')
    : host === 'gemini' ? path.join(root, '.gemini')
      : host === 'roo' ? path.join(root, '.roo') : root;
  if ((host === 'cursor' || host === 'gemini' || host === 'roo') && !await isDirectory(configDir)) {
    const file = host === 'cursor' ? path.join(configDir, 'mcp.json')
      : host === 'gemini' ? path.join(configDir, 'settings.json') : path.join(configDir, 'mcp.json');
    return { host, status: 'not_configured', configFile: file };
  }
  const file = host === 'cursor' ? path.join(configDir, 'mcp.json')
    : host === 'gemini' ? path.join(configDir, 'settings.json')
      : host === 'roo' ? path.join(configDir, 'mcp.json') : path.join(root, '.mcp.json');
  const config = await readJsonConfig(file);
  if (config.mcpServers != null && (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers))) {
    throw new Error('Refusing malformed mcpServers configuration.');
  }
  const servers = config.mcpServers || {};
  const existing = servers[SERVER_LABEL];
  if (existing == null) return { host, status: 'not_configured', configFile: file };
  const desired = buildJsonMcpEntry({ host, nodePath, serverPath, workspaceRoot: root });
  if (!sameJson(existing, desired)) {
    throw new Error('The AgentShield MCP entry was customized; refusing to remove it automatically.');
  }
  const backup = await backupFile(file);
  delete servers[SERVER_LABEL];
  if (Object.keys(servers).length) config.mcpServers = servers;
  else delete config.mcpServers;
  await atomicWrite(file, JSON.stringify(config, null, 2) + '\n');
  return { host, status: 'removed', configFile: file, backup };
}

async function disconnectCodex(root, nodePath, serverPath) {
  const directory = path.join(root, '.codex');
  if (!await isDirectory(directory)) return { host: 'codex', status: 'not_configured', configFile: path.join(directory, 'config.toml') };
  const file = path.join(directory, 'config.toml');
  let existing = '';
  try {
    existing = await readRegularHostConfig(file, 'Codex config.toml');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const marker = '# BEGIN VIBESANE AGENTSHIELD MANAGED MCP ENTRY';
  const endMarker = '# END VIBESANE AGENTSHIELD MANAGED MCP ENTRY';
  const start = existing.indexOf(marker);
  if (start < 0) return { host: 'codex', status: 'not_configured', configFile: file };
  const end = existing.indexOf(endMarker, start);
  if (end < 0) throw new Error('The managed Codex MCP block is damaged; refusing to rewrite it.');
  const expected = buildCodexMcpBlock({
    nodePath,
    serverPath,
    workspaceRoot: root,
  });
  if (existing.slice(start, end + endMarker.length) !== expected) {
    throw new Error('The managed Codex MCP block was customized; refusing to remove it automatically.');
  }
  const backup = await backupFile(file);
  const tail = existing.slice(end + endMarker.length).replace(/^\r?\n/, '');
  await atomicWrite(file, existing.slice(0, start) + tail);
  return { host: 'codex', status: 'removed', configFile: file, backup };
}

export async function disconnectAgentShield(args = [], overrides = {}) {
  const { agent, cwd } = parseConnectArgs(args);
  if (agent === 'mcp') throw new Error('Use disconnect with a named host or all; generic MCP entries must be removed from the client configuration manually.');
  const root = await projectRoot(cwd);
  const nodePath = overrides.nodePath || process.execPath;
  const serverPath = overrides.serverPath || path.join(scriptsDir, SERVER_FILE);
  const detected = await detectAgents({ cwd: root, env: overrides.env || process.env, platform: overrides.platform || process.platform });
  const hosts = agent === 'all' ? ['claude', 'codex', 'cursor', 'gemini', 'roo', 'copilot']
    : agent === 'auto' ? detected : [agent];
  const results = [];
  const processedConfigFiles = new Set();
  for (const host of hosts) {
    if (host === 'codex') {
      results.push(await disconnectCodex(root, nodePath, serverPath));
      continue;
    }
    const configFile = host === 'cursor' ? path.join(root, '.cursor', 'mcp.json')
      : host === 'gemini' ? path.join(root, '.gemini', 'settings.json')
        : host === 'roo' ? path.join(root, '.roo', 'mcp.json') : path.join(root, '.mcp.json');
    if (processedConfigFiles.has(configFile)) {
      results.push({ host, status: 'shared_config', configFile, note: 'This host shares the workspace .mcp.json entry already handled for another host.' });
      continue;
    }
    processedConfigFiles.add(configFile);
    results.push(await disconnectJsonHost(host, root, nodePath, serverPath));
  }
  return { status: 'disconnected', root, detected, results,
    note: 'Only exact, unmodified AgentShield entries were removed. Backups were written before changes. Generic MCP entries and customized configurations are left untouched.' };
}

export async function connectAgentShield(args = [], overrides = {}) {
  const { agent, cwd } = parseConnectArgs(args);
  const root = await projectRoot(cwd);
  const nodePath = overrides.nodePath || process.execPath;
  const serverPath = overrides.serverPath || path.join(scriptsDir, SERVER_FILE);
  const detected = await detectAgents({ cwd: root, env: overrides.env || process.env, platform: overrides.platform || process.platform });
  const hosts = agent === 'all' ? ['claude', 'codex', 'cursor', 'gemini', 'roo', 'copilot']
    : agent === 'auto' ? detected
      : agent === 'mcp' ? [] : [agent];
  const generic = {
    command: nodePath,
    args: [serverPath],
    env: {
      VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([root]),
      VIBESANE_JOB_STORE_NAMESPACE: jobStoreNamespaceForHost('mcp'),
    },
  };
  if (agent === 'mcp') {
    return { status: 'manual_mcp_configuration', root, server: generic,
      note: 'Paste this stdio server entry into any MCP-compatible client. Non-MCP agents require a host-specific integration.' };
  }
  if (!hosts.length) {
    return { status: 'no_supported_agent_detected', root, detected,
      genericMcpServer: generic,
      note: 'No supported host was detected. Re-run with --agent claude|codex|cursor|gemini|roo|copilot, or use the generic MCP entry in an MCP-compatible client.' };
  }
  const results = [];
  for (const host of hosts) {
    results.push(host === 'codex'
      ? await configureCodex(root, nodePath, serverPath)
      : await configureJsonHost(host, root, nodePath, serverPath));
  }
  return { status: 'connected', root, detected, results,
    note: 'MCP registration only; restart the host and approve the server. Optional lifecycle hooks are not installed. The .mcp.json entry also serves VS Code Copilot workspace configuration where workspace-root MCP config is enabled. The server is read-only and authorized only for this repository.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const disconnect = process.argv[2] === 'disconnect';
  const args = disconnect ? process.argv.slice(3) : process.argv.slice(2);
  (disconnect ? disconnectAgentShield(args) : connectAgentShield(args)).then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }).catch((error) => {
    const action = disconnect ? 'disconnect' : 'connect';
    process.stderr.write('AgentShield ' + action + ' failed: ' + String(error?.message || 'inspect the host config and run vibesane doctor') .slice(0, 300) + '\n');
    process.exitCode = 2;
  });
}
