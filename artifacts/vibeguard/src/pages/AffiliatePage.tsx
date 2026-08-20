import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Clipboard, Gift, Link2, Loader2, Share2, Sparkles, Users, Wallet } from 'lucide-react';
import { Link } from 'wouter';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

type Referral = {
  id: string;
  referred_user: string;
  status: 'signed_up' | 'paid' | 'rejected';
  commission_cents: number;
  created_at: string;
  converted_at: string | null;
};

type AffiliateProfile = { owner: string; code: string };

const COMMISSION_CENTS = 500;
const SUBSCRIPTION_CENTS = 1000;

function makeFallbackCode(userId: string) {
  return `VS-${userId.replace(/-/g, '').slice(0, 7).toUpperCase()}`;
}

export default function AffiliatePage() {
  const { user, authLoading } = useAuth();
  const [profile, setProfile] = useState<AffiliateProfile | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const { data: existing, error: profileError } = await supabase
        .from('affiliate_profiles')
        .select('owner, code')
        .eq('owner', user.id)
        .maybeSingle();
      if (profileError) throw profileError;

      let current = existing as AffiliateProfile | null;
      if (!current) {
        const code = makeFallbackCode(user.id);
        const { data: created, error: createError } = await supabase
          .from('affiliate_profiles')
          .insert({ owner: user.id, code })
          .select('owner, code')
          .single();
        if (createError) throw createError;
        current = created as AffiliateProfile;
      }
      setProfile(current);

      const { data: rows, error: referralsError } = await supabase
        .from('affiliate_referrals')
        .select('id, referred_user, status, commission_cents, created_at, converted_at')
        .eq('affiliate_owner', user.id)
        .order('created_at', { ascending: false });
      if (referralsError) throw referralsError;
      setReferrals((rows ?? []) as Referral[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your referral dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) void load(); }, [user?.id]);

  const code = profile?.code ?? (user ? makeFallbackCode(user.id) : 'VS-YOURCODE');
  const referralLink = useMemo(() => `${window.location.origin}/auth?mode=signup&ref=${encodeURIComponent(code)}`, [code]);
  const paid = referrals.filter((r) => r.status === 'paid');
  const pending = referrals.filter((r) => r.status === 'signed_up');
  const earnedCents = paid.reduce((sum, r) => sum + (r.commission_cents || COMMISSION_CENTS), 0);
  const pendingCents = pending.reduce((sum, r) => sum + (r.commission_cents || COMMISSION_CENTS), 0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch { setError('Clipboard access is unavailable. Copy the link manually.'); }
  };

  const share = async () => {
    setSharing(true);
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Try VibeSane',
          text: 'Scan your GitHub project for security issues with VibeSane.',
          url: referralLink,
        });
      } else {
        await copy();
      }
    } catch { /* user cancelled native share */ }
    finally { setSharing(false); }
  };

  if (authLoading) return <div className="min-h-[100dvh] bg-background" />;

  if (!user) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <Nav />
        <main className="flex flex-1 items-center justify-center px-5 py-20">
          <div className="w-full max-w-lg border-2 border-foreground bg-card p-8 shadow-[8px_8px_0_hsl(var(--foreground))]">
            <Gift className="text-primary" size={28} />
            <h1 className="mt-5 text-3xl font-black tracking-[-0.05em]">Refer & Earn</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Sign in to get your personal referral link and start earning $5 for every customer who upgrades.</p>
            <Link href="/auth?mode=signin" className="vg-button mt-7 inline-flex items-center gap-2 border border-primary bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Sign in to continue <ArrowRight size={15} /></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav />
      <main className="flex-1 overflow-hidden">
        <div className="vg-grid pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-50" />
        <section className="relative mx-auto w-full max-w-[1040px] px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
              <span className="h-1.5 w-1.5 bg-primary" />
              VibeSane partner network
            </div>
            <h1 className="vg-display mt-6 text-[58px] leading-[.84] tracking-[0.005em] sm:text-[92px]">Share security.<br /><span className="text-primary">Earn $5.</span></h1>
            <p className="mt-6 max-w-2xl text-[16px] leading-7 text-muted-foreground">Send developers your personal VibeSane link. When a referred customer starts the $10 subscription, you receive a one-time $5 commission.</p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-[1.45fr_.8fr]">
            <div className="relative overflow-hidden border-2 border-foreground bg-[#101111] p-6 text-[#f4f1ea] shadow-[9px_9px_0_#e34a3b] sm:p-8">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-[28px] border-[#f4c842]/10" />
              <div className="relative">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#a4aaa3]">Your referral link</p>
                    <p className="mt-2 font-mono text-[12px] text-[#f4c842]">{code}</p>
                  </div>
                  <div className="flex h-11 w-11 items-center justify-center border border-[#f4c842]/50 bg-[#f4c842]/10 text-[#f4c842] rotate-3"><Link2 size={19} /></div>
                </div>
                <div className="mt-7 flex flex-col gap-2 sm:flex-row">
                  <div className="min-w-0 flex-1 border border-white/15 bg-white/5 px-4 py-3 font-mono text-[11px] text-[#d8dad3] break-all">{referralLink}</div>
                  <button onClick={copy} className="vg-button inline-flex items-center justify-center gap-2 border border-[#f4c842] bg-[#f4c842] px-5 py-3 text-[12px] font-bold text-[#101111] hover:bg-[#ffe27b]"><Clipboard size={14} />{copied ? 'Copied' : 'Copy'}</button>
                </div>
                <button onClick={share} disabled={sharing} className="vg-button mt-3 inline-flex items-center gap-2 border border-white/15 bg-white/10 px-4 py-2.5 text-[12px] font-semibold text-white hover:border-[#f4c842] disabled:opacity-60"><Share2 size={14} />{sharing ? 'Opening…' : 'Share link'}</button>
              </div>
            </div>

            <div className="border border-border bg-card p-6 shadow-[6px_6px_0_hsl(var(--foreground)/.14)] sm:p-7">
              <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Your code</p>
              <div className="mt-4 flex items-center gap-3">
                <span className="border-2 border-foreground bg-accent px-4 py-3 font-mono text-lg font-black tracking-[0.12em] text-foreground">{code}</span>
              </div>
              <p className="mt-4 text-[12px] leading-5 text-muted-foreground">Friends can use this code when signing up if they don't use your link.</p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { icon: <Wallet size={18} />, label: 'Earned', value: `$${(earnedCents / 100).toFixed(2)}` },
              { icon: <Users size={18} />, label: 'Paid referrals', value: String(paid.length) },
              { icon: <Sparkles size={18} />, label: 'Pending', value: `$${(pendingCents / 100).toFixed(2)}` },
              { icon: <Gift size={18} />, label: 'Per customer', value: '$5.00' },
            ].map((item) => (
              <div key={item.label} className="border border-border bg-card p-5 shadow-[4px_4px_0_hsl(var(--foreground)/.08)]">
                <div className="flex h-8 w-8 items-center justify-center border border-primary/40 bg-primary/[0.07] text-primary">{item.icon}</div>
                <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-black tracking-[-0.04em]">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_.8fr]">
            <div className="border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Referral activity</p><h2 className="mt-1 text-lg font-bold tracking-[-0.03em]">Your customers</h2></div>
                <button onClick={() => void load()} className="font-mono text-[10px] uppercase tracking-[0.1em] text-primary hover:underline">Refresh</button>
              </div>
              {loading ? <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Loading referrals…</div> : referrals.length === 0 ? (
                <div className="p-8 text-center"><Gift className="mx-auto text-primary/60" size={24} /><p className="mt-3 text-sm font-semibold">Your first referral is waiting.</p><p className="mt-1 text-xs text-muted-foreground">Copy your link and send it to a developer.</p></div>
              ) : (
                <div>{referrals.map((referral) => <div key={referral.id} className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4 last:border-0"><div className="min-w-0"><p className="truncate font-mono text-[11px] text-foreground">{referral.referred_user.slice(0, 8)}…</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(referral.created_at).toLocaleDateString()}</p></div><span className={`shrink-0 border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${referral.status === 'paid' ? 'border-[#b9caa0] bg-[#eef1e4] text-[#66763e]' : referral.status === 'rejected' ? 'border-[#e5c8c1] bg-[#f6e9e5] text-[#963f34]' : 'border-[#e7d3b3] bg-[#f8efe1] text-[#a06427]'}`}>{referral.status === 'paid' ? 'Paid · $5' : referral.status === 'signed_up' ? 'Signed up' : 'Rejected'}</span></div>)}</div>
              )}
            </div>

            <div className="relative border-2 border-foreground bg-accent p-6 shadow-[7px_7px_0_hsl(var(--foreground))] sm:p-7">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-primary">How it works</p>
              <div className="mt-6 space-y-5">
                {['Share your link or code', 'Friend creates a VibeSane account', 'Friend starts the $10 subscription', 'You receive a one-time $5 commission'].map((step, i) => <div key={step} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center border border-foreground bg-background font-mono text-[10px] font-bold">0{i + 1}</span><p className="pt-1 text-[12px] leading-5">{step}</p></div>)}
              </div>
              <div className="mt-7 border-t border-foreground/20 pt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">One commission per referred customer · paid after successful payment confirmation</div>
            </div>
          </div>

          {error && <div className="mt-6 border border-[#e5c8c1] bg-[#f6e9e5] p-4 text-[12px] text-[#7f3a31]">{error}</div>}
          <div className="mt-10 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"><Check size={12} className="text-primary" /> $10 subscription · $5 one-time commission</div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
