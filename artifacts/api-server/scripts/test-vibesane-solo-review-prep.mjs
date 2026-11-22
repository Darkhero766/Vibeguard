import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSoloFounderStarter} from './prepare-vibesane-solo-review.mjs';

const sha='a'.repeat(40),rules='b'.repeat(40);
const project={repo:'example/starter',commit:sha,license:'MIT',
  sourceType:'unlabeled_general',coverageMode:'bounded_subset',
  paths:['src/app/api/payments/[id]/route.ts']};
const manifest={schemaVersion:1,projects:[project]};
const scan={schemaVersion:1,projects:[{
  repo:project.repo,commit:sha,engine:'api_core_plus_extended_v2',
  rulesetCommit:rules,status:'complete',filesScanned:1,
  scannedFiles:project.paths,sourceLinesScanned:19,durationMs:12,
  coverage:{complete:true},
  findings:[{ruleId:'unauthenticated_write',filePath:project.paths[0],line:8,severity:'High'}],
}]};

test('generator does not invent founder signatures, AI consensus, clean labels or accuracy',()=>{
  const result=createSoloFounderStarter(manifest,scan);
  assert.equal(result.summary.repos,1);
  assert.equal(result.summary.scannedFiles,1);
  assert.equal(result.summary.unreviewedAlerts,1);
  assert.equal(result.ownerReview.reviewer.ownerAttestation,false);
  assert.equal(result.ownerReview.projects[0].assessments.length,0);
  assert.equal(result.prompts.independentHumanReviewed,false);
  assert.equal(result.prompts.accuracyVerified,false);
  assert.equal(result.prompts.alerts[0].founderDecision,null);
  assert.equal(result.prompts.alerts[0].aiSuggestionsAreUnverified,true);
  assert.match(result.prompts.alerts[0].sourceUrl,/github.com\/example\/starter\/blob\/a{40}\/src\/app\/api\/payments\/%5Bid%5D\/route.ts#L8/);
  assert.equal(result.checks.checks.length,4);
  assert.ok(result.checks.checks.every(c=>c.status==='pending'));
});

test('preparer rejects incomplete or missing scans rather than a clean false negative',()=>{
  const incomplete=structuredClone(scan);
  incomplete.projects[0].status='incomplete';
  assert.throws(()=>createSoloFounderStarter(manifest,incomplete),/incomplete source scans/);
  assert.throws(()=>createSoloFounderStarter(manifest,{schemaVersion:1,projects:[]}),
    /incomplete source scans/);
});

test('generator does not trust fabricated source file paths outside frozen subset',()=>{
  const invalid=structuredClone(scan);
  invalid.projects[0].findings[0].filePath='src/never-scanned.ts';
  assert.throws(()=>createSoloFounderStarter(manifest,invalid),
    /Finding outside declared path subset/);
});
