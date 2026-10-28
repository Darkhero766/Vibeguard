import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir=await mkdtemp(join(tmpdir(),"vibesane-sue-"));
const outfile=join(dir,"sue-checks.mjs");
try {
  await build({
    entryPoints:["./src/lib/sue-checks.ts"],
    bundle:true,
    format:"esm",
    platform:"node",
    outfile,
    external:["node:*"],
    logLevel:"silent"
  });
  const {runApplicabilityAwareChecks,definitionsCount,CORE_CHECK_IDS,unverifiedPolicyRouteRelevant}=await import(outfile);
  assert.equal(definitionsCount(),50,"SUE must retain exactly 50 checks");
  assert.equal(CORE_CHECK_IDS.length,12,"V1 must expose exactly 12 core checks");
  assert.equal(new Set(CORE_CHECK_IDS).size,12,"Core check IDs must be unique");
  assert.deepEqual([...CORE_CHECK_IDS].sort(),["L01","L02","L03","L08","L09","L10","L12","P11","T01","T02","T03","T05"].sort(),"Core registry must match the approved V1 IDs");

  const headers=()=>new Headers();
  // SSRF host-validation unit coverage is kept in the audit route itself;
  // these cases document the security boundary for future route-level tests.
  assert.ok((await import("node:net")).isIP("2001:db8::1")===6,"Node must recognize IPv6 test addresses");

  const page=(url,html,{home=true,text:txt=null,scripts:sc=null,links:ls=[],forms:fs=[],headers:hdrs=null}={})=>{
    const parsedLinks=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>{
      try { return {href:new URL(m[1],url).toString(),text:m[2].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}; } catch { return null; }
    }).filter(Boolean);
    return {
      url:new URL(url),html,text:txt??html.replace(/<[^>]+>/g," "),links:[...ls,...parsedLinks],scripts:sc??[...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]),forms:fs,
      inputs:[],metadata:"",structuredData:"",headers:hdrs??headers(),isHome:home
    };
  };
  const corpus=(html,url="https://example.test/")=>({pages:[page(url,html)],origin:new URL(url).origin});
  const run=(html,url)=>runApplicabilityAwareChecks(corpus(html,url)).checks;
  const by=(checks,id)=>checks.find(x=>x.id===id);

  // Encyclopedia/content fixture: verified documents and explicit account/paid signals.
  // This is synthetic, not a saved Wikipedia production crawl.
  const encyclopediaCorpus = {
    pages:[
      page("https://encyclopedia.example.test/",`<html><body><h1>Open Encyclopedia</h1><p>Free encyclopedia articles. Log in to edit pages. We collect account email addresses. Optional paid membership subscription.</p><a href="/terms">Terms of Service</a><a href="/privacy">Privacy Policy</a><a href="/contact">Contact</a></body></html>`),
      page("https://encyclopedia.example.test/terms",`<html><body><h1>Terms of Service</h1><p>These Terms of Service apply to contributors. This agreement is governed by the laws of California.</p><p>Open Encyclopedia Foundation Inc. operates this website.</p></body></html>`,{home:false}),
      page("https://encyclopedia.example.test/privacy",`<html><body><h1>Privacy Policy</h1><p>We collect email addresses for account login. You have the right to access and the right to delete your personal data. Contact our privacy team to exercise your rights.</p></body></html>`,{home:false}),
      page("https://encyclopedia.example.test/contact",`<html><body><h1>Contact us</h1><p>Contact our team at info@encyclopedia.example.test.</p></body></html>`,{home:false}),
    ],origin:"https://encyclopedia.example.test"
  };
  const encyclopediaResult=runApplicabilityAwareChecks(encyclopediaCorpus);
  assert.ok(encyclopediaResult.context.productTypes.includes("content"),"Fixture must exercise content classification.");
  for(const id of ["L01","L09","L10","L12","P11","T05"]) {
    assert.equal(by(encyclopediaResult.checks,id).status,"pass",id+" should PASS on a content site with verified evidence and its required signals.");
  }

  const sparseAppShell = {
    pages:[page("https://example.test/","<html><body><div id=\"root\"></div>" + "<script src=\"/assets/app.js\"></script>".repeat(6) + "</body></html>")],
    origin:"https://example.test"
  };
  const sparseResult=runApplicabilityAwareChecks(sparseAppShell);
  const sparseChecks=sparseResult.checks;
  assert.equal(by(sparseChecks,"P01").applicability,"unknown","A sparse runtime shell must not turn privacy applicability into a false N/A.");
  assert.equal(by(sparseChecks,"P08").applicability,"unknown","DPA applicability should remain unknown when runtime coverage is insufficient.");
  const lowEvidenceShell = {
    pages:[page("https://example.test/","<html><head><title>App</title></head><body><div id=\"root\"></div><script src=\"/assets/app.js\"></script><script src=\"/assets/vendor.js\"></script></body></html>")],
    origin:"https://example.test"
  };
  const lowEvidenceResult=runApplicabilityAwareChecks(lowEvidenceShell);
  const lowEvidenceChecks=lowEvidenceResult.checks;
  assert.equal(by(lowEvidenceChecks,"P01").applicability,"unknown","A low-evidence two-script SPA shell must not become false N/A.");
  assert.equal(by(lowEvidenceChecks,"P01").status,"review","Low-evidence applicability must surface as review.");
  assert.equal(by(lowEvidenceChecks,"A01").status,"review","Low-evidence AI applicability must surface as review.");
  assert.equal(lowEvidenceResult.context.signals.marketplace,false,"Asset filename vendor.js must not create a marketplace signal.");
  assert.equal(lowEvidenceResult.context.signals.commercialActivity,false,"Asset markup must not create commercial-activity signals.");



  // Legal/policy pages must satisfy evidence checks without contaminating
  // product applicability. This is the regression for the real VibeSane failure
  // mode: Terms/Privacy existed but were previously invisible to the checks.
  const saasWithPolicies = {
    pages:[
      page("https://example.test/",`<html><body><h1>Acme Cloud</h1><p>Project management SaaS.</p><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/pricing">Pricing</a><button>Sign up</button></body></html>`),
      page("https://example.test/terms",`<html><body><h1>Terms of Service</h1><p>These Terms of Service govern use of Acme Cloud.</p><p>Governing law and limitation of liability apply.</p></body></html>`,{home:false}),
      page("https://example.test/privacy",`<html><body><h1>Privacy Policy</h1><p>We collect names, email addresses, account identifiers and usage logs. We explain how we use account data to provide the service, secure accounts and process payments.</p><p>We retain account activity logs for 30 days, then delete them. Users can request account deletion by emailing privacy@example.test. Users can request data access or export their data by emailing privacy@example.test. We disclose data to third-party payment processors and analytics providers.</p></body></html>`,{home:false}),
    ],
    origin:"https://example.test"
  };
  const policyResult=runApplicabilityAwareChecks(saasWithPolicies);
  const policyChecks=policyResult.checks;
  assert.equal(by(policyChecks,"L01").status,"pass","Crawled Terms page must satisfy Terms evidence.");
  assert.equal(by(policyChecks,"P01").status,"pass","Crawled Privacy page must satisfy data-collection disclosure.");
  assert.equal(by(policyChecks,"P02").status,"pass","Crawled Privacy page must satisfy processing-purpose disclosure.");
  assert.equal(by(policyChecks,"P03").status,"pass","Crawled Privacy page must satisfy retention disclosure.");
  assert.equal(by(policyChecks,"P04").status,"pass","Crawled Privacy page must satisfy deletion evidence.");
  assert.equal(by(policyChecks,"P05").status,"pass","Crawled Privacy page must satisfy access/export evidence.");
  assert.equal(by(policyChecks,"P06").status,"pass","Crawled Privacy page must satisfy third-party sharing evidence.");
  assert.notEqual(by(policyChecks,"T02").status,"pass","Ordinary Terms/Privacy content must not satisfy the security-contact check.");

  // Real VibeSane policy headings use “Terms & Conditions”. Verify that the
  // ampersand form is recognized, privacy rights are evidence-backed, and a
  // generic governing-law disclaimer does not pass without a jurisdiction.
  const ampersandTerms = {
    pages:[
      page("https://ampersand.example.test/","<html><body><h1>Acme Cloud</h1><p>Developer security scanner and SaaS for GitHub repositories.</p><a href=\"/terms\">Terms</a><a href=\"/privacy\">Privacy</a><a href=\"/pricing\">Pricing</a><a href=\"/login\">Log in</a><button>Sign up</button></body></html>"),
      page("https://ampersand.example.test/terms","<html><body><h1>Terms &amp; Conditions</h1><p>These Terms &amp; Conditions govern your access. By using the Service, you agree to these Terms.</p><h2>Governing Law &amp; Mandatory Rights</h2><p>These Terms are intended to be interpreted under applicable law. A specific governing-law provision has not been identified and should be completed.</p></body></html>",{home:false,text:"Terms & Conditions govern your access. By using the Service, you agree to these Terms. Governing Law & Mandatory Rights. A specific governing-law provision has not been identified and should be completed."}),
      page("https://ampersand.example.test/privacy","<html><body><h1>Privacy Policy</h1><p>We collect email addresses and account usage data. Depending on your location, privacy rights may include the right to access, correct, or delete personal data. Contact support to exercise your rights.</p></body></html>",{home:false,text:"Privacy Policy. We collect email addresses and account usage data. Privacy rights include the right to access, correct, or delete personal data. Contact support to exercise your rights."})
    ],
    origin:"https://ampersand.example.test"
  };
  const ampersandChecks=runApplicabilityAwareChecks(ampersandTerms).checks;
  assert.equal(by(ampersandChecks,"L01").status,"pass","Terms & Conditions heading must be recognized as a real Terms page.");
  assert.equal(by(ampersandChecks,"L12").status,"review","Generic governing-law wording must not pass without a named jurisdiction.");
  assert.equal(by(ampersandChecks,"P11").status,"pass","Specific privacy rights and an exercise path should satisfy the rights check.");
  assert.equal(by(ampersandChecks,"T05").status,"pass","Verified Terms & Conditions and Privacy Policy pages should satisfy legal reachability.");


  const vaguePrivacy = {
    pages:[
      page("https://vague.example.test/","<html><body><h1>Vague Cloud</h1><p>Team workspace for users.</p><a href=\"/login\">Log in</a><form><input type=\"email\" name=\"email\"><input type=\"password\" name=\"password\"></form></body></html>"),
      page("https://vague.example.test/privacy","<html><body><h1>Privacy Policy</h1><p>We collect personal information. We explain how we use your data. Retention is important. Delete data. Privacy rights apply.</p></body></html>",{home:false})
    ],
    origin:"https://vague.example.test"
  };
  const vagueChecks=runApplicabilityAwareChecks(vaguePrivacy).checks;
  assert.equal(by(vagueChecks,"P01").status,"review","Generic collection language must not count as an adequate data-category disclosure.");
  assert.equal(by(vagueChecks,"P02").status,"review","Generic use language must not count as an adequate purpose disclosure.");
  assert.equal(by(vagueChecks,"P03").status,"review","A generic retention mention must not count as a retention period or criterion.");
  assert.equal(by(vagueChecks,"P01").applicability,"applicable");
  assert.equal(by(vagueChecks,"P03").applicability,"applicable");

  const policyShell = {
    pages:[
      page("https://shell.example.test/","<html><body><h1>Acme Cloud</h1><p>Team workspace for customers.</p><a href=\"/terms\">Terms</a><a href=\"/privacy\">Privacy Policy</a><a href=\"/login\">Log in</a><form><input type=\"email\" name=\"email\"><input type=\"password\" name=\"password\"></form></body></html>"),
      page("https://shell.example.test/terms","<html><head><title>Acme Cloud</title></head><body><div id=\"root\">Loading application...</div></body></html>",{home:false})
    ],
    origin:"https://shell.example.test"
  };
  const policyShellChecks=runApplicabilityAwareChecks(policyShell).checks;
  assert.equal(by(policyShellChecks,"L01").status,"review","A generic SPA shell at /terms is not a verified Terms document.");
  assert.equal(by(policyShellChecks,"P01").status,"review","Low crawl confidence may still require privacy applicability review.");
  assert.equal(by(policyShellChecks,"P01").explanation.includes("relevant policy-like route"),false,"A Terms-only shell must not be the reason Privacy is sent to REVIEW.");
  assert.equal(by(policyShellChecks,"T05").status,"review","A generic policy route must not satisfy legal-page reachability.");
  assert.equal(by(policyShellChecks,"L03").status,"not_applicable","An unverified Terms shell must not make an unrelated cookie-policy check applicable or REVIEW.");
  assert.equal(by(policyShellChecks,"L03").explanation.includes("relevant policy-like route"),false,"Unrelated policy routes must not force REVIEW.");

  const privacyShell = {
    pages:[
      page("https://privacy-shell.example.test/","<html><body><h1>Acme Cloud</h1><p>Team workspace for customers.</p><a href=\"/privacy\">Privacy Policy</a><a href=\"/terms\">Terms</a><a href=\"/login\">Log in</a><form><input type=\"email\" name=\"email\"><input type=\"password\" name=\"password\"></form></body></html>"),
      page("https://privacy-shell.example.test/privacy","<html><head><title>Acme Cloud</title></head><body><div id=\"root\">Loading application...</div></body></html>",{home:false})
    ],
    origin:"https://privacy-shell.example.test"
  };
  const privacyShellChecks=runApplicabilityAwareChecks(privacyShell).checks;
  assert.equal(unverifiedPolicyRouteRelevant("P01",privacyShell.pages[1]),true,"An unverified /privacy route must be relevant to privacy-content checks.");
  assert.equal(unverifiedPolicyRouteRelevant("L01",privacyShell.pages[1]),false,"An unverified /privacy route must not be relevant to Terms content.");
  assert.equal(unverifiedPolicyRouteRelevant("L01",policyShell.pages[1]),true,"An unverified /terms route must be relevant to Terms content.");
  assert.equal(unverifiedPolicyRouteRelevant("P01",policyShell.pages[1]),false,"An unverified /terms route must not be relevant to Privacy content.");


  const ordinarySaas = run(`
    <html><body><h1>Acme Cloud</h1>
    <p>Project management workspace for teams.</p>
    <a href="/login">Log in</a><a href="/pricing">Pricing</a>
    <p>$19/month billed monthly.</p>
    </body></html>`);
  assert.equal(by(ordinarySaas,"P08").applicability,"not_applicable","SaaS classification alone must not imply a processor/DPA relationship.");

  const processorSaas = run(`
    <html><body><h1>Acme Data Platform</h1>
    <p>We process customer personal data on behalf of business customers.</p>
    <p>We act as a processor and use subprocessors under our DPA.</p>
    <a href="/login">Log in</a><a href="/pricing">Pricing</a>
    </body></html>`);
  assert.equal(by(processorSaas,"P08").applicability,"applicable","Explicit processor/B2B data-processing evidence must trigger DPA review.");

  const sensitiveCollection = run(`
    <html><body><h1>Health Intake</h1>
    <p>We collect health information and medical records.</p>
    <form><input name="medical_history"><input name="date_of_birth"></form>
    </body></html>`);
  assert.equal(by(sensitiveCollection,"P01").applicability,"applicable");
  assert.equal(by(sensitiveCollection,"P02").applicability,"applicable");


  const anonymousAnalytics = run(`
    <html><body><h1>Public Blog</h1>
    <p>Articles and resources for developers.</p>
    <script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
    </body></html>`);
  assert.equal(by(anonymousAnalytics,"C05").applicability,"applicable","Analytics should still trigger analytics disclosure.");
  assert.equal(by(anonymousAnalytics,"P01").applicability,"not_applicable","Analytics alone is not sufficient evidence of personal-data collection.");
  assert.equal(by(anonymousAnalytics,"P02").applicability,"not_applicable","Analytics alone is not sufficient evidence of personal-data processing.");
  assert.equal(by(anonymousAnalytics,"P11").applicability,"not_applicable","Analytics alone is not sufficient evidence of a full privacy-rights program.");

  // A necessary session/auth cookie alone must not imply non-essential cookie requirements.
  const sessionOnly = {
    pages:[page("https://example.test/","<html><body><h1>Sign in</h1></body></html>",{
      scripts:["/assets/app.js"],
      headers:new Headers({"set-cookie":"session_id=abc; HttpOnly; Secure; SameSite=Lax"})
    })],
    origin:"https://example.test"
  };
  const sessionChecks=runApplicabilityAwareChecks(sessionOnly).checks;
  assert.equal(by(sessionChecks,"L03").applicability,"not_applicable");
  assert.equal(by(sessionChecks,"C01").applicability,"not_applicable");
  assert.equal(by(sessionChecks,"C08").applicability,"not_applicable");


  const portfolio=run(`
    <html><head><title>Jane Doe — Designer Portfolio</title></head>
    <body><h1>Selected Work</h1><p>Designer portfolio, case studies, resume and about me.</p>
    <a href="/about">About</a><a href="/projects">Projects</a><a href="/contact">Contact</a>
    <p>contact: jane@example.test</p></body></html>`);
  assert.ok(["not_applicable","review"].includes(by(portfolio,"L04").status));
  assert.ok(["not_applicable","review"].includes(by(portfolio,"L05").status));
  assert.ok(["not_applicable","review"].includes(by(portfolio,"B03").status));
  assert.ok(["not_applicable","review"].includes(by(portfolio,"B06").status));
  assert.ok(["not_applicable","review"].includes(by(portfolio,"A01").status));
  assert.ok(["not_applicable","review"].includes(by(portfolio,"C03").status));
  assert.ok(["not_applicable","review"].includes(by(portfolio,"C05").status));

  const blog=run(`
    <html><body><h1>My Blog</h1><article>Technology and travel stories.</article>
    <a href="/about">About</a><a href="/contact">Contact</a>
    <form><input type="email" name="email"><button>Subscribe to updates</button></form></body></html>`);
  assert.equal(by(blog,"L04").status,"not_applicable");
  assert.equal(by(blog,"B03").status,"not_applicable");
  assert.equal(by(blog,"B06").status,"not_applicable");
  assert.equal(by(blog,"C03").applicability,"applicable");
  assert.equal(by(blog,"C04").applicability,"applicable");

  const shop=run(`
    <html><body><h1>Acme Store</h1><div>Product catalog</div>
    <div>Running Shoes — $80</div><button>Add to cart</button><a href="/cart">Cart</a><a href="/checkout">Checkout</a>
    <script src="https://js.stripe.com/v3/"></script>
    <a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/refunds">Refunds</a></body></html>`);
  assert.equal(by(shop,"B01").applicability,"applicable");
  assert.equal(by(shop,"B05").applicability,"applicable");
  assert.equal(by(shop,"B06").applicability,"applicable");
  assert.notEqual(by(shop,"B06").status,"pass","A payment SDK script must not count as a payment-provider disclosure in policy text.");
  assert.equal(by(shop,"L04").applicability,"applicable");
  assert.equal(by(shop,"L05").status,"not_applicable");
  assert.equal(by(shop,"P08").status,"not_applicable","One-time ecommerce should not trigger a DPA finding merely because it is commercial");
  assert.equal(by(shop,"B03").status,"not_applicable");

  const saas=run(`
    <html><body><h1>Acme Cloud</h1><p>Project management workspace for teams.</p>
    <a href="/login">Log in</a><a href="/signup">Create account</a><a href="/pricing">Pricing</a>
    <div>$19/month, billed monthly</div><button>Subscribe</button><a href="/dashboard">Dashboard</a>
    <a href="/terms">Terms</a><a href="/privacy">Privacy</a></body></html>`);
  assert.equal(by(saas,"B01").applicability,"applicable");
  assert.equal(by(saas,"B02").applicability,"applicable");
  assert.equal(by(saas,"B03").applicability,"applicable");
  assert.equal(by(saas,"B04").applicability,"applicable");
  assert.equal(by(saas,"P04").applicability,"applicable");
  assert.equal(by(saas,"L11").applicability,"applicable");
  assert.equal(by(saas,"P08").applicability,"not_applicable","Generic SaaS language alone must not imply a processor/DPA relationship");

  const ai=run(`
    <html><body><h1>AI Writing Assistant</h1><p>AI-powered writing assistant. Generate text from your prompt.</p>
    <form><input type="text" name="prompt" placeholder="Enter a prompt"><button>Generate</button></form>
    <a href="/pricing">Pricing</a><a href="/login">Login</a></body></html>`);
  assert.equal(by(ai,"A01").applicability,"applicable");
  assert.notEqual(by(ai,"A01").status,"pass","AI product marketing copy must not count as an AI-use policy disclosure.");
  assert.equal(by(ai,"A04").applicability,"applicable");
  assert.equal(by(ai,"A07").applicability,"applicable");

  const medicalContentAi=run(`
    <html><body><h1>AI Writing Assistant</h1>
    <p>AI-powered assistant that helps writers create content about medical topics and healthcare.</p>
    <form><input name="prompt"><button>Generate</button></form>
    </body></html>`);
  assert.equal(by(medicalContentAi,"A01").applicability,"applicable");
  assert.equal(by(medicalContentAi,"A05").applicability,"not_applicable","Medical-topic content alone is not a consequential AI decision signal.");
  assert.equal(by(medicalContentAi,"A02").applicability,"not_applicable","Generic AI/data context without a data-flow statement must not imply AI data processing.");

  const consequentialAi=run(`
    <html><body><h1>AI Hiring Screening</h1>
    <p>Our AI-powered hiring model automatically screens candidates and makes automated hiring decisions.</p>
    <form><input type="file" name="resume"><button>Assess candidate</button></form>
    </body></html>`);
  assert.equal(by(consequentialAi,"A01").applicability,"applicable");
  assert.equal(by(consequentialAi,"A05").applicability,"applicable","Consequential hiring AI should trigger human-oversight review.");

  const aiWithoutGeneration = run(`
    <html><body><h1>AI Workspace</h1>
    <p>AI-powered assistant for teams.</p>
    <p>Generate invoices, reports and passwords using ordinary workflow tools.</p>
    <form><button>Generate invoice</button></form>
    </body></html>`);
  assert.equal(by(aiWithoutGeneration,"A01").applicability,"applicable");
  assert.equal(by(aiWithoutGeneration,"A07").applicability,"not_applicable","Generic generation language must not imply AI-generated output rights.");

  const aiDataFlow=run(`
    <html><body><h1>AI Assistant</h1>
    <p>We send your prompts and uploaded customer data to our AI provider for processing.</p>
    <form><textarea name="prompt"></textarea><input type="file"></form>
    </body></html>`);
  assert.equal(by(aiDataFlow,"A02").applicability,"applicable","Explicit prompt/customer-data transfer to an AI provider must trigger AI data-processing review.");
  assert.equal(by(ai,"A05").status,"not_applicable","Normal AI writing assistance should not require human oversight by default");
  assert.equal(by(ai,"B01").applicability,"applicable");

  const aiMentionOnly=run(`
    <html><body><h1>Technology Blog</h1><p>We discuss AI, OpenAI and the future of artificial intelligence.</p>
    <article>Our latest AI news.</article></body></html>`);
  assert.equal(by(aiMentionOnly,"A01").status,"not_applicable","AI mentions alone must not trigger AI audit");
  assert.equal(by(aiMentionOnly,"A04").status,"not_applicable");

  const vibeSaneLike=run(`
    <html><body><h1>VibeSane</h1>
    <p>Security scanner for developers. Free for logged-out preview. Sign up for full results.</p>
    <a href="/pricing">Pricing</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a>
    <a href="/github-security-scanner">GitHub security scanner</a>
    <button>Sign up</button><button>Sign in</button>
    </body></html>`);
  assert.equal(by(vibeSaneLike,"L01").applicability,"applicable","Account-based SaaS should make Terms applicable");
  assert.equal(by(vibeSaneLike,"L01").status,"review","A Terms link without a crawled destination must not count as a verified policy.");
  assert.equal(by(vibeSaneLike,"L02").status,"review","A Privacy link without a crawled destination must not count as a verified policy.");
  assert.equal(by(vibeSaneLike,"T05").status,"review","Legal-page reachability must be verified from fetched policy documents, not links alone.");
  assert.notEqual(by(vibeSaneLike,"T02").status,"pass","A security-scanner feature link is not a security contact or disclosure process.");
  assert.equal(by(vibeSaneLike,"P01").applicability,"applicable","Account creation makes privacy applicable");
  assert.equal(by(vibeSaneLike,"C05").status,"not_applicable","No analytics signal should not become review");
  assert.equal(by(vibeSaneLike,"C06").status,"not_applicable","No tracking signal should not become review");
  assert.equal(by(vibeSaneLike,"A01").status,"not_applicable","No product-level AI signal should not become review");
  assert.equal(by(vibeSaneLike,"B03").status,"not_applicable","Free preview without recurring billing should not trigger auto-renewal");
  assert.equal(by(vibeSaneLike,"B06").status,"not_applicable","No checkout/payment signal should not trigger payment-provider finding");

  // Regression for the production VibeSane-like report: a recognizable security-scanning
  // product must not mark core business/privacy/accessibility checks N/A merely because
  // the crawl missed one of the secondary commercial or personal-data signals.
  const vibesaneCore = runApplicabilityAwareChecks({
    pages:[
      page("https://vibesane.example/","<html><body><h1>VibeSane</h1><p>Security scanner for developers. Scan your website and repository for vulnerabilities.</p><a href=\"/pricing\">Pricing</a><a href=\"/terms\">Terms</a><a href=\"/privacy\">Privacy</a><a href=\"/login\">Log in</a><button>Sign up</button></body></html>"),
      page("https://vibesane.example/pricing","<html><body><h1>Pricing</h1><p>Free preview; Pro plan for teams.</p></body></html>",{home:false}),
    ],
    origin:"https://vibesane.example"
  });
  for (const id of ["L09","L10","L12","P11","T03","T05"]) {
    assert.notEqual(by(vibesaneCore.checks,id).applicability,"not_applicable",`VibeSane-like product must not silently N/A core check ${id} when product type is identified.`);
    assert.notEqual(by(vibesaneCore.checks,id).status,"not_applicable",`VibeSane-like product must surface core check ${id} as applicable or review.`);
  }
  assert.equal(vibesaneCore.checks.length,50,"VibeSane regression must retain all 50 checks");
  assert.equal(vibesaneCore.checks.filter(c=>c.core===true).length,12,"VibeSane regression must retain the 12-check V1 scope");

  const securityTool=run(`
    <html><body><h1>Code Security Scanner</h1>
    <p>Scan your repository for vulnerabilities with automated security testing.</p>
    </body></html>`);

  // Outbound store/API links on an informational site must not turn it into
  // an ecommerce or developer-tool product. Product-type inference should use
  // first-party capability evidence, not unrelated destinations.
  const encyclopediaResult=runApplicabilityAwareChecks({
    pages:[
      page("https://encyclopedia.example/","<html><body><h1>Open Encyclopedia</h1><p>The free encyclopedia for history, science and culture.</p><a href=\"/login\">Log in</a><a href=\"/articles/commerce-terms\">Read article</a></body></html>",{
        links:[
          {text:"Shop",href:"https://store.encyclopedia.example/"},
          {text:"API",href:"https://api.encyclopedia.example/"},
          {text:"Donate",href:"https://donate.encyclopedia.example/"}
        ],
        scripts:["https://js.stripe.com/v3/"]
      }),
      page("https://encyclopedia.example/articles/commerce-terms","<html><body><h1>Commerce glossary</h1><p>This article explains monthly subscription plans billed monthly, pricing strategies, shopping cart workflows, product catalogs and API documentation terminology.</p></body></html>",{home:false})
    ],
    origin:"https://encyclopedia.example"
  });
  const encyclopedia=encyclopediaResult.checks;
  assert.equal(encyclopediaResult.context.signals.ecommerce,false,"An outbound store link must not prove first-party ecommerce.");
  assert.equal(encyclopediaResult.context.signals.pricing,false,"Outbound links must not create pricing evidence.");
  assert.equal(encyclopediaResult.context.signals.subscription,false,"Incidental subscription language in an article must not prove a subscription business model.");
  assert.equal(encyclopediaResult.context.signals.developerApi,false,"An outbound API link must not prove a developer product.");
  assert.equal(encyclopediaResult.context.signals.payments,true,"A payment SDK can be detected without implying the product sells a paid service.");
  assert.equal(encyclopediaResult.context.signals.paidService,false,"A payment SDK alone must not imply a paid service.");
  assert.equal(encyclopediaResult.context.commercialModel,"unknown","A payment SDK alone must not imply a freemium commercial model.");
  assert.ok(!encyclopediaResult.context.productTypes.includes("ecommerce"),"Informational content must not be classified as ecommerce from an outbound store link.");
  assert.ok(!encyclopediaResult.context.productTypes.includes("saas"),"Informational content must not be classified as SaaS from unrelated commercial links.");
  assert.ok(!encyclopediaResult.context.productTypes.includes("developer_tool"),"Informational content must not be classified as a developer tool from an outbound API link.");
  assert.deepEqual(encyclopediaResult.context.productTypes,["content"],"An encyclopedia must remain a content product when article text contains incidental commerce/API terms and the homepage only exposes generic login.");
  assert.equal(encyclopediaResult.context.commercialModel,"unknown","Article text must not invent a commercial model for an informational publication.");

  const pricingSite=runApplicabilityAwareChecks({
    pages:[
      page("https://acme.example/","<html><body><h1>Acme Cloud</h1><p>Project workspace for teams.</p><a href=\"/pricing\">Pricing</a></body></html>"),
      page("https://acme.example/pricing","<html><body><h1>Pricing Plans</h1><p>Pro plan $19/month, billed monthly.</p><button>Subscribe now</button></body></html>",{home:false})
    ],
    origin:"https://acme.example"
  });
  assert.equal(pricingSite.context.signals.pricing,true,"A first-party pricing route must be recognized.");
  assert.equal(pricingSite.context.signals.subscription,true,"Recurring billing on a first-party pricing route must be recognized.");
  assert.equal(pricingSite.context.commercialModel,"subscription","Verified recurring pricing must preserve subscription classification.");
  assert.equal(by(securityTool,"L01").applicability,"applicable","A clearly identified security scanning product must not be treated as generic content.");
  assert.equal(by(securityTool,"P01").applicability,"not_applicable","Product classification alone must not imply personal-data collection without supporting evidence.");
  assert.notEqual(by(securityTool,"T02").status,"pass","A security tool without a visible contact/disclosure route must not pass T02.");

  const securityContact=run(`
    <html><body><h1>Code Security Scanner</h1>
    <p>Report a vulnerability to security@acme.test. We maintain a responsible disclosure process.</p>
    <a href="/security-contact">Security contact</a>
    </body></html>`);
  assert.equal(by(securityContact,"T02").status,"pass","Explicit security contact and responsible-disclosure evidence should satisfy T02.");

  const securityTeamOnly=run(`<html><body><h1>Code Security Scanner</h1><p>Meet our security team. We build the fastest scanner for developers.</p></body></html>`);
  assert.notEqual(by(securityTeamOnly,"T02").status,"pass","A generic security-team mention must not count as a security contact.");

  const analytics=run(`
    <html><body><h1>Company</h1><p>Welcome.</p>
    <script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
    <script src="https://www.google-analytics.com/analytics.js"></script></body></html>`);
  assert.equal(by(analytics,"C05").applicability,"applicable");
  assert.equal(by(analytics,"C06").applicability,"applicable");

  const analyticsDisclosure=run(`
    <html><body><h1>Company</h1><p>We use Google Analytics to understand site usage.</p></body></html>`);
  assert.equal(by(analyticsDisclosure,"C05").applicability,"applicable","Analytics disclosure text must trigger analytics detection");

  const facebookPixel=run(`
    <html><body><h1>Company</h1>
    <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
    </body></html>`);
  assert.equal(by(facebookPixel,"C06").applicability,"applicable","Facebook Pixel script host must trigger tracking detection");

  const noTracking=run(`
    <html><body><h1>Simple Site</h1><p>Just information. No analytics or tracking scripts.</p></body></html>`);
  assert.ok(["not_applicable","review"].includes(by(noTracking,"C05").status));
  assert.ok(["not_applicable","review"].includes(by(noTracking,"C08").status));
  assert.ok(["not_applicable","review"].includes(by(noTracking,"C07").status));
  assert.ok(["not_applicable","review"].includes(by(noTracking,"L03").status));

  const freeSaas=run(
    `<html><body><h1>Free Project Tool</h1><p>Team workspace with a free plan.</p>
    <a href="/login">Log in</a><a href="/pricing">Pricing</a><div>Free forever</div></body></html>`);
  assert.equal(by(freeSaas,"B01").applicability,"applicable");
  assert.equal(by(freeSaas,"B02").status,"not_applicable");
  assert.equal(by(freeSaas,"B03").status,"not_applicable");
  assert.equal(by(freeSaas,"B05").status,"not_applicable");

  const legalPageOnly=run(`
    <html><body><h1>Terms of Service</h1>
    <p>Subscriptions, recurring billing, AI providers, analytics, cookies and payment processors may be used.</p>
    <a href="/privacy">Privacy</a><a href="/terms">Terms</a></body></html>`);
  assert.ok(["not_applicable","unknown"].includes(by(legalPageOnly,"B03").applicability),"Legal-page language must not manufacture subscription applicability");
  assert.ok(["not_applicable","unknown"].includes(by(legalPageOnly,"A01").applicability),"Legal-page language must not manufacture AI applicability");
  assert.ok(["not_applicable","unknown"].includes(by(legalPageOnly,"C05").applicability),"Legal-page language must not manufacture analytics applicability");

  const searchOnly=run(`
    <html><body><h1>Documentation</h1><input type="text" name="q" placeholder="Search documentation"></body></html>`);
  assert.ok(["not_applicable","unknown"].includes(by(searchOnly,"P01").applicability),"Generic search input is not sufficient evidence of personal-data collection");

  const noAccessibilityEvidence=run(`
    <html><body><h1>Developer Security Scanner</h1><p>Security scanning for developer repositories.</p><a href="/pricing">Pricing</a></body></html>`);
  assert.equal(by(noAccessibilityEvidence,"T03").applicability,"applicable","Developer tools should receive an accessibility review.");
  assert.equal(by(noAccessibilityEvidence,"T03").status,"review","Absence of a crawler-detectable accessibility statement must not be treated as proof of non-compliance.");

  const jsHeavy=run(`
    <html><body><div id="root"></div>
    <script src="/assets/a.js"></script><script src="/assets/b.js"></script><script src="/assets/c.js"></script>
    <script src="/assets/d.js"></script><script src="/assets/e.js"></script><script src="/assets/f.js"></script>
    </body></html>`);
  assert.equal(by(jsHeavy,"C05").status,"review","Low-visibility analytics checks should be review, not missing");
  assert.equal(by(jsHeavy,"A01").status,"review","Low-visibility AI checks should be review, not missing");

  for (const [name,checks] of Object.entries({portfolio,blog,shop,saas,ai,aiMentionOnly,analytics,noTracking,freeSaas,vibeSaneLike,securityTool,securityContact,encyclopedia,legalPageOnly,searchOnly,noAccessibilityEvidence,jsHeavy,vagueChecks,policyShellChecks})) {
    assert.equal(checks.length,50,`${name}: every scenario must evaluate all 50 checks`);
    assert.equal(checks.filter(check=>check.core===true).length,12,`${name}: exactly 12 checks must be core`);
    assert.deepEqual(checks.filter(check=>check.core===true).map(check=>check.id).sort(),[...CORE_CHECK_IDS].sort(),`${name}: core flags must match the canonical registry`);
    assert.ok(checks.filter(check=>check.core!==true).every(check=>!CORE_CHECK_IDS.includes(check.id)),`${name}: non-core checks must remain non-core`);
    for (const check of checks) {
      assert.ok(["applicable","not_applicable","unknown"].includes(check.applicability),`${name}/${check.id}: invalid applicability`);
      assert.ok(["pass","review","missing","not_applicable"].includes(check.status),`${name}/${check.id}: invalid status`);
      if(check.applicability==="not_applicable") assert.equal(check.status,"not_applicable",`${name}/${check.id}: N/A applicability must produce N/A status`);
      if(check.status==="missing") assert.equal(check.applicability,"applicable",`${name}/${check.id}: missing requires applicability`);
    }
  }

  console.log("SUE applicability regression suite: PASS");
  console.log("Scenarios: 19 | Checks per scenario: 50 | Total evaluations: 950.");
  console.log("Validated: portfolio, blog, ecommerce, SaaS, AI product, AI mention-only, analytics, no-tracking, free SaaS, VibeSane-like SaaS, explicit security-tool classification, security-contact evidence, legal-page contamination, generic search input, accessibility-evidence uncertainty, JS-heavy coverage.");
} finally {
  await rm(dir,{recursive:true,force:true});
}
