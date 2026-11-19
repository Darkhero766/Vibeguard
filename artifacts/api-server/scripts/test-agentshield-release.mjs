import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPABILITIES, printCapabilities } from './agentshield-capabilities.mjs';
const exec=promisify(execFile);
const scripts=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(scripts,'../../..');
const read=relative=>readFile(path.join(root,relative),'utf8');

test('capability registry distinguishes supported heuristics and unimplemented language-specific SAST',()=>{
  assert.equal(CAPABILITIES.staticScanner.codeLanguages.length,3);
  assert.deepEqual(CAPABILITIES.staticScanner.codeLanguages.map(x=>x.name),['JavaScript','TypeScript','SQL']);
  assert.ok(CAPABILITIES.staticScanner.unsupportedDedicatedSast.includes('Python'));
  assert.ok(CAPABILITIES.staticScanner.unsupportedDedicatedSast.includes('Go'));
  assert.equal(CAPABILITIES.securityGuarantee,false);
  assert.equal(CAPABILITIES.experimentalAst.status,'opt_in_checkout_only');
  assert.equal(CAPABILITIES.ai.status,'opt_in_local_advisory_only');
});
test('capabilities produces accurate offline JSON and readable text',async()=>{
  const json=JSON.parse(printCapabilities('json'));
  assert.equal(json.schemaVersion,1);
  assert.match(printCapabilities('text'),/not a security certification/i);
  assert.throws(()=>printCapabilities('xml'));
  const r=await exec(process.execPath,[path.join(scripts,'vibesane.mjs'),'capabilities','--format','json']);
  assert.equal(JSON.parse(r.stdout).ai.cannot[0],'change static verdict');
});
test('web frontend reads usage but does not create, update or insert billing/quota records',async()=>{
  const src=await read('artifacts/vibeguard/src/contexts/AuthContext.tsx');
  assert.match(src,/\.from\('usage'\)\.select/);
  assert.doesNotMatch(src,/\.from\('usage'\)\.(?:insert|update|upsert|delete)/);
  assert.match(src,/github_tokens'\)\.select\('owner'\)/);
});
test('authenticated web scans fail closed if quota verification fails',async()=>{
  const src=await read('artifacts/api-server/src/routes/scans.ts');
  assert.match(src,/Could not verify account scan quota; refusing to scan/);
  assert.match(src,/res\.status\(503\)\.json\(\{ error: "Unable to verify scan allowance/);
  assert.doesNotMatch(src,/continuing scan for compatibility/);
});
test('scan usage accounting happens before returning or caching results',async()=>{
  const src=await read('artifacts/api-server/src/routes/scans.ts');
  const start=src.indexOf('const response = CreateScanResponse.parse(finalReport)');
  const consume=src.indexOf('await consumePublicScan(req.userId)',start);
  const cache=src.indexOf('cacheScanResult(finalReport.repo, finalReport)',start);
  const send=src.indexOf('res.json(response)',start);
  assert.ok(start>=0 && consume>start && cache>consume && send>cache);
  assert.match(src,/res\.status\(status === 429 \? 429 : 503\)/);
});
test('unapproved Supabase lockdown SQL is separated from applied migration ledger',async()=>{
  const src=await read('supabase/review-only/PROPOSED_USAGE_ENTITLEMENT_LOCKDOWN.sql');
  assert.match(src,/REVOKE ALL PRIVILEGES ON TABLE public\.usage FROM PUBLIC, anon, authenticated/);
  assert.match(src,/GRANT SELECT ON TABLE public\.usage TO authenticated/);
  assert.match(src,/DROP POLICY IF EXISTS "Users can update their own usage"/);
  assert.match(src,/DO NOT EXECUTE IN AUTOMATED CI/);
});
test('hybrid TypeScript taint is opt-in and does not send source to a local model',async()=>{
  const src=await read('artifacts/api-server/scripts/agentshield-hybrid.mjs');
  assert.match(src,/enableAst:\s*false/);
  assert.match(src,/enableLocalAI:\s*false/);
  assert.match(src,/const findings = \[\.\.\.staticResult\.findings,/);
  assert.match(src,/ast\.taintFindings/);
  assert.match(src,/sourceSentToModel:false/);
});
test('hybrid worker has a bounded timeout, heap and restricted child environment',async()=>{
  const src=await read('artifacts/api-server/scripts/agentshield-hybrid.mjs');
  assert.match(src,/--max-old-space-size=256/);
  assert.match(src,/timeout:10_000/);
  assert.match(src,/NODE_OPTIONS:''/);
});
test('beta installer includes self-describing metadata but does not claim to ship AST',async()=>{
  const pack=await read('artifacts/api-server/scripts/package-agentshield-beta.mjs');
  assert.match(pack,/agentshield-capabilities\.mjs/);
  assert.doesNotMatch(pack,/['"]agentshield-ast\.mjs['"]/);
  assert.doesNotMatch(pack,/['"]agentshield-taint\.mjs['"]/);
  assert.match(pack,/private:\s*true/);
});
test('production planning never silently replays the legacy Supabase migration script',async()=>{
  const plan=await read('supabase/review-only/PROPOSED_USAGE_ENTITLEMENT_LOCKDOWN.sql');
  assert.match(plan,/explicit approval/);
  assert.match(plan,/test new registration/i);
});
