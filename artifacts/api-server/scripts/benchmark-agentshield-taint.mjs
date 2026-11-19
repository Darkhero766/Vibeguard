#!/usr/bin/env node
// Reproducible 50-case SYNTHETIC source-to-SQL-sink taint challenge.
// Labels are suspected risk patterns, not independently verified exploits.
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { TAINT_CHALLENGE } from './agentshield-taint-challenge.mjs';
import { analyzeTaintedSql } from './agentshield-taint.mjs';
const fresh=()=>({tp:0,tn:0,fp:0,fn:0});
function rates(v){
  const total=v.tp+v.tn+v.fp+v.fn;
  return {...v,total,precision:v.tp+v.fp?v.tp/(v.tp+v.fp):null,
    recall:v.tp+v.fn?v.tp/(v.tp+v.fn):null,
    falsePositiveRate:v.fp+v.tn?v.fp/(v.fp+v.tn):null};
}
export function benchmarkTaint(){
  const totals=fresh(),categories={},misclassifications=[];
  const start=performance.now();
  if(TAINT_CHALLENGE.length<50)throw Error('Insufficient challenge cases.');
  if(new Set(TAINT_CHALLENGE.map(x=>x.id)).size!==TAINT_CHALLENGE.length)
    throw Error('Duplicate case identifiers.');
  for(const tc of TAINT_CHALLENGE){
    const result=analyzeTaintedSql(tc.path,tc.content);
    if(result.status!=='complete') throw Error('Parser incomplete for '+tc.id);
    const found=result.findings.some(x=>x.ruleId==='tainted_sql_sink');
    const label=tc.expected?(found?'tp':'fn'):(found?'fp':'tn');
    totals[label]++;
    const cat=categories[tc.category]||=fresh();
    cat[label]++;
    if(label==='fn'||label==='fp')misclassifications.push({
      id:tc.id,category:tc.category,type:label,
      labelRationale:tc.rationale,
    });
  }
  return {title:'AgentShield taint challenge',schemaVersion:1,
    evaluation:'synthetic_curated_not_exploit_verified',cases:TAINT_CHALLENGE.length,
    results:rates(totals),categories:Object.fromEntries(
      Object.entries(categories).sort(([a],[b])=>a.localeCompare(b))
        .map(([name,counts])=>[name,rates(counts)])),
    misclassifications,elapsedMs:Math.round(performance.now()-start),
    runtime:process.version,platform:process.platform,
    caveat:'Selected source-to-sink patterns only; no cross-file path analysis, exploit confirmation or independent external projects.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.stdout.write(JSON.stringify(benchmarkTaint(),null,2)+'\n');}
  catch(error){process.stderr.write('Taint benchmark failed: '+error.message+'\n');process.exitCode=2;}
}
