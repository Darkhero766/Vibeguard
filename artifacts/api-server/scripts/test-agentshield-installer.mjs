import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  parseInstallArgs,
  buildInstallPlan,
  prepareInstallPlan,
  applyInstallPlan,
  checkInstallerRuntime,
} from './agentshield-universal-install.mjs';

const root = path.resolve(path.parse(process.cwd()).root, 'foxy-installer-fixture');


test('installer runtime preflight rejects unsupported Node versions and operating systems', () => {
  assert.deepEqual(checkInstallerRuntime('24.15.0', 'linux'), {
    nodeVersion: 'v24.15.0', platform: 'linux', supported: true,
  });
  assert.deepEqual(checkInstallerRuntime('25.1.0', 'darwin').supported, true);
  assert.throws(() => checkInstallerRuntime('24.14.9', 'linux'), /Node.js 24.15.0 or newer/);
  assert.throws(() => checkInstallerRuntime('23.99.0', 'win32'), /Node.js 24.15.0 or newer/);
  assert.throws(() => checkInstallerRuntime('24.22.0', 'freebsd'), /does not support this operating system/);
});

test('installer arguments default to automatic detection and reject unsafe or unknown flags', () => {
  assert.deepEqual(parseInstallArgs([]), {
    agent: 'auto', cwd: process.cwd(), yes: false, dryRun: false, json: false,
  });
  assert.equal(parseInstallArgs(['--agent', 'CODEX', '--yes']).agent, 'codex');
  assert.equal(parseInstallArgs(['--cwd', './repo']).cwd, path.resolve('./repo'));
  assert.equal(parseInstallArgs(['--dry-run']).dryRun, true);
  assert.throws(() => parseInstallArgs(['--agent', 'unknown']), /Agent must be/);
  assert.throws(() => parseInstallArgs(['--cwd']), /Missing --cwd/);
  assert.throws(() => parseInstallArgs(['--yes', '--dry-run']), /either --yes or --dry-run/);
  assert.throws(() => parseInstallArgs(['--force']), /Usage:/);
});

test('install plan maps supported agents to project-scoped config targets', () => {
  const plan = buildInstallPlan({
    agent: 'auto',
    root,
    detected: ['codex', 'claude', 'copilot', 'unknown'],
  });
  assert.equal(plan.status, 'planned');
  assert.deepEqual(plan.hosts, ['claude', 'codex', 'copilot']);
  assert.equal(plan.actions[0].configFile, path.join(root, '.mcp.json'));
  assert.equal(plan.actions[1].configFile, path.join(root, '.codex', 'config.toml'));
  assert.equal(plan.actions[2].sharedConfig, true);
  assert.equal(plan.hooks, 'not_installed');
  assert.throws(() => buildInstallPlan({ root: 'relative/path' }), /absolute Git repository root/);
});

test('auto plan uses detected hosts only; all is explicit and includes every adapter', async () => {
  const auto = await prepareInstallPlan({ agent: 'auto', cwd: root }, {
    resolveRoot: async () => root,
    detect: async () => ['codex', 'cursor'],
  });
  assert.deepEqual(auto.hosts, ['codex', 'cursor']);
  const all = buildInstallPlan({ agent: 'all', root, detected: ['codex'] });
  assert.deepEqual(all.hosts, ['claude', 'codex', 'cursor', 'gemini', 'roo', 'copilot']);
  const explicit = buildInstallPlan({ agent: 'claude', root, detected: [] });
  assert.deepEqual(explicit.hosts, ['claude']);
});

test('empty plan does not invoke connector or mutate configuration', async () => {
  let calls = 0;
  const result = await applyInstallPlan(buildInstallPlan({ agent: 'auto', root, detected: [] }), {
    connect: async () => { calls++; throw new Error('must not run'); },
  });
  assert.equal(result.status, 'no_supported_agent_detected');
  assert.equal(calls, 0);
});

test('installer configures each selected agent and reopens every entry for local verification', async () => {
  const calls = [];
  const counts = new Map();
  const plan = buildInstallPlan({ agent: 'auto', root, detected: ['claude', 'codex'] });
  const result = await applyInstallPlan(plan, {
    connect: async (args) => {
      const host = args[1];
      calls.push(host);
      const count = (counts.get(host) || 0) + 1;
      counts.set(host, count);
      return {
        results: [{
          host,
          status: count === 1 ? 'configured' : 'already_configured',
          configFile: path.join(root, host === 'codex' ? '.codex/config.toml' : '.mcp.json'),
        }],
      };
    },
    disconnect: async () => { throw new Error('rollback should not run'); },
  });
  assert.equal(result.status, 'installed');
  assert.equal(result.verification, 'all_managed_entries_reopened_and_matched');
  assert.deepEqual(calls, ['claude', 'codex', 'claude', 'codex']);
  assert.deepEqual(result.hosts, ['claude', 'codex']);
});

test('installer rolls back known new entries and marks the failing in-flight host uncertain', async () => {
  const connectCalls = [];
  const disconnectCalls = [];
  const plan = buildInstallPlan({ agent: 'auto', root, detected: ['claude', 'codex'] });
  const result = await applyInstallPlan(plan, {
    connect: async (args) => {
      const host = args[1];
      connectCalls.push(host);
      if (host === 'codex') throw new Error('synthetic config conflict');
      return { results: [{ host, status: 'configured' }] };
    },
    disconnect: async (args) => {
      const host = args[1];
      disconnectCalls.push(host);
      return { results: [{ host, status: 'removed' }] };
    },
  });
  assert.equal(result.status, 'partial_failure');
  assert.match(result.error, /synthetic config conflict/);
  assert.deepEqual(connectCalls, ['claude', 'codex']);
  assert.deepEqual(disconnectCalls, ['claude']);
  assert.equal(result.rollback[0].status, 'removed');
  assert.deepEqual(result.uncertainHosts, ['codex']);
});

test('installer never auto-removes migrated pre-existing managed entries during rollback', async () => {
  const disconnectCalls = [];
  const plan = buildInstallPlan({ agent: 'auto', root, detected: ['claude', 'codex'] });
  const result = await applyInstallPlan(plan, {
    connect: async (args) => {
      const host = args[1];
      if (host === 'codex') throw new Error('synthetic later failure');
      return { results: [{ host, status: 'migrated' }] };
    },
    disconnect: async (args) => {
      disconnectCalls.push(args[1]);
      return { results: [{ host: args[1], status: 'removed' }] };
    },
  });
  assert.equal(result.status, 'partial_failure');
  assert.deepEqual(result.preservedMigrations, ['claude']);
  assert.deepEqual(disconnectCalls, []);
});

test('verification mismatch triggers rollback of entries created by this attempt', async () => {
  const counts = new Map();
  const removed = [];
  const plan = buildInstallPlan({ agent: 'claude', root, detected: [] });
  const result = await applyInstallPlan(plan, {
    connect: async (args) => {
      const host = args[1];
      const n = (counts.get(host) || 0) + 1;
      counts.set(host, n);
      return { results: [{ host, status: n === 1 ? 'configured' : 'migrated' }] };
    },
    disconnect: async (args) => {
      removed.push(args[1]);
      return { results: [{ host: args[1], status: 'removed' }] };
    },
  });
  assert.equal(result.status, 'rolled_back');
  assert.deepEqual(removed, ['claude']);
});


test('connector throw marks in-flight host uncertain and never claims clean rollback', async () => {
  const disconnectCalls = [];
  const plan = buildInstallPlan({ agent: 'codex', root, detected: [] });
  const result = await applyInstallPlan(plan, {
    connect: async () => { throw new Error('synthetic lock-release failure after possible atomic write'); },
    disconnect: async (args) => {
      disconnectCalls.push(args[1]);
      return { results: [{ host: args[1], status: 'removed' }] };
    },
  });
  assert.equal(result.status, 'partial_failure');
  assert.deepEqual(result.uncertainHosts, ['codex']);
  assert.deepEqual(disconnectCalls, [],
    'An in-flight host with an unknown write outcome must not be automatically removed.');
  assert.match(result.note, /marked uncertain/i);
});
