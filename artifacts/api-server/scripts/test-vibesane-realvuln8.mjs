import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scoreExternallyLabeledSubset} from './benchmark-vibesane-realvuln8.mjs';

const spec=JSON.parse(readFileSync(new URL('../benchmarks/real-world/phase2-external-realvuln-nextjs-8.v1.json',import.meta.url)));
const labels=spec.targets.map((f,i)=>({
  id:f.id,file:f.filePath,is_vulnerable:true,
  evidence:{source:'manual_review'},
  primary_cwe:'CWE-79',
  vulnerability_class:'externally_annotated',
  location:{start_line:30+i*5,end_line:30+i*5}
}));
const gt={benchmark_version:'3.0.0',commit_sha:spec.sourceCommit,findings:labels};
const observed=()=>spec.targets.map((f,i)=>({filePath:f.filePath,check:f.expectedRules[0],
  line:30+i*5}));

test('baseline score is exactly eight frozen external labels, not general recall',()=>{
  const r=scoreExternallyLabeledSubset(spec,gt,observed());
  assert.equal(r.detectedTargets,8);
  assert.equal(r.missedTargets,0);
  assert.equal(r.scopedLabeledCaseHitRate,1);
  assert.equal(r.realWorldRecall,null);
  assert.equal(r.realWorldPrecision,null);
  assert.equal(r.falsePositiveRate,null);
  assert.equal(r.reviewerQualificationsIndependentlyVerified,false);
});

test('scanner signals with wrong rule must not earn labeled detection',()=>{
  const xs=observed();
  xs[0].check='unrelated_rule';
  const r=scoreExternallyLabeledSubset(spec,gt,xs);
  assert.equal(r.detectedTargets,7);
  assert.equal(r.results[0].hit,false);
});

test('scanner signals in wrong source location do not earn labels',()=>{
  const xs=observed();
  xs[0].line=999;
  const r=scoreExternallyLabeledSubset(spec,gt,xs);
  assert.equal(r.missedTargets,1);
});

test('source labels cannot be silently replaced by AI or other commit',()=>{
  const changed=structuredClone(gt);
  changed.findings[0].evidence.source='ai_generated';
  assert.throws(()=>scoreExternallyLabeledSubset(spec,changed,observed()),/independent source label/);
  const moved=structuredClone(gt);
  moved.commit_sha='0'.repeat(40);
  assert.throws(()=>scoreExternallyLabeledSubset(spec,moved,observed()),/immutable source commit/);
});

test('non-scoring and source-mismatched labels cannot count as ground truth',()=>{
  const changed=structuredClone(gt);
  changed.findings[1].scoring='non_scoring';
  assert.throws(()=>scoreExternallyLabeledSubset(spec,changed,observed()),/independent source label/);
  const swapped=structuredClone(gt);
  swapped.findings[1].file='lib/other.ts';
  assert.throws(()=>scoreExternallyLabeledSubset(spec,swapped,observed()),/independent source label/);
});

test('extra scanner alerts never fabricate unverified false positives',()=>{
  const all=[...observed(),{filePath:'unlisted/other.ts',line:42,check:'hardcoded_password'}];
  const r=scoreExternallyLabeledSubset(spec,gt,all);
  assert.equal(r.detectedTargets,8);
  assert.equal(r.falsePositiveRate,null);
  assert.equal(r.falsePositiveTrapCoverage,0);
});
