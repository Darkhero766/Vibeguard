import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'public');
const html = await readFile(path.join(out, 'index.html'), 'utf8');
const route = await readFile(path.join(out, 'foxy', 'index.html'), 'utf8');

assert.equal(html, route, 'Preview root and /foxy entrypoint must be byte-identical.');
assert.ok(html.includes('Security context for your AI agent.') && html.includes('GitHub Copilot'));
assert.ok(html.includes('423 / 423') && html.includes('6 / 6'));
assert.match(html, /name="robots" content="noindex, nofollow, noarchive"/);
assert.ok(!/<script\b[^>]*type=["']module["']/i.test(html), 'Static Foxy preview must not bootstrap the VibeSane SPA.');
assert.ok(!/rel=["']modulepreload["']/i.test(html));
assert.match(html, /id="main-content"/);
assert.match(html, /id="qualification"/);
const css = [...html.matchAll(/href="([^"]+\.css)"/g)].map(match => match[1]);
assert.ok(css.length > 0, 'Foxy preview must retain its theme stylesheet.');
for (const href of css) await stat(path.join(out, href.replace(/^\//, '')));
assert.ok((await readFile(path.join(out, 'robots.txt'), 'utf8')).includes('Disallow: /'));
console.log('Standalone Foxy preview passed no-JS, noindex, theme, layout and evidence checks.');
