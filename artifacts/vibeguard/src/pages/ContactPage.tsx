import { Link } from 'wouter';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export default function ContactPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-[760px] flex-1 px-5 py-12 sm:px-8 sm:py-20">
        <article className="border-2 border-foreground bg-card p-6 shadow-[6px_6px_0_hsl(var(--foreground))] sm:p-9">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">VibeSane · Support</p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Contact and Support</h1>
          <p className="mt-5 leading-7 text-muted-foreground">For product support, account questions, or privacy requests, contact the project through its official GitHub repository.</p>
          <a className="mt-6 inline-flex border-2 border-foreground bg-primary px-4 py-3 font-mono text-xs font-bold uppercase tracking-wide text-primary-foreground shadow-[4px_4px_0_hsl(var(--foreground))]" href="https://github.com/Darkhero766/Vibeguard" target="_blank" rel="noopener noreferrer">Open official repository</a>
          <section className="mt-8 border-t border-border pt-6">
            <h2 className="text-lg font-bold">Privacy and account requests</h2>
            <p className="mt-2 leading-7 text-muted-foreground">You may request access to, correction of, or deletion of personal data through the support route. Do not include passwords, tokens, private repository contents, or sensitive personal details in a public issue. If your request needs sensitive details, ask the maintainer for a private channel.</p>
            <p className="mt-3 text-sm text-muted-foreground">Read the <Link className="underline underline-offset-4" href="/privacy">Privacy Policy</Link> and <Link className="underline underline-offset-4" href="/terms">Terms &amp; Conditions</Link>.</p>
          </section>
        </article>
      </main>
      <Footer />
    </div>
  );
}
