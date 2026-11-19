#!/usr/bin/env node
// AgentShield local developer commands; a repository checkout is required (no npm publishing).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(scripts, '../dist/agentshield.mjs');
const controller = path.resolve(scripts, 'agentshield-controller.mjs');
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
  const [command, ...tail] = args;
  if (command === 'doctor') return doctor(tail);
  if (command === 'init') {
    if (!await isFile(dist)) throw new Error('First run pnpm --filter @workspace/api-server run build:agentshield.');
    return child(installer, ['install', cwdFrom(tail)]);
  }
  if (command === 'uninstall') return child(installer, ['uninstall', cwdFrom(tail)]);
  if (command === 'scan') {
    if (!await isFile(dist)) throw new Error('AgentShield scanner is not built.');
    return child(dist, ['scan', ...tail]);
  }
  if (['verify', 'status', 'config'].includes(command)) return child(controller, [command, ...tail]);
  throw new Error('Commands: init, scan --changed, verify --changed, status, config, doctor, uninstall.');
}
main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(() => {
  process.stdout.write(JSON.stringify({ status: 'error', message: 'AgentShield command failed; run doctor for local diagnostics.' }) + '\n');
  process.exitCode = 2;
});
