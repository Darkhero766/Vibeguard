import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile);
const scripts=path.dirname(fileURLToPath(import.meta.url));
async function scanCode(t,content){
 const dir=await mkdtemp(path.join(tmpdir(),'agentshield-auth-'));
 t.after(async()=>rm(dir,{recursive:true,force:true}));
 await exec('git',['init','-q',dir],{timeout:5000});
 await mkdir(path.join(dir,'app/api/orders'),{recursive:true});
 await writeFile(path.join(dir,'app/api/orders/route.ts'),content);
 let stdout;
 try{({stdout}=await exec(process.execPath,[path.join(scripts,'vibesane.mjs'),
   'scan','--changed','--cwd',dir,'--format','json'],{timeout:25000,maxBuffer:800000}));}
 catch(e){if(e.code!==1||typeof e.stdout!=='string')throw e;stdout=e.stdout;}
 const r=JSON.parse(stdout);
 assert.equal(r.status,'complete');
 return r.findings.some(f=>f.ruleId==='unauthenticated_write');
}
test('bare auth.getUser call cannot suppress missing authorization warning',async t=>{
 assert.equal(await scanCode(t,'export async function POST(){await auth.getUser();db.from("orders").insert({});}'),true);
});
test('unchecked getServerSession call cannot suppress missing authorization warning',async t=>{
 assert.equal(await scanCode(t,'export async function PATCH(){const s=await getServerSession();db.from("orders").update({});}'),true);
});
test('unchecked requireUser assignment cannot suppress missing authorization',async t=>{
 assert.equal(await scanCode(t,'export async function POST(){const u=await requireUser();if(!other) return;db.from("orders").insert({});}'),true);
});
test('non-denying if branch is not authentication enforcement',async t=>{
 assert.equal(await scanCode(t,'export async function POST(){const u=await requireUser();if(!u) console.warn("missing");db.from("orders").insert({});}'),true);
});
test('checked session with early return is recognized',async t=>{
 assert.equal(await scanCode(t,'export async function POST(){const s=await getServerSession();if(!s)return;db.from("orders").insert({});}'),false);
});
test('checked auth result with explicit throw is recognized',async t=>{
 assert.equal(await scanCode(t,'export async function POST(){const u=await auth.getUser();if(!u)throw Error("deny");db.from("orders").insert({});}'),false);
});
test('checked session.user with explicit throw is recognized',async t=>{
 assert.equal(await scanCode(t,'export async function PATCH(){const u=session.user;if(!u)throw Error("deny");db.from("orders").update({});}'),false);
});
test('comment-only security calls never count as guards',async t=>{
 assert.equal(await scanCode(t,'// const u=await getServerSession();if(!u)return;\nexport async function POST(){db.from("orders").insert({});}'),true);
});
test('guard after the write is not protection before it',async t=>{
 assert.equal(await scanCode(t,'export async function POST(){db.from("orders").insert({});const s=await getServerSession();if(!s)return;}'),true);
});
test('checked user with braced rejection is recognized',async t=>{
 assert.equal(await scanCode(t,'export async function POST(){const u=await requireUser();if(!u){return new Response("deny",{status:401})}db.from("orders").insert({});}'),false);
});
