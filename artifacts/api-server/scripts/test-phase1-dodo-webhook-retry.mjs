import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHmac } from 'node:crypto';
import { createRequire, Module } from 'node:module';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const express=require('express');

test('signed Dodo webhooks retry partial failures atomically and avoid double entitlements',async()=>{
  const userId='f0010000-5500-4400-8800-000000000001';
  const email='dodo-retry-fixture@example.invalid';
  const eventId='synthetic-dodo-event-1';
  const key=randomBytes(32);
  const now=Math.floor(Date.now()/1000);
  const previous={
    VIBESANE_DEPLOYMENT_ENV:process.env.VIBESANE_DEPLOYMENT_ENV,
    DODO_PAYMENTS_ENVIRONMENT:process.env.DODO_PAYMENTS_ENVIRONMENT,
    DODO_WEBHOOK_SECRET:process.env.DODO_WEBHOOK_SECRET,
  };
  const events=new Map();
  const usage=new Map();
  let failOnce=true;
  let committed=0;
  let server;

  const schema={
    usage:['dodo_customer_id','dodo_subscription_id','dodo_subscription_status',
      'pro_source','pro_started_at'],
    dodo_webhook_events:['webhook_id','event_type','payload','processed','attempts',
      'error_message','created_at','processed_at'],
    hackathon_redemptions:['owner','coupon_code'],
  };
  const pool={
    async query(sql){
      if(String(sql).includes('FROM information_schema.columns'))
        return {rows:Object.entries(schema).flatMap(([table_name,cs])=>
          cs.map(column_name=>({table_name,column_name}))),rowCount:14};
      throw Error('Unexpected pool-level SQL');
    },
    async connect(){
      let txEvents, txUsage;
      return {
        async query(sql,params=[]){
          const normalized=String(sql).trim();
          if(normalized==='BEGIN'){
            txEvents=new Map([...events].map(([k,v])=>[k,{...v}]));
            txUsage=new Map([...usage].map(([k,v])=>[k,{...v}]));
            return {rowCount:0,rows:[]};
          }
          if(normalized==='COMMIT'){
            events.clear();for(const [k,v] of txEvents)events.set(k,v);
            usage.clear();for(const [k,v] of txUsage)usage.set(k,v);
            committed++;
            return {rowCount:0,rows:[]};
          }
          if(normalized==='ROLLBACK')return {rowCount:0,rows:[]};
          if(normalized.includes('INSERT INTO public.dodo_webhook_events')){
            const [webhookId,eventType,payload]=params;
            const prior=txEvents.get(webhookId);
            if(prior?.processed)return {rowCount:0,rows:[]};
            txEvents.set(webhookId,{webhookId,eventType,payload,
              processed:false,attempts:(prior?.attempts??0)+(prior?1:0)});
            return {rowCount:1,rows:[{id:'local-event-id'}]};
          }
          if(normalized.includes('SELECT id FROM auth.users WHERE id = $1 AND lower(email)')){
            return {rowCount:1,rows:params[0]===userId && params[1]===email?[{id:userId}]:[]};
          }
          if(normalized.includes('SELECT id FROM auth.users WHERE lower(email)')){
            return {rowCount:1,rows:params[0]===email?[{id:userId}]:[]};
          }
          if(normalized.includes('INSERT INTO public.usage')){
            if(failOnce){failOnce=false;throw Error('Synthetic one-time DB failure');}
            txUsage.set(params[0],{plan:'pro',subscription:params[4],source:params[6]});
            return {rowCount:1,rows:[]};
          }
          if(normalized.includes('UPDATE public.usage') &&
              normalized.includes('dodo_subscription_status')){
            const [subId,status]=params;
            let rows=0;
            for(const [id,row] of txUsage){
              if(row.subscription===subId &&
                  (['dodo','dodo_return_sync'].includes(row.source) ||
                    !normalized.includes("pro_source IN ('dodo', 'dodo_return_sync')"))){
                txUsage.set(id,{...row,plan:'free',status});
                rows++;
              }
            }
            return {rowCount:rows,rows:[]};
          }
          if(normalized.includes('UPDATE public.dodo_webhook_events')&&normalized.includes('processed = true')){
            const existing=txEvents.get(params[0]);
            if(!existing)throw Error('Missing pending event');
            existing.processed=true;
            return {rowCount:1,rows:[]};
          }
          throw Error('Unexpected tx SQL: '+normalized.slice(0,90));
        },
        release(){},
      };
    },
  };
  globalThis.__VIBESANE_DODO_RETRY_DB__=pool;
  try{
    process.env.VIBESANE_DEPLOYMENT_ENV='staging';
    process.env.DODO_PAYMENTS_ENVIRONMENT='test_mode';
    process.env.DODO_WEBHOOK_SECRET='whsec_'+key.toString('base64');
    const output=await build({
      entryPoints:[path.join(dir,'../src/routes/dodo.ts')],bundle:true,
      format:'cjs',platform:'node',target:'node20',write:false,
      packages:'external',logLevel:'silent',
      plugins:[{name:'dodo-test-dependency-injection',setup(b){
        const rules=[
          {filter:/^@workspace\/db$/,name:'database'},
          {filter:/^\.\.\/middlewares\/rateLimit$/,name:'rateLimit'},
          {filter:/^\.\.\/middlewares\/auth$/,name:'auth'},
          {filter:/^\.\.\/lib\/plan$/,name:'plan'},
        ];
        for(const rule of rules)b.onResolve({filter:rule.filter},()=>({
          path:rule.name,namespace:'dodo-test',
        }));
        b.onLoad({filter:/.*/,namespace:'dodo-test'},(a)=>({
          loader:'js',
          contents:a.path==='database'
            ? 'export const pool=globalThis.__VIBESANE_DODO_RETRY_DB__;'
            :a.path==='rateLimit'
              ? 'export const rateLimit=()=>((_req,_res,next)=>next());'
              :a.path==='auth'
                ? 'export const requireAuth=(_req,res)=>res.status(401).json({error:"no auth"});'
                : 'export const PRO_SCAN_LIMIT=10;',
        }));
      }}],
    });
    const filename=path.join(dir,'../src/routes/__dodo_retry_test__.cjs');
    const module=new Module(filename);module.filename=filename;
    module.paths=Module._nodeModulePaths(path.dirname(filename));
    module._compile(output.outputFiles[0].text,filename);
    const app=express();
    app.use(express.json({verify:(req,_res,b)=>{req.rawBody=b;}}));
    app.use(module.exports.default);
    server=await new Promise(resolve=>{
      const s=app.listen(0,'127.0.0.1',()=>resolve(s));
    });
    const base='http://127.0.0.1:'+server.address().port;
    const payload={
      type:'subscription.active',
      data:{
        product_id:'pdt_0NmsVBNuntowIFXXZKqKS',
        subscription_id:'synthetic-subscription-1',
        next_billing_date:new Date(Date.now()+31*24*60*60*1000).toISOString(),
        metadata:{user_id:userId},
        customer:{email,customer_id:'synthetic-customer'},
      },
    };
    const raw=JSON.stringify(payload);
    const sign=(id,body)=>'v1,'+createHmac('sha256',key).update(id+'.'+now+'.'+body).digest('base64');
    const send=(id,signed=true,body=payload)=>{
      const requestBody=JSON.stringify(body);
      return fetch(base+'/webhooks/dodo',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'webhook-id':id,
        'webhook-timestamp':String(now),
        ...(signed?{'webhook-signature':sign(id,requestBody)}:{}),
      },
      body:requestBody,
    });};
    assert.equal((await send(eventId,false)).status,401);
    assert.equal(events.size,0,'Unsigned payload must not touch database');
    const first=await send(eventId);
    assert.equal(first.status,500,'Transient failure must not be acknowledged');
    assert.equal(events.size,0,'Failed transaction must not consume the event ID');
    assert.equal(usage.size,0,'Failed transaction must not modify entitlement');
    const second=await send(eventId);
    assert.equal(second.status,200);
    assert.equal(events.get(eventId)?.processed,true);
    assert.equal(usage.get(userId)?.plan,'pro');
    assert.equal(usage.get(userId)?.subscription,'synthetic-subscription-1');
    const third=await send(eventId);
    assert.equal(third.status,200);
    assert.equal((await third.json()).duplicate,true);
    assert.equal(committed,2,'One completion and one no-op duplicate');
    assert.equal(usage.size,1);

    events.set('old-incomplete',{webhookId:'old-incomplete',processed:false,attempts:2});
    const recovered=await send('old-incomplete');
    assert.equal(recovered.status,200);
    assert.equal(events.get('old-incomplete')?.processed,true);
    assert.equal(events.get('old-incomplete')?.attempts,3);
    const otherAccountEvent={
      ...payload,type:'subscription.active',
      data:{...payload.data,metadata:{user_id:'f0010000-5500-4400-8800-000000000002'},
        subscription_id:'synthetic-wrong-owner'},
    };
    const wrongOwner=await send('synthetic-wrong-owner-event',true,otherAccountEvent);
    assert.equal(wrongOwner.status,200,'Signed but mismatched owner does not grant access');
    assert.equal(events.get('synthetic-wrong-owner-event')?.processed,true);
    assert.equal(usage.get(userId)?.subscription,'synthetic-subscription-1',
      'Wrong metadata user_id cannot override existing subscriber');

    const missingMetadataEvent={
      ...payload,type:'subscription.renewed',
      data:{...payload.data,metadata:undefined,
        subscription_id:'synthetic-missing-metadata'},
    };
    const missingMetadata=await send('synthetic-missing-metadata-event',true,missingMetadataEvent);
    assert.equal(missingMetadata.status,500,'Staging requires signed account binding');
    assert.equal(events.has('synthetic-missing-metadata-event'),false,
      'Missing account binding must rollback and remain retriable');
    assert.equal(usage.get(userId)?.subscription,'synthetic-subscription-1');

    // Dodo can schedule cancellation at the end of a paid period.
    // subscription.updated reflects that metadata change; access remains
    // valid until the provider eventually emits an effective termination.
    const scheduleCancel={
      ...payload,type:'subscription.updated',
      data:{...payload.data,cancel_at_next_billing_date:true,status:'active'},
    };
    const scheduled=await send('scheduled-cancel-at-end',true,scheduleCancel);
    assert.equal(scheduled.status,200);
    assert.equal(events.get('scheduled-cancel-at-end')?.processed,true);
    assert.equal(usage.get(userId)?.plan,'pro',
      'Scheduling future cancellation cannot revoke current paid-through Pro');

    const cancelled=(subscriptionId)=>({
      ...payload,type:'subscription.cancelled',
      data:{...payload.data,subscription_id:subscriptionId},
    });
    const oldCancel=await send('cancel-older',true,cancelled('synthetic-old-subscription'));
    assert.equal(oldCancel.status,200);
    assert.equal(usage.get(userId)?.plan,'pro',
      'Old cancellation by the same email must not revoke the active subscription');
    const currentCancel=await send('cancel-current',true,cancelled('synthetic-subscription-1'));
    assert.equal(currentCancel.status,200);
    assert.equal(usage.get(userId)?.plan,'free',
      'Cancellation of matching subscription must revoke Pro');

    // A later hackathon coupon can replace paid Pro but leave the old
    // subscription id populated. Old Dodo cancellation must not override it.
    usage.set(userId,{plan:'pro',source:'hackathon',
      subscription:'synthetic-subscription-1'});
    const staleCancel=await send('old-dodo-cancel-after-hackathon',
      true,cancelled('synthetic-subscription-1'));
    assert.equal(staleCancel.status,200);
    assert.equal(usage.get(userId)?.plan,'pro',
      'Old Dodo cancellation must not revoke hackathon Pro');
    assert.equal(usage.get(userId)?.source,'hackathon');

    // Signed on_hold/failed/expired events revoke matching Dodo entitlements.
    for(const type of ['subscription.on_hold','subscription.failed',
      'subscription.expired']){
      usage.set(userId,{plan:'pro',source:'dodo_return_sync',
        subscription:'synthetic-subscription-1'});
      const response=await send('synthetic-'+type,true,{
        ...payload,type,data:{...payload.data},
      });
      assert.equal(response.status,200,type);
      assert.equal(usage.get(userId)?.plan,'free',type+' must revoke Dodo Pro');
    }
    usage.set(userId,{plan:'free',source:'dodo',
      subscription:'synthetic-subscription-1'});

    const genericPayment={
      ...payload,type:'payment.succeeded',
      data:{...payload.data,product_id:'unrelated-one-time-product',
        subscription_id:null},
    };
    const paymentResult=await send('one-time-paid-event',true,genericPayment);
    assert.equal(paymentResult.status,200);
    assert.equal(usage.get(userId)?.plan,'free',
      'A successful unrelated one-time payment must not create a Pro subscription');

    const missingExpiry={
      ...payload,type:'subscription.renewed',
      data:{...payload.data,next_billing_date:undefined,expires_at:undefined},
    };
    const beforeMissingExpiry=usage.get(userId)?.plan;
    const missingExpiryResponse=await send('subscription-without-future-billing',true,missingExpiry);
    assert.equal(missingExpiryResponse.status,500,
      'Missing paid-through date must be retryable, not silently grant indefinite Pro');
    assert.equal(events.has('subscription-without-future-billing'),false,
      'Missing expiry must rollback and remain retryable');
    assert.equal(usage.get(userId)?.plan,beforeMissingExpiry,
      'Bad renewal must not change entitlement');

    const missingProduct={
      ...payload,type:'subscription.active',
      data:{...payload.data,product_id:undefined,
        subscription_id:'some-other-product'},
    };
    const invalidEvent=await send('missing-subscription-product',true,missingProduct);
    assert.equal(invalidEvent.status,500);
    assert.equal(events.has('missing-subscription-product'),false,
      'An invalid subscription event must rollback its idempotency entry');
    assert.equal(usage.get(userId)?.plan,'free',
      'An unverified product must not reactivate Pro');



  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    delete globalThis.__VIBESANE_DODO_RETRY_DB__;
    for(const [name,value] of Object.entries(previous))
      if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
});
