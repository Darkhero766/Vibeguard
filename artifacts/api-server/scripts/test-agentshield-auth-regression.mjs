import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const scripts=path.dirname(fileURLToPath(import.meta.url));
let scan;
async function scanCode(content) {
  if(!scan){
    // Test the production API detection function in memory. There are no
    // shell commands, Git writes, external credentials, or network requests.
    const bundle=await build({
      entryPoints:[path.join(scripts,'../src/lib/apiScanner.ts')],
      bundle:true,format:'esm',platform:'node',target:'node20',
      outfile:'apiScanner.mjs',write:false,logLevel:'silent',
    });
    const url='data:text/javascript;base64,'+
      Buffer.from(bundle.outputFiles[0].contents).toString('base64');
    scan=(await import(url)).scanApiFiles;
  }
  const findings=scan([{path:'app/api/orders/route.ts',content}]);
  return findings.some(f=>f.check==='unauthenticated_write');
}
test('bare auth.getUser call cannot suppress missing authorization warning',async()=>{
 assert.equal(await scanCode('export async function POST(){await auth.getUser();db.from("orders").insert({});}'),true);
});
test('unchecked getServerSession call cannot suppress missing authorization warning',async()=>{
 assert.equal(await scanCode('export async function PATCH(){const s=await getServerSession();db.from("orders").update({});}'),true);
});
test('unchecked requireUser assignment cannot suppress missing authorization',async()=>{
 assert.equal(await scanCode('export async function POST(){const u=await requireUser();if(!other) return;db.from("orders").insert({});}'),true);
});
test('non-denying if branch is not authentication enforcement',async()=>{
 assert.equal(await scanCode('export async function POST(){const u=await requireUser();if(!u) console.warn("missing");db.from("orders").insert({});}'),true);
});
test('checked session with early return is recognized',async()=>{
 assert.equal(await scanCode('export async function POST(){const s=await getServerSession();if(!s)return;db.from("orders").insert({});}'),false);
});
test('checked auth result with explicit throw is recognized',async()=>{
 assert.equal(await scanCode('export async function POST(){const u=await auth.getUser();if(!u)throw Error("deny");db.from("orders").insert({});}'),false);
});
test('checked session.user with explicit throw is recognized',async()=>{
 assert.equal(await scanCode('export async function PATCH(){const u=session.user;if(!u)throw Error("deny");db.from("orders").update({});}'),false);
});
test('comment-only security calls never count as guards',async()=>{
 assert.equal(await scanCode('// const u=await getServerSession();if(!u)return;\nexport async function POST(){db.from("orders").insert({});}'),true);
});
test('guard after the write is not protection before it',async()=>{
 assert.equal(await scanCode('export async function POST(){db.from("orders").insert({});const s=await getServerSession();if(!s)return;}'),true);
});
test('checked user with braced rejection is recognized',async()=>{
 assert.equal(await scanCode('export async function POST(){const u=await requireUser();if(!u){return new Response("deny",{status:401})}db.from("orders").insert({});}'),false);
});
