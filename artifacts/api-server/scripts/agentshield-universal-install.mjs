#!/usr/bin/env node
// Consent-first universal MCP installer. Host-specific writes remain delegated to the
// hardened connector so this entrypoint cannot create a second configuration path.
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  connectAgentShield,
  disconnectAgentShield,
  detectAgents,
} from './agentshield-connect.mjs';

const exec = promisify(execFile);
const SUPPORTED_HOSTS = Object.freeze(['claude', 'codex', 'cursor', 'gemini', 'roo', 'copilot']);
export function checkInstallerRuntime(nodeVersion = process.versions.node, platform = process.platform) {
  const match = /^v?(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(String(nodeVersion));
  if (!match) throw new Error('Could not parse the Node.js runtime version.');
  const [major, minor] = match.slice(1).map((part) => Number(part));
  const supportedNode = major > 24 || (major === 24 && minor >= 15);
  if (!supportedNode) throw new Error('Foxy requires Node.js 24.15.0 or newer; current runtime is v' + nodeVersion + '.');
  if (!['win32', 'darwin', 'linux'].includes(platform)) {
    throw new Error('Foxy installer does not support this operating system: ' + platform + '.');
  }
  return { nodeVersion: 'v' + nodeVersion, platform, supported: true };
}

const CONFIG_TARGETS = Object.freeze({
  claude: '.mcp.json',
  copilot: '.mcp.json',
  codex: '.codex/config.toml',
  cursor: '.cursor/mcp.json',
  gemini: '.gemini/settings.json',
  roo: '.roo/mcp.json',
});

export function parseInstallArgs(args = []) {
  const options = {
    agent: 'auto',
    cwd: process.cwd(),
    yes: false,
    dryRun: false,
    json: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--agent') {
      if (!args[i + 1]) throw new Error('Missing --agent value.');
      options.agent = args[++i].toLowerCase();
    } else if (arg === '--cwd') {
      if (!args[i + 1]) throw new Error('Missing --cwd value.');
      options.cwd = path.resolve(args[++i]);
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error('Usage: vibesane install [--agent auto|all|claude|codex|cursor|gemini|roo|copilot] [--cwd PROJECT] [--yes] [--dry-run] [--json].');
    }
  }
  if (!['auto', 'all', ...SUPPORTED_HOSTS].includes(options.agent)) {
    throw new Error('Agent must be auto, all, or one of: ' + SUPPORTED_HOSTS.join(', ') + '.');
  }
  if (options.yes && options.dryRun) throw new Error('Use either --yes or --dry-run, not both.');
  return options;
}

export async function resolveGitRoot(cwd) {
  const { stdout } = await exec('git', [
    '-c', 'core.fsmonitor=false',
    '-C', path.resolve(cwd || process.cwd()),
    'rev-parse', '--show-toplevel',
  ], { timeout: 7000, maxBuffer: 4000, windowsHide: true });
  const root = await realpath(stdout.trim());
  const info = await stat(root);
  const home = await realpath(os.homedir()).catch(() => path.resolve(os.homedir()));
  const normalized = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!info.isDirectory() || normalized(root) === normalized(path.parse(root).root)
    || normalized(root) === normalized(home)) {
    throw new Error('Select a Git repository below the filesystem and home-directory roots.');
  }
  return root;
}

export function buildInstallPlan({ agent = 'auto', root, detected = [] }) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new TypeError('A canonical absolute Git repository root is required.');
  }
  const hosts = agent === 'all'
    ? [...SUPPORTED_HOSTS]
    : agent === 'auto'
      ? SUPPORTED_HOSTS.filter((host) => detected.includes(host))
      : SUPPORTED_HOSTS.includes(agent) ? [agent] : [];
  return {
    status: hosts.length ? 'planned' : 'no_supported_agent_detected',
    root,
    agent,
    detected: SUPPORTED_HOSTS.filter((host) => detected.includes(host)),
    hosts,
    actions: hosts.map((host) => ({
      host,
      configFile: path.join(root, CONFIG_TARGETS[host]),
      sharedConfig: ['claude', 'copilot'].includes(host),
    })),
    hooks: 'not_installed',
    note: 'MCP registration only. Host approval/trust remains under your control; lifecycle hooks are separate and are not installed.',
  };
}

export async function prepareInstallPlan(options, overrides = {}) {
  checkInstallerRuntime(overrides.nodeVersion || process.versions.node, overrides.platform || process.platform);
  const resolveRoot = overrides.resolveRoot || resolveGitRoot;
  const detect = overrides.detect || detectAgents;
  const root = await resolveRoot(options.cwd);
  const detected = await detect({
    cwd: root,
    env: overrides.env || process.env,
    platform: overrides.platform || process.platform,
  });
  return buildInstallPlan({ agent: options.agent, root, detected });
}

export async function applyInstallPlan(plan, overrides = {}) {
  if (!plan || plan.status !== 'planned' || !Array.isArray(plan.hosts) || !plan.hosts.length) {
    return { ...plan, status: plan?.status || 'invalid_plan', results: [] };
  }
  const connect = overrides.connect || connectAgentShield;
  const disconnect = overrides.disconnect || disconnectAgentShield;
  const connectorOverrides = overrides.connectorOverrides || {};
  const results = [];
  const newlyConfigured = [];
  const preservedMigrations = [];
  let inFlightHost = null;
  let uncertainHosts = [];
  try {
    for (const host of plan.hosts) {
      inFlightHost = host;
      const response = await connect(['--agent', host, '--cwd', plan.root], connectorOverrides);
      const item = response?.results?.find((entry) => entry.host === host);
      if (!item || !['configured', 'already_configured', 'migrated'].includes(item.status)) {
        throw new Error('The ' + host + ' connector returned an unexpected result.');
      }
      results.push(item);
      if (item.status === 'configured') newlyConfigured.push(host);
      if (item.status === 'migrated') preservedMigrations.push(host);
      inFlightHost = null;
    }

    // Re-read every managed entry through the same hardened connector. A second
    // idempotent connect must report already_configured before we call the install verified.
    for (const host of plan.hosts) {
      inFlightHost = host;
      const verification = await connect(['--agent', host, '--cwd', plan.root], connectorOverrides);
      const item = verification?.results?.find((entry) => entry.host === host);
      if (item?.status !== 'already_configured') {
        throw new Error('Post-install verification did not confirm the exact managed entry for ' + host + '.');
      }
      inFlightHost = null;
    }
    return {
      status: 'installed',
      root: plan.root,
      detected: plan.detected,
      hosts: plan.hosts,
      results,
      verification: 'all_managed_entries_reopened_and_matched',
      hooks: 'not_installed',
      note: 'MCP configuration is present. Restart each selected agent and approve/trust the project server in that host; live tool discovery is a separate acceptance test.',
    };
  } catch (error) {
    // The connector may have committed its atomic rename and then failed while
    // releasing its lock. Without a returned status we cannot know whether the
    // current host changed; preserve it for manual exact-entry inspection.
    if (inFlightHost) uncertainHosts = [inFlightHost];
    const rollback = [];
    for (const host of newlyConfigured.reverse()) {
      try {
        const response = await disconnect(['--agent', host, '--cwd', plan.root], connectorOverrides);
        rollback.push({ host, status: response?.results?.[0]?.status || 'unknown' });
      } catch (rollbackError) {
        rollback.push({ host, status: 'rollback_failed', message: String(rollbackError?.message || 'Inspect configuration manually.').slice(0, 240) });
      }
    }
    const unresolvedUncertainHosts = uncertainHosts.filter((host) =>
      !rollback.some((item) => item.host === host && item.status === 'removed'));
    return {
      status: unresolvedUncertainHosts.length || rollback.some((item) => item.status !== 'removed') || preservedMigrations.length
        ? 'partial_failure'
        : 'rolled_back',
      root: plan.root,
      detected: plan.detected,
      hosts: plan.hosts,
      results,
      preservedMigrations,
      uncertainHosts: unresolvedUncertainHosts,
      rollback,
      error: String(error?.message || 'Installation failed.').slice(0, 400),
      note: 'Only entries newly created in this attempt were eligible for automatic removal. Existing or migrated entries and backups were preserved. A host whose connector threw before returning a status is marked uncertain because its atomic config write may already have completed; inspect it before retrying.',
    };
  }
}

async function confirmPlan() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question('Apply this project-scoped MCP configuration? [y/N] ');
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function printHumanPlan(plan) {
  process.stdout.write('Foxy installer — project-scoped MCP setup\n');
  process.stdout.write('Repository: ' + plan.root + '\n');
  if (!plan.hosts.length) {
    process.stdout.write('No supported agent was detected. No files were changed.\n');
    process.stdout.write('Choose one explicitly with --agent claude|codex|cursor|gemini|roo|copilot.\n');
    return;
  }
  process.stdout.write('Detected agents: ' + (plan.detected.length ? plan.detected.join(', ') : 'none') + '\n');
  process.stdout.write('Configuration targets:\n');
  for (const action of plan.actions) {
    process.stdout.write('  ' + action.host + ' -> ' + path.relative(plan.root, action.configFile)
      + (action.sharedConfig ? ' (workspace MCP config format)' : '') + '\n');
  }
  process.stdout.write('Hooks/skills: not installed (separate opt-in commands).\n');
  process.stdout.write('Foxy will not execute project code, modify source files, or enable completion enforcement.\n');
}

async function main(args) {
  let options;
  try {
    options = parseInstallArgs(args);
    const plan = await prepareInstallPlan(options);
    if (options.dryRun) {
      const output = { ...plan, status: plan.status === 'planned' ? 'dry_run' : plan.status };
      process.stdout.write(options.json ? JSON.stringify(output) + '\n' : '');
      if (!options.json) {
        printHumanPlan(plan);
        process.stdout.write('Dry run only — no configuration was changed.\n');
      }
      return plan.hosts.length ? 0 : 1;
    }
    if (!plan.hosts.length) {
      const output = { ...plan, status: 'no_supported_agent_detected' };
      process.stdout.write(options.json ? JSON.stringify(output) + '\n' : '');
      if (!options.json) printHumanPlan(plan);
      return 1;
    }
    if (!options.yes) {
      if (!process.stdin.isTTY || !process.stdout.isTTY || options.json) {
        throw new Error('Installation needs explicit consent. Re-run interactively or pass --yes after reviewing the target plan.');
      }
      printHumanPlan(plan);
      if (!await confirmPlan()) {
        const output = { status: 'cancelled', root: plan.root, hosts: plan.hosts, changed: false };
        process.stdout.write(options.json ? JSON.stringify(output) + '\n' : 'Cancelled. No configuration was changed.\n');
        return 1;
      }
    }
    const result = await applyInstallPlan(plan);
    if (options.json) process.stdout.write(JSON.stringify(result) + '\n');
    else {
      if (result.status === 'installed') {
        process.stdout.write('\nFoxy MCP configuration installed and locally verified.\n');
        for (const item of result.results) process.stdout.write('  ' + item.host + ': ' + item.status
          + (item.configFile ? ' — ' + path.relative(plan.root, item.configFile) : '') + '\n');
        process.stdout.write('Next: restart each selected AI agent and approve/trust the project MCP server.\n');
      } else {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      }
    }
    return result.status === 'installed' ? 0 : 2;
  } catch (error) {
    const message = String(error?.message || 'Installer failed.').slice(0, 400);
    process.stderr.write(options?.json ? JSON.stringify({ status: 'error', error: message }) + '\n'
      : 'Foxy install failed: ' + message + '\n');
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
