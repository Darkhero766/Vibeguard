import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pages = [
  {
    path: '/agentshield',
    title: 'AgentShield for Claude Code | VibeSane',
    description: 'Local security scanning, bounded repair guidance and final verification for Claude Code. Private-beta developer preview; public release pending.',
    staticBody: `<main><article><h1>AgentShield for Claude Code: build with AI, check security as you code.</h1><p>VibeSane AgentShield is a developer-preview local security scanner for supported code patterns. It uses Claude Code hooks to provide actionable findings, bounded repair guidance, and a final changed-file scan.</p><h2>Monitor, Assist and Auto-fix</h2><p>Monitor reports supported risks; Assist provides repair guidance; Auto-fix can request bounded repairs within Claude Code permissions when explicitly enabled.</p><h2>Current release status</h2><p>External distribution is pending live authenticated Claude Code validation and human security review. No public installer is currently approved. Static findings and their disappearance are not proof of a vulnerability-free application.</p><p><a href="/scan-public">Use VibeSane's existing GitHub repository web scanner</a>. Web repository scanning and local AgentShield are separate workflows. Local source code is not automatically uploaded to the website.</p></article></main>`,
  },
  {
    path: '/foxy',
    title: 'Foxy — Local-First MCP Security for AI Coding Agents | VibeSane',
    description: 'Connect six AI coding-agent host targets with one command. Foxy is VibeSane’s local-first, workspace-scoped, read-only MCP security integration for Windows, macOS and Linux.',
    staticBody: `<main class="mx-auto max-w-[1040px] px-5 pb-16 pt-12 sm:px-8 sm:pt-20"><section class="grid gap-8 border-b border-[#d9d5cc] pb-14 lg:grid-cols-[1.1fr_.9fr]"><div><p class="inline-flex border border-[#d8b63d] bg-[#f4c842] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.16em]">FOXY · MCP SECURITY LAYER</p><h1 class="mt-6 text-5xl font-extrabold leading-[.98] tracking-[-.07em]">Your AI agent.<span class="block text-[#e34a3b]">A safer workspace.</span></h1><p class="mt-5 max-w-xl text-base leading-8 text-[#535750]">Foxy connects AI coding agents to VibeSane’s local security engine. Scan supported changes, inspect findings, verify remediation, and keep workspace access explicitly scoped.</p><p class="mt-6 font-mono text-[10px] uppercase tracking-[.12em] text-[#6c7068]">Windows · macOS · Linux · Node.js 20+ · Private beta / reviewer preview</p></div><div class="border-2 border-[#101111] bg-[#101111] p-6 text-[#f4f1ea] shadow-[8px_8px_0_#e34a3b]"><p class="font-mono text-[10px] uppercase tracking-[.16em] text-[#f4c842]">One-command setup</p><pre class="mt-5 overflow-x-auto border border-white/10 bg-[#191d1b] p-4 font-mono text-sm leading-7"><code>$ vibesane connect
$ vibesane doctor
$ vibesane disconnect --agent all</code></pre><p class="mt-4 text-xs leading-5 text-[#aeb2aa]">Unpublished beta CLI. Commands shown are available to authorized local builds; this page does not install software on your device.</p></div></section><section class="py-14"><p class="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#e34a3b]">HOST COMPATIBILITY</p><h2 class="mt-3 text-3xl font-extrabold tracking-[-.05em]">One connector. Six host targets.</h2><div class="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><article class="border border-[#d5d1c8] bg-[#fbf9f3] p-5"><h3 class="font-extrabold">Claude Code</h3><p class="mt-2 text-xs leading-5 text-[#666a62]">Project .mcp.json · --agent claude</p></article><article class="border border-[#d5d1c8] bg-[#fbf9f3] p-5"><h3 class="font-extrabold">Codex CLI</h3><p class="mt-2 text-xs leading-5 text-[#666a62]">Project .codex/config.toml · --agent codex</p></article><article class="border border-[#d5d1c8] bg-[#fbf9f3] p-5"><h3 class="font-extrabold">Cursor</h3><p class="mt-2 text-xs leading-5 text-[#666a62]">Project .cursor/mcp.json · --agent cursor</p></article><article class="border border-[#d5d1c8] bg-[#fbf9f3] p-5"><h3 class="font-extrabold">Gemini CLI</h3><p class="mt-2 text-xs leading-5 text-[#666a62]">Project .gemini/settings.json · --agent gemini</p></article><article class="border border-[#d5d1c8] bg-[#fbf9f3] p-5"><h3 class="font-extrabold">Roo Code</h3><p class="mt-2 text-xs leading-5 text-[#666a62]">Project .roo/mcp.json · --agent roo</p></article><article class="border border-[#d5d1c8] bg-[#fbf9f3] p-5"><h3 class="font-extrabold">GitHub Copilot</h3><p class="mt-2 text-xs leading-5 text-[#666a62]">VS Code workspace MCP and Copilot CLI · --agent copilot</p></article></div><p class="mt-5 border-l-4 border-[#f4c842] bg-[#ebe7de] p-4 text-xs leading-6 text-[#62665e]">Use <code>vibesane connect --agent mcp</code> to print a generic STDIO entry for another MCP-compatible client. Non-MCP agents require their own integration surface.</p></section><section class="border-y border-[#303331] bg-[#101111] px-6 py-10 text-[#f4f1ea]"><h2 class="text-3xl font-extrabold tracking-[-.05em]">Useful context. No extra authority.</h2><ul class="mt-6 grid gap-3 sm:grid-cols-2"><li class="text-sm text-[#d3d6cf]">Read-only MCP tools; no shell, patch, commit or deploy capability.</li><li class="text-sm text-[#d3d6cf]">Only the canonical Git root selected at setup is authorized.</li><li class="text-sm text-[#d3d6cf]">No repository scripts or project code are executed by the connector.</li><li class="text-sm text-[#d3d6cf]">Existing host configuration is backed up; unrelated entries are preserved.</li><li class="text-sm text-[#d3d6cf]">Malformed, symlinked or conflicting configuration is refused.</li><li class="text-sm text-[#d3d6cf]">Host approval and the agent’s own permissions remain in control.</li></ul></section><section class="py-14"><p class="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#e34a3b]">QUALIFICATION & RELEASE STATE</p><h2 class="mt-3 text-3xl font-extrabold tracking-[-.05em]">Engineering evidence before distribution.</h2><div class="mt-7 grid gap-4 lg:grid-cols-2"><article class="border-2 border-[#101111] bg-[#fbf9f3] p-6 shadow-[5px_5px_0_#f4c842]"><h3 class="text-xl font-extrabold">Windows + macOS</h3><p class="mt-3 text-sm leading-6 text-[#62665e]">Foxy beta.4 has passed source-matched automated release qualification on both Windows and macOS. The release run validates source integrity, regression tests, adversarial benchmarks, offline packaging, installation, connector setup/removal, MCP boundaries and queue behavior.</p><p class="mt-4 font-mono text-[9px] uppercase tracking-[.12em] text-[#777b72]">Node.js 24 CI runners · Automated qualification</p></article><article class="border border-[#d5d1c8] bg-[#ebe7de] p-6"><h3 class="text-xl font-extrabold">Real-host validation remains separate</h3><p class="mt-3 text-sm leading-6 text-[#62665e]">Automated CI does not claim authenticated live acceptance on every host. Host restart/approval flows and independent human security review still require separate sign-off before public distribution.</p><a href="https://github.com/Darkhero766/Vibeguard/pull/70" class="mt-4 inline-block text-sm font-bold text-[#e34a3b]">Review Foxy qualification PR →</a></article></div><p class="mt-6 text-xs leading-6 text-[#6c7068]">Foxy is an unpublished developer preview, not a security certification. Static-analysis coverage is limited to supported file types and rules; partial or unknown coverage is never a clean result.</p><p class="mt-6 text-sm font-bold"><a href="/scan-public">Open VibeSane’s existing GitHub scanner</a></p></section></main>`,
  },
  {
    path: '/github-security-scanner',
    title: 'GitHub Security Scanner | VibeSane',
    description: 'Scan GitHub repositories for vulnerabilities, secrets, and risky code before they ship with VibeSane.',
  },
  {
    path: '/github-protection',
    title: 'GitHub Protection for Every Code Change | VibeSane',
    description: 'Protect GitHub repositories by scanning code changes for newly introduced security issues with VibeSane.',
  },
  {
    path: '/vibe-coding-security',
    title: 'Vibe Coding Security | VibeSane',
    description: 'Security scanning for AI-assisted and vibe-coded applications. Catch secrets and risky code before you ship.',
  },
  {
    path: '/supabase-security',
    title: 'Supabase Security Scanner | VibeSane',
    description: 'Check Supabase-powered applications for security risks, exposed secrets, and unsafe code patterns with VibeSane.',
  },
  {
    path: '/nextjs-security',
    title: 'Next.js Security Scanner | VibeSane',
    description: 'Scan Next.js applications for security issues, exposed secrets, and risky code patterns before deployment.',
  },
  {
    path: '/settings',
    title: 'Settings | VibeSane',
    description: 'Manage your VibeSane account, security, billing, notifications, repository data, appearance, and account controls.',
  },
  {
    path: '/terms',
    title: 'Terms & Conditions | VibeSane',
    description: 'VibeSane Terms & Conditions covering use of the security analysis service, paid plans, acceptable use, disclaimers, and liability.',
    staticBody: `<main><article><h1>Terms &amp; Conditions</h1><p>Last updated: October 6, 2026.</p><section><h2>Agreement</h2><p>These Terms &amp; Conditions govern your access to and use of VibeSane, including the website, security-scanning features, repository-protection features, reports, APIs and paid plans. By creating an account, using the Service, or purchasing a paid plan, you agree to these Terms.</p></section><section><h2>What VibeSane does</h2><p>VibeSane provides automated, heuristic security analysis of supported publicly accessible GitHub repositories and related security signals. A scan is not a certification, guarantee, penetration test, legal opinion, or professional security audit. Results may be incomplete or inaccurate and require human verification.</p></section><section><h2>Plans, refunds and cancellation</h2><p>Plan features and usage limits are shown on the pricing or account pages. Subscriptions are non-refundable by default. You may cancel using available billing controls or by contacting support. Statutory rights that cannot lawfully be excluded remain unaffected.</p></section><section><h2>Governing Law &amp; Mandatory Rights</h2><p>These Terms are intended to be interpreted under applicable law. Mandatory consumer or statutory rights that cannot legally be waived remain unaffected. A specific governing-law or dispute-resolution provision has not been identified in this public text and should be completed and reviewed by qualified local counsel before reliance.</p></section><section><h2>Contact</h2><p>For questions about these Terms or the Service, use the VibeSane <a href="/contact">Contact and Support</a> page.</p></section><p>This crawlable page presents key public terms; the full Terms page is rendered by the application when JavaScript is available.</p></article></main>`,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy | VibeSane',
    description: 'VibeSane Privacy Policy explaining account data, scan usage, retention, security, and privacy-rights requests.',
    staticBody: `<main><article><h1>Privacy Policy</h1><p>Last updated: October 12, 2026.</p><section><h2>What we collect</h2><p>We collect your email address when you create an account, your scan usage count to enforce account limits, and the repository URL you submit to perform a repository scan. The submitted repository URL is not stored after that scan completes. VibeSane does not store scanned repository source code. SUE website-audit reports are saved to your account history and may include the audited public URL, timestamp, score, check statuses, product-context signals, and short evidence excerpts from public pages.</p></section><section><h2>Use and retention</h2><p>Account data and saved SUE audit reports are retained while your account exists. You may request account-data deletion through the Contact and Support route; we aim to process a verified request within 30 days. Authentication is handled by Supabase Auth. Data in transit is encrypted via HTTPS.</p></section><section><h2>Privacy rights</h2><p>Depending on your location and applicable law, you may have the right to request access to, correction of, or deletion of personal data, and to raise questions about its processing. To exercise a right or ask a privacy question, use the <a href="/contact">Contact and Support</a> page. Do not include passwords, tokens, or sensitive personal details in a public issue.</p></section><section><h2>Contact</h2><p>For privacy questions and data requests, use the official VibeSane support route listed on the <a href="/contact">Contact and Support</a> page.</p></section><p>This crawlable policy summary is consistent with the full Privacy Policy rendered by the application when JavaScript is available.</p></article></main>`,
  },
  {
    path: '/contact',
    title: 'Contact & Support | VibeSane',
    description: 'Contact VibeSane for product support, account questions, and privacy requests.',
    staticBody: `<main><article><h1>Contact and Support</h1><p>For VibeSane product support, account questions, or privacy requests, contact the project through its <a href="https://github.com/Darkhero766/Vibeguard">official GitHub repository</a>. Do not post passwords, access tokens, private repository contents, or sensitive personal information in a public issue. If a request contains sensitive details, ask the maintainer for a private channel.</p><h2>Privacy requests</h2><p>You may request access to, correction of, or deletion of personal data through the support route. Applicable rights depend on your location and the law that applies.</p></article></main>`,
  },
  {
    path: '/security-disclosure',
    title: 'Security Disclosure | VibeSane',
    description: 'How to report a potential security vulnerability affecting VibeSane.',
    staticBody: `<main><article><h1>Security Disclosure</h1><p>VibeSane welcomes responsible disclosure of suspected security vulnerabilities.</p><h2>How to report a vulnerability</h2><p>Use the repository's <a href="https://github.com/Darkhero766/Vibeguard/security/advisories/new">GitHub private vulnerability reporting form</a> if it is enabled for this repository. Do not publish exploit details, credentials, tokens, or personal data in a public issue. If private reporting is unavailable, contact the maintainer through the <a href="/contact">Contact and Support</a> page and request a private channel before sharing technical details.</p><p>Please include a concise description, affected component, reproduction steps, and impact only in a private channel.</p></article></main>`,
  },
  {
    path: '/accessibility',
    title: 'Accessibility Statement | VibeSane',
    description: 'VibeSane accessibility information and a route for reporting accessibility barriers.',
    staticBody: `<main><article><h1>Accessibility Statement</h1><p>VibeSane aims to make its website usable with keyboard navigation and assistive technologies. This statement is not a claim of WCAG conformance or an accessibility certification. Automated checks cannot establish accessibility conformance on their own; meaningful evaluation also requires manual testing with keyboard navigation and screen readers.</p><h2>Report an accessibility barrier</h2><p>If you encounter an accessibility issue, contact us through the <a href="/contact">Contact and Support</a> page and describe the page and barrier. Please do not include passwords or other sensitive account information.</p></article></main>`,
  },
];

const outputDir = path.resolve('dist/public');
const template = await readFile(path.join(outputDir, 'index.html'), 'utf8');

function replaceMetaTag(html, attribute, value, content) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = new RegExp(`<meta\\s+${attribute}="${escapedValue}"\\s+content="[^"]*"\\s*/?>`);
  return html.replace(tag, `<meta ${attribute}="${value}" content="${content.replaceAll('"', '&quot;')}" />`);
}

for (const page of pages) {
  const canonicalUrl = `https://vibesane.app${page.path}`;
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonicalUrl}" />`);
  html = replaceMetaTag(html, 'name', 'description', page.description);
  html = replaceMetaTag(html, 'property', 'og:title', page.title);
  html = replaceMetaTag(html, 'property', 'og:description', page.description);
  html = replaceMetaTag(html, 'property', 'og:url', canonicalUrl);
  html = replaceMetaTag(html, 'name', 'twitter:title', page.title);
  html = replaceMetaTag(html, 'name', 'twitter:description', page.description);
  html = html.replace('<div id="root"></div>', `<div id="root">${page.staticBody ?? ''}</div>`);
  if (page.staticBody && !html.includes(page.staticBody)) throw new Error(`Failed to inject crawlable page body for ${page.path}`);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    description: page.description,
    url: canonicalUrl,
    isPartOf: { '@type': 'WebSite', name: 'VibeSane', url: 'https://vibesane.app/' },
  };
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`,
  );

  const routeDir = path.join(outputDir, page.path.slice(1));
  await mkdir(routeDir, { recursive: true });
  const outputFile = path.join(routeDir, 'index.html');
  await writeFile(outputFile, html);

  // Verify the artifact on disk, not just the in-memory template. This catches
  // path/output regressions before the static site is published.
  const writtenHtml = await readFile(outputFile, 'utf8');
  if (!writtenHtml.includes('<title>' + page.title + '</title>')) {
    throw new Error('Generated page title is missing from output for ' + page.path);
  }
  if (page.staticBody && (!writtenHtml.includes(page.staticBody) || !writtenHtml.includes('<h1'))) {
    throw new Error('Generated policy body is missing from output for ' + page.path);
  }
}

console.log(`Generated ${pages.length} static pages with crawlable public content where configured.`);
