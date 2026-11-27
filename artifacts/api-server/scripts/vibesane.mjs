#!/usr/bin/env node
// AgentShield local developer commands; a repository checkout is required (no npm publishing).
import path from 'node:path';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lstat, readFile, realpath, stat, mkdir, open, writeFile, rename, unlink, readdir, chmod } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildCodexMcpBlock, buildJsonMcpEntry } from './agentshield-connect.mjs';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(scripts, '../dist/agentshield.mjs');
const controller = path.resolve(scripts, 'agentshield-controller.mjs');
const hybrid = path.resolve(scripts, 'agentshield-hybrid.mjs');
const capabilities = path.resolve(scripts, 'agentshield-capabilities.mjs');
const installer = path.resolve(scripts, 'agentshield-install.mjs');
const connector = path.resolve(scripts, 'agentshield-connect.mjs');
const exec = promisify(execFile);
const MAX_HOST_CONFIG_BYTES = 256_000;

function cwdFrom(args) {
  const n = args.indexOf('--cwd');
  if (n < 0) return process.cwd();
  if (!args[n + 1]) throw new Error('Missing --cwd value.');
  return path.resolve(args[n + 1]);
}
async function isFile(location) {
  try { const s = await lstat(location); return s.isFile() && !s.isSymbolicLink(); }
  catch { return false; }
}
async function codexProjectRoot(cwd) {
  const result = await exec('git', [
    '-c', 'core.fsmonitor=false',
    '-C', cwd, 'rev-parse', '--show-toplevel',
  ], { timeout: 5000, maxBuffer: 4000 });
  return realpath(result.stdout.trim());
}
async function ensureSafeDirectory(directory) {
  let info = await lstat(directory).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!info) {
    await mkdir(directory, { mode: 0o700 });
    info = await lstat(directory);
  }
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error('Refusing symlinked or non-directory configuration path.');
  }
}
async function readSafeTextFile(file, description = 'host configuration') {
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
async function readSafeJsonFile(file) {
  try {
    const value = JSON.parse(await readSafeTextFile(file));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unexpected host configuration structure.');
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}
async function backupJsonFile(file) {
  const info = await lstat(file).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_HOST_CONFIG_BYTES) {
    throw new Error('Refusing to back up a non-regular, symlinked or oversized host configuration.');
  }
  const raw = await readSafeTextFile(file);
  const backup = file + '.vibesane-backup-' + new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID() + '.json';
  try {
    await writeFile(backup, raw, { flag: 'wx', mode: 0o600 });
    if (process.platform !== 'win32') await chmod(backup, 0o600);
    return backup;
  } catch (error) {
    await unlink(backup).catch(() => {});
    throw error;
  }
}
async function atomicJsonWrite(file, value) {
  const temp = file + '.agentshield-' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}
function parseSetupArgs(args) {
  let host = null;
  let cwd = process.cwd();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host') {
      if (!args[i + 1]) throw new Error('Missing --host value.');
      host = args[++i];
    } else if (args[i] === '--cwd') {
      if (!args[i + 1]) throw new Error('Missing --cwd value.');
      cwd = path.resolve(args[++i]);
    } else throw new Error('Use --host claude|cursor and optional --cwd PROJECT.');
  }
  if (!['claude', 'cursor'].includes(host)) throw new Error('Supported setup hosts are claude and cursor.');
  return { host, cwd };
}
function foxyMcpEntry(host, root) {
  return buildJsonMcpEntry({
    host,
    nodePath: process.execPath,
    serverPath: path.resolve(scripts, 'agentshield-mcp-stdio.mjs'),
    workspaceRoot: root,
  });
}
async function safeExistingDirectory(directory) {
  const info = await lstat(directory).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!info) return false;
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe or symlinked project configuration directory.');
  return true;
}
async function readProjectMcpConfig(root, directoryName, fileName) {
  const directory = path.join(root, directoryName);
  if (!await safeExistingDirectory(directory)) return {};
  return readSafeJsonFile(path.join(directory, fileName));
}
function samePath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
async function configureMcpHost(args, uninstall = false) {
  const { host, cwd } = parseSetupArgs(args);
  const root = await codexProjectRoot(cwd);
  const home = await realpath(os.homedir()).catch(() => path.resolve(os.homedir()));
  if (samePath(root, path.parse(root).root) || samePath(root, home)) {
    throw new Error('Choose a repository below the filesystem and home-directory roots.');
  }
  const configDir = host === 'cursor' ? path.join(root, '.cursor') : root;
  if (host === 'cursor') await ensureSafeDirectory(configDir);
  const configFile = host === 'cursor' ? path.join(configDir, 'mcp.json') : path.join(root, '.mcp.json');
  const config = await readSafeJsonFile(configFile);
  if (config.mcpServers != null && (!config.mcpServers || typeof config.mcpServers !== 'object' || Array.isArray(config.mcpServers))) {
    throw new Error('Refusing malformed mcpServers configuration.');
  }
  const servers = config.mcpServers || {};
  const name = 'vibesane-agentshield';
  const desired = foxyMcpEntry(host, root);
  const existing = servers[name];
  if (uninstall) {
    if (existing == null) {
      process.stdout.write(JSON.stringify({ status: 'not_configured', host, configFile }) + '\n');
      return 0;
    }
    if (!sameJson(existing, desired)) {
      throw new Error('The Foxy server entry was customized; refusing to remove or rewrite it automatically.');
    }
    const backup = await backupJsonFile(configFile);
    delete servers[name];
    if (Object.keys(servers).length) config.mcpServers = servers;
    else delete config.mcpServers;
    await atomicJsonWrite(configFile, config);
    process.stdout.write(JSON.stringify({ status: 'removed', host, configFile, backup }) + '\n');
    return 0;
  }
  if (existing != null) {
    if (sameJson(existing, desired)) {
      process.stdout.write(JSON.stringify({ status: 'already_configured', host, configFile, repositoryRoot: root }) + '\n');
      return 0;
    }
    throw new Error('A different MCP server already uses vibesane-agentshield; preserve it and resolve the name conflict manually.');
  }
  const backup = await backupJsonFile(configFile);
  config.mcpServers = { ...servers, [name]: desired };
  await atomicJsonWrite(configFile, config);
  process.stdout.write(JSON.stringify({
    status: 'configured',
    host,
    configFile,
    repositoryRoot: root,
    backup,
    note: 'Project-scoped Foxy MCP configured. Restart the host and approve the local server when prompted. The server is read-only and limited to this repository root.',
  }) + '\n');
  return 0;
}
function codexHookCommand() {
  const hook = path.resolve(scripts, 'agentshield-codex-stop.mjs');
  if (process.platform === 'win32') return '"' + process.execPath + '" "' + hook + '"';
  return "node '" + hook.replaceAll("'", "'\\''") + "'";
}
function removeCodexStopEntry(hooks, command) {
  const stop = Array.isArray(hooks.Stop) ? hooks.Stop : [];
  const kept = stop.map((entry) => {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return entry;
    const handlers = entry.hooks.filter(item => !(item?.type === 'command' && item.command === command));
    return handlers.length ? { ...entry, hooks: handlers } : null;
  }).filter(Boolean);
  if (kept.length) hooks.Stop = kept;
  else delete hooks.Stop;
  return JSON.stringify(stop) !== JSON.stringify(kept);
}
async function initCodexSkill(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd') {
      if (!args[i + 1]) throw new Error('Missing --cwd value.');
      i++;
    } else throw new Error('init-codex accepts only --cwd PROJECT.');
  }
  const root = await codexProjectRoot(cwdFrom(args));
  const codexDir = path.join(root, '.codex');
  await ensureSafeDirectory(codexDir);
  const hooksFile = path.join(codexDir, 'hooks.json');
  const config = await readProjectMcpConfig(root, '.codex', 'hooks.json');
  if (config.hooks != null && (typeof config.hooks !== 'object' || Array.isArray(config.hooks))) {
    throw new Error('Refusing malformed Codex hooks object.');
  }
  const hooks = config.hooks || {};
  if (hooks.Stop != null && !Array.isArray(hooks.Stop)) {
    throw new Error('Refusing malformed Codex Stop hook list.');
  }
  const command = codexHookCommand();
  removeCodexStopEntry(hooks, command);
  const stop = Array.isArray(hooks.Stop) ? hooks.Stop : [];
  stop.push({ hooks: [{
    type: 'command', command,
    ...(process.platform === 'win32' ? { commandWindows: command } : {}),
    timeout: 30,
    statusMessage: 'Checking changed code with VibeSane AgentShield',
  }] });
  hooks.Stop = stop;
  config.hooks = hooks;

  const targetDir = path.join(root, '.agents', 'skills', 'vibesane-agentshield');
  for (const directory of [path.join(root, '.agents'), path.join(root, '.agents', 'skills'), targetDir]) {
    await ensureSafeDirectory(directory);
  }
  const source = path.resolve(scripts, '../skills/vibesane-agentshield/SKILL.md');
  if (!await isFile(source)) throw new Error('Packaged AgentShield skill is missing.');
  const target = path.join(targetDir, 'SKILL.md');
  const skill = await readFile(source, 'utf8');
  try {
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Refusing non-regular or symlinked Codex skill.');
    if (await readFile(target, 'utf8') !== skill) {
      throw new Error('Codex AgentShield skill already exists with different content; refusing to overwrite it.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(target, skill, { flag: 'wx', mode: 0o600 });
  }
  await atomicJsonWrite(hooksFile, config);
  process.stdout.write(JSON.stringify({
    status: 'installed',
    skill: target,
    hook: hooksFile,
    command,
    note: 'Codex project skill and Stop hook installed. Review and trust the hook with /hooks before relying on it; existing hook entries were preserved.',
  }) + '\n');
  return 0;
}
async function uninstallCodex(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd') {
      if (!args[i + 1]) throw new Error('Missing --cwd value.');
      i++;
    } else throw new Error('uninstall-codex accepts only --cwd PROJECT.');
  }
  const root = await codexProjectRoot(cwdFrom(args));
  const codexDir = path.join(root, '.codex');
  const hooksFile = path.join(codexDir, 'hooks.json');
  // Validate every potential skill parent before removing any hook configuration.
  for (const directory of [
    path.join(root, '.agents'),
    path.join(root, '.agents', 'skills'),
    path.join(root, '.agents', 'skills', 'vibesane-agentshield'),
  ]) await safeExistingDirectory(directory);
  const config = await readProjectMcpConfig(root, '.codex', 'hooks.json');
  if (config.hooks != null && (typeof config.hooks !== 'object' || Array.isArray(config.hooks))) {
    throw new Error('Refusing malformed Codex hooks object.');
  }
  const hooks = config.hooks || {};
  if (hooks.Stop != null && !Array.isArray(hooks.Stop)) {
    throw new Error('Refusing malformed Codex Stop hook list.');
  }
  const changed = removeCodexStopEntry(hooks, codexHookCommand());
  if (Object.keys(hooks).length) config.hooks = hooks;
  else delete config.hooks;
  if (changed) await atomicJsonWrite(hooksFile, config);

  const targetDir = path.join(root, '.agents', 'skills', 'vibesane-agentshield');
  const target = path.join(targetDir, 'SKILL.md');
  let skillRemoved = false;
  const source = path.resolve(scripts, '../skills/vibesane-agentshield/SKILL.md');
  if (await isFile(target) && await isFile(source)) {
    const existing = await readSafeTextFile(target, 'Codex AgentShield skill');
    const packaged = await readFile(source, 'utf8');
    if (existing === packaged) {
      await unlink(target);
      skillRemoved = true;
    }
  }
  process.stdout.write(JSON.stringify({
    status: 'uninstalled',
    hookRemoved: changed,
    skillRemoved,
    note: skillRemoved ? 'Removed the matching AgentShield skill and Stop hook; unrelated Codex configuration was preserved.'
      : 'Removed the matching Stop hook if present. A modified or missing skill was left untouched.',
  }) + '\n');
  return 0;
}
async function doctor(args) {
  const cwd = cwdFrom(args);
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  const checks = { node: nodeMajor > 24 || (nodeMajor === 24 && nodeMinor >= 15),
    platform: ['win32', 'darwin', 'linux'].includes(process.platform), builtScanner: await isFile(dist),
    gitRepository: false, hooksInstalled: false, claudeHooksInstalled: false,
    codexStopHookInstalled: false, claudeMcpConfigured: false,
    cursorMcpConfigured: false, codexMcpConfigured: false, geminiMcpConfigured: false,
    rooMcpConfigured: false, copilotMcpConfigured: false, settingsReadable: true };
  let root = null;
  try {
    const r = await exec('git', ['-c', 'core.fsmonitor=false',
      '-C', cwd, 'rev-parse', '--show-toplevel'], { timeout: 5000, maxBuffer: 4000 });
    root = await realpath(r.stdout.trim()); checks.gitRepository = true;
  } catch {}
  if (root) {
    try {
      const d = await readProjectMcpConfig(root, '.claude', 'settings.json');
      const hooks = d?.hooks || {};
      const entries = [...(hooks.PostToolUse || []), ...(hooks.Stop || [])];
      checks.claudeHooksInstalled = entries.some(x => x?.hooks?.some(y =>
        typeof y?.command === 'string' && y.command.includes('agentshield-hook.mjs'))) &&
        entries.some(x => x?.hooks?.some(y => typeof y?.command === 'string' &&
          y.command.includes('agentshield-stop.mjs')));
    } catch { checks.settingsReadable = false; }
    try {
      const config = await readProjectMcpConfig(root, '.codex', 'hooks.json');
      const stop = config?.hooks?.Stop;
      if (stop != null && !Array.isArray(stop)) throw new Error('Malformed Codex Stop hook list.');
      checks.codexStopHookInstalled = (stop || []).some(entry => entry?.hooks?.some(hook =>
        typeof hook?.command === 'string' && hook.command.includes('agentshield-codex-stop.mjs')));
    } catch { checks.settingsReadable = false; }
    try {
      const config = await readSafeJsonFile(path.join(root, '.mcp.json'));
      const entry = config?.mcpServers?.['vibesane-agentshield'];
      checks.claudeMcpConfigured = sameJson(entry, foxyMcpEntry('claude', root));
      // VS Code Copilot's portable workspace configuration uses the same
      // root .mcp.json format, but host approval and session availability are
      // still controlled by Copilot.
      checks.copilotMcpConfigured = sameJson(entry, foxyMcpEntry('copilot', root));
    } catch { checks.settingsReadable = false; }
    try {
      const config = await readProjectMcpConfig(root, '.cursor', 'mcp.json');
      checks.cursorMcpConfigured = sameJson(config?.mcpServers?.['vibesane-agentshield'], foxyMcpEntry('cursor', root));
    } catch { checks.settingsReadable = false; }
    try {
      const config = await readProjectMcpConfig(root, '.gemini', 'settings.json');
      checks.geminiMcpConfigured = sameJson(config?.mcpServers?.['vibesane-agentshield'], foxyMcpEntry('gemini', root));
    } catch { checks.settingsReadable = false; }
    try {
      const config = await readProjectMcpConfig(root, '.roo', 'mcp.json');
      checks.rooMcpConfigured = sameJson(config?.mcpServers?.['vibesane-agentshield'], foxyMcpEntry('roo', root));
    } catch { checks.settingsReadable = false; }
    try {
      const directory = path.join(root, '.codex');
      const info = await lstat(directory).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
      if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Unsafe Codex configuration directory.');
      if (info) {
        const file = path.join(directory, 'config.toml');
        const fileInfo = await lstat(file).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
        if (fileInfo) {
          if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.size > 256_000) throw new Error('Unsafe Codex config.toml.');
          const current = await readSafeTextFile(file, 'Codex config.toml');
          const expected = buildCodexMcpBlock({
            nodePath: process.execPath,
            serverPath: path.resolve(scripts, 'agentshield-mcp-stdio.mjs'),
            workspaceRoot: root,
          });
          const begin = '# BEGIN VIBESANE AGENTSHIELD MANAGED MCP ENTRY';
          const end = '# END VIBESANE AGENTSHIELD MANAGED MCP ENTRY';
          const startAt = current.indexOf(begin);
          const endAt = startAt < 0 ? -1 : current.indexOf(end, startAt);
          checks.codexMcpConfigured = startAt >= 0 && endAt >= 0
            && current.slice(startAt, endAt + end.length) === expected;
        }
      }
    } catch { checks.settingsReadable = false; }
    checks.hooksInstalled = checks.claudeHooksInstalled || checks.codexStopHookInstalled;
  }
  const ready = checks.node && checks.platform && checks.builtScanner && checks.gitRepository && checks.settingsReadable;
  process.stdout.write(JSON.stringify({ status: ready ? 'ready' : 'not_ready',
    root: root || null, checks, note: 'Hook and project MCP registration status is reported when configuration is readable. No repository code was executed.' }) + '\n');
  return ready ? 0 : 2;
}
async function mcpDoctor() {
  const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
  if (!(nodeMajor > 24 || (nodeMajor === 24 && nodeMinor >= 15))) {
    process.stdout.write(JSON.stringify({
      status: 'not_ready',
      check: 'node',
      required: '24.15.0 or newer',
      note: 'The transactional MCP worker queue requires the built-in node:sqlite module. Upgrade Node.js; no workspace paths or environment values are printed.',
    }) + '\\n');
    return 2;
  }
  const raw = process.env.VIBESANE_ALLOWED_ROOTS_JSON;
  let roots;
  try {
    if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw, 'utf8') > 32768) throw new Error();
    roots = JSON.parse(raw);
    if (!Array.isArray(roots) || roots.length < 1 || roots.length > 32
      || roots.some(root => typeof root !== 'string' || !root || root.length > 4096 || !path.isAbsolute(root))) {
      throw new Error();
    }
    const canonical = [];
    for (const root of roots) {
      const resolved = await realpath(root);
      const info = await stat(resolved);
      if (!info.isDirectory() || resolved === path.parse(resolved).root) throw new Error();
      if (!canonical.includes(resolved)) canonical.push(resolved);
    }
    process.stdout.write(JSON.stringify({
      status: 'ready',
      configuredRootCount: roots.length,
      canonicalRootCount: canonical.length,
      note: 'Authorized root configuration is valid. Paths are intentionally omitted; run MCP status from the coding-agent host to verify its server environment.',
    }) + '\n');
    return 0;
  } catch {
    process.stdout.write(JSON.stringify({
      status: 'not_ready',
      check: 'VIBESANE_ALLOWED_ROOTS_JSON',
      note: 'Set this variable to a JSON array of 1 to 32 existing absolute non-filesystem-root directories. Paths and environment values are not printed.',
    }) + '\n');
    return 2;
  }
}
async function child(program, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [program, ...args], { stdio: 'inherit', windowsHide: true });
    p.on('error', reject);
    p.on('close', code => resolve(code ?? 2));
  });
}
async function main(args) {
  const [command = 'help', ...tail] = args;
  if (['help', '--help', '-h'].includes(command)) {
    process.stdout.write([
      'VibeSane AgentShield — coding-agent security feedback',
      '',
      'Commands:',
      '  vibesane doctor [--cwd PROJECT]',
      '  vibesane connect [--agent auto|all|claude|codex|cursor|gemini|roo|copilot|mcp] [--cwd PROJECT]  Auto-register MCP',
      '  vibesane disconnect [--agent auto|all|claude|codex|cursor|gemini|roo|copilot] [--cwd PROJECT]  Remove exact managed MCP entries',
      '  vibesane mcp-doctor  Validate MCP workspace authorization without printing paths',
      '  vibesane scan --changed [--base-ref REF] [--cwd PROJECT]',
      '  vibesane verify --changed [--cwd PROJECT]',
      '  vibesane status [--cwd PROJECT]',
      '  vibesane config [--mode monitor|assist|auto-fix] [--completion-gate advisory|enforce] [--base-ref REF] [--cwd PROJECT]',
      '  vibesane acknowledge --rule RULE --file PATH --reason CODE --hours N [--cwd PROJECT]',
      '  vibesane setup --host claude|cursor [--cwd PROJECT] Configure project-scoped Foxy MCP',
      '  vibesane uninstall-mcp --host claude|cursor [--cwd PROJECT] Remove the exact managed MCP entry',
      '  vibesane init [--cwd PROJECT]          Install Claude Code hooks',
      '  vibesane init-codex [--cwd PROJECT]    Install Codex skill and Stop security hook',
      '  vibesane uninstall-codex [--cwd PROJECT] Remove AgentShield Codex hook and matching skill',
      '  vibesane uninstall [--cwd PROJECT]',
      '  vibesane capabilities --format json|text',
      '  vibesane hybrid --changed [--enable-ast]',
      '  vibesane-mcp                           Start read-only MCP stdio server',
      '',
      'Completion enforcement is opt-in: vibesane config --completion-gate enforce --base-ref origin/main --cwd PROJECT.',
      'Commit-aware enforcement scans the base-to-HEAD diff plus current staged, modified, and untracked files; keep the configured base ref fetched.',
      'Claude Code and Codex Stop hooks can block on blockers or UNKNOWN scans after hook trust; Cursor follow-up is not an equivalent hard gate.',
      'Static checks cover supported changed files only. A clean result is not a security certification.',
      '',
    ].join('\n'));
    return 0;
  }
  if (command === 'doctor') return doctor(tail);
  if (command === 'connect') return child(connector, tail);
  if (command === 'disconnect') return child(connector, ['disconnect', ...tail]);
  if (command === 'mcp-doctor' && tail.length === 0) return mcpDoctor();
  if (command === 'capabilities') {
    if (tail.length > 2 || (tail.length === 2 && tail[0] !== '--format') || (tail.length === 1 && !['json','text'].includes(tail[0]))) throw Error('Use capabilities --format json|text');
    return child(capabilities, [tail.length === 2 ? tail[1] : (tail[0] || 'json')]);
  }
  if (command === 'setup') return configureMcpHost(tail, false);
  if (command === 'uninstall-mcp') return configureMcpHost(tail, true);
  if (command === 'init') {
    if (!await isFile(dist)) throw new Error('First run pnpm --filter @workspace/api-server run build:agentshield.');
    return child(installer, ['install', cwdFrom(tail)]);
  }
  if (command === 'init-codex') return initCodexSkill(tail);
  if (command === 'uninstall-codex') return uninstallCodex(tail);
  if (command === 'uninstall') return child(installer, ['uninstall', cwdFrom(tail)]);
  if (command === 'hybrid') {
    if (!await isFile(dist) || !await isFile(hybrid)) throw new Error('Build scanner and use a checkout with the hybrid preview module.');
    return child(hybrid, tail);
  }
  if (command === 'scan') {
    if (!await isFile(dist)) throw new Error('AgentShield scanner is not built.');
    return child(dist, ['scan', ...tail]);
  }
  if (['verify', 'status', 'config', 'acknowledge'].includes(command)) return child(controller, [command, ...tail]);
  throw new Error('Commands: connect, capabilities, setup --host claude|cursor, uninstall-mcp --host claude|cursor, init, init-codex, uninstall-codex, scan --changed, hybrid --changed [--enable-ast] [--enable-local-ai], verify --changed, status, config, acknowledge, doctor, uninstall.');
}
main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => {
  process.stdout.write(JSON.stringify({ status: 'error', message: 'AgentShield command failed; run doctor for local diagnostics.' }) + '\n');
  process.exitCode = 2;
});
