#!/usr/bin/env node
// Add/remove only our hook entry. Never replace unrelated Claude Code settings.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir, rename, lstat, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const hookPath = path.join(scriptsDir, 'agentshield-hook.mjs');
const usage = 'Usage: node scripts/agentshield-install.mjs install|uninstall /absolute/path/to/customer-project';

async function main() {
  const [mode, project] = process.argv.slice(2);
  if (!['install', 'uninstall'].includes(mode) || !project) throw new Error(usage);
  if (process.platform === 'win32') throw new Error('This installer currently supports macOS/Linux; use a POSIX shell.');
  const projectDir = path.resolve(project);
  const claudeDir = path.join(projectDir, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  // Single-quoted POSIX shell argument. Only the fixed hook path is inserted.
  const command = "node '" + hookPath.replaceAll("'", "'\\''") + "'";

  let settings = {};
  try {
    const info = await lstat(settingsPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Refusing non-regular Claude settings file.');
    settings = JSON.parse(await readFile(settingsPath, 'utf8'));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Unexpected Claude settings structure.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (mode === 'uninstall') { console.log('AgentShield was not installed.'); return; }
  }
  const hooks = settings.hooks && typeof settings.hooks === 'object' && !Array.isArray(settings.hooks) ? settings.hooks : {};
  const old = Array.isArray(hooks.PostToolUse) ? hooks.PostToolUse : [];
  const without = old.map((entry) => {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.hooks)) return entry;
    const kept = entry.hooks.filter((item) => !(item?.type === 'command' && item.command === command));
    return kept.length ? { ...entry, hooks: kept } : null;
  }).filter(Boolean);

  if (mode === 'install') without.push({ matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command, timeout: 20 }] });
  if (without.length) hooks.PostToolUse = without;
  else delete hooks.PostToolUse;
  if (Object.keys(hooks).length) settings.hooks = hooks;
  else delete settings.hooks;

  // Do not create or rewrite settings unnecessarily when removing an absent hook.
  if (mode === 'uninstall' && JSON.stringify(old) === JSON.stringify(without)) {
    console.log('No matching AgentShield hook found; settings unchanged.'); return;
  }
  await mkdir(claudeDir, { recursive: true });
  const temp = settingsPath + '.agentshield-' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, JSON.stringify(settings, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await rename(temp, settingsPath);
  } catch (error) {
    try { await unlink(temp); } catch {}
    throw error;
  }
  console.log(mode === 'install' ? 'Installed VibeSane AgentShield PostToolUse hook.' : 'Removed VibeSane AgentShield hook.');
}
main().catch((e) => { console.error('AgentShield installer: ' + e.message); process.exitCode = 2; });
