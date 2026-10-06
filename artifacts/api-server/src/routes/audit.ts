import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";
import { consumeAuditScan, ensurePlanForUser } from "../lib/plan";

const router = Router();

type AuditStatus = "pass" | "review" | "missing";
type Severity = "high" | "medium" | "low";
type AuditCheck = {
  id: string;
  category: string;
  title: string;
  status: AuditStatus;
  severity: Severity;
  explanation: string;
  recommendation: string;
};

const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 2_500_000;
const MAX_LINK_PAGES = 8;
const FETCH_TIMEOUT_MS = 12_000;

function normalizeUrl(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("Enter a public website or deployed app URL.");
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error("That URL is not valid."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are supported.");
  if (url.username || url.password) throw new Error("URLs containing credentials are not supported.");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Only standard HTTP(S) ports are supported.");
  validateHost(url.hostname);
  url.hash = "";
  return url;
}

function validateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "metadata.google.internal" ||
    host === "169.254.169.254" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "127.0.0.1" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host)
  ) throw new Error("Private or local network addresses cannot be audited.");
}

async function fetchPublicPage(start: URL): Promise<{ url: URL; html: string; headers: Headers; redirectCount: number }> {
  let url = start;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    validateHost(url.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "VibeSane-Audit/1.0 (+https://vibesane.app)" },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The site returned a redirect without a destination.");
      url = new URL(location, url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("The site redirected to an unsupported protocol.");
      continue;
    }

    if (!response.ok) throw new Error(`The site returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error("The URL did not return an HTML page. Audit a deployed web page or app landing page.");
    }

    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_HTML_BYTES) throw new Error("The page is too large for the public audit.");

    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new Error("The page is too large for the public audit.");
    return { url, html, headers: response.headers, redirectCount: i };
  }
  throw new Error("Too many redirects.");
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function links(html: string, base: URL): Array<{ text: string; href: string }> {
  const found: Array<{ text: string; href: string }> = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = match[1].trim();
    const text = stripHtml(match[2]).toLowerCase();
    if (!href || href.startsWith("#") || /^javascript:/i.test(href) || /^mailto:/i.test(href)) continue;
    try {
      const absolute = new URL(href, base);
      if (["http:", "https:"].includes(absolute.protocol)) found.push({ text, href: absolute.toString() });
    } catch { /* ignore malformed links */ }
  }
  return found;
}

function hasText(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasLink(linkList: Array<{ text: string; href: string }>, patterns: RegExp[]): boolean {
  return linkList.some((link) => hasText(`${link.text} ${link.href}`, patterns));
}

function check(
  id: string,
  category: string,
  title: string,
  ok: boolean | "review",
  severity: Severity,
  explanation: string,
  recommendation: string,
): AuditCheck {
  return {
    id,
    category,
    title,
    status: ok === true ? "pass" : ok === "review" ? "review" : "missing",
    severity,
    explanation,
    recommendation,
  };
}

async function fetchLinkedLegalPages(pageLinks: Array<{ text: string; href: string }>, origin: string) {
  const keywords = /(terms|privacy|cookie|refund|return|cancel|legal|acceptable|disclaimer|policy|security|ai|data|dpa|subprocessor)/i;
  const candidates = pageLinks
    .filter((link) => {
      try { return new URL(link.href).origin === origin && keywords.test(`${link.text} ${link.href}`); }
      catch { return false; }
    })
    .slice(0, MAX_LINK_PAGES);

  const pages: string[] = [];
  for (const candidate of candidates) {
    try {
      const page = await fetchPublicPage(new URL(candidate.href));
      pages.push(stripHtml(page.html));
    } catch { /* the homepage result is still useful */ }
  }
  return pages.join(" ");
}

function runChecks(input: {
  url: URL;
  html: string;
  text: string;
  links: Array<{ text: string; href: string }>;
  linkedText: string;
  headers: Headers;
}): AuditCheck[] {
  const allText = `${input.text} ${input.linkedText}`;
  const linkText = input.links.map((l) => `${l.text} ${l.href}`).join(" ");
  const combined = `${allText} ${linkText}`;
  const hasPrivacy = hasLink(input.links, [/(privacy|data protection|privacy notice)/i]) || /privacy policy|privacy notice/i.test(allText);
  const hasTerms = hasLink(input.links, [/(terms|terms of service|terms & conditions|legal)/i]) || /terms of service|terms and conditions/i.test(allText);
  const hasCookie = hasLink(input.links, [/(cookie policy|cookies)/i]) || /cookie policy|cookie notice/i.test(allText);
  const hasRefund = hasLink(input.links, [/(refund|return policy|money back)/i]) || /refund policy|refunds|money[- ]back/i.test(allText);
  const hasCancel = hasLink(input.links, [/(cancel|cancellation)/i]) || /cancellation policy|cancel (your )?subscription/i.test(allText);
  const hasAcceptable = hasLink(input.links, [/(acceptable use|aup)/i]) || /acceptable use policy/i.test(allText);
  const hasDisclaimer = hasLink(input.links, [/(disclaimer)/i]) || /disclaimer/i.test(allText);
  const hasCopyright = /©|copyright|all rights reserved/i.test(combined);
  const hasContact = /(?:contact|support|help)\s*(?:us|center|team)?/i.test(combined) || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(combined);
  const hasBusinessIdentity = /(?:\b(?:inc|llc|ltd|limited|private limited|pvt\.?\s*ltd|company|corporation)\b)/i.test(allText);
  const hasSupport = /support|help center|customer service/i.test(combined);
  const hasGoverningLaw = /governing law|jurisdiction|laws of|courts of/i.test(allText);
  const hasAge = /(?:18\+|13\+|16\+|minimum age|age requirement|children|under 13|under 16|under 18)/i.test(allText);
  const hasCollection = /we collect|collect(?:s|ing)? (?:personal|personal information|data)|information (?:we|that) collect/i.test(allText);
  const hasPurpose = /use (?:your|the) (?:information|data)|purpose of (?:collecting|processing)|how we use/i.test(allText);
  const hasRetention = /retain|retention|stored for|keep your data/i.test(allText);
  const hasDeletion = /delete (?:your|my|account|data)|account deletion|erase your data/i.test(allText);
  const hasAccess = /access (?:your|my) data|data access|export (?:your|my) data|data portability/i.test(allText);
  const hasSharing = /share (?:your|personal) data|third parties|third-party (?:providers|service providers)|sell or share/i.test(allText);
  const hasSubprocessors = /subprocessor|sub-processors|service providers/i.test(allText);
  const hasDpa = /data processing addendum|data processing agreement|dpa/i.test(allText);
  const hasSecurity = /security (?:measures|practices|safeguards)|encrypt(?:ion|ed)|access controls/i.test(allText);
  const hasBreach = /data breach|security incident|incident response|notify (?:you|users) of/i.test(allText);
  const hasRights = /(?:right to|rights? to) (?:access|delete|correct|object|restrict|port|withdraw)|privacy rights|data subject rights/i.test(allText);
  const hasCookieConsent = /cookie consent|accept cookies|manage cookies|cookie preferences/i.test(combined);
  const hasConsentWithdrawal = /withdraw consent|change (?:your )?consent|manage preferences|privacy preferences/i.test(combined);
  const hasMarketingConsent = /marketing (?:communications|emails)|promotional emails|opt[- ]in/i.test(allText);
  const hasUnsubscribe = /unsubscribe|opt[- ]out/i.test(combined);
  const hasAnalytics = /analytics|google analytics|plausible|mixpanel|posthog|amplitude/i.test(combined);
  const hasTrackingDisclosure = /tracking technologies|track(?:ing)? (?:technologies|pixels|scripts)|web beacons/i.test(allText);
  const hasDns = /do not sell|do not share|opt out of (?:sale|sharing)/i.test(allText);
  const hasCookieClassification = /necessary|functional|analytics|advertising|marketing cookies/i.test(allText);
  const hasAiDisclosure = /artificial intelligence|\bai\b|ai[- ]powered|machine learning/i.test(combined);
  const hasAiDataUse = /ai (?:provider|service).*?(?:data|information)|send .*?(?:data|information).*?ai|ai.*?(?:process|use).*?(?:data|information)/i.test(allText);
  const hasAiTraining = /train(?:ing)? (?:our|the) (?:models|ai)|use .*? to train|training data/i.test(allText);
  const hasAiLimits = /ai (?:may|can) (?:be inaccurate|make mistakes|hallucinate)|not guaranteed|limitations of ai/i.test(allText);
  const hasHumanReview = /human review|human oversight|reviewed by (?:a )?human/i.test(allText);
  const hasUserOwnership = /you retain ownership|your content remains yours|user content.*ownership|own your content/i.test(allText);
  const hasGeneratedRights = /generated (?:content|output).*?(?:ownership|rights)|output.*?(?:ownership|rights)/i.test(allText);
  const hasPricing = /\$\s?\d+(?:\.\d{2})?|pricing|plans|per month|per year/i.test(combined);
  const hasBilling = /per month|monthly|per year|annual|billing cycle|billed/i.test(combined);
  const hasAutoRenew = /auto[- ]renew|automatically renew|renews automatically|recurring/i.test(allText);
  const hasCancelFlow = hasCancel && /cancel|cancellation/i.test(combined);
  const hasRefundTerms = hasRefund;
  const hasPayment = /stripe|paypal|razorpay|dodo|payment provider|secure checkout/i.test(combined);
  const hasSecurityContact = /security@|security contact|report (?:a )?vulnerability|responsible disclosure/i.test(combined);
  const hasAccessibility = /accessibility|wcag|aria-|screen reader/i.test(combined);
  const legalFooter = /terms.*privacy|privacy.*terms/i.test(input.html);

  return [
    check("L01","Legal","Terms of Service",hasTerms,"high","A clear terms document should be reachable from the product.","Add a visible Terms of Service link."),
    check("L02","Legal","Privacy Policy",hasPrivacy,"high","Privacy terms explain how personal information is handled.","Add a visible Privacy Policy link."),
    check("L03","Legal","Cookie Policy",hasCookie,"medium","Cookie use should be explained when cookies or similar technologies are used.","Add a Cookie Policy or clear cookie section."),
    check("L04","Legal","Refund Policy",hasRefund,"medium","Customers should be able to find the commercial refund rules.","Publish a clear refund policy."),
    check("L05","Legal","Cancellation Policy",hasCancel,"medium","Subscription products should explain cancellation.","Publish cancellation terms and the cancellation route."),
    check("L06","Legal","Acceptable Use Policy",hasAcceptable,"low","An AUP can define prohibited or abusive use.","Add an Acceptable Use Policy where relevant."),
    check("L07","Legal","Disclaimer",hasDisclaimer,"low","A disclaimer can clarify product limitations and responsibilities.","Add a product/service disclaimer."),
    check("L08","Legal","Copyright / IP notice",hasCopyright,"low","A visible IP notice helps establish ownership and product identity.","Add a copyright/IP notice in the footer or legal pages."),
    check("L09","Legal","Contact information",hasContact,"high","Users need a clear way to contact the business.","Publish a support or contact address."),
    check("L10","Legal","Business identity",hasBusinessIdentity,"medium","The legal business identity should be discoverable where applicable.","Publish the operating entity/business identity."),
    check("L11","Legal","Support channel",hasSupport,"medium","A support route reduces ambiguity around customer issues.","Add a support/help channel."),
    check("L12","Legal","Governing law / jurisdiction",hasGoverningLaw,"low","Legal terms often state the governing law and venue.","Add governing-law language appropriate to your business."),
    check("L13","Legal","Age / eligibility terms",hasAge,"low","Products should state age or eligibility restrictions when relevant.","Add age/eligibility language where applicable."),
    check("P01","Privacy","Data collection disclosure",hasCollection,"high","The audit looks for a plain-language explanation of what data is collected.","Describe categories of personal data collected."),
    check("P02","Privacy","Purpose of processing",hasPurpose,"high","Users should be told why their information is processed.","Describe the purposes for processing."),
    check("P03","Privacy","Retention disclosure",hasRetention,"medium","Retention periods or criteria help users understand how long data remains stored.","Add retention periods or criteria."),
    check("P04","Privacy","Account/data deletion",hasDeletion,"high","Users should have a documented deletion path where applicable.","Document account/data deletion."),
    check("P05","Privacy","Access / export rights",hasAccess,"medium","A data access or export path supports privacy requests.","Document access/export rights or a request process."),
    check("P06","Privacy","Third-party sharing",hasSharing,"high","Third-party disclosure should be explained if data leaves your service.","List relevant third parties and sharing purposes."),
    check("P07","Privacy","Subprocessor disclosure",hasSubprocessors,"medium","Infrastructure and service providers may process user data.","List subprocessors/service providers where applicable."),
    check("P08","Privacy","DPA information",hasDpa,"low","B2B customers may need data-processing terms.","Publish DPA information where relevant."),
    check("P09","Privacy","Security safeguards",hasSecurity,"medium","Privacy notices commonly describe security safeguards at a high level.","Describe appropriate technical and organizational safeguards."),
    check("P10","Privacy","Breach / incident language",hasBreach,"medium","Users should know how security incidents are handled or communicated.","Add an incident/breach notification section."),
    check("P11","Privacy","Privacy rights",hasRights,"high","The policy should explain applicable privacy rights and request mechanisms.","List applicable privacy rights and how to exercise them."),
    check("C01","Consent","Cookie consent / preferences",hasCookieConsent,"medium","The homepage should expose cookie consent or preference controls when required.","Add a consent banner/preferences center where applicable."),
    check("C02","Consent","Consent withdrawal",hasConsentWithdrawal,"medium","Consent should be changeable or withdrawable where consent is the legal basis.","Provide a persistent preferences or withdrawal path."),
    check("C03","Consent","Marketing consent",hasMarketingConsent,"medium","Marketing communications should distinguish promotional consent from service messages.","Document opt-in rules for marketing."),
    check("C04","Consent","Unsubscribe / opt-out",hasUnsubscribe,"medium","Users should have a simple way to stop optional marketing.","Provide unsubscribe/opt-out controls."),
    check("C05","Consent","Analytics disclosure",hasAnalytics ? "review" : true,"low","Analytics technology may be present without being obvious from the page.","If analytics are used, disclose them in privacy/cookie documentation."),
    check("C06","Consent","Tracking technology disclosure",hasTrackingDisclosure,"medium","Pixels, scripts and similar tracking should be documented where applicable.","Document tracking technologies."),
    check("C07","Consent","Do-not-sell/share language",hasDns,"low","Certain jurisdictions provide sale/sharing opt-out rights.","Add a relevant opt-out mechanism if applicable."),
    check("C08","Consent","Cookie categories",hasCookieClassification,"low","Categorizing cookies makes consent choices clearer.","Classify cookies by purpose."),
    check("A01","AI","AI use disclosure",hasAiDisclosure ? true : "review","medium","The audit checks whether the product communicates AI use when detectable from the page.","Disclose material AI functionality where appropriate."),
    check("A02","AI","AI data processing",hasAiDataUse,"high","Users should understand if their data is sent to AI providers.","Explain what data is sent to AI services and why."),
    check("A03","AI","AI training / data use",hasAiTraining,"medium","Training use can materially affect customer expectations.","State whether submitted data may be used for model training."),
    check("A04","AI","AI limitations",hasAiLimits,"medium","AI systems can produce inaccurate or incomplete output.","Add an appropriate AI limitations statement."),
    check("A05","AI","Human review / oversight",hasHumanReview,"low","High-impact AI workflows may need a human oversight explanation.","Describe human review where relevant."),
    check("A06","AI","User content ownership",hasUserOwnership,"medium","Users should understand who owns submitted content.","Clarify user-content ownership."),
    check("A07","AI","Generated-output rights",hasGeneratedRights,"medium","AI output ownership can depend on the service and jurisdiction.","Clarify output rights and restrictions."),
    check("B01","Business","Pricing transparency",hasPricing,"medium","Users should be able to understand the commercial price.","Show clear pricing before purchase."),
    check("B02","Business","Billing frequency",hasBilling,"medium","Recurring charges should state their billing period.","State monthly/annual or other billing frequency."),
    check("B03","Business","Auto-renewal disclosure",hasAutoRenew,"high","Recurring subscriptions should clearly disclose renewal behavior.","State whether subscriptions auto-renew and when."),
    check("B04","Business","Cancellation flow",hasCancelFlow,"high","Customers should have a clear cancellation route.","Provide a direct cancellation flow."),
    check("B05","Business","Refund terms",hasRefundTerms,"medium","Refund conditions should be easy to locate before purchase.","Publish the refund rules."),
    check("B06","Business","Payment provider disclosure",hasPayment,"low","Payment processing should be handled through a recognizable provider or explained securely.","Identify the payment provider where appropriate."),
    check("T01","Trust","HTTPS",input.url.protocol === "https:","high","Secure transport protects traffic between the visitor and the product.","Serve the production product over HTTPS."),
    check("T02","Trust","Security contact",hasSecurityContact,"low","A security reporting channel helps researchers report vulnerabilities.","Publish a security contact or disclosure process."),
    check("T03","Trust","Accessibility signal",hasAccessibility,"low","Accessibility documentation or implementation signals can improve inclusion.","Publish accessibility information and test the UI with assistive technology."),
    check("T04","Trust","Legal links grouped in footer",legalFooter,"medium","Core legal documents should be easy to find from the main product surface.","Group Terms and Privacy links in the footer."),
    check("T05","Trust","Legal pages reachable from same product origin",hasTerms && hasPrivacy,"high","A legal page that is not reachable from the product is easy for users to miss.","Ensure Terms and Privacy are linked from the product."),
  ];
}

router.post("/audit", requireAuth, async (req: AuthedRequest, res): Promise<void> => {
  try {
    const plan = await ensurePlanForUser(req.userId!);
    if (plan.scansUsed >= plan.scansLimit) {
      res.status(429).json({ error: `Monthly scan limit reached (${plan.scansLimit}).`, plan });
      return;
    }

    const start = normalizeUrl(req.body?.url);
    const page = await fetchPublicPage(start);
    const pageLinks = links(page.html, page.url);
    const text = stripHtml(page.html);
    const linkedText = await fetchLinkedLegalPages(pageLinks, page.url.origin);
    const checks = runChecks({ url: page.url, html: page.html, text, links: pageLinks, linkedText, headers: page.headers });

    const passed = checks.filter((item) => item.status === "pass").length;
    const review = checks.filter((item) => item.status === "review").length;
    const missing = checks.filter((item) => item.status === "missing").length;
    const score = Math.round(((passed + review * 0.5) / checks.length) * 100);

    const updatedPlan = await consumeAuditScan(req.userId!);

    res.json({
      url: page.url.toString(),
      scannedAt: new Date().toISOString(),
      score,
      passed,
      review,
      missing,
      checks,
      quota: updatedPlan,
      redirectCount: page.redirectCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit failed.";
    const status = /limit reached/i.test(message) ? 429 : /private|local|URL|HTML|redirect|HTTP/i.test(message) ? 400 : 502;
    req.log.error({ err: error }, "Audit failed");
    res.status(status).json({ error: message });
  }
});

export default router;
