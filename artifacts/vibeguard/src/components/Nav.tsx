import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronDown, LogOut, Menu, Shield, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function Nav() {
  const { user, usage, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [, navigate] = useLocation();

  const scansRemaining = usage
    ? Math.max(0, usage.scans_limit - usage.scans_used)
    : null;

  const handleSignOut = async () => {
    setAccountOpen(false);
    await signOut();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[1040px] items-center justify-between gap-4 px-5 py-4 sm:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="relative flex h-6 w-6 items-center justify-center border border-primary/60 text-primary">
            <span className="absolute h-2.5 w-2.5 border border-primary/80" />
            <span className="h-1 w-1 bg-primary" />
          </span>
          <span className="text-[15px] font-extrabold tracking-[-0.03em]">VibeGuard</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-6 md:flex">
          <a
            href="/#how-it-works"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works
          </a>
          <Link
            href="/pricing"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
        </nav>

        {/* Desktop auth area */}
        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <div className="relative">
              <button
                onClick={() => setAccountOpen((o) => !o)}
                className="vg-button vg-focus flex items-center gap-2 border border-border bg-card px-3 py-2 text-[12px] font-medium text-foreground hover:border-primary/50"
              >
                <span className="max-w-[160px] truncate text-muted-foreground">{user.email}</span>
                {scansRemaining !== null && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                    {scansRemaining} scan{scansRemaining !== 1 ? 's' : ''} left
                  </span>
                )}
                <ChevronDown size={13} className={`shrink-0 transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
              </button>

              {accountOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAccountOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1.5 w-56 border border-border bg-card shadow-lg">
                    <div className="border-b border-border p-3">
                      <p className="truncate text-[11px] font-semibold text-foreground">{user.email}</p>
                      {scansRemaining !== null && (
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          Scans remaining: <span className="font-semibold text-primary">{scansRemaining}</span>
                        </p>
                      )}
                    </div>
                    <div className="p-1.5">
                      <button
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-[12px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <LogOut size={13} />
                        Log out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/auth?mode=signin"
                className="vg-button vg-focus border border-border bg-card px-3.5 py-2 text-[12px] font-semibold text-foreground hover:border-primary/50 hover:text-primary"
              >
                Sign in
              </Link>
              <Link
                href="/auth?mode=signup"
                className="vg-button vg-focus border border-primary bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="vg-focus flex h-8 w-8 items-center justify-center text-muted-foreground md:hidden"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-border bg-background md:hidden">
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
                  <p className="text-[12px] text-muted-foreground truncate">{user.email}</p>
                  {scansRemaining !== null && (
                    <p className="font-mono text-[11px] text-primary">Scans remaining: {scansRemaining}</p>
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
