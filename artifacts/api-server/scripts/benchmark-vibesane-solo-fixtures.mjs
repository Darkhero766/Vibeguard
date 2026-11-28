#!/usr/bin/env node
/**
 * Transparent, synthetic JS/TS/SQL scanner sanity fixtures.
 * Explicit known positive and negative author-created examples only.
 * NOT NIST/OWASP ground truth; NOT unbiased precision/recall;
 * NOT the 22-repository sealed source benchmark.
 */
import {pathToFileURL} from 'node:url';
import {loadScanner} from './collect-vibesane-public-evidence.mjs';

export const syntheticCases=[
  {id:'missing_sql_rls',class:'positive',rule:'rls',path:'supabase/migrations/001.sql',
    source:'create table public.orders (id uuid primary key);'},
  {id:'sql_rls_enabled',class:'negative',rule:'rls',path:'supabase/migrations/001.sql',
    source:'create table public.orders (id uuid primary key);\nalter table public.orders enable row level security;'},
  {id:'web_component_service_role',class:'positive',rule:'service_role_client',path:'src/components/Widget.tsx',
    source:'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;'},
  {id:'server_only_service_role',class:'negative',rule:'service_role_client',path:'src/server/db.ts',
    source:'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;'},
  {id:'unchecked_nextjs_mutation',class:'positive',rule:'unauthenticated_write',path:'app/api/orders/route.ts',
    source:"export async function POST() {\n await supabase.from('orders').insert([{paid:true}]);\n}"},
  {id:'checked_nextjs_mutation',class:'negative',rule:'unauthenticated_write',path:'app/api/orders/route.ts',
    source:"export async function POST() {\n const user = await requireAuth();\n if (!user) return new Response('Forbidden',{status:403});\n await supabase.from('orders').insert([{paid:true}]);\n}"},
  {id:'admin_password_math_random',class:'positive',rule:'weak_random',path:'src/accounts.js',
    source:"var users = [{name:'admin', password: Math.random().toString(32)}];"},
  {id:'animation_math_random',class:'negative',rule:'weak_random',path:'src/animation.js',
    source:'const angle = Math.random() * 360;'},
  {id:'committed_environment_file',class:'positive',rule:'committed_env_file',path:'.env',
    source:'SYNTHETIC_TEST_VALUE=placeholder_value_only'},
  {id:'placeholder_env_example',class:'negative',rule:'committed_env_file',path:'.env.example',
    source:'SYNTHETIC_TEST_VALUE=replace_with_your_own_value'},
];

export async function runSyntheticCaseBenchmark(scanner){
  scanner ??= await loadScanner();
  const results=[];
  for(const item of syntheticCases){
    const files=[{path:item.path,content:item.source}];
    const raw=[...scanner.scanApiFiles(files),...scanner.scanExtendedFilesV2(files)];
    const detected=raw.some(f=>f.check===item.rule&&f.filePath===item.path);
    const expected=item.class==='positive';
    results.push({id:item.id,rule:item.rule,expectDetected:expected,
      detected,passed:detected===expected});
  }
  const positives=results.filter(x=>x.expectDetected),negatives=results.filter(x=>!x.expectDetected);
  return{
    schemaVersion:1,
    benchmarkType:'AUTHOR_SYNTHETIC_TARGETED_RULE_REGRESSION_NOT_EXTERNAL_ACCURACY',
    engine:'api_core_plus_extended_v2',
    examples:results.length,
    positiveCases:positives.length,
    positiveCasesDetected:positives.filter(x=>x.detected).length,
    negativeCases:negatives.length,
    negativeCasesWithoutTargetedAlert:negatives.filter(x=>!x.detected).length,
    passed:results.every(x=>x.passed),
    externalGroundTruth:false,realWorldPrecision:null,realWorldRecall:null,
    sourceCodeExecuted:false,
    results,
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await runSyntheticCaseBenchmark();
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(!result.passed)process.exitCode=1;
  }catch(error){
    process.stderr.write('Synthetic scanner benchmark failed: '+error.message+'\n');
    process.exitCode=1;
  }
}
