import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const dir=path.dirname(fileURLToPath(import.meta.url));
test('public staging API fails closed unless it has correct access secret',async()=>{
 const output=await build({entryPoints:[path.join(dir,'../src/lib/stagingAccess.ts')],
  bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent',target:'node20'});
 const b64=Buffer.from(output.outputFiles[0].contents).toString('base64');
 const {stagingAccess}=await import('data:text/javascript;base64,'+b64);
 const deployment=process.env.VIBESANE_DEPLOYMENT_ENV;
 const secret=process.env.VIBESANE_STAGING_ACCESS_KEY;
 const key='a'.repeat(64);
 const call=(method,url,provided='')=>{
   const req={path:url,method,header:()=>provided};
   const res={code:null,body:null,status(n){this.code=n;return this},
     json(x){this.body=x;return this}};
   let nextCalls=0;stagingAccess(req,res,()=>nextCalls++);
   return {nextCalls,res};
 };
 try{
  process.env.VIBESANE_DEPLOYMENT_ENV='staging';
  delete process.env.VIBESANE_STAGING_ACCESS_KEY;
  assert.equal(call('POST','/api/github/token',key).res.code,403);
  process.env.VIBESANE_STAGING_ACCESS_KEY=key;
  assert.equal(call('GET','/').nextCalls,1);
  assert.equal(call('GET','/api/healthz').nextCalls,1);
  assert.equal(call('OPTIONS','/api/github/token').nextCalls,1);
  assert.equal(call('GET','/api/readyz').nextCalls,1);
  assert.equal(call('GET','/api/github/token/status').res.code,403);
  // Sandbox webhook must reach the separate HMAC verifier.
  assert.equal(call('POST','/api/webhooks/dodo').nextCalls,1);
  assert.equal(call('POST','/api/github/token','a'.repeat(63)).res.code,403);
  assert.equal(call('POST','/api/github/token','b'.repeat(64)).res.code,403);
  assert.equal(call('POST','/api/github/token',key).nextCalls,1);
  process.env.VIBESANE_DEPLOYMENT_ENV='production';
  assert.equal(call('POST','/api/github/token').nextCalls,1);
 }finally{
  if(deployment===undefined)delete process.env.VIBESANE_DEPLOYMENT_ENV;
  else process.env.VIBESANE_DEPLOYMENT_ENV=deployment;
  if(secret===undefined)delete process.env.VIBESANE_STAGING_ACCESS_KEY;
  else process.env.VIBESANE_STAGING_ACCESS_KEY=secret;
 }
});
