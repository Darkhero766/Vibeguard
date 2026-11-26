#!/usr/bin/env node
// Cross-platform, project-scoped AgentShield MCP registration.
// Never starts a host, executes repository code, or grants workspace authority beyond this Git root.
import os from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';
import { access, copyFile, lstat, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const SERVER_KEY = 'vibesane_agentshield';
const SERVER_LABEL = 'vibesane-agentshield';
const SERVER_FILE = 'agentshield-mcp-stdio.mjs';
const scriptsDir = path.dirname(new URL(import.meta.url).pathname);

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
      throw new Error('Use connect [--agent auto|all|claude|codex|cursor|mcp] [--cwd PROJECT].');
    }
  }
  if (!['auto', 'all', 'claude', 'codex', 'cursor', 'mcp'].includes(agent)) {
    throw new Error('Agent must be auto, all, claude, codex, cursor, or mcp.');
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
  const home = envValue(env, 'HOME') || envValue(env, 'USERPROFILE') || os.homedir();
  const root = cwd ? path.resolve(cwd) : process.cwd();
  const [claudeProject, codexProject, cursorProject, claudeCli, codexCli] = await Promise.all([
    isDirectory(path.join(root, '.claude')),
    isDirectory(path.join(root, '.codex')),
    isDirectory(path.join(root, '.cursor')),
    commandOnPath('claude', env, platform),
    commandOnPath('codex', env, platform),
  ]);
  const claude = Boolean(claudeCli || claudeProject || envValue(env, 'CLAUDE_CODE'));
  const codex = Boolean(codexCli || codexProject || envValue(env, 'CODEX_HOME'));
  const cursor = Boolean(cursorProject || envValue(env, 'CURSOR_AGENT') || envValue(env, 'CURSOR_PROJECT_DIR')
    || await isDirectory(path.join(home, '.cursor')));
  return ['claude', 'codex', 'cursor'].filter((name) =>
    name === 'claude' ? claude : name === 'codex' ? codex : cursor);
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
    'env = { VIBESANE_ALLOWED_ROOTS_JSON = ' + safeTomlString(allowlist) + ' }',
    '# END VIBESANE AGENTSHIELD MANAGED MCP ENTRY',
  ].join('\n');
}

export function buildJsonMcpEntry({ host, nodePath, serverPath, workspaceRoot }) {
  const entry = {
    command: nodePath,
    args: [serverPath],
    env: { VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([workspaceRoot]) },
  };
  return host === 'cursor' ? { type: 'stdio', ...entry } : entry;
}

async function projectRoot(cwd) {
  const { stdout } = await exec('git', [
    '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=' + os.devNull,
    '-C', cwd, 'rev-parse', '--show-toplevel',
  ], { timeout: 7000, maxBuffer: 4000, windowsHide: true });
  const root = await realpath(stdout.trim());
  const info = await stat(root);
  if (!info.isDirectory() || root === path.parse(root).root || root === os.homedir()) {
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

async function readJsonConfig(file) {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256_000) {
      throw new Error('Refusing a symlinked, non-regular or oversized host MCP configuration.');
    }
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed host MCP configuration.');
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function backupFile(file) {
  const info = await lstat(file).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Refusing to back up a non-regular host configuration.');
  const backup = file + '.vibesane-backup-' + new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID();
  await copyFile(file, backup, constants.COPYFILE_EXCL);
  if (process.platform !== 'win32') await import('node:fs/promises').then(({ chmod }) => chmod(backup, 0o600));
  return backup;
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

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function configureJsonHost(host, root, nodePath, serverPath) {
  const configDir = host === 'cursor' ? path.join(root, '.cursor') : root;
  if (host === 'cursor') await ensureSafeDirectory(configDir);
  const file = host === 'cursor' ? path.join(configDir, 'mcp.json') : path.join(root, '.mcp.json');
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
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 256_000) {
      throw new Error('Refusing a symlinked, non-regular or oversized Codex config.toml.');
    }
    existing = await readFile(file, 'utf8');
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

export async function connectAgentShield(args = [], overrides = {}) {
  const { agent, cwd } = parseConnectArgs(args);
  const root = await projectRoot(cwd);
  const nodePath = overrides.nodePath || process.execPath;
  const serverPath = overrides.serverPath || path.join(path.dirname(new URL(import.meta.url).pathname), SERVER_FILE);
  const detected = await detectAgents({ cwd: root, env: overrides.env || process.env, platform: overrides.platform || process.platform });
  const hosts = agent === 'all' ? ['claude', 'codex', 'cursor']
    : agent === 'auto' ? detected
      : agent === 'mcp' ? [] : [agent];
  const generic = {
    command: nodePath,
    args: [serverPath],
    env: { VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([root]) },
  };
  if (agent === 'mcp') {
    return { status: 'manual_mcp_configuration', root, server: generic,
      note: 'Paste this stdio server entry into any MCP-compatible client. Non-MCP agents require a host-specific integration.' };
  }
  if (!hosts.length) {
    return { status: 'no_supported_agent_detected', root, detected,
      genericMcpServer: generic,
      note: 'No supported host was detected. Re-run with --agent claude|codex|cursor, or use the generic MCP entry in an MCP-compatible client.' };
  }
  const results = [];
  for (const host of hosts) {
    results.push(host === 'codex'
      ? await configureCodex(root, nodePath, serverPath)
      : await configureJsonHost(host, root, nodePath, serverPath));
  }
  return { status: 'connected', root, detected, results,
    note: 'MCP registration only; restart the host and approve the server. Optional lifecycle hooks are not installed. The server is read-only and authorized only for this repository.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  connectAgentShield(process.argv.slice(2)).then((result) => {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }).catch(() => {
    process.stderr.write('AgentShield connect failed. Run vibesane doctor and inspect the host config before retrying.\n');
    process.exitCode = 2;
  });
}
