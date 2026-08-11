import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, type UsageRow } from '@/lib/supabase';
import { apiUrl } from '@/lib/api';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  usage: UsageRow | null;
  authLoading: boolean;
  usageLoading: boolean;
  githubTokenVersion: number;
  hasGithubToken: boolean | null;
  signOut: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  disconnectGithub: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ADMIN_EMAIL = 'nightowlclub72@gmail.com';

async function ensureUsageRow(userId: string): Promise<UsageRow | null> {
  const { data: existing } = await supabase
    .from('usage')
    .select('*')
    .eq('owner', userId)
    .maybeSingle();

  if (existing) return existing as UsageRow;

  const { data: inserted } = await supabase
    .from('usage')
    .insert({ owner: userId, scans_used: 0, scans_limit: 1 })
    .select()
    .single();

  return (inserted as UsageRow) ?? null;
}

function setVibeSaneIdentity(user: User | null) {
  const isAdmin = user?.email?.trim().toLowerCase() === ADMIN_EMAIL;
  document.documentElement.dataset.vgAdmin = isAdmin ? 'true' : 'false';
  document.documentElement.dataset.vgSignedIn = user ? 'true' : 'false';
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

  const refreshUsage = async () => {
    if (!user) return;
    setUsageLoading(true);
    try {
      const row = await ensureUsageRow(user.id);
      setUsage(row);
    } finally {
      setUsageLoading(false);
    }
  };

  const disconnectGithub = async () => {
    const currentSession = (await supabase.auth.getSession()).data.session;
    if (!currentSession?.access_token) return;
    await fetch(apiUrl('/api/github/token'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${currentSession.access_token}` },
    });
    setHasGithubToken(false);
  };

  useEffect(() => {
    let active = true;

    // getSession() restores the persisted Supabase session and refreshes it when
    // necessary. We intentionally do not force refreshSession() on startup.
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!active) return;
      setSession(s);
      setUser(s?.user ?? null);
      setVibeSaneIdentity(s?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        if (!active) return;
        setSession(s);
        const u = s?.user ?? null;
        setUser(u);
        setVibeSaneIdentity(u);
        setAuthLoading(false);

        if (u && u.id !== lastUserId.current) {
          lastUserId.current = u.id;
          setUsageLoading(true);
          try {
            const row = await ensureUsageRow(u.id);
            if (active) setUsage(row);
          } finally {
            if (active) setUsageLoading(false);
          }

          // This is only a connection-state check. It does not attempt to fetch
          // GitHub repositories or create a new OAuth token.
          const { data } = await supabase
            .from('github_tokens')
            .select('id')
            .eq('owner', u.id)
            .maybeSingle();
          if (active) setHasGithubToken(!!data);
        } else if (!u) {
          lastUserId.current = null;
          setUsage(null);
          setHasGithubToken(null);
        }

        // Provider tokens are available immediately after OAuth redirect. Persist
        // that token once, server-side, so My Repos works after the browser closes.
        const hasGithubIdentity = s?.user?.identities?.some(
          (id: { provider: string }) => id.provider === 'github'
        );
        if (
          _event === 'SIGNED_IN' &&
          s?.provider_token &&
          s.access_token &&
          hasGithubIdentity
        ) {
          try {
            const response = await fetch(apiUrl('/api/github/token'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${s.access_token}`,
              },
              body: JSON.stringify({ token: s.provider_token }),
            });
            if (!response.ok) throw new Error('GitHub token persistence failed');
            if (active) {
              setGithubTokenVersion((v) => v + 1);
              setHasGithubToken(true);
            }
          } catch {
            // Keep public-URL scanning available. My Repos will show reconnect
            // when the user explicitly opens the repository picker.
          }
        }
      }
    );

    return () => {
      active = false;
      subscription.unsubscribe();
      document.documentElement.dataset.vgAdmin = 'false';
      document.documentElement.dataset.vgSignedIn = 'false';
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUsage(null);
    setHasGithubToken(null);
    lastUserId.current = null;
    setVibeSaneIdentity(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, usage, authLoading, usageLoading, githubTokenVersion, hasGithubToken, signOut, refreshUsage, disconnectGithub }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
