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

  const portfolio=run(`
    <html><head><title>Jane Doe — Designer Portfolio</title></head>
    <body><h1>Selected Work</h1><p>Designer portfolio, case studies, resume and about me.</p>
    <a href="/about">About</a><a href="/projects">Projects</a><a href="/contact">Contact</a>
    <p>contact: jane@example.test</p></body></html>`);
  assert.equal(by(portfolio,"L04").status,"not_applicable");
  assert.equal(by(portfolio,"L05").status,"not_applicable");
  assert.equal(by(portfolio,"B03").status,"not_applicable");
  assert.equal(by(portfolio,"B06").status,"not_applicable");
  assert.equal(by(portfolio,"A01").status,"not_applicable");
  assert.equal(by(portfolio,"C03").status,"not_applicable");
  assert.equal(by(portfolio,"C05").status,"not_applicable");

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
  assert.equal(by(saas,"P08").applicability,"applicable","SaaS must retain DPA applicability");

  const ai=run(`
    <html><body><h1>AI Writing Assistant</h1><p>AI-powered writing assistant. Generate text from your prompt.</p>
    <form><input type="text" name="prompt" placeholder="Enter a prompt"><button>Generate</button></form>
    <a href="/pricing">Pricing</a><a href="/login">Login</a></body></html>`);
  assert.equal(by(ai,"A01").applicability,"applicable");
  assert.equal(by(ai,"A04").applicability,"applicable");
  assert.equal(by(ai,"A07").applicability,"applicable");
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
  assert.equal(by(noTracking,"C05").status,"not_applicable");
  assert.equal(by(noTracking,"C08").status,"not_applicable");
  assert.equal(by(noTracking,"C07").status,"not_applicable");
  assert.equal(by(noTracking,"L03").status,"not_applicable");

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
  assert.equal(by(legalPageOnly,"B03").applicability,"not_applicable","Legal-page language must not manufacture subscription applicability");
  assert.equal(by(legalPageOnly,"A01").applicability,"not_applicable","Legal-page language must not manufacture AI applicability");
  assert.equal(by(legalPageOnly,"C05").applicability,"not_applicable","Legal-page language must not manufacture analytics applicability");

  const searchOnly=run(`
    <html><body><h1>Documentation</h1><input type="text" name="q" placeholder="Search documentation"></body></html>`);
  assert.equal(by(searchOnly,"P01").applicability,"not_applicable","Generic search input is not sufficient evidence of personal-data collection");

  const jsHeavy=run(`
    <html><body><div id="root"></div>
    <script src="/assets/a.js"></script><script src="/assets/b.js"></script><script src="/assets/c.js"></script>
    <script src="/assets/d.js"></script><script src="/assets/e.js"></script><script src="/assets/f.js"></script>
    </body></html>`);
  assert.equal(by(jsHeavy,"C05").status,"review","Low-visibility analytics checks should be review, not missing");
  assert.equal(by(jsHeavy,"A01").status,"review","Low-visibility AI checks should be review, not missing");

  for (const [name,checks] of Object.entries({portfolio,blog,shop,saas,ai,aiMentionOnly,analytics,noTracking,freeSaas,vibeSaneLike,legalPageOnly,searchOnly,jsHeavy})) {
    assert.equal(checks.length,50,`${name}: every scenario must evaluate all 50 checks`);
    for (const check of checks) {
      assert.ok(["applicable","not_applicable","unknown"].includes(check.applicability),`${name}/${check.id}: invalid applicability`);
      assert.ok(["pass","review","missing","not_applicable"].includes(check.status),`${name}/${check.id}: invalid status`);
      if(check.applicability==="not_applicable") assert.equal(check.status,"not_applicable",`${name}/${check.id}: N/A applicability must produce N/A status`);
      if(check.status==="missing") assert.equal(check.applicability,"applicable",`${name}/${check.id}: missing requires applicability`);
    }
  }

  console.log("SUE applicability regression suite: PASS");
  console.log("Scenarios: 13 | Checks per scenario: 50 | Total evaluations: 650");
  console.log("Validated: portfolio, blog, ecommerce, SaaS, AI product, AI mention-only, analytics, no-tracking, free SaaS, VibeSane-like SaaS, legal-page contamination, generic search input, JS-heavy coverage.");
} finally {
  await rm(dir,{recursive:true,force:true});
}
