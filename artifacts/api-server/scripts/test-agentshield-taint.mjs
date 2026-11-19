import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTaintedSql } from './agentshield-taint.mjs';
import { benchmarkTaint } from './benchmark-agentshield-taint.mjs';
const exec=promisify(execFile);
const scripts=path.dirname(fileURLToPath(import.meta.url));
const risk=(code)=>analyzeTaintedSql('app/api/users/route.ts',code);
test('tracks req.query through an SQL variable into db.query',()=>{
  const r=risk('const id=req.query.id; const query="SELECT * FROM users WHERE id=" + id; db.query(query);');
  assert.equal(r.status,'complete');assert.equal(r.findings.length,1);
  assert.equal(r.findings[0].ruleId,'tainted_sql_sink');
  assert.equal(r.findings[0].confidence,'high');
  assert.deepEqual(r.findings[0].sourceCategories,['http_request']);
});
test('tracks request JSON body through SQL in a function',()=>{
  const r=risk('export async function POST(request: Request) { const body=await request.json(); const sql="DELETE FROM users WHERE id="+body.id; await pool.query(sql); }');
  assert.equal(r.findings.length,1);
});
test('tracks two local aliases from request parameters',()=>{
  const r=risk('const item=req.params.id;const userId=item;const sql="SELECT id FROM users WHERE id="+userId;client.execute(sql);');
  assert.equal(r.findings.length,1);
});
test('tracks destructured request query values',()=>{
  const r=risk('const {id}=req.query;const q="SELECT id FROM users WHERE id="+id;db.query(q);');
  assert.equal(r.findings.length,1);
});
test('tracks Next.js search parameter access',()=>{
  const r=risk('const id=request.nextUrl.searchParams.get("id");const q="SELECT id FROM users WHERE id="+id;db.query(q);');
  assert.equal(r.findings.length,1);
});
test('does not trust unrecognized escape functions as sanitizers',()=>{
  const r=risk('const id=req.headers["x-id"];const q="SELECT id FROM users WHERE id="+escapeSql(id);db.query(q);');
  assert.equal(r.findings.length,1);
});
test('identifies raw untrusted SQL input',()=>{
  const r=risk('const query=req.body.sql; db.query(query);');
  assert.equal(r.findings.length,1);assert.equal(r.findings[0].confidence,'medium');
});
test('tracks reassigned request variable',()=>{
  const r=risk('let id=1;id=req.query.id;const sql="SELECT id FROM users WHERE id="+id;db.query(sql);');
  assert.equal(r.findings.length,1);
});
test('does not flag parameterized SQL with request input as a bind value',()=>{
  const r=risk('db.query("SELECT id FROM users WHERE id=$1",[req.query.id]);');
  assert.equal(r.findings.length,0);
});
test('does not flag prepared SQL with a bind parameter',()=>{
  const r=risk('pool.execute("DELETE FROM users WHERE id=?",[req.params.id]);');
  assert.equal(r.findings.length,0);
});
test('numeric conversion prevents arbitrary SQL control tokens',()=>{
  const r=risk('const id=Number(req.query.id);const q="SELECT id FROM users WHERE id="+id;db.query(q);');
  assert.equal(r.findings.length,0);
});
test('BigInt conversion prevents arbitrary SQL control tokens',()=>{
  const r=risk('const id=BigInt(req.query.id);const q="SELECT id FROM users WHERE id="+id;db.query(q);');
  assert.equal(r.findings.length,0);
});
test('static SQL concatenation is not tainted',()=>{
  assert.equal(risk('const id=42;const q="SELECT id FROM users WHERE id="+id;db.query(q);').findings.length,0);
});
test('comments containing SQL are ignored',()=>{
  assert.equal(risk('// db.query("SELECT id FROM users WHERE id="+req.query.id);\nconst x=1;').findings.length,0);
});
test('query methods of unrelated objects are not SQL sinks',()=>{
  assert.equal(risk('const q=req.query.id;search.query(q);').findings.length,0);
});
test('literal request-looking strings are not input sources',()=>{
  assert.equal(risk('const x="req.query.id";db.query("SELECT id FROM users WHERE id="+x);').findings.length,0);
});
test('TSX request flow is supported',()=>{
  const r=analyzeTaintedSql('src/page.tsx','function Page({req}:any){const q="SELECT id FROM u WHERE id="+req.query.id;client.query(q);return <div>ok</div>}');
  assert.equal(r.findings.length,1);
});
test('malformed source yields incomplete status',()=>{
  const r=risk('const = req.query.id;db.query("SELECT "+id);');
  assert.equal(r.status,'parse_incomplete');assert.equal(r.findings.length,0);
});
test('unsupported Python and SQL are not labeled as analyzed',()=>{
  assert.equal(analyzeTaintedSql('src/a.py','db.query(req.query.id)').status,'unsupported');
  assert.equal(analyzeTaintedSql('migrations/01.sql','SELECT id FROM u').status,'unsupported');
});
test('source input budget is enforced',()=>{
  assert.throws(()=>risk(' '.repeat(1_000_001)));
});
test('hybrid worker returns distinct taint findings and preserves static metadata',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'agentshield-taint-'));
  t.after(async()=>rm(dir,{recursive:true,force:true}));
  await exec('git',['init','-q',dir],{timeout:5000});
  await mkdir(path.join(dir,'src'));
  await writeFile(path.join(dir,'src/route.ts'),'const id=req.query.id;const sql="SELECT id FROM users WHERE id="+id;db.query(sql);\n');
  const entry=path.join(scripts,'vibesane.mjs');
  let stdout,exit=0;
  try {({stdout}=await exec(process.execPath,[entry,'hybrid','--changed','--cwd',dir,'--enable-ast','--format','json'],{timeout:25000,maxBuffer:700000}));}
  catch(e){exit=e.code;if(typeof e.stdout!=='string')throw e;stdout=e.stdout;}
  const r=JSON.parse(stdout);
  assert.equal(exit,1);assert.equal(r.status,'complete');assert.equal(r.ast.status,'complete');
  assert.ok(r.ast.taintFindings.some(f=>f.ruleId==='tainted_sql_sink'));
  assert.equal(r.privacy.sourceSentToModel,false);assert.equal(r.ai.status,'disabled');
});
test('taint report never prints unrelated literal private source',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'agentshield-taint-private-'));
  t.after(async()=>rm(dir,{recursive:true,force:true}));
  await exec('git',['init','-q',dir]);
  await writeFile(path.join(dir,'q.ts'),'const privateSecret="PRIVATE_ONLY_DO_NOT_UPLOAD_0123456789";const q="SELECT id FROM u WHERE id="+req.query.id;db.query(q);');
  const entry=path.join(scripts,'vibesane.mjs');
  let stdout;try{({stdout}=await exec(process.execPath,[entry,'hybrid','--changed','--cwd',dir,'--enable-ast'],{timeout:22000}));}
  catch(e){if(typeof e.stdout!=='string')throw e;stdout=e.stdout;}
  assert.doesNotMatch(stdout,/PRIVATE_ONLY_DO_NOT_UPLOAD/);
});

test('fresh 50-case taint challenge reports all misses and category-level rates',()=>{
  const r=benchmarkTaint();
  assert.equal(r.cases,50);
  assert.equal(r.results.tp+r.results.tn+r.results.fp+r.results.fn,50);
  assert.equal(r.misclassifications.length,r.results.fp+r.results.fn);
  assert.equal(Object.keys(r.categories).length,5);
  assert.ok(r.results.precision===null || (r.results.precision>=0 && r.results.precision<=1));
  console.log('OBSERVED_AGENTSIELD_TAINT_CHALLENGE='+JSON.stringify({
    result:r.results,categories:r.categories,misses:r.misclassifications,
    elapsedMs:r.elapsedMs,runtime:r.runtime,
  }));
});
