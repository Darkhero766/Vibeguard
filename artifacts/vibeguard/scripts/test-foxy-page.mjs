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
const uiSource = mainPageSource + dashboardSource + themeSource;
const legacyCountLabels = ['51 checks', '51 security checks', '50 CHECKS', 'SCAN // 50', '50 RULES ACTIVE'];
assert.ok(!legacyCountLabels.some((label) => uiSource.includes(label)), 'Legacy scanner count remains in the UI.');

for (const token of [
  '<title>Foxy — Local-First MCP Security for AI Coding Agents | VibeSane</title>',
  'Security context for your AI agent.', 'Not extra authority.',
  'Claude Code', 'Codex CLI', 'Cursor', 'Gemini CLI', 'Roo Code', 'GitHub Copilot',
  'foxy install --agent auto', 'foxy doctor', 'npx -y @vibesane/foxy@beta install',
  'Read-only MCP tools', 'canonical Git root',
  '472 / 472', 'Regression suite', 'Windows + macOS + Ubuntu/Linux', '10 tools', '30 files',
  'Live authenticated acceptance', 'independent review',
  'https://github.com/Darkhero766/Vibeguard/actions/workflows/agentshield-cross-platform.yml?query=branch%3Afeat%2Fagentshield-cross-platform-autoconnect',
  'https://github.com/Darkhero766/Vibeguard/pull/70', 'https://github.com/Darkhero766/Vibeguard/actions/runs/46137576745', 'f60677328e0c5eb2de94ec4ae44598e973c198e62f15ad4156b061bd6ed42c14', 'Install MCP', 'Available after beta publication', 'not published yet', 'chat.mcp.workspaceRootConfig.enabled', '.mcp.json',
]) assert.ok(html.includes(token), 'Foxy SEO route is missing: ' + token);

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
assert.ok(html.includes('npx -y @vibesane/foxy@beta install'), 'The future beta one-command installer must be shown.');
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
