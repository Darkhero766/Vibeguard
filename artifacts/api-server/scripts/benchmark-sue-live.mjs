import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cases = [
  { name: "Stripe Billing", url: "https://stripe.com/billing", expect: ["pricing","payments","subscription","commercialActivity"] },
  { name: "Shopify", url: "https://www.shopify.com", expect: ["ecommerce","commercialActivity"] },
  { name: "OpenAI API", url: "https://openai.com/api/", expect: ["ai","developerApi","commercialActivity"] },
  { name: "GitHub", url: "https://github.com", expect: ["authentication","developerApi","commercialActivity"] },
  { name: "Wikipedia", url: "https://www.wikipedia.org", expect: [] },
];

const dir=await mkdtemp(join(tmpdir(),"sue-live-"));
const outfile=join(dir,"sue-checks.mjs");

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
}
function makePage(url,html,headers) {
  const links=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m=>({href:new URL(m[1],url).toString(),text:stripHtml(m[2])})).slice(0,300);
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map(m=>new URL(m[1],url).toString()).slice(0,120);
  const forms=[...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map(m=>({html:m[0]})).slice(0,50);
  const inputs=[...html.matchAll(/<(?:input|textarea|select)\b[^>]*>/gi)].map(m=>({type:m[0].match(/\btype\s*=\s*["']([^"']+)/i)?.[1]??"text",html:m[0]})).slice(0,100);
  return {url:new URL(url),html,text:stripHtml(html),links,scripts,forms,inputs,metadata:html.slice(0,20000),structuredData:"",headers,isHome:true};
}

try {
  await build({entryPoints:["./src/lib/sue-checks.ts"],bundle:true,format:"esm",platform:"node",outfile,external:["node:*"],logLevel:"silent"});
  const {runApplicabilityAwareChecks}=await import(outfile);
  const results=[];
  for (const c of cases) {
    const started=Date.now();
    try {
      const response=await fetch(c.url,{redirect:"follow",signal:AbortSignal.timeout(12000),headers:{"user-agent":"VibeSane-SUE-Live-Benchmark/1.0"}});
      const html=await response.text();
      if(!response.ok) throw new Error("HTTP "+response.status);
      const page=makePage(response.url,html,response.headers);
      const {context,checks}=runApplicabilityAwareChecks({pages:[page],origin:new URL(response.url).origin});
      const detected=c.expect.filter(k=>context.signals[k]);
      const missed=c.expect.filter(k=>!context.signals[k]);
      results.push({
        name:c.name,url:c.url,httpStatus:response.status,ms:Date.now()-started,
        productTypes:context.productTypes,commercialModel:context.commercialModel,
        confidence:Number(context.confidence.toFixed(3)),coverage:context.coverage,
        expectedSignals:c.expect,detectedSignals:detected,missedSignals:missed,
        pass:missed.length===0,applicable:checks.filter(x=>x.applicability==="applicable").map(x=>x.id)
      });
    } catch (error) {
      results.push({name:c.name,url:c.url,pass:false,error:error instanceof Error?error.message:String(error)});
    }
  }
  const reachable=results.filter(x=>!x.error);
  const passed=reachable.filter(x=>x.pass).length;
  console.log(JSON.stringify({
    generatedAt:new Date().toISOString(),
    total:results.length,reachable:reachable.length,passed,
    note:"This is a live smoke/evaluation harness, not a legal-compliance oracle. Expected signals are intentionally conservative and should be reviewed when a public site changes.",
    results
  },null,2));
  if(reachable.length<3) throw new Error("Too few public benchmark sites were reachable.");
  if(passed/reachable.length<0.75) throw new Error("Live SUE signal benchmark fell below 75%.");
} finally {
  await rm(dir,{recursive:true,force:true});
}
