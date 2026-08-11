import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Github, Lock, Globe, AlertCircle, Loader2, Search, RefreshCw } from 'lucide-react';
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

  const loadRepos = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);

    try {
      // Always ask Supabase for the current session. A long repository scan can
      // cross an access-token refresh boundary, so the Session prop may be stale.
      let { data: { session: fresh } } = await supabase.auth.getSession();
      if (!fresh?.access_token && session?.access_token) fresh = session;
      if (!fresh?.access_token) throw new Error('Your login session has expired. Please sign in again.');

      const buildUrl = (refresh: boolean) =>
        apiUrl(`/api/github/repos${refresh ? '?refresh=true' : ''}`);

      let response = await fetch(buildUrl(forceRefresh), {
        headers: { Authorization: `Bearer ${fresh.access_token}` },
      });

      // If the Supabase JWT was rejected after a long scan, refresh it once and
      // retry instead of leaving My Repos stuck on an error.
      if (response.status === 401) {
        const refreshed = await supabase.auth.refreshSession();
        const retryToken = refreshed.data.session?.access_token;
        if (retryToken) {
          response = await fetch(buildUrl(forceRefresh), {
            headers: { Authorization: `Bearer ${retryToken}` },
          });
        }
      }

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? `Failed to load repositories (${response.status})`);
      }

      setRepos(Array.isArray(data) ? data as GithubRepo[] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.access_token) return;
    void loadRepos(false);
  }, [session?.access_token, githubTokenVersion, loadRepos]);

  const handleConnectGithub = async () => {
    setConnectingGithub(true);
    await triggerGithubConnect();
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
              {connectingGithub ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
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
    <div className="mt-5 space-y-3">
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
          className="vg-focus vg-block-input h-12 w-full border-2 border-foreground bg-card pl-9 pr-4 text-[13px] outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary"
          disabled={loading || disabled}
        />
      </div>

      <div className="max-h-72 divide-y divide-border overflow-y-auto border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground)/.15)]">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted-foreground">
            <Loader2 size={15} className="animate-spin" />
            Loading repositories…
          </div>
        )}

        {!loading && error && (
          <div className="p-5">
            <div className="flex items-start gap-2 text-[12px] text-[#7f3a31]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadRepos(true)}
              disabled={disabled}
              className="vg-button vg-focus mt-4 inline-flex items-center gap-2 border border-border bg-background px-3.5 py-2 text-[11px] font-semibold text-foreground hover:border-primary/50 disabled:opacity-50"
            >
              <RefreshCw size={13} /> Retry repositories
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            {query ? 'No repositories match your search.' : 'No repositories found.'}
          </p>
        )}

        {!loading && !error && filtered.map((repo) => (
          <button
            key={repo.id}
            disabled={disabled}
            onClick={() => onSelect(repo.htmlUrl)}
            className="vg-button vg-focus flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="mt-0.5 shrink-0 text-muted-foreground">
              {repo.private ? <Lock size={13} strokeWidth={1.8} /> : <Globe size={13} strokeWidth={1.8} />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground">{repo.fullName}</p>
              {repo.description && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{repo.description}</p>}
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
