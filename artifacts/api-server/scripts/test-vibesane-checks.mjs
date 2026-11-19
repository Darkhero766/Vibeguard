import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../../..');
let helper;
async function load(){
  if(!helper){
    const r=await build({entryPoints:[path.join(dir,'../src/lib/vibesaneCheckOutput.ts')],
      bundle:true,format:'esm',platform:'node',target:'node20',
      outfile:'/tmp/vibesane-check-output-test.mjs',write:false,logLevel:'silent'});
    helper=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].contents).toString('base64'));
  }
  return helper;
}
test('GitHub check output includes actionable path and rule without revealing source',async()=>{
  const {buildVibeSaneCheckOutput}=await load();
  const danger='PRIVATE_CREDENTIAL_MUST_NOT_LEAK_ABC123';
  const out=buildVibeSaneCheckOutput({scanMode:'delta',changedFiles:20,checksRun:50,
    findings:[
      {severity:'Critical',filePath:'src/api/route.ts',line:17,check:'command_injection',description:danger},
      {severity:'High',filePath:'src/checkout.ts',line:27,check:'sql_grant_anon',title:danger},
    ]});
  assert.equal(out.title,'VibeSane Security — 36/100');
  assert.equal(out.annotations.length,2);
  assert.equal(out.annotations[0].path,'src/api/route.ts');
  assert.equal(out.annotations[0].start_line,17);
  assert.equal(out.annotations[0].annotation_level,'failure');
  assert.match(out.summary,/src\/api\/route\.ts:17/);
  assert.match(out.summary,/command_injection/);
  assert.match(out.summary,/only findings introduced by this change/);
  assert.doesNotMatch(JSON.stringify(out),/PRIVATE_CREDENTIAL_MUST_NOT_LEAK/);
});
test('missing path and unsafe path are never sent as GitHub annotations',async()=>{
  const {buildVibeSaneCheckOutput}=await load();
  const out=buildVibeSaneCheckOutput({findings:[
    {severity:'Critical',filePath:'../.env',line:1,check:'secret'},
    {severity:'High',filePath:'src/x.ts',line:0,check:'eval_usage'},
    {severity:'Medium',filePath:'src/normal.ts',line:10,check:'weak_random'},
  ]});
  assert.equal(out.annotations.length,1);
  assert.equal(out.annotations[0].annotation_level,'warning');
  assert.equal(out.annotations[0].path,'src/normal.ts');
  assert.doesNotMatch(out.summary,/\.\.\/\.env/);
});
test('bound annotation list and summary for large finding sets',async()=>{
  const {buildVibeSaneCheckOutput}=await load();
  const findings=Array.from({length:80},(_,i)=>({
    severity:'High',filePath:'src/test'+i+'.ts',line:i+1,check:'open_redirect'}));
  const out=buildVibeSaneCheckOutput({findings});
  assert.equal(out.annotations.length,50);
  assert.match(out.summary,/and 55 more findings/);
  assert.ok(out.summary.length<=60000);
  assert.equal(out.title,'VibeSane Security — 0/100');
});
test('failed security scanner cannot produce a fabricated vulnerability score',async()=>{
  const {buildVibeSaneCheckOutput}=await load();
  const out=buildVibeSaneCheckOutput({scanIncomplete:true,
    findings:[{severity:'Critical',filePath:'src/x.ts',line:1,check:'scan_error'}]});
  assert.equal(out.title,'VibeSane Security — Scan incomplete');
  assert.deepEqual(out.annotations,[]);
  assert.match(out.summary,/No security verdict/);
  assert.doesNotMatch(out.summary,/Security score/);
});
test('zero findings means none detected, not a claim of security proof',async()=>{
  const {buildVibeSaneCheckOutput}=await load();
  const out=buildVibeSaneCheckOutput({findings:[],changedFiles:3,checksRun:50});
  assert.match(out.summary,/No new findings detected/);
  assert.match(out.summary,/not a security guarantee/);
});
test('webhook check runner uses sanitized outputs and a fail-closed scan-incomplete result',async()=>{
  const source=await readFile(path.join(root,'artifacts/api-server/src/routes/githubWebhook.ts'),'utf8');
  assert.match(source,/buildVibeSaneCheckOutput\(report\)/);
  assert.match(source,/scanIncomplete: true, findings: \[\]/);
  assert.doesNotMatch(source,/findings: \[\{ severity: "Critical" \}\]/);
});
