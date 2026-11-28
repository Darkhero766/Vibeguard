#!/usr/bin/env node
// Synthetic Phase 2 parser throughput only, not full CLI/network scanner latency.
// RSS is this process after analyses, not a maximum combined process RSS figure.
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {analyzeCrossFileSqlFlows} from './agentshield-crossfile.mjs';
import {analyzeNextRouteAuth} from './agentshield-route-auth.mjs';
import {analyzeSupabasePolicies} from './agentshield-supabase-policy.mjs';

export function measurePhase2(){
 const files=[];
 for(let i=0;i<100;i++){
  const content=i%10===0?
    'export function lookup(id){const sql="SELECT id FROM users WHERE id="+id;db.query(sql);}':
    'export function lookup'+i+'(id){return Number(id)+1;}';
  files.push({path:'src/module'+i+'.ts',content});
 }
 const start=performance.now();
 const cross=analyzeCrossFileSqlFlows(files);
 const crossMs=performance.now()-start;
 const routeSamples=Array.from({length:50},(_,i)=>
  'export async function POST(){const user=await getServerSession();if(!user)return;db.from("orders").insert({id:'+i+'});}');
 const authStart=performance.now();
 const routes=routeSamples.map((s,i)=>analyzeNextRouteAuth('app/api/v'+i+'/route.ts',s));
 const authMs=performance.now()-authStart;
 const sqlStart=performance.now();
 const policies=Array.from({length:50},(_,i)=>analyzeSupabasePolicies('supabase/migrations/'+i+'.sql',
   'CREATE POLICY owner ON public.orders FOR UPDATE TO authenticated USING (auth.uid() = owner) WITH CHECK (auth.uid() = owner);'));
 const sqlMs=performance.now()-sqlStart;
 if(cross.status!=='complete'||routes.some(r=>r.status!=='complete')||
    policies.some(r=>r.status!=='complete'))throw Error('Parser benchmark incomplete');
 return {status:'measured',jsTsFiles:100,routeHandlers:50,sqlFiles:50,
  crossFileMs:Math.round(crossMs*100)/100,
  nextRouteAuthMs:Math.round(authMs*100)/100,
  sqlPoliciesMs:Math.round(sqlMs*100)/100,
  processRssMiB:Math.round(process.memoryUsage().rss/(1024*1024)),
  platform:process.platform,node:process.version,
  caveat:'Warm synthetic parsing only; not a developer project, install time, peak memory of CLI+worker, or correctness benchmark.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.stdout.write(JSON.stringify(measurePhase2(),null,2)+'\n');}
 catch(e){process.stderr.write('Performance measurement incomplete: '+e.message+'\n');process.exitCode=2;}
}
