import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeCrossFileSqlFlows } from './agentshield-crossfile.mjs';
const exec=promisify(execFile);
const scripts=path.dirname(fileURLToPath(import.meta.url));
const risky='export function unsafeLookup(id) { const query="SELECT * FROM users WHERE id=" + id; db.query(query); }';
const safe='export function safeLookup(id) { db.query("SELECT * FROM users WHERE id=$1",[id]); }';
const files=(caller,helper=risky)=>[
  {path:'src/db.ts',content:helper},
  {path:'src/route.ts',content:caller},
];
test('follows request data across a named relative import to SQL concatenation',()=>{
 const r=analyzeCrossFileSqlFlows(files('import { unsafeLookup } from "./db"; const id=req.query.id; unsafeLookup(id);'));
 assert.equal(r.status,'complete');assert.equal(r.findings.length,1);
 assert.equal(r.findings[0].ruleId,'cross_file_tainted_sql');
 assert.equal(r.findings[0].filePath,'src/route.ts');
 assert.equal(r.findings[0].relatedHelper,'src/db.ts');
});
test('detects direct request parameter at imported helper call',()=>{
 const r=analyzeCrossFileSqlFlows(files('import {unsafeLookup} from "./db"; unsafeLookup(req.params.id);'));
 assert.equal(r.findings.length,1);
});
test('detects alias import of exported dangerous helper',()=>{
 const r=analyzeCrossFileSqlFlows(files('import {unsafeLookup as lookup} from "./db"; const id=req.body.id;lookup(id);'));
 assert.equal(r.findings.length,1);
});
test('safe parameterized helper does not produce cross-file SQL warning',()=>{
 const r=analyzeCrossFileSqlFlows(files('import {safeLookup} from "./db";safeLookup(req.params.id);',safe));
 assert.equal(r.findings.length,0);
});
test('trusted constant passed to raw helper is not classified as request input',()=>{
 const r=analyzeCrossFileSqlFlows(files('import {unsafeLookup} from "./db"; unsafeLookup("42");'));
 assert.equal(r.findings.length,0);
});
test('numeric input casts are not treated as injectable SQL control tokens',()=>{
 const r=analyzeCrossFileSqlFlows(files('import {unsafeLookup} from "./db";unsafeLookup(Number(req.params.id));'));
 assert.equal(r.findings.length,0);
});
test('same file dynamic SQL is not misrepresented as a cross-file flow',()=>{
 const r=analyzeCrossFileSqlFlows([{path:'src/a.ts',content:'const q="SELECT * FROM u WHERE id="+req.query.id;db.query(q);'}]);
 assert.equal(r.findings.length,0);
});
test('does not resolve npm packages or imports outside the selected changed-file set',()=>{
 const r=analyzeCrossFileSqlFlows(files('import {unsafeLookup} from "external";unsafeLookup(req.params.id);'));
 assert.equal(r.findings.length,0);
 const two=analyzeCrossFileSqlFlows([{path:'src/route.ts',content:'import {unsafeLookup} from "./db";unsafeLookup(req.query.id);'}]);
 assert.equal(two.findings.length,0);
});
test('named export of an arrow function is supported',()=>{
 const helper='export const unsafeLookup = (id) => {const sql="UPDATE users SET role=1 WHERE id="+id;pool.query(sql);};';
 const r=analyzeCrossFileSqlFlows(files('import {unsafeLookup} from "./db";unsafeLookup(req.query.id);',helper));
 assert.equal(r.findings.length,1);
});
test('does not classify safe bound PostgreSQL query configs as raw SQL',()=>{
 const helper='export function safeLookup(id){db.query({text:"SELECT * FROM users WHERE id=$1",values:[id]});}';
 const r=analyzeCrossFileSqlFlows(files('import {safeLookup} from "./db";safeLookup(req.query.id);',helper));
 assert.equal(r.findings.length,0);
});
test('rejects path traversal in cross-file inputs',()=>{
 assert.throws(()=>analyzeCrossFileSqlFlows([{path:'../.env.ts',content:risky}]));
 assert.throws(()=>analyzeCrossFileSqlFlows([{path:'/tmp/secret.ts',content:risky}]));
});
test('malformed imports fail incomplete rather than producing a clean assessment',()=>{
 assert.throws(()=>analyzeCrossFileSqlFlows(files('import {unsafeLookup from "./db"; unsafeLookup(req.query.id);')));
});
test('analysis obeys file-count and byte budgets',()=>{
 assert.throws(()=>analyzeCrossFileSqlFlows(Array.from({length:101},(_,i)=>({path:'src/a'+i+'.ts',content:'const x=1;'}))));
 assert.throws(()=>analyzeCrossFileSqlFlows([{path:'src/large.ts',content:' '.repeat(8_000_001)}]));
});
test('resolves relative index exports within the selected changed files',()=>{
 const r=analyzeCrossFileSqlFlows([
  {path:'src/db/index.ts',content:risky},
  {path:'src/route.ts',content:'import {unsafeLookup} from "./db";unsafeLookup(req.query.id);'},
 ]);
 assert.equal(r.findings.length,1);
});
test('end-to-end opt-in Git scan includes changed-file cross-module warnings',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'agentshield-xfile-'));
 t.after(async()=>rm(root,{recursive:true,force:true}));
 await exec('git',['init','-q',root],{timeout:5000});
 await mkdir(path.join(root,'src'));
 await writeFile(path.join(root,'src/db.ts'),risky);
 const untrustedSourceFixture='import {unsafeLookup} from "./db";const id=req.query.id;unsafeLookup(id);';
 await writeFile(path.join(root,'src/route.ts'),untrustedSourceFixture);
 const entry=path.join(scripts,'vibesane.mjs');
 let stdout,exit=0;
 try {({stdout}=await exec(process.execPath,[entry,'hybrid','--changed','--cwd',root,'--enable-ast','--format','json'],{timeout:30000,maxBuffer:1_000_000}));}
 catch(e){exit=e.code;if(typeof e.stdout!=='string')throw e;stdout=e.stdout;}
 const report=JSON.parse(stdout);
 assert.equal(exit,1);
 assert.equal(report.status,'complete');
 assert.equal(report.ast.status,'complete');
 assert.ok(report.ast.crossFileFindings.some(f=>f.ruleId==='cross_file_tainted_sql'));
 assert.equal(report.ai.status,'disabled');
 assert.equal(report.privacy.sourceSentToModel,false);
});

test('tracks destructured req.body through a changed-file import',()=>{
 const r=analyzeCrossFileSqlFlows(files('import {unsafeLookup} from "./db";const {id}=req.body;unsafeLookup(id);'));
 assert.equal(r.findings.length,1);
});
test('tracks a default-export local SQL helper with named caller alias',()=>{
 const helper='export default function lookup(id){db.query("SELECT * FROM users WHERE id="+id);}';
 const r=analyzeCrossFileSqlFlows(files('import lookup from "./db";lookup(req.query.id);',helper));
 assert.equal(r.findings.length,1);
});
