#!/usr/bin/env node
// AgentShield local developer commands; a repository checkout is required (no npm publishing).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat, readFile, realpath, mkdir, writeFile } from 'node:fs/promises';
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
async function initCodexSkill(args) {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd') {
      if (!args[i + 1]) throw new Error('Missing --cwd value.');
      i++;
    } else throw new Error('init-codex accepts only --cwd PROJECT.');
  }
  const cwd = cwdFrom(args);
  const result = await exec('git', [
    '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null',
    '-C', cwd, 'rev-parse', '--show-toplevel',
  ], { timeout: 5000, maxBuffer: 4000 });
  const root = await realpath(result.stdout.trim());
  const targetDir = path.join(root, '.agents', 'skills', 'vibesane-agentshield');
  const directories = [
    path.join(root, '.agents'),
    path.join(root, '.agents', 'skills'),
    targetDir,
  ];
  for (const directory of directories) {
    try {
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Refusing symlinked or non-directory Codex skill path.');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await mkdir(directory, { mode: 0o700 });
    }
  }
  const source = path.resolve(scripts, '../skills/vibesane-agentshield/SKILL.md');
  if (!await isFile(source)) throw new Error('Packaged AgentShield skill is missing.');
  const target = path.join(targetDir, 'SKILL.md');
  const skill = await readFile(source, 'utf8');
  try {
    await writeFile(target, skill, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('Codex AgentShield skill already exists; refusing to overwrite it.');
    throw error;
  }
  process.stdout.write(JSON.stringify({
    status: 'installed',
    skill: target,
    note: 'Restart or refresh Codex so it can discover the project skill. Existing files were not overwritten.',
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
      '  vibesane scan --changed [--cwd PROJECT]',
      '  vibesane verify --changed [--cwd PROJECT]',
      '  vibesane status [--cwd PROJECT]',
      '  vibesane config [--mode monitor|assist|auto-fix] [--completion-gate advisory|enforce] [--cwd PROJECT]',
      '  vibesane acknowledge --rule RULE --file PATH --reason CODE --hours N [--cwd PROJECT]',
      '  vibesane init [--cwd PROJECT]          Install Claude Code hooks',
      '  vibesane init-codex [--cwd PROJECT]    Install the Codex project skill',
      '  vibesane uninstall [--cwd PROJECT]',
      '  vibesane capabilities --format json|text',
      '  vibesane hybrid --changed [--enable-ast]',
      '  vibesane-mcp                           Start read-only MCP stdio server',
      '',
      'Completion enforcement is opt-in: vibesane config --completion-gate enforce --cwd PROJECT.',
      'Claude Code Stop hooks can block on blockers or UNKNOWN scans; Cursor follow-up is not an equivalent hard gate.',
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
  throw new Error('Commands: capabilities, init, init-codex, scan --changed, hybrid --changed [--enable-ast] [--enable-local-ai], verify --changed, status, config, acknowledge, doctor, uninstall.');
}
main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => {
  process.stdout.write(JSON.stringify({ status: 'error', message: 'AgentShield command failed; run doctor for local diagnostics.' }) + '\n');
  process.exitCode = 2;
});
