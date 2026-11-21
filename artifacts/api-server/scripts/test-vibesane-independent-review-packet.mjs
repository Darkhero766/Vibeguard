import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildIndependentReviewPacket} from './prepare-vibesane-independent-review-packet.mjs';

const commit='a'.repeat(40);
const rulePin='b'.repeat(40);
const manifest={schemaVersion:1,projects:[
  {repo:'demo/public-project',commit,license:'MIT',
   sourceType:'unlabeled_general',coverageMode:'bounded_subset',paths:['src/route.ts']},
]};
const scans={schemaVersion:1,projects:[{
  repo:'demo/public-project',commit,rulesetCommit:rulePin,
  status:'complete',engine:'api_core_plus_extended_v2',filesScanned:1,
  scannedFiles:['src/route.ts'],coverage:{complete:true},durationMs:3,
  findings:[{ruleId:'open_redirect',filePath:'src/route.ts',line:12,severity:'High',
    internalProviderLog:'dummy-confidential-header-never-export'}],
}]};

test('blind packet hides all scanner findings and reviewer labels',()=>{
  const p=buildIndependentReviewPacket(manifest,scans,'blind');
  assert.equal(p.kind,'INDEPENDENT_HUMAN_REVIEW_PREPARATION_NOT_GROUND_TRUTH');
  assert.equal(p.projects.length,1);
  assert.deepEqual(p.projects[0].sourceScope,['src/route.ts']);
  assert.equal(p.projects[0].candidateFindings,undefined);
  assert.equal(p.verifiedHumanLabels,0);
  assert.equal(p.precision,null);
  assert.equal(p.recall,null);
  assert.equal(p.independentlyCertified,false);
  assert.doesNotMatch(JSON.stringify(p),/open_redirect|dummy-confidential-header|true_positive/);
});

test('adjudication packet exposes only metadata and no forged verdicts',()=>{
  const p=buildIndependentReviewPacket(manifest,scans,'adjudication');
  assert.deepEqual(p.projects[0].candidateFindings,[{
    ruleId:'open_redirect',filePath:'src/route.ts',line:12,severity:'High',
    findingKey:'["open_redirect","src/route.ts",12]',
  }]);
  assert.doesNotMatch(JSON.stringify(p),/dummy-confidential-header-never-export/);
  assert.equal(p.verifiedHumanLabels,0);
  assert.equal(p.precision,null);
  assert.match(p.instructions.join(' '),/independent reviews/);
  assert.equal(p.sourceDataFingerprintSha256.length,64);
  assert.equal(p.sourceDataFingerprintSha256,
    buildIndependentReviewPacket(manifest,scans,'blind').sourceDataFingerprintSha256);
});

test('incomplete, mixed or unfrozen source metadata cannot produce reviewer packets',()=>{
  const bad=structuredClone(scans);
  bad.projects[0].status='incomplete';
  assert.throws(()=>buildIndependentReviewPacket(manifest,bad,'blind'),/complete/);
  const unpinned=structuredClone(scans);
  delete unpinned.projects[0].scannedFiles;
  assert.throws(()=>buildIndependentReviewPacket(manifest,unpinned,'blind'),/scannedFiles/);
  const wrong=structuredClone(scans);
  wrong.projects[0].scannedFiles=['src/other.ts'];
  assert.throws(()=>buildIndependentReviewPacket(manifest,wrong,'adjudication'),
    /subset|outside|missing/i);
  assert.throws(()=>buildIndependentReviewPacket(manifest,scans,'draft'),/mode/);
});
