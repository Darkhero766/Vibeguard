import { ArrowLeft, ArrowRight, Check, Tag } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { useMemo, useState } from 'react';

const PLAN_PRICE = 11.99;
const CHECKOUT_FEE = 0.01;

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const [coupon, setCoupon] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');
  const [message, setMessage] = useState('');

  const total = useMemo(() => PLAN_PRICE + CHECKOUT_FEE, []);

  const applyCoupon = () => {
    const code = coupon.trim();
    if (!code) {
      setMessage('Enter a coupon code first.');
      return;
    }
    setAppliedCoupon(code.toUpperCase());
    setMessage(`Coupon ${code.toUpperCase()} saved for checkout.`);
  };

  const handleBuyNow = () => {
    const gatewayUrl = (import.meta.env.VITE_PAYMENT_GATEWAY_URL as string | undefined)?.trim();
    if (gatewayUrl) {
      window.location.href = gatewayUrl;
      return;
    }
    setMessage('Payment gateway is not configured yet. Your order details are ready for the gateway connection.');
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
              One simple checkout. No cart, no distractions — just your plan and the final amount.
            </p>
          </div>

          <div className="vg-rise mt-10 border-2 border-foreground bg-card p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border pb-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Plan</p>
                <h2 className="mt-2 text-[22px] font-bold tracking-[-0.03em]">VibeSane Pro</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">Unlimited scans · priority queue · history · team sharing</p>
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
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Checkout processing</span>
                <span className="font-semibold">$0.01</span>
              </div>
              {appliedCoupon && (
                <div className="flex items-center justify-between gap-4 text-primary">
                  <span>Coupon · {appliedCoupon}</span>
                  <span>Applied at gateway</span>
                </div>
              )}
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
                    onChange={(e) => { setCoupon(e.target.value); setMessage(''); }}
                    placeholder="Enter code"
                    className="vg-focus h-12 w-full border border-foreground bg-card pl-10 pr-3 text-[14px] uppercase outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={applyCoupon}
                  className="vg-button vg-focus h-12 border border-border bg-card px-5 text-[12px] font-bold hover:border-primary/50"
                >
                  Apply
                </button>
              </div>
            </div>

            {message && (
              <p className="mt-4 text-[12px] leading-5 text-muted-foreground" aria-live="polite">
                {message}
              </p>
            )}

            <button
              type="button"
              onClick={handleBuyNow}
              className="vg-button vg-focus mt-7 flex h-14 w-full items-center justify-center gap-2 border border-primary bg-primary px-5 text-[14px] font-bold text-primary-foreground hover:bg-primary/90"
            >
              Buy now — ${total.toFixed(2)} <ArrowRight size={16} />
            </button>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Check size={12} /> Secure checkout</span>
              <span>Gateway-ready</span>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
