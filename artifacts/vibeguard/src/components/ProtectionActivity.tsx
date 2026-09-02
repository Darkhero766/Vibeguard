import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, GitCommitHorizontal, GitPullRequest, ShieldAlert, ChevronDown } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

type ProtectedRepository = { repo: string; repoUrl: string; baselineSha: string; lastSha: string; status: string; lastScore: number; criticalCount: number; highCount: number; mediumCount: number; lastEvent?: string | null; lastEventAt?: string | null };
type Event = { id: string; event: string; sha: string; status: string; findingsCount: number; criticalCount: number; highCount: number; mediumCount: number; createdAt: string };

const INITIAL_EVENT_LIMIT = 7;
const EVENT_PAGE_SIZE = 7;

export function ProtectionActivity({ session }: { session: Session | null }) {
  const [repository, setRepository] = useState<ProtectedRepository | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_EVENT_LIMIT);
  const [loading, setLoading] = useState(true);
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

  useEffect(() => {
    if (!session?.access_token) { setLoading(false); return; }
    let cancelled = false;

    const getSelectedRepo = () => {
      try { return sessionStorage.getItem('vs_selected_repo'); } catch { return null; }
    };

    const loadActivity = async () => {
      const headers = { Authorization: `Bearer ${session.access_token}` };
      try {
        const response = await fetch(`${apiBase}/api/protection`, { headers, cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load protected repositories');
        const data = await response.json() as { repositories?: ProtectedRepository[] };
        if (cancelled) return;
        const repositories = Array.isArray(data.repositories) ? data.repositories : [];
        const selectedName = getSelectedRepo();
        const selected = (selectedName && repositories.find((repo) => repo.repo === selectedName)) || repositories[0];
        setRepository(selected ?? null);
        if (!selected) { setEvents([]); return; }

        const eventsResponse = await fetch(`${apiBase}/api/protection/${encodeURIComponent(selected.repo)}/events`, { headers, cache: 'no-store' });
        const eventsData = eventsResponse.ok ? await eventsResponse.json() as { events?: Event[] } : { events: [] };
        if (!cancelled) {
          setEvents(Array.isArray(eventsData.events) ? eventsData.events : []);
          setVisibleCount(INITIAL_EVENT_LIMIT);
        }
      } catch {
        if (!cancelled) setRepository(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadActivity();
    // The repository selector lives in the parent dashboard, so watch its
    // sessionStorage selection and refresh this section immediately after a switch.
    const interval = window.setInterval(() => { void loadActivity(); }, 1000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [session?.access_token, apiBase]);

  if (loading || !repository) return null;
  const statusLabel = repository.status === 'protected' ? 'Protected' : repository.status;
  const visibleEvents = events.slice(0, visibleCount);
  const hasMoreEvents = visibleCount < events.length;

  return (
    <section className="mt-10 border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))]">
      <div className="flex flex-col gap-5 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Protected repository</p><h2 className="mt-2 truncate text-[22px] font-bold tracking-[-0.03em]">{repository.repo}</h2><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Baseline {repository.baselineSha.slice(0, 7)} · watching pushes + pull requests</p></div>
        <div className="flex shrink-0 items-center gap-2 border border-[#aebe8c] bg-[#eef1e4] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#66763e]"><CheckCircle2 size={13} /> {statusLabel}</div>
      </div>
      <div className="grid divide-y border-b border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        {[['Score', repository.lastScore], ['Critical', repository.criticalCount], ['High', repository.highCount], ['Medium', repository.mediumCount]].map(([label, value]) => <div key={String(label)} className="p-5"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-[25px] font-black tracking-[-0.05em]">{value}{label === 'Score' ? '/100' : ''}</p></div>)}
      </div>
      <div className="p-6 sm:p-7"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Activity</p><h3 className="mt-2 text-[18px] font-bold">Every change, one security signal.</h3></div><GitCommitHorizontal size={19} className="text-muted-foreground" /></div>
        <div className="mt-5 space-y-2">
          {events.length === 0 ? <div className="border border-border bg-muted/30 p-5"><p className="text-[13px] font-semibold">Waiting for the first change.</p><p className="mt-1 text-[12px] text-muted-foreground">Push a commit or open a pull request after GitHub App protection is installed.</p></div> : visibleEvents.map((event) => <div key={event.id} className="flex items-center gap-4 border border-border p-4"><div className={`flex h-8 w-8 shrink-0 items-center justify-center border ${event.status === 'failure' ? 'border-[#e5c8c1] bg-[#f6e9e5] text-[#963f34]' : 'border-[#d2dbc1] bg-[#eef1e4] text-[#66763e]'}`}>{event.event === 'pull_request' ? <GitPullRequest size={14} /> : event.status === 'failure' ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}</div><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold capitalize">{event.event.replace('_', ' ')} <span className="font-mono text-muted-foreground">{event.sha.slice(0, 7)}</span></p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{event.findingsCount} findings · {event.status}</p></div><ArrowRight size={13} className="text-muted-foreground" /></div>)}
          {hasMoreEvents && <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + EVENT_PAGE_SIZE, events.length))} className="vg-button vg-focus flex w-full items-center justify-center gap-2 border-2 border-foreground bg-background px-4 py-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground hover:bg-accent"><ChevronDown size={14} /> Load more <span className="text-muted-foreground">({events.length - visibleCount} remaining)</span></button>}
        </div>
      </div>
    </section>
  );
}
