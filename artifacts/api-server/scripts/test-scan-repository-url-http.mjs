import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../..');
const nodeRequire = createRequire(import.meta.url);
const express = nodeRequire('express');

test('Public scan canonicalizes pasted punctuation before either scan and never downgrades authenticated 404s', async () => {
  const previous = globalThis.__SCAN_URL_FIXTURE__;
  const nativeFetch = globalThis.fetch;
  let server;
  const fixture = {
    mode: 'success',
    core: [],
    extended: [],
    clone: [],
    creditsUsed: 0,
    async scanApi(url, token) {
      this.core.push({ url, token });
      if (this.mode === 'not-found') throw Object.assign(Error('GitHub 404 sensitive payload'), { status: 404 });
      if (this.mode === 'api-forbidden') throw Object.assign(Error('GitHub 403 sensitive upstream body'), { status: 403 });
      return {
        repo: 'OWASP/NodeGoat', repoUrl: url, filesScanned: 4,
        scannedAt: '2026-11-20T18:15:00.000Z', findings: [],
      };
    },
    async scanExtended(url, token) {
      this.extended.push({ url, token });
      return [];
    },
    async scanClone(url, token) {
      this.clone.push({ url, token });
      throw Object.assign(Error('Repository not found. private details'), { status: 404 });
    },
    async getToken() { return 'synthetic-github-token'; },
    async plan() { return { unlimited: true, publicScansUsed: 0, publicScansLimit: 100 }; },
    async consume() { this.creditsUsed++; },
  };
  globalThis.__SCAN_URL_FIXTURE__ = fixture;

  const imports = {
    '@workspace/api-zod': 'export const CreateScanBody={safeParse:v=>({success:typeof v?.repoUrl==="string",data:{repoUrl:v?.repoUrl}})};export const CreateScanResponse={parse:x=>x};',
    '../lib/scanner': 'export const scanPublicRepository=(...args)=>globalThis.__SCAN_URL_FIXTURE__.scanClone(...args);',
    '../lib/apiScanner': 'export const scanRepositoryViaApi=(...args)=>globalThis.__SCAN_URL_FIXTURE__.scanApi(...args);',
    '../lib/extendedScannerV2': 'export const runExtendedSecurityChecksV2=(...args)=>globalThis.__SCAN_URL_FIXTURE__.scanExtended(...args);',
    '../lib/securityCheckCatalog': 'export const TOTAL_SECURITY_CHECKS=51;',
    '../middlewares/auth': [
      'export const requireAuth=(req,res,next)=>{req.userId="test-user";req.userJwt="jwt";next();};',
      'export const optionalAuth=requireAuth;',
    ].join(''),
    '../lib/github': 'export const getGithubTokenForUser=(...args)=>globalThis.__SCAN_URL_FIXTURE__.getToken(...args);',
    '../lib/scanCache': 'export const cacheScanResult=()=>{};',
    '../lib/plan': [
      'export const ensurePlanForUser=(...args)=>globalThis.__SCAN_URL_FIXTURE__.plan(...args);',
      'export const consumePublicScan=(...args)=>globalThis.__SCAN_URL_FIXTURE__.consume(...args);',
    ].join(''),
    '../middlewares/rateLimit': 'export const rateLimit=()=> (_req,_res,next)=>next();',
  };
  try {
    const bundled = await build({
      entryPoints: [path.join(dir, '../src/routes/scans.ts')],
      bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node20',
      packages: 'external', logLevel: 'silent',
      plugins: [{ name: 'isolated-scan-url-fixtures', setup(b) {
        b.onResolve({ filter: /.*/ }, (arg) => {
          if (Object.hasOwn(imports, arg.path)) return { path: arg.path, namespace: 'scan-url-fixture' };
        });
        b.onLoad({ filter: /.*/, namespace: 'scan-url-fixture' }, (arg) => ({
          loader: 'js', contents: imports[arg.path],
        }));
      }}],
    });
    const filename = path.join(dir, '../src/routes/__scan_url_test__.cjs');
    const module = new Module(filename);
    module.filename = filename;
    module.paths = Module._nodeModulePaths(path.dirname(filename));
    module._compile(bundled.outputFiles[0].text, filename);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.log = { warn() {}, error() {} }; next(); });
    app.use('/api', module.exports.default);
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/scans';
    const post = async (url) => {
      const response = await nativeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
        body: JSON.stringify({ repoUrl: url }),
      });
      return { status: response.status, body: await response.json() };
    };

    let r = await post('https://github.com/OWASP/NodeGoat.');
    assert.equal(r.status, 200);
    assert.equal(r.body.repoUrl, 'https://github.com/OWASP/NodeGoat');
    assert.equal(r.body.checksRun, 51);
    assert.deepEqual(fixture.core, [{ url: 'https://github.com/OWASP/NodeGoat', token: 'synthetic-github-token' }]);
    assert.deepEqual(fixture.extended, fixture.core);
    assert.equal(fixture.creditsUsed, 1);
    assert.equal(fixture.clone.length, 0);

    r = await post('https://github.com/OWASP/NodeGoat./');
    assert.equal(r.status, 200);
    assert.equal(fixture.core.at(-1).url, 'https://github.com/OWASP/NodeGoat');

    const lastApiCalls = fixture.core.length;
    const lastExtendedCalls = fixture.extended.length;
    for (const invalid of [
      'https://github.com/OWASP/NodeGoat..',
      'https://github.com/OWASP/NodeGoat.../',
      'https://github.com/OWASP/NodeGoat#injected',
      'http://github.com/OWASP/NodeGoat.',
      'https://evil.example.com/OWASP/NodeGoat.',
    ]) {
      const rejection = await post(invalid);
      assert.equal(rejection.status, 400, invalid);
    }
    assert.equal(fixture.core.length, lastApiCalls, 'invalid URLs make no GitHub requests');
    assert.equal(fixture.extended.length, lastExtendedCalls, 'invalid URLs skip extended scan');
    const usedBeforeFailure = fixture.creditsUsed;

    fixture.mode = 'not-found';
    r = await post('https://github.com/OWASP/not-a-real-repository');
    assert.equal(r.status, 404);
    assert.match(r.body.error, /not found or inaccessible/i);
    assert.ok(!r.body.error.includes('sensitive payload'));
    assert.equal(fixture.clone.length, 0, 'GitHub 404 must not trigger a clone');
    assert.equal(fixture.core.at(-1).token, 'synthetic-github-token');
    assert.equal(fixture.creditsUsed, usedBeforeFailure);

    fixture.mode = 'api-forbidden';
    r = await post('https://github.com/OWASP/NodeGoat');
    assert.equal(r.status, 404, 'clone may return not found but must not retry anonymously');
    assert.equal(fixture.clone.at(-1).token, 'synthetic-github-token');
    assert.equal(fixture.core.at(-1).token, 'synthetic-github-token');
    assert.ok(!r.body.error.includes('private details'));
    assert.equal(fixture.creditsUsed, usedBeforeFailure);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete globalThis.__SCAN_URL_FIXTURE__;
    else globalThis.__SCAN_URL_FIXTURE__ = previous;
  }
});

test('public scanner normalizes the same trailing punctuation and preserves meaningful inner dots', async () => {
  const source = await readFile(path.join(root, 'artifacts/vibeguard/src/pages/PublicScanPage.tsx'), 'utf8');
  assert.match(source, /function normalizeGithubRepoInput/);
  assert.match(source, /githubUrlPattern\.test\(normalizeGithubRepoInput\(repoUrl\)\)/);
  assert.match(source, /const normalizedUrl = normalizeGithubRepoInput\(repoOverride \?\? repoUrl\)/);
  assert.match(source, /const queryRepo = normalizeGithubRepoInput\(params\.get\('repo'\) \?\? ''\)/);
});
