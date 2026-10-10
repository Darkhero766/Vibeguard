import { build } from "esbuild";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Public pilot set: 16 products listed in Made with Lovable's public project
// directory plus four non-builder controls. These are exploratory samples, not
// a random sample or a legal-compliance ground truth.
const sites = [
  {name:"Challenge Brew",url:"https://challengebrew.com/",group:"vibecoded",source:"https://madewithlovable.com/projects/challenge-brew"},
  {name:"PodPrime.ai",url:"https://podprime.ai/",group:"vibecoded",source:"https://madewithlovable.com/projects/podprimeai"},
  {name:"KraflIO",url:"https://kraflio.com/",group:"vibecoded",source:"https://madewithlovable.com/projects/kraflio",goldPolicyDocuments:[{type:"terms",url:"https://kraflio.com/terms",source:"https://kraflio.com/terms"},{type:"privacy",url:"https://kraflio.com/privacy",source:"https://kraflio.com/privacy"}]},
  {name:"Real Property Planning",url:"https://realpropertyplanning.com/",group:"vibecoded",source:"https://madewithlovable.com/projects/real-property-planning"},
  {name:"GradLoom",url:"https://gradloom.app/",group:"vibecoded",source:"https://madewithlovable.com/projects/gradloom",goldPolicyDocuments:[{type:"privacy",url:"https://gradloom.app/privacy",source:"https://gradloom.app/privacy"},{type:"security",url:"https://gradloom.app/security",source:"https://gradloom.app/security"},{type:"acceptable_use",url:"https://gradloom.app/acceptable-use",source:"https://gradloom.app/acceptable-use"},{type:"data_processing",url:"https://gradloom.app/data-processing",source:"https://gradloom.app/data-processing"},{type:"subprocessors",url:"https://gradloom.app/subprocessors",source:"https://gradloom.app/subprocessors"}]},
  {name:"Consile",url:"https://consile.app/",group:"vibecoded",source:"https://madewithlovable.com/projects/consile"},
  {name:"Hi-AI",url:"https://www.hi-ai.live/",group:"vibecoded",source:"https://madewithlovable.com/projects/hi-ai"},
  {name:"Kalyvox",url:"https://kalyvox.ai/",group:"vibecoded",source:"https://madewithlovable.com/projects/kalyvox",goldPolicyDocuments:[{type:"terms",url:"https://kalyvox.ai/en/terms",source:"https://kalyvox.ai/en/terms"},{type:"privacy",url:"https://kalyvox.ai/en/privacy",source:"https://kalyvox.ai/en/privacy"}]},
  {name:"GiftGenie",url:"https://mygiftgenie.io/",group:"vibecoded",source:"https://madewithlovable.com/projects/giftgenie"},
  {name:"AprenderGratis English App",url:"https://ingles.aprendergratis.es/",group:"vibecoded",source:"https://madewithlovable.com/projects/aprendergratis-english-learning-app-duolingo-style"},
  {name:"DomainSpark",url:"https://domainspark.fyi/",group:"vibecoded",source:"https://madewithlovable.com/projects/domain-name-search-tool"},
  {name:"PathPilot",url:"https://pathpilot.pro/",group:"vibecoded",source:"https://madewithlovable.com/projects/pathpilot-your-smart-and-personalized-ai-powered-career-copilot"},
  {name:"Smart UnRetirement",url:"https://smart-unretirement-hero.lovable.app/",group:"vibecoded",source:"https://madewithlovable.com/projects/empower-every-generation-to-thrive-with-ai"},
  {name:"Ideafy",url:"https://ideafy.dev/",group:"vibecoded",source:"https://madewithlovable.com/projects/ideafy",goldPolicyDocuments:[{type:"privacy",url:"https://ideafy.dev/privacy",source:"https://ideafy.dev/privacy"}]},
  {name:"Read It!",url:"https://readit.lovable.app/",group:"vibecoded",source:"https://madewithlovable.com/projects/read-it"},
  {name:"Lookitup AI",url:"https://lookitup-ai.lovable.app/",group:"vibecoded",source:"https://madewithlovable.com/projects/lookitup"},
  {name:"Stripe Billing",url:"https://stripe.com/billing",group:"control"},
  {name:"Shopify",url:"https://www.shopify.com/",group:"control"},
  {name:"GitHub",url:"https://github.com/",group:"control"},
  {name:"Wikipedia",url:"https://www.wikipedia.org/",group:"control"},
];

const commonPolicyPaths=[
  "/terms","/terms-of-service","/terms-of-use","/terms-and-conditions",
  "/privacy","/privacy-policy","/privacy-notice","/data-protection",
  "/cookies","/cookie-policy","/refund-policy","/returns",
  "/cancellation-policy","/legal","/legal/terms","/legal/privacy",
  "/ai-policy","/subprocessors"
];
const policyHint=/(?:terms|privacy|cookie|refund|return|cancel|legal|acceptable|disclaimer|security|dpa|subprocessor|data-protection|ai-policy|policy)/i;
const policyDocumentHint=/\b(?:terms of service|terms of use|terms and conditions|privacy policy|privacy notice|cookie policy|refund policy|cancellation policy|acceptable use policy|data processing agreement|legal disclaimer|security policy|legal notice)\b/i;
const checkIds=["L01","L02","L03","L04","L05","P01","P02","P03","P04","P05","P06","P07","P08","P09","P11","C01","C05","A01","A02","A03","A04","B02","B03","B04","B05","T05"];
const timeoutMs=9000;
const maxHtmlBytes=1_500_000;

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/\s+/g," ").trim();
}
function parseLinks(html,base) {
  const out=[];
  for(const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    try {
      const url=new URL(m[1].trim(),base);
      if(!["http:","https:"].includes(url.protocol)) continue;
      out.push({url:url.toString(),text:stripHtml(m[2]).slice(0,180)});
    } catch {}
  }
  return out;
}
function makePage(url,html,headers,isHome=false) {
  const links=parseLinks(html,url);
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)]
    .map(m=>{try{return new URL(m[1],url).toString()}catch{return m[1]}}).slice(0,120);
  const forms=[...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)].map(m=>({html:m[0].slice(0,20000)})).slice(0,50);
  const inputs=[...html.matchAll(/<(?:input|textarea|select)\b[^>]*>/gi)].map(m=>({type:m[0].match(/\btype\s*=\s*["']([^"']+)/i)?.[1]??"text",html:m[0]})).slice(0,100);
  const metadata=[...html.matchAll(/<(?:title|meta)\b[^>]*>/gi)].map(m=>m[0]).join(" ").slice(0,20000);
  const structuredData=[...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).join(" ").slice(0,50000);
  return {url:new URL(url),html,text:stripHtml(html),links:links.map(l=>({text:l.text,href:l.url})),scripts,forms,inputs,metadata,structuredData,headers,isHome};
}
function samePublicHost(a,b) {
  const normalize=host=>host.toLowerCase().replace(/^www\./,"");
  try { return normalize(new URL(a).hostname)===normalize(new URL(b).hostname); } catch { return false; }
}
async function fetchHtml(url,origin) {
  const response=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(timeoutMs),headers:{"user-agent":"VibeSane-SUE-Policy-Benchmark/1.0"}});
  if(!samePublicHost(response.url,origin)) return {ok:false,url:response.url,status:response.status,reason:"cross-origin redirect"};
  if(!response.ok) return {ok:false,url:response.url,status:response.status,reason:"HTTP "+response.status};
  const type=response.headers.get("content-type")??"";
  if(type&&!/text\/html|application\/xhtml\+xml/i.test(type)) return {ok:false,url:response.url,status:response.status,reason:"non-HTML content"};
  const bytes=await response.arrayBuffer();
  const html=new TextDecoder().decode(bytes.slice(0,maxHtmlBytes));
  return {ok:true,url:response.url,status:response.status,html,headers:new Headers(response.headers)};
}
async function crawlPolicies(site,runApplicabilityAwareChecks) {
  const started=Date.now();
  const start=new URL(site.url);
  try {
    const homeResult=await fetchHtml(start.toString(),start.origin);
    if(!homeResult.ok) return {name:site.name,url:site.url,group:site.group,source:site.source,reachable:false,error:homeResult.reason,httpStatus:homeResult.status,goldLabelStatus:site.goldPolicyDocuments?"manual_policy_document_presence":"pending_manual_review",goldPolicyDocuments:site.goldPolicyDocuments??[],goldComparison:(site.goldPolicyDocuments??[]).map(g=>({type:g.type,url:g.url,expected:"present",crawlResult:"not_evaluable_site_unreachable",source:g.source}))};
    const home=makePage(homeResult.url,homeResult.html,homeResult.headers,true);
    const candidates=[];
    const seen=new Set([home.url.toString()]);
    // Real legal links always take priority over guessed common routes.
    for(const link of home.links){
      try {
        const u=new URL(link.href);
        if(u.origin!==home.url.origin||!policyHint.test(link.text+" "+u.pathname)) continue;
        u.hash="";
        if(seen.has(u.toString())) continue;
        seen.add(u.toString()); candidates.push({url:u.toString(),source:"linked",label:link.text});
      } catch {}
    }
    for(const path of commonPolicyPaths){
      const u=new URL(path,home.url);
      if(seen.has(u.toString())) continue;
      seen.add(u.toString()); candidates.push({url:u.toString(),source:"fallback",label:path});
    }
    const chosen=candidates.slice(0,8);
    const fetched=await Promise.all(chosen.map(async candidate=>{
      try {
        const result=await fetchHtml(candidate.url,home.url.origin);
        if(!result.ok) return {...candidate,ok:false,status:result.status,reason:result.reason};
        const page=makePage(result.url,result.html,result.headers,false);
        const isPolicy=policyDocumentHint.test(page.text);
        return {...candidate,ok:true,status:result.status,page,isPolicy,policyHeading:page.text.slice(0,220)};
      } catch(error) {
        return {...candidate,ok:false,reason:error instanceof Error?error.message:String(error)};
      }
    }));
    const pages=[home,...fetched.filter(x=>x.ok&&x.page).map(x=>x.page)];
    const {context,checks}=runApplicabilityAwareChecks({pages,origin:home.url.origin});
    const policyPages=fetched.filter(x=>x.ok&&x.page&&x.isPolicy).map(x=>({
      url:x.page.url.toString(),discovery:x.source,policyTextDetected:policyDocumentHint.test(x.page.text),
      textLength:x.page.text.length,excerpt:x.page.text.slice(0,280)
    }));
    const policyLinks=home.links.filter(l=>policyHint.test(l.text+" "+l.href)).map(l=>({text:l.text,url:l.href})).slice(0,30);
    const selectedChecks=checks.filter(x=>checkIds.includes(x.id)).map(x=>({
      id:x.id,title:x.title,applicability:x.applicability,status:x.status,explanation:x.explanation,recommendation:x.recommendation,
      confidence:Number(x.confidence.toFixed(3)),evidence:x.evidence.slice(0,3).map(e=>({url:e.url,location:e.location,signal:e.signal,excerpt:e.excerpt}))
    }));
    const goldComparison=(site.goldPolicyDocuments??[]).map(g=>{
      const normalizePath=path=>{while(path.length>1&&path.endsWith("/"))path=path.slice(0,-1);return path;};
      const targetPath=normalizePath(new URL(g.url).pathname);
      const attempted=fetched.find(x=>{try{return normalizePath(new URL(x.url).pathname)===targetPath}catch{return false}});
      const verified=policyPages.some(x=>{try{return normalizePath(new URL(x.url).pathname)===targetPath}catch{return false}});
      return {type:g.type,url:g.url,expected:"present",source:g.source,crawlResult:verified?"found_and_verified":attempted?.ok?"route_fetched_but_policy_unverified":attempted?"route_attempted_failed":"not_discovered_by_crawl"};
    });
    return {
      name:site.name,url:site.url,group:site.group,source:site.source??null,reachable:true,httpStatus:homeResult.status,
      finalUrl:home.url.toString(),elapsedMs:Date.now()-started,
      crawl:{pagesFetched:pages.length,linkedPolicyCandidates:policyLinks.length,policyRoutesAttempted:chosen.length,
        policyRoutesSucceeded:fetched.filter(x=>x.ok).length,policyPagesDetected:policyPages.length,
        candidateResults:fetched.map(x=>({url:x.url,discovery:x.source,ok:x.ok,status:x.status??null,reason:x.reason??null,isPolicy:x.isPolicy??false}))},
      context:{productTypes:context.productTypes,commercialModel:context.commercialModel,confidence:Number(context.confidence.toFixed(3)),coverage:context.coverage,
        signals:Object.fromEntries(["pricing","checkout","payments","authentication","personalDataCollection","analytics","cookies","tracking","ai","aiDataProcessing","subscription","ecommerce","commercialActivity"].map(k=>[k,context.signals[k]]))},
      policyPages,checks:selectedChecks,
      goldPolicyDocuments:site.goldPolicyDocuments??[],
      goldComparison,
      goldLabelStatus:site.goldPolicyDocuments?"manual_policy_document_presence":"pending_manual_review",
      manualReviewNeeded:["Confirm actual product behaviour and which requirements apply.","For gold-labeled sites, verify whether each known policy document was discovered by the crawler; presence labels do not imply legal adequacy.","For every other site, read reachable policies in context and mark each selected check PASS/REVIEW/MISSING/N/A against a human-reviewed baseline.","Record whether an unverified route was actually unavailable, blocked, or simply not discovered."]
    };
  } catch(error) {
    return {name:site.name,url:site.url,group:site.group,source:site.source??null,reachable:false,error:error instanceof Error?error.message:String(error),elapsedMs:Date.now()-started};
  }
}

const dir=await mkdtemp(join(tmpdir(),"sue-vibecoded-policy-"));
const outfile=join(dir,"sue-checks.mjs");
try {
  await build({entryPoints:["./src/lib/sue-checks.ts"],bundle:true,format:"esm",platform:"node",outfile,external:["node:*"],logLevel:"silent"});
  const {runApplicabilityAwareChecks}=await import(outfile);
  const results=[];
  // A small concurrency cap avoids sending a burst of requests to one host.
  for(let i=0;i<sites.length;i+=4) {
    const batch=await Promise.all(sites.slice(i,i+4).map(site=>crawlPolicies(site,runApplicabilityAwareChecks)));
    results.push(...batch);
  }
  const reachable=results.filter(x=>x.reachable);
  const vibecoded=reachable.filter(x=>x.group==="vibecoded");
  const controls=reachable.filter(x=>x.group==="control");
  const goldDocs=results.flatMap(x=>x.goldComparison??[]);
  const report={
    generatedAt:new Date().toISOString(),
    title:"SUE Vibecoded Policy Benchmark",
    version:1,
    purpose:"Exploratory real-world policy discovery and evidence-quality benchmark; not a legal-compliance oracle.",
    sample:{target:sites.length,reachable:reachable.length,unreachable:results.length-reachable.length,vibecodedReachable:vibecoded.length,controlReachable:controls.length},
    aggregate:{
      policyPageDiscoverySites:reachable.filter(x=>x.crawl.policyPagesDetected>0).length,
      linkedPolicyCandidateSites:reachable.filter(x=>x.crawl.linkedPolicyCandidates>0).length,
      avgPagesFetched:reachable.length?Number((reachable.reduce((n,x)=>n+x.crawl.pagesFetched,0)/reachable.length).toFixed(2)):0,
      manuallyLabeledPolicyDocuments:goldDocs.length,
      goldDocumentDiscovery:Object.fromEntries(["found_and_verified","route_fetched_but_policy_unverified","route_attempted_failed","not_discovered_by_crawl","not_evaluable_site_unreachable"].map(state=>[state,goldDocs.filter(g=>g.crawlResult===state).length])),
      checkStatuses:Object.fromEntries(["pass","review","missing","not_applicable"].map(status=>[status,reachable.reduce((n,x)=>n+x.checks.filter(c=>c.status===status).length,0)]))
    },
    limitations:["Builder attribution comes from public project-directory listings and may not reflect the current hosting stack.","Static HTML fetching cannot execute client-side JavaScript; sparse shells must not be interpreted as proof that policies or features are absent.","Policy-document presence is manually labeled only for the explicitly listed gold documents; other sites still need manual review before precision/recall can be claimed.","A discovered phrase is evidence for review, not a legal conclusion."],
    results
  };
  const reportPath=process.env.SUE_POLICY_REPORT_PATH;
  if(reportPath) {
    await mkdir(dirname(reportPath),{recursive:true});
    await writeFile(reportPath,JSON.stringify(report,null,2)+"\n","utf8");
  }
  console.log(JSON.stringify(report,null,2));
  // The live corpus is exploratory: unreachable sites are recorded rather than
  // failing CI. Deterministic correctness remains covered by test:sue/benchmark:sue.
} finally {
  await rm(dir,{recursive:true,force:true});
}
