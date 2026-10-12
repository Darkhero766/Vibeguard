import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pages = [
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
