import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, Github, Loader2, LogOut, Menu, Scale, Settings, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const ADMIN_EMAIL = 'nightowlclub72@gmail.com';

export function Nav({ onReset }: { onReset?: () => void } = {}) {
  const { user, usage, signOut, hasGithubToken, disconnectGithub } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [location, navigate] = useLocation();
  const currentPath = location.replace(/\/$/, '') || '/';

  const isUnlimited = user?.email?.trim().toLowerCase() === ADMIN_EMAIL;
  const scansRemaining = isUnlimited ? null : usage ? Math.max(0, usage.scans_limit - usage.scans_used) : null;
  const displayName = user?.user_metadata?.full_name || user?.email || '';

  const handleSignOut = async () => { setAccountOpen(false); await signOut(); navigate('/'); };
  const handleDisconnectClick = () => setShowDisconnectConfirm(true);
  const handleDisconnectConfirm = async () => {
    setDisconnecting(true);
    try { await disconnectGithub(); } finally { setDisconnecting(false); setShowDisconnectConfirm(false); setAccountOpen(false); }
  };
  const handleDisconnectCancel = () => setShowDisconnectConfirm(false);

  // Returning from the dedicated Settings page to the dashboard should start
  // from a clean dashboard mount. A normal anchor navigation avoids the stale
  // nested-router frame that can briefly show half-rendered dashboard cards.
  const handleLogoClick = () => {
    onReset?.();
    window.location.assign('/');
  };

  return (
    <header className="relative z-50 px-3 pt-3 sm:sticky sm:top-0 sm:px-5">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 border border-[#28352f] bg-[#0b1112] px-4 py-3 text-[#f4f6f0] shadow-[0_16px_48px_rgba(0,0,0,.24)] sm:px-6">
        <a href="/" onClick={(event) => { event.preventDefault(); handleLogoClick(); }} className="flex items-center gap-2.5 shrink-0"><span className="relative flex h-6 w-6 items-center justify-center border border-[#c7f36a] text-[#c7f36a]"><span className="absolute h-2.5 w-2.5 border border-[#c7f36a]" /><span className="h-1 w-1 bg-[#c7f36a]" /></span><span className="text-[15px] font-extrabold tracking-[-0.04em]">VibeSane</span></a>
        <nav className="hidden items-center gap-1 md:flex"><a href="/#how-it-works" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#b8bbb5] transition-colors hover:bg-[#c7f36a] hover:text-[#0b1112]">How it works</a><Link href="/foxy" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#b8bbb5] transition-colors hover:bg-[#c7f36a] hover:text-[#0b1112]">Foxy</Link><Link href="/agentshield" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#b8bbb5] transition-colors hover:bg-[#c7f36a] hover:text-[#0b1112]">AgentShield</Link><Link href="/pricing" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#b8bbb5] transition-colors hover:bg-[#c7f36a] hover:text-[#0b1112]">Pricing</Link>{user && <Link href="/settings" className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#b8bbb5] transition-colors hover:bg-[#c7f36a] hover:text-[#0b1112]">Settings</Link>}</nav>
        <div className="hidden items-center gap-2 md:flex">
          {user ? <div className="relative">
            <button onClick={() => { setAccountOpen((o) => !o); setShowDisconnectConfirm(false); }} className="vg-button vg-focus flex items-center gap-2 border border-white/15 bg-white/10 px-3 py-2 text-[12px] font-medium text-white hover:border-[#c7f36a]">
              <span className="max-w-[160px] truncate text-muted-foreground">{displayName}</span>{isUnlimited ? <span className="shrink-0 bg-[#c7f36a] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#0b1112]">∞ unlimited</span> : scansRemaining !== null ? <span className="shrink-0 bg-[#c7f36a] px-2 py-0.5 font-mono text-[10px] text-[#0b1112]">{scansRemaining} scan{scansRemaining !== 1 ? 's' : ''} left</span> : null}<ChevronDown size={13} className={`shrink-0 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
            </button>
            {accountOpen && <><div className="fixed inset-0 z-40" onClick={() => { setAccountOpen(false); setShowDisconnectConfirm(false); }} /><div className="absolute right-0 top-full z-50 mt-1.5 w-64 border border-[#28352f] bg-[#111b18] text-[#f4f6f0] shadow-lg">
              <div className="border-b border-border p-3"><p className="truncate text-[11px] font-semibold text-foreground">{displayName}</p><p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{isUnlimited ? 'Unlimited scans · admin console' : `Scans remaining: ${scansRemaining ?? '—'}`}</p></div>
              {showDisconnectConfirm ? <div className="space-y-2.5 p-3"><p className="text-[11px] leading-5 text-foreground">This will remove VibeSane's access to your GitHub repositories. Continue?</p><div className="flex gap-2"><button onClick={handleDisconnectConfirm} disabled={disconnecting} className="vg-button vg-focus flex flex-1 items-center justify-center gap-1.5 border border-[#b56b5c] bg-[#f6e9e5] px-3 py-1.5 text-[11px] font-semibold text-[#7f3a31] disabled:opacity-50">{disconnecting ? <Loader2 size={11} className="animate-spin" /> : null}{disconnecting ? 'Disconnecting…' : 'Disconnect'}</button><button onClick={handleDisconnectCancel} disabled={disconnecting} className="vg-button vg-focus flex-1 border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">Cancel</button></div></div> : <div className="p-1.5">
                <Link href="/settings" onClick={() => setAccountOpen(false)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"><Settings size={13} />Settings</Link>
                {hasGithubToken && <button onClick={handleDisconnectClick} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"><Github size={13} />Disconnect GitHub</button>}
                <button onClick={handleSignOut} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut size={13} />Log out</button>
              </div>}
            </div></>}
          </div> : <><Link href="/auth?mode=signin" className="vg-button vg-focus border border-white/15 bg-white/10 px-3.5 py-2 text-[12px] font-semibold text-white hover:border-[#c7f36a] hover:text-[#c7f36a]">Sign in</Link><Link href="/auth?mode=signup" className="vg-button vg-focus border border-[#c7f36a] bg-[#c7f36a] px-3.5 py-2 text-[12px] font-semibold text-[#0b1112] hover:bg-[#d7fa9a]">Sign up</Link></>}
        </div>
        <button className="vg-focus flex h-8 w-8 items-center justify-center text-[#d9e1d9] md:hidden" onClick={() => setMenuOpen((o) => !o)} aria-label={menuOpen ? 'Close menu' : 'Open menu'}>{menuOpen ? <X size={18} /> : <Menu size={18} />}</button>
      </div>
      <div className="mx-auto mt-2 flex w-full max-w-[1180px] items-center gap-1.5 pl-1">
        <Link href="/" className={`group flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.13em] shadow-[2px_2px_0_#0b1112] transition-all ${currentPath === '/' ? 'border-[#c7f36a] bg-[#c7f36a] text-[#0b1112]' : 'border-[#2b3832] bg-[#111b18] text-[#a3ada5] hover:border-[#c7f36a] hover:text-[#c7f36a]'}`}>
          <ShieldCheck size={11} /> Security
        </Link>
        <Link href="/audit" className={`group flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[8px] font-bold uppercase tracking-[0.13em] shadow-[2px_2px_0_#0b1112] transition-all ${currentPath === '/audit' ? 'border-[#c7f36a] bg-[#c7f36a] text-white' : 'border-[#2b3832] bg-[#111b18] text-[#a3ada5] hover:border-[#c7f36a] hover:text-[#c7f36a]'}`}>
          <Scale size={11} /> SUE
        </Link>
        <span className="ml-1 font-mono text-[7px] uppercase tracking-[0.16em] text-[#87938a]">Product controls</span>
      </div>
      {menuOpen && <div className="border-t border-[#28352f] bg-[#0b1112] md:hidden"><div className="mx-auto max-w-[1180px] space-y-0 px-5 py-3 sm:px-8"><a href="/#how-it-works" onClick={() => setMenuOpen(false)} className="flex items-center py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">How it works</a><Link href="/foxy" onClick={() => setMenuOpen(false)} className="flex items-center py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Foxy</Link><Link href="/agentshield" onClick={() => setMenuOpen(false)} className="flex items-center py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">AgentShield</Link><Link href="/pricing" onClick={() => setMenuOpen(false)} className="flex items-center border-t border-border/50 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Pricing</Link>{user && <Link href="/settings" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 border-t border-border/50 py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"><Settings size={13} />Settings</Link>}<div className="border-t border-border/50 pt-3 pb-1">{user ? <div className="space-y-2"><p className="truncate text-[12px] text-muted-foreground">{displayName}</p><p className="font-mono text-[11px] text-primary">{isUnlimited ? '∞ Unlimited scans · admin' : `Scans remaining: ${scansRemaining ?? '—'}`}</p>{hasGithubToken && (showDisconnectConfirm ? <div className="space-y-2 rounded border border-border bg-card p-3"><p className="text-[11px] leading-5 text-foreground">Remove VibeSane's GitHub access?</p><div className="flex gap-2"><button onClick={handleDisconnectConfirm} disabled={disconnecting} className="flex flex-1 items-center justify-center gap-1.5 border border-[#b56b5c] bg-[#f6e9e5] px-3 py-1.5 text-[11px] font-semibold text-[#7f3a31] disabled:opacity-50">{disconnecting ? 'Disconnecting…' : 'Disconnect'}</button><button onClick={handleDisconnectCancel} className="flex-1 border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground">Cancel</button></div></div> : <button onClick={handleDisconnectClick} className="flex items-center gap-2 text-[12px] text-muted-foreground"><Github size={13} />Disconnect GitHub</button>)}<button onClick={() => { setMenuOpen(false); handleSignOut(); }} className="flex items-center gap-2 text-[12px] text-muted-foreground"><LogOut size={13} />Log out</button></div> : <div className="flex gap-2"><Link href="/auth?mode=signin" onClick={() => setMenuOpen(false)} className="flex-1 border border-border bg-card py-2 text-center text-[12px] font-semibold text-foreground">Sign in</Link><Link href="/auth?mode=signup" onClick={() => setMenuOpen(false)} className="flex-1 border border-primary bg-primary py-2 text-center text-[12px] font-semibold text-primary-foreground">Sign up</Link></div>}</div></div></div>}
    </header>
  );
}
