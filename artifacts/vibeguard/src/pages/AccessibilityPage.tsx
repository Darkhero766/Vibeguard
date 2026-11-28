import { Link } from 'wouter';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

export default function AccessibilityPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav />
      <main className="mx-auto w-full max-w-[760px] flex-1 px-5 py-12 sm:px-8 sm:py-20">
        <article className="border-2 border-foreground bg-card p-6 shadow-[6px_6px_0_hsl(var(--foreground))] sm:p-9">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">VibeSane · Access</p>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight">Accessibility Statement</h1>
          <p className="mt-5 leading-7 text-muted-foreground">VibeSane aims to make its website usable with keyboard navigation and assistive technologies. This statement is not a claim of WCAG conformance or an accessibility certification. Automated checks cannot establish accessibility conformance on their own; meaningful evaluation also requires manual testing with keyboard navigation and screen readers.</p>
          <section className="mt-7 border-t border-border pt-6">
            <h2 className="text-lg font-bold">Report an accessibility barrier</h2>
            <p className="mt-2 leading-7 text-muted-foreground">If you encounter an accessibility issue, contact us through the <Link className="underline underline-offset-4" href="/contact">Contact and Support</Link> page and describe the page and barrier. Please do not include passwords or other sensitive account information.</p>
          </section>
        </article>
      </main>
      <Footer />
    </div>
  );
}
