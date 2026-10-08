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
    ["text",page.text,type],["metadata",page.metadata,"metadata"],["structured",page.structuredData,"structured_data"]
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
  if (/(?:^|\/)(terms(?:-and-conditions)?|privacy(?:-policy)?|cookies?|cookie-policy|refunds?|returns?|cancellations?|acceptable-use|aup|legal|disclaimer|dpa|subprocessors?|security-policy)(?:\/|$)/i.test(p)) return true;

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
  return {productTypes:[...new Set(types)],commercialModel,confidence:Math.min(.98,.45+max*.45)};
}

export function buildProductContext(c:AuditCorpus):ProductContext {
  const surface=productSurface(c);
  const signalEvidence:Partial<Record<keyof ProductSignals,Evidence[]>>={};
  const allEvidence:Evidence[]=[];
  const set=(key:keyof ProductSignals,ev:Evidence[])=>{signalEvidence[key]=ev;allEvidence.push(...ev);};

  const pricing=combine(text(surface,/\b(pricing|plans|price list|starting at|per month|per year)\b/i,"pricing_text"),text(surface,/(?:\$|€|£|₹)\s?\d{1,5}(?:[.,]\d{1,2})?/i,"price_amount"),links(surface,/pricing|plans|shop|store/i,"pricing_link"));
  const checkout=combine(text(surface,/\b(add to cart|buy now|checkout|place order|complete purchase|subscribe now)\b/i,"checkout_action"),links(surface,/checkout|cart|buy|order/i,"checkout_link"),forms(surface,/checkout|payment|billing|order/i,"checkout_form"));
  const payment=combine(scripts(surface,/stripe|paypal|razorpay|adyen|checkout\.com|dodo|paddle|lemonsqueezy|shopify|woocommerce/i,"payment_provider"),checkout);
  const auth=combine(
    links(surface,/\b(login|log in|sign in|sign up|register|create account|account)\b/i,"authentication_link"),
    forms(surface,/type=["'](?:email|password)["']|login|sign[- ]?up|register|create account/i,"authentication_form"),
    text(surface,/\b(?:log in|login|sign in|sign up|register|create account|create an account|authentication|member account)\b/i,"authentication_text",.9),
    scripts(surface,/auth0|clerk|supabase|firebase.*auth|cognito|nextauth|auth\.js/i,"authentication_provider")
  );
  const account=combine(auth,text(surface,/\b(create your account|your dashboard|workspace|profile settings)\b/i,"account_text"));
  const marketing=combine(
    forms(surface,/newsletter|marketing|promotional|subscribe to (?:our )?(?:updates|emails)|mailchimp|klaviyo|convertkit|hubspot|brevo/i,"marketing_form"),
    scripts(surface,/mailchimp|klaviyo|convertkit|hubspot|brevo/i,"marketing_provider"),
    text(surface,/newsletter|subscribe to (?:our )?(?:updates|emails)|marketing emails|promotional emails|mailing list/i,"marketing_text")
  );
  const analytics=combine(
    scripts(surface,/google-analytics|googletagmanager|gtag\(|plausible|posthog|mixpanel|amplitude|heap|hotjar|matomo|clarity|segment/i,"analytics_sdk",.96),
    text(surface,/(?<!no\s)(?<!without\s)(?:uses?|using|powered by|analytics provider|analytics tools?)\s+(?:google analytics|plausible|posthog|mixpanel|amplitude)/i,"analytics_disclosure",.94)
  );
  const cookie=combine(
    headers(surface,"set-cookie","cookie_header"),
    scripts(surface,/cookiebot|onetrust|cookieyes|cookieconsent|iubenda|osano|document\.cookie/i,"cookie_platform"),
    text(surface,/cookie preferences|manage cookies|accept cookies|cookie settings/i,"cookie_control")
  );
  const tracking=combine(
    analytics,
    scripts(surface,/facebook\.net|connect\.facebook|doubleclick|googleadservices|hotjar|clarity|segment|pixel/i,"tracking_sdk",.96),
    text(surface,/(?<!no\s)(?<!without\s)(?:uses?|using|we use|our use of)\s+(?:tracking technologies|tracking pixels|web beacons|tracking scripts)/i,"tracking_disclosure",.94)
  );
  const aiProductText=combine(
    homeText(surface,/\b(?:ai[- ]powered|ai assistant|ai agent|generative ai|chat with (?:our|the) ai|ask (?:our|the) ai|choose an? ai model|generate (?:text|images?|code|content|videos?|responses?))\b/i,"ai_functionality",.95),
    text(surface,/\b(?:AI assistant|AI agent|AI-powered (?:tool|product|platform|assistant|agent)|generative AI)\b.{0,140}\b(?:generate|create|chat|prompt|model|assistant|agent)\b/i,"ai_functionality",.93),
    forms(surface,/(?:\bprompt\b.{0,120}\b(?:generate|send|submit)\b|\b(?:AI assistant|AI agent|chat with AI|ask AI)\b)/i,"ai_input",.91)
  );
  const aiProvider=scripts(surface,/api\.openai\.com|anthropic|generativelanguage|gemini|openrouter|replicate|huggingface/i,"ai_provider",.97);
  // A provider reference by itself is not enough; it must agree with a product-level AI signal.
  const ai=aiProductText.length>=1?combine(aiProductText,aiProvider):[];
  const aiData=combine(
    text(surface,/\b(?:send|share|upload|submit|transmit)\b.{0,100}\b(?:prompt|content|personal data|personal information|customer data|user data)\b.{0,100}\b(?:AI|model|OpenAI|Anthropic|Gemini|provider|API)\b/i,"ai_data_processing",.94),
    text(surface,/\b(?:AI|model|OpenAI|Anthropic|Gemini|provider|API)\b.{0,100}\b(?:process|store|retain|receive|access|use)\b.{0,100}\b(?:prompt|content|personal data|personal information|customer data|user data)\b/i,"ai_data_processing",.94)
  );
  // "Plans" or "pricing" alone does not prove a recurring subscription.
  // Require recurring-billing language or an explicit subscription/renewal signal.
  const subscription=combine(
    text(surface,/\b(?:\$|€|£|₹)\s?\d+\s*\/\s*(?:month|year|week)\b/i,"subscription_text",.97),
    text(surface,/\b(?:monthly|annual|yearly|weekly)\s+(?:subscription|plan|billing|price|fee)\b|\bbilled\s+(?:monthly|annually|yearly|weekly)\b|\bsubscription\b|\brecurring\s+(?:billing|payment|charge)\b|\brenews?\s+automatically\b/i,"subscription_text",.96),
    links(surface,/subscription|monthly|annual|yearly|recurring/i,"subscription_link",.84)
  );
  const autoRenew=text(surface,/auto[- ]?renew|automatically renew|renews automatically|recurring (?:charge|billing|payment)/i,"auto_renewal",.97);
  const ecommerce=combine(text(surface,/add to cart|shopping cart|product catalog|product variants|shipping|quantity|order now|buy now/i,"ecommerce_flow",.93),links(surface,/shop|store|cart|checkout/i,"ecommerce_navigation",.9),scripts(surface,/shopify|woocommerce/i,"ecommerce_platform",.96),text(surface,/\b(product|sku|in stock|out of stock)\b.{0,80}(?:\$|€|£|₹)\s?\d+/i,"ecommerce_product_price",.94));
  const marketplace=combine(text(surface,/marketplace|seller|vendor|list your (?:product|service)|seller profile|buyer and seller/i,"marketplace_language",.94),text(surface,/(?:listings|products|services).{0,120}(?:seller|vendor)/i,"marketplace_flow",.9));
  const ugc=combine(forms(surface,/type=["']file["']|upload|comment|review|post|message|profile/i,"ugc_form",.9),text(surface,/user[- ]generated|community posts|comments|reviews|upload your|public profile|create a post/i,"ugc_text",.9));
  const developerApi=combine(
    links(surface,/\b(api|developers?)\b/i,"developer_navigation",.88),
    text(surface,/api key|webhook|endpoint|sdk|developer platform|api access/i,"developer_functionality",.93)
  );
  const advertising=combine(scripts(surface,/adsbygoogle|doubleclick|googlesyndication|facebook.*pixel|adservice/i,"advertising_sdk",.96),text(surface,/advertise with us|sponsored content|advertisement|ad space/i,"advertising_text",.9));
  const personal=combine(
    forms(surface,/(?:type=["'](?:email|tel|password|date)["']|(?:name|id|autocomplete|placeholder)=["'][^"']*(?:email|e-?mail|phone|mobile|full[-_ ]?name|first[-_ ]?name|last[-_ ]?name|address|street|city|postal|zip|birth|dob|password|medical|health|biometric|genetic|passport|national.?id|aadhaar|ssn|social.?security|bank|account.?number)[^"']*["'])/i,"personal_data_form",.91),
    auth,
    marketing,
    text(surface,/\b(?:we|our)\s+(?:collect|process|store|retain|use)\s+(?:your\s+)?(?:personal|customer|user|contact|health|medical|biometric|genetic|financial|identity)\s+(?:data|information|records?)\b/i,"personal_data_disclosure",.91)
  );

  set("pricing",pricing);set("checkout",checkout);set("payments",payment);set("authentication",auth);set("accountCreation",account);
  set("personalDataCollection",personal);set("marketingCollection",marketing);set("analytics",analytics);set("cookies",cookie);set("tracking",tracking);
  set("ai",ai);set("aiGeneration",combine(
    text(surface,/\b(?:AI|artificial intelligence|model|assistant|agent)\b.{0,100}\b(?:generate|generation|generated|output|image|text|code)\b|\b(?:generate|generation|generated|output)\b.{0,100}\b(?:AI|artificial intelligence|model|assistant|agent)\b/i,"ai_generation",.92),
    forms(surface,/(?:\bprompt\b.{0,120}\b(?:generate|create|submit|send)\b|\b(?:AI assistant|AI agent|AI generator|generate (?:text|images?|code|content|responses?))\b)/i,"ai_generation_input",.92)
  ));
  const b2bProcessor=combine(
    text(surface,/\b(?:process|store|handle|access|receive)\b.{0,100}\b(?:customer|client|user)\s+(?:personal\s+)?data\b.{0,100}\b(?:on behalf of|for|from)\b.{0,100}\b(?:business|company|organization|enterprise|client)\b/i,"b2b_processor_relationship",.95),
    text(surface,/\b(?:DPA|data processing agreement|subprocessor|sub-processors?|processor)\b.{0,120}\b(?:customer|client|business|enterprise|company)\b/i,"processor_contract_signal",.96)
  );
  const sensitiveData=combine(
    text(surface,/\b(?:health|medical|diagnos(?:is|tic)|mental health|biometric|genetic|religious|sexual orientation|racial|ethnic|political|union|criminal record|passport|national id|aadhaar|ssn|social security|financial account|bank account)\b.{0,100}\b(?:data|information|records?|details?)\b/i,"sensitive_data_context",.93),
    forms(surface,/(?:health|medical|diagnos|biometric|genetic|religious|sexual|racial|ethnic|political|union|passport|national.?id|aadhaar|ssn|social.?security|bank|account.?number)/i,"sensitive_data_form",.93)
  );
  set("aiDataProcessing",aiData);set("b2bProcessor",b2bProcessor);set("sensitiveData",sensitiveData);set("userGeneratedContent",ugc);set("subscription",subscription);set("autoRenewal",autoRenew);set("advertising",advertising);
  set("ecommerce",ecommerce);set("marketplace",marketplace);set("developerApi",developerApi);
  set("persistentUserData",combine(auth,ugc,text(surface,/save your|saved projects|history|profile|dashboard data/i,"persistent_data_text",.82)));
  const paidPricing=combine(
    text(surface,/(?:\$|€|£|₹)\s?\d{1,5}(?:[.,]\d{1,2})?|\b(?:paid|pro|premium|business|enterprise)\s+(?:plan|tier|subscription)\b|\bstarting at\b/i,"paid_pricing",.91),
    text(surface,/billed\s+(?:monthly|annually|yearly|weekly)|recurring\s+(?:billing|payment|charge)/i,"paid_billing",.94)
  );
  set("paidService",combine(payment,checkout,paidPricing,text(surface,/paid service|paid plan|hire us|book a paid|starting at/i,"paid_service_text",.78)));
  set("highImpactAI",text(surface,/\b(?:AI|model|algorithm|automated)\b.{0,100}\b(?:diagnos(?:e|is|tic)|treatment recommendation|clinical decision|mental health assessment|credit decision|loan approval|insurance eligibility|employment decision|hiring decisions?|candidate screening|legal decision|financial decision|biometric identification|risk scoring|eligibility decision|fraud decision)\b|\b(?:diagnos(?:e|is|tic)|treatment recommendation|clinical decision|mental health assessment|credit decision|loan approval|insurance eligibility|employment decision|hiring decisions?|candidate screening|legal decision|financial decision|biometric identification|risk scoring|eligibility decision|fraud decision)\b.{0,100}\b(?:AI|model|algorithm|automated)\b/i,"high_impact_ai_context",.93));
  set("dataCommercialization",combine(
    text(surface,/\b(?:sell|share|monetize|monetisation|monetization)\b.{0,100}\b(?:personal|user|customer)\s+(?:data|information)\b/i,"data_commercialization",.92),
    text(surface,/targeted advertising|behavioral advertising|interest[- ]based advertising/i,"targeted_advertising",.88)
  ));
  set("commercialActivity",combine(pricing,payment,checkout,ecommerce,marketplace,text(surface,/\b(hire|services|consulting|agency|plans|pricing|shop|store|buy|subscribe|book a call|request a quote)\b/i,"commercial_language",.72)));

  const signals={} as ProductSignals, signalConfidence:Partial<Record<keyof ProductSignals,number>>={};
  for(const key of Object.keys(signalEvidence) as Array<keyof ProductSignals>) { const r=sv(signalEvidence[key]??[]);signals[key]=r.detected;signalConfidence[key]=r.confidence; }
  const home=c.pages.find(p=>p.isHome)??c.pages[0];
  // A React/Vite/Next shell is not, by itself, evidence that runtime-only
  // coverage is insufficient. We already inspect the rendered HTML, links,
  // forms, scripts, metadata and structured data. Only mark the crawl as
  // runtime-limited when the public HTML is genuinely sparse AND there are
  // several application scripts with little observable product content.
  const dynamicRenderingLikely=c.pages.some(p=>p.text.length<120&&p.scripts.length>=6);
  const usefulPageSignals=c.pages.reduce((n,p)=>n+( /pricing|plans|product|features|shop|store|checkout|login|sign[- ]?up|account|dashboard|api|docs|community|services|about|contact|terms|privacy/i.test(p.text+" "+p.url.pathname) ? 1 : 0),0);
  const score=Math.max(.35,Math.min(1,
    .38+
    Math.min(c.pages.length,12)*.035+
    Math.min(usefulPageSignals,8)*.035+
    Math.min(c.pages.reduce((n,p)=>n+p.text.length,0),18000)/18000*.28-
    (dynamicRenderingLikely?.18:0)
  ));
  const observedSignalCount=Object.values(signals).filter(Boolean).length;
  // A crawler that observes almost no product signals must not manufacture
  // confidence simply because the HTML is small and technically valid.
  const evidencePenalty=observedSignalCount===0 ? .12 : observedSignalCount<2 ? .06 : 0;
  const classified=classify(signals,allEvidence);
  return {productTypes:classified.productTypes,commercialModel:classified.commercialModel,signals,signalConfidence,evidence:allEvidence.slice(0,80),confidence:Math.max(.05,classified.confidence*score-evidencePenalty),coverage:{pages:c.pages.length,linkedPages:Math.max(0,c.pages.length-1),forms:c.pages.reduce((n,p)=>n+p.forms.length,0),scripts:c.pages.reduce((n,p)=>n+p.scripts.length,0),dynamicRenderingLikely,score}};
}
