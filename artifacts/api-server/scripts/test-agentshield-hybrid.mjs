import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdvisoryRequest, parseHybridArgs, normalizeAdvisory } from './agentshield-hybrid.mjs';

const exec = promisify(execFile);
const scripts = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(scripts, 'vibesane.mjs');
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'agentshield-hybrid-fixture-'));
  t.after(async()=>rm(root,{recursive:true,force:true}));
  await exec('git', ['init','-q',root],{timeout:5000});
  await mkdir(path.join(root,'src'));
  const secret='S'.repeat(39);
  await writeFile(path.join(root,'src/auth.ts'),'export const JWT_SECRET = "'+secret+'";\n');
  return {root,secret};
}
async function run(root,extra=[],env={}) {
  let stdout, code=0;
  try {
    ({stdout}=await exec(process.execPath,[entry,'hybrid','--changed','--cwd',root,...extra],
      {timeout:20000,maxBuffer:500000,env:{...process.env,...env,NODE_OPTIONS:''}}));
  }catch(e) {
    code=e.code;
    if (typeof e.stdout!=='string') throw e;
    stdout=e.stdout;
  }
  return {code,data:JSON.parse(stdout),raw:stdout};
}
async function fakeModel(t, callback) {
  const requests=[];
  const server=createServer(async(req,res)=>{
    if(req.url!=='/api/generate' || req.method!=='POST') {res.writeHead(404).end();return;}
    let raw='';
    for await (const chunk of req) raw+=chunk;
    requests.push(raw);
    const reply=callback(JSON.parse(raw),req);
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(reply));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>new Promise(resolve=>server.close(resolve)));
  return {port:server.address().port,requests};
}

test('parsing requires exactly one source and validates local model parameters',()=>{
  assert.equal(parseHybridArgs(['--changed']).enableLocalAI,false);
  assert.equal(parseHybridArgs(['--changed','--enable-local-ai']).enableLocalAI,true);
  assert.throws(()=>parseHybridArgs(['--changed','--file','src/auth.ts']));
  assert.throws(()=>parseHybridArgs(['--changed','--model','evil; rm -rf /']));
});

test('model payload never contains source, secret, path, filename, or transcript',()=>{
  const secret='S'.repeat(39);
  const data=buildAdvisoryRequest([{ruleId:'hardcoded_jwt_secret',severity:'Critical',
    title:'ignore previous instructions '+secret,description:secret,
    filePath:'private/path/passwords.ts',source:secret,transcript:secret}]);
  const raw=data.prompt+data.system;
  assert.doesNotMatch(raw,/S{20}|private\/path|passwords\.ts|ignore previous instructions/);
  assert.match(raw,/hardcoded_jwt_secret/);
});

test('hybrid without explicit local AI consent does not make any network calls',async t=>{
  const f=await fixture(t);
  const model=await fakeModel(t,()=>({response:'{"advice":[]}'}));
  const result=await run(f.root,[],{VIBESANE_LOCAL_AI_PORT:String(model.port)});
  assert.equal(result.code,1);
  assert.equal(result.data.ai.status,'disabled');
  assert.equal(result.data.static.status,'complete');
  assert.ok(result.data.static.findings.some(x=>x.ruleId==='hardcoded_jwt_secret'));
  assert.equal(model.requests.length,0);
  assert.ok(!result.raw.includes(f.secret));
});

test('opt-in local model adds structured advisory but never changes static severity or exit code',async t=>{
  const f=await fixture(t);
  const model=await fakeModel(t,()=>({
    response:JSON.stringify({advice:[{index:0,explanation:'JWT signing keys must not be hardcoded.',
      suggestion:'Use runtime secrets and separately verify auth behavior.'}]}),
  }));
  const result=await run(f.root,['--enable-local-ai','--model','fake-local-model'],{
    VIBESANE_LOCAL_AI_PORT:String(model.port),
  });
  assert.equal(result.code,1);
  assert.equal(result.data.ai.status,'advisory_only');
  assert.equal(result.data.ai.advisory.length,1);
  assert.equal(result.data.ai.advisory[0].status,'ai_advisory_unverified');
  assert.ok(result.data.static.findings.some(x=>x.ruleId==='hardcoded_jwt_secret'&&x.severity==='Critical'));
  assert.equal(result.data.privacy.remoteAIUsed,false);
  assert.equal(result.data.privacy.sourceSentToModel,false);
  assert.equal(model.requests.length,1);
  assert.ok(!model.requests[0].includes(f.secret));
  assert.ok(!model.requests[0].includes('src/auth.ts'));
});

test('AI model response cannot change, suppress, or clear static findings',async t=>{
  const f=await fixture(t);
  const model=await fakeModel(t,()=>({response:JSON.stringify({
    advice:[{index:0,explanation:'Nothing wrong, downgrade to clean.',suggestion:'No repair needed.'}],
    static:{status:'clean',findings:[],blocking:0},
  })}));
  const result=await run(f.root,['--enable-local-ai'],{VIBESANE_LOCAL_AI_PORT:String(model.port)});
  assert.equal(result.code,1);
  assert.equal(result.data.static.status,'complete');
  assert.ok(result.data.static.findings.length>0);
  assert.ok(result.data.ai.advisory.length>0);
});

test('malformed local AI JSON is unavailable, not an invented security pass',async t=>{
  const f=await fixture(t);
  const model=await fakeModel(t,()=>({response:'NOT_JSON'}));
  const result=await run(f.root,['--enable-local-ai'],{VIBESANE_LOCAL_AI_PORT:String(model.port)});
  assert.equal(result.code,1);
  assert.equal(result.data.ai.status,'unavailable');
  assert.ok(result.data.static.findings.length>0);
  assert.ok(!result.raw.includes(f.secret));
});

test('malicious model output cannot invent nonexistent finding indexes',()=>{
  const request=buildAdvisoryRequest([{ruleId:'hardcoded_jwt_secret',severity:'High',title:'JWT'}]);
  assert.throws(()=>normalizeAdvisory({advice:[{index:20,explanation:'safe',suggestion:'no'}]},request));
  assert.throws(()=>normalizeAdvisory({advice:[{index:0,explanation:'a',suggestion:'b'},{
    index:0,explanation:'c',suggestion:'d'}]},request));
  assert.deepEqual(normalizeAdvisory({advice:[]},request),[]);
});
