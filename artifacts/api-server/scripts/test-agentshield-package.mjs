#!/usr/bin/env node
// Offline install/CLI/MCP smoke test for the unpublished AgentShield beta.
// Uses only a synthetic disposable Git repository; never runs customer project code.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const exec = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const dist = path.join(root, 'dist');
const stage = path.join(dist, 'agentshield-beta-stage');
const temp = await mkdtemp(path.join(os.tmpdir(), 'agentshield-package-smoke-'));
const installPrefix = path.join(temp, 'install');
const fixture = path.join(temp, 'fixture');
  const cancelFixture = path.join(temp, 'cancel-fixture');
let archive = null;

async function run(program, args, options = {}) {
  return exec(program, args, {
    cwd: root, timeout: 60_000, maxBuffer: 4_000_000, windowsHide: true,
    shell: process.platform === 'win32' && program === 'npm',
    ...options,
  });
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function runHook(script, cwd, payload, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Codex Stop hook process timed out.'));
    }, 20_000);
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    }
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => finish(error));
    child.on('close', code => {
      if (code !== 0) return finish(new Error('Codex Stop hook exited ' + code + ': ' + stderr.slice(0, 500)));
      if (!stdout.trim()) return finish(null, null);
      try { finish(null, JSON.parse(stdout)); }
      catch { finish(new Error('Codex Stop hook emitted invalid JSON: ' + stdout.slice(0, 500))); }
    });
    child.stdin.end(JSON.stringify(payload) + '\n');
  });
}

async function withPackagedMcp(executable, env, run) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [executable], env, stderr: 'pipe' });
  const client = new Client({ name: 'agentshield-package-smoke', version: '1.0.0' }, {
    versionNegotiation: { mode: { pin: '2026-07-28' }, probe: { timeoutMs: 3000 } },
  });
  try {
    await client.connect(transport, { timeout: 15_000 });
    return await run(client);
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

try {
  assert(['darwin', 'linux', 'win32'].includes(process.platform),
    'Package smoke supports Windows, macOS and Linux only.');
  assert(Number(process.versions.node.split('.')[0]) >= 20, 'Node.js 20 or newer is required.');

  await run(process.execPath, [path.join(scriptsDir, 'build-agentshield.mjs')]);
  const pack = await run(process.execPath, [path.join(scriptsDir, 'package-agentshield-beta.mjs')]);
  const packaged = JSON.parse(pack.stdout);
  assert(packaged.status === 'packaged_local_only' && packaged.published === false,
    'Packaging must remain local-only.');
  assert(packaged.version === '0.7.0-beta.3', 'Unexpected AgentShield beta package version.');
  assert(typeof packaged.archive === 'string' && typeof packaged.sha256 === 'string',
    'Packaging did not return an archive path and SHA-256.');
  archive = packaged.archive;
  const packagedReadme = await run('tar', ['-xOf', archive, 'package/README.md']);
  assert(packagedReadme.stdout.includes('vibesane connect')
    && packagedReadme.stdout.includes('--completion-gate enforce')
    && packagedReadme.stdout.includes('--base-ref origin/main')
    && packagedReadme.stdout.includes('VIBESANE_ALLOWED_ROOTS_JSON')
    && packagedReadme.stdout.includes('mcp-doctor')
    && packagedReadme.stdout.includes('Codex Stop hooks')
    && packagedReadme.stdout.includes('init-codex')
    && packagedReadme.stdout.includes('setup --host cursor')
    && packagedReadme.stdout.includes('uninstall-mcp --host claude'),
    'Packaged README omits MCP setup or completion-enforcement instructions.');

  await run('npm', ['install', '--global', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', '--prefix', installPrefix, archive], {
    env: { ...process.env, npm_config_audit: 'false', npm_config_fund: 'false', npm_config_offline: 'true' },
  });
  const packageRoot = process.platform === 'win32'
    ? path.join(installPrefix, 'node_modules', '@vibesane', 'agentshield')
    : path.join(installPrefix, 'lib', 'node_modules', '@vibesane', 'agentshield');
  const cli = path.join(packageRoot, 'scripts', 'vibesane.mjs');
  const mcp = path.join(packageRoot, 'scripts', 'agentshield-mcp-stdio.mjs');
  async function runCli(args, options = {}) {
    return run(process.execPath, [cli, ...args], options);
  }

  const help = await runCli(['--help'], { cwd: temp });
  assert(help.stdout.includes('VibeSane AgentShield'), 'Installed CLI help did not execute.');
  const mcpDoctor = await runCli(['mcp-doctor'], { cwd: temp, env: {
    ...process.env,
    VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([temp, temp]),
  } });
  const mcpHealth = JSON.parse(mcpDoctor.stdout);
  assert(mcpHealth.status === 'ready' && mcpHealth.configuredRootCount === 2
    && mcpHealth.canonicalRootCount === 1 && !mcpDoctor.stdout.includes(temp),
  'Installed MCP doctor did not validate/deduplicate roots without printing their paths.');
  let invalidMcpDoctorRejected = false;
  try {
    await runCli(['mcp-doctor'], { cwd: temp, env: {
      ...process.env,
      VIBESANE_ALLOWED_ROOTS_JSON: 'not-json',
    } });
  } catch (error) {
    invalidMcpDoctorRejected = error?.code === 2 && String(error?.stdout || '').includes('"status":"not_ready"');
  }
  assert(invalidMcpDoctorRejected, 'Installed MCP doctor did not fail closed on malformed authorization configuration.');
  const connectFixture = path.join(temp, 'connect-fixture');
  await mkdir(connectFixture, { recursive: true });
  await run('git', ['init', '-q', connectFixture]);
  const connected = JSON.parse((await runCli(['connect', '--agent', 'all', '--cwd', connectFixture], { cwd: temp })).stdout);
  assert(connected.status === 'connected'
    && connected.results.map(item => item.host).join(',') === 'claude,codex,cursor',
    'Installed one-command connector did not configure all supported MCP hosts.');
  const connectedClaude = JSON.parse(await readFile(path.join(connectFixture, '.mcp.json'), 'utf8'));
  const connectedCursor = JSON.parse(await readFile(path.join(connectFixture, '.cursor', 'mcp.json'), 'utf8'));
  const connectedCodex = await readFile(path.join(connectFixture, '.codex', 'config.toml'), 'utf8');
  assert(connectedClaude.mcpServers['vibesane-agentshield']?.command === process.execPath
    && connectedCursor.mcpServers['vibesane-agentshield']?.type === 'stdio'
    && connectedCodex.includes('[mcp_servers.vibesane_agentshield]'),
    'One-command connector did not create all three host entries.');
  const connectedDoctor = JSON.parse((await runCli(['doctor', '--cwd', connectFixture], { cwd: temp })).stdout);
  assert(connectedDoctor.status === 'ready'
    && connectedDoctor.checks.claudeMcpConfigured
    && connectedDoctor.checks.cursorMcpConfigured,
    'Doctor did not verify one-command MCP registration.');
  const generic = JSON.parse((await runCli(['connect', '--agent', 'mcp', '--cwd', connectFixture], { cwd: temp })).stdout);
  assert(generic.status === 'manual_mcp_configuration'
    && generic.server.env.VIBESANE_ALLOWED_ROOTS_JSON === JSON.stringify([connectFixture]),
    'Generic MCP mode did not produce an exact workspace-scoped stdio configuration.');

  await mkdir(path.join(fixture, 'src'), { recursive: true });
  await writeFile(path.join(fixture, 'src', 'index.js'), 'export const baseline = true;\n');
  await run('git', ['init', '-q', fixture]);
  await run('git', ['-C', fixture, 'branch', '-M', 'main']);

  // Project-scoped MCP setup must preserve unrelated config, back up before
  // replacement, remain idempotent, and refuse to remove customized entries.
  await mkdir(path.join(fixture, '.cursor'), { recursive: true });
  const cursorConfigPath = path.join(fixture, '.cursor', 'mcp.json');
  await writeFile(cursorConfigPath, JSON.stringify({
    customSetting: 'preserve-me',
    mcpServers: { unrelatedServer: { command: 'example-server', args: [] } },
  }, null, 2));
  const cursorSetup = JSON.parse((await runCli(['setup', '--host', 'cursor', '--cwd', fixture], { cwd: temp })).stdout);
  assert(cursorSetup.status === 'configured' && cursorSetup.backup,
    'Cursor setup did not back up its pre-existing project MCP config.');
  const cursorConfig = JSON.parse(await readFile(cursorConfigPath, 'utf8'));
  assert(cursorConfig.customSetting === 'preserve-me' && cursorConfig.mcpServers.unrelatedServer.command === 'example-server',
    'Cursor setup did not preserve unrelated project configuration.');
  const cursorEntry = cursorConfig.mcpServers['vibesane-agentshield'];
  assert(cursorEntry?.type === 'stdio' && cursorEntry.command === process.execPath
    && cursorEntry.args[0].endsWith(path.join('scripts', 'agentshield-mcp-stdio.mjs'))
    && cursorEntry.env.VIBESANE_ALLOWED_ROOTS_JSON === JSON.stringify([fixture]),
    'Cursor setup did not create a project-scoped STDIO entry with an exact root allowlist.');
  const cursorDoctor = JSON.parse((await runCli(['doctor', '--cwd', fixture], { cwd: temp })).stdout);
  assert(cursorDoctor.status === 'ready' && cursorDoctor.checks.cursorMcpConfigured === true,
    'Doctor did not detect the managed Cursor MCP entry.');
  const backupConfig = JSON.parse(await readFile(cursorSetup.backup, 'utf8'));
  assert(backupConfig.customSetting === 'preserve-me' && !backupConfig.mcpServers['vibesane-agentshield'],
    'Cursor setup backup did not preserve the original config.');
  const cursorAgain = JSON.parse((await runCli(['setup', '--host', 'cursor', '--cwd', fixture], { cwd: temp })).stdout);
  assert(cursorAgain.status === 'already_configured', 'Cursor setup is not idempotent.');
  const cursorRemoved = JSON.parse((await runCli(['uninstall-mcp', '--host', 'cursor', '--cwd', fixture], { cwd: temp })).stdout);
  assert(cursorRemoved.status === 'removed', 'Cursor MCP uninstaller did not remove its exact managed entry.');
  const cursorAfterRemove = JSON.parse(await readFile(cursorConfigPath, 'utf8'));
  assert(cursorAfterRemove.customSetting === 'preserve-me'
    && cursorAfterRemove.mcpServers.unrelatedServer.command === 'example-server'
    && !cursorAfterRemove.mcpServers['vibesane-agentshield'],
    'Cursor MCP uninstaller removed unrelated config.');

  const claudeSetup = JSON.parse((await runCli(['setup', '--host', 'claude', '--cwd', fixture], { cwd: temp })).stdout);
  const claudeConfigPath = path.join(fixture, '.mcp.json');
  const claudeConfig = JSON.parse(await readFile(claudeConfigPath, 'utf8'));
  assert(claudeSetup.status === 'configured'
    && claudeConfig.mcpServers['vibesane-agentshield'].command === process.execPath
    && claudeConfig.mcpServers['vibesane-agentshield'].env.VIBESANE_ALLOWED_ROOTS_JSON === JSON.stringify([fixture]),
    'Claude Code setup did not write a project-scoped MCP config.');
  const claudeDoctor = JSON.parse((await runCli(['doctor', '--cwd', fixture], { cwd: temp })).stdout);
  assert(claudeDoctor.status === 'ready' && claudeDoctor.checks.claudeMcpConfigured === true,
    'Doctor did not detect the managed Claude MCP entry.');
  await runCli(['uninstall-mcp', '--host', 'claude', '--cwd', fixture], { cwd: temp });
  const claudeAfterRemove = JSON.parse(await readFile(claudeConfigPath, 'utf8'));
  assert(!claudeAfterRemove.mcpServers, 'Claude MCP uninstaller left its managed entry behind.');

  const symlinkFixture = path.join(temp, 'symlink-fixture');
  await mkdir(symlinkFixture, { recursive: true });
  await run('git', ['init', '-q', symlinkFixture]);
  let symlinkRejected = false;
  let externalConfig;
  if (process.platform === 'win32') {
    // A junction does not require the Windows Developer Mode/symlink privilege.
    const externalDirectory = path.join(temp, 'external-cursor-config');
    await mkdir(externalDirectory);
    externalConfig = path.join(externalDirectory, 'mcp.json');
    await writeFile(externalConfig, JSON.stringify({ mcpServers: { safe: { command: 'leave-alone' } } }));
    await symlink(externalDirectory, path.join(symlinkFixture, '.cursor'), 'junction');
    try { await runCli(['setup', '--host', 'cursor', '--cwd', symlinkFixture], { cwd: temp }); }
    catch { symlinkRejected = true; }
  } else {
    externalConfig = path.join(temp, 'external-mcp-config.json');
    await writeFile(externalConfig, JSON.stringify({ mcpServers: { safe: { command: 'leave-alone' } } }));
    await symlink(externalConfig, path.join(symlinkFixture, '.mcp.json'));
    try { await runCli(['setup', '--host', 'claude', '--cwd', symlinkFixture], { cwd: temp }); }
    catch { symlinkRejected = true; }
  }
  assert(symlinkRejected && JSON.parse(await readFile(externalConfig, 'utf8')).mcpServers.safe.command === 'leave-alone',
    'Host setup did not reject a symlinked configuration path safely.');

  const codexInit = await runCli(['init-codex', '--cwd', fixture], { cwd: temp });
  const codexInstall = JSON.parse(codexInit.stdout);
  assert(codexInstall.status === 'installed'
    && codexInstall.hook.endsWith(path.join('.codex', 'hooks.json')),
    'Installed package could not configure Codex project Stop hook.');
  const codexHooksFile = path.join(fixture, '.codex', 'hooks.json');
  const codexHooks = JSON.parse(await readFile(codexHooksFile, 'utf8'));
  assert(codexHooks.hooks.Stop.some(entry => entry.hooks.some(item =>
    item.command?.includes('agentshield-codex-stop.mjs'))),
    'Codex Stop hook entry is missing from installed package.');
  await run('git', ['-C', fixture, 'config', 'user.name', 'AgentShield Package Smoke']);
  await run('git', ['-C', fixture, 'config', 'user.email', 'agentshield-smoke@example.invalid']);
  await run('git', ['-C', fixture, 'add', '.']);
  await run('git', ['-C', fixture, 'commit', '-qm', 'synthetic fixture baseline']);
  await run('git', ['-C', fixture, 'branch', 'agentshield-base']);
  await writeFile(path.join(fixture, 'src', 'index.js'), 'export const changed = true;\n');

  const doctor = await runCli(['doctor', '--cwd', fixture], { cwd: temp });
  const health = JSON.parse(doctor.stdout);
  assert(health.status === 'ready' && health.checks.codexStopHookInstalled === true
    && health.checks.hooksInstalled === true,
  'Installed CLI doctor did not report the configured Codex Stop hook.');
  await writeFile(path.join(fixture, 'src', 'index.js'), 'export const committedChange = true;\n');
  await run('git', ['-C', fixture, 'add', '.']);
  await run('git', ['-C', fixture, '-c', 'user.name=AgentShield Package Smoke', '-c',
    'user.email=agentshield-smoke@example.invalid', 'commit', '-qm', 'synthetic committed change']);
  const scan = await runCli(['scan', '--changed', '--base-ref', 'agentshield-base', '--cwd', fixture, '--format', 'json'], { cwd: temp });
  const report = JSON.parse(scan.stdout);
  assert(report.status === 'complete' && report.filesScanned === 1
    && typeof report.baseRef === 'string' && report.baseRef.length === 40,
    'Installed package did not complete the synthetic committed base-ref scan.');

  // Exercise the installed Codex Stop adapter as a real child process, not just
  // the hook-registration JSON. All state/config paths are isolated to this fixture.
  const codexStop = path.join(packageRoot, 'scripts', 'agentshield-codex-stop.mjs');
  const hookEnv = {
    ...process.env,
    VIBESANE_AGENTSHIELD_CONFIG_HOME: path.join(temp, 'agent-config'),
    VIBESANE_AGENTSHIELD_STATE_HOME: path.join(temp, 'agent-state'),
  };
  await writeFile(path.join(fixture, 'src', 'auth.js'),
    'const JWT_SECRET = "' + 'Z'.repeat(36) + '";\n');
  await run('git', ['-C', fixture, 'add', 'src/auth.js']);
  await run('git', ['-C', fixture, '-c', 'user.name=AgentShield Package Smoke', '-c',
    'user.email=agentshield-smoke@example.invalid', 'commit', '-qm', 'synthetic blocker fixture']);
  await runCli(['config', '--mode', 'assist', '--completion-gate', 'enforce',
    '--base-ref', 'agentshield-base', '--cwd', fixture], { cwd: temp, env: hookEnv });
  const blockedStop = await runHook(codexStop, fixture, {
    cwd: fixture, thread_id: 'agentshield-smoke-thread', turn_id: 'agentshield-smoke-blocker',
    stop_hook_active: false,
  }, hookEnv);
  assert(blockedStop?.decision === 'block' && /blocking finding/i.test(blockedStop.reason || ''),
    'Installed Codex Stop hook did not return the expected continuation block for a synthetic blocker.');
  const terminalStop = await runHook(codexStop, fixture, {
    cwd: fixture, thread_id: 'agentshield-smoke-thread', turn_id: 'agentshield-smoke-recursive',
    stop_hook_active: true,
  }, hookEnv);
  assert(terminalStop?.continue === false && /blocking finding/i.test(terminalStop.stopReason || ''),
    'Installed Codex Stop hook did not terminate a still-blocked recursive turn.');

  await writeFile(path.join(fixture, 'src', 'auth.js'),
    'const JWT_SECRET = process.env.JWT_SECRET;\n');
  await run('git', ['-C', fixture, 'add', 'src/auth.js']);
  await run('git', ['-C', fixture, '-c', 'user.name=AgentShield Package Smoke', '-c',
    'user.email=agentshield-smoke@example.invalid', 'commit', '-qm', 'synthetic blocker remediation']);
  const cleanStop = await runHook(codexStop, fixture, {
    cwd: fixture, thread_id: 'agentshield-smoke-thread', turn_id: 'agentshield-smoke-remediated',
    stop_hook_active: true,
  }, hookEnv);
  assert(cleanStop === null,
    'Installed Codex Stop hook continued the turn after the synthetic blocker was remediated.');

  // A bounded but nontrivial first scan keeps the single worker occupied so
  // the second job exercises real queued-job cancellation deterministically.
  for (let i = 0; i < 100; i++) {
    await writeFile(path.join(fixture, 'src', `queue-fixture-${i}.js`),
      `export const fixture${i} = "${'x'.repeat(32_000)}";\n`);
  }
  await run('git', ['-C', fixture, 'add', 'src/queue-fixture-*.js']);
  await run('git', ['-C', fixture, '-c', 'user.name=AgentShield Package Smoke', '-c',
    'user.email=agentshield-smoke@example.invalid', 'commit', '-qm', 'synthetic queue saturation fixture']);
  await mkdir(path.join(cancelFixture, 'src'), { recursive: true });
  await writeFile(path.join(cancelFixture, 'src', 'cancel.js'), 'export const queuedCancellation = true;\n');
  await run('git', ['init', '-q', cancelFixture]);
  await run('git', ['-C', cancelFixture, 'config', 'user.name', 'AgentShield Package Smoke']);
  await run('git', ['-C', cancelFixture, 'config', 'user.email', 'agentshield-smoke@example.invalid']);
  await run('git', ['-C', cancelFixture, 'add', '.']);
  await run('git', ['-C', cancelFixture, 'commit', '-qm', 'synthetic queued cancellation fixture']);

  const mcpEnv = {
    ...process.env,
    VIBESANE_ALLOWED_ROOTS_JSON: JSON.stringify([temp]),
    VIBESANE_JOB_STORE_DIR: path.join(temp, 'mcp-state'),
    VIBESANE_JOB_CONCURRENCY: '1',
  };
  const mcpResult = await withPackagedMcp(mcp, mcpEnv, async (client) => {
    const tools = await client.listTools();
    const status = await client.callTool({ name: 'status', arguments: {} });
    const scan = await client.callTool({ name: 'scan_changed', arguments: { workspace: fixture } });
    const listed = await client.callTool({ name: 'list_findings', arguments: { workspace: fixture, scan_id: 'a'.repeat(16) } });
    const verified = await client.callTool({ name: 'verify_remediation', arguments: { workspace: fixture, baseline_id: 'b'.repeat(16) } });
    const explained = await client.callTool({ name: 'explain_finding', arguments: { rule_id: 'hardcoded_secret' } });
    const denied = await client.callTool({ name: 'scan_changed', arguments: { workspace: path.join(os.tmpdir(), 'agentshield-unauthorized-synthetic-repo') } });
    let invalidArgumentsRejected = false;
    try { invalidArgumentsRejected = (await client.callTool({ name: 'status', arguments: { unexpected: true } })).isError === true; }
    catch { invalidArgumentsRejected = true; }
    return { tools: tools.tools, status, scan, listed, verified, explained, denied, invalidArgumentsRejected,
      protocol: client.getNegotiatedProtocolVersion?.() };
  });
  const cancelledScan = await withPackagedMcp(mcp, mcpEnv, async (client) => {
    const start = await client.callTool({ name: 'scan_start', arguments: { workspace: fixture, scope: 'full' } });
    const running = JSON.parse(start.content[0].text);
    const status = JSON.parse((await client.callTool({ name: 'scan_status', arguments: { job_id: running.job_id } })).content[0].text);
    assert(status.status === 'running', 'Queue saturation fixture did not occupy the worker.');
    const startQueued = await client.callTool({ name: 'scan_start', arguments: { workspace: cancelFixture, scope: 'full' } });
    const queued = JSON.parse(startQueued.content[0].text);
    assert(queued.status === 'queued', 'Second scan was not bounded behind the active worker.');
    const cancelled = await client.callTool({ name: 'scan_cancel', arguments: { job_id: queued.job_id } });
    return { job: queued, cancelled: JSON.parse(cancelled.content[0].text) };
  });
  const codexUninstall = await runCli(['uninstall-codex', '--cwd', fixture], { cwd: temp });
  const codexUninstallResult = JSON.parse(codexUninstall.stdout);
  assert(codexUninstallResult.hookRemoved === true && codexUninstallResult.skillRemoved === true,
    'Installed package could not safely remove its Codex hook and matching skill.');
  assert(mcpResult.protocol === '2026-07-28', 'MCP client did not negotiate the modern protocol.');
  const tools = mcpResult.tools;
  assert(Array.isArray(tools) && tools.some(tool => tool.name === 'scan_changed')
    && tools.some(tool => tool.name === 'verify_remediation'), 'Packaged MCP tool discovery is incomplete.');
  assert(mcpResult.status.content?.length > 0 && !mcpResult.status.isError,
    'Packaged MCP status call failed.');
  assert(mcpResult.scan.content?.some(x => x.text.includes('no_changed_files')),
    'Packaged MCP scan call did not return its explicit no-change status.');
  assert(mcpResult.listed.content?.some(x => x.text.includes('baseline_not_found'))
    && mcpResult.verified.content?.some(x => x.text.includes('no_baseline')),
    'Packaged MCP baseline tools did not return workspace-scoped results.');
  assert(mcpResult.explained.isError === false && mcpResult.denied.isError === true
    && mcpResult.denied.content?.some(x => x.text.includes('not authorized')),
    'Packaged MCP finding explanation or denied outside-root scan failed: '
      + JSON.stringify({ explain: mcpResult.explained, boundary: mcpResult.denied }));
  assert(mcpResult.invalidArgumentsRejected, 'Installed MCP did not reject unexpected tool arguments.');
  assert(cancelledScan.cancelled.status === 'cancelled', 'Installed MCP could not cancel a queued scan job.');

  process.stdout.write(JSON.stringify({
    status: 'package_smoke_passed',
    version: packaged.version,
    packageSha256: packaged.sha256,
    packageBytes: packaged.archiveBytes,
    packagedFiles: packaged.fileCount,
    checks: ['build', 'npm-pack-manifest', 'isolated-offline-install', 'cli-help', 'doctor',
      'one-command-agent-connect', 'mcp-doctor-valid-config', 'mcp-doctor-malformed-config-denial', 'codex-init-hook', 'synthetic-committed-scan', 'codex-stop-block', 'codex-stop-remediation', 'mcp-modern-protocol', 'mcp-tools-list', 'mcp-status', 'mcp-scan', 'mcp-baseline-tools', 'mcp-explain-finding', 'mcp-workspace-boundary', 'mcp-queue-saturation', 'mcp-queued-cancellation', 'mcp-invalid-tool-arguments', 'codex-uninstall'],
    fixture: 'synthetic-disposable-git-repository',
    published: false,
  }) + '\n');
} catch (error) {
  process.stderr.write('AgentShield package smoke failed: ' + String(error?.message || error) + '\n');
  process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true }).catch(() => {});
  await rm(stage, { recursive: true, force: true }).catch(() => {});
  if (archive) await rm(archive, { force: true }).catch(() => {});
}
