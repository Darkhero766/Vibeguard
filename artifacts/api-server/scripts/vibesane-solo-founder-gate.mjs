#!/usr/bin/env node
/**
 * Solo-founder INTERNAL beta evidence gate.
 * No independent accuracy certification, exploit verification, or permission
 * to deploy/merge/modify production. AI suggestions are not human decisions.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {findingKey, scoreEvidence, validateManifest} from './vibesane-benchmark-evidence.mjs';

const SHA=/^[a-f0-9]{40}$/i;
const DECISIONS=new Set(['likely_true_positive','likely_false_positive','uncertain','duplicate']);
const CHECK_IDS=['regression_fixtures','independent_comparator','hosted_staging_e2e','phase1_operational_safety'];
const fail=s=>{throw Error(s)};
const check=(yes,msg)=>{if(!yes)fail(msg)};
const projectKey=p=>p.repo.toLowerCase()+'@'+p.commit.toLowerCase();
const alertKey=(p,f)=>projectKey(p)+':'+findingKey(f);
const validText=(s,min=20,max=1500)=>typeof s==='string'&&s.trim().length>=min&&s.length<=max;

function reviewIndex(review,manifestProjects){
  if(review==null)return{indexed:new Map(),signed:false};
  check(review.schemaVersion===1&&review.documentType==='SOLO_FOUNDER_SOURCE_TRIAGE','Invalid founder review document type');
  check(Array.isArray(review.projects),'Review projects must be an array');
  const expected=new Set(manifestProjects.map(projectKey)), declared=new Set(), indexed=new Map();
  for(const p of review.projects){
    const id=projectKey(p);
    check(expected.has(id)&&!declared.has(id),'Unlisted or duplicate review project: '+id);
    declared.add(id);
    check(Array.isArray(p.assessments),'Assessments must be an array');
    for(const a of p.assessments){
      const key=alertKey(p,a);
      check(!indexed.has(key),'Duplicate founder assessment: '+key);
      check(DECISIONS.has(a.decision),'Unsupported founder decision: '+key);
      check(validText(a.rationale),'Founder assessment requires a contextual 20-character rationale: '+key);
      check(Array.isArray(a.evidenceUrls)&&a.evidenceUrls.length>0&&a.evidenceUrls.length<=12&&
        a.evidenceUrls.every(u=>typeof u==='string'&&
          /^https:\/\/(?:github\.com|codeql\.github\.com|semgrep\.dev|owasp\.org|samate\.nist\.gov)\//.test(u)&&u.length<=1500),
        'Assessment requires source/evidence URL: '+key);
      if(a.decision==='duplicate')
        check(a.duplicateOf&&typeof a.duplicateOf.ruleId==='string'&&
          typeof a.duplicateOf.filePath==='string'&&Number.isSafeInteger(a.duplicateOf.line),
          'Duplicate must reference an observed original alert: '+key);
      indexed.set(key,a);
    }
  }
  const v=review.reviewer??{};
  const signed=v.kind==='solo_founder'&&validText(v.id,3,100)&&v.ownerAttestation===true&&
    typeof v.signedAt==='string'&&/^\d{4}-\d\d-\d\dT/.test(v.signedAt)&&
    Number.isFinite(Date.parse(v.signedAt));
  if(indexed.size)check(signed,'Founder assessments require personally signed owner attestation');
  return{indexed,signed:!!signed};
}

function validateCheckEvidence(evidence){
  if(evidence==null)return new Map();
  check(evidence.schemaVersion===1&&evidence.documentType==='SOLO_FOUNDER_BETA_CHECKS',
    'Invalid beta checklist document type');
  check(Array.isArray(evidence.checks),'Beta checks must be an array');
  const found=new Map();
  for(const item of evidence.checks){
    check(CHECK_IDS.includes(item.id)&&!found.has(item.id),'Unknown or duplicate beta checklist ID');
    check(['pending','passed','failed','waived'].includes(item.status),'Invalid beta checklist status');
    if(item.status==='passed'){
      check(validText(item.evidence,20),'Passed check requires reproducible evidence');
      check(SHA.test(item.commit||''),'Passed check requires pinned code SHA');
      check(typeof item.evidenceUrl==='string'&&
        /^https:\/\/(?:github\.com|dashboard\.render\.com|supabase\.com)\//.test(item.evidenceUrl),
        'Passed check requires provider/CI evidence URL');
    }
    found.set(item.id,item);
  }
  return found;
}

export function assessSoloFounderGate(manifest,scans,review=null,evidence=null){
  validateManifest(manifest);
  const baseline=scoreEvidence(manifest,scans,{schemaVersion:1,projects:[]});
  const complete=baseline.projects.length===manifest.projects.length&&
    baseline.projects.every(p=>p.status==='complete')&&scans.projects.length===manifest.projects.length;
  const blockedBy=[];
  if(!complete)blockedBy.push('All immutable source subsets must be completely scanned');
  const engines=new Set(scans.projects.map(p=>p.engine));
  const rulesets=new Set(scans.projects.map(p=>p.rulesetCommit?.toLowerCase()));
  if(engines.size!==1||!engines.has('api_core_plus_extended_v2'))
    blockedBy.push('Require pinned API-core plus Extended V2 scanner engine');
  if(rulesets.size!==1||!SHA.test([...rulesets][0]||''))
    blockedBy.push('Require one immutable ruleset SHA');
  const {indexed,signed}=reviewIndex(review,manifest.projects);
  const seen=new Map();
  const counts={likely_true_positive:0,likely_false_positive:0,uncertain:0,duplicate:0,unreviewed:0};
  let highCriticalUncertain=0,highCriticalLikelyFalsePositive=0;
  for(const p of scans.projects)for(const f of p.findings||[]){
    const key=alertKey(p,f);
    check(!seen.has(key),'Duplicate scanned alert: '+key);
    seen.set(key,f);
    const decision=indexed.get(key)?.decision;
    if(!decision){counts.unreviewed++;continue}
    counts[decision]++;
    if(['High','Critical'].includes(f.severity)){
      if(decision==='uncertain')highCriticalUncertain++;
      if(decision==='likely_false_positive')highCriticalLikelyFalsePositive++;
    }
  }
  for(const [key,a] of indexed){
    check(seen.has(key),'Founder review references nonexistent scan alert: '+key);
    if(a.decision==='duplicate'){
      const pid=key.slice(0,key.lastIndexOf(':'));
      const referenced=pid+':'+findingKey(a.duplicateOf);
      check(referenced!==key&&seen.has(referenced),
        'Duplicate requires different observed alert in same project: '+key);
      check(indexed.get(referenced)?.decision!=='duplicate',
        'Duplicate chains cannot hide pending review: '+key);
    }
  }
  if(!signed)blockedBy.push('Founder-signed human decisions required; AI suggestions are not verdicts');
  if(counts.unreviewed)blockedBy.push(counts.unreviewed+' alerts still need contextual founder decisions');
  if(highCriticalUncertain)blockedBy.push(highCriticalUncertain+' High/Critical findings remain uncertain');
  const checkMap=validateCheckEvidence(evidence), verification={};
  for(const id of CHECK_IDS){
    const item=checkMap.get(id);
    verification[id]=item?.status??'pending';
    if(!item||item.status!=='passed')
      blockedBy.push('Missing passed and evidenced beta prerequisite: '+id);
  }
  const ready=blockedBy.length===0;
  return{
    schemaVersion:1,
    documentType:'INTERNAL_SOLO_FOUNDER_BETA_EVIDENCE_NOT_INDEPENDENT_CERTIFICATION',
    reviewStatus:ready?'candidate_for_owner_beta_decision':'blocked',
    founderReviewComplete:signed&&counts.unreviewed===0,
    alertCounts:{total:seen.size,...counts,highCriticalUncertain,highCriticalLikelyFalsePositive},
    scope:{projects:manifest.projects.length,
      scannedFiles:scans.projects.reduce((n,p)=>n+(p.filesScanned||0),0),
      scannerSHA:rulesets.size===1?[...rulesets][0]:null,
      engine:engines.size===1?[...engines][0]:null},
    verification,blockedBy,
    precision:null,recall:null,independentAccuracyCertified:false,
    confirmedVulnerabilities:null,productionReleaseAuthorized:false,
    automaticBetaDeploymentAuthorized:false,
    notes:[
      'Solo-founder review is an internal judgment, not independent professional security assessment.',
      'Likely true/false reviews and AI suggestions are not certified ground truth or precision/recall.',
      'External repository subsets do not establish whole-application coverage.',
      'Passing this gate does not authorize secrets, production SQL, billing, merge or deployment.'
    ]
  };
}

function main(argv){
  const allowed=new Set(['--manifest','--scans','--review','--checks']);
  check(argv.length>=4&&argv.length%2===0,
    'Usage: --manifest JSON --scans JSON [--review JSON] [--checks JSON]');
  const opts=new Map();
  for(let i=0;i<argv.length;i+=2){
    check(allowed.has(argv[i])&&!opts.has(argv[i])&&argv[i+1],'Invalid or duplicate CLI argument');
    opts.set(argv[i],argv[i+1]);
  }
  check(opts.has('--manifest')&&opts.has('--scans'),'Manifest and scans required');
  const load=k=>opts.has(k)?JSON.parse(readFileSync(opts.get(k),'utf8')):null;
  const result=assessSoloFounderGate(load('--manifest'),load('--scans'),
    load('--review'),load('--checks'));
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result.reviewStatus!=='candidate_for_owner_beta_decision')process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main(process.argv.slice(2))}catch(error){
    process.stderr.write('Solo-founder beta evidence rejected: '+error.message+'\n');
    process.exitCode=1;
  }
}
