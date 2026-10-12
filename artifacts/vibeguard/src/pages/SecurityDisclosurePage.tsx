import { Link } from 'wouter';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export default function SecurityDisclosurePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-[760px] flex-1 px-5 py-12 sm:px-8 sm:py-20">
        <article className="border-2 border-foreground bg-card p-6 shadow-[6px_6px_0_hsl(var(--foreground))] sm:p-9">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">VibeSane · Trust</p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Security Disclosure</h1>
          <p className="mt-5 leading-7 text-muted-foreground">VibeSane welcomes responsible disclosure of suspected security vulnerabilities.</p>
          <section className="mt-7">
            <h2 className="text-lg font-bold">How to report a vulnerability</h2>
            <p className="mt-2 leading-7 text-muted-foreground">Use the repository's GitHub private vulnerability reporting form if it is enabled for this repository. Do not publish exploit details, credentials, tokens, or personal data in a public issue. If private reporting is unavailable, contact the maintainer through the <Link className="underline underline-offset-4" href="/contact">Contact and Support</Link> page and request a private channel before sharing technical details.</p>
            <a className="mt-5 inline-flex border-2 border-foreground bg-primary px-4 py-3 font-mono text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-[4px_4px_0_hsl(var(--foreground))]" href="https://github.com/Darkhero766/Vibeguard/security/advisories/new" target="_blank" rel="noopener noreferrer">Open GitHub private reporting</a>
          </section>
          <p className="mt-7 text-sm leading-6 text-muted-foreground">When reporting privately, include the affected component, concise reproduction steps, and potential impact. Please avoid accessing, modifying, or downloading other users' data.</p>
        </article>
      </main>
      <Footer />
    </div>
  );
}
