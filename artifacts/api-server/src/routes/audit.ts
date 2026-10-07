import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { consumeAuditScan, ensurePlanForUser } from "../lib/plan";
import { runApplicabilityAwareChecks } from "../lib/sue-checks";
import type { AuditCorpus, AuditPage } from "../lib/sue-applicability";

const router = Router();

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2_500_000;
const MAX_LINK_PAGES = 16;
const FETCH_TIMEOUT_MS = 8_000;

function normalizeUrl(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("Enter a public website or deployed app URL.");
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("That URL is not valid."); }
  if (!["http:","https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported.");
  if (url.port && !["80","443"].includes(url.port)) throw new Error("Only standard HTTP(S) ports are supported.");
  validateHost(url.hostname);
  url.hash = "";
  return url;
}

function validateHost(hostname:string) {
  const host=hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if (
    host==="localhost" || host.endsWith(".localhost") || host==="metadata.google.internal" ||
    host==="169.254.169.254" || host==="::1" || host==="0.0.0.0" || host==="127.0.0.1" ||
    /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) || /^169\.254\./.test(host)
  ) throw new Error("Private or local network addresses cannot be audited.");
}

async function fetchPublicPage(start:URL):Promise<{url:URL;html:string;headers:Headers;redirectCount:number}> {
  let url=start;
  for(let i=0;i<=MAX_REDIRECTS;i++){
    validateHost(url.hostname);
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
    let response:Response;
    try {
      response=await fetch(url,{redirect:"manual",signal:controller.signal,headers:{"User-Agent":"VibeSane-Audit/2.0 (+https://vibesane.app)"}});
    } finally { clearTimeout(timer); }
    if(response.status>=300&&response.status<400){
      const location=response.headers.get("location");
      if(!location) throw new Error("The site returned a redirect without a destination.");
      url=new URL(location,url);
      if(!["http:","https:"].includes(url.protocol)) throw new Error("The site redirected to an unsupported protocol.");
      continue;
    }
    if(!response.ok) throw new Error("The site returned HTTP "+response.status+".");
    const contentType=response.headers.get("content-type")??"";
    if(!/text\/html|application\/xhtml\+xml/i.test(contentType)) throw new Error("The URL did not return an HTML page. Audit a deployed web page or app landing page.");
    const length=Number(response.headers.get("content-length")??0);
    if(length>MAX_HTML_BYTES) throw new Error("The page is too large for the public audit.");
    const html=await response.text();
    if(Buffer.byteLength(html,"utf8")>MAX_HTML_BYTES) throw new Error("The page is too large for the public audit.");
    return {url,html,headers:response.headers,redirectCount:i};
  }
  throw new Error("Too many redirects.");
}

function stripHtml(html:string):string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi," ")
    .replace(/<svg[\s\S]*?<\/svg>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/\s+/g," ")
    .trim();
}

function links(html:string,base:URL):Array<{text:string;href:string}> {
  const found:Array<{text:string;href:string}>=[];
  const pattern=/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const match of html.matchAll(pattern)){
    const href=match[1].trim();
    const text=stripHtml(match[2]).toLowerCase();
    if(!href||href.startsWith("#")||/^javascript:/i.test(href)||/^mailto:/i.test(href)) continue;
    try {
      const absolute=new URL(href,base);
      if(["http:","https:"].includes(absolute.protocol)) found.push({text,href:absolute.toString()});
    } catch {}
  }
  return found;
}

function extractScripts(html:string,base:URL):string[] {
  const out:string[]=[];
  const srcPattern=/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for(const m of html.matchAll(srcPattern)){
    try { out.push(new URL(m[1],base).toString()); } catch { out.push(m[1]); }
  }
  const inline=/<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  for(const m of html.matchAll(inline)){
    const body=m[1].trim();
    if(body) out.push(body.slice(0,20000));
  }
  return out.slice(0,120);
}

function extractForms(html:string):Array<{html:string;action?:string;method?:string}> {
  const out:Array<{html:string;action?:string;method?:string}>=[];
  const pattern=/<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  for(const m of html.matchAll(pattern)){
    const attrs=m[1];
    const action=attrs.match(/\baction\s*=\s*["']([^"']+)["']/i)?.[1];
    const method=attrs.match(/\bmethod\s*=\s*["']([^"']+)["']/i)?.[1];
    out.push({html:m[0].slice(0,30000),action,method});
  }
  return out.slice(0,50);
}

function extractInputs(html:string):Array<{type:string;name?:string;placeholder?:string;html:string}> {
  const out:Array<{type:string;name?:string;placeholder?:string;html:string}>=[];
  const pattern=/<(?:input|textarea|select)\b[^>]*>/gi;
  for(const m of html.matchAll(pattern)){
    const tag=m[0];
    const type=tag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]??(tag.toLowerCase().startsWith("<textarea")?"textarea":"select");
    const name=tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
    const placeholder=tag.match(/\bplaceholder\s*=\s*["']([^"']+)["']/i)?.[1];
    out.push({type,name,placeholder,html:tag});
  }
  return out.slice(0,100);
}

function extractMetadata(html:string):string {
  const parts:string[]=[];
  for(const m of html.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/gi)) parts.push(stripHtml(m[1]));
  for(const m of html.matchAll(/<meta\b[^>]*(?:name|property)\s*=\s*["'][^"']+["'][^>]*>/gi)) parts.push(stripHtml(m[0]));
  for(const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi)) parts.push(m[0]);
  return parts.join(" ").slice(0,20000);
}

function extractStructuredData(html:string):string {
  const parts:string[]=[];
  for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) parts.push(m[1]);
  return parts.join(" ").slice(0,50000);
}

function makePage(fetched:{url:URL;html:string;headers:Headers;redirectCount:number},isHome:boolean):AuditPage {
  return {
    url:fetched.url,
    html:fetched.html,
    text:stripHtml(fetched.html),
    links:links(fetched.html,fetched.url),
    scripts:extractScripts(fetched.html,fetched.url),
    forms:extractForms(fetched.html),
    inputs:extractInputs(fetched.html),
    metadata:extractMetadata(fetched.html),
    structuredData:extractStructuredData(fetched.html),
    headers:fetched.headers,
    isHome,
  };
}

async function crawl(start:URL):Promise<{corpus:AuditCorpus;redirectCount:number}> {
  const home=await fetchPublicPage(start);
  const homePage=makePage(home,true);
  const sameOrigin=home.url.origin;
  // Build a scored first-party crawl instead of following only legal links.
  // Product applicability depends on seeing the actual product surface (pricing,
  // login, checkout, AI features, forms, etc.), not just Terms/Privacy pages.
  const candidateScores = new Map<string,{url:string;score:number}>();
  const pageSignal = /pricing|plans|product|features|solution|shop|store|cart|checkout|buy|order|subscription|billing|login|log[- ]?in|sign[- ]?up|register|account|dashboard|app|workspace|api|developers?|docs?|integrat|community|marketplace|seller|services?|consult|agency|about|contact|support|terms|privacy|cookie|refund|return|cancel|legal|acceptable|disclaimer|security|dpa|subprocessor|data|ai|assistant|generate/i;
  for(const l of homePage.links){
    try {
      const u=new URL(l.href);
      if(u.origin!==sameOrigin || !["http:","https:"].includes(u.protocol)) continue;
      u.hash="";
      const key=u.toString();
      if(key===home.url.toString()) continue;
      const hay=(l.text+" "+u.pathname+" "+u.search).toLowerCase();
      let score=pageSignal.test(hay)?2:0;
      if(/pricing|plans|product|features|shop|store|cart|checkout|login|sign[- ]?up|account|dashboard|api|docs|community|marketplace|services|about|ai|assistant|generate/i.test(hay)) score+=2;
      if(/terms|privacy|cookie|refund|return|cancel|legal|acceptable|disclaimer|security|dpa|subprocessor/i.test(hay)) score+=1;
      const previous=candidateScores.get(key);
      candidateScores.set(key,{url:key,score:Math.max(previous?.score??0,score)});
    } catch {}
  }
  const candidates=[...candidateScores.values()]
    .sort((a,b)=>b.score-a.score)
    .slice(0,MAX_LINK_PAGES);

  const results=await Promise.allSettled(
    candidates.map(async candidate=>{
      const fetched=await fetchPublicPage(new URL(candidate.url));
      return makePage(fetched,false);
    })
  );
  const pages:AuditPage[]=[homePage];
  for(const result of results){
    if(result.status!=="fulfilled") continue;
    if(pages.some(p=>p.url.toString()===result.value.url.toString())) continue;
    pages.push(result.value);
  }
  return {corpus:{pages,origin:sameOrigin},redirectCount:home.redirectCount};
}

router.post("/audit",requireAuth,async(req:AuthedRequest,res):Promise<void>=>{
  try {
    const plan=await ensurePlanForUser(req.userId!);
    if(!plan.unlimited&&plan.scansUsed>=plan.scansLimit){res.status(429).json({error:"Monthly scan limit reached ("+plan.scansLimit+").",plan});return;}

    const start=normalizeUrl(req.body?.url);
    const {corpus,redirectCount}=await crawl(start);
    const {context,checks}=runApplicabilityAwareChecks(corpus);

    const passed=checks.filter(x=>x.status==="pass").length;
    const review=checks.filter(x=>x.status==="review").length;
    const missing=checks.filter(x=>x.status==="missing").length;
    const notApplicable=checks.filter(x=>x.status==="not_applicable").length;
    const evaluatedCount=checks.length-notApplicable;
    const score=evaluatedCount===0?100:Math.round(((passed+review*.5)/evaluatedCount)*100);
    const updatedPlan=await consumeAuditScan(req.userId!);

    res.json({
      url:corpus.pages[0].url.toString(),
      scannedAt:new Date().toISOString(),
      score,
      passed,
      review,
      missing,
      notApplicable,
      checks,
      productContext:{
        productTypes:context.productTypes,
        commercialModel:context.commercialModel,
        signals:context.signals,
        confidence:context.confidence,
        coverage:context.coverage,
      },
      quota:updatedPlan,
      redirectCount,
    });
  } catch(error) {
    const message=error instanceof Error?error.message:"Audit failed.";
    const status=/limit reached/i.test(message)?429:/private|local|URL|HTML|redirect|HTTP/i.test(message)?400:502;
    req.log.error({err:error},"Audit failed");
    res.status(status).json({error:message});
  }
});

export default router;
