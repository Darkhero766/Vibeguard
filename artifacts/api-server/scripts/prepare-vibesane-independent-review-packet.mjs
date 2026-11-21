#!/usr/bin/env node
/**
 * Prepare a source-only, read-only independent review handoff.
 * Produces no findings verdicts, vulnerability labels, or accuracy scores.
 * Reviewers should inspect frozen source independently before reading the
 * scanner candidate list, then separately supply signed human decisions.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { scoreEvidence, validateManifest, findingKey } from './vibesane-benchmark-evidence.mjs';

const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
const MODES=new Set(['blind','adjudication']);

export function buildIndependentReviewPacket(manifest, scans, mode) {
  ensure(MODES.has(mode),'Reviewer packet mode must be blind or adjudication');
  validateManifest(manifest);
  // Call the same strict public-source benchmark validator as the scorer.
  // Empty reviews must not be mistaken for human-adjudicated results.
  const check=scoreEvidence(manifest,scans,{schemaVersion:1,projects:[]});
  ensure(Array.isArray(scans.projects)&&scans.projects.length===manifest.projects.length,
    'All manifest projects must have a matching scan');
  ensure(check.projects.length===manifest.projects.length&&
    check.projects.every(p=>p.status==='complete'),
    'Review packet requires complete source-only scans for every project');
  const lookup=new Map(scans.projects.map(p=>[p.repo.toLowerCase()+'@'+p.commit.toLowerCase(),p]));
  const projects=manifest.projects.map(p=>{
    const s=lookup.get(p.repo.toLowerCase()+'@'+p.commit.toLowerCase());
    ensure(s&&Array.isArray(s.scannedFiles)&&s.scannedFiles.length===s.filesScanned,
      'Every review target needs an exact scannedFiles list');
    const base={repo:p.repo,commit:p.commit,sourceScope:s.scannedFiles.slice().sort(),
      scannedFiles:s.filesScanned,coverageMode:p.coverageMode};
    if(mode==='blind')return base;
    return {...base,candidateFindings:s.findings.map(f=>({
      ruleId:f.ruleId,filePath:f.filePath,line:f.line,severity:f.severity,
      findingKey:findingKey(f),
    })).sort((a,b)=>a.findingKey.localeCompare(b.findingKey))};
  });
  const fingerprint=createHash('sha256').update(JSON.stringify({
    manifest,scans,
  })).digest('hex');
  return {
    schemaVersion:1,
    kind:'INDEPENDENT_HUMAN_REVIEW_PREPARATION_NOT_GROUND_TRUTH',
    mode,sourceDataFingerprintSha256:fingerprint,
    scannerRulesetSha:scans.projects[0].rulesetCommit,
    scannerEngine:scans.projects[0].engine,
    verifiedHumanLabels:0,independentlyCertified:false,
    precision:null,recall:null,
    projects,
    instructions:mode==='blind'?[
      'Two independent qualified humans must inspect each exact pinned sourceScope, including negative and missed-vulnerability targets, before viewing the scanner alerts.',
      'Document file, line, security preconditions, grant/authorization context, source-of-truth evidence, and severity before unblinding.',
      'Do not assume unflagged code is safe and do not execute any untrusted repository code.',
    ]:[
      'Only after completing the independent blind source review, adjudicate every candidate finding as true_positive, false_positive, uncertain, or duplicate.',
      'Record actual source proof, severity rationale, and separately curated missed targets inside the frozen scannedFiles subset.',
      'Use two independent reviews and the existing reconcileIndependentReviews gate; the release owner must separately verify reviewer identities and independence.',
    ],
  };
}

function main(argv){
  ensure(argv.length===8,'Usage: --manifest FILE --scans FILE --mode blind|adjudication --output FILE');
  const opts=new Map();
  for(let i=0;i<argv.length;i+=2){
    ensure(['--manifest','--scans','--mode','--output'].includes(argv[i])&&
      !opts.has(argv[i])&&argv[i+1],'Invalid or duplicated review packet argument');
    opts.set(argv[i],argv[i+1]);
  }
  for(const k of ['--manifest','--scans','--mode','--output'])
    ensure(opts.has(k),'Missing required '+k);
  const parse=k=>JSON.parse(readFileSync(opts.get(k),'utf8'));
  const packet=buildIndependentReviewPacket(parse('--manifest'),parse('--scans'),opts.get('--mode'));
  writeFileSync(opts.get('--output'),JSON.stringify(packet,null,2)+'\n',
    {flag:'wx',mode:0o600});
  process.stdout.write(JSON.stringify({mode:packet.mode,projects:packet.projects.length,
    humanLabels:0,independentAccuracyVerified:false,
    outputCreated:true,sourceCodeExecuted:false})+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{main(process.argv.slice(2))}
  catch(error){process.stderr.write('Review packet preparation failed: '+error.message+'\n');process.exitCode=1;}
}
