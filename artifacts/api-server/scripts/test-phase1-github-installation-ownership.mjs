import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire, Module} from 'node:module';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const dir=path.dirname(fileURLToPath(import.meta.url));
const localRequire=createRequire(import.meta.url);
const express=localRequire('express');
const USER_A='a1330000-1001-4000-8000-000000000001';
const USER_B='b1330000-2002-4000-8000-000000000002';
const idA=101, idB=202, orgId=309;

test('GitHub App linking rejects foreign personal installations and unauthorized orgs',async()=>{
 const previousUrl=process.env.SUPABASE_URL;
 const previousKey=process.env.SUPABASE_ANON_KEY;
 const nativeFetch=globalThis.fetch;
 const previousFixture=globalThis.__GH_OWNERSHIP_TEST__;
 const priorDb=globalThis.__GH_OWNERSHIP_DB__;
 const linked=new Map();
 const installations=new Map([
  [9,{id:9,account:{id:idB,login:'user-b',type:'User'}}],
  [10,{id:10,account:{id:idA,login:'user-a',type:'User'}}],
  [11,{id:11,account:{id:orgId,login:'test-organization',type:'Organization'}}],
 ]);
 let permission='admin';
 let omitAuthIdentity=false;
 let omitPersistedIdentity=false;
 let simulatedAppError=null;
 let verificationCalls=0;
 let saveCount=0;
 let server;
 try{
  process.env.SUPABASE_URL='https://auth-fixture.invalid';
  process.env.SUPABASE_ANON_KEY='nonsecret-publishable-fixture';
  globalThis.__GH_OWNERSHIP_TEST__={
   getAppSlug:async()=> { if(simulatedAppError) throw simulatedAppError; return 'test-security-app'; },
   createInstallState:()=> 'signed-fixture-state',
   verifyInstallState:(state)=>state==='signed-fixture-state'?USER_A:null,
   getInstallation:async(id)=>installations.get(id)??{id,account:null},
   saveInstallation:async(owner,id,login,accountId,type)=>{
    saveCount++;linked.set(owner,{installationId:id,account:{login,id:accountId,type}});
   },
   getLinkedInstallationForUser:async(owner)=>linked.get(owner)??null,
   listInstallationRepos:async()=>[{fullName:'test-organization/safe-project'}],
  };
  globalThis.__GH_OWNERSHIP_DB__={
   async query(sql,params){
    if(String(sql).includes('FROM auth.identities')){
     const id=params[0]===USER_A?idA:params[0]===USER_B?idB:null;
     return {rows:id && !omitPersistedIdentity?[{provider_id:String(id)}]:[]};
    }
    return {rows:params[0]===USER_A?[{encrypted_token:'synthetic-no-secret'}]:[]};
   },
  };
  globalThis.fetch=async(input,init)=>{
   const url=String(input);
   if(url==='https://auth-fixture.invalid/auth/v1/user'){
    const header=init?.headers?.Authorization;
    const isA=header===['Bearer','fixture-jwt-A'].join(' ');
    const isB=header===['Bearer','fixture-jwt-B'].join(' ');
    const id=isA?USER_A:isB?USER_B:null;
    return new Response(id?JSON.stringify({
     id,
     identities: omitAuthIdentity?[]:[{provider:'github',provider_id:String(isA?idA:idB)}],
     user_metadata:{provider_id:String(isA?idB:idA)},
    }):'unauthorized',{status:id?200:401,headers:{'Content-Type':'application/json'}});
   }
   if(url==='https://api.github.com/user'){
    verificationCalls++;
    return new Response(JSON.stringify({id:idA}),{
      status:200,headers:{'Content-Type':'application/json'},
    });
   }
   if(url==='https://api.github.com/user/memberships/orgs/test-organization'){
    return new Response(JSON.stringify({
      role:permission,state:'active',organization:{id:orgId},
    }),{status:200,headers:{'Content-Type':'application/json'}});
   }
   throw Error('Unexpected URL in test: '+url);
  };
  const bundle=await build({
   entryPoints:[path.join(dir,'../src/routes/githubApp.ts')],
   bundle:true,write:false,format:'cjs',platform:'node',target:'node20',
   packages:'external',logLevel:'silent',
   plugins:[{name:'github-install-ownership-stubs',setup(b){
    b.onResolve({filter:/^@workspace\/db$/},
      ()=>({path:'db',namespace:'fixture'}));
    b.onResolve({filter:/^\.\.\/lib\/githubApp$/},
      ()=>({path:'githubApp',namespace:'fixture'}));
    b.onResolve({filter:/^\.\/crypto$/},
      ()=>({path:'crypto',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},arg=>({
     loader:'js',
     contents:arg.path==='db'
      ? 'export const pool=globalThis.__GH_OWNERSHIP_DB__;'
      :arg.path==='crypto'
       ? 'export const decryptToken=()=> "synthetic-github-fixture-token";'
       : 'export const getAppSlug=(...a)=>globalThis.__GH_OWNERSHIP_TEST__.getAppSlug(...a);'+
         'export const createInstallState=(...a)=>globalThis.__GH_OWNERSHIP_TEST__.createInstallState(...a);'+
         'export const verifyInstallState=(...a)=>globalThis.__GH_OWNERSHIP_TEST__.verifyInstallState(...a);'+
         'export const getInstallation=(...a)=>globalThis.__GH_OWNERSHIP_TEST__.getInstallation(...a);'+
         'export const saveInstallation=(...a)=>globalThis.__GH_OWNERSHIP_TEST__.saveInstallation(...a);'+
         'export const getLinkedInstallationForUser=(...a)=>globalThis.__GH_OWNERSHIP_TEST__.getLinkedInstallationForUser(...a);'+
         'export const listInstallationRepos=(...a)=>globalThis.__GH_OWNERSHIP_TEST__.listInstallationRepos(...a);',
    }));
   }}],
  });
  const filename=path.join(dir,'../src/routes/__github_app_ownership_test__.cjs');
  const m=new Module(filename);m.filename=filename;
  m.paths=Module._nodeModulePaths(path.dirname(filename));
  m._compile(bundle.outputFiles[0].text,filename);
  const app=express();
  app.use(express.json());app.use(m.exports.default);
  server=await new Promise(resolve=>{
    const s=app.listen(0,'127.0.0.1',()=>resolve(s));
  });
  const base='http://127.0.0.1:'+server.address().port;
  const send=(endpoint,user='A',method='GET',body)=>nativeFetch(base+endpoint,{
   method,
   headers:{
    Authorization:['Bearer','fixture-jwt-'+user].join(' '),
    ...(body?{'Content-Type':'application/json'}:{}),
   },
   ...(body?{body:JSON.stringify(body)}:{}),
  });

  assert.equal((await send('/github/app/install-url','A')).status,200);
  assert.equal((await send('/github/app/install-url','invalid')).status,401);
  simulatedAppError=new Error('GitHub App lookup failed: 401');
  const rejected=await send('/github/app/install-url','A');
  assert.equal(rejected.status,503);
  assert.equal((await rejected.json()).error,'GitHub App installation is temporarily unavailable');
  simulatedAppError=null;

  // Staging Auth can omit inline GitHub provider_id even when auth.identities
  // has a confirmed GitHub identity for the same independently validated JWT.
  // The route may fall back only to the Supabase-owned row for that user.
  omitAuthIdentity=true;
  assert.equal((await send('/github/app/install-url','A')).status,200,
    'Trusted database GitHub identity must allow install URL when Auth /user omits it');
  assert.equal((await send('/github/app/install-url','B')).status,200,
    'Identity fallback is scoped to each separately verified Auth owner');
  omitPersistedIdentity=true;
  assert.equal((await send('/github/app/install-url','A')).status,403,
    'No verified inline or database identity must deny App installation');
  omitPersistedIdentity=false;
  omitAuthIdentity=false;
  assert.equal((await send('/github/app/complete','A','POST',{
   installationId:9,state:'signed-fixture-state',
  })).status,403,'Cannot link a GitHub installation owned by another user');
  assert.equal(saveCount,0);
  assert.equal((await send('/github/app/complete','B','POST',{
   installationId:10,state:'signed-fixture-state',
  })).status,403,'A state for user A cannot authorize user B');
  assert.equal((await send('/github/app/complete','A','POST',{
   installationId:10,state:'tampered',
  })).status,403);
  omitAuthIdentity=true;
  assert.equal((await send('/github/app/complete','A','POST',{
   installationId:10,state:'signed-fixture-state',
  })).status,200,'App completion must support trusted DB identity fallback');
  assert.equal((await send('/github/app/repos','A')).status,200,
    'Linked repos must use verified DB identity for authorized owner');
  omitAuthIdentity=false;
  assert.equal((await send('/github/app/complete','A','POST',{
   installationId:10,state:'signed-fixture-state',
  })).status,200,'Matching Supabase/GitHub identity may link own install');
  assert.equal(saveCount,2,'Two authorized installation completions were tested');
  assert.equal((await send('/github/app/repos','A')).status,200);
  assert.equal((await send('/github/app/repos','B')).status,404);

  linked.set(USER_A,{installationId:9,account:installations.get(9).account});
  assert.equal((await send('/github/app/repos','A')).status,403,
    'Recheck ownership on every repos request, even for stored installations');

  assert.equal((await send('/github/app/complete','A','POST',{
    installationId:11,state:'signed-fixture-state',
  })).status,200,'Authorized organization admin can link organization');
  assert.equal(verificationCalls,1);
  permission='member';
  assert.equal((await send('/github/app/repos','A')).status,403,
    'Lost org-admin role must immediately deny repo access');
  permission='admin';
  assert.equal((await send('/github/app/repos','A')).status,200);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  globalThis.fetch=nativeFetch;
  globalThis.__GH_OWNERSHIP_TEST__=previousFixture;
  globalThis.__GH_OWNERSHIP_DB__=priorDb;
  if(previousUrl===undefined)delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL=previousUrl;
  if(previousKey===undefined)delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY=previousKey;
 }
});
