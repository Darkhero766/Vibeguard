import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const result = await build({
  entryPoints: [path.join(dir, '../src/lib/stagingAccess.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
  logLevel: 'silent', target: 'node20',
});
const moduleUrl = 'data:text/javascript;base64,' +
  Buffer.from(result.outputFiles[0].contents).toString('base64');
const { stagingAccess } = await import(moduleUrl);

const key = 'a'.repeat(64);
const allowlistedGitHubId = '176193211';
const allowlistedUserId = 'e673ed60-9831-4ea8-aafe-993b1cbdcd6c';

const run = async ({ path: route = '/api/scans', method = 'GET',
  access = '', authorization = '', user, responseOk = true,
  outage = false } = {}) => {
  const originalFetch = globalThis.fetch;
  let authChecks = 0;
  globalThis.fetch = async (url, init) => {
    authChecks++;
    assert.equal(String(url), 'https://isolated-test.supabase.co/auth/v1/user');
    assert.equal(init.headers.apikey, 'staging-publishable-test-key');
    assert.equal(init.headers.Authorization, 'Bearer ' + authorization);
    if (outage) throw new Error('Auth server unavailable');
    return { ok: responseOk, json: async () => user };
  };
  const req = {
    path: route, method,
    header(name) {
      if (name === 'x-vibesane-staging-access') return access;
      if (name === 'authorization') return authorization ? 'Bearer ' + authorization : '';
      return '';
    },
  };
  const res = {
    code: null, body: null,
    status(n) { this.code = n; return this; },
    json(x) { this.body = x; return this; },
  };
  let nextCalls = 0;
  try {
    await stagingAccess(req, res, () => { nextCalls++; });
    return { nextCalls, res, authChecks };
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('staging gate blocks anonymous visitors and preserves machine access and HMAC webhook flow', async () => {
  const keys = ['VIBESANE_DEPLOYMENT_ENV', 'VIBESANE_STAGING_ACCESS_KEY',
    'VIBESANE_STAGING_ALLOWED_GITHUB_IDS', 'VIBESANE_STAGING_ALLOWED_USER_IDS',
    'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    process.env.VIBESANE_DEPLOYMENT_ENV = 'staging';
    process.env.VIBESANE_STAGING_ACCESS_KEY = key;
    process.env.VIBESANE_STAGING_ALLOWED_GITHUB_IDS = allowlistedGitHubId;
    process.env.VIBESANE_STAGING_ALLOWED_USER_IDS = '';
    process.env.SUPABASE_URL = 'https://isolated-test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'staging-publishable-test-key';

    assert.equal((await run()).res.code, 403);
    assert.equal((await run({ access: 'b'.repeat(64) })).res.code, 403);
    assert.equal((await run({ access: 'a'.repeat(63) })).res.code, 403);
    assert.equal((await run({ access: key })).nextCalls, 1);
    assert.equal((await run({ path: '/', method: 'GET' })).nextCalls, 1);
    assert.equal((await run({ path: '/api/healthz' })).nextCalls, 1);
    assert.equal((await run({ path: '/api/readyz' })).nextCalls, 1);
    assert.equal((await run({ path: '/api/github/token', method: 'OPTIONS' })).nextCalls, 1);
    assert.equal((await run({ path: '/api/webhooks/dodo', method: 'POST' })).nextCalls, 1);
    assert.equal((await run({ path: '/api/github/webhook', method: 'POST' })).nextCalls, 1);
    assert.equal((await run({ path: '/api/github/webhook', method: 'GET' })).res.code, 403);

    process.env.VIBESANE_STAGING_ACCESS_KEY = '';
    assert.equal((await run({ access: key })).res.code, 403);
    process.env.VIBESANE_DEPLOYMENT_ENV = 'production';
    assert.equal((await run()).nextCalls, 1);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('staging browser sessions require server-verified GitHub identity on tester allowlist', async () => {
  const keys = ['VIBESANE_DEPLOYMENT_ENV', 'VIBESANE_STAGING_ACCESS_KEY',
    'VIBESANE_STAGING_ALLOWED_GITHUB_IDS', 'VIBESANE_STAGING_ALLOWED_USER_IDS',
    'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    process.env.VIBESANE_DEPLOYMENT_ENV = 'staging';
    process.env.VIBESANE_STAGING_ACCESS_KEY = key;
    process.env.VIBESANE_STAGING_ALLOWED_GITHUB_IDS = allowlistedGitHubId;
    process.env.SUPABASE_URL = 'https://isolated-test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'staging-publishable-test-key';

    const valid = {
      id: 'test-supabase-user',
      identities: [{ provider: 'github', provider_id: allowlistedGitHubId }],
    };
    assert.equal((await run({ authorization: 'valid.test.jwt', user: valid })).nextCalls, 1);
    // A precisely allowlisted Auth UID is enough when /auth/v1/user returns
    // no identities array. The Auth server, not the browser, supplies this UID.
    process.env.VIBESANE_STAGING_ALLOWED_USER_IDS = allowlistedUserId;
    const uidOnly = { id: allowlistedUserId };
    assert.equal((await run({ authorization: 'uuid-only.test.jwt', user: uidOnly })).nextCalls, 1);
    assert.equal((await run({
      authorization: 'different-user.test.jwt',
      user: { id: '00000000-0000-4000-8000-000000000000', user_metadata: { id: allowlistedUserId } },
    })).res.code, 403);
    assert.equal((await run({ authorization: 'expired-uuid.test.jwt', user: uidOnly, responseOk: false })).res.code, 403);
    assert.equal((await run({ authorization: 'outage-uuid.test.jwt', user: uidOnly, outage: true })).res.code, 403);
    process.env.VIBESANE_STAGING_ALLOWED_USER_IDS = '';


    // Supabase identities only: user-editable metadata is never accepted.
    assert.equal((await run({
      authorization: 'forged.test.jwt',
      user: {
        id: 'attacker',
        identities: [{ provider: 'github', provider_id: '999' }],
        user_metadata: { github_provider_id: allowlistedGitHubId },
      },
    })).res.code, 403);
    assert.equal((await run({
      authorization: 'email.test.jwt',
      user: { id: 'test', identities: [{ provider: 'email', provider_id: allowlistedGitHubId }] },
    })).res.code, 403);
    assert.equal((await run({ authorization: 'expired.test.jwt', responseOk: false })).res.code, 403);
    assert.equal((await run({ authorization: 'unavailable.test.jwt', outage: true })).res.code, 403);
    assert.equal((await run({ authorization: 'invalid.test.jwt', user: { identities: [] } })).res.code, 403);

    process.env.VIBESANE_STAGING_ALLOWED_GITHUB_IDS = '';
    assert.equal((await run({ authorization: 'valid.test.jwt', user: valid })).res.code, 403);
    process.env.VIBESANE_STAGING_ALLOWED_GITHUB_IDS = allowlistedGitHubId;
    delete process.env.SUPABASE_ANON_KEY;
    assert.equal((await run({ authorization: 'valid.test.jwt', user: valid })).res.code, 403);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('separate verified staging owner allowlist preserves strict identity and existing testers', async () => {
  const keys=['VIBESANE_DEPLOYMENT_ENV','VIBESANE_STAGING_ACCESS_KEY',
    'VIBESANE_STAGING_ALLOWED_GITHUB_IDS','VIBESANE_STAGING_ALLOWED_USER_IDS',
    'VIBESANE_STAGING_APPROVED_OWNER_GITHUB_ID','SUPABASE_URL','SUPABASE_ANON_KEY'];
  const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try {
    process.env.VIBESANE_DEPLOYMENT_ENV='staging';
    process.env.VIBESANE_STAGING_ACCESS_KEY='a'.repeat(64);
    process.env.VIBESANE_STAGING_ALLOWED_GITHUB_IDS='';
    process.env.VIBESANE_STAGING_ALLOWED_USER_IDS='';
    process.env.VIBESANE_STAGING_APPROVED_OWNER_GITHUB_ID=allowlistedGitHubId;
    process.env.SUPABASE_URL='https://isolated-test.supabase.co';
    process.env.SUPABASE_ANON_KEY='staging-publishable-test-key';
    const owner={id:'owner-uuid',identities:[{provider:'github',provider_id:allowlistedGitHubId}]};
    assert.equal((await run({authorization:'owner.jwt',user:owner})).nextCalls,1);
    assert.equal((await run({authorization:'stranger.jwt',
      user:{id:'other-uuid',identities:[{provider:'github',provider_id:'123456'}]}})).res.code,403);
    assert.equal((await run({authorization:'metadata-forgery.jwt',
      user:{id:'other-uuid',user_metadata:{provider_id:allowlistedGitHubId}}})).res.code,403);
    assert.equal((await run({authorization:'expired.jwt',user:owner,responseOk:false})).res.code,403);
    process.env.VIBESANE_STAGING_APPROVED_OWNER_GITHUB_ID='not-an-id';
    assert.equal((await run({authorization:'owner.jwt',user:owner})).res.code,403);
  } finally {
    for(const [key,value] of Object.entries(prior))
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});

test('staging app handles CORS before returning 403 so browsers see access errors',async()=>{
  const {readFileSync}=await import('node:fs');
  const appSource=readFileSync(path.join(dir,'../src/app.ts'),'utf8');
  assert.ok(appSource.indexOf('app.use(stagingAccess)')>appSource.indexOf('app.use(process.env.VIBESANE_DEPLOYMENT_ENV'),
    'CORS must run before protected-route gate');
  const {createRequire}=await import('node:module');
  const require=createRequire(import.meta.url);
  const express=require('express');
  const cors=require('cors');
  const app=express();
  app.use(cors({origin:'https://vibesane-phase12-staging-web.onrender.com'}));
  app.use((_req,res)=>res.status(403).json({error:'Staging access restricted'}));
  const server=await new Promise(resolve=>{
    const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  try {
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/checkout',{
      method:'POST',
      headers:{Origin:'https://vibesane-phase12-staging-web.onrender.com',
        'Content-Type':'application/json'},
      body:'{}',
    });
    assert.equal(response.status,403);
    assert.equal(response.headers.get('access-control-allow-origin'),
      'https://vibesane-phase12-staging-web.onrender.com');
    assert.equal((await response.json()).error,'Staging access restricted');
  }finally{await new Promise(resolve=>server.close(resolve));}
});
