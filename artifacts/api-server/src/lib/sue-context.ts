import {
  AuditCorpus,
  AuditPage,
  Evidence,
  ProductContext,
  ProductSignals,
} from "./sue-applicability";

function excerpt(v:string) { return v.replace(/\s+/g," ").trim().slice(0,240); }

function pageMatch(page:AuditPage, pattern:RegExp, signal:string, confidence=0.86, type:Evidence["type"]="text"):Evidence[] {
  const sources:[string,string,Evidence["type"]][] = [
    ["text",page.text,type],["html",page.html,type],["metadata",page.metadata,"metadata"],["structured",page.structuredData,"structured_data"]
  ];
  for (const [location,value,evidenceType] of sources) {
    const m=value.match(pattern);
    if (!m) continue;
    const i=Math.max(0,m.index ?? 0);
    return [{type:evidenceType,url:page.url.toString(),location,excerpt:excerpt(value.slice(Math.max(0,i-70),i+Math.max(120,m[0].length+70))),signal,confidence}];
  }
  return [];
}

export function text(c:AuditCorpus,p:RegExp,s:string,confidence=0.86) {
  const out:Evidence[]=[]; for (const page of c.pages) { out.push(...pageMatch(page,p,s,confidence)); if(out.length>=4) break; } return out.slice(0,4);
}
export function homeText(c:AuditCorpus,p:RegExp,s:string,confidence=0.9) {
  const page=c.pages.find(x=>x.isHome); return page ? pageMatch(page,p,s,confidence) : [];
}
export function links(c:AuditCorpus,p:RegExp,s:string,confidence=0.9) {
  const out:Evidence[]=[]; for(const page of c.pages) for(const l of page.links) {
    if(!p.test(l.text+" "+l.href)) continue;
    out.push({type:"link",url:page.url.toString(),location:"navigation/link",excerpt:excerpt(l.text+" → "+l.href),signal:s,confidence});
    if(out.length>=4) return out;
  } return out;
}
export function scripts(c:AuditCorpus,p:RegExp,s:string,confidence=0.94) {
  const out:Evidence[]=[]; for(const page of c.pages) for(const src of page.scripts) {
    if(!p.test(src)) continue;
    out.push({type:"script",url:page.url.toString(),location:"script[src]",excerpt:excerpt(src),signal:s,confidence});
    if(out.length>=4) return out;
  } return out;
}
export function forms(c:AuditCorpus,p:RegExp,s:string,confidence=0.88) {
  const out:Evidence[]=[]; for(const page of c.pages) for(const f of page.forms) {
    if(!p.test(f.html)) continue;
    out.push({type:"form",url:page.url.toString(),location:"form",excerpt:excerpt(f.html),signal:s,confidence});
    if(out.length>=4) return out;
  } return out;
}
export function headers(c:AuditCorpus,name:string,s:string,confidence=0.96) {
  const out:Evidence[]=[]; for(const page of c.pages) { const v=page.headers.get(name); if(v) out.push({type:"header",url:page.url.toString(),location:name,excerpt:excerpt(v),signal:s,confidence}); } return out;
}
export function combine(...groups:Evidence[][]) {
  const seen=new Set<string>(); const out:Evidence[]=[];
  for(const group of groups) for(const e of group) { const k=e.url+"|"+e.signal+"|"+e.excerpt; if(seen.has(k)) continue; seen.add(k); out.push(e); }
  return out.slice(0,8);
}

function isPolicySurface(page:AuditPage) {
  const p=page.url.pathname.toLowerCase();

  // Keep this deliberately simple: in a RegExp literal "/" must be escaped
  // exactly once. The previous expression contained "\\/" which caused
  // esbuild to terminate the regex early and report "Unexpected ?".
  if (/(?:^|\/)(?:terms(?:-and-conditions)?|privacy(?:-policy)?|cookies?|cookie-policy|refunds?|returns?|cancellations?|acceptable-use|aup|legal|disclaimer|dpa|subprocessors?|security-policy)(?:\/|$)/i.test(p)) return true;

  // Crawlers/tests can expose a legal document at the site root ("/"), so
  // pathname-only classification is insufficient. Treat a page as a policy
  // surface when its own heading/title is unmistakably legal and the body
  // contains legal/policy vocabulary. This prevents Terms text such as
  // "subscriptions may be used" from becoming product capability evidence.
  const sample = `${page.text} ${page.html}`.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
  const titleOrHeading = /<(?:title|h1|h2)[^>]*>[^<]*(?:terms(?: of service)?|privacy(?: policy)?|cookie policy|acceptable use|legal|disclaimer|refund|return policy|security policy)[^<]*<\/(?:title|h1|h2)>/i.test(page.html)
    || /^(?:terms(?: of service)?|privacy(?: policy)?|cookie policy|acceptable use policy|legal disclaimer|refund policy|return policy|security policy)\b/i.test(page.text.trim());
  const legalVocabulary = /\b(?:terms of service|terms and conditions|privacy policy|cookie policy|acceptable use|legal disclaimer|governing law|arbitration|limitation of liability|indemnification|intellectual property|data processing agreement)\b/i.test(sample);
  return titleOrHeading && legalVocabulary;
}

function productSurface(c:AuditCorpus):AuditCorpus {
  // Policy pages are evidence for policy presence, but must not be allowed to
  // manufacture product signals. Otherwise a Terms page mentioning
  // "subscription", "AI", "analytics", etc. can make those features appear
  // to exist even when the product does not use them.
  const pages=c.pages.filter(p=>!isPolicySurface(p));
  // If the crawl contains only policy/legal surfaces, do NOT fall back to one
  // of those pages. A legal document is evidence about policies, not evidence
  // that the product itself has the features described hypothetically inside
  // that document (e.g. subscriptions, AI, analytics, payments).
  return { ...c, pages };
}

function sv(evidence:Evidence[], fallback=0) {
  if(!evidence.length) return {detected:false,confidence:fallback,evidence};
  const types=new Set(evidence.map(e=>e.type)).size, pages=new Set(evidence.map(e=>e.url)).size;
  const boost=Math.min(.12,Math.max(0,types-1)*.04+Math.max(0,pages-1)*.02);
  return {detected:true,confidence:Math.min(.99,Math.max(...evidence.map(e=>e.confidence))+boost),evidence};
}

function classify(s:ProductSignals,evidence:Evidence[]) {
  const scores:Record<string,number>={}; const add=(k:string,n:number)=>scores[k]=(scores[k]??0)+n;
  if(s.authentication||s.accountCreation||s.persistentUserData) add("saas",.34);
  if(s.subscription||s.paidService) add("saas",.22);
  if(s.ecommerce) add("ecommerce",.85);
  if(s.marketplace) add("marketplace",.9);
  if(s.ai) add("ai_product",.82);
  if(s.developerApi) add("developer_tool",.72);
  if(s.authentication||s.ecommerce) add("web_app",.28);
  if(s.userGeneratedContent) add("community",.5);
  if(s.advertising) add("media",.5);
  const portfolioEvidence=evidence.filter(e=>/project|portfolio|case study|resume|selected work|designer|developer profile/i.test(e.excerpt??"")).length;
  if(portfolioEvidence>=2&&!s.commercialActivity&&!s.authentication&&!s.ecommerce) add("portfolio",.9);
  if(s.commercialActivity&&!s.ecommerce&&!s.authentication&&!s.subscription&&!s.paidService) add("service_business",.38);
  const types=Object.entries(scores).filter(([,v])=>v>=.48).sort((a,b)=>b[1]-a[1]).map(([k])=>k as ProductContext["productTypes"][number]);
  if(!types.length) types.push(s.commercialActivity?"other":"content");
  if(s.authentication&&!types.includes("web_app")) types.push("web_app");
  let commercialModel:ProductContext["commercialModel"]="unknown";
  if(s.subscription) commercialModel="subscription";
  else if(s.ecommerce&&s.checkout) commercialModel="one_time_purchase";
  else if(s.marketplace) commercialModel="marketplace";
  else if(s.paidService||s.payments||s.pricing) commercialModel="freemium";
  else if(s.advertising) commercialModel="advertising";
  else if(!s.commercialActivity) commercialModel="free";
  const max=Math.max(...Object.values(scores),0);