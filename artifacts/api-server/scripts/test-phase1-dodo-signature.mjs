import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir=path.dirname(fileURLToPath(import.meta.url));
test('Dodo webhooks require a current, correctly signed, canonical HMAC signature',async()=>{
  const out=await build({entryPoints:[path.join(dir,'../src/lib/dodoWebhookSignature.ts')],
    write:false,bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'silent'});
  const b64=Buffer.from(out.outputFiles[0].contents).toString('base64');
  const {verifyDodoSignature}=await import('data:text/javascript;base64,'+b64);
  const key=randomBytes(32);
  const nowMs=1795140000000; // synthetic fixed UTC timestamp
  const timestamp=String(Math.floor(nowMs/1000));
  const webhookId='synthetic-event-123';
  const rawBody=JSON.stringify({type:'subscription.active',data:{subscription_id:'test-only'}});
  const signature='v1,'+createHmac('sha256',key)
    .update(webhookId+'.'+timestamp+'.'+rawBody).digest('base64');
  const valid={rawBody,webhookId,timestamp,signatureHeader:signature,
    secret:'whsec_'+key.toString('base64'),nowMs};
  assert.equal(verifyDodoSignature(valid),true);
  assert.equal(verifyDodoSignature({...valid,rawBody:rawBody+' '}),false);
  assert.equal(verifyDodoSignature({...valid,webhookId:webhookId+'-tampered'}),false);
  assert.equal(verifyDodoSignature({...valid,secret:'whsec_'+randomBytes(32).toString('base64')}),false);
  assert.equal(verifyDodoSignature({...valid,secret:'whsec_!!!'}),false);
  assert.equal(verifyDodoSignature({...valid,secret:'whsec_'+randomBytes(6).toString('base64')}),false);
  assert.equal(verifyDodoSignature({...valid,timestamp:String(Number(timestamp)-601)}),false);
  assert.equal(verifyDodoSignature({...valid,timestamp:timestamp+'.5'}),false);
  assert.equal(verifyDodoSignature({...valid,signatureHeader:signature.replace(/^v1,/, 'v2,')}),false);
  assert.equal(verifyDodoSignature({...valid,signatureHeader:'not-a-signature'}),false);
  assert.equal(verifyDodoSignature({...valid,signatureHeader:'v2,invalid '+signature}),true);
  assert.equal(verifyDodoSignature({...valid,signatureHeader:undefined}),false);
});
