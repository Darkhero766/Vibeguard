#!/usr/bin/env node
// AgentShield local developer commands; a repository checkout is required (no npm publishing).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat, readFile, realpath, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(scripts, '../dist/agentshield.mjs');
const controller = path.resolve(scripts, 'agentshield-controller.mjs');
const hybrid = path.resolve(scripts, 'agentshield-hybrid.mjs');
const capabilities = path.resolve(scripts, 'agentshield-capabilities.mjs');
const installer = path.resolve(scripts, 'agentshield-install.mjs');
const exec = promisify(execFile);

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
    '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
    '-C', cwd, 'rev-parse', '--show-toplevel',
  ], { timeout: 5000, maxBuffer: 4000 });
  return realpath(result.stdout.trim());
}
async function ensureSafeDirectory(directory) {
  try {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Refusing symlinked or non-directory Codex configuration path.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await mkdir(directory, { mode: 0o700 });
  }
}
async function readSafeJsonFile(file) {
  try {
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Refusing non-regular or symlinked Codex hooks.json.');
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Unexpected Codex hooks.json structure.');
    return value;
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
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
function codexHookCommand() {
  const hook = path.resolve(scripts, 'agentshield-codex-stop.mjs');
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
  if (process.platform === 'win32') throw new Error('Codex project hook installation currently supports macOS/Linux.');
  const root = await codexProjectRoot(cwdFrom(args));
  const codexDir = path.join(root, '.codex');
  await ensureSafeDirectory(codexDir);
  const hooksFile = path.join(codexDir, 'hooks.json');
  const config = await readSafeJsonFile(hooksFile);
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
    type: 'command', command, timeout: 30,
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
  if (process.platform === 'win32') throw new Error('Codex project hook removal currently supports macOS/Linux.');
  const root = await codexProjectRoot(cwdFrom(args));
  const codexDir = path.join(root, '.codex');
  const hooksFile = path.join(codexDir, 'hooks.json');
  const config = await readSafeJsonFile(hooksFile);
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

  const target = path.join(root, '.agents', 'skills', 'vibesane-agentshield', 'SKILL.md');
  let skillRemoved = false;
  const source = path.resolve(scripts, '../skills/vibesane-agentshield/SKILL.md');
  if (await isFile(target) && await isFile(source)) {
    const existing = await readFile(target, 'utf8');
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
  const checks = { node: Number(process.versions.node.split('.')[0]) >= 20,
    platform: process.platform !== 'win32', builtScanner: await isFile(dist),
    gitRepository: false, hooksInstalled: false, settingsReadable: true };
  let root = null;
  try {
    const r = await exec('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
      '-C', cwd, 'rev-parse', '--show-toplevel'], { timeout: 5000, maxBuffer: 4000 });
    root = await realpath(r.stdout.trim()); checks.gitRepository = true;
  } catch {}
  if (root) {
    const settings = path.join(root, '.claude', 'settings.json');
    try {
      if (await isFile(settings)) {
        const d = JSON.parse(await readFile(settings, 'utf8'));
        const hooks = d?.hooks || {};
        const entries = [...(hooks.PostToolUse || []), ...(hooks.Stop || [])];
        checks.hooksInstalled = entries.some(x => x?.hooks?.some(y =>
          typeof y?.command === 'string' && y.command.includes('agentshield-hook.mjs'))) &&
          entries.some(x => x?.hooks?.some(y => typeof y?.command === 'string' &&
            y.command.includes('agentshield-stop.mjs')));
      }
    } catch { checks.settingsReadable = false; }
  }
  const ready = checks.node && checks.platform && checks.builtScanner && checks.gitRepository && checks.settingsReadable;
  process.stdout.write(JSON.stringify({ status: ready ? 'ready' : 'not_ready',
    root: root || null, checks, note: 'Hooks must be installed separately. No customer code was executed.' }) + '\n');
  return ready ? 0 : 2;
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
      '  vibesane scan --changed [--base-ref REF] [--cwd PROJECT]',
      '  vibesane verify --changed [--cwd PROJECT]',
      '  vibesane status [--cwd PROJECT]',
      '  vibesane config [--mode monitor|assist|auto-fix] [--completion-gate advisory|enforce] [--base-ref REF] [--cwd PROJECT]',
      '  vibesane acknowledge --rule RULE --file PATH --reason CODE --hours N [--cwd PROJECT]',
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
  if (command === 'capabilities') {
    if (tail.length > 2 || (tail.length === 2 && tail[0] !== '--format') || (tail.length === 1 && !['json','text'].includes(tail[0]))) throw Error('Use capabilities --format json|text');
    return child(capabilities, [tail.length === 2 ? tail[1] : (tail[0] || 'json')]);
  }
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
  throw new Error('Commands: capabilities, init, init-codex, uninstall-codex, scan --changed, hybrid --changed [--enable-ast] [--enable-local-ai], verify --changed, status, config, acknowledge, doctor, uninstall.');
}
main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => {
  process.stdout.write(JSON.stringify({ status: 'error', message: 'AgentShield command failed; run doctor for local diagnostics.' }) + '\n');
  process.exitCode = 2;
});
