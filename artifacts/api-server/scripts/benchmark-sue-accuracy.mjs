import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir=await mkdtemp(join(tmpdir(),"sue-benchmark-"));
const outfile=join(dir,"sue-checks.mjs");

const scenarios=[
  {
    name:"portfolio",
    html:`<html><body><h1>Alex Designer Portfolio</h1><p>Selected work, case studies and resume.</p><a href="/about">About</a><a href="/projects">Projects</a><a href="/contact">Contact</a></body></html>`,
    expect:{L04:"not_applicable",B03:"not_applicable",B06:"not_applicable",A01:"not_applicable",C05:"not_applicable"}
  },
  {
    name:"editorial blog",
    html:`<html><body><h1>Tech Journal</h1><article>Technology and science stories.</article><form><input type="email" name="email"><button>Subscribe to updates</button></form></body></html>`,
    expect:{C03:"applicable",C04:"applicable",B03:"not_applicable",B06:"not_applicable"}
  },
  {
    name:"service business",
    html:`<html><body><h1>Acme Consulting Ltd</h1><p>We provide paid consulting and legal operations services. Starting at ₹25000.</p><a href="/contact">Contact us</a><a href="/pricing">Pricing</a><a href="/privacy">Privacy Policy</a></body></html>`,
    expect:{L01:"applicable",L09:"applicable",L10:"applicable",L12:"applicable",B01:"applicable",B05:"applicable"}
  },
  {
    name:"one-time ecommerce",
    html:`<html><body><h1>Acme Store</h1><p>Product catalog. Running Shoes — ₹4999.</p><button>Add to cart</button><a href="/cart">Cart</a><a href="/checkout">Checkout</a><script src="https://js.stripe.com/v3/"></script></body></html>`,
    expect:{B01:"applicable",B05:"applicable",B06:"applicable",L04:"applicable",B03:"not_applicable",L05:"not_applicable"}
  },
  {
    name:"subscription SaaS",
    html:`<html><body><h1>Acme Cloud</h1><p>Project management workspace for teams.</p><a href="/login">Log in</a><a href="/signup">Create account</a><a href="/pricing">Pricing</a><p>₹999/month, billed monthly. Renews automatically.</p><button>Subscribe</button><a href="/dashboard">Dashboard</a></body></html>`,
    expect:{L01:"applicable",P01:"applicable",P04:"applicable",B01:"applicable",B02:"applicable",B03:"applicable",B04:"applicable",B05:"applicable",L05:"applicable"}
  },
  {
    name:"free SaaS",
    html:`<html><body><h1>Free Project Tool</h1><p>Team workspace with a free plan. Free forever.</p><a href="/login">Log in</a><a href="/pricing">Pricing</a></body></html>`,
    expect:{L01:"applicable",P01:"applicable",B01:"applicable",B02:"not_applicable",B03:"not_applicable",B05:"not_applicable"}
  },
  {
    name:"AI writing product",
    html:`<html><body><h1>AI Writing Assistant</h1><p>AI-powered writing assistant. Generate text from your prompt.</p><form><input name="prompt" placeholder="Enter a prompt"><button>Generate</button></form><a href="/pricing">Pricing</a></body></html>`,
    expect:{A01:"applicable",A04:"applicable",A07:"applicable",A05:"not_applicable",B01:"applicable"}
  },
  {
    name:"high-impact AI",
    html:`<html><body><h1>AI Loan Eligibility Assistant</h1><p>AI-powered system that evaluates loan eligibility and risk scores.</p><form><input name="prompt"><button>Submit</button></form><p>We process personal data and financial information.</p></body></html>`,
    expect:{A01:"applicable",A05:"applicable",A02:"applicable",P01:"applicable",P02:"applicable"}
  },
  {
    name:"marketplace",
    html:`<html><body><h1>Service Marketplace</h1><p>Marketplace connecting buyers and sellers. Vendors create seller profiles and list services.</p><a href="/seller">Seller dashboard</a><a href="/checkout">Checkout</a><script src="https://js.stripe.com/v3/"></script></body></html>`,
    expect:{L01:"applicable",L06:"applicable",L13:"applicable",B01:"applicable",B05:"applicable",B06:"applicable"}
  },
  {
    name:"developer API",
    html:`<html><body><h1>Acme Developer API</h1><p>API platform with API keys, endpoints, SDK and webhook access. We process customer data on behalf of business customers as a processor.</p><a href="/docs">Developers</a><a href="/pricing">Pricing</a><a href="/login">Sign in</a></body></html>`,
    expect:{L01:"applicable",P01:"applicable",P08:"applicable",T02:"applicable",B01:"applicable"}
  },
  {
    name:"community platform",
    html:`<html><body><h1>Community Hub</h1><p>Create a public profile, post comments and upload your content. Community members can sign up.</p><a href="/register">Register</a><form><textarea name="post"></textarea></form></body></html>`,
    expect:{L01:"applicable",L06:"applicable",L13:"applicable",P01:"applicable",P04:"applicable",T03:"applicable"}
  },
  {
    name:"newsletter media",
    html:`<html><body><h1>Daily Brief</h1><p>News and analysis.</p><form><input type="email"><button>Subscribe to our updates</button></form></body></html>`,
    expect:{C03:"applicable",C04:"applicable",P01:"applicable",B03:"not_applicable"}
  },
  {
    name:"ad-supported media",
    html:`<html><body><h1>News Network</h1><p>Breaking news and sponsored content.</p><script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script><script src="https://www.googletagmanager.com/gtag/js?id=G"></script></body></html>`,
    expect:{C05:"applicable",C08:"applicable",L03:"applicable",P01:"not_applicable",P06:"applicable"}
  },
  {
    name:"UGC social app",
    html:`<html><body><h1>Photo Community</h1><p>Users upload photos, create posts, comments and public profiles.</p><a href="/signup">Sign up</a><form><input type="file" name="upload"><textarea name="comment"></textarea></form></body></html>`,
    expect:{L01:"applicable",L06:"applicable",L13:"applicable",P01:"applicable",P04:"applicable",A01:"not_applicable"}
  },
  {
    name:"analytics-only public blog",
    html:`<html><body><h1>Public Blog</h1><p>Articles and resources.</p><script src="https://www.google-analytics.com/analytics.js"></script></body></html>`,
    expect:{C05:"applicable",P01:"not_applicable",P02:"not_applicable",P11:"not_applicable"}
  },
  {
    name:"generic SaaS without processor role",
    html:`<html><body><h1>Team Notes</h1><p>Free workspace for teams. No customer data is processed on behalf of clients.</p><a href="/login">Log in</a><a href="/pricing">Pricing</a></body></html>`,
    expect:{P08:"not_applicable",P01:"applicable",B01:"applicable"}
  },
  {
    name:"explicit sensitive-data intake",
    html:`<html><body><h1>Health Intake</h1><p>We collect health information and medical records.</p><form><input name="medical_history"><input name="date_of_birth"></form></body></html>`,
    expect:{P01:"applicable",P02:"applicable"}
  },
  {
    name:"nonprofit",
    html:`<html><body><h1>Open Science Foundation</h1><p>Nonprofit organization advancing open science. Donate to support our work.</p><a href="/donate">Donate</a><a href="/contact">Contact us</a></body></html>`,
    expect:{L09:"unknown",B03:"unknown",B06:"unknown",A01:"unknown"}
  }
];

try {
  await build({entryPoints:["./src/lib/sue-checks.ts"],bundle:true,format:"esm",platform:"node",outfile,external:["node:*"],logLevel:"silent"});
  const {runApplicabilityAwareChecks}=await import(outfile);
  const page=(html)=>({
    url:new URL("https://benchmark.example/"),html,
    text:html.replace(/<[^>]+>/g," "),
    links:[...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi)].map(m=>({href:m[1],text:m[2]})),
    scripts:[...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]),
    forms:[...html.matchAll(/<form[^>]*>[\s\S]*?<\/form>/gi)].map(m=>({html:m[0]})),
    inputs:[],metadata:"",structuredData:"",headers:new Headers(),isHome:true
  });
  let total=0,correct=0;
  const failures=[];
  for(const s of scenarios){
    const {checks}=runApplicabilityAwareChecks({pages:[page(s.html)],origin:"https://benchmark.example"});
    for(const [id,expected] of Object.entries(s.expect)){
      total++;
      const actual=checks.find(c=>c.id===id)?.applicability;
      if(actual===expected) correct++;
      else failures.push({scenario:s.name,id,expected,actual});
    }
    assert.equal(checks.length,50,s.name+" must evaluate all 50 checks");
  }
  const accuracy=correct/total;
  console.log(JSON.stringify({scenarios:scenarios.length,assertions:total,correct,incorrect:total-correct,accuracy,failures},null,2));
  assert.ok(accuracy>=0.90,"SUE benchmark accuracy must be at least 90%");
} finally {
  await rm(dir,{recursive:true,force:true});
}
