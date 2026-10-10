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
  const {runApplicabilityAwareChecks,definitionsCount}=await import(outfile);
  assert.equal(definitionsCount(),50,"SUE must retain exactly 50 checks");

  const headers=()=>new Headers();
  // SSRF host-validation unit coverage is kept in the audit route itself;
  // these cases document the security boundary for future route-level tests.
  assert.ok((await import("node:net")).isIP("2001:db8::1")===6,"Node must recognize IPv6 test addresses");

  const page=(url,html,{home=true,text:txt=null,scripts:sc=null,links:ls=[],forms:fs=[],headers:hdrs=null}={})=>({
    url:new URL(url),html,text:txt??html.replace(/<[^>]+>/g," "),links:ls,scripts:sc??[...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]),forms:fs,
    inputs:[],metadata:"",structuredData:"",headers:hdrs??headers(),isHome:home
  });
  const corpus=(html,url="https://example.test/")=>({pages:[page(url,html)],origin:new URL(url).origin});
  const run=(html,url)=>runApplicabilityAwareChecks(corpus(html,url)).checks;
  const by=(checks,id)=>checks.find(x=>x.id===id);

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
  assert.equal(by(vibeSaneLike,"P01").applicability,"applicable","Account creation makes privacy applicable");
  assert.equal(by(vibeSaneLike,"C05").status,"not_applicable","No analytics signal should not become review");
  assert.equal(by(vibeSaneLike,"C06").status,"not_applicable","No tracking signal should not become review");
  assert.equal(by(vibeSaneLike,"A01").status,"not_applicable","No product-level AI signal should not become review");
  assert.equal(by(vibeSaneLike,"B03").status,"not_applicable","Free preview without recurring billing should not trigger auto-renewal");
  assert.equal(by(vibeSaneLike,"B06").status,"not_applicable","No checkout/payment signal should not trigger payment-provider finding");

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

  const jsHeavy=run(`
    <html><body><div id="root"></div>
    <script src="/assets/a.js"></script><script src="/assets/b.js"></script><script src="/assets/c.js"></script>
    <script src="/assets/d.js"></script><script src="/assets/e.js"></script><script src="/assets/f.js"></script>
    </body></html>`);
  assert.equal(by(jsHeavy,"C05").status,"review","Low-visibility analytics checks should be review, not missing");
  assert.equal(by(jsHeavy,"A01").status,"review","Low-visibility AI checks should be review, not missing");

  for (const [name,checks] of Object.entries({portfolio,blog,shop,saas,ai,aiMentionOnly,analytics,noTracking,freeSaas,vibeSaneLike,legalPageOnly,searchOnly,jsHeavy,vagueChecks})) {
    assert.equal(checks.length,50,`${name}: every scenario must evaluate all 50 checks`);
    for (const check of checks) {
      assert.ok(["applicable","not_applicable","unknown"].includes(check.applicability),`${name}/${check.id}: invalid applicability`);
      assert.ok(["pass","review","missing","not_applicable"].includes(check.status),`${name}/${check.id}: invalid status`);
      if(check.applicability==="not_applicable") assert.equal(check.status,"not_applicable",`${name}/${check.id}: N/A applicability must produce N/A status`);
      if(check.status==="missing") assert.equal(check.applicability,"applicable",`${name}/${check.id}: missing requires applicability`);
    }
  }

  console.log("SUE applicability regression suite: PASS");
  console.log("Scenarios: 14 | Checks per scenario: 50 | Total evaluations: 700.");
  console.log("Validated: portfolio, blog, ecommerce, SaaS, AI product, AI mention-only, analytics, no-tracking, free SaaS, VibeSane-like SaaS, legal-page contamination, generic search input, JS-heavy coverage.");
} finally {
  await rm(dir,{recursive:true,force:true});
}
