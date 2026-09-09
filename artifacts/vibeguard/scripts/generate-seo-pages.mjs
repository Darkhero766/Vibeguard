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
  await writeFile(path.join(routeDir, 'index.html'), html);
}

console.log(`Generated ${pages.length} static SEO pages.`);