#!/usr/bin/env node
// Informational external-source-code smoke evaluation. NEVER execute fetched code.
// Do not confuse rule-presence evidence with independently labeled exploitability.
// Source: Apache-2.0 OWASP NodeGoat, pinned to a commit already checked in Github.
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo='OWASP/NodeGoat';
const commit='c5cb68a7084e4ae7dcc60e6a98768720a81841e8';
const files=[
 {path:'app/routes/contributions.js',rule:'eval_usage',category:'supported'},
 {path:'app/routes/index.js',rule:'open_redirect',category:'supported'},
 {path:'app/data/user-dao.js',rule:'plaintext_password_storage',category:'known_unsupported'},
 {path:'app/routes/profile.js',rule:'redos',category:'known_unsupported'},
];
const result={status:'incomplete',source:repo,commit,license:'Apache-2.0',
 evaluation:'External, deliberately vulnerable educational repository; sampled static rules only',
 humanValidated:false,actualExploitVerified:false,fullyIndependentHoldout:false,
 samples:[],supportedHits:0,supportedExpected:2,knownUnsupported:2,fullCoverageClaim:false};
const tmp=await mkdtemp(path.join(tmpdir(),'vibesane-public-static-'));
try{
 const outfile=path.join(tmp,'scanner.mjs');
 await build({entryPoints:[path.join(projectRoot,'src/lib/extendedScanner.ts')],
   outfile,bundle:true,platform:'node',format:'esm',target:'node20',logLevel:'silent'});
 const {scanExtendedFiles}=await import(pathToFileURL(outfile).href);
 const inputs=[];
 for(const item of files){
   const url='https://raw.githubusercontent.com/'+repo+'/'+commit+'/'+item.path;
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(10000),
     headers:{Accept:'text/plain','User-Agent':'VibeSane-read-only-benchmark'}});
   if(!response.ok)throw new Error('Pinned source fetch HTTP '+response.status+' for '+item.path);
   const source=await response.text();
   if(Buffer.byteLength(source)>128000||!source.trim())
     throw new Error('Empty/oversized pinned source: '+item.path);
   inputs.push({path:item.path,content:source,expected:item});
 }
 const findings=scanExtendedFiles(inputs.map(({path,content})=>({path,content})));
 for(const file of inputs){
   const all=findings.filter(x=>x.filePath===file.path);
   const rules=[...new Set(all.map(x=>x.check))].sort();
   const targetRuleFound=rules.includes(file.expected.rule);
   if(file.expected.category==='supported'&&targetRuleFound)result.supportedHits++;
   result.samples.push({path:file.path,sourceSha256:createHash('sha256').update(file.content).digest('hex'),
     expectedRule:file.expected.rule,category:file.expected.category,targetRuleFound,
     findingRules:rules,reportedFindings:all.length});
 }
 result.status='measured';
 result.note='2 supported target rules plus 2 known-unsupported vulnerability classes; '
   +'no precision/recall is reported because this is neither an exhaustive review '
   +'nor a human-adjudicated labeled dataset. No external source was executed.';
 if(result.supportedHits!==result.supportedExpected)
   result.warning='Supported sample mismatch; informational only, investigation needed.';
}catch(error){
 result.status='incomplete';
 result.errorClass=String(error?.name||'Error').slice(0,80);
 result.note='No accuracy inference: external source was unavailable or scanner setup failed.';
 // External network cannot make mandatory CI green or red. Status stays incomplete.
}finally{
 await rm(tmp,{recursive:true,force:true});
 process.stdout.write('OBSERVED_PUBLIC_REPO_SMOKE='+JSON.stringify(result)+'\n');
}
