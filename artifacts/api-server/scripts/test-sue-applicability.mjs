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
  const page=(url,html,{home=true,text:txt=null,scripts:sc=null,links:ls=[],forms:fs=[]}={})=>({
    url:new URL(url),html,text:txt??html.replace(/<[^>]+>/g," "),links:ls,scripts:sc??[...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]),forms:fs,
    inputs:[],metadata:"",structuredData:"",headers:headers(),isHome:home
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

  const ai=run(`
    <html><body><h1>AI Writing Assistant</h1><p>AI-powered writing assistant. Generate text from your prompt.</p>
    <form><input type="text" name="prompt" placeholder="Enter a prompt"><button>Generate</button></form>
    <a href="/pricing">Pricing</a><a href="/login">Login</a></body></html>`);
  assert.equal(by(ai,"A01").applicability,"applicable");
  assert.equal(by(ai,"A04").applicability,"applicable");
  assert.equal(by(ai,"A07").applicability,"applicable");
  assert.equal(by(ai,"B01").applicability,"applicable");

  const aiMentionOnly=run(`
    <html><body><h1>Technology Blog</h1><p>We discuss AI, OpenAI and the future of artificial intelligence.</p>
    <article>Our latest AI news.</article></body></html>`);
  assert.equal(by(aiMentionOnly,"A01").status,"not_applicable","AI mentions alone must not trigger AI audit");
  assert.equal(by(aiMentionOnly,"A04").status,"not_applicable");

  const analytics=run(`
    <html><body><h1>Company</h1><p>Welcome.</p>
    <script src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
    <script src="https://www.google-analytics.com/analytics.js"></script></body></html>`);
  assert.equal(by(analytics,"C05").applicability,"applicable");
  assert.equal(by(analytics,"C06").applicability,"applicable");

  const noTracking=run(`
    <html><body><h1>Simple Site</h1><p>Just information. No analytics or tracking scripts.</p></body></html>`);
  assert.equal(by(noTracking,"C05").status,"not_applicable");
  assert.equal(by(noTracking,"C08").status,"not_applicable");
  assert.equal(by(noTracking,"L03").status,"not_applicable");

  const jsHeavy=run(`
    <html><body><div id="root"></div>
    <script src="/assets/a.js"></script><script src="/assets/b.js"></script><script src="/assets/c.js"></script>
    <script src="/assets/d.js"></script><script src="/assets/e.js"></script><script src="/assets/f.js"></script>
    </body></html>`);
  assert.equal(by(jsHeavy,"C05").status,"review","Low-visibility analytics checks should be review, not missing");
  assert.equal(by(jsHeavy,"A01").status,"review","Low-visibility AI checks should be review, not missing");

  for (const [name,checks] of Object.entries({portfolio,blog,shop,saas,ai,aiMentionOnly,analytics,noTracking,jsHeavy})) {
    assert.equal(checks.length,50,`${name}: every scenario must evaluate all 50 checks`);
    for (const check of checks) {
      assert.ok(["applicable","not_applicable","unknown"].includes(check.applicability),`${name}/${check.id}: invalid applicability`);
      assert.ok(["pass","review","missing","not_applicable"].includes(check.status),`${name}/${check.id}: invalid status`);
      if(check.applicability==="not_applicable") assert.equal(check.status,"not_applicable",`${name}/${check.id}: N/A applicability must produce N/A status`);
      if(check.status==="missing") assert.equal(check.applicability,"applicable",`${name}/${check.id}: missing requires applicability`);
    }
  }

  console.log("SUE applicability regression suite: PASS");
  console.log("Scenarios: 9 | Checks per scenario: 50 | Total evaluations: 450");
  console.log("Validated: portfolio, blog, ecommerce, SaaS, AI product, AI mention-only, analytics, no-tracking, JS-heavy coverage.");
} finally {
  await rm(dir,{recursive:true,force:true});
}
