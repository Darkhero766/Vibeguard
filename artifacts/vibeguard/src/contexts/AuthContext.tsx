import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, type UsageRow } from '@/lib/supabase';
import { apiUrl } from '@/lib/api';

type AuthContextValue = { user: User | null; session: Session | null; usage: UsageRow | null; authLoading: boolean; usageLoading: boolean; githubTokenVersion: number; hasGithubToken: boolean | null; signOut: () => Promise<void>; refreshUsage: () => Promise<void>; disconnectGithub: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);
const ADMIN_EMAIL = 'nightowlclub72@gmail.com';

// Usage is server-owned (billing, quotas, entitlements). The database signup
// trigger initializes records; the browser must never insert or change quotas.
async function ensureUsageRow(userId: string): Promise<UsageRow | null> {
  const { data, error } = await supabase.from('usage').select('*').eq('owner', userId).maybeSingle();
  if (error) return null;
  return (data as UsageRow) ?? null;
}

function setVibeSaneIdentity(user: User | null) {
  const isAdmin = user?.email?.trim().toLowerCase() === ADMIN_EMAIL;
  document.documentElement.dataset.vgAdmin = isAdmin ? 'true' : 'false';
  document.documentElement.dataset.vgSignedIn = user ? 'true' : 'false';
}

async function syncDodoReturn(session: Session, userId: string): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const subscriptionId = params.get('subscription_id');
  const status = params.get('status');
  const upgraded = params.get('upgraded');

  // Dodo appends subscription_id + status to the configured return_url.
  // Only sync when this navigation is actually a successful upgrade return.
  if (!subscriptionId || (status !== 'active' && upgraded !== 'true')) return false;

  try {
    const response = await fetch(apiUrl('/api/billing/sync'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ subscription_id: subscriptionId }),
    });

    if (!response.ok) return false;

    // Remove the payment-return parameters after a successful sync so a normal
    // refresh does not repeatedly hit the billing API.
    const cleanUrl = `${window.location.pathname}`;
    window.history.replaceState(null, '', cleanUrl);
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [usage, setUsage] = useState<UsageRow | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [usageLoading, setUsageLoading] = useState(false);
  const [githubTokenVersion, setGithubTokenVersion] = useState(0);
  const [hasGithubToken, setHasGithubToken] = useState<boolean | null>(null);
  const lastUserId = useRef<string | null>(null);

  const refreshUsage = async () => { if (!user) return; setUsageLoading(true); try { setUsage(await ensureUsageRow(user.id)); } finally { setUsageLoading(false); } };
  const refreshGithubConnection = async (accessToken: string | undefined, active = true) => {
    if (!accessToken) { if (active) setHasGithubToken(null); return false; }
    try {
      const response = await fetch(apiUrl('/api/github/token/status'), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Connection status unavailable');
      const data: { connected?: unknown } = await response.json();
      if (typeof data.connected !== 'boolean') throw new Error('Invalid connection status');
      if (active) setHasGithubToken(data.connected);
      return data.connected;
    } catch {
      if (active) setHasGithubToken(null);
      return false;
    }
  };
  const disconnectGithub = async () => { const currentSession = (await supabase.auth.getSession()).data.session; if (!currentSession?.access_token) return; const response = await fetch(apiUrl('/api/github/token'), { method: 'DELETE', headers: { Authorization: `Bearer ${currentSession.access_token}` } }); if (!response.ok) throw new Error('GitHub disconnection failed'); setHasGithubToken(false); setGithubTokenVersion((v) => v + 1); };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!active) return;
      setSession(s); const u = s?.user ?? null; setUser(u); setVibeSaneIdentity(u); setAuthLoading(false);
      if (u) {
        lastUserId.current = u.id;
        setUsageLoading(true);
        try {
          const didSync = s ? await syncDodoReturn(s, u.id) : false;
          const row = await ensureUsageRow(u.id);
          if (active) setUsage(row);
          if (didSync) {
            // The billing sync writes the authoritative Pro entitlement. Read it again
            // immediately so the dashboard never remains on the stale free-tier row.
            const refreshed = await ensureUsageRow(u.id);
            if (active) setUsage(refreshed);
          }
        } finally { if (active) setUsageLoading(false); }
        await refreshGithubConnection(s?.access_token, active);
      } else setHasGithubToken(null);
    });
    // Supabase's Auth callback must remain synchronous. Awaiting queries or
    // auth operations inside it can deadlock the client after OAuth redirect.
    // Capture the provider token immediately, then do network work in a timer
    // after Supabase releases its internal auth lock. Never persist the raw
    // GitHub token in localStorage, React state, or logs.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!active) return;
      setSession(s);
      const u = s?.user ?? null;
      setUser(u);
      setVibeSaneIdentity(u);
      setAuthLoading(false);

      if (!u) {
        lastUserId.current = null;
        setUsage(null);
        setHasGithubToken(null);
      } else if (u.id !== lastUserId.current) {
        lastUserId.current = u.id;
        setUsageLoading(true);
        const accountId = u.id;
        const currentSession = s;
        setTimeout(() => {
          if (!active) return;
          void (async () => {
            try {
              const didSync = currentSession ? await syncDodoReturn(currentSession, accountId) : false;
              const row = await ensureUsageRow(accountId);
              if (active && lastUserId.current === accountId) setUsage(row);
              if (didSync) {
                const refreshed = await ensureUsageRow(accountId);
                if (active && lastUserId.current === accountId) setUsage(refreshed);
              }
              await refreshGithubConnection(currentSession?.access_token, active && lastUserId.current === accountId);
            } catch {
              if (active && lastUserId.current === accountId) setHasGithubToken(null);
            } finally {
              if (active && lastUserId.current === accountId) setUsageLoading(false);
            }
          })();
        }, 0);
      }

      const hasGithubIdentity = s?.user?.identities?.some((id: { provider: string }) => id.provider === 'github');
      const githubOauthPending = window.sessionStorage.getItem('vs_github_oauth_pending') === 'github';
      if ((_event === 'SIGNED_IN' || _event === 'INITIAL_SESSION') &&
          githubOauthPending && s?.provider_token && s.access_token && hasGithubIdentity) {
        // Intent is single-use: even if a linked account later signs in with
        // another provider, its provider_token must not be stored as GitHub.
        window.sessionStorage.removeItem('vs_github_oauth_pending');
        const githubProviderToken = s.provider_token;
        const userAccessToken = s.access_token;
        const accountId = s.user.id;
        setTimeout(() => {
          if (!active || lastUserId.current !== accountId) return;
          void (async () => {
            try {
              const response = await fetch(apiUrl('/api/github/token'), {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${userAccessToken}`,
                },
                body: JSON.stringify({ token: githubProviderToken }),
              });
              if (!response.ok) {
                // Log status only; OAuth credentials and response body must
                // not be surfaced to analytics or browser console output.
                console.warn('GitHub connection was not saved (HTTP status):', response.status);
                if (active) setHasGithubToken(null);
                return;
              }
              if (active && lastUserId.current === accountId) {
                setGithubTokenVersion((v) => v + 1);
                setHasGithubToken(true);
              }
            } catch {
              console.warn('GitHub connection could not reach the API');
              if (active) setHasGithubToken(null);
            }
          })();
        }, 0);
      }
    });
    return () => { active = false; subscription.unsubscribe(); document.documentElement.dataset.vgAdmin = 'false'; document.documentElement.dataset.vgSignedIn = 'false'; };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); setUsage(null); setHasGithubToken(null); lastUserId.current = null; setVibeSaneIdentity(null); };
  return <AuthContext.Provider value={{ user, session, usage, authLoading, usageLoading, githubTokenVersion, hasGithubToken, signOut, refreshUsage, disconnectGithub }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const ctx = useContext(AuthContext); if (!ctx) throw new Error('useAuth must be used within AuthProvider'); return ctx; }
