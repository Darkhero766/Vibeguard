import { Check, Zap } from 'lucide-react';
import { Link } from 'wouter';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

const FREE_FEATURES = [
  '1 free security scan',
  'Supabase RLS gap detection',
  'Unauthenticated write detection',
  'Client-side service_role key check',
  'SECURITY DEFINER RPC detection',
  'Committed .env file detection',
  'Plain-English findings report',
  'Copy report as text',
];

const PRO_FEATURES = [
  'Everything in Free',
  'Unlimited scans',
  'Priority scanning queue',
  'Scan history & comparison',
  'Team sharing',
  'Webhook notifications',
  'CSV / JSON export',
  'Priority support',
];

export default function PricingPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[1040px] px-5 py-16 sm:px-8 sm:py-24">
          <div className="vg-rise max-w-xl">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              <span className="inline-block h-px w-8 bg-primary" />
              Pricing
            </div>
            <h1 className="mt-5 text-[36px] font-extrabold tracking-[-0.05em] sm:text-[48px]">
              Simple, honest pricing
            </h1>
            <p className="mt-4 text-[16px] leading-7 text-muted-foreground">
              Start for free. Upgrade when you're shipping more.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:max-w-3xl">
            {/* Free tier */}
            <div className="vg-rise border border-border bg-card p-7" style={{ animationDelay: '60ms' }}>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Free</div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-[40px] font-extrabold tracking-[-0.05em]">$0</span>
                <span className="mb-2 text-[14px] text-muted-foreground">/ forever</span>
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">For developers trying VibeSane once.</p>

              <Link
                href="/auth?mode=signup"
                className="vg-button vg-focus mt-6 flex items-center justify-center gap-2 border border-primary bg-primary py-2.5 text-[13px] font-bold text-primary-foreground hover:bg-primary/90"
              >
                Get started free
              </Link>

              <ul className="mt-7 space-y-3">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-foreground">
                    <Check size={14} className="mt-0.5 shrink-0 text-primary" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro tier */}
            <div className="vg-rise relative border border-border bg-card p-7 opacity-80" style={{ animationDelay: '120ms' }}>
              <div className="absolute right-4 top-4 flex items-center gap-1 border border-border bg-secondary px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <Zap size={9} className="text-primary" />
                Coming soon
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Pro</div>
              <div className="mt-3 flex items-end gap-1">
                <span className="text-[40px] font-extrabold tracking-[-0.05em]">$12</span>
                <span className="mb-2 text-[14px] text-muted-foreground">/ month</span>
              </div>
              <p className="mt-2 text-[13px] text-muted-foreground">For teams shipping Supabase apps in production.</p>

              <button
                disabled
                className="mt-6 flex w-full cursor-not-allowed items-center justify-center gap-2 border border-border bg-muted py-2.5 text-[13px] font-bold text-muted-foreground opacity-60"
              >
                Upgrade — Coming soon
              </button>

              <ul className="mt-7 space-y-3">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13px] text-foreground">
                    <Check size={14} className="mt-0.5 shrink-0 text-primary" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
