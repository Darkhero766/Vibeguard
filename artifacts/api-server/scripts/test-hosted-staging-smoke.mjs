#!/usr/bin/env node
// Public-surface staging smoke; no credentials, customer data, or writes.
// A healthy status is not proof of OAuth, payment, or production readiness.
import assert from 'node:assert/strict';

const base='https://vibesane-phase12-staging-api.onrender.com';
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));

async function request(urlPath, options={}){
  let lastError;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response=await fetch(base+urlPath,{
        ...options,
        redirect:'error',
        signal:AbortSignal.timeout(40_000),
      });
      if(response.status===502||response.status===503||response.status===504){
        // Render free-instance cold boot is not necessarily a failed release.
        lastError=new Error('HTTP '+response.status+' at '+urlPath);
        if(attempt<3){await sleep(5000);continue;}
      }
      const contentType=response.headers.get('content-type')??'';
      const payload=contentType.includes('application/json')
        ? await response.json():{};
      return {status:response.status,payload};
    }catch(error){
      lastError=error;
      if(attempt<3)await sleep(5000);
    }
  }
  throw lastError??new Error('Unknown staging network failure');
}

const results=[];
try{
  const health=await request('/api/healthz');
  assert.equal(health.status,200,'Health must be HTTP 200');
  assert.equal(health.payload.status,'ok');
  results.push({check:'health',status:'pass'});

  const ready=await request('/api/readyz');
  assert.equal(ready.status,200,'Staging database must be ready');
  assert.equal(ready.payload.status,'ready');
  assert.equal(ready.payload.database,'ok');
  results.push({check:'database_readiness',status:'pass'});

  const protectedRoute=await request('/api/github/token/status');
  assert.equal(protectedRoute.status,403,'Private staging API must deny requests lacking access key');
  results.push({check:'protected_api_without_key',status:'pass'});

  // No external payment is initiated: malformed signature must be rejected
  // before webhook writes (Dodo sandbox-only mode remains configured).
  const unsignedWebhook=await request('/api/webhooks/dodo',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({type:'subscription.active',data:{}}),
  });
  assert.equal(unsignedWebhook.status,401,'Unsigned Dodo webhook must fail');
  results.push({check:'unsigned_webhook',status:'pass'});

  const unsignedGitHub=await request('/api/github/webhook',{
    method:'POST',
    headers:{'Content-Type':'application/json','X-GitHub-Event':'ping'},
    body:JSON.stringify({zen:'untrusted-unsigned-fixture'}),
  });
  assert.equal(unsignedGitHub.status,401,'Unsigned GitHub App webhook must fail HMAC verification');
  results.push({check:'unsigned_github_webhook',status:'pass'});

  const preflight=await request('/api/github/token/status',{
    method:'OPTIONS',
    headers:{Origin:'https://staging.vibesane.invalid','Access-Control-Request-Method':'GET'},
  });
  assert.equal(preflight.status,204,'Staging browser preflight must work');
  results.push({check:'cors_preflight',status:'pass'});

  console.log('HOSTED_STAGING_SMOKE='+JSON.stringify({status:'passed',results,
    note:'Anonymous external HTTP checks only, NOT E2E OAuth/checkout/auth or independent security review'}));
}catch(error){
  console.error('HOSTED_STAGING_SMOKE='+JSON.stringify({status:'failed',results,
    error:String(error?.message??error).slice(0,240)}));
  process.exitCode=1;
}
