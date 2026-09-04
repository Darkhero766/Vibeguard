import { ArrowLeft, ArrowRight, Check, Tag, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/lib/api';

const PLAN_PRICE = 11.99;
const HACKATHON_COUPON = 'HACKATHON60';

export default function CheckoutPage() {
  const [, navigate] = useLocation();
  const { session, refreshUsage } = useAuth();
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const total = useMemo(() => PLAN_PRICE, []);

  const applyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    if (!code) {
      setMessage('Enter a coupon code first.');
      return;
    }
    setAppliedCoupon(code);
    setMessage(code === HACKATHON_COUPON
      ? 'Hackathon code verified. Pro will be activated at no cost.'
      : `Coupon ${code} saved for checkout.`);
  };

  const handleBuyNow = async () => {
    if (!session?.access_token) {
      navigate('/auth?mode=signin');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(apiUrl('/api/checkout'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ coupon: appliedCoupon || coupon.trim().toUpperCase() || undefined }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Unable to start checkout');

      if (data.free) {
        await refreshUsage();
        setMessage(data.message || 'Pro activated successfully.');
        window.setTimeout(() => navigate('/dashboard?upgraded=true'), 700);
        return;
      }

      if (!data.checkout_url) throw new Error('Checkout URL was not returned by the payment gateway.');
      window.location.href = data.checkout_url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-[720px] px-5 py-12 sm:px-8 sm:py-20">
          <Link
            href="/pricing"
            className="vg-focus inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={13} /> Back to pricing
          </Link>

          <div className="vg-rise mt-10">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
              <span className="inline-block h-px w-8 bg-primary" />
              Pro checkout
            </div>
            <h1 className="mt-5 text-[40px] font-extrabold tracking-[-0.05em] sm:text-[52px]">
              Get VibeSane Pro.
            </h1>
            <p className="mt-3 max-w-xl text-[14px] leading-6 text-muted-foreground">
              Secure hosted checkout. Your Pro access is activated only after the payment system confirms it.
            </p>
          </div>

          <div className="vg-rise mt-10 border-2 border-foreground bg-card p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border pb-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Plan</p>
                <h2 className="mt-2 text-[22px] font-bold tracking-[-0.03em]">VibeSane Pro</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">10 complete scans/month · 5 repositories · reports · priority features</p>
              </div>
              <div className="text-right">
                <p className="text-[30px] font-extrabold tracking-[-0.05em]">$11.99</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">per month</p>
              </div>
            </div>

            <div className="mt-6 space-y-4 text-[13px]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Pro subscription</span>
                <span className="font-semibold">$11.99</span>
              </div>
              <div className="border-t border-border pt-5">
                <div className="flex items-end justify-between gap-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Total</span>
                  <span className="text-[36px] font-black tracking-[-0.05em]">${total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="mt-7 border border-border bg-muted/40 p-4">
              <label className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground" htmlFor="coupon-code">
                Coupon code
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Tag className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                  <input
                    id="coupon-code"
                    value={coupon}
                    onChange={(e) => { setCoupon(e.target.value); setAppliedCoupon(''); setMessage(''); }}
                    placeholder="Enter code"
                    className="vg-focus h-12 w-full border border-foreground bg-card pl-10 pr-3 text-[14px] uppercase outline-none focus:border-primary"
                    autoComplete="off"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={loading}
                  className="vg-button vg-focus h-12 border border-border bg-card px-5 text-[12px] font-bold hover:border-primary/50 disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
              {appliedCoupon && (
                <p className="mt-3 text-[11px] text-primary" aria-live="polite">
                  {appliedCoupon} applied
                </p>
              )}
            </div>

            {message && (
              <p className="mt-4 text-[12px] leading-5 text-muted-foreground" aria-live="polite">
                {message}
              </p>
            )}

            <button
              type="button"
              onClick={handleBuyNow}
              disabled={loading}
              className="vg-button vg-focus mt-7 flex h-14 w-full items-center justify-center gap-2 border border-primary bg-primary px-5 text-[14px] font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? <><Loader2 size={17} className="animate-spin" /> Securing checkout…</> : <>Buy now — ${total.toFixed(2)} <ArrowRight size={16} /></>}
            </button>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} /> Dodo secure checkout</span>
              <span className="inline-flex items-center gap-1.5"><Check size={12} /> Webhook verified</span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
