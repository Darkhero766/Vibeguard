import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase, type UsageRow } from '@/lib/supabase';

/** Store the user's GitHub OAuth token server-side (fire-and-forget). */
async function persistGithubToken(githubToken: string, supabaseJwt: string): Promise<void> {
  try {
    await fetch('/api/github/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseJwt}`,
      },
      body: JSON.stringify({ token: githubToken }),
    });
  } catch {
    // Non-fatal — user can still scan public repos
  }
}

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  usage: UsageRow | null;
  authLoading: boolean;
  usageLoading: boolean;
  signOut: () => Promise<void>;
  refreshUsage: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function ensureUsageRow(userId: string): Promise<UsageRow | null> {
  // Try to fetch first
  const { data: existing } = await supabase
    .from('usage')
    .select('*')
    .eq('owner', userId)
    .maybeSingle();

  if (existing) return existing as UsageRow;

  // Insert if missing (covers users created before trigger was installed)
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
        } else if (!u) {
          lastUserId.current = null;
          setUsage(null);
        }

        // After a GitHub OAuth sign-in, persist the provider token server-side.
        // provider_token is only available right after the OAuth redirect.
        if (
          _event === 'SIGNED_IN' &&
          s?.provider_token &&
          s.access_token &&
          s.user?.app_metadata?.provider === 'github'
        ) {
          persistGithubToken(s.provider_token, s.access_token);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUsage(null);
    lastUserId.current = null;
  };

  return (
    <AuthContext.Provider value={{ user, session, usage, authLoading, usageLoading, signOut, refreshUsage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
