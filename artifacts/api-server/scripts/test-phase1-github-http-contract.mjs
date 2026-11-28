import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Module, { createRequire } from 'node:module';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts=path.dirname(fileURLToPath(import.meta.url));
const nodeRequire=createRequire(import.meta.url);
const express=nodeRequire('express');
const userA='b4120000-512e-4b9c-a008-000000000001';
const userB='b4120000-512e-4b9c-a008-000000000002';
const githubToken='staging-only-synthetic-github-token-A';

/** This is an actual HTTP route/auth middleware/crypto contract with stubbed
 * external Auth/GitHub HTTP responses and an in-memory PostgreSQL adapter.
 * It is NOT a hosted Supabase/Auth/GitHub/payment integration test. */
test('Phase 1 GitHub HTTP token lifecycle is owner-scoped and never reveals ciphertext',async()=>{
 const oldEnv=Object.fromEntries(['SUPABASE_URL','SUPABASE_ANON_KEY',
   'GITHUB_TOKEN_ENCRYPTION_KEY'].map(x=>[x,process.env[x]]));
 const nativeFetch=globalThis.fetch;
 const previousPool=globalThis.__VIBESANE_PHASE1_TEST_DB__;
 const rows=new Map();
 let databaseFailure=false;
 let githubCalls=0;
 let server;
 try {
   process.env.SUPABASE_URL='https://supabase-staging-test.invalid';
   process.env.SUPABASE_ANON_KEY='synthetic-staging-publishable-test';
   process.env.GITHUB_TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('hex');
   globalThis.__VIBESANE_PHASE1_TEST_DB__={query:async(sql,params=[])=>{
     if(databaseFailure)throw new Error('synthetic DB is offline');
     if(sql.includes('INSERT INTO public.github_tokens')){
       rows.set(params[0],params[1]);return {rowCount:1,rows:[]};
     }
     if(sql.includes('SELECT 1 FROM public.github_tokens'))
       return {rowCount:rows.has(params[0])?1:0,rows:[]};
     if(sql.includes('SELECT encrypted_token FROM public.github_tokens')){
       const encrypted_token=rows.get(params[0]);
       return {rowCount:encrypted_token?1:0,
         rows:encrypted_token?[{encrypted_token}]:[]};
     }
     if(sql.includes('DELETE FROM public.github_tokens')){
       const yes=rows.delete(params[0]);return {rowCount:yes?1:0,rows:[]};
     }
     throw new Error('Unexpected SQL in route HTTP test');
   }};
   globalThis.fetch=async(input,init)=>{
     const url=String(input);
     if(url==='https://supabase-staging-test.invalid/auth/v1/user'){
       const token=init?.headers?.Authorization;
       const user=token===['Bearer','synthetic-user-jwt-A'].join(' ')?userA:
         token===['Bearer','synthetic-user-jwt-B'].join(' ')?userB:null;
       return new Response(user?JSON.stringify({id:user}):'Unauthorized',{
         status:user?200:401,headers:{'Content-Type':'application/json'},
       });
     }
     if(url.startsWith('https://api.github.com/user/repos?')){
       githubCalls++;
       if(init?.headers?.Authorization!=='Bearer '+githubToken)
         return new Response('Unauthorized',{status:401});
       return new Response(JSON.stringify([{
         id:12,name:'safe-test',full_name:'example/safe-test',
         private:true,html_url:'https://github.com/example/safe-test',
         updated_at:'2020-01-01T00:00:00Z',description:null,
       }]),{status:200,headers:{'Content-Type':'application/json'}});
     }
     return nativeFetch(input,init);
   };
   const bundle=await build({
     entryPoints:[path.join(scripts,'../src/routes/github.ts')],
     write:false,bundle:true,format:'cjs',platform:'node',target:'node20',
     packages:'external',logLevel:'silent',plugins:[{
       name:'phase1-dependency-stubs',
       setup(buildContext){
         buildContext.onResolve({filter:/^@workspace\/db$/},
           ()=>({path:'database',namespace:'phase1-test'}));
         buildContext.onResolve({filter:/^\.\.\/lib\/logger$/},
           ()=>({path:'logger',namespace:'phase1-test'}));
         buildContext.onLoad({filter:/.*/,namespace:'phase1-test'},(arg)=>({
           loader:'js',contents:arg.path==='database'?
             'export const pool=globalThis.__VIBESANE_PHASE1_TEST_DB__;':
             'export const logger={error(){},warn(){},info(){}};',
         }));
       }
     }],
   });
   const filename=path.join(scripts,'../src/routes/__phase1_http_test__.cjs');
   const m=new Module(filename);
   m.filename=filename;
   m.paths=Module._nodeModulePaths(path.dirname(filename));
   m._compile(bundle.outputFiles[0].text,filename);
   const router=m.exports.default;
   assert.ok(router,'Expected bundled GitHub route');
   const app=express();app.use(express.json());app.use(router);
   server=await new Promise(resolve=>{
     const s=app.listen(0,'127.0.0.1',()=>resolve(s));
   });
   const base='http://127.0.0.1:'+server.address().port;
   const send=(endpoint,who,method='GET',body)=>nativeFetch(base+endpoint,{
     method,headers:{
       ...(who?{'Authorization':'Bearer synthetic-user-jwt-'+who}:{}),
       ...(body?{'Content-Type':'application/json'}:{}),
     },...(body?{body:JSON.stringify(body)}:{}),
   });

   assert.equal((await send('/github/token/status')).status,401);
   assert.equal((await send('/github/token/status','INVALID')).status,401);
   const initial=await send('/github/token/status','A');
   assert.equal(initial.status,200);
   assert.equal(initial.headers.get('cache-control'),'no-store');
   assert.deepEqual(await initial.json(),{connected:false});
   assert.equal((await send('/github/token','A','POST',{token:''})).status,400);
   assert.equal((await send('/github/token','A','POST',{token:'a'.repeat(513)})).status,400);
   assert.equal((await send('/github/token',null,'POST',{token:githubToken})).status,401);
   assert.equal((await send('/github/token','A','POST',{token:githubToken})).status,200);
   assert.ok(rows.has(userA));
   assert.ok(!rows.get(userA).includes(githubToken),'Must store encrypted bytes only');
   assert.equal(rows.get(userA).split(':').length,3);
   assert.deepEqual(await (await send('/github/token/status','A')).json(),{connected:true});
   assert.deepEqual(await (await send('/github/token/status','B')).json(),{connected:false});
   assert.equal((await send('/github/repos','B')).status,404);
   const repositories=await send('/github/repos','A');
   assert.equal(repositories.status,200);
   const listed=await repositories.json();
   assert.equal(listed.length,1);
   assert.equal(listed[0].fullName,'example/safe-test');
   assert.ok(!JSON.stringify(listed).includes(githubToken));
   assert.ok(!JSON.stringify(listed).includes(rows.get(userA)));
   assert.equal(githubCalls,1);
   assert.equal((await send('/github/token','A','DELETE')).status,200);
   assert.deepEqual(await (await send('/github/token/status','A')).json(),{connected:false});
   assert.equal((await send('/github/repos','A')).status,404);
   databaseFailure=true;
   const outage=await send('/github/token/status','A');
   assert.equal(outage.status,503);
   assert.ok(!JSON.stringify(await outage.json()).includes(githubToken));
   assert.equal((await send('/github/token','A','DELETE')).status,500);
 }finally{
   if(server)await new Promise(resolve=>server.close(resolve));
   globalThis.fetch=nativeFetch;
   globalThis.__VIBESANE_PHASE1_TEST_DB__=previousPool;
   for(const [key,val] of Object.entries(oldEnv))
     if(val===undefined)delete process.env[key];else process.env[key]=val;
 }
});
