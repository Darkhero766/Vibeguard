import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir=path.dirname(fileURLToPath(import.meta.url));
test('staging Dodo routes fail closed unless explicitly configured for test mode',async()=>{
  const code=await build({
    entryPoints:[path.join(dir,'../src/lib/dodoEnvironment.ts')],
    write:false,bundle:true,format:'esm',platform:'node',target:'node20',
    logLevel:'silent',
  });
  const b64=Buffer.from(code.outputFiles[0].contents).toString('base64');
  const {dodoBaseUrl,assertDodoEnvironmentSafe}=
    await import('data:text/javascript;base64,'+b64);
  const priorDeploy=process.env.VIBESANE_DEPLOYMENT_ENV;
  const priorMode=process.env.DODO_PAYMENTS_ENVIRONMENT;
  try {
    process.env.VIBESANE_DEPLOYMENT_ENV='staging';
    delete process.env.DODO_PAYMENTS_ENVIRONMENT;
    assert.throws(()=>assertDodoEnvironmentSafe(),/test_mode/);
    assert.throws(()=>dodoBaseUrl(),/test_mode/);
    process.env.DODO_PAYMENTS_ENVIRONMENT='live_mode';
    assert.throws(()=>dodoBaseUrl(),/test_mode/);
    process.env.DODO_PAYMENTS_ENVIRONMENT='test_mode';
    assert.doesNotThrow(()=>assertDodoEnvironmentSafe());
    assert.equal(dodoBaseUrl(),'https://test.dodopayments.com');
    delete process.env.VIBESANE_DEPLOYMENT_ENV;
    assert.equal(dodoBaseUrl(),'https://test.dodopayments.com');
    delete process.env.DODO_PAYMENTS_ENVIRONMENT;
    assert.equal(dodoBaseUrl(),'https://live.dodopayments.com',
      'Existing production default behavior must be preserved');
  }finally{
    if(priorDeploy===undefined)delete process.env.VIBESANE_DEPLOYMENT_ENV;
    else process.env.VIBESANE_DEPLOYMENT_ENV=priorDeploy;
    if(priorMode===undefined)delete process.env.DODO_PAYMENTS_ENVIRONMENT;
    else process.env.DODO_PAYMENTS_ENVIRONMENT=priorMode;
  }
});

test('checkout return origin is pinned to isolated staging, never production',async()=>{
  const built=await build({
    entryPoints:[path.join(dir,'../src/lib/dodoEnvironment.ts')],
    bundle:true,format:'esm',platform:'node',write:false,target:'node20',logLevel:'silent',
  });
  const mod=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].contents).toString('base64'));
  const stage='https://vibesane-phase12-staging-web.onrender.com';
  assert.equal(mod.dodoCheckoutReturnOrigin({VIBESANE_DEPLOYMENT_ENV:'staging'}),stage);
  assert.equal(mod.dodoCheckoutReturnOrigin({VIBESANE_DEPLOYMENT_ENV:'staging',VITE_APP_URL:stage+'/'}),stage);
  for(const value of ['https://vibesane.app','http://vibesane-phase12-staging-web.onrender.com','https://attacker.example','https://vibesane-phase12-staging-web.onrender.com.evil.test']) {
    assert.throws(()=>mod.dodoCheckoutReturnOrigin({VIBESANE_DEPLOYMENT_ENV:'staging',VITE_APP_URL:value}),/Unsafe staging checkout return origin/);
  }
  assert.equal(mod.dodoCheckoutReturnOrigin({VIBESANE_DEPLOYMENT_ENV:'production'}),'https://vibesane.app');
  assert.equal(mod.dodoCheckoutReturnOrigin({VIBESANE_DEPLOYMENT_ENV:'production',VITE_APP_URL:'https://vibesane.app'}),'https://vibesane.app');
});

test('subscription ownership rejects conflicting identity signals and missing identifiers',async()=>{
  const built=await build({
    entryPoints:[path.join(dir,'../src/lib/dodoEnvironment.ts')],
    bundle:true,format:'esm',platform:'node',write:false,target:'node20',logLevel:'silent',
  });
  const {dodoSubscriptionBelongsToAccount:owned}=await import('data:text/javascript;base64,'+
    Buffer.from(built.outputFiles[0].contents).toString('base64'));
  const base={userId:'account-1',accountEmail:'owner@example.invalid',metadataUserId:'account-1',customerEmail:'owner@example.invalid'};
  assert.equal(owned(base),true);
  assert.equal(owned({...base,metadataUserId:'account-2'}),false);
  assert.equal(owned({...base,customerEmail:'different@example.invalid'}),false);
  assert.equal(owned({...base,metadataUserId:null,customerEmail:''}),false);
  assert.equal(owned({...base,metadataUserId:null}),true);
  assert.equal(owned({...base,customerEmail:''}),true);
  assert.equal(owned({...base,customerEmail:' OWNER@EXAMPLE.INVALID '}),true);
});


test('malformed Dodo credentials are rejected without echoing secret material',async()=>{
  const built=await build({
    entryPoints:[path.join(dir,'../src/lib/dodoEnvironment.ts')],
    bundle:true,format:'esm',platform:'node',write:false,target:'node20',logLevel:'silent',
  });
  const {requireDodoApiKey}=await import('data:text/javascript;base64,'+
    Buffer.from(built.outputFiles[0].contents).toString('base64'));
  const marker='sample-confidential-key-material';
  for(const value of [
    '', '  ', marker+'\n', '\r'+marker, marker+'\r\n', marker+' \t', marker+'\u0000',
    marker.slice(0,5)+'\n'+marker.slice(5),
  ]) {
    assert.throws(()=>requireDodoApiKey({DODO_PAYMENTS_API_KEY:value}),
      error=>error instanceof Error &&
        !error.message.includes(marker) &&
        !error.message.includes('Bearer') &&
        /credential/.test(error.message));
  }
  assert.equal(requireDodoApiKey({DODO_PAYMENTS_API_KEY:'test_synthetic_key'}),'test_synthetic_key');
});

test('checkout and billing sync never send raw provider exceptions to clients or logs',async()=>{
  const {readFileSync}=await import('node:fs');
  const route=readFileSync(path.join(dir,'../src/routes/dodo.ts'),'utf8');
  assert.match(route,/const apiKey = requireDodoApiKey\(\)/);
  assert.doesNotMatch(route,/console\.error\("\[dodo\] checkout failed", error\)/);
  assert.doesNotMatch(route,/console\.error\("\[dodo\] return sync failed", error\)/);
  assert.doesNotMatch(route,/res\.status\(500\)\.json\(\{ error: error instanceof Error \? error\.message/);
  assert.match(route,/res\.status\(503\)\.json\(\{ error: "Checkout is temporarily unavailable/);
  assert.match(route,/res\.status\(503\)\.json\(\{ error: "Subscription status is temporarily unavailable/);
  assert.doesNotMatch(route,/throw new Error\(message\)/);
});

test('paid entitlements require a valid future provider expiration',async()=>{
  const built=await build({
    entryPoints:[path.join(dir,'../src/lib/dodoEnvironment.ts')],
    bundle:true,format:'esm',platform:'node',write:false,target:'node20',logLevel:'silent',
  });
  const {requireFutureProExpiry}=await import('data:text/javascript;base64,'+
    Buffer.from(built.outputFiles[0].contents).toString('base64'));
  const now=Date.parse('2026-11-21T12:00:00Z');
  assert.equal(requireFutureProExpiry('2026-12-21T12:00:00.000Z',now),'2026-12-21T12:00:00.000Z');
  assert.equal(requireFutureProExpiry('2026-12-21T17:30:00+05:30',now),'2026-12-21T12:00:00.000Z');
  for(const date of [null,undefined,'','never','2026-11-01T00:00:00Z',
    '2026-11-21T12:00:00Z','2026-12-21','2026-12-21T12:00:00',
    '2099-99-99T12:00:00Z',0,{}]) {
    assert.throws(()=>requireFutureProExpiry(date,now),/subscription expiry/);
  }
});

test('webhook errors are redacted and missing expiration is not non-expiring Pro',async()=>{
  const {readFileSync}=await import('node:fs');
  const src=readFileSync(path.join(dir,'../src/routes/dodo.ts'),'utf8');
  assert.match(src,/const verifiedExpiry = requireFutureProExpiry\(nextBilling\)/);
  assert.doesNotMatch(src,/console\.error\("\[dodo\] webhook processing failed", error\)/);
  assert.match(src,/console\.error\("\[dodo\] webhook processing failed \(redacted\)"\)/);
});
