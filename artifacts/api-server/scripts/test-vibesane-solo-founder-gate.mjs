import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessSoloFounderGate} from './vibesane-solo-founder-gate.mjs';

const A='a'.repeat(40), B='b'.repeat(40), ENGINE='api_core_plus_extended_v2';
const manifest={schemaVersion:1,projects:[
  {repo:'example/alpha',commit:A,license:'MIT',sourceType:'unlabeled_general',
    coverageMode:'bounded_subset',paths:['src/route.ts','supabase/migration.sql']},
  {repo:'example/beta',commit:B,license:'Apache-2.0',sourceType:'unlabeled_general',
    coverageMode:'bounded_subset',paths:['src/client.tsx']}
]};
const findings=[
  {ruleId:'unauthenticated_write',filePath:'src/route.ts',line:3,severity:'High'},
  {ruleId:'rls',filePath:'supabase/migration.sql',line:1,severity:'Critical'},
  {ruleId:'service_role_client',filePath:'src/client.tsx',line:7,severity:'Critical'},
];
const scans={schemaVersion:1,projects:[
  {repo:'example/alpha',commit:A,rulesetCommit:B,status:'complete',engine:ENGINE,
    filesScanned:2,scannedFiles:['src/route.ts','supabase/migration.sql'],
    durationMs:42,coverage:{complete:true},findings:findings.slice(0,2)},
  {repo:'example/beta',commit:B,rulesetCommit:B,status:'complete',engine:ENGINE,
    filesScanned:1,scannedFiles:['src/client.tsx'],
    durationMs:30,coverage:{complete:true},findings:findings.slice(2)},
]};
const evidence={schemaVersion:1,documentType:'SOLO_FOUNDER_BETA_CHECKS',
  checks:['regression_fixtures','independent_comparator',
    'hosted_staging_e2e','phase1_operational_safety'].map(id=>({
    id,status:'passed',commit:B,
    evidence:'Documented reproducible isolated test result for '+id,
    evidenceUrl:'https://github.com/example/alpha/actions/runs/123',
  }))};
const attestation={kind:'solo_founder',id:'founder-manual-signature',
  ownerAttestation:true,signedAt:'2026-11-21T11:45:00+05:30'};
const source=(repo,sha,f)=>'https://github.com/'+repo+'/blob/'+sha+'/'+f.filePath+'#L'+f.line;
const reviewFor=(f,decision,repo,sha)=>({
  ruleId:f.ruleId,filePath:f.filePath,line:f.line,decision,
  rationale:'Personally read the exact pinned source and nearby security controls for this case.',
  evidenceUrls:[source(repo,sha,f)],
});
const completeReview=()=>({schemaVersion:1,documentType:'SOLO_FOUNDER_SOURCE_TRIAGE',
  reviewer:{...attestation},projects:[
    {repo:'example/alpha',commit:A,assessments:[
      reviewFor(findings[0],'likely_true_positive','example/alpha',A),
      reviewFor(findings[1],'likely_false_positive','example/alpha',A)]},
    {repo:'example/beta',commit:B,assessments:[
      reviewFor(findings[2],'likely_true_positive','example/beta',B)]},
  ],
});

test('unreviewed current-source alerts do NOT magically pass founder beta gate',()=>{
  const r=assessSoloFounderGate(manifest,scans);
  assert.equal(r.alertCounts.total,3);
  assert.equal(r.alertCounts.unreviewed,3);
  assert.equal(r.scope.scannedFiles,3);
  assert.equal(r.reviewStatus,'blocked');
  assert.equal(r.precision,null);
  assert.equal(r.recall,null);
  assert.equal(r.independentAccuracyCertified,false);
  assert.equal(r.productionReleaseAuthorized,false);
});

test('personal, evidenced solo review + prerequisite evidence creates only an internal candidate',()=>{
  const r=assessSoloFounderGate(manifest,scans,completeReview(),evidence);
  assert.equal(r.reviewStatus,'candidate_for_owner_beta_decision');
  assert.equal(r.founderReviewComplete,true);
  assert.equal(r.alertCounts.likely_false_positive,1);
  assert.equal(r.alertCounts.likely_true_positive,2);
  assert.equal(r.precision,null);
  assert.equal(r.recall,null);
  assert.equal(r.productionReleaseAuthorized,false);
  assert.equal(r.automaticBetaDeploymentAuthorized,false);
  assert.equal(r.independentAccuracyCertified,false);
});

test('AI opinion cannot impersonate self-attested founder',()=>{
  const input=completeReview();
  input.reviewer.kind='ai_model';
  assert.throws(()=>assessSoloFounderGate(manifest,scans,input,evidence),
    /personally signed owner attestation/);
  input.reviewer.kind='solo_founder';
  input.reviewer.ownerAttestation=false;
  assert.throws(()=>assessSoloFounderGate(manifest,scans,input,evidence),
    /personally signed owner attestation/);
});

test('High/Critical uncertain remains a blocker, not a false positive',()=>{
  const input=completeReview();
  input.projects[1].assessments[0].decision='uncertain';
  const out=assessSoloFounderGate(manifest,scans,input,evidence);
  assert.equal(out.reviewStatus,'blocked');
  assert.equal(out.alertCounts.highCriticalUncertain,1);
  assert.ok(out.blockedBy.some(s=>s.includes('High/Critical')));
});

test('waived, missing or failed independent and provider checks never auto-pass',()=>{
  const input=completeReview(), e=structuredClone(evidence);
  e.checks[2].status='waived';
  let out=assessSoloFounderGate(manifest,scans,input,e);
  assert.equal(out.reviewStatus,'blocked');
  assert.equal(out.verification.hosted_staging_e2e,'waived');
  e.checks[2].status='pending';
  out=assessSoloFounderGate(manifest,scans,input,e);
  assert.equal(out.reviewStatus,'blocked');
  e.checks[2].status='failed';
  out=assessSoloFounderGate(manifest,scans,input,e);
  assert.equal(out.reviewStatus,'blocked');
});

test('partial review stays blocked without fabricating missing labels',()=>{
  const input=completeReview();
  input.projects[0].assessments.pop();
  const out=assessSoloFounderGate(manifest,scans,input,evidence);
  assert.equal(out.reviewStatus,'blocked');
  assert.equal(out.alertCounts.unreviewed,1);
});

test('orphan or duplicate alert owner reviews are rejected',()=>{
  const input=completeReview();
  input.projects[0].assessments[0].line=999;
  assert.throws(()=>assessSoloFounderGate(manifest,scans,input,evidence),
    /nonexistent scan alert/);
  const another=completeReview();
  another.projects[0].assessments.push({...another.projects[0].assessments[0]});
  assert.throws(()=>assessSoloFounderGate(manifest,scans,another,evidence),
    /Duplicate founder assessment/);
});

test('duplicate must cite different real alert in the same repository, no chains',()=>{
  const input=completeReview();
  input.projects[0].assessments[1].decision='duplicate';
  input.projects[0].assessments[1].duplicateOf=findings[1];
  assert.throws(()=>assessSoloFounderGate(manifest,scans,input,evidence),
    /different observed alert/);
  input.projects[0].assessments[1].duplicateOf=findings[0];
  const out=assessSoloFounderGate(manifest,scans,input,evidence);
  assert.equal(out.alertCounts.duplicate,1);
});

test('source-context links and real evidence are mandatory; no http or empty rationale',()=>{
  const input=completeReview();
  input.projects[0].assessments[0].evidenceUrls=['http://localhost:8080'];
  assert.throws(()=>assessSoloFounderGate(manifest,scans,input,evidence),
    /source\/evidence URL/);
  const invalid=completeReview();
  invalid.projects[0].assessments[0].rationale='AI says safe';
  assert.throws(()=>assessSoloFounderGate(manifest,scans,invalid,evidence),
    /contextual/);
});

test('verified checks require immutable SHA, evidence URL and detailed rationale',()=>{
  const missing=structuredClone(evidence);
  missing.checks[0].commit='main';
  assert.throws(()=>assessSoloFounderGate(manifest,scans,completeReview(),missing),
    /pinned code SHA/);
});

test('missing or partial scans cannot pass as clean external repositories',()=>{
  const noScan=structuredClone(scans);
  noScan.projects.pop();
  const out=assessSoloFounderGate(manifest,noScan,null,null);
  assert.equal(out.reviewStatus,'blocked');
  assert.equal(out.scope.projects,2);
});

test('legacy independent two-qualified-reviewer workflow remains separate',()=>{
  const r=assessSoloFounderGate(manifest,scans,completeReview(),evidence);
  assert.equal(r.documentType,'INTERNAL_SOLO_FOUNDER_BETA_EVIDENCE_NOT_INDEPENDENT_CERTIFICATION');
  assert.equal(r.confirmedVulnerabilities,null);
});
