import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Github, Lock, Globe, AlertCircle, Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { apiUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

type GithubRepo = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
};

async function triggerGithubConnect() {
  const redirectTo = window.location.origin + '/';
  await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { scopes: 'repo', redirectTo },
  });
}

export function RepoPicker({
  session,
  onSelect,
  disabled,
}: {
  session: Session | null;
  onSelect: (repoUrl: string) => void;
  disabled?: boolean;
}) {
  const { githubTokenVersion } = useAuth();
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [connectingGithub, setConnectingGithub] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);

    // Always get a fresh session token to avoid using a stale cached JWT.
    supabase.auth.getSession().then(({ data: { session: fresh } }) => {
      const token = fresh?.access_token ?? session.access_token;
      return fetch(apiUrl('/api/github/repos'), {
        headers: { Authorization: `Bearer ${token}` },
      });
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? 'Failed to load repositories');
        setRepos(data as GithubRepo[]);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  // githubTokenVersion bumps after a new GitHub token is persisted server-side,
  // ensuring we re-fetch even if access_token hasn't changed.
  }, [session?.access_token, githubTokenVersion]);

  const handleConnectGithub = async () => {
    setConnectingGithub(true);
    await triggerGithubConnect();
    // Page will redirect — no need to reset loading state
  };

  // No GitHub connection stored
  if (!loading && (error?.includes('No GitHub connection') || error?.includes('sign in with GitHub'))) {
    return (
      <div className="mt-4 border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <Github size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-[13px] font-semibold text-foreground">Connect your GitHub account</p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              Sign in with GitHub to pick from your repositories — including private ones.
            </p>
            <button
              onClick={handleConnectGithub}
              disabled={connectingGithub}
              className="vg-button vg-focus mt-3 inline-flex items-center gap-2 border border-border bg-background px-3.5 py-2 text-[12px] font-semibold text-foreground hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connectingGithub ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Github size={14} />
              )}
              {connectingGithub ? 'Redirecting…' : 'Link GitHub account'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filtered = query
    ? repos.filter((r) => r.fullName.toLowerCase().includes(query.toLowerCase()))
    : repos;

  return (
    <div className="mt-4 space-y-2">
      {/* Search input */}
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search repositories…"
          className="vg-focus h-10 w-full border border-input bg-card pl-9 pr-4 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
          disabled={loading || disabled}
        />
      </div>

      {/* List */}
      <div className="max-h-64 divide-y divide-border overflow-y-auto border border-border bg-card">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
            <Loader2 size={15} className="animate-spin" />
            Loading repositories…
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-2 p-4 text-[12px] text-[#7f3a31]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            {query ? 'No repositories match your search.' : 'No repositories found.'}
          </p>
        )}

        {!loading &&
          !error &&
          filtered.map((repo) => (
            <button
              key={repo.id}
              disabled={disabled}
              onClick={() => { console.log("[RepoPicker] htmlUrl selected:", JSON.stringify(repo.htmlUrl)); onSelect(repo.htmlUrl); }}
              className="vg-button vg-focus flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="mt-0.5 shrink-0 text-muted-foreground">
                {repo.private ? (
                  <Lock size={13} strokeWidth={1.8} />
                ) : (
                  <Globe size={13} strokeWidth={1.8} />
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {repo.fullName}
                </p>
                {repo.description && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {repo.description}
                  </p>
                )}
              </div>
              {repo.private && (
                <span className="ml-auto shrink-0 border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                  private
                </span>
              )}
            </button>
          ))}
      </div>

      {!loading && !error && repos.length > 0 && (
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {repos.length} repositor{repos.length === 1 ? 'y' : 'ies'} · click to scan
        </p>
      )}
    </div>
  );
}
