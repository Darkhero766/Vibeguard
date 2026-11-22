#!/usr/bin/env node
/**
 * Build a SOURCE-ONLY CodeQL comparison snapshot from immutable, reviewed-license
 * GitHub public repository paths. No git clone, install, build, scripts or
 * execution of retrieved source. Avoids private repositories and all secrets.
 * This does not claim CodeQL is a precision/recall oracle for our product.
 */
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {validateManifest} from './vibesane-benchmark-evidence.mjs';

const manifestFile = process.argv[2];
const folder = process.argv[3];
if (!manifestFile || !folder || process.argv.length !== 4)
  throw new Error('Usage: node prepare-public-codeql-snapshot.mjs MANIFEST_JSON OUTPUT_FOLDER');
const manifest = JSON.parse(readFileSync(manifestFile,'utf8'));
validateManifest(manifest);
if (manifest.projects.length !== 22 ||
    !manifest.description?.includes('22 distinct publicly licensed'))
  throw new Error('Expected frozen 22-app snapshot manifest');
const sources = [];
let totalBytes = 0;
for (const p of manifest.projects) {
  if (!['MIT','Apache-2.0'].includes(p.license) || p.coverageMode !== 'bounded_subset')
    throw new Error('Unapproved license or source scope: ' + p.repo);
  for (const sourcePath of p.paths) {
    if (/\.(?:[cm]?[jt]sx?)$/i.test(sourcePath)) {
      sources.push({repo:p.repo,commit:p.commit,license:p.license,path:sourcePath});
    }
  }
}
if (!sources.length || sources.length > 150)
  throw new Error('Unexpected JS/TS subset size');
const root = path.resolve(folder);
if (root === process.cwd() || !root.startsWith(path.resolve(process.cwd()) + path.sep))
  throw new Error('Snapshot output must be a distinct subdirectory of workspace');
mkdirSync(root,{recursive:true});
const headers={Accept:'application/vnd.github+json',
  'User-Agent':'VibeSane-immutable-public-codeql-comparison'};
if (process.env.GITHUB_TOKEN) headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;

async function githubJson(url) {
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Pinned public GitHub resource unavailable (HTTP '+response.status+')');
  return response.json();
}
// A GitHub token with access to this repo cannot silently convert a private
// source into an eligible public comparison source.
for (const p of manifest.projects) {
  const metadata=await githubJson('https://api.github.com/repos/'+p.repo);
  if (metadata.private!==false ||
      metadata.full_name?.toLowerCase()!==p.repo.toLowerCase())
    throw new Error('Public GitHub identity verification failed: '+p.repo);
}
async function fetchSource(entry) {
  const [owner,name]=entry.repo.split('/');
  const uri='https://api.github.com/repos/'+encodeURIComponent(owner)+'/'+
    encodeURIComponent(name)+'/contents/'+
    entry.path.split('/').map(encodeURIComponent).join('/')+'?ref='+entry.commit;
  const payload=await githubJson(uri);
  if(payload.type!=='file'||payload.encoding!=='base64'||typeof payload.content!=='string')
    throw new Error('Non-text GitHub source or oversized file: '+entry.repo);
  const data=Buffer.from(payload.content.replace(/\s/g,''),'base64');
  if(data.length>250000||data.length===0)
    throw new Error('Source size outside 1-250KB safe bound: '+entry.repo);
  const destination=path.join(root,owner,name,entry.path);
  if(!destination.startsWith(root+path.sep))throw new Error('Invalid snapshot path');
  mkdirSync(path.dirname(destination),{recursive:true});
  writeFileSync(destination,data,{flag:'wx',mode:0o600});
  return {repo:entry.repo,commit:entry.commit,filePath:entry.path,bytes:data.length};
}
const results = [];
for(let i=0;i<sources.length;i+=6) {
  const group=await Promise.all(sources.slice(i,i+6).map(fetchSource));
  for(const record of group) {
    results.push(record);
    totalBytes+=record.bytes;
    if(totalBytes>8_000_000)throw new Error('CodeQL source snapshot exceeds size budget');
  }
}
const output={schemaVersion:1,
  documentType:'PUBLIC_OSI_LICENSED_PINNED_JS_TS_SUBSET_CODEQL_INPUT',
  scannerUnderTest:'CodeQL github/codeql-action security-extended',
  interpretAs:'COMPARATOR_ONLY_NOT_GROUND_TRUTH',
  noPublicSourceCodeExecuted:true,
  includesWholeApplication:false,independentAccuracyValidated:false,
  attemptedFiles:sources.length,copiedFiles:results.length,totalBytes,
  projects:manifest.projects.length,
  files:results,
};
writeFileSync(path.join(process.cwd(),'phase2-public-codeql-metadata.json'),
  JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});
process.stdout.write(JSON.stringify({repos:manifest.projects.length,
  files:results.length,bytes:totalBytes,
  copiedWithoutExecution:true,sourceComplete:true})+'\n');
