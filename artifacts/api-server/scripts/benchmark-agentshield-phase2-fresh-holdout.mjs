#!/usr/bin/env node
// Separate, first-time adversarial synthetic evaluation. Never tune detectors
// against these cases and then call the same file an untouched holdout.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyzeCrossFileSqlFlows } from './agentshield-crossfile.mjs';
import { analyzeNextRouteAuth } from './agentshield-route-auth.mjs';
const inputPath = fileURLToPath(new URL('./agentshield-phase2-fresh-holdout.json', import.meta.url));
const raw = readFileSync(inputPath);
const data = JSON.parse(raw.toString('utf8'));
const totals = () => ({tp:0,tn:0,fp:0,fn:0,incomplete:0});
const rate = c => ({...c,precision: c.tp+c.fp ? c.tp/(c.tp+c.fp) : null,
 recall: c.tp+c.fn ? c.tp/(c.tp+c.fn) : null,
 falsePositiveRate: c.fp+c.tn ? c.fp/(c.fp+c.tn) : null});
const all = totals(), byCategory = {};
const misses = [], seen = new Set();
for (const c of data.cases) {
 if (seen.has(c.id)) throw Error('Duplicate case '+c.id);
 seen.add(c.id);
 const cat = byCategory[c.category] ||= totals();
 let r;
 try { r = c.category === 'cross_file' ? analyzeCrossFileSqlFlows(c.files) :
  c.category === 'nextjs_auth' ? analyzeNextRouteAuth(c.path,c.content) :
  (()=>{throw Error('Unsupported category '+c.category)})(); }
 catch (e) { all.incomplete++;cat.incomplete++;misses.push({id:c.id,result:'incomplete',reason:String(e.message).slice(0,160)});continue; }
 if (r.status !== 'complete') {all.incomplete++;cat.incomplete++;misses.push({id:c.id,result:'incomplete',status:r.status});continue;}
 const rule = c.category==='cross_file' ? 'cross_file_tainted_sql':'nextjs_mutation_auth_unverified';
 const detected = r.findings.some(f=>f.ruleId===rule);
 const outcome = c.expected ? (detected?'tp':'fn') : (detected?'fp':'tn');
 all[outcome]++;cat[outcome]++;
 if(outcome==='fp'||outcome==='fn') misses.push({id:c.id,result:outcome,category:c.category});
}
const report={
 status:all.incomplete?'incomplete':'measured',
 datasetSha256:createHash('sha256').update(raw).digest('hex'),
 metadata:data.metadata,
 totalCases:data.cases.length,
 overall:rate(all),
 categories:Object.fromEntries(Object.entries(byCategory).map(([k,c])=>[k,rate(c)])),
 misses,
 warning:'AI-authored synthetic examples only. Not externally sourced, independently labeled, verified vulnerable, or representative of real codebases. This is a first-pass stress check; future tuning invalidates holdout status.'
};
process.stdout.write(JSON.stringify(report,null,2)+'\n');
// Informational accuracy results. Fail only when input/parser execution is incomplete.
if(all.incomplete) process.exitCode=2;
