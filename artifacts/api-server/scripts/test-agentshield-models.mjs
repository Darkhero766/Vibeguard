import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MODEL_CATALOG,parseModelBenchmarkArgs,buildProviderRequest,validatePredictions,calculateMetrics,runModelEvaluation} from './benchmark-agentshield-models.mjs';
const cases=[
 {id:'synthetic-risk',category:'jwt',ruleId:'hardcoded_jwt_secret',content:'const JWT_'+'SECRET = "FAKE_SYNTHETIC";',expected:true},
 {id:'synthetic-control',category:'jwt',ruleId:'hardcoded_jwt_secret',content:'const JWT_SECRET = process.env.JWT_SECRET;',expected:false},
];
const predictions={predictions:[
 {caseId:'synthetic-risk',findingPresent:true,confidence:0.95,rationale:'Literal assignment.'},
 {caseId:'synthetic-control',findingPresent:false,confidence:0.98,rationale:'Environment-backed.'},
]};
const response=(provider)=>{const txt=JSON.stringify(predictions);if(provider==='openai')return {output:[{content:[{type:'output_text',text:txt}]}],usage:{input_tokens:88,output_tokens:20}};if(provider==='anthropic')return {content:[{type:'text',text:txt}],usage:{input_tokens:88,output_tokens:20}};return {candidates:[{content:{parts:[{text:txt}]}}],usageMetadata:{promptTokenCount:88,candidatesTokenCount:20}};};
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});

test('dry run never calls a model without explicit --live',async()=>{
 let calls=0;const r=await runModelEvaluation({cases,models:MODEL_CATALOG,live:false,apiKeys:{OPENAI_API_KEY:'fake'},fetchFn:async()=>{calls++;throw Error('no');}});
 assert.equal(calls,0);assert.equal(r.results.length,6);assert.ok(r.results.every(x=>x.status==='not_run'));assert.equal(r.safety.sourceRepositoryDataSent,false);
});
test('CLI accepts only catalogued model keys and explicit live flag',()=>{
 assert.equal(parseModelBenchmarkArgs([]).live,false);
 assert.equal(parseModelBenchmarkArgs(['--live','--model','openai:sol']).live,true);
 assert.throws(()=>parseModelBenchmarkArgs(['--model','custom/secret']));
 assert.throws(()=>parseModelBenchmarkArgs(['--model','openai:sol','--model','openai:sol']));
 assert.throws(()=>parseModelBenchmarkArgs(['--timeout-ms','1']));
});
test('provider requests use provider-specific headers and include only unlabeled synthetic snippets',()=>{
 const openai=buildProviderRequest(MODEL_CATALOG[1],cases,'FAKE_KEY');const body=JSON.parse(openai.init.body);
 assert.equal(openai.url,'https://api.openai.com/v1/responses');assert.match(openai.init.headers.Authorization,/^Bearer/);
 const modelInput=JSON.stringify(body.input);assert.match(modelInput,/FAKE_SYNTHETIC/);assert.doesNotMatch(modelInput,/"expected":\s*(true|false)/);
 const anth=buildProviderRequest(MODEL_CATALOG[2],cases,'FAKE_KEY');assert.equal(anth.init.headers['x-api-key'],'FAKE_KEY');assert.doesNotMatch(anth.url,/FAKE_KEY/);
 const google=buildProviderRequest(MODEL_CATALOG[4],cases,'FAKE_KEY');assert.equal(google.init.headers['x-goog-api-key'],'FAKE_KEY');assert.doesNotMatch(google.url,/FAKE_KEY/);
 assert.equal(MODEL_CATALOG[4].model,'gemini-2.5-flash-lite');
 assert.equal(MODEL_CATALOG[4].input,0.10);assert.equal(MODEL_CATALOG[4].output,0.40);
 assert.equal(MODEL_CATALOG[5].model,'gemini-4-argon');
});
test('model output must contain every known case once with strict types',()=>{
 assert.equal(validatePredictions(predictions,cases).length,2);
 assert.throws(()=>validatePredictions({predictions:[predictions.predictions[0]]},cases),/prediction_count_mismatch/);
 assert.throws(()=>validatePredictions({predictions:[...predictions.predictions,predictions.predictions[0]]},cases),/prediction_count_mismatch/);
 assert.throws(()=>validatePredictions({predictions:[{...predictions.predictions[0],caseId:'fake'},predictions.predictions[1]]},cases),/unknown_case_id/);
 assert.throws(()=>validatePredictions({predictions:[{...predictions.predictions[0],confidence:2},predictions.predictions[1]]},cases),/invalid_confidence/);
});
test('metrics return confusion matrix, precision, recall, specificity, F1 and high-confidence errors',()=>{
 const perfect=calculateMetrics(cases,validatePredictions(predictions,cases));assert.equal(perfect.overall.f1,1);assert.equal(perfect.overall.precision,1);assert.equal(perfect.overall.recall,1);
 const wrong=validatePredictions({predictions:[{...predictions.predictions[0],findingPresent:false},{...predictions.predictions[1],findingPresent:true}]},cases);
 const result=calculateMetrics(cases,wrong);assert.equal(result.overall.fp,1);assert.equal(result.overall.fn,1);assert.equal(result.highConfidenceErrors,2);
});
test('OpenAI, Anthropic and Google adapters normalize to the same metrics',async()=>{
 const tuples=[[MODEL_CATALOG[1],'OPENAI_API_KEY'],[MODEL_CATALOG[2],'ANTHROPIC_API_KEY'],[MODEL_CATALOG[4],'GEMINI_API_KEY']];
 for(const [model,env] of tuples){
  let called='';const r=await runModelEvaluation({cases,models:[model],apiKeys:{[env]:'FAKE_API_KEY'},live:true,
   fetchFn:async(url)=>{called=String(url);return json(response(model.provider));}});
  assert.equal(r.results[0].status,'complete');assert.equal(r.results[0].metrics.overall.accuracy,1);assert.equal(r.results[0].inputTokens,88);assert.equal(r.results[0].outputTokens,20);
  assert.ok(!JSON.stringify(r).includes('FAKE_API_KEY'));assert.ok(called.includes(model.provider==='google'?'generateContent':model.provider==='openai'?'/responses':'/messages'));
 }
});

test('expired model pricing is skipped so estimates do not silently become stale',async()=>{
 const model=MODEL_CATALOG.find(x=>x.key==='google:argon');
 let calls=0;
 const report=await runModelEvaluation({cases,models:[model],apiKeys:{GEMINI_API_KEY:'FAKE_API_KEY'},live:true,
  now:new Date('2026-12-01T00:00:00Z'),fetchFn:async()=>{calls++;throw Error('should not call after price expiry');}});
 assert.equal(calls,0);
 assert.equal(report.results[0].status,'skipped');
 assert.equal(report.results[0].reason,'pricing_verification_expired');
});

test('API errors are safely categorized and never echo secrets or provider bodies',async()=>{
 const r=await runModelEvaluation({cases,models:[MODEL_CATALOG[0]],apiKeys:{OPENAI_API_KEY:'FAKE_SECRET'},live:true,fetchFn:async()=>new Response('provider echoed FAKE_SECRET',{status:401})});
 assert.equal(r.results[0].status,'failed');assert.equal(r.results[0].reason,'provider_http_401');assert.doesNotMatch(JSON.stringify(r),/FAKE_SECRET|provider echoed/);
});
test('missing provider key skips provider without making a request',async()=>{
 let called=0;const r=await runModelEvaluation({cases,models:[MODEL_CATALOG[0]],apiKeys:{},live:true,fetchFn:async()=>{called++;}});
 assert.equal(called,0);assert.equal(r.results[0].reason,'api_key_not_configured');
});

test('expired model pricing is skipped so estimates do not silently become stale',async()=>{
 const model=MODEL_CATALOG.find(x=>x.key==='google:argon');
 let calls=0;
 const report=await runModelEvaluation({cases,models:[model],apiKeys:{GEMINI_API_KEY:'FAKE_API_KEY'},live:true,
  now:new Date('2026-12-01T00:00:00Z'),fetchFn:async()=>{calls++;throw Error('should not call after price expiry');}});
 assert.equal(calls,0);
 assert.equal(report.results[0].status,'skipped');
 assert.equal(report.results[0].reason,'pricing_verification_expired');
});
