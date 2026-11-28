import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'dist', 'public', 'foxy', 'index.html'), 'utf8');
const shellInstaller = await readFile(path.join(root, 'public', 'install.sh'), 'utf8');
const powershellInstaller = await readFile(path.join(root, 'public', 'install.ps1'), 'utf8');
assert.ok(shellInstaller.startsWith('#!/usr/bin/env bash') && shellInstaller.includes('set -Eeuo pipefail'));
assert.ok(shellInstaller.includes('https://registry.npmjs.org') && shellInstaller.includes('npm view "${PACKAGE}@${CHANNEL}"'));
assert.ok(shellInstaller.includes('npm install --global --ignore-scripts') && shellInstaller.includes('foxy_command" install --agent'));
assert.ok(shellInstaller.includes('Node.js 24.15.0 or newer') && !shellInstaller.includes('foxy install --agent "$agent" --yes'));
assert.ok(powershellInstaller.includes("https://registry.npmjs.org")
  && powershellInstaller.includes("$NpmPath view \"$PackageName@$Channel\"")
  && powershellInstaller.includes("Get-Command 'npm.cmd'"));
assert.ok(powershellInstaller.includes('--ignore-scripts') && powershellInstaller.includes('& $FoxyCommand install --agent $Agent'));
assert.ok(powershellInstaller.includes('Node.js 24.15.0 or newer') && !powershellInstaller.includes('--yes'));
if (process.platform === 'win32') {
  const escapedPath = path.join(root, 'public', 'install.ps1').replaceAll("'", "''");
  const parse = spawnSync('pwsh', ['-NoProfile', '-Command',
    "$tokens = $null; $errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('"
      + escapedPath + "', [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_.Message }; exit 1 }"],
  { encoding: 'utf8', windowsHide: true });
  assert.equal(parse.status, 0, 'PowerShell bootstrap has a syntax error: ' + (parse.stderr || parse.stdout));
} else {
  const parse = spawnSync('bash', ['-n', path.join(root, 'public', 'install.sh')],
    { encoding: 'utf8', windowsHide: true });
  assert.equal(parse.status, 0, 'POSIX bootstrap has a syntax error: ' + (parse.stderr || parse.stdout));
}


const agentShieldHtml = await readFile(path.join(root, 'dist', 'public', 'agentshield', 'index.html'), 'utf8');
const scannerCatalog = await readFile(path.resolve(root, '../api-server/src/lib/securityCheckCatalog.ts'), 'utf8');
const mainPageSource = await readFile(path.join(root, 'src', 'AppOriginal.tsx'), 'utf8');
const foxyPageSource = await readFile(path.join(root, 'src', 'pages', 'FoxyPage.tsx'), 'utf8');
const dashboardSource = await readFile(path.join(root, 'src', 'components', 'SecurityDashboard.tsx'), 'utf8');
const themeSource = await readFile(path.join(root, 'src', 'index.css'), 'utf8');
const accentTokenMatches = themeSource.match(/--accent: 81 83% 68%/g) || [];
assert.equal(accentTokenMatches.length, 2, 'Light and dark theme accent tokens must both use lime.');
assert.ok(mainPageSource.includes('bg-accent p-8 text-[#0b1112]'), 'Lime landing CTA must use a dark readable foreground.');
assert.ok(mainPageSource.includes('text-[#46544a]') && mainPageSource.includes('text-[#5a5144]'), 'Light clean/upgrade cards must use dark readable body text.');
assert.ok(dashboardSource.includes("isClear ? 'text-[#0b1112]' : 'text-foreground'"), 'Clean dashboard repository card must use a dark readable foreground.');
assert.ok(dashboardSource.includes("isClear ? 'text-[#59665d]' : 'text-muted-foreground'"), 'Clean dashboard labels must use a dark readable foreground.');
const catalogRuleCount = (scannerCatalog.match(/^\s*\{ id:/gm) || []).length;
assert.equal(catalogRuleCount, 54, 'Catalog rule count changed; update the customer-facing count intentionally.');
assert.ok(mainPageSource.includes("label: '54 security checks'"), 'Main homepage must show the catalog-backed security rule count.');
assert.ok(mainPageSource.includes('54 checks. The signals that actually matter.'), 'Homepage checks section must match the catalog count.');
assert.ok(mainPageSource.includes('Fifty-four focused rules'), 'Homepage description must match the catalog count.');
assert.ok(dashboardSource.includes('54 checks, one clear signal.'), 'Signed-in dashboard must match the catalog count.');
assert.ok(themeSource.includes('54 CHECKS. ONE SECURITY PERIMETER.') && themeSource.includes('SCAN // 54') && themeSource.includes('54 RULES ACTIVE'), 'Animated security console labels must match the catalog count.');
assert.ok(foxyPageSource.includes("VITE_FOXY_BETA_INSTALL_ENABLED === 'true'"), 'Live beta install must require explicit publication approval flag.');
assert.ok(foxyPageSource.includes('disabled={!FOXY_BETA_INSTALL_ENABLED}'), 'Install command copy control must be disabled while the package is unpublished.');
assert.ok(foxyPageSource.includes('if (!FOXY_BETA_INSTALL_ENABLED) return;'), 'Clipboard action must fail closed while the beta installation flag is disabled.');
assert.ok(foxyPageSource.includes("const FOXY_UNIX_INSTALL_COMMAND = 'curl -fsSL https://vibesane.app/install.sh | bash';"));
assert.ok(foxyPageSource.includes('https://vibesane.app/install.ps1 | iex'));
assert.ok(foxyPageSource.includes("useState<InstallPlatform>('unix')"));
assert.ok(foxyPageSource.includes('selectedPlatform === \'windows\''));
assert.ok(foxyPageSource.includes('foxy-install-platform'));
assert.ok(foxyPageSource.includes("useState<InstallAgent>('auto')"), 'Install flow must default to safe auto-detection.');
assert.ok(foxyPageSource.includes("' -s -- --agent ' + selectedAgent"), 'Explicit POSIX host selection must append supported installer arguments.');
assert.ok(foxyPageSource.includes('FOXY_WINDOWS_INSTALL_COMMAND(selectedAgent)'), 'PowerShell command must receive the same validated host choice.');
assert.ok(foxyPageSource.includes('navigator.clipboard.writeText(installCommand)'), 'The install action must copy the exact selected command.');
assert.ok(foxyPageSource.includes('id="foxy-install-agent"'), 'The host selector must have a stable accessible label target.');
assert.ok(foxyPageSource.includes('installAgentOptions.map'), 'The host selector must be rendered from the supported-host option registry.');

const uiSource = mainPageSource + dashboardSource + themeSource;
const legacyCountLabels = ['51 checks', '51 security checks', '50 CHECKS', 'SCAN // 50', '50 RULES ACTIVE'];
assert.ok(!legacyCountLabels.some((label) => uiSource.includes(label)), 'Legacy scanner count remains in the UI.');

for (const token of [
  '<title>Foxy — Local-First MCP Security for AI Coding Agents | VibeSane</title>',
  'Security context for your AI agent.', 'Not extra authority.',
  'Claude Code', 'Codex CLI', 'Cursor', 'Gemini CLI', 'Roo Code', 'GitHub Copilot',
  'foxy install --agent auto', 'foxy doctor', 'curl -fsSL https://vibesane.app/install.sh | bash', 'https://vibesane.app/install.ps1 | iex',
  'Repository files are never modified', 'Foxy maintains only its own local scan, baseline and queue state',
  'No shell, patch, commit, or deploy tools are exposed', 'canonical Git root',
  '472 / 472', 'Regression suite', 'Windows + macOS + Ubuntu/Linux', '10 tools', '30 files',
  'real-host acceptance', 'independent security review',
  'https://github.com/Darkhero766/Vibeguard/actions/runs/46140045503',
  'https://github.com/Darkhero766/Vibeguard/pull/70', 'https://github.com/Darkhero766/Vibeguard/actions/runs/46140045503', 'edf7851ec847dce63f24c66b59b396bae770d69e9e4e52843709df1778a816b8', 'Install MCP', 'Available after beta publication', 'not published yet', 'Auto-detection is recommended', 'Configure for', '--agent codex', 'chat.mcp.workspaceRootConfig.enabled', '.mcp.json',
]) assert.ok(html.includes(token), 'Foxy SEO route is missing: ' + token);

assert.ok(!/read-only MCP/i.test(html), 'Foxy page must distinguish repository read-only access from Foxy-managed local state.');
assert.match(html, /<main id="main-content"/);
assert.match(html, /id="install"/);
assert.match(html, /id="connect"/);
assert.match(html, /id="security-model"/);
assert.match(html, /id="qualification"/);
assert.match(html, /application\/ld\+json/);
assert.match(html, /<link rel="canonical" href="https:\/\/vibesane\.app\/foxy"/);
assert.match(html, /max-w-\[1180px\]/);
assert.match(html, /font-sans/);
assert.ok(html.includes('Node.js 24.15+'), 'Static Foxy page must state the supported Node.js runtime.');
assert.ok(html.includes('Beta.6 passed the three-platform automated matrix.'), 'Foxy page must advertise the current qualified candidate.');
assert.ok(!html.includes('beta.5 exact-source CI pending'), 'Stale beta.5 qualification copy must not remain on the public page.');
assert.ok(!html.includes('The current beta.5 candidate adds'), 'Stale beta.5 release copy must not remain on the public page.');
assert.ok(html.includes('curl -fsSL https://vibesane.app/install.sh | bash'), 'The future POSIX one-command bootstrap must be shown.');
assert.ok(html.includes('irm https://vibesane.app/install.ps1 | iex'), 'Windows PowerShell bootstrap must be shown.');
assert.ok(html.includes('Available after beta publication'), 'The install action must remain gated while the package is unpublished.');
assert.ok(html.includes('#0b1112') && html.includes('#c7f36a'), 'Static page must match the graphite/lime visual system.');
assert.ok(!html.includes('Node.js 20+'), 'Static page must not advertise the obsolete runtime floor.');
assert.ok(!html.includes('The current candidate passed automated release qualification'), 'Historical beta.4 CI must not be attributed to beta.5.');
assert.ok(agentShieldHtml.includes('Node.js 24.15.0 or newer'), 'AgentShield SEO route must state the package runtime floor.');
assert.ok(agentShieldHtml.includes('automated release matrix covers Windows, macOS and Ubuntu/Linux'), 'AgentShield SEO route must describe the current three-platform automated matrix.');
assert.ok(!agentShieldHtml.includes('Node.js 20+'), 'AgentShield SEO route must not advertise the obsolete runtime floor.');
assert.ok(!agentShieldHtml.includes('Windows/macOS qualification is pending'), 'AgentShield SEO route must not describe the qualification as pending.');
assert.ok(agentShieldHtml.includes('live authenticated Claude Code validation'), 'AgentShield SEO route must retain the live-host release gate.');
console.log('Foxy page route, responsive theme, qualification evidence, semantics and metadata passed.');
