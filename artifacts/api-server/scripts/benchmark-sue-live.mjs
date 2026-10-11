import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cases = [
  { name: "Stripe Billing", url: "https://stripe.com/billing", expect: ["pricing","payments","subscription","commercialActivity"], forbidTypes: [] },
  { name: "Shopify", url: "https://www.shopify.com", expect: ["ecommerce","commercialActivity"], expectTypes: ["ecommerce"], forbidTypes: [] },
  { name: "Challenge Brew", url: "https://challengebrew.com/", expect: [], forbidTypes: [] },
  { name: "GitHub", url: "https://github.com", expect: ["authentication","developerApi","commercialActivity"], expectTypes: ["developer_tool"], forbidTypes: [] },
  { name: "Wikipedia", url: "https://www.wikipedia.org", expect: [], forbidTypes: ["saas","ecommerce","developer_tool"], forbidSignals: ["ecommerce","developerApi","pricing","paidService"] },
];

const dir=await mkdtemp(join(tmpdir(),"sue-live-"));
const outfile=join(dir,"sue-checks.mjs");

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
}
function makePage(url,html,headers,isHome=true) {
  const links=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m=>({href:new URL(m[1],url).toString(),text:stripHtml(m[2])})).slice(0,300);
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map(m=>new URL(m[1],url).toString()).slice(0,120);
  const forms=[...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map(m=>({html:m[0]})).slice(0,50);
  const inputs=[...html.matchAll(/<(?:input|textarea|select)\b[^>]*>/gi)].map(m=>({type:m[0].match(/\btype\s*=\s*["']([^"']+)/i)?.[1]??"text",html:m[0]})).slice(0,100);
  return {url:new URL(url),html,text:stripHtml(html),links,scripts,forms,inputs,metadata:html.slice(0,20000),structuredData:"",headers,isHome};
}

try {
  await build({entryPoints:["./src/lib/sue-checks.ts"],bundle:true,format:"esm",platform:"node",outfile,external:["node:*"],logLevel:"silent"});
  const {runApplicabilityAwareChecks,CORE_CHECK_IDS}=await import(outfile);
  const results=[];
  for (const c of cases) {
    const started=Date.now();
    try {
      const response=await fetch(c.url,{redirect:"follow",signal:AbortSignal.timeout(12000),headers:{"user-agent":"VibeSane-SUE-Live-Benchmark/1.0"}});
      const html=await response.text();
      if(!response.ok) throw new Error("HTTP "+response.status);
      const page=makePage(response.url,html,response.headers,true);
      const origin=new URL(response.url).origin;
      const pages=[page];
      const policyHint=/(?:terms?|privacy|cookies?|legal|refund|returns?|cancellations?|acceptable-use|disclaimer|security-policy|data-processing|subprocessors?)/i;
      const candidates=new Set();
      for(const link of page.links) {
        try { const target=new URL(link.href,page.url); if(target.origin===origin && policyHint.test(link.text+" "+target.pathname)) candidates.add(target.toString()); } catch {}
      }
      for(const path of ["/terms","/terms-of-service","/terms-and-conditions","/privacy","/privacy-policy","/privacy-notice","/cookies","/cookie-policy","/legal"]) candidates.add(new URL(path,origin).toString());
      const policyPages=await Promise.allSettled([...candidates].slice(0,10).map(async targetUrl=>{
        const policyResponse=await fetch(targetUrl,{redirect:"follow",signal:AbortSignal.timeout(9000),headers:{"user-agent":"VibeSane-SUE-Live-Benchmark/1.0"}});
        if(!policyResponse.ok) return null;
        const policyUrl=new URL(policyResponse.url);
        if(policyUrl.origin!==origin) return null;
        const type=policyResponse.headers.get("content-type")??"";
        if(!/text\/html|application\/xhtml\+xml/i.test(type)) return null;
        return makePage(policyResponse.url,await policyResponse.text(),policyResponse.headers,false);
      }));
      for(const result of policyPages) if(result.status==="fulfilled"&&result.value&&!pages.some(p=>p.url.toString()===result.value.url.toString())) pages.push(result.value);
      const {context,checks}=runApplicabilityAwareChecks({pages,origin});
      const detected=c.expect.filter(k=>context.signals[k]);
      const missed=c.expect.filter(k=>!context.signals[k]);
      const missedTypes=(c.expectTypes??[]).filter(k=>!context.productTypes.includes(k));
      const forbiddenTypes=(c.forbidTypes??[]).filter(k=>context.productTypes.includes(k));
      const unexpectedSignals=(c.forbidSignals??[]).filter(k=>context.signals[k]);
      results.push({
        name:c.name,url:c.url,httpStatus:response.status,ms:Date.now()-started,
        productTypes:context.productTypes,commercialModel:context.commercialModel,signals:context.signals,
        confidence:Number(context.confidence.toFixed(3)),coverage:context.coverage,pagesEvaluated:pages.length,
        expectedSignals:c.expect,detectedSignals:detected,missedSignals:missed,
        expectedProductTypes:c.expectTypes??[],missedProductTypes:missedTypes,forbiddenProductTypes:forbiddenTypes,forbiddenSignals:unexpectedSignals,
        coreChecks:checks.filter(x=>CORE_CHECK_IDS.includes(x.id)).map(x=>({id:x.id,title:x.title,status:x.status,applicability:x.applicability,confidence:Number(x.confidence.toFixed(3)),evidence:x.evidence.slice(0,2).map(e=>({type:e.type,url:e.url,signal:e.signal,excerpt:e.excerpt}))})),
        pass:missed.length===0&&missedTypes.length===0&&forbiddenTypes.length===0&&unexpectedSignals.length===0,applicable:checks.filter(x=>x.applicability==="applicable").map(x=>x.id)
      });
    } catch (error) {
      results.push({name:c.name,url:c.url,pass:false,error:error instanceof Error?error.message:String(error)});
    }
  }
  const reachable=results.filter(x=>!x.error);
  const passed=reachable.filter(x=>x.pass).length;
  const report={
    generatedAt:new Date().toISOString(),
    total:results.length,reachable:reachable.length,passed,
    note:"This live smoke benchmark follows first-party policy links and probes common same-origin policy routes. It is not a legal-compliance oracle; expected product signals/types are conservative smoke expectations, and core outcomes require human review.",
    results
  };
  const serialized=JSON.stringify(report,null,2);
  console.log(serialized);
  if(process.env.SUE_LIVE_REPORT_PATH) await writeFile(process.env.SUE_LIVE_REPORT_PATH,serialized+"\n","utf8");
  if(reachable.length<3) throw new Error("Too few public benchmark sites were reachable.");
  if(passed/reachable.length<0.75) throw new Error("Live SUE signal benchmark fell below 75%.");
} finally {
  await rm(dir,{recursive:true,force:true});
}
