import { useEffect, useState } from 'react';
import { ArrowRight, Gift, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const SEEN_KEY = 'vs_affiliate_welcome_seen';
const ADMIN_EMAIL = 'nightowlclub72@gmail.com';

export default function AffiliateWelcomePopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    const showForAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user?.email?.toLowerCase() === ADMIN_EMAIL) {
        // Admin is always eligible so the popup can be previewed/tested even
        // after it has already been dismissed or the account already existed.
        setOpen(true);
      }
    };

    void showForAdmin();

    // Regular users see it once after a fresh signup.
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ createdAt?: string }>).detail;
      if (localStorage.getItem(SEEN_KEY)) return;
      if (!detail?.createdAt) return;
      const age = Date.now() - new Date(detail.createdAt).getTime();
      if (age >= 0 && age < 10 * 60 * 1000) setOpen(true);
    };

    window.addEventListener('vibesane:new-signup', handler);
    return () => {
      mounted = false;
      window.removeEventListener('vibesane:new-signup', handler);
    };
  }, []);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    // Keep the admin eligible on the next visit. Normal users are dismissed permanently.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
        localStorage.setItem(SEEN_KEY, '1');
      }
    });
  };

  const goToReferral = () => {
    setOpen(false);
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
        localStorage.setItem(SEEN_KEY, '1');
      }
      window.location.href = '/refer';
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="affiliate-popup-title">
      <div className="relative w-full max-w-[430px] overflow-hidden border-2 border-[#101111] bg-[#f4f1ea] text-[#101111] shadow-[8px_8px_0_#e34a3b]">
        <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full border-[16px] border-[#f4c842]/40" />
        <button onClick={close} aria-label="Close" className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center border border-[#101111]/15 bg-white/70 hover:bg-white">
          <X size={16} />
        </button>

        <div className="p-7 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center border-2 border-[#101111] bg-[#f4c842] shadow-[4px_4px_0_#101111]">
            <Gift size={23} strokeWidth={2.5} />
          </div>

          <div className="mt-6 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#6b6d68]">
            Welcome to VibeSane
          </div>
          <h2 id="affiliate-popup-title" className="mt-2 max-w-[340px] text-[30px] font-black leading-[1.02] tracking-[-0.055em] sm:text-[34px]">
            Your account can make you money.
          </h2>
          <p className="mt-4 max-w-[360px] text-[14px] leading-6 text-[#555853]">
            Invite friends to VibeSane. When someone you refer becomes a paid customer, you earn <strong className="text-[#101111]">$5</strong>.
          </p>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <div className="border border-[#101111]/15 bg-white/70 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#777a74]">Share</div><div className="mt-1 text-[13px] font-bold">Your link</div></div>
            <div className="border border-[#101111]/15 bg-white/70 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#777a74]">Earn</div><div className="mt-1 text-[13px] font-bold">$5 / sale</div></div>
            <div className="border border-[#101111]/15 bg-white/70 p-3"><div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#777a74]">Track</div><div className="mt-1 text-[13px] font-bold">Your referrals</div></div>
          </div>

          <button onClick={goToReferral} className="mt-7 flex w-full items-center justify-center gap-2 border-2 border-[#101111] bg-[#101111] px-5 py-3 text-[13px] font-bold text-[#f4f1ea] shadow-[4px_4px_0_#f4c842] transition-transform hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_#f4c842]">
            Start earning <ArrowRight size={15} />
          </button>
          <button onClick={close} className="mt-3 w-full py-2 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[#777a74] hover:text-[#101111]">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
