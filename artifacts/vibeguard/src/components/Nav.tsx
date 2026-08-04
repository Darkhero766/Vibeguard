import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, Github, Loader2, LogOut, Menu, Shield, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function Nav({ onReset }: { onReset?: () => void } = {}) {
  const { user, usage, signOut, hasGithubToken, disconnectGithub } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [, navigate] = useLocation();

  const scansRemaining = usage
    ? Math.max(0, usage.scans_limit - usage.scans_used)
    : null;

  const displayName = user?.user_metadata?.full_name || user?.email || '';

  const handleSignOut = async () => {
    setAccountOpen(false);
    await signOut();
    navigate('/');
  };

  const handleDisconnectClick = () => {
    setShowDisconnectConfirm(true);
  };

  const handleDisconnectConfirm = async () => {
    setDisconnecting(true);
    try {
      await disconnectGithub();
    } finally {
      setDisconnecting(false);
      setShowDisconnectConfirm(false);
      setAccountOpen(false);
    }
  };

  const handleDisconnectCancel = () => {
    setShowDisconnectConfirm(false);
  };

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-5">
      <div className="mx-auto flex w-full max-w-[1040px] items-center justify-between gap-4 rounded-full bg-[#101111] px-4 py-3 text-[#f4f1ea] shadow-[0_12px_35px_rgba(15,15,15,.12)] sm:px-6">
        {/* Logo */}
        <Link href="/" onClick={onReset} className="flex items-center gap-2.5 shrink-0">
          <span className="relative flex h-6 w-6 items-center justify-center border border-[#2db8a8] text-[#2db8a8]">
            <span className="absolute h-2.5 w-2.5 border border-[#2db8a8]" />
            <span className="h-1 w-1 bg-[#2db8a8]" />
          </span>
          <span className="text-[15px] font-extrabold tracking-[-0.04em]">VibeGuard</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-1 md:flex">
          <a
            href="/#how-it-works"
            className="rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#b8bbb5] transition-colors hover:bg-white/10 hover:text-white"
          >
            How it works
          </a>
          <Link
            href="/pricing"
            className="rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#b8bbb5] transition-colors hover:bg-white/10 hover:text-white"
          >
            Pricing
          </Link>
        </nav>

        {/* Desktop auth area */}
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <div className="relative">
              <button
                onClick={() => { setAccountOpen((o) => !o); setShowDisconnectConfirm(false); }}
                 className="vg-button vg-focus flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-[12px] font-medium text-white hover:border-[#2db8a8]"
              >
                <span className="max-w-[160px] truncate text-muted-foreground">{displayName}</span>
                {scansRemaining !== null && (
                     <span className="shrink-0 rounded-full bg-[#2db8a8]/15 px-2 py-0.5 font-mono text-[10px] text-[#62d4c5]">
                    {scansRemaining} scan{scansRemaining !== 1 ? 's' : ''} left
                  </span>
                )}
                <ChevronDown size={13} className={`shrink-0 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
              </button>

               {accountOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => { setAccountOpen(false); setShowDisconnectConfirm(false); }} />
                   <div className="absolute right-0 top-full z-50 mt-1.5 w-64 border border-[#303331] bg-[#171918] text-[#f4f1ea] shadow-lg">
                    <div className="border-b border-border p-3">
                      <p className="truncate text-[11px] font-semibold text-foreground">{displayName}</p>
                      {scansRemaining !== null && (
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          Scans remaining: <span className="font-semibold text-primary">{scansRemaining}</span>
                        </p>
                      )}
                    </div>

                    {/* Disconnect GitHub confirm prompt */}
                    {showDisconnectConfirm ? (
                      <div className="p-3 space-y-2.5">
                        <p className="text-[11px] leading-5 text-foreground">
                          This will remove VibeSane's access to your GitHub repositories. You can also revoke access directly from GitHub's settings (Settings → Applications → Authorized OAuth Apps). Continue?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleDisconnectConfirm}
                            disabled={disconnecting}
                            className="vg-button vg-focus flex flex-1 items-center justify-center gap-1.5 border border-[#b56b5c] bg-[#f6e9e5] px-3 py-1.5 text-[11px] font-semibold text-[#7f3a31] hover:bg-[#f0dbd6] disabled:opacity-50"
                          >
                            {disconnecting ? <Loader2 size={11} className="animate-spin" /> : null}
                            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                          </button>
                          <button
                            onClick={handleDisconnectCancel}
                            disabled={disconnecting}
                            className="vg-button vg-focus flex-1 border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-1.5">
                        {hasGithubToken && (
                          <button
                            onClick={handleDisconnectClick}
                            className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Github size={13} />
                            Disconnect GitHub
                          </button>
                        )}
                        <button
                          onClick={handleSignOut}
                          className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <LogOut size={13} />
                          Log out
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/auth?mode=signin"
                className="vg-button vg-focus rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-[12px] font-semibold text-white hover:border-[#2db8a8] hover:text-[#62d4c5]"
              >
                Sign in
              </Link>
              <Link
                href="/auth?mode=signup"
                className="vg-button vg-focus rounded-full border border-[#2db8a8] bg-[#2db8a8] px-3.5 py-2 text-[12px] font-semibold text-[#101111] hover:bg-[#62d4c5]"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
           className="vg-focus flex h-8 w-8 items-center justify-center text-[#d8dad3] md:hidden"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-[#303331] bg-[#101111] md:hidden">
          <div className="mx-auto max-w-[1040px] space-y-0 px-5 py-3 sm:px-8">
            <a
              href="/#how-it-works"
              onClick={() => setMenuOpen(false)}
              className="flex items-center py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground"
            >
              How it works
            </a>
            <Link
              href="/pricing"
              onClick={() => setMenuOpen(false)}
              className="flex items-center py-3 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground border-t border-border/50"
            >
              Pricing
            </Link>
            <div className="border-t border-border/50 pt-3 pb-1">
              {user ? (
                <div className="space-y-2">
                  <p className="text-[12px] text-muted-foreground truncate">{displayName}</p>
                  {scansRemaining !== null && (
                    <p className="font-mono text-[11px] text-primary">Scans remaining: {scansRemaining}</p>
                  )}
                  {hasGithubToken && (
                    showDisconnectConfirm ? (
                      <div className="space-y-2 rounded border border-border bg-card p-3">
                        <p className="text-[11px] leading-5 text-foreground">
                          This will remove VibeSane's access to your GitHub repositories. You can also revoke access directly from GitHub's settings. Continue?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleDisconnectConfirm}
                            disabled={disconnecting}
                            className="flex flex-1 items-center justify-center gap-1.5 border border-[#b56b5c] bg-[#f6e9e5] px-3 py-1.5 text-[11px] font-semibold text-[#7f3a31] disabled:opacity-50"
                          >
                            {disconnecting ? <Loader2 size={11} className="animate-spin" /> : null}
                            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                          </button>
                          <button
                            onClick={handleDisconnectCancel}
                            className="flex-1 border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={handleDisconnectClick}
                        className="flex items-center gap-2 text-[12px] text-muted-foreground"
                      >
                        <Github size={13} /> Disconnect GitHub
                      </button>
                    )
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); handleSignOut(); }}
                    className="flex items-center gap-2 text-[12px] text-muted-foreground"
                  >
                    <LogOut size={13} /> Log out
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Link
                    href="/auth?mode=signin"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 border border-border bg-card py-2 text-center text-[12px] font-semibold text-foreground"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/auth?mode=signup"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 border border-primary bg-primary py-2 text-center text-[12px] font-semibold text-primary-foreground"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
