export type Applicability = "applicable" | "not_applicable" | "unknown";
export type RequirementStatus = "pass" | "review" | "missing" | "not_applicable";
export type Severity = "high" | "medium" | "low";

export type ProductType = "saas" | "ecommerce" | "marketplace" | "ai_product" | "developer_tool" | "mobile_app" | "web_app" | "agency" | "service_business" | "portfolio" | "community" | "content" | "media" | "nonprofit" | "other";
export type CommercialModel = "free" | "freemium" | "subscription" | "one_time_purchase" | "donation" | "advertising" | "marketplace" | "unknown";

export type Evidence = {
  type: "text" | "link" | "script" | "form" | "header" | "metadata" | "structured_data" | "page";
  url?: string;
  location?: string;
  excerpt?: string;
  signal: string;
  confidence: number;
};

export type ProductSignals = {
  pricing:boolean; checkout:boolean; payments:boolean; authentication:boolean; accountCreation:boolean;
  personalDataCollection:boolean; marketingCollection:boolean; analytics:boolean; cookies:boolean; tracking:boolean;
  ai:boolean; aiGeneration:boolean; aiDataProcessing:boolean; userGeneratedContent:boolean; subscription:boolean;
  autoRenewal:boolean; advertising:boolean; ecommerce:boolean; marketplace:boolean; developerApi:boolean;
  persistentUserData:boolean; paidService:boolean; commercialActivity:boolean;
};

export type ProductContext = {
  productTypes: ProductType[];
  commercialModel: CommercialModel;
  signals: ProductSignals;
  signalConfidence: Partial<Record<keyof ProductSignals, number>>;
  evidence: Evidence[];
  confidence: number;
  coverage: { pages:number; linkedPages:number; forms:number; scripts:number; dynamicRenderingLikely:boolean; score:number };
};

export type AuditPage = {
  url: URL;
  html: string;
  text: string;
  links: Array<{text:string;href:string}>;
  scripts: string[];
  forms: Array<{html:string;action?:string;method?:string}>;
  inputs: Array<{type:string;name?:string;placeholder?:string;html:string}>;
  metadata: string;
  structuredData: string;
  headers: Headers;
  isHome: boolean;
};
export type AuditCorpus = { pages: AuditPage[]; origin:string };

export type AuditCheck = {
  id:string; category:string; title:string; applicability:Applicability; status:RequirementStatus;
  severity:Severity; confidence:number; evidence:Evidence[]; explanation:string; recommendation:string;
};

export type Rule = {
  always?:boolean;
  anySignals?:Array<keyof ProductSignals>;
  allSignals?:Array<keyof ProductSignals>;
  productTypes?:ProductType[];
  unknownIfLowCoverage?:boolean;
};

export function hasProduct(ctx:ProductContext, types:ProductType[]) { return types.some(t => ctx.productTypes.includes(t)); }
export function signal(ctx:ProductContext, key:keyof ProductSignals, min=0.55) { return Boolean(ctx.signals[key]) && (ctx.signalConfidence[key] ?? 0) >= min; }

export function evaluateApplicability(rule:Rule, ctx:ProductContext):Applicability {
  if (rule.always) return "applicable";
  if (rule.allSignals?.length && rule.allSignals.every(k => signal(ctx,k))) return "applicable";
  if (rule.anySignals?.length && rule.anySignals.some(k => signal(ctx,k))) return "applicable";
  if (rule.productTypes?.length && hasProduct(ctx,rule.productTypes)) return "applicable";
  if (rule.unknownIfLowCoverage && ctx.coverage.score < 0.65) return "unknown";
  return "not_applicable";
}

export function legalApplicable(ctx:ProductContext) {
  return ctx.signals.personalDataCollection || ctx.signals.authentication || ctx.signals.ecommerce || ctx.signals.subscription || ctx.signals.paidService || hasProduct(ctx,["saas","marketplace","ai_product","developer_tool","community","service_business"]);
}

export function finalizeRequirement(applicability:Applicability, evidence:Evidence[], ctx:ProductContext):RequirementStatus {
  if (applicability === "not_applicable") return "not_applicable";
  if (applicability === "unknown") return "review";
  if (evidence.length > 0) return "pass";
  if (ctx.coverage.score < 0.58 || ctx.coverage.dynamicRenderingLikely) return "review";
  return "missing";
}

export function confidence(ctx:ProductContext, evidence:Evidence[]) {
  const evidenceConfidence = evidence.length ? Math.max(...evidence.map(e => e.confidence)) : 0.45;
  return Math.max(0.45, Math.min(0.99, ctx.confidence * 0.55 + evidenceConfidence * 0.45));
}
