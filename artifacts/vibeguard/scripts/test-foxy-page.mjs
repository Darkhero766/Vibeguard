import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'dist', 'public', 'foxy', 'index.html'), 'utf8');
const agentShieldHtml = await readFile(path.join(root, 'dist', 'public', 'agentshield', 'index.html'), 'utf8');
const scannerCatalog = await readFile(path.resolve(root, '../api-server/src/lib/securityCheckCatalog.ts'), 'utf8');
const mainPageSource = await readFile(path.join(root, 'src', 'AppOriginal.tsx'), 'utf8');
const dashboardSource = await readFile(path.join(root, 'src', 'components', 'SecurityDashboard.tsx'), 'utf8');
const themeSource = await readFile(path.join(root, 'src', 'index.css'), 'utf8');
const catalogRuleCount = (scannerCatalog.match(/^\\s*\\{ id:/gm) || []).length;
assert.equal(catalogRuleCount, 54, 'Catalog rule count changed; update the customer-facing count intentionally.');
assert.ok(mainPageSource.includes("label: '54 security checks'"), 'Main homepage must show the catalog-backed security rule count.');
assert.ok(mainPageSource.includes('54 checks. The signals that actually matter.'), 'Homepage checks section must match the catalog count.');
assert.ok(mainPageSource.includes('Fifty-four focused rules'), 'Homepage description must match the catalog count.');
assert.ok(dashboardSource.includes('54 checks, one clear signal.'), 'Signed-in dashboard must match the catalog count.');
assert.ok(themeSource.includes('54 CHECKS. ONE SECURITY PERIMETER.') && themeSource.includes('SCAN // 54') && themeSource.includes('54 RULES ACTIVE'), 'Animated security console labels must match the catalog count.');
assert.ok(!/51 checks|50 CHECKS|SCAN \\/\\/ 50|50 RULES ACTIVE/.test(mainPageSource + dashboardSource + themeSource), 'Legacy scanner count remains in the UI.');

for (const token of [
  '<title>Foxy — Local-First MCP Security for AI Coding Agents | VibeSane</title>',
  'Security context for your AI agent.', 'Not extra authority.',
  'Claude Code', 'Codex CLI', 'Cursor', 'Gemini CLI', 'Roo Code', 'GitHub Copilot',
  'vibesane connect --agent auto', 'vibesane disconnect --agent all',
  'Read-only MCP tools', 'canonical Git root',
  '429 / 429', '12 / 12', 'Regression suite', 'Connector regressions', 'Windows + macOS',
  'Live authenticated acceptance', 'independent review',
  'https://github.com/Darkhero766/Vibeguard/actions/workflows/agentshield-cross-platform.yml?query=branch%3Afeat%2Fagentshield-cross-platform-autoconnect',
  'https://github.com/Darkhero766/Vibeguard/pull/70', 'chat.mcp.workspaceRootConfig.enabled', '.mcp.json',
]) assert.ok(html.includes(token), 'Foxy SEO route is missing: ' + token);

assert.match(html, /<main id="main-content"/);
assert.match(html, /id="connect"/);
assert.match(html, /id="security-model"/);
assert.match(html, /id="qualification"/);
assert.match(html, /application\/ld\+json/);
assert.match(html, /<link rel="canonical" href="https:\/\/vibesane\.app\/foxy"/);
assert.match(html, /max-w-\[1180px\]/);
assert.match(html, /font-sans/);
assert.ok(html.includes('Node.js 24.15+'), 'Static Foxy page must state the supported Node.js runtime.');
assert.ok(html.includes('HISTORICAL / BETA.4'), 'Prior beta.4 metrics must be labeled historical.');
assert.ok(html.includes('beta.5 exact-source CI pending'), 'The beta.5 qualification gate must remain visible.');
assert.ok(html.includes('#0b1112') && html.includes('#c7f36a'), 'Static page must match the graphite/lime visual system.');
assert.ok(!html.includes('Node.js 20+'), 'Static page must not advertise the obsolete runtime floor.');
assert.ok(!html.includes('The current candidate passed automated release qualification'), 'Historical beta.4 CI must not be attributed to beta.5.');
assert.ok(agentShieldHtml.includes('Node.js 24.15.0 or newer'), 'AgentShield SEO route must state the package runtime floor.');
assert.ok(agentShieldHtml.includes('automated release matrix covers Windows and macOS'), 'AgentShield SEO route must distinguish automated matrix coverage from other runtime targets.');
assert.ok(!agentShieldHtml.includes('Node.js 20+'), 'AgentShield SEO route must not advertise the obsolete runtime floor.');
assert.ok(!agentShieldHtml.includes('macOS or Linux'), 'AgentShield SEO route must not advertise the obsolete platform matrix.');
assert.ok(agentShieldHtml.includes('live authenticated Claude Code validation'), 'AgentShield SEO route must retain the live-host release gate.');
console.log('Foxy page route, responsive theme, qualification evidence, semantics and metadata passed.');
