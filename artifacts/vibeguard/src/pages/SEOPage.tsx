import { Link } from 'wouter';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useEffect } from 'react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

type SeoConfig = {
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  points: string[];
};

const PAGES: Record<string, SeoConfig> = {
  '/github-security-scanner': {
    title: 'GitHub Security Scanner | VibeSane',
    description: 'Scan GitHub repositories for vulnerabilities, secrets, and risky code before they ship with VibeSane.',
    eyebrow: 'GITHUB SECURITY SCANNER',
    heading: 'Find security problems before they become production problems.',
    intro: 'VibeSane scans GitHub code for high-signal security issues, exposed credentials, dangerous patterns, and vulnerabilities—so developers can ship with more confidence.',
    points: ['Detect exposed secrets and credentials', 'Surface high-signal security patterns', 'Review findings with file and line context', 'Scan changes before they reach production'],
  },
  '/github-protection': {
    title: 'GitHub Protection for Every Code Change | VibeSane',
    description: 'Protect GitHub repositories by scanning code changes for newly introduced security issues with VibeSane.',
    eyebrow: 'GITHUB PROTECTION',
    heading: 'A security layer between your code change and production.',
    intro: 'VibeSane brings security checks directly into the GitHub workflow, helping teams catch newly introduced risks while a change is still easy to fix.',
    points: ['Focus on security issues introduced by changes', 'Keep risky code from quietly shipping', 'Give developers actionable findings', 'Fit security into the existing GitHub workflow'],
  },
  '/vibe-coding-security': {
    title: 'Vibe Coding Security | VibeSane',
    description: 'Security scanning for AI-assisted and vibe-coded applications. Catch secrets and risky code before you ship.',
    eyebrow: 'VIBE CODING SECURITY',
    heading: 'Move fast with AI. Don’t let security move slower.',
    intro: 'AI-assisted coding makes it easier than ever to build quickly. VibeSane adds a practical security checkpoint so generated or rapidly written code gets checked before it becomes someone else’s problem.',
    points: ['Catch risky generated code', 'Check for leaked secrets', 'Turn security findings into actionable fixes', 'Keep rapid prototyping from becoming technical debt'],
  },
  '/supabase-security': {
    title: 'Supabase Security Scanner | VibeSane',
    description: 'Check Supabase-powered applications for security risks, exposed secrets, and unsafe code patterns with VibeSane.',
    eyebrow: 'SUPABASE SECURITY',
    heading: 'Ship Supabase apps without shipping avoidable security mistakes.',
    intro: 'Supabase makes backend development fast. VibeSane helps teams add a security review layer around the application code, configuration, credentials, and patterns that connect to their backend.',
    points: ['Look for exposed project credentials', 'Review security-sensitive application code', 'Catch risky patterns before deployment', 'Keep backend security visible during development'],
  },
  '/nextjs-security': {
    title: 'Next.js Security Scanner | VibeSane',
    description: 'Scan Next.js applications for security issues, exposed secrets, and risky code patterns before deployment.',
    eyebrow: 'NEXT.JS SECURITY',
    heading: 'Security checks for the Next.js applications you ship every day.',
    intro: 'Next.js gives developers powerful server and client capabilities. VibeSane adds a security-focused scan to help identify dangerous patterns and secrets before they make it into a release.',
    points: ['Scan server and application code for risky patterns', 'Detect exposed credentials and secrets', 'Review findings with exact file context', 'Add a security checkpoint to your deployment workflow'],
  },
};

function setMeta(name: string, content: string) {
  let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement('meta');
    tag.name = name;
    document.head.appendChild(tag);
  }
  tag.content = content;
}

function setProperty(property: string, content: string) {
  let tag = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('property', property);
    document.head.appendChild(tag);
  }
  tag.content = content;
}

export default function SEOPage({ path }: { path: string }) {
  const config = PAGES[path] ?? PAGES['/github-security-scanner'];

  useEffect(() => {
    const canonicalUrl = `https://vibesane.app${path}`;
    document.title = config.title;
    setMeta('description', config.description);
    setProperty('og:title', config.title);
    setProperty('og:description', config.description);
    setProperty('og:url', canonicalUrl);
    setProperty('og:type', 'website');
    setProperty('og:site_name', 'VibeSane');
    setProperty('twitter:title', config.title);
    setProperty('twitter:description', config.description);
    setMeta('twitter:card', 'summary');

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    let schema = document.getElementById('vibesane-seo-schema') as HTMLScriptElement | null;
    if (!schema) {
      schema = document.createElement('script');
      schema.id = 'vibesane-seo-schema';
      schema.type = 'application/ld+json';
      document.head.appendChild(schema);
    }
    schema.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: config.title,
      description: config.description,
      url: canonicalUrl,
      isPartOf: { '@type': 'WebSite', name: 'VibeSane', url: 'https://vibesane.app/' },
    });

    window.scrollTo(0, 0);
  }, [config, path]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main>
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pt-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              <ShieldCheck size={14} /> {config.eyebrow}
            </div>
            <h1 className="mt-6 text-4xl font-bold tracking-[-0.045em] sm:text-6xl">{config.heading}</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{config.intro}</p>
            <Link href="/auth?mode=signup" className="vg-button mt-8 inline-flex items-center gap-2 border border-primary bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90">
              Scan your repository <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-2 md:py-20">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">WHY VIBESANE</p>
              <h2 className="mt-4 text-2xl font-bold tracking-[-0.035em] sm:text-3xl">Security that fits the way modern developers build.</h2>
            </div>
            <ul className="space-y-4">
              {config.points.map((point) => (
                <li key={point} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={18} />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="border border-border bg-card p-7 sm:p-10">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">READY TO CHECK YOUR CODE?</p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.035em]">Catch the problem while it is still easy to fix.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Connect GitHub and let VibeSane add a security checkpoint to your development workflow.</p>
            <Link href="/auth?mode=signup" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
              Get started with VibeSane <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
