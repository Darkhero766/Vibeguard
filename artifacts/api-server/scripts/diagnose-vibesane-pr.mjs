#!/usr/bin/env node
// Local PR delta diagnosis using the exact extended scanner used by the webhook.
// Reads tracked Git files only. Prints NO snippets, secret values, or descriptions.
// Diagnostic does not mark a scanner finding false/true or change release criteria.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const exec=promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const api=path.join(root,'artifacts/api-server');
const base=process.env.AGENTSHIELD_BASE_SHA || 'a217460aa0c3c15b94c582fd17f15504b520527b';
const readable=/\.(?:[cm]?[jt]sx?|sql|json|ya?ml|md|mdx|toml|ini|conf|xml|html|css|scss|sh|bash|py|rb|go|rs|java|php)$/i;
const excluded=[
 'artifacts/api-server/src/lib/apiScanner.ts',
 'artifacts/api-server/src/lib/extendedScanner.ts',
 'artifacts/api-server/src/lib/extendedScannerV2.ts',
 'artifacts/api-server/src/lib/securityCheckCatalog.ts',
 'artifacts/api-server/src/lib/scanner.ts',
];
const excludedDirs=['artifacts/mockup-sandbox/','lib/api-client-react/src/generated/','lib/api-zod/src/generated/'];
const ignoreNames=new Set(['CHANGELOG.md','pnpm-lock.yaml']);
const ignoreParts=new Set(['node_modules','.git','.next','dist','build','coverage','vendor']);
function shouldRead(name){
  const last=name.split('/').at(-1);
  return (readable.test(name)||/^Dockerfile(?:\..*)?$/.test(last)||last==='.npmrc'||last==='.gitignore'||/(^|\/)\.env(?:\.[\w-]+)?$/i.test(name))
    && !name.split('/').some(x=>ignoreParts.has(x))
    && !excluded.includes(name)&&!excludedDirs.some(d=>name.startsWith(d))
    && !ignoreNames.has(name);
}
async function filesAt(paths,source){
  const files=[];
  let size=0;
  for(const rel of paths){
    if(!shouldRead(rel))continue;
    let content='';
    try{
      if(source==='head') content=await readFile(path.join(root,rel),'utf8');
      else content=(await exec('git',['show',base+':'+rel],{cwd:root,timeout:7000,maxBuffer:1_100_000})).stdout;
    }catch(e){if(source==='head')throw e;continue;}
    const n=Buffer.byteLength(content);
    if(!n || n>1_000_000 || size+n>12_000_000)continue;
    size+=n;files.push({path:rel,content});
  }
  return files;
}
function metadata(f){
  return {filePath:String(f.filePath||'').slice(0,300),
    line:Math.max(1,Math.floor(Number(f.line)||1)),
    check:String(f.check||'unknown').slice(0,100),
    title:String(f.title||'').replace(/[\r\n]/g,' ').slice(0,150),
    severity:f.severity};
}
export async function diagnose(){
  const temp=await mkdtemp(path.join(tmpdir(),'vibesane-delta-'));
  try {
    const {stdout}=await exec('git',['diff','--name-only','-z',base,'HEAD'],{
      cwd:root,timeout:10000,maxBuffer:700000,
    });
    const paths=stdout.split('\0').filter(Boolean).sort();
    const [a,b]=await Promise.all([filesAt(paths,'base'),filesAt(paths,'head')]);
    await build({entryPoints:[path.join(api,'src/lib/extendedScannerV2.ts')],
      outfile:path.join(temp,'scanner.mjs'),bundle:true,platform:'node',format:'esm',
      target:'node20',logLevel:'silent'});
    const {scanExtendedFilesV2}=await import(pathToFileURL(path.join(temp,'scanner.mjs')).href);
    const baseline=scanExtendedFilesV2(a);
    const latest=scanExtendedFilesV2(b);
    const key=f=>[f.filePath,f.line,f.check,f.title].join(':');
    const keys=new Set(baseline.map(key));
    const changed=new Set(paths);
    const delta=latest.filter(f=>changed.has(f.filePath)&&!keys.has(key(f)))
      .map(metadata).sort((x,y)=>x.filePath.localeCompare(y.filePath)||x.line-y.line);
    return {status:'diagnostic_only',baseSha:base,headSha:(await exec('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim(),
      changedPaths:paths.length,baseFilesAnalyzed:a.length,headFilesAnalyzed:b.length,
      newFindings:delta.length,critical:delta.filter(x=>x.severity==='Critical').length,
      high:delta.filter(x=>x.severity==='High').length,
      findings:delta,
      note:'Reproduction of changed-file extended rules, not exploit verification; reviewed vs deployed versions may differ.',
    };
  }finally{await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  diagnose().then(r=>process.stdout.write('OBSERVED_VIBESANE_DELTA='+JSON.stringify(r)+'\n'))
    .catch(e=>{process.stderr.write('Delta diagnosis failed: '+e.message+'\n');process.exitCode=2;});
}
