import { Router } from "express";
import { pool } from "@workspace/db";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
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

function ipv4Private(ip:string):boolean {
  const octets=ip.split(".").map(Number);
  if(octets.length!==4||octets.some(n=>!Number.isInteger(n)||n<0||n>255)) return false;
  const [a,b]=octets;
  return a===10 || a===127 || a===0 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&b===168);
}

function ipv6Private(ip:string):boolean {
  const h=ip.toLowerCase().replace(/^\[|\]$/g,"");
  if(!h.includes(":")) return false;
  const mapped=h.match(/(?:^|:)ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if(mapped) {
    const n1=parseInt(mapped[1],16),n2=parseInt(mapped[2],16);
    const candidate=[n1>>8,n1&255,n2>>8,n2&255].join(".");
    if(ipv4Private(candidate)) return true;
  }
  const normalized=h.split("%")[0];
  return normalized==="::" || normalized==="::1" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb") ||
    normalized.startsWith("ff") || normalized.startsWith("0:0:0:0:0:0:");
}

function isPrivateAddress(ip:string):boolean {
  return isIP(ip)===4 ? ipv4Private(ip) : ipv6Private(ip);
}

function validateHost(hostname:string) {
  const host=hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if (
    host==="localhost" || host.endsWith(".localhost") || host==="metadata.google.internal" ||
    host==="0.0.0.0" || isPrivateAddress(host)
  ) throw new Error("Private or local network addresses cannot be audited.");
}

async function resolvePublicAddresses(hostname:string):Promise<string[]> {
  const host=hostname.toLowerCase().replace(/^\[|\]$/g,"");
  validateHost(host);
  if(isIP(host)) return [host];
  const records=await lookup(host,{all:true,verbatim:true});
  if(!records.length) throw new Error("The audit host did not resolve.");
  const addresses=[...new Set(records.map(r=>r.address))];
  if(addresses.some(isPrivateAddress)) throw new Error("The audit host resolves to a private or local network address.");
  return addresses;
}

type PublicResource = {status:number;headers:Headers;body:Buffer};

async function fetchPinnedResource(url:URL,maxBytes:number):Promise<PublicResource> {
  const resolved=await resolvePublicAddresses(url.hostname);
  const ip=resolved[0];
  return await new Promise((resolve,reject)=>{
    let settled=false;
    const fail=(error:unknown)=>{if(!settled){settled=true;reject(error);}};
    const options:any={
      hostname:ip,
      port:url.port?Number(url.port):(url.protocol==="https:"?443:80),
      path:url.pathname+url.search,
      method:"GET",
      headers:{"Host":url.host,"User-Agent":"VibeSane-Audit/2.0 (+https://vibesane.app)","Accept":"text/html,application/xhtml+xml,text/plain,*/*","Accept-Encoding":"identity"},
      ...(url.protocol==="https:"?{servername:url.hostname}:{}),
      timeout:FETCH_TIMEOUT_MS,
    };
    let req:any;
    const onResponse=(response:any)=>{
      const chunks:Buffer[]=[];let total=0;
      response.on("data",(chunk:Buffer)=>{total+=chunk.length;if(total>maxBytes){req.destroy(new Error("The response is too large for the public audit."));return;}chunks.push(chunk);});
      response.on("end",()=>{if(settled)return;settled=true;const headers=new Headers();for(const [name,value] of Object.entries(response.headers)){if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(", "):String(value));}resolve({status:response.statusCode??0,headers,body:Buffer.concat(chunks)});});
      response.on("error",fail);
    };
    req=url.protocol==="https:"?httpsRequest(options,onResponse):httpRequest(options,onResponse);
    req.on("timeout",()=>req.destroy(new Error("The audit request timed out.")));
    req.on("error",fail);
    req.end();
  });
}

async function fetchPublicResource(start:URL,maxBytes=MAX_HTML_BYTES) {
  let url=start;
  for(let i=0;i<=MAX_REDIRECTS;i++){
    validateHost(url.hostname);
    const resource=await fetchPinnedResource(url,maxBytes);
    if(resource.status>=300&&resource.status<400){
      const location=resource.headers.get("location");
      if(!location)throw new Error("The site returned a redirect without a destination.");
      url=new URL(location,url);
      if(!["http:","https:"].includes(url.protocol))throw new Error("The site redirected to an unsupported protocol.");
      continue;
    }
    return {...resource,url,redirectCount:i};
  }
  throw new Error("Too many redirects.");
}

async function fetchPublicPage(start:URL):Promise<{url:URL;html:string;headers:Headers;redirectCount:number}> {
  const resource=await fetchPublicResource(start,MAX_HTML_BYTES);
  if(resource.status<200||resource.status>=300)throw new Error("The site returned HTTP "+resource.status+".");
  const contentType=resource.headers.get("content-type")??"";
  if(!/text\/html|application\/xhtml\+xml/i.test(contentType))throw new Error("The URL did not return an HTML page. Audit a deployed web page or app landing page.");
  const html=resource.body.toString("utf8");
  return {url:resource.url,html,headers:resource.headers,redirectCount:resource.redirectCount};
}

type RobotsRule={allow:boolean;pattern:string};

function parseRobots(body:string,userAgent="VibeSane-Audit"):RobotsRule[] {
  const groups:Array<{agents:string[];rules:RobotsRule[]}>=[];let current:{agents:string[];rules:RobotsRule[]}|null=null;
  for(const raw of body.split(/\r?\n/)){
    const line=raw.replace(/#.*$/,"").trim();if(!line)continue;
    const m=line.match(/^([^:]+):\s*(.*)$/);if(!m)continue;
    const key=m[1].trim().toLowerCase(),value=m[2].trim();
    if(key==="user-agent"){if(!current||current.rules.length){current={agents:[],rules:[]};groups.push(current);}current.agents.push(value.toLowerCase());}
    else if((key==="allow"||key==="disallow")&&current)current.rules.push({allow:key==="allow",pattern:value});
  }
  const token=userAgent.toLowerCase();
  const matching=groups.filter(g=>g.agents.some(a=>a!=="*"&&token.includes(a)));
  return (matching.length?matching:groups.filter(g=>g.agents.includes("*"))).flatMap(g=>g.rules);
}

function robotsPatternMatches(pattern:string,path:string):boolean {
  if(!pattern)return false;
  let regex="^";
  for(const ch of pattern){
    if(ch==="*")regex+=".*";
    else if(ch==="$"&&regex.length>1)regex+="$";
    else if(".+?^()|[]{}\\".includes(ch))regex+="\\"+ch;
    else regex+=ch;
  }
  try{return new RegExp(regex).test(path);}catch{return false;}
}

function allowedByRobots(url:URL,rules:RobotsRule[]|null):boolean {
  if(rules===null)return false;
  let best:{allow:boolean;length:number}|null=null;
  const path=url.pathname+(url.search||"");
  for(const rule of rules){
    if(!robotsPatternMatches(rule.pattern,path))continue;
    const length=rule.pattern.replace(/[*$]/g,"").length;
    if(!best||length>best.length||(length===best.length&&rule.allow))best={allow:rule.allow,length};
  }
  return best?best.allow:true;
}

async function loadRobots(start:URL):Promise<RobotsRule[]|null> {
  try{
    const resource=await fetchPublicResource(new URL("/robots.txt",start),512_000);
    if(resource.status>=400&&resource.status<500)return [];
    if(resource.status<200||resource.status>=300)return null;
    return parseRobots(resource.body.toString("utf8"));
  }catch{return null;}
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
  const robots=await loadRobots(start);
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
      if(!allowedByRobots(u,robots)) continue;
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
      const candidateUrl=new URL(candidate.url);
      if(!allowedByRobots(candidateUrl,robots)) return null;
      const fetched=await fetchPublicPage(candidateUrl);
      return makePage(fetched,false);
    })
  );
  const pages:AuditPage[]=[homePage];
  for(const result of results){
    if(result.status!=="fulfilled"||!result.value) continue;
    const page=result.value;
    if(pages.some(p=>p.url.toString()===page.url.toString())) continue;
    pages.push(page);
  }
  return {corpus:{pages,origin:sameOrigin},redirectCount:home.redirectCount};
}

async function persistAuditRun(userId:string, report:{
  url:string; scannedAt:string; score:number; passed:number; review:number; missing:number; notApplicable:number;
  checks:unknown[]; productContext:unknown; redirectCount:number;
}):Promise<string|null>{
  try{
    const result=await pool.query(
      `INSERT INTO public.audit_runs
        (owner,url,scanned_at,score,passed,review,missing,not_applicable,redirect_count,product_context,checks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
       RETURNING id`,
      [
        userId,
        report.url,
        report.scannedAt,
        report.score,
        report.passed,
        report.review,
        report.missing,
        report.notApplicable,
        report.redirectCount,
        JSON.stringify(report.productContext),
        JSON.stringify(report.checks),
      ],
    );
    return typeof result.rows[0]?.id==="string" ? result.rows[0].id : null;
  }catch(error){
    return null;
  }
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
    const scannedAt=new Date().toISOString();
    const productContext={
      productTypes:context.productTypes,
      commercialModel:context.commercialModel,
      signals:context.signals,
      confidence:context.confidence,
      coverage:context.coverage,
    };
    const auditId=await persistAuditRun(req.userId!,{
      url:corpus.pages[0].url.toString(),
      scannedAt,
      score,
      passed,
      review,
      missing,
      notApplicable,
      checks,
      productContext,
      redirectCount,
    });

    res.json({
      auditId,
      url:corpus.pages[0].url.toString(),
      scannedAt,
      score,
      passed,
      review,
      missing,
      notApplicable,
      checks,
      productContext,
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

router.get("/audit/:id",requireAuth,async(req:AuthedRequest,res):Promise<void>=>{
  try{
    const id=String(req.params.id||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(id)){res.status(400).json({error:"Invalid audit id."});return;}
    const result=await pool.query(
      `SELECT id,url,scanned_at,score,passed,review,missing,not_applicable,redirect_count,product_context,checks
         FROM public.audit_runs
        WHERE id=$1 AND owner=$2
        LIMIT 1`,
      [id,req.userId!],
    );
    const row=result.rows[0];
    if(!row){res.status(404).json({error:"Audit report not found."});return;}
    res.json({
      auditId:row.id,
      url:row.url,
      scannedAt:row.scanned_at,
      score:row.score,
      passed:row.passed,
      review:row.review,
      missing:row.missing,
      notApplicable:row.not_applicable,
      checks:row.checks,
      productContext:row.product_context,
      redirectCount:row.redirect_count,
    });
  }catch(error){
    req.log.error({err:error},"Audit history lookup failed");
    res.status(500).json({error:"Unable to load the audit report."});
  }
});

export default router;
