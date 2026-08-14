import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Github, Lock, Globe, AlertCircle, Loader2, Search, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { apiUrl } from '@/lib/api';

type GithubRepo = {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  description: string | null;
  updatedAt?: string;
};

async function authFetch(path: string, init: RequestInit = {}) {
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Your login session has expired. Please sign in again.');

  const request = () => fetch(apiUrl(path), {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${session!.access_token}` },
  });
  let response = await request();

  if (response.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
    if (session?.access_token) response = await request();
  }
  return response;
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
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [connectingGithub, setConnectingGithub] = useState(false);
  const [hasInstallation, setHasInstallation] = useState(false);

  const loadRepos = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`/api/github/app/repos${forceRefresh ? '?refresh=true' : ''}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 404) {
          setHasInstallation(false);
          setRepos([]);
          return;
        }
        throw new Error(data?.error ?? `Failed to load repositories (${response.status})`);
      }
      setHasInstallation(true);
      setRepos(Array.isArray(data) ? data as GithubRepo[] : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setLoading(false);
    }
  }, []);

  const completeInstallation = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const installationId = params.get('installation_id');
    const state = params.get('state');
    const setupAction = params.get('setup_action');
    if (!installationId || !state || setupAction === 'request') return false;

    setLoading(true);
    setError(null);
    try {
      const response = await authFetch('/api/github/app/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installationId: Number(installationId), state }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? 'Could not complete GitHub connection');
      setHasInstallation(true);
      setRepos(Array.isArray(data?.repositories) ? data.repositories as GithubRepo[] : []);
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete GitHub connection');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.access_token) return;
    void (async () => {
      const handled = await completeInstallation();
      if (!handled) await loadRepos(false);
    })();
  }, [session?.access_token, completeInstallation, loadRepos]);

  const handleConnectGithub = async () => {
    setConnectingGithub(true);
    setError(null);
    try {
      const response = await authFetch('/api/github/app/install-url');
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.installUrl !== 'string') {
        throw new Error(data?.error ?? 'Could not start GitHub connection');
      }
      window.location.assign(data.installUrl);
    } catch (err) {
      setConnectingGithub(false);
      setError(err instanceof Error ? err.message : 'Could not start GitHub connection');
    }
  };

  if (!session?.access_token) return null;

  if (!loading && !hasInstallation) {
    return (
      <div className="mt-4 border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background">
            <Github size={18} className="text-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Connect GitHub</p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
              Install VibeGuard once, choose the repositories you want protected, and we’ll handle the rest automatically.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={11} /> scoped access</span>
              <span>no tokens to copy</span>
              <span>private repos supported</span>
            </div>
            <button
              onClick={handleConnectGithub}
              disabled={connectingGithub || disabled}
              className="vg-button vg-focus mt-4 inline-flex items-center gap-2 border border-foreground bg-foreground px-4 py-2.5 text-[12px] font-semibold text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connectingGithub ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
              {connectingGithub ? 'Opening GitHub…' : 'Connect GitHub'}
            </button>
            {error && <p className="mt-3 flex items-start gap-2 text-[11px] text-[#7f3a31]"><AlertCircle size={13} className="mt-0.5 shrink-0" />{error}</p>}
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
        <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
            Connecting to GitHub…
          </div>
        )}

        {!loading && error && (
          <div className="p-5">
            <div className="flex items-start gap-2 text-[12px] text-[#7f3a31]"><AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{error}</span></div>
            <button type="button" onClick={() => void loadRepos(true)} disabled={disabled} className="vg-button vg-focus mt-4 inline-flex items-center gap-2 border border-border bg-background px-3.5 py-2 text-[11px] font-semibold text-foreground hover:border-primary/50 disabled:opacity-50"><RefreshCw size={13} /> Retry repositories</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && <p className="py-8 text-center text-[13px] text-muted-foreground">{query ? 'No repositories match your search.' : 'No repositories are available to VibeGuard.'}</p>}

        {!loading && !error && filtered.map((repo) => (
          <button key={repo.id} disabled={disabled} onClick={() => onSelect(repo.htmlUrl)} className="vg-button vg-focus flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50">
            <div className="mt-0.5 shrink-0 text-muted-foreground">{repo.private ? <Lock size={13} strokeWidth={1.8} /> : <Globe size={13} strokeWidth={1.8} />}</div>
            <div className="min-w-0"><p className="truncate text-[13px] font-medium text-foreground">{repo.fullName}</p>{repo.description && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{repo.description}</p>}</div>
            {repo.private && <span className="ml-auto shrink-0 border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">private</span>}
          </button>
        ))}
      </div>

      {!loading && !error && repos.length > 0 && <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{repos.length} repositor{repos.length === 1 ? 'y' : 'ies'} · click to scan or protect</p>}
    </div>
  );
}
