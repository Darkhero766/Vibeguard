import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runSyntheticCaseBenchmark,syntheticCases} from './benchmark-vibesane-solo-fixtures.mjs';

test('10 author-created paired JS/TS/SQL examples cover five targeted rule families',()=>{
  assert.equal(syntheticCases.length,10);
  assert.equal(syntheticCases.filter(x=>x.class==='positive').length,5);
  assert.equal(syntheticCases.filter(x=>x.class==='negative').length,5);
  assert.equal(new Set(syntheticCases.map(x=>x.rule)).size,5);
});

test('actual bundled API-core + V2 scanner detects known-bad AND avoids paired safe targets',async()=>{
  const report=await runSyntheticCaseBenchmark();
  assert.equal(report.passed,true,JSON.stringify(report.results.filter(x=>!x.passed)));
  assert.equal(report.positiveCasesDetected,5);
  assert.equal(report.negativeCasesWithoutTargetedAlert,5);
  assert.equal(report.realWorldPrecision,null);
  assert.equal(report.realWorldRecall,null);
  assert.equal(report.externalGroundTruth,false);
  assert.equal(report.sourceCodeExecuted,false);
});

test('a no-op/missing scanner implementation cannot pass author synthetic fixtures',async()=>{
  const bogus={scanApiFiles:()=>[],scanExtendedFilesV2:()=>[]};
  const report=await runSyntheticCaseBenchmark(bogus);
  assert.equal(report.passed,false);
  assert.equal(report.positiveCasesDetected,0);
  assert.equal(report.negativeCasesWithoutTargetedAlert,5);
});
