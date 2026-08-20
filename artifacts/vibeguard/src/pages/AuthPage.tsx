import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { AlertCircle, ArrowRight, Github, Info, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

type AuthMode = 'signin' | 'signup';
const REFERRAL_STORAGE_KEY = 'vs_referral_code';

export default function AuthPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initialMode = (params.get('mode') === 'signin' ? 'signin' : 'signup') as AuthMode;
  const referralFromUrl = params.get('ref')?.trim().toUpperCase() ?? '';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Preserve a referral through OAuth/email confirmation, then claim it once the user is authenticated.
  useEffect(() => {
    if (referralFromUrl) localStorage.setItem(REFERRAL_STORAGE_KEY, referralFromUrl);
  }, [referralFromUrl]);

  useEffect(() => {
    if (!user) return;
    const code = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!code) return;
    supabase.rpc('claim_affiliate_referral', { p_code: code }).then(({ error: claimError }) => {
      if (!claimError) localStorage.removeItem(REFERRAL_STORAGE_KEY);
    });
    navigate('/');
  }, [user, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (err) throw err;
        setSuccess("Check your email to confirm your account, then sign in.");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate('/');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const redirectTo = window.location.origin + (import.meta.env.BASE_URL ?? '/');
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (err) throw err;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setError(msg);
      setGoogleLoading(false);
    }
  };

  const handleGithub = async () => {
    setError('');
    setGithubLoading(true);
    try {
      const redirectTo = window.location.origin + (import.meta.env.BASE_URL ?? '/');
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: { scopes: 'repo', redirectTo },
      });
      if (err) throw err;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'GitHub sign-in failed.';
      setError(msg);
      setGithubLoading(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav />
      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:px-8">
        <div className="vg-rise w-full max-w-[420px]">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-6 w-6 items-center justify-center border border-primary/60 text-primary">
              <span className="absolute h-2.5 w-2.5 border border-primary/80" />
              <span className="h-1 w-1 bg-primary" />
            </span>
            <span className="text-[14px] font-extrabold tracking-[-0.03em]">VibeSane</span>
          </div>

          {referralFromUrl && (
            <div className="mt-5 border border-[#d2dbc1] bg-[#f1f4e9] px-3 py-2.5 text-[11px] text-[#4a5e2a]">
              Referral code <span className="font-mono font-bold">{referralFromUrl}</span> applied. Your referrer earns $5 when you become a paid customer.
            </div>
          )}

          <h1 className="mt-8 text-[26px] font-bold tracking-[-0.04em]">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {mode === 'signup' ? 'One free scan included. No credit card required.' : 'Sign in to run your security scan.'}
          </p>

          <button type="button" onClick={handleGithub} disabled={githubLoading || googleLoading} className="vg-button vg-focus mt-7 flex w-full items-center justify-center gap-2.5 border border-border bg-card py-2.5 text-[13px] font-semibold text-foreground hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50">
            {githubLoading ? <Loader2 size={16} className="animate-spin" /> : <Github size={16} />}
            {githubLoading ? 'Redirecting…' : 'Continue with GitHub'}
          </button>

          <div className="mt-2.5 flex items-start gap-2 border border-border bg-secondary/60 px-3 py-2.5">
            <Info size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
            <p className="text-[11px] leading-[1.55] text-muted-foreground">VibeSane requests read access to your repositories to scan them for security issues. We do not store your code — only your GitHub access token, encrypted, so you don't have to re-authenticate each session. You can revoke this access anytime from your GitHub settings.</p>
          </div>

          <button type="button" onClick={handleGoogle} disabled={googleLoading || githubLoading} className="vg-button vg-focus mt-3 flex w-full items-center justify-center gap-2.5 border border-border bg-card py-2.5 text-[13px] font-semibold text-foreground hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50">
            {googleLoading ? <Loader2 size={16} className="animate-spin" /> : <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>}
            {googleLoading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-border" /><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">or</span><span className="h-px flex-1 bg-border" /></div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && <div><label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-foreground" htmlFor="full-name">Full name</label><input id="full-name" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="vg-focus h-11 w-full border border-input bg-card px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary" placeholder="Jane Smith" autoComplete="name" /></div>}
            <div><label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-foreground" htmlFor="email">Email</label><input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="vg-focus h-11 w-full border border-input bg-card px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary" placeholder="you@example.com" autoComplete={mode === 'signup' ? 'email' : 'username'} /></div>
            <div><label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-foreground" htmlFor="password">Password</label><input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="vg-focus h-11 w-full border border-input bg-card px-3.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary" placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></div>
            {error && <div className="flex items-start gap-2 border border-[#e5c8c1] bg-[#f6e9e5] p-3 text-[12px] text-[#7f3a31]"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</div>}
            {success && <div className="border border-[#d2dbc1] bg-[#f1f4e9] p-3 text-[12px] text-[#4a5e2a]">{success}</div>}
            <button type="submit" disabled={loading} className="vg-button vg-focus flex w-full items-center justify-center gap-2 border border-primary bg-primary py-2.5 text-[13px] font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 size={15} className="animate-spin" /> : <>{mode === 'signup' ? 'Create account' : 'Sign in'} <ArrowRight size={14} /></>}</button>
          </form>

          <p className="mt-5 text-center text-[13px] text-muted-foreground">{mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}<button type="button" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setSuccess(''); }} className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80">{mode === 'signup' ? 'Sign in' : 'Sign up free'}</button></p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
