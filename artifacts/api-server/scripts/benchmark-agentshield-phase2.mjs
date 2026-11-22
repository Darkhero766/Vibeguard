#!/usr/bin/env node
// First-pass synthetic Phase 2 evaluation; not real-world accuracy or exploit proof.
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { PHASE2_CHALLENGE } from './agentshield-phase2-challenge.mjs';
import { analyzeCrossFileSqlFlows } from './agentshield-crossfile.mjs';
import { analyzeNextRouteAuth } from './agentshield-route-auth.mjs';
const zero=()=>({tp:0,tn:0,fp:0,fn:0});
const rates=c=>({...c,total:c.tp+c.tn+c.fp+c.fn,
  precision:c.tp+c.fp?c.tp/(c.tp+c.fp):null,
  recall:c.tp+c.fn?c.tp/(c.tp+c.fn):null,
  falsePositiveRate:c.fp+c.tn?c.fp/(c.fp+c.tn):null,
});
export function benchmarkPhase2(){
 const count=PHASE2_CHALLENGE.length,seen=new Set(),byCat={},total=zero(),misses=[];
 const start=performance.now();
 for(const c of PHASE2_CHALLENGE){
  if(seen.has(c.id))throw Error('Duplicate case ID');
  seen.add(c.id);
  const result=c.category==='cross_file'?
    analyzeCrossFileSqlFlows(c.files):analyzeNextRouteAuth(c.path,c.content);
  if(result.status!=='complete')throw Error('Challenge case parser incomplete: '+c.id);
  const rule=c.category==='cross_file'?'cross_file_tainted_sql':'nextjs_mutation_auth_unverified';
  const found=result.findings.some(f=>f.ruleId===rule);
  const label=c.expected?(found?'tp':'fn'):(found?'fp':'tn');
  total[label]++;
  const category=byCat[c.category]||=zero();
  category[label]++;
  if(label==='fn'||label==='fp')misses.push({id:c.id,type:label,category:c.category});
 }
 return {status:'measured',cases:count,overall:rates(total),
  byCategory:Object.fromEntries(Object.entries(byCat).map(([k,v])=>[k,rates(v)])),
  misses,elapsedMs:Math.round(performance.now()-start),
  evidence:'first_pass_synthetic_not_exploit_verified',
  caveat:'Tuned rule unit tests exist separately; these are selected synthetic scenarios, not untouched real applications or statistically representative code.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(benchmarkPhase2(),null,2)+'\n');}
 catch(e){process.stderr.write('Phase 2 evaluation incomplete: '+e.message+'\n');process.exitCode=2;}
}
