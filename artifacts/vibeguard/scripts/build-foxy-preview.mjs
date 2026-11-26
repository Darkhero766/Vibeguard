#!/usr/bin/env node
// Creates a standalone, no-JavaScript Foxy staging microsite from the app's
// pre-rendered route. This is isolated to staging and never alters production.
import { copyFile, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.VITE_DEPLOYMENT_ENV !== 'staging') {
  throw new Error('Refusing to create the standalone Foxy page outside staging builds.');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'public');
const foxy = path.join(out, 'foxy', 'index.html');
const index = path.join(out, 'index.html');
const cssDir = path.join(out, 'assets');
const html = await readFile(foxy, 'utf8');
const cssAssets = await stat(cssDir).catch(() => null);
if (!cssAssets?.isDirectory()) throw new Error('Built VibeSane CSS assets are missing.');
let standalone = html
  .replace(/<script\b[^>]*type=["']module["'][^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<script\b[^>]*type=["']module["'][^>]*><\/script>/gi, '')
  .replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>/gi, '');
if (/<script\b[^>]*type=["']module["']/i.test(standalone)
  || /rel=["']modulepreload["']/i.test(standalone)) {
  throw new Error('Could not remove the app bootstrap from the standalone static Foxy preview.');
}
await writeFile(foxy, standalone, 'utf8');
await copyFile(foxy, index);
console.log(JSON.stringify({ status: 'foxy_staging_page_built', entrypoint: '/', sourceRoute: '/foxy',
  javascriptRequired: false, publishPath: 'artifacts/vibeguard/dist/public' }));
