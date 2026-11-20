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
