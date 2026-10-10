import { AuditCorpus, AuditCheck, Evidence, ProductContext, Rule, Severity, evaluateApplicability, finalizeRequirement, confidence, legalApplicable } from "./sue-applicability";
import { text, links, scripts, combine, policySurface } from "./sue-context";

type Def = {
  id:string; category:string; title:string; severity:Severity; rule:Rule;
  evidence:(c:AuditCorpus)=>Evidence[]; recommendation:string; rationale:string;
};

const D=(id:string,category:string,title:string,severity:Severity,rule:Rule,evidence:(c:AuditCorpus)=>Evidence[],recommendation:string,rationale:string):Def=>({id,category,title,severity,rule,evidence,recommendation,rationale});

const E={
 L01:(c:AuditCorpus)=>combine(links(c,/terms|terms of service|terms & conditions|legal/i,"terms_link"),text(c,/terms of service|terms and conditions|terms of use/i,"terms_document",.96)),
 L02:(c:AuditCorpus)=>combine(links(c,/privacy|data protection|privacy notice/i,"privacy_link"),text(c,/privacy policy|privacy notice|data protection notice/i,"privacy_document",.96)),
 L03:(c:AuditCorpus)=>combine(links(c,/cookie policy|cookie notice|cookies/i,"cookie_policy_link"),text(c,/cookie policy|cookie notice/i,"cookie_policy_document",.96)),
 L04:(c:AuditCorpus)=>combine(links(c,/refund|returns?|money back/i,"refund_policy_link"),text(policySurface(c),/refund policy|refunds?|money[- ]back guarantee|return policy/i,"refund_terms",.96)),
 L05:(c:AuditCorpus)=>combine(links(c,/cancel|cancellation/i,"cancellation_link"),text(policySurface(c),/cancellation policy|cancel (?:your )?(?:subscription|plan|account)/i,"cancellation_terms",.96)),
 L06:(c:AuditCorpus)=>combine(links(c,/acceptable use|aup/i,"acceptable_use_link"),text(c,/acceptable use policy|prohibited uses/i,"acceptable_use_document",.96)),
 L07:(c:AuditCorpus)=>text(c,/disclaimer|not professional advice|no warranty|for informational purposes only/i,"disclaimer_document",.92),
 L08:(c:AuditCorpus)=>text(c,/©|copyright|all rights reserved|intellectual property/i,"copyright_notice",.92),
 L09:(c:AuditCorpus)=>combine(links(c,/contact|support|help/i,"contact_link"),text(c,/contact us|contact me|support@|hello@|info@|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,"contact_signal",.92)),
 L10:(c:AuditCorpus)=>text(c,/\b(?:inc\.?|llc|ltd\.?|limited|private limited|pvt\.?\s*ltd\.?|corporation|corp\.?)\b/i,"business_identity",.92),
 L11:(c:AuditCorpus)=>combine(links(c,/support|help center|customer service/i,"support_link"),text(c,/support@|help center|customer support|customer service/i,"support_channel",.92)),
 L12:(c:AuditCorpus)=>text(c,/governing law|jurisdiction|laws of [A-Z]|courts of [A-Z]/i,"governing_law",.94),
 L13:(c:AuditCorpus)=>text(c,/18\+|13\+|16\+|minimum age|age requirement|under 13|under 16|under 18|children/i,"age_terms",.9),
 P01:(c:AuditCorpus)=>text(c,/we collect|personal information|personal data|information we collect|data we collect/i,"data_collection_disclosure",.94),
 P02:(c:AuditCorpus)=>text(c,/how we use|purposes? of (?:processing|collecting)|use your (?:data|information)|processing purposes/i,"processing_purpose",.94),
 P03:(c:AuditCorpus)=>text(c,/retention|retain|stored for|keep your data|how long we keep/i,"retention_disclosure",.94),
 P04:(c:AuditCorpus)=>text(c,/delete (?:your|my|the) (?:account|data)|account deletion|erase (?:your|my) data|right to deletion/i,"deletion_path",.94),
 P05:(c:AuditCorpus)=>text(c,/access (?:your|my) data|data access|export (?:your|my) data|data portability|subject access request/i,"access_export_right",.94),
 P06:(c:AuditCorpus)=>text(c,/third[- ]party|third parties|service providers|share (?:your|personal) data|sell or share/i,"third_party_sharing",.92),
 P07:(c:AuditCorpus)=>text(c,/subprocessor|sub-processors|service providers that process/i,"subprocessor_disclosure",.94),
 P08:(c:AuditCorpus)=>text(c,/data processing agreement|data processing addendum|\bDPA\b/i,"dpa_information",.94),
 P09:(c:AuditCorpus)=>text(c,/security measures|security safeguards|technical and organizational measures|encryption|access controls/i,"security_safeguards",.9),
 P10:(c:AuditCorpus)=>text(c,/data breach|security incident|incident response|notify (?:you|users) of (?:a )?(?:breach|incident)/i,"breach_language",.92),
 P11:(c:AuditCorpus)=>text(c,/privacy rights|data subject rights|right to access|right to delete|right to correct|right to object|right to restrict/i,"privacy_rights",.94),
 C01:(c:AuditCorpus)=>combine(text(c,/cookie consent|accept cookies|manage cookies|cookie preferences|cookie settings/i,"cookie_consent",.94),scripts(c,/cookiebot|onetrust|cookieyes|cookieconsent|iubenda|osano/i,"cookie_consent_platform",.96)),
 C02:(c:AuditCorpus)=>text(c,/withdraw consent|change (?:your )?consent|manage preferences|withdrawal of consent/i,"consent_withdrawal",.94),
 C03:(c:AuditCorpus)=>text(c,/marketing (?:communications|emails)|promotional emails|marketing consent|opt[- ]in to marketing/i,"marketing_consent",.94),
 C04:(c:AuditCorpus)=>text(c,/unsubscribe|opt[- ]out of marketing|email preferences/i,"unsubscribe",.96),
 C05:(c:AuditCorpus)=>text(policySurface(c),/analytics (?:tools|providers|cookies)|google analytics|plausible|posthog|mixpanel|amplitude/i,"analytics_disclosure",.94),
 C06:(c:AuditCorpus)=>text(c,/tracking technologies|tracking pixels|web beacons|tracking scripts|similar tracking technologies/i,"tracking_disclosure",.94),
 C07:(c:AuditCorpus)=>text(c,/do not sell|do not share|opt out of (?:sale|sharing)|sale or sharing of personal information/i,"do_not_sell_share",.94),
 C08:(c:AuditCorpus)=>text(c,/necessary cookies|functional cookies|analytics cookies|advertising cookies|marketing cookies|cookie categories/i,"cookie_categories",.94),
 A01:(c:AuditCorpus)=>text(policySurface(c),/AI[- ]powered|AI assistant|AI agent|generative AI|artificial intelligence feature|we use AI|AI service provider/i,"ai_use_disclosure",.94),
 A02:(c:AuditCorpus)=>text(c,/(?:send|share|process|use|submit).{0,120}(?:AI|OpenAI|Anthropic|Gemini|model).{0,120}(?:data|information|content|prompt)/i,"ai_data_processing",.94),
 A03:(c:AuditCorpus)=>text(c,/train(?:ing)? (?:our|the) (?:models|AI)|use .*? to train|training data|improve our models using/i,"ai_training_use",.94),
 A04:(c:AuditCorpus)=>text(c,/AI (?:may|can) (?:be inaccurate|make mistakes|hallucinate)|AI limitations|not guaranteed to be accurate|verify AI output/i,"ai_limitations",.94),
 A05:(c:AuditCorpus)=>text(c,/human review|human oversight|reviewed by (?:a )?human|human-in-the-loop/i,"human_oversight",.94),
 A06:(c:AuditCorpus)=>text(c,/you retain ownership|your content remains yours|user content.*ownership|own your content|ownership of (?:your|user) content/i,"user_content_ownership",.94),
 A07:(c:AuditCorpus)=>text(c,/generated (?:content|output).*?(?:ownership|rights)|AI output.*?(?:ownership|rights)|output rights/i,"generated_output_rights",.94),
 B01:(c:AuditCorpus)=>combine(text(c,/pricing|plans|starting at|\b(?:\$|€|£|₹)\s?\d+/i,"pricing_transparency",.92),links(c,/pricing|plans/i,"pricing_link",.9)),
 B02:(c:AuditCorpus)=>text(c,/per month|monthly|per year|annual|yearly|billed (?:monthly|annually|yearly)|billing frequency/i,"billing_frequency",.95),
 B03:(c:AuditCorpus)=>text(policySurface(c),/auto[- ]?renew|automatically renew|renews automatically|recurring (?:charge|billing|payment)/i,"auto_renewal_disclosure",.96),
 B04:(c:AuditCorpus)=>combine(links(c,/cancel|cancellation/i,"cancellation_route",.9),text(policySurface(c),/cancel (?:your )?(?:subscription|plan|account)|cancellation instructions/i,"cancellation_flow",.94)),
 B05:(c:AuditCorpus)=>E.L04(c),
 B06:(c:AuditCorpus)=>text(policySurface(c),/payment provider|payment processor|payments? (?:are )?(?:processed|handled) by|Stripe|PayPal|Razorpay|Adyen|Checkout\.com|Paddle|Lemon Squeezy|Shopify Payments/i,"payment_provider_disclosure",.94),
 T01:(c:AuditCorpus)=>c.pages.some(p=>p.url.protocol==="https:")?[{type:"page",url:c.pages[0]?.url.toString(),location:"final URL",excerpt:"The audited URL was served over HTTPS.",signal:"https",confidence:.99}]:[],
 T02:(c:AuditCorpus)=>combine(text(c,/security@|security contact|report (?:a )?vulnerability|responsible disclosure|security policy/i,"security_contact",.94),links(c,/security|vulnerability|responsible disclosure/i,"security_link",.92)),
 T03:(c:AuditCorpus)=>text(c,/accessibility|WCAG|screen reader|keyboard navigation|aria-/i,"accessibility_signal",.88),
 T04:(c:AuditCorpus)=>{const h=c.pages.find(p=>p.isHome)??c.pages[0];return h&&/footer/i.test(h.html)&&/terms/i.test(h.html)&&/privacy/i.test(h.html)?[{type:"page",url:h.url.toString(),location:"footer",excerpt:"Terms and Privacy links appear in the same footer surface.",signal:"legal_footer_group",confidence:.92}]:[];},
 T05:(c:AuditCorpus)=>links(c,/terms|privacy/i,"legal_page_link",.94),
};


// Presence is not the same as adequate policy evidence. These focused quality
// gates keep broad keyword hits from becoming a confident PASS when the public
// text does not explain the actual practice. They intentionally return REVIEW,
// not a legal conclusion or a false MISSING, when evidence is too vague.
const evidenceQuality:Partial<Record<string,{adequate:RegExp;message:string}>>={
  P01:{adequate:/\b(?:email|e-mail|name|phone|contact|account|profile|payment|billing|device|usage|location|prompt|upload|IP address|log data|transaction|order|address)\b/i,message:"The collection language was found, but specific data categories were not clear in the supporting excerpt."},
  P02:{adequate:/\b(?:to provide|to operate|to deliver|to process|to secure|to improve|to personalize|to communicate|to support|to fulfil|to fulfill|to prevent|to comply|to respond|to manage|for account|for billing|for security|for service delivery|for customer support)\b/i,message:"The policy mentions use or processing but does not clearly state a purpose in the supporting excerpt."},
  P03:{adequate:/\b(?:\d+\s*(?:days?|weeks?|months?|years?)|as long as necessary|for as long as|until (?:you|the)|when (?:you|your account)|delete[\w ]{0,35}after|retention period of)\b/i,message:"A retention keyword was found, but no concrete period or retention criterion was identified."},
  P04:{adequate:/\b(?:request|email|contact|account settings|settings page|privacy portal|deletion form|support team|delete your account|delete your data|erase your data)\b/i,message:"Deletion is mentioned, but the supporting text does not clearly identify a usable deletion path or request mechanism."},
  P05:{adequate:/\b(?:request|download|export|data portability|privacy portal|contact|email|access request|subject access)\b/i,message:"Access or export is mentioned, but the supporting text does not clearly identify how a user can exercise it."},
  P06:{adequate:/\b(?:share|disclose|transfer|provide)\b.{0,100}\b(?:with|to)\b|\b(?:service providers include|third parties include|payment processor|analytics provider|Stripe|PayPal|Razorpay|Supabase|Google Analytics|OpenAI|Anthropic)\b/i,message:"Third-party sharing is mentioned, but the supporting text does not clearly identify recipients or a meaningful recipient category."},
  P07:{adequate:/\b(?:subprocessors? include|list of subprocessors?|see (?:our )?subprocessor|subprocessor list|available at https?:|subprocessors? page)\b/i,message:"Subprocessors are mentioned, but a list or concrete way to identify them was not found."},
  P11:{adequate:/\b(?:right to access|right to delete|right to correct|right to rectification|right to object|right to restrict|right to portability|request access|request deletion|exercise your rights)\b/i,message:"Privacy rights are mentioned, but the excerpt does not clearly identify a specific right or how to exercise it."},
  A03:{adequate:/\b(?:do not|don't|will not|won't|may|will|can|cannot|can't|never|use|using)\b.{0,100}\b(?:prompts?|submitted content|uploads?|user content|personal data|training data|model training|train(?:ing)? (?:our|the|AI|language) models|improve our models)\b/i,message:"Training is mentioned, but the policy's position on whether submitted content is used for training is not clear."},
  L04:{adequate:/\b(?:within \d+ days?|\d+[- ]day|non[- ]refundable|not refundable|refunds? (?:are|will be|may be)|eligible for a refund|refund requests?|return window|final sale|unless|except)\b/i,message:"A refund link or heading was found, but concrete eligibility, timing, or conditions were not identified."},
  L05:{adequate:/\b(?:cancel at any time|cancel through|cancel via|cancel in your|cancellation request|before the next billing|before renewal|effective at the end of|email.{0,50}cancel|contact.{0,50}cancel|stop future charges)\b/i,message:"Cancellation is mentioned, but the supporting text does not clearly explain the cancellation method or timing."},
  P09:{adequate:/\b(?:encrypt(?:ion|ed)|access controls?|multi[- ]factor|two[- ]factor|MFA|pseudonymi[sz]|regular security testing|backups?|least privilege|technical and organizational measures)\b/i,message:"Security is mentioned, but no concrete safeguard was identified in the supporting excerpt."},
  P10:{adequate:/\b(?:notify|notification|incident response|report.{0,50}(?:breach|incident)|within \d+ days?|supervisory authority|affected users|regulator)\b/i,message:"Incident or breach language was found, but a response or notification process was not clear."},
  C05:{adequate:/\b(?:we use|uses|using|powered by|analytics providers include|analytics tools include)\b.{0,100}\b(?:analytics|Google Analytics|Plausible|PostHog|Mixpanel|Amplitude)\b.{0,100}\b(?:to understand|to measure|to improve|site usage|product usage|performance|traffic|usage patterns|analytics)\b/i,message:"An analytics provider is mentioned, but its purpose is not clear in the policy text."},
  C06:{adequate:/\b(?:tracking pixels?|web beacons?|tracking scripts?|tracking technologies|advertising cookies|marketing cookies)\b.{0,100}\b(?:measure|advertising|marketing|behavior|behaviour|conversion|analytics|personalize|personalise)\b/i,message:"Tracking is mentioned, but the technology or purpose is not described clearly enough."},
  C08:{adequate:/\b(?:necessary|essential) cookies\b.{0,180}\b(?:analytics|advertising|marketing|functional|preferences) cookies\b/i,message:"Cookie categories are mentioned, but the excerpt does not identify more than one meaningful category."},
  A01:{adequate:/\b(?:we use|uses|powered by|integrates with|sends.{0,40}to)\b.{0,100}\b(?:AI|artificial intelligence|AI provider|AI model|generative AI)\b/i,message:"AI is mentioned, but the policy does not clearly describe actual AI use or provider integration."},
  B05:{adequate:/\b(?:within \d+ days?|\d+[- ]day|non[- ]refundable|not refundable|refunds? (?:are|will be|may be)|eligible for a refund|refund requests?|return window|final sale|unless|except)\b/i,message:"Refund language was found, but concrete eligibility, timing, or conditions were not identified."}
};

function evidenceQualityIssue(checkId:string,evidence:Evidence[]):string|null {
  const rule=evidenceQuality[checkId];
  if(!rule||!evidence.length) return null;
  const excerpts=evidence.map(e=>e.excerpt??"").join(" ");
  return rule.adequate.test(excerpts) ? null : rule.message;
}

const defs:Def[]=[
D("L01","Legal","Terms of Service","high",{productTypes:["saas","ecommerce","marketplace","ai_product","developer_tool","community","service_business"],anySignals:["authentication","paidService","userGeneratedContent"]},E.L01,"Publish a visible Terms of Service link.","Terms are relevant to this product surface."),
D("L02","Legal","Privacy Policy","high",{anySignals:["personalDataCollection","authentication","analytics","tracking","marketingCollection","ecommerce"]},E.L02,"Add a clear Privacy Policy describing the data practices detected.","Personal-data processing signals were detected."),
D("L03","Legal","Cookie Policy","medium",{anySignals:["analytics","tracking"]},E.L03,"Add a Cookie Policy or clear cookie section matching actual technologies.","Non-essential cookie/tracking signals were detected."),
D("L04","Legal","Refund Policy","medium",{anySignals:["payments","checkout","ecommerce","subscription","paidService"]},E.L04,"Publish clear refund/return terms before purchase.","Paid or purchase-flow signals were detected."),
D("L05","Legal","Cancellation Policy","medium",{anySignals:["subscription","autoRenewal"]},E.L05,"Publish cancellation terms and the route for stopping future charges.","A cancellable paid relationship or recurring billing signal was detected."),
D("L06","Legal","Acceptable Use Policy","low",{productTypes:["saas","community","marketplace","ai_product","developer_tool"],anySignals:["userGeneratedContent","authentication"]},E.L06,"Add an Acceptable Use Policy where users can access or submit content/services.","An account/platform/user-content surface was detected."),
D("L07","Legal","Disclaimer","low",{productTypes:["ai_product","service_business"],anySignals:["ai","commercialActivity"]},E.L07,"Add a disclaimer when advice, consequential content or material limitations make one useful.","The product context suggests an AI/service surface."),
D("L08","Legal","Copyright / IP notice","low",{anySignals:["commercialActivity","userGeneratedContent","ecommerce","authentication"]},E.L08,"Add a copyright/IP notice in the footer or legal pages.","Copyright/IP notices are most relevant where the site publishes or operates a commercial, account-based, or user-content service."),
D("L09","Legal","Contact information","high",{anySignals:["commercialActivity","authentication","ecommerce","marketplace","paidService"]},E.L09,"Publish a visible contact or support route.","A customer-facing commercial or account-based service should expose a reliable contact path."),
D("L10","Legal","Business identity","medium",{anySignals:["commercialActivity","paidService","payments","ecommerce"]},E.L10,"Publish the operating business/entity identity where applicable.","Commercial activity was detected."),
D("L11","Legal","Support channel","medium",{anySignals:["authentication","paidService","ecommerce","subscription"]},E.L11,"Add a support/help channel for users or customers.","A customer/account relationship was detected."),
D("L12","Legal","Governing law / jurisdiction","low",{anySignals:["paidService","subscription","ecommerce","payments"],productTypes:["saas","marketplace","service_business"]},E.L12,"Add governing-law language appropriate to the business terms.","Commercial terms are relevant."),
D("L13","Legal","Age / eligibility terms","low",{productTypes:["community","marketplace","ai_product"],anySignals:["authentication","userGeneratedContent"]},E.L13,"Add age/eligibility language when the audience or service requires it.","An account/community/marketplace/AI surface makes eligibility potentially relevant."),
D("P01","Privacy","Data collection disclosure","high",{anySignals:["personalDataCollection","authentication","marketingCollection","ecommerce"],unknownIfLowCoverage:true},E.P01,"Describe the categories of personal data collected.","Personal-data collection signals were detected."),
D("P02","Privacy","Purpose of processing","high",{anySignals:["personalDataCollection","authentication","marketingCollection","ecommerce"],unknownIfLowCoverage:true},E.P02,"Describe why each material data category is processed.","Personal-data processing is relevant."),
D("P03","Privacy","Retention disclosure","medium",{anySignals:["persistentUserData","authentication","ecommerce","marketingCollection"],unknownIfLowCoverage:true},E.P03,"Add retention periods or clear retention criteria.","The product appears to retain user/customer data."),
D("P04","Privacy","Account/data deletion","high",{anySignals:["authentication","accountCreation","persistentUserData","userGeneratedContent"],unknownIfLowCoverage:true},E.P04,"Document account/data deletion or a request process.","Persistent account/user data was detected."),
D("P05","Privacy","Access / export rights","medium",{anySignals:["persistentUserData","authentication","ecommerce"],unknownIfLowCoverage:true},E.P05,"Document access/export rights or a request process.","Persistent user/customer data is likely present."),
D("P06","Privacy","Third-party sharing","high",{anySignals:["analytics","payments","authentication","marketingCollection","aiDataProcessing","tracking"],unknownIfLowCoverage:true},E.P06,"List relevant third parties/service providers and sharing purposes.","Third-party processing signals were detected."),
D("P07","Privacy","Subprocessor disclosure","medium",{anySignals:["b2bProcessor","aiDataProcessing"],unknownIfLowCoverage:true},E.P07,"List subprocessors/service providers where customer data is processed.","The product looks like hosted software/API/AI."),
D("P08","Privacy","DPA information","low",{anySignals:["b2bProcessor"],unknownIfLowCoverage:true},E.P08,"Publish DPA information where B2B/processor relationships make it relevant.","The product appears to operate as B2B software/API."),
D("P09","Privacy","Security safeguards","medium",{anySignals:["personalDataCollection","authentication","payments","ecommerce"],unknownIfLowCoverage:true},E.P09,"Describe appropriate technical and organizational safeguards.","Meaningful personal/account/payment data processing is likely."),
D("P10","Privacy","Breach / incident language","medium",{anySignals:["personalDataCollection","authentication","persistentUserData","payments"],unknownIfLowCoverage:true},E.P10,"Add incident/breach handling or notification language.","The product appears to process meaningful user/customer data."),
D("P11","Privacy","Privacy rights","high",{anySignals:["personalDataCollection","authentication","marketingCollection","ecommerce"],unknownIfLowCoverage:true},E.P11,"List applicable privacy rights and how users can exercise them.","Personal-data processing was detected."),
D("C01","Consent","Cookie consent / preferences","medium",{anySignals:["analytics","tracking"],unknownIfLowCoverage:true},E.C01,"Add consent/preferences controls where the detected cookies or tracking require consent.","Consent-relevant tracking/cookie technology was detected or cannot be ruled out."),
D("C02","Consent","Consent withdrawal","medium",{anySignals:["analytics","tracking","marketingCollection"],unknownIfLowCoverage:true},E.C02,"Provide a persistent way to withdraw or change consent where consent is the basis.","Consent-based processing appears relevant."),
D("C03","Consent","Marketing consent","medium",{anySignals:["marketingCollection"]},E.C03,"Document opt-in rules for optional marketing communications.","Marketing collection was detected."),
D("C04","Consent","Unsubscribe / opt-out","medium",{anySignals:["marketingCollection"]},E.C04,"Provide a simple unsubscribe/opt-out route for marketing.","Marketing communication collection was detected."),
D("C05","Consent","Analytics disclosure","low",{anySignals:["analytics"],unknownIfLowCoverage:true},E.C05,"Disclose analytics providers and purposes in privacy/cookie documentation.","Analytics was detected or runtime visibility is insufficient."),
D("C06","Consent","Tracking technology disclosure","medium",{anySignals:["tracking"],unknownIfLowCoverage:true},E.C06,"Document pixels, scripts and other tracking technologies.","Tracking technology was detected."),
D("C07","Consent","Do-not-sell/share language","low",{allSignals:["personalDataCollection","dataCommercialization"],unknownIfLowCoverage:true},E.C07,"Add a sale/share opt-out only where the business actually falls within such rules.","A universal requirement cannot be inferred from a generic website alone."),
D("C08","Consent","Cookie categories","low",{anySignals:["analytics","tracking"]},E.C08,"Classify cookies by purpose where non-essential cookies are used.","Cookie/tracking technology was detected."),
D("A01","AI","AI use disclosure","medium",{anySignals:["ai"]},E.A01,"Disclose material AI functionality clearly.","The product itself shows functional AI signals."),
D("A02","AI","AI data processing","high",{allSignals:["ai","personalDataCollection"],anySignals:["aiDataProcessing"]},E.A02,"Explain what data is sent to AI services, why, and which providers receive it.","AI functionality overlaps with user/personal data processing."),
D("A03","AI","AI training / data use","medium",{allSignals:["ai","userGeneratedContent"]},E.A03,"State whether submitted prompts/content may be used for model training/improvement.","Users can submit content to an AI product."),
D("A04","AI","AI limitations","medium",{anySignals:["ai"]},E.A04,"Add an appropriate AI accuracy/limitations statement.","Material AI functionality was detected."),
D("A05","AI","Human review / oversight","low",{allSignals:["ai","highImpactAI"],unknownIfLowCoverage:true},E.A05,"Describe human review where AI influences consequential decisions.","Human oversight is context-dependent and low priority."),
D("A06","AI","User content ownership","medium",{allSignals:["ai","userGeneratedContent"]},E.A06,"Clarify ownership and permitted use of prompts/uploads/submitted content.","Users can submit content to the AI product."),
D("A07","AI","Generated-output rights","medium",{allSignals:["ai","aiGeneration"]},E.A07,"Clarify ownership, license and restrictions for generated output.","The product generates AI output."),
D("B01","Business","Pricing transparency","medium",{anySignals:["pricing","paidService","payments","ecommerce","subscription"]},E.B01,"Show clear pricing before purchase.","Commercial pricing/purchase signals were detected."),
D("B02","Business","Billing frequency","medium",{anySignals:["subscription"]},E.B02,"State monthly/annual or other billing frequency.","Recurring billing signals were detected."),
D("B03","Business","Auto-renewal disclosure","high",{anySignals:["subscription","autoRenewal"]},E.B03,"State whether subscriptions auto-renew, when renewal occurs, and how to stop future renewals.","Recurring commercial billing was detected."),
D("B04","Business","Cancellation flow","high",{anySignals:["subscription","autoRenewal","paidService"]},E.B04,"Provide a direct cancellation route for the paid relationship.","A cancellable paid relationship is likely."),
D("B05","Business","Refund terms","medium",{anySignals:["payments","checkout","ecommerce","subscription","paidService"]},E.B05,"Publish refund/return rules before purchase.","Paid transaction signals were detected."),
D("B06","Business","Payment provider disclosure","low",{anySignals:["payments","checkout"]},E.B06,"Identify the payment provider or explain payment processing appropriately.","Payment/checkout technology was detected."),
D("T01","Trust","HTTPS","high",{always:true},E.T01,"Serve the production product over HTTPS.","The public endpoint should use encrypted transport."),
D("T02","Trust","Security contact","low",{productTypes:["saas","developer_tool","ai_product"],anySignals:["authentication","developerApi","persistentUserData"]},E.T02,"Publish a security contact or responsible-disclosure process.","The product has a meaningful security surface."),
D("T03","Trust","Accessibility signal","low",{anySignals:["commercialActivity","authentication","ecommerce","community","marketplace"]},E.T03,"Publish accessibility information and test the UI with assistive technology.","Accessibility review is most useful for customer-facing products and interactive services; absence of a visible statement is not proof of legal non-compliance."),
D("T04","Trust","Legal links grouped in footer","medium",{anySignals:["commercialActivity","personalDataCollection","authentication"],unknownIfLowCoverage:true},E.T04,"Group applicable Terms and Privacy links in the footer.","Applicable legal documents should be easy to discover."),
D("T05","Trust","Legal pages reachable from same product origin","high",{anySignals:["commercialActivity","personalDataCollection","authentication"],unknownIfLowCoverage:true},E.T05,"Ensure applicable legal pages are reachable from the deployed product origin.","Applicable legal documents should be discoverable from the product."),
];

import { buildProductContext } from "./sue-context";

export function runApplicabilityAwareChecks(c:AuditCorpus):{context:ProductContext;checks:AuditCheck[]} {
  // buildProductContext intentionally excludes legal/policy pages from product
  // classification. Evidence verification must still inspect those pages.
  // Otherwise a perfectly valid Terms/Privacy page can never satisfy L/P/C
  // requirements. Keep applicability based on the product surface, while
  // selecting the evidence corpus by requirement category.
  const context=buildProductContext(c);
  const checks=defs.map(d=>{
    let applicability=evaluateApplicability(d.rule,context);
    // L01 is the sole intentional imperative applicability exception.
    // Its product/legal relevance is a composite predicate that the declarative Rule
    // model intentionally does not approximate with a brittle list of signals.
    // Content-disclosure checks must inspect legal/policy surfaces, not just
    // product marketing copy or provider scripts. Presence/link checks remain
    // on the full corpus so visible navigation can still prove discoverability.
    const policyOnlyEvidenceIds=new Set(["P01","P02","P03","P04","P05","P06","P07","P08","P09","P10","P11","C02","C03","C05","C06","C07","C08","A01","A02","A03","A04","A05","A06","A07","B03","B04","L07","L12","L13"]);
    const evidence=policyOnlyEvidenceIds.has(d.id) ? d.evidence(policySurface(c)) : d.evidence(c);
    const baseStatus=finalizeRequirement(applicability,evidence,context);
    const qualityIssue=baseStatus==="pass" ? evidenceQualityIssue(d.id,evidence) : null;
    const status=qualityIssue ? "review" : baseStatus;
    let explanation=d.rationale;
    if(applicability==="not_applicable") explanation="Not applicable based on the observed product context: "+context.productTypes.join(", ")+".";
    else if(applicability==="unknown") explanation="Applicability could not be established confidently because crawl/runtime coverage is limited. Observed context: "+context.productTypes.join(", ")+".";
    else if(status==="pass") explanation="The requirement is applicable and supporting evidence was found. "+d.rationale;
    else if(status==="missing") explanation="The requirement is applicable, crawl coverage was sufficient, and no supporting evidence was found. "+d.rationale;
    else if(status==="review") explanation="The requirement needs human review because the public crawl cannot establish it confidently. "+(qualityIssue ? qualityIssue+" " : "")+d.rationale;
    return {id:d.id,category:d.category,title:d.title,applicability,status,severity:status==="not_applicable"?"low":d.severity,confidence:qualityIssue?Math.min(.68,confidence(context,evidence)):confidence(context,evidence),evidence,explanation,reason:explanation,recommendation:d.recommendation};
  });
  return {context,checks};
}

export function definitionsCount(){return defs.length;}
