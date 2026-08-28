import { Check, Sparkles, ShieldCheck, Zap } from 'lucide-react';
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

            <div
              className="vg-rise relative overflow-hidden border-2 border-primary bg-gradient-to-br from-primary/[0.10] via-card to-accent p-7 shadow-[6px_6px_0_hsl(var(--foreground))]"
              style={{ animationDelay: '120ms' }}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
              <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl" />
              <div className="absolute right-4 top-4 flex items-center gap-1.5 border border-primary/50 bg-primary/10 px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                <Sparkles size={11} /> Recommended
              </div>

              <div className="relative">
                <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                  <ShieldCheck size={14} /> Pro
                </div>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-[42px] font-black tracking-[-0.06em]">$11.99</span>
                  <span className="mb-2 text-[14px] text-muted-foreground">/ month</span>
                </div>
                <p className="mt-2 text-[13px] text-muted-foreground">For teams shipping Supabase apps in production.</p>

                <a
                  href="/checkout"
                  className="vg-button vg-focus mt-6 flex w-full items-center justify-center gap-2 border border-primary bg-primary py-3 text-[13px] font-bold text-primary-foreground shadow-[3px_3px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 hover:bg-primary/90"
                >
                  <Zap size={15} />
                  Get Pro <span aria-hidden="true">→</span>
                </a>

                <ul className="mt-7 space-y-3">
                  {PRO_FEATURES.map((f, index) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13px] text-foreground">
                      <span className="mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Check size={11} strokeWidth={3} />
                      </span>
                      <span className={index === 0 ? 'font-semibold' : ''}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
