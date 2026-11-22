import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire, Module } from 'node:module';

const dir=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const express=require('express');

/**
 * Bounded local Express HTTP contract; Dodo/Auth/DB are synthetic and never
 * contacted. This does not prove a hosted test-mode payment or real webhook.
 */
test('Dodo checkout and owner-scoped billing sync fail closed without indefinite Pro', async()=>{
  const previous=Object.fromEntries([
    'VIBESANE_DEPLOYMENT_ENV','DODO_PAYMENTS_ENVIRONMENT','DODO_PAYMENTS_API_KEY',
    'DODO_PRO_PRODUCT_ID','VITE_APP_URL',
  ].map(k=>[k,process.env[k]]));
  const fetchBefore=globalThis.fetch;
  const dbBefore=globalThis.__VIBESANE_DODO_SYNC_TEST_DB__;
  const userId='f0140000-5500-4400-8800-000000000001';
  const product='pdt_synthetic_phase12_only';
  const key='synthetic_dodo_test_key_only';
  const stagingOrigin='https://vibesane-phase12-staging-web.onrender.com';
  const future=new Date(Date.now()+31*24*60*60*1000).toISOString();
  const expired=new Date(Date.now()-24*60*60*1000).toISOString();
  const writeLog=[];
  const providerRequests=[];
  let server;
  try {
    process.env.VIBESANE_DEPLOYMENT_ENV='staging';
    process.env.DODO_PAYMENTS_ENVIRONMENT='test_mode';
    process.env.DODO_PAYMENTS_API_KEY=key;
    process.env.DODO_PRO_PRODUCT_ID=product;
    process.env.VITE_APP_URL=stagingOrigin;
    const columns={
      usage:['dodo_customer_id','dodo_subscription_id','dodo_subscription_status','pro_source','pro_started_at'],
      dodo_webhook_events:['webhook_id','event_type','payload','processed','attempts','error_message','created_at','processed_at'],
      hackathon_redemptions:['owner','coupon_code'],
    };
    globalThis.__VIBESANE_DODO_SYNC_TEST_DB__={
      async query(sql,params=[]){
        const statement=String(sql);
        if(statement.includes('FROM information_schema.columns')){
          return {rows:Object.entries(columns).flatMap(([table_name,list])=>
            list.map(column_name=>({table_name,column_name}))),rowCount:15};
        }
        if(statement.includes('FROM auth.users WHERE id = $1')){
          return {rows:params[0]===userId?
            [{email:'owner@example.invalid',name:'Synthetic Owner'}]:[],rowCount:1};
        }
        if(statement.includes('INSERT INTO public.usage')){
          writeLog.push({id:params[0],expiry:params[2],subscription:params[4]});
          return {rowCount:1,rows:[]};
        }
        throw new Error('Unexpected synthetic SQL');
      },
    };
    globalThis.fetch=async(input,init={})=>{
      const url=String(input);
      if(!url.startsWith('https://test.dodopayments.com/')){
        throw new Error('Network blocked in synthetic Dodo HTTP test');
      }
      providerRequests.push({url,method:init.method||'GET',headers:init.headers});
      assert.equal(init.headers?.Authorization,'Bearer '+key);
      if(url.endsWith('/checkouts')){
        const payload=JSON.parse(String(init.body));
        assert.equal(payload.product_cart?.[0]?.product_id,product);
        assert.equal(payload.return_url,stagingOrigin+'/dashboard?upgraded=true');
        assert.equal(payload.cancel_url,stagingOrigin+'/pricing');
        return new Response(JSON.stringify({
          checkout_url:'https://checkout.example.invalid/sandbox-only',session_id:'synthetic-session',
        }),{status:200,headers:{'Content-Type':'application/json'}});
      }
      const id=url.slice(url.lastIndexOf('/')+1);
      if(id==='provider-error'){
        return new Response(JSON.stringify({message:'Provider included a confidential token in an error'}),{
          status:401,headers:{'Content-Type':'application/json'},
        });
      }
      const result={
        product_id:id==='wrong-product'?'different-product':product,
        status:id==='not-active'?'pending':'active',
        customer:{email:id==='wrong-email'?'other@example.invalid':'owner@example.invalid',
          customer_id:'synthetic-customer'},
        metadata:{user_id:id==='wrong-owner'?'another-account':userId},
        next_billing_date:id==='no-expiry'?null:id==='past-expiry'?expired:future,
        subscription_id:id,
      };
      return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
    };
    const bundle=await build({
      entryPoints:[path.join(dir,'../src/routes/dodo.ts')],
      bundle:true,write:false,format:'cjs',platform:'node',target:'node20',
      packages:'external',logLevel:'silent',
      plugins:[{name:'phase12-dodo-sync-injection',setup(buildContext){
        for(const [filter,name] of [
          [/^@workspace\/db$/,'database'],
          [/^\.\.\/middlewares\/rateLimit$/,'rateLimit'],
          [/^\.\.\/middlewares\/auth$/,'auth'],
          [/^\.\.\/lib\/plan$/,'plan'],
        ]){
          buildContext.onResolve({filter},()=>({path:name,namespace:'phase12-dodo-sync'}));
        }
        buildContext.onLoad({filter:/.*/,namespace:'phase12-dodo-sync'},args=>({
          loader:'js',
          contents:args.path==='database'
            ?'export const pool=globalThis.__VIBESANE_DODO_SYNC_TEST_DB__;'
            :args.path==='rateLimit'
              ?'export const rateLimit=()=>((_req,_res,next)=>next());'
              :args.path==='auth'
                ?'export const requireAuth=(req,res,next)=>{if(req.headers.authorization==="Bearer synthetic-owner"){req.userId="f0140000-5500-4400-8800-000000000001";next();}else{res.status(401).json({error:"Authentication required"});}};'
                :'export const PRO_SCAN_LIMIT=10;',
        }));
      }}],
    });
    const filename=path.join(dir,'../src/routes/__dodo_sync_http_test__.cjs');
    const module=new Module(filename);
    module.filename=filename;
    module.paths=Module._nodeModulePaths(path.dirname(filename));
    module._compile(bundle.outputFiles[0].text,filename);
    const app=express();
    app.use(express.json());
    app.use(module.exports.default);
    server=await new Promise(resolve=>{
      const s=app.listen(0,'127.0.0.1',()=>resolve(s));
    });
    const base='http://127.0.0.1:'+server.address().port;
    const send=(route,body,authenticated=true)=>fetchBefore(base+route,{
      method:'POST',
      headers:{'Content-Type':'application/json',
        ...(authenticated?{Authorization:'Bearer synthetic-owner'}:{})},
      body:JSON.stringify(body),
    });

    assert.equal((await send('/checkout',{coupon:''},false)).status,401);
    assert.equal(providerRequests.length,0,'Unauthenticated checkout must not call payment provider');
    const checkout=await send('/checkout',{coupon:''});
    assert.equal(checkout.status,200);
    assert.equal((await checkout.json()).checkout_url,'https://checkout.example.invalid/sandbox-only');
    assert.equal(writeLog.length,0,'Creating checkout cannot grant Pro');
    assert.ok(providerRequests.every(p=>p.url.startsWith('https://test.dodopayments.com/')),
      'Never contact live provider in synthetic staging contract');

    const good=await send('/billing/sync',{subscription_id:'good-subscription'});
    assert.equal(good.status,200);
    assert.equal((await good.json()).activated,true);
    assert.equal(writeLog.length,1,'Only a verified owned active subscription may grant Pro');
    assert.equal(writeLog[0].id,userId);
    assert.equal(writeLog[0].expiry,future);

    for(const [id,status] of [
      ['wrong-owner',403],['wrong-email',403],['wrong-product',409],
      ['not-active',409],['no-expiry',503],['past-expiry',503],
    ]){
      const response=await send('/billing/sync',{subscription_id:id});
      assert.equal(response.status,status,id+' must fail closed');
      assert.equal(writeLog.length,1,id+' must not activate Pro');
      const responseBody=JSON.stringify(await response.json());
      assert.ok(!responseBody.includes(key),'Server must not disclose provider key');
    }
    const providerFailure=await send('/billing/sync',{subscription_id:'provider-error'});
    assert.equal(providerFailure.status,503);
    assert.equal(writeLog.length,1);
    const errorPayload=JSON.stringify(await providerFailure.json());
    assert.ok(!/confidential token|synthetic_dodo_test_key_only/i.test(errorPayload),
      'Provider error body or key must not reach caller');
    assert.equal((await send('/billing/sync',{subscription_id:'good-subscription'},false)).status,401);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    globalThis.fetch=fetchBefore;
    if(dbBefore===undefined)delete globalThis.__VIBESANE_DODO_SYNC_TEST_DB__;
    else globalThis.__VIBESANE_DODO_SYNC_TEST_DB__=dbBefore;
    for(const [name,value] of Object.entries(previous)){
      if(value===undefined)delete process.env[name];else process.env[name]=value;
    }
  }
});
