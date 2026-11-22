#!/usr/bin/env node
/**
 * Frozen external benchmark: VibeSane's source-only core + Extended V2 rules,
 * on eight independently annotated, pinned RealVuln 3.0 Next.js targets.
 * No execution, installs, builds, or exposure of source snippets/credentials.
 * Unmatched alerts are NOT assumed false positives: this dataset lacks TS/JS FP traps.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {loadScanner} from './collect-vibesane-public-evidence.mjs';

const SHA=/^[a-f0-9]{40}$/i;
const GITHUB='https://api.github.com/repos/';
const fail=msg=>{throw Error(msg)};
const ensure=(condition,msg)=>{if(!condition)fail(msg)};
const validPath=p=>typeof p==='string'&&p.length>0&&!p.startsWith('/')&&!p.includes('\\')&&
  p.split('/').every(part=>part!==''&&part!=='.'&&part!=='..');
const key=(repo,p)=>GITHUB+repo+'/contents/'+p.split('/').map(encodeURIComponent).join('/');
const authHeaders=()=>({
  Accept:'application/vnd.github+json',
  'User-Agent':'VibeSane-pinned-external-ground-truth-evaluation',
  ...(process.env.GITHUB_TOKEN?{Authorization:'Bearer '+process.env.GITHUB_TOKEN}:{})
});
async function getJson(url){
  const r=await fetch(url,{headers:authHeaders(),signal:AbortSignal.timeout(30_000)});
  ensure(r.ok,'Pinned source metadata unavailable HTTP '+r.status);
  return r.json();
}
async function readPinnedFile(repo,p,commit,maxBytes){
  const j=await getJson(key(repo,p)+'?ref='+commit);
  ensure(j.type==='file'&&j.encoding==='base64'&&typeof j.content==='string',
    'Refuse incomplete or non-file content: '+p);
  const bytes=Buffer.from(j.content.replace(/\s/g,''),'base64');
  ensure(bytes.length>0&&bytes.length<=maxBytes,'Source size outside budget: '+p);
  return bytes.toString('utf8');
}
async function verifyPublicLicense(repo,expected){
  const j=await getJson(GITHUB+repo);
  ensure(j.private===false&&j.full_name?.toLowerCase()===repo.toLowerCase()&&
    j.license?.spdx_id===expected,'Source not confirmed public and approved license: '+repo);
}
export function scoreExternallyLabeledSubset(spec,groundTruth,scans){
  ensure(spec.schemaVersion===1&&spec.documentType==='REALVULN3_FROZEN_EXTERNAL_LABEL_SUBSET',
    'Unexpected externally labeled benchmark specification');
  ensure(Array.isArray(spec.targets)&&spec.targets.length===8,'Frozen target selection is exactly eight');
  ensure(groundTruth.commit_sha?.toLowerCase()===spec.sourceCommit.toLowerCase(),
    'Ground truth does not match immutable source commit');
  ensure(groundTruth.benchmark_version==='3.0.0','Unexpected benchmark version');
  const ids=new Set(),output=[];
  for(const target of spec.targets){
    ensure(!ids.has(target.id),'Duplicate frozen target: '+target.id);ids.add(target.id);
    ensure(validPath(target.filePath)&&Array.isArray(target.expectedRules)&&target.expectedRules.length>0,
      'Invalid frozen path or explicit rule-family mapping');
    const gt=groundTruth.findings?.find(f=>f.id===target.id);
    ensure(gt?.is_vulnerable===true&&gt.scoring!=='non_scoring'&&
      gt.evidence?.source==='manual_review'&&gt.file===target.filePath&&
      Number.isSafeInteger(gt.location?.start_line)&&gt.location.start_line>0,
      'Missing/altered independent source label: '+target.id);
    const first=gt.location.start_line, last=gt.location.end_line||first;
    const matched=(scans||[]).filter(f=>f.filePath===target.filePath&&
      target.expectedRules.includes(f.check)&&
      Number.isSafeInteger(f.line)&&f.line>=Math.max(1,first-3)&&f.line<=last+3);
    output.push({
      id:target.id,repo:spec.sourceRepository,commit:spec.sourceCommit,
      filePath:target.filePath,expectedCwe:gt.primary_cwe,
      expectedCategory:gt.vulnerability_class,startLine:first,endLine:last,
      mappedRules:target.expectedRules,hit:matched.length>0,
      matchingScannerRules:[...new Set(matched.map(m=>m.check))],
      evidenceType:'EXTERNALLY_MANUAL_REVIEWED_LABEL_NOT_INDEPENDENT_PRODUCT_AUDIT',
    });
  }
  const hits=output.filter(x=>x.hit).length;
  return{
    schemaVersion:1,
    documentType:'PINNED_EXTERNAL_NEXTJS_SUPPORTED_RULES_BASELINE_NOT_GENERAL_ACCURACY',
    benchmarkSource:'RealVuln 3.0.0',
    targetRepository:spec.sourceRepository,sourceCommit:spec.sourceCommit,
    sourcePaths:[...new Set(output.map(x=>x.filePath))],
    frozenLabeledTargets:output.length,
    detectedTargets:hits,missedTargets:output.length-hits,
    scopedLabeledCaseHitRate:hits/output.length,
    realWorldRecall:null,realWorldPrecision:null,representativeSample:false,
    externalGroundTruthHumanReviewed:true,reviewerQualificationsIndependentlyVerified:false,
    unsupportedCwesExcludedFromDenominator:true,
    falsePositiveTrapCoverage:0,falsePositiveRate:null,
    executionOfPublicRepoCode:false,
    noTuningOnThisDatasetBeforeBaseline:true,
    results:output,
    limitations:[
      'Only selected targets of supported rule families: not random, comprehensive or whole-app recall.',
      'A line/rule match is a scanner alert not proof of exploitation or severity.',
      'Other scanner alerts are not false positives; TS/JS dataset has no FP traps.',
      'Source-only API-core and Extended V2 is not full hosted-product or AST/taint parity.'
    ]
  };
}
export async function run(manifestPath,outputPath){
  const spec=JSON.parse(readFileSync(manifestPath,'utf8'));
  ensure(spec.targets?.length===8&&
    SHA.test(spec.benchmarkCommit||'')&&SHA.test(spec.sourceCommit||'')&&
    spec.benchmarkRepository==='kolega-ai/Real-Vuln-Benchmark'&&
    spec.sourceRepository==='kolega-ai-dev/realvuln-oss-oopssec-store'&&
    spec.groundTruthLicense==='Apache-2.0'&&spec.sourceLicense==='MIT',
    'Refuse unpinned or unapproved external benchmark');
  await Promise.all([
    verifyPublicLicense(spec.benchmarkRepository,spec.groundTruthLicense),
    verifyPublicLicense(spec.sourceRepository,spec.sourceLicense)
  ]);
  const gt=JSON.parse(await readPinnedFile(spec.benchmarkRepository,
    spec.groundTruthPath,spec.benchmarkCommit,100_000));
  const paths=[...new Set(spec.targets.map(t=>t.filePath))];
  const sources=await Promise.all(paths.map(async p=>{
    ensure(validPath(p),'Invalid requested external file path');
    return {path:p,content:await readPinnedFile(spec.sourceRepository,p,spec.sourceCommit,300_000)};
  }));
  const scanner=await loadScanner();
  const findings=[...scanner.scanApiFiles(sources),...scanner.scanExtendedFilesV2(sources)];
  const out=scoreExternallyLabeledSubset(spec,gt,findings);
  const mode=process.env.VIBESANE_EVALUATION_MODE||'initial_frozen_baseline';
  ensure(['initial_frozen_baseline','post_tuning_diagnostic'].includes(mode),
    'Unsupported evaluation mode');
  out.evaluationMode=mode;
  out.noTuningOnThisDatasetBeforeBaseline=mode==='initial_frozen_baseline';
  if(mode==='post_tuning_diagnostic')out.limitations.push(
    'This corpus was used to implement and test scanner fixes, so the post-fix result is contaminated development regression evidence, not an independent holdout.');
  out.engine='api_core_plus_extended_v2';
  out.scannerCommit=process.env.VIBESANE_RULESET_SHA||'';
  ensure(SHA.test(out.scannerCommit),'Set VIBESANE_RULESET_SHA to scanner commit SHA');
  out.filesScanned=sources.length;
  out.totalFindingsFromScanner=findings.length;
  writeFileSync(outputPath,JSON.stringify(out,null,2)+'\n',{flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({
    benchmark:out.benchmarkSource,files:out.filesScanned,
    targets:out.frozenLabeledTargets,hit:out.detectedTargets,missed:out.missedTargets,
    falsePositiveRate:null,externalCodeExecuted:false})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==4)fail('Usage: --manifest-path --output-path');
  run(process.argv[2],process.argv[3]).catch(e=>{
    process.stderr.write('External benchmark failed: '+e.message+'\n');process.exitCode=1;
  });
}
