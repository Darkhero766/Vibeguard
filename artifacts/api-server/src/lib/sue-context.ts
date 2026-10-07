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
  const signalEvidence:Partial<Record<keyof ProductSignals,Evidence[]>>={};
  const allEvidence:Evidence[]=[];
  const set=(key:keyof ProductSignals,ev:Evidence[])=>{signalEvidence[key]=ev;allEvidence.push(...ev);};

  const pricing=combine(text(c,/\b(pricing|plans|price list|starting at|per month|per year)\b/i,"pricing_text"),text(c,/(?:\$|€|£|₹)\s?\d{1,5}(?:[.,]\d{1,2})?/i,"price_amount"),links(c,/pricing|plans|shop|store/i,"pricing_link"));
  const checkout=combine(text(c,/\b(add to cart|buy now|checkout|place order|complete purchase|subscribe now)\b/i,"checkout_action"),links(c,/checkout|cart|buy|order/i,"checkout_link"),forms(c,/checkout|payment|billing|order/i,"checkout_form"));
  const payment=combine(scripts(c,/stripe|paypal|razorpay|adyen|checkout\.com|dodo|paddle|lemonsqueezy|shopify|woocommerce/i,"payment_provider"),checkout);
  const auth=combine(links(c,/\b(login|log in|sign in|sign up|register|create account|account)\b/i,"authentication_link"),forms(c,/type=["'](?:email|password)["']|login|sign[- ]?up|register/i,"authentication_form"),scripts(c,/auth0|clerk|supabase|firebase.*auth|cognito|nextauth|auth\.js/i,"authentication_provider"));
  const account=combine(auth,text(c,/\b(create your account|your dashboard|workspace|profile settings)\b/i,"account_text"));
  const marketing=combine(
    forms(c,/newsletter|marketing|promotional|subscribe to (?:our )?(?:updates|emails)|mailchimp|klaviyo|convertkit|hubspot|brevo/i,"marketing_form"),
    scripts(c,/mailchimp|klaviyo|convertkit|hubspot|brevo/i,"marketing_provider"),
    text(c,/newsletter|subscribe to (?:our )?(?:updates|emails)|marketing emails|promotional emails|mailing list/i,"marketing_text")
  );
  const analytics=combine(
    scripts(c,/google-analytics|googletagmanager|gtag\(|plausible|posthog|mixpanel|amplitude|heap|hotjar|matomo|clarity|segment/i,"analytics_sdk",.96),
    text(c,/(?<!no\\s)(?<!without\\s)(?:uses?|using|powered by|analytics provider|analytics tools?)\\s+(?:google analytics|plausible|posthog|mixpanel|amplitude)/i,"analytics_disclosure",.94)
  );
  const cookie=combine(headers(c,"set-cookie","cookie_header"),scripts(c,/cookiebot|onetrust|cookieyes|cookieconsent|iubenda|osano/i,"cookie_platform"),text(c,/cookie preferences|manage cookies|accept cookies|cookie settings/i,"cookie_control"));
  const tracking=combine(
    analytics,
    scripts(c,/facebook\\.net|connect\\.facebook|doubleclick|googleadservices|hotjar|clarity|segment|pixel/i,"tracking_sdk",.96),
    text(c,/(?<!no\\s)(?<!without\\s)(?:uses?|using|we use|our use of)\\s+(?:tracking technologies|tracking pixels|web beacons|tracking scripts)/i,"tracking_disclosure",.94)
  );
  const aiProductText=combine(
    homeText(c,/\b(?:ai[- ]powered|ai assistant|ai agent|generative ai|chat with (?:our|the) ai|ask (?:our|the) ai|choose an? ai model|generate (?:text|images?|code|content|videos?|responses?))\b/i,"ai_functionality",.95),
    text(c,/\b(?:AI assistant|AI agent|AI-powered (?:tool|product|platform|assistant|agent)|generative AI)\b.{0,140}\b(?:generate|create|chat|prompt|model|assistant|agent)\b/i,"ai_functionality",.93),
    forms(c,/(?:\bprompt\b.{0,120}\b(?:generate|send|submit)\b|\b(?:AI assistant|AI agent|chat with AI|ask AI)\b)/i,"ai_input",.91)
  );
  const aiProvider=scripts(c,/api\.openai\.com|anthropic|generativelanguage|gemini|openrouter|replicate|huggingface/i,"ai_provider",.97);
  // A provider reference by itself is not enough; it must agree with a product-level AI signal.
  const ai=aiProductText.length>=1?combine(aiProductText,aiProvider):[];
  const aiData=combine(text(c,/(?:send|share|process|use|submit).{0,120}(?:AI|OpenAI|Anthropic|Gemini|model).{0,120}(?:data|information|content|prompt)/i,"ai_data_processing",.9),text(c,/(?:AI|model|OpenAI|Anthropic|Gemini).{0,120}(?:process|use).{0,120}(?:data|information|content)/i,"ai_data_processing",.9));
  // "Plans" or "pricing" alone does not prove a recurring subscription.
  // Require recurring-billing language or an explicit subscription/renewal signal.
  const subscription=combine(
    text(c,/\b(?:\$|€|£|₹)\s?\d+\s*\/\s*(?:month|year|week)\b/i,"subscription_text",.97),
    text(c,/\b(?:monthly|annual|yearly|weekly)\s+(?:subscription|plan|billing|price|fee)\b|\bbilled\s+(?:monthly|annually|yearly|weekly)\b|\bsubscription\b|\brecurring\s+(?:billing|payment|charge)\b|\brenews?\s+automatically\b/i,"subscription_text",.96),
    links(c,/subscription|monthly|annual|yearly|recurring/i,"subscription_link",.84)
  );
  const autoRenew=text(c,/auto[- ]?renew|automatically renew|renews automatically|recurring (?:charge|billing|payment)/i,"auto_renewal",.97);
  const ecommerce=combine(text(c,/add to cart|shopping cart|product catalog|product variants|shipping|quantity|order now|buy now/i,"ecommerce_flow",.93),links(c,/shop|store|cart|checkout/i,"ecommerce_navigation",.9),scripts(c,/shopify|woocommerce/i,"ecommerce_platform",.96),text(c,/\b(product|sku|in stock|out of stock)\b.{0,80}(?:\$|€|£|₹)\s?\d+/i,"ecommerce_product_price",.94));
  const marketplace=combine(text(c,/marketplace|seller|vendor|list your (?:product|service)|seller profile|buyer and seller/i,"marketplace_language",.94),text(c,/(?:listings|products|services).{0,120}(?:seller|vendor)/i,"marketplace_flow",.9));
  const ugc=combine(forms(c,/type=["']file["']|upload|comment|review|post|message|profile/i,"ugc_form",.9),text(c,/user[- ]generated|community posts|comments|reviews|upload your|public profile|create a post/i,"ugc_text",.9));
  const developerApi=combine(
    links(c,/\b(api|developers?)\b/i,"developer_navigation",.88),
    text(c,/api key|webhook|endpoint|sdk|developer platform|api access/i,"developer_functionality",.93)
  );
  const advertising=combine(scripts(c,/adsbygoogle|doubleclick|googlesyndication|facebook.*pixel|adservice/i,"advertising_sdk",.96),text(c,/advertise with us|sponsored content|advertisement|ad space/i,"advertising_text",.9));
  const personal=combine(forms(c,/type=["'](?:email|tel|text|password|date)["']|name=["'](?:email|phone|name|address)/i,"personal_data_form",.88),auth,marketing,text(c,/we collect|personal information|personal data|contact information/i,"personal_data_disclosure",.78));

  set("pricing",pricing);set("checkout",checkout);set("payments",payment);set("authentication",auth);set("accountCreation",account);
  set("personalDataCollection",personal);set("marketingCollection",marketing);set("analytics",analytics);set("cookies",cookie);set("tracking",tracking);
  set("ai",ai);set("aiGeneration",combine(text(c,/\b(?:generate|generation|generated output|image generation|text generation)\b/i,"ai_generation",.9),forms(c,/generate|prompt|ai assistant/i,"ai_generation_input",.9)));
  set("aiDataProcessing",aiData);set("userGeneratedContent",ugc);set("subscription",subscription);set("autoRenewal",autoRenew);set("advertising",advertising);
  set("ecommerce",ecommerce);set("marketplace",marketplace);set("developerApi",developerApi);
  set("persistentUserData",combine(auth,ugc,text(c,/save your|saved projects|history|profile|dashboard data/i,"persistent_data_text",.82)));
  const paidPricing=combine(
    text(c,/(?:\$|€|£|₹)\s?\d{1,5}(?:[.,]\d{1,2})?|\b(?:paid|pro|premium|business|enterprise)\s+(?:plan|tier|subscription)\b|\bstarting at\b/i,"paid_pricing",.91),
    text(c,/billed\s+(?:monthly|annually|yearly|weekly)|recurring\s+(?:billing|payment|charge)/i,"paid_billing",.94)
  );
  set("paidService",combine(payment,checkout,paidPricing,text(c,/paid service|paid plan|hire us|book a paid|starting at/i,"paid_service_text",.78)));
  set("highImpactAI",combine(
    ai,
    text(c,/\b(?:medical|diagnos(?:is|tic)|treatment|clinical|mental health|credit|loan|insurance|employment|hiring|recruitment|legal advice|financial advice|biometric|risk score|eligibility decision|fraud decision)\b/i,"high_impact_ai_context",.88)
  ));
  set("dataCommercialization",combine(
    text(c,/\b(?:sell|share|monetize|monetisation|monetization)\b.{0,100}\b(?:personal|user|customer)\s+(?:data|information)\b/i,"data_commercialization",.92),
    text(c,/targeted advertising|behavioral advertising|interest[- ]based advertising/i,"targeted_advertising",.88)
  ));
  set("commercialActivity",combine(pricing,payment,checkout,ecommerce,marketplace,text(c,/\b(hire|services|consulting|agency|plans|pricing|shop|store|buy|subscribe|book a call|request a quote)\b/i,"commercial_language",.72)));

  const signals={} as ProductSignals, signalConfidence:Partial<Record<keyof ProductSignals,number>>={};
  for(const key of Object.keys(signalEvidence) as Array<keyof ProductSignals>) { const r=sv(signalEvidence[key]??[]);signals[key]=r.detected;signalConfidence[key]=r.confidence; }
  const home=c.pages.find(p=>p.isHome)??c.pages[0];
  const dynamicRenderingLikely=c.pages.some(p=>p.text.length<220&&p.scripts.length>=5)||Boolean(home?.html.match(/<div[^>]*id=["'](?:root|app|__next|__nuxt)["'][^>]*>\s*<\/div>/i));
  const usefulPageSignals=c.pages.reduce((n,p)=>n+( /pricing|plans|product|features|shop|store|checkout|login|sign[- ]?up|account|dashboard|api|docs|community|services|about|contact|terms|privacy/i.test(p.text+" "+p.url.pathname) ? 1 : 0),0);
  const score=Math.max(.35,Math.min(1,
    .38+
    Math.min(c.pages.length,12)*.035+
    Math.min(usefulPageSignals,8)*.035+
    Math.min(c.pages.reduce((n,p)=>n+p.text.length,0),18000)/18000*.28-
    (dynamicRenderingLikely?.18:0)
  ));
  const classified=classify(signals,allEvidence);
  return {productTypes:classified.productTypes,commercialModel:classified.commercialModel,signals,signalConfidence,evidence:allEvidence.slice(0,80),confidence:classified.confidence*score,coverage:{pages:c.pages.length,linkedPages:Math.max(0,c.pages.length-1),forms:c.pages.reduce((n,p)=>n+p.forms.length,0),scripts:c.pages.reduce((n,p)=>n+p.scripts.length,0),dynamicRenderingLikely,score}};
}
