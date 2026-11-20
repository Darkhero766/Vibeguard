import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const express = nodeRequire('express');
const TEST_REPO = 'https://github.com/OWASP/NodeGoat';

test('early extended GitHub failure cannot crash scan service or consume quota', async () => {
  const previous = globalThis.__SCAN_FAILURE_FIXTURE__;
  const nativeFetch = globalThis.fetch;
  let server;
  let used = 0;
  let mode = 'early-extended-failure';
  const report = {
    repo: 'OWASP/NodeGoat', repoUrl: TEST_REPO,
    filesScanned: 2, scannedAt: '2026-11-20T17:45:00.000Z', findings: [],
  };
  const fixture = {
    async core() {
      // Longer than the extended rejection: reproduces the production crash.
      await new Promise((resolve) => setTimeout(resolve, 75));
      if (mode === 'core-fail') throw Object.assign(Error('GitHub API rate limited'), { status: 403 });
      return report;
    },
    async clone() {
      await new Promise((resolve) => setTimeout(resolve, 90));
      return report;
    },
    async extended() {
      if (mode === 'early-extended-failure' || mode === 'both-fail') {
        throw Object.assign(Error('GitHub API rate limit exceeded'), { status: 403 });
      }
      return [];
    },
    async consume() { used++; },
    async plan() {
      return { unlimited: false, publicScansUsed: 0, publicScansLimit: 1 };
    },
  };
  globalThis.__SCAN_FAILURE_FIXTURE__ = fixture;
  const imports = {
    '@workspace/api-zod': [
      'export const CreateScanBody={safeParse:v=>({success:!!v?.repoUrl,data:{repoUrl:v?.repoUrl}})};',
      'export const CreateScanResponse={parse:v=>v};',
    ].join(''),
    '../lib/scanner': 'export const scanPublicRepository=(...a)=>globalThis.__SCAN_FAILURE_FIXTURE__.clone(...a);',
    '../lib/apiScanner': 'export const scanRepositoryViaApi=(...a)=>globalThis.__SCAN_FAILURE_FIXTURE__.core(...a);',
    '../lib/extendedScannerV2': 'export const runExtendedSecurityChecksV2=(...a)=>globalThis.__SCAN_FAILURE_FIXTURE__.extended(...a);',
    '../lib/securityCheckCatalog': 'export const TOTAL_SECURITY_CHECKS=51;',
    '../middlewares/auth': [
      'export const requireAuth=(req,res,next)=>{req.userId="test-user";req.userJwt="test-jwt";next();};',
      'export const optionalAuth=requireAuth;',
    ].join(''),
    '../lib/github': 'export const getGithubTokenForUser=async()=>null;',
    '../lib/scanCache': 'export const cacheScanResult=()=>{};',
    '../lib/plan': [
      'export const ensurePlanForUser=(...a)=>globalThis.__SCAN_FAILURE_FIXTURE__.plan(...a);',
      'export const consumePublicScan=(...a)=>globalThis.__SCAN_FAILURE_FIXTURE__.consume(...a);',
    ].join(''),
    '../middlewares/rateLimit': 'export const rateLimit=()=> (_req,_res,next)=>next();',
  };
  try {
    const bundled = await build({
      entryPoints: [path.join(dir, '../src/routes/scans.ts')],
      bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node20',
      packages: 'external', logLevel: 'silent',
      plugins: [{ name: 'isolated-scan-crash-fixture', setup(b) {
        b.onResolve({ filter: /.*/ }, (arg) => {
          if (Object.hasOwn(imports, arg.path)) return { path: arg.path, namespace: 'scan-fixture' };
        });
        b.onLoad({ filter: /.*/, namespace: 'scan-fixture' }, (arg) => ({
          loader: 'js', contents: imports[arg.path],
        }));
      }}],
    });
    const filename = path.join(dir, '../src/routes/__scan_error_test__.cjs');
    const m = new Module(filename);
    m.filename = filename;
    m.paths = Module._nodeModulePaths(path.dirname(filename));
    m._compile(bundled.outputFiles[0].text, filename);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.log = { warn() {}, error() {} };
      next();
    });
    app.use('/api', m.exports.default);
    app.get('/still-alive', (_req, res) => res.json({ alive: true }));
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    const scan = async () => {
      const response = await nativeFetch(base + '/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
        body: JSON.stringify({ repoUrl: TEST_REPO }),
      });
      return { status: response.status, body: await response.json() };
    };

    let response = await scan();
    assert.equal(response.status, 503, 'extended error must be a controlled error response');
    assert.match(response.body.error, /Full security scan could not finish/i);
    assert.equal(used, 0, 'no scan credit consumed for an incomplete result');
    assert.equal((await nativeFetch(base + '/still-alive')).status, 200, 'API must remain running');

    mode = 'both-fail';
    fixture.core = async () => {
      await new Promise((resolve) => setTimeout(resolve, 75));
      throw Object.assign(Error('GitHub API rate limit exceeded'), { status: 403 });
    };
    response = await scan();
    assert.equal(response.status, 503, 'core fallback may succeed but incomplete result is rejected');
    assert.equal(used, 0);
    assert.equal((await nativeFetch(base + '/still-alive')).status, 200);

    mode = 'complete';
    response = await scan();
    assert.equal(response.status, 200);
    assert.equal(response.body.checksRun, 51, 'full successful scan reports actual catalog coverage');
    assert.equal(used, 1, 'only a complete scan consumes a credit');
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete globalThis.__SCAN_FAILURE_FIXTURE__;
    else globalThis.__SCAN_FAILURE_FIXTURE__ = previous;
  }
});

test('extended scanner fetches repository files exactly once', async () => {
  const prev = globalThis.__SCAN_FILE_READ_TEST__;
  const fixture = {
    calls: 0,
    async read() {
      this.calls++;
      return { files: [{ path: 'app.js', content: 'const safe = 1;' }] };
    },
  };
  globalThis.__SCAN_FILE_READ_TEST__ = fixture;
  try {
    const bundled = await build({
      entryPoints: [path.join(dir, '../src/lib/extendedScannerV2.ts')],
      bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node20',
      packages: 'external', logLevel: 'silent',
      plugins: [{ name: 'bounded-repo-download-fixtures', setup(b) {
        b.onResolve({ filter: /^\.\.\/lib\/extendedScanner$|^\.\/extendedScanner$/ }, () =>
          ({ path: 'extendedScanner', namespace: 'scan-file-fixture' }));
        b.onResolve({ filter: /^\.\/githubRepoReader$/ }, () =>
          ({ path: 'reader', namespace: 'scan-file-fixture' }));
        b.onResolve({ filter: /^\.\/securityCheckCatalog$/ }, () =>
          ({ path: 'catalog', namespace: 'scan-file-fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'scan-file-fixture' }, (arg) => ({
          loader: 'js',
          contents: arg.path === 'reader'
            ? 'export const readRepositoryFiles=(...args)=>globalThis.__SCAN_FILE_READ_TEST__.read(...args);'
            : arg.path === 'catalog'
              ? 'export const SECURITY_CHECK_CATALOG=[];'
              : 'export const scanExtendedFiles=()=>[];',
        }));
      }}],
    });
    const filename = path.join(dir, '../src/lib/__extended_once_test__.cjs');
    const m = new Module(filename);
    m.filename = filename;
    m.paths = Module._nodeModulePaths(path.dirname(filename));
    m._compile(bundled.outputFiles[0].text, filename);
    const findings = await m.exports.runExtendedSecurityChecksV2(TEST_REPO);
    assert.deepEqual(findings, []);
    assert.equal(fixture.calls, 1, 'no redundant GitHub API tree and blob requests');
  } finally {
    if (prev === undefined) delete globalThis.__SCAN_FILE_READ_TEST__;
    else globalThis.__SCAN_FILE_READ_TEST__ = prev;
  }
});
