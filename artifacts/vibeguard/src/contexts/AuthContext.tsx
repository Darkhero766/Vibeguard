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
  /** Incremented each time a GitHub OAuth token has been successfully persisted server-side. */
  githubTokenVersion: number;
  /** Whether the current user has a stored GitHub token. null = not yet checked. */
  hasGithubToken: boolean | null;
  signOut: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  /** Deletes the stored GitHub token and clears the connected state. */
  disconnectGithub: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        const u = s?.user ?? null;
        setUser(u);
        setAuthLoading(false);

        if (u && u.id !== lastUserId.current) {
          lastUserId.current = u.id;
          setUsageLoading(true);
          try {
            const row = await ensureUsageRow(u.id);
            setUsage(row);
          } finally {
            setUsageLoading(false);
          }

          // Check whether this user has a stored GitHub token.
          supabase
            .from('github_tokens')
            .select('id')
            .eq('owner', u.id)
            .maybeSingle()
            .then(({ data }) => setHasGithubToken(!!data));
        } else if (!u) {
          lastUserId.current = null;
          setUsage(null);
          setHasGithubToken(null);
        }

        // After a GitHub OAuth sign-in, persist the provider token server-side.
        // provider_token is only available right after the OAuth redirect.
        // Check identities (not app_metadata.provider) so this works for users
        // whose primary Supabase provider is Google but who also linked GitHub.
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
            await fetch(apiUrl('/api/github/token'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${s.access_token}`,
              },
              body: JSON.stringify({ token: s.provider_token }),
            });
            setGithubTokenVersion((v) => v + 1);
            setHasGithubToken(true);
          } catch {
            // Non-fatal — user can still scan public repos
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUsage(null);
    setHasGithubToken(null);
    lastUserId.current = null;
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
