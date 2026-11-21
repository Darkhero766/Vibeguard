import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire, Module } from 'node:module';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const express = require('express');

test('public scanner allowance is authenticated, server-derived and fail-closed', async () => {
  const previous = globalThis.__PUBLIC_ALLOWANCE_HTTP_FIXTURE__;
  const nativeFetch = globalThis.fetch;
  let server;
  let queries = 0;
  const fixture = {
    snapshot: { plan: 'free', publicScansUsed: 0, publicScansLimit: 1, unlimited: false },
    fail: false,
    async getPlan(userId) {
      queries++;
      assert.equal(userId, 'fixture-user');
      if (this.fail) throw Error('Synthetic database outage');
      return this.snapshot;
    },
  };
  globalThis.__PUBLIC_ALLOWANCE_HTTP_FIXTURE__ = fixture;
  try {
    const imports = {
      '@workspace/api-zod': 'export const CreateScanBody={safeParse:()=>({success:false})};export const CreateScanResponse={parse:x=>x};',
      '../lib/scanner': 'export const scanPublicRepository=async()=>({});',
      '../lib/apiScanner': 'export const scanRepositoryViaApi=async()=>({});',
      '../lib/extendedScannerV2': 'export const runExtendedSecurityChecksV2WithStats=async()=>({findings:[],filesScanned:0});',
      '../lib/securityCheckCatalog': 'export const TOTAL_SECURITY_CHECKS=51;',
      '../middlewares/auth': [
        "export const requireAuth=(req,res,next)=>{",
        "if(req.header('authorization')!=='Bearer good-session')return res.status(401).json({error:'Authentication required'});",
        "req.userId='fixture-user';next();};",
        'export const optionalAuth=requireAuth;',
      ].join(''),
      '../lib/github': 'export const getGithubTokenForUser=async()=>null;',
      '../lib/scanCache': 'export const cacheScanResult=()=>{};',
      '../lib/plan': [
        'export const ensurePlanForUser=(user)=>globalThis.__PUBLIC_ALLOWANCE_HTTP_FIXTURE__.getPlan(user);',
        'export const consumePublicScan=async()=>{};',
      ].join(''),
      '../middlewares/rateLimit': 'export const rateLimit=()=> (_req,_res,next)=>next();',
    };
    const bundle = await build({
      entryPoints: [path.join(dir, '../src/routes/scans.ts')],
      bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node20',
      packages: 'external', logLevel: 'silent',
      plugins: [{ name: 'isolated-public-allowance-fixtures', setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => {
          if (Object.prototype.hasOwnProperty.call(imports, args.path)) {
            return { path: args.path, namespace: 'isolated-fixture' };
          }
        });
        b.onLoad({ filter: /.*/, namespace: 'isolated-fixture' }, (args) => ({
          loader: 'js', contents: imports[args.path],
        }));
      }}],
    });
    const filename = path.join(dir, '../src/routes/__public_allowance_test__.cjs');
    const module = new Module(filename);
    module.filename = filename;
    module.paths = Module._nodeModulePaths(path.dirname(filename));
    module._compile(bundle.outputFiles[0].text, filename);

    const app = express();
    app.use((req, _res, next) => {
      req.log = { error() {}, warn() {} };
      next();
    });
    app.use('/api', module.exports.default);
    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/api/scans/allowance';
    const get = async (session) => {
      const response = await nativeFetch(endpoint, {
        headers: session ? { Authorization: 'Bearer ' + session } : {},
      });
      return { status: response.status, headers: response.headers, body: await response.json() };
    };

    assert.equal((await get()).status, 401);
    assert.equal((await get('wrong-session')).status, 401);
    assert.equal(queries, 0, 'Unauthenticated calls must never run a quota query');

    const free = await get('good-session');
    assert.equal(free.status, 200);
    assert.equal(free.headers.get('cache-control'), 'no-store');
    assert.deepEqual(free.body, {
      plan: 'free', publicScansUsed: 0, publicScansLimit: 1, unlimited: false,
    });

    fixture.snapshot = {
      plan: 'pro', publicScansUsed: 5, publicScansLimit: 5, unlimited: false,
    };
    assert.deepEqual((await get('good-session')).body, fixture.snapshot);

    fixture.snapshot = {
      plan: 'pro', publicScansUsed: 12, publicScansLimit: 2147483647,
      unlimited: true,
    };
    assert.deepEqual((await get('good-session')).body, fixture.snapshot,
      'Authorized tester allowance must not be inferred from a browser plan field');

    fixture.fail = true;
    const failed = await get('good-session');
    assert.equal(failed.status, 503, 'Quota database errors must not grant a scan');
    assert.equal(failed.headers.get('cache-control'), 'no-store');
    assert.equal(Object.keys(failed.body).length, 1);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete globalThis.__PUBLIC_ALLOWANCE_HTTP_FIXTURE__;
    else globalThis.__PUBLIC_ALLOWANCE_HTTP_FIXTURE__ = previous;
  }
});
