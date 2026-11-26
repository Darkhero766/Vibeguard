/**
 * Staging-only static-build finalization.
 * Keeps our publicly addressable, isolated test frontend out of search indexes
 * and creates HTML entry points for important direct-link routes. Render should
 * still have the standard SPA rewrite (/* -> /index.html) configured for all
 * remaining client-side routes.
 */
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.VITE_DEPLOYMENT_ENV !== 'staging') {
  throw new Error('Refusing to run staging finalizer outside staging builds');
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'public');
const index = join(out, 'index.html');

async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const location = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(location));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(location);
  }
  return files;
}

function noIndex(html) {
  return html
    .replace(/<meta\s+name=["']robots["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']sitemap["'][^>]*>/gi, '')
    .replace('</head>', '  <meta name="robots" content="noindex, nofollow, noarchive" />\n</head>');
}

for (const file of await htmlFiles(out)) {
  await writeFile(file, noIndex(await readFile(file, 'utf8')), 'utf8');
}

const appShell = await readFile(index, 'utf8');
// Fallback for /auth and /scan-public on hosts without SPA rewrite rules.
// Normalize trailing slashes before the app reads window.location.pathname.
const routeShell = appShell.replace(
  '</head>',
  '<script>if(location.pathname.length>1 && location.pathname.endsWith("/")) history.replaceState(null,"",location.pathname.slice(0,-1)+location.search+location.hash)</script>\n</head>',
);
for (const route of [
  'auth', 'scan-public', 'dashboard', 'pricing', 'checkout',
  'settings', 'audit', 'audit/report', 'admin', 'refer',
  'terms', 'privacy', 'contact', 'security-disclosure',
  'agentshield', 'accessibility',
]) {
  const target = join(out, route, 'index.html');
  // Preserve prerendered route-specific SEO metadata and crawlable public
  // content. Fallback shells are only for routes without an HTML entry point.
  try {
    await access(target);
    continue;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, routeShell, 'utf8');
}

await writeFile(join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
console.log('Staging build: noindex metadata, robots denial, and direct-link route entry points ready');
