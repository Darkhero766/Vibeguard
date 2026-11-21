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

  // Staging frontend is separate from production. This does not perform
  // an interactive OAuth login or create a user.
  const website='https://vibesane-phase12-staging-web.onrender.com';
  const getWebsite=async(pathname)=>{
    const response=await fetch(website+pathname,{
      redirect:'follow',signal:AbortSignal.timeout(25_000),
    });
    return {response,body:await response.text()};
  };
  const home=await getWebsite('/');
  assert.equal(home.response.status,200,'Staging frontend root must serve HTTP 200');
  assert.match(home.body,/name=["']robots["']\s+content=["']noindex/i);
  results.push({check:'staging_frontend_root',status:'pass'});

  const auth=await getWebsite('/auth?mode=signin');
  assert.equal(auth.response.status,200,'Direct staging login link must serve HTTP 200');
  assert.match(auth.body,/<html/i);
  assert.match(auth.body,/name=["']robots["']\s+content=["']noindex/i);
  results.push({check:'staging_frontend_auth_route',status:'pass'});

  // Regression for the mobile Get Pro -> /checkout static-host 404. This must
  // check hosted Render routing, not only a locally generated HTML artifact.
  // Redirect following is intentional: Render may normalize directory paths.
  for (const [route, label] of [
    ['/pricing', 'staging_frontend_pricing_route'],
    ['/checkout', 'staging_frontend_checkout_route'],
    ['/audit/report', 'staging_frontend_nested_route'],
  ]) {
    const page=await getWebsite(route);
    assert.equal(page.response.status,200,route+' must not become Render Not Found');
    assert.match(page.body,/<html/i,route+' must serve an HTML document');
    assert.match(page.body,/name=["']robots["']\s+content=["']noindex/i,
      route+' must remain excluded from indexes in staging');
    assert.match(page.body,/<div id=["']root["']/i,
      route+' must provide the React application mount');
    results.push({check:label,status:'pass'});
  }

  const robots=await getWebsite('/robots.txt');
  assert.equal(robots.response.status,200,'Staging robots rules must be reachable');
  assert.match(robots.body,/Disallow:\s*\//i);
  results.push({check:'staging_frontend_noindex',status:'pass'});

  const asset=home.body.match(/<script[^>]+\bsrc=["'](\/assets\/[^"']+\.js)["']/i)?.[1];
  assert.ok(asset,'Staging frontend must reference a compiled JavaScript asset');
  const js=await getWebsite(asset);
  assert.equal(js.response.status,200,'Compiled frontend asset must be downloadable');
  assert.ok(js.body.includes('aojmjxxmsgnipbbrtvlz.supabase.co'),
    'Frontend bundle must point at staging Supabase');
  assert.ok(js.body.includes('vibesane-phase12-staging-api.onrender.com'),
    'Frontend bundle must point at staging API');
  assert.ok(!js.body.includes('VIBESANE_STAGING_ACCESS_KEY'),
    'Private staging API access secret identifier must not be in public code');
  results.push({check:'staging_frontend_isolation',status:'pass'});

  console.log('HOSTED_STAGING_SMOKE='+JSON.stringify({status:'passed',results,
    note:'Anonymous external HTTP checks only, NOT E2E OAuth/checkout/auth or independent security review'}));
}catch(error){
  console.error('HOSTED_STAGING_SMOKE='+JSON.stringify({status:'failed',results,
    error:String(error?.message??error).slice(0,240)}));
  process.exitCode=1;
}
