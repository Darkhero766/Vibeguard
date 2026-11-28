#!/usr/bin/env node
// Reproducible 24-case synthetic comparison of regex-only and experimental AST SQL checks.
// This is local target-rule evaluation, not real-world vulnerability accuracy or exploit proof.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSource } from './agentshield-ast.mjs';

const exec=promisify(execFile);
const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const scanner=path.resolve(scriptDir,'../dist/agentshield.mjs');
const tick=String.fromCharCode(96);
const template='const q = '+tick+'SELECT * FROM orders WHERE id='+'$'+'{id}'+tick+'; db.query(q);';
const positives=[
  'const q="SELECT * FROM users WHERE id=" + id; db.query(q);',
  'let q="UPDATE users SET role=1 WHERE id=" + userId; pool.execute(q);',
  'const raw="DELETE FROM posts WHERE id=" + request.params.id; const sql=raw; await db.query(sql);',
  'async function action(userId) {const q="SELECT id FROM users WHERE id=" + userId; db.query(q);}',
  'const q="INSERT INTO orders(id) VALUES (" + input + ")"; await db.query(q);',
  template,
  'const sql='+tick+'DELETE FROM users WHERE id='+'$'+'{params.id}'+tick+'; pool.execute(sql);',
  'let sql="SELECT id FROM users"; sql="SELECT id FROM users WHERE id=" + id; db.query(sql);',
  'const q=flag ? "SELECT * FROM users WHERE id=" + id : "SELECT * FROM users WHERE id=" + other; db.query(q);',
  'const base="SELECT id FROM users WHERE id=" + id; const alias=base; const alias2=alias; db.query(alias2);',
  'function load(id) {const query="SELECT * FROM products WHERE id=" + id; return db.execute(query);}',
  'const q="SELECT * FROM users WHERE slug=" + req.query.slug; await pool.$queryRawUnsafe(q);',
];
const negatives=[
  'await db.query("SELECT * FROM users WHERE id=$1", [id]);',
  'db.execute("DELETE FROM posts WHERE id=?", [id]);',
  'const a="SELECT * FROM users WHERE id="; const b="42"; db.query(a+b);',
  'db.query("SELECT id FROM users LIMIT 1");',
  'const q="SELECT * FROM users WHERE id=" + id; console.log(q);',
  'const q = '+tick+'SELECT id FROM users WHERE id='+'$'+'{id}'+tick+'; prisma.$queryRaw(q);',
  'const query="SELECT id FROM users"; db.query(query);',
  'const q="SELECT" + " id FROM users"; db.query(q);',
  '// db.query("SELECT * FROM users WHERE id=" + id);\nconst x = 3;',
  'const q="DELETE FROM posts WHERE id=" + "42"; db.query(q);',
  'const q=flag ? "SELECT id FROM users" : "SELECT id FROM posts"; db.query(q);',
  'await db.query("SELECT * FROM users WHERE id=$1",[Number(id)]);',
];
export const AST_BENCHMARK_CASES = [
  ...positives.map((content,i)=>({id:'risk-'+(i+1),expected:true,content})),
  ...negatives.map((content,i)=>({id:'control-'+(i+1),expected:false,content})),
];
function scores() { return {tp:0,tn:0,fp:0,fn:0}; }
function metric(value) {
  const p=value.tp+value.fp ? value.tp/(value.tp+value.fp) : null;
  const r=value.tp+value.fn ? value.tp/(value.tp+value.fn) : null;
  return {...value,precision:p,recall:r,
    falsePositiveRate:value.fp+value.tn?value.fp/(value.fp+value.tn):null};
}
export async function benchmarkAst() {
  const root=await mkdtemp(path.join(tmpdir(),'agentshield-ast-bench-'));
  const t0=performance.now(),regex=scores(),ast=scores(),misses={regex:[],ast:[]};
  try {
    await exec('git',['init','-q',root],{timeout:5000});
    await mkdir(path.join(root,'src'));
    for(const tc of AST_BENCHMARK_CASES) {
      const rel='src/fixture.ts';
      await writeFile(path.join(root,rel),tc.content+'\n');
      let output;
      try { ({stdout:output}=await exec(process.execPath,[scanner,'scan','--file',rel,
        '--cwd',root,'--format','json'],{timeout:15000,maxBuffer:1500000})); }
      catch(e) {
        if(e.code!==1 || typeof e.stdout!=='string') throw new Error('Scanner failure for '+tc.id);
        output=e.stdout;
      }
      let report;
      try { report=JSON.parse(output); } catch {throw new Error('Invalid scanner report for '+tc.id);}
      if(report.status!=='complete' || report.filesScanned!==1) throw new Error('Incomplete scan '+tc.id);
      const before=report.findings.some(f=>f.ruleId==='unsafe_sql_template');
      const after=analyzeSource(rel,tc.content);
      if(after.status!=='complete') throw new Error('AST incomplete for '+tc.id);
      const astFound=after.findings.some(f=>f.ruleId==='unsafe_sql_dataflow');
      for(const [name,found,bucket] of [['regex',before,regex],['ast',astFound,ast]]) {
        const label=tc.expected ? (found?'tp':'fn') : (found?'fp':'tn');
        bucket[label]++;
        if(label==='fp'||label==='fn') misses[name].push({caseId:tc.id,type:label});
      }
    }
    return {cases:AST_BENCHMARK_CASES.length,positives:positives.length,negatives:negatives.length,
      regexOnly:metric(regex),experimentalAst:metric(ast),misses,
      elapsedMs:Math.round(performance.now()-t0),runtime:process.version,
      note:'Synthetic local target-rule comparison; AST is intra-file and advisory/experimental.'};
  } finally { await rm(root,{recursive:true,force:true}); }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  benchmarkAst().then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n')).catch(e=>{
    process.stderr.write('AST benchmark failed: '+e.message+'\n'); process.exitCode=2;
  });
}
