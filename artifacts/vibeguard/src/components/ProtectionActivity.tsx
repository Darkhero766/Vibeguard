import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, GitCommitHorizontal, GitPullRequest, ShieldAlert, ChevronDown, ChevronUp, X, Wrench, RefreshCw } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

type ProtectedRepository = { repo: string; repoUrl: string; baselineSha: string; lastSha: string; status: string; lastScore: number; criticalCount: number; highCount: number; mediumCount: number; lastEvent?: string | null; lastEventAt?: string | null };
type EventFinding = { id: string; severity: 'Critical' | 'High' | 'Medium'; title: string; filePath: string; line: number | null; check: string };
type EventDetails = {
  version: 1; scanMode: 'delta' | 'full' | 'unknown'; scanIncomplete: boolean; coveragePartial: boolean;
  changedFiles: number; filesScanned: number; checksRun: number; resolvedFindingsCount: number;
  existingFindingsCount: number; unscannedChangedFileCount: number; coverageReasons: string[];
  unscannedChangedFiles: string[]; findings: EventFinding[];
};
type Event = {
  id: string; event: string; sha: string; baseSha?: string | null; status: string;
  findingsCount: number; criticalCount: number; highCount: number; mediumCount: number;
  createdAt: string; details?: EventDetails | null;
};

const INITIAL_EVENT_LIMIT = 7;
const EVENT_PAGE_SIZE = 7;

export function ProtectionActivity({ session }: { session: Session | null }) {
  const [repository, setRepository] = useState<ProtectedRepository | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_EVENT_LIMIT);
  const [loading, setLoading] = useState(true);
  const [alertEvent, setAlertEvent] = useState<Event | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const initialized = useRef(false);
  const latestEventId = useRef<string | null>(null);
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
          const nextEvents = Array.isArray(eventsData.events) ? eventsData.events : [];
          setEvents(nextEvents);
          setVisibleCount(INITIAL_EVENT_LIMIT);
          const newest = nextEvents[0] ?? null;
          if (newest && newest.id !== latestEventId.current) {
            const isNew = initialized.current && newest.id !== latestEventId.current;
            latestEventId.current = newest.id;
            if (isNew && (newest.findingsCount > 0 || newest.details?.coveragePartial)) setAlertEvent(newest);
          }
          initialized.current = true;
        }
      } catch {
        if (!cancelled) setRepository(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadActivity();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadActivity();
    }, 15_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [session?.access_token, apiBase, refreshNonce]);

  if (loading || !repository) return null;
  const statusLabel = repository.status === 'protected' ? 'Protected' : repository.status;
  const visibleEvents = events.slice(0, visibleCount);
  const hasMoreEvents = visibleCount < events.length;
  const blocking = alertEvent ? alertEvent.criticalCount > 0 || alertEvent.highCount > 0 : false;
  const alertIncomplete = alertEvent?.details?.coveragePartial === true || alertEvent?.details?.scanIncomplete === true;
  const showEventDetails = (event: Event) => {
    setExpandedEventId(event.id);
    setAlertEvent(null);
    window.requestAnimationFrame(() => {
      document.getElementById('protection-event-' + event.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };
  const reviewFindings = (event: Event) => {
    if (event.details?.coveragePartial || event.details?.scanIncomplete || event.findingsCount === 0) {
      showEventDetails(event);
      return;
    }
    setAlertEvent(null);
    const buttons = Array.from(document.querySelectorAll('button'));
    const reviewButton = buttons.find((button) => /review\\s*&\\s*fix findings/i.test(button.textContent ?? '')) as HTMLButtonElement | undefined;
    if (reviewButton) { reviewButton.click(); reviewButton.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else showEventDetails(event);
  };
  const findingUrl = (event: Event, finding: EventFinding) => {
    const base = repository!.repoUrl.replace(/\/+$/, '');
    const encodedPath = finding.filePath.split('/').map(part => encodeURIComponent(part)).join('/');
    return base + '/blob/' + encodeURIComponent(event.sha) + '/' + encodedPath
      + (finding.line ? '#L' + finding.line : '');
  };

  return (
    <>
      {alertEvent && <div role="alert" className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl border-2 border-foreground bg-foreground p-5 text-background shadow-[6px_6px_0_hsl(var(--primary))] sm:right-6 sm:left-auto sm:top-6 sm:w-[430px]">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-primary/50 bg-primary/15 text-primary"><ShieldAlert size={19} /></div>
          <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-primary">VibeSane Security Alert</p><button type="button" onClick={() => setAlertEvent(null)} aria-label="Dismiss security alert" className="text-background/50 hover:text-background"><X size={16} /></button></div>
            <h3 className="mt-2 text-[17px] font-bold">{alertIncomplete ? 'Scan coverage is incomplete' : alertEvent.event === 'pull_request' ? 'New pull request needs attention' : 'New commit has security findings'}</h3>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-background/50">{repository.repo} · {alertEvent.sha.slice(0, 7)}</p>
            <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.08em]"><span className="border border-background/20 bg-background/5 px-2 py-1">{alertEvent.findingsCount} finding{alertEvent.findingsCount === 1 ? '' : 's'}</span>{alertEvent.criticalCount > 0 && <span className="border border-[#e5c8c1]/50 bg-[#963f34]/20 px-2 py-1 text-[#f0b7ae]">{alertEvent.criticalCount} critical</span>}{alertEvent.highCount > 0 && <span className="border border-[#e7d3b3]/50 bg-[#a06427]/20 px-2 py-1 text-[#f1c895]">{alertEvent.highCount} high</span>}{alertEvent.mediumCount > 0 && <span className="border border-[#d2dbc1]/40 bg-[#66763e]/20 px-2 py-1 text-[#d8e2bd]">{alertEvent.mediumCount} medium</span>}</div>
            {alertIncomplete && <p className="mt-3 text-[12px] leading-5 text-background/70">This is not a clean result. The incomplete commit stays in the comparison range so the next push can retry it.</p>}
            <button type="button" onClick={() => reviewFindings(alertEvent)} className="vg-button vg-focus mt-5 inline-flex items-center gap-2 border-2 border-background bg-primary px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[3px_3px_0_hsl(var(--background))]">{alertIncomplete ? <ShieldAlert size={13} /> : <Wrench size={13} />}{alertIncomplete ? 'View Scan Details' : 'Review &amp; Fix Findings'} <ArrowRight size={12} /></button>
            {blocking && <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[#f0b7ae]">Critical/high findings should be resolved before merging.</p>}
          </div>
        </div>
      </div>}

      <section className="mt-10 border-2 border-foreground bg-card shadow-[4px_4px_0_hsl(var(--foreground))]">
        <div className="flex flex-col gap-5 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Protected repository</p><h2 className="mt-2 truncate text-[22px] font-bold tracking-[-0.03em]">{repository.repo}</h2><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Baseline {repository.baselineSha.slice(0, 7)} · watching pushes + pull requests</p></div>
          <div className="flex shrink-0 items-center gap-2 border border-[#aebe8c] bg-[#eef1e4] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#66763e]"><CheckCircle2 size={13} /> {statusLabel}</div>
        </div>
        <div className="grid divide-y border-b border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {[['Score', repository.lastScore], ['Critical', repository.criticalCount], ['High', repository.highCount], ['Medium', repository.mediumCount]].map(([label, value]) => <div key={String(label)} className="p-5"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-[25px] font-black tracking-[-0.05em]">{value}{label === 'Score' ? '/100' : ''}</p></div>)}
        </div>
        <div className="p-6 sm:p-7"><div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Activity</p><h3 className="mt-2 text-[18px] font-bold">Every change, one security signal.</h3><p className="mt-1 text-[11px] text-muted-foreground">Refreshes every 15 seconds while this tab is visible.</p></div><button type="button" onClick={() => setRefreshNonce(value => value + 1)} aria-label="Refresh protection activity" className="vg-focus border border-border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><RefreshCw size={16} /></button></div>
          <div className="mt-5 space-y-2">
            {events.length === 0 ? <div className="border border-border bg-muted/30 p-5"><p className="text-[13px] font-semibold">Waiting for the first change.</p><p className="mt-1 text-[12px] text-muted-foreground">Push a commit or open a pull request after GitHub App protection is installed.</p></div> : visibleEvents.map((event) => {
              const details = event.details;
              const expanded = expandedEventId === event.id;
              const incomplete = details?.coveragePartial === true || details?.scanIncomplete === true;
              return <div key={event.id} id={'protection-event-' + event.id} className="border border-border">
                <button type="button" aria-expanded={expanded} onClick={() => setExpandedEventId(expanded ? null : event.id)} className="vg-focus flex w-full items-center gap-4 p-4 text-left hover:bg-muted/30">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center border ${incomplete || event.status === 'failure' ? 'border-[#e5c8c1] bg-[#f6e9e5] text-[#963f34]' : 'border-[#d2dbc1] bg-[#eef1e4] text-[#66763e]'}`}>{event.event === 'pull_request' ? <GitPullRequest size={14} /> : incomplete || event.status === 'failure' ? <ShieldAlert size={14} /> : <CheckCircle2 size={14} />}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold capitalize">{incomplete ? 'Coverage incomplete' : event.event.replace('_', ' ')} <span className="font-mono text-muted-foreground">{event.sha.slice(0, 7)}</span></p>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">{event.findingsCount} new findings · {details?.resolvedFindingsCount ?? 0} resolved · {event.status}</p>
                  </div>
                  {expanded ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
                </button>
                {expanded && <div className="space-y-4 border-t border-border bg-muted/15 p-4 sm:p-5">
                  {details ? <>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                      {event.baseSha && <span>Compared from {event.baseSha.slice(0, 7)}</span>}
                      <span>{details.filesScanned}/{details.changedFiles} changed files scanned</span>
                      <span>{details.checksRun} checks</span>
                      {details.existingFindingsCount > 0 && <span>{details.existingFindingsCount} existing</span>}
                    </div>
                    {incomplete && <div className="border border-[#e7d3b3] bg-[#f8efe1] p-3 text-[11px] leading-5 text-[#81501f]">This event is not a clean security verdict. The baseline was not advanced, so a later push will retry all changes since the last complete scan.</div>}
                    {details.coverageReasons.length > 0 && <div><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Coverage notes</p><ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] text-muted-foreground">{details.coverageReasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></div>}
                    {details.unscannedChangedFiles.length > 0 && <div><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Not inspected</p><ul className="mt-2 space-y-1 font-mono text-[10px] text-muted-foreground">{details.unscannedChangedFiles.map((file,index)=><li key={index}>{file}</li>)}</ul>{details.unscannedChangedFileCount > details.unscannedChangedFiles.length && <p className="mt-1 text-[10px] text-muted-foreground">and {details.unscannedChangedFileCount-details.unscannedChangedFiles.length} more</p>}</div>}
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">New findings</p>
                      {details.findings.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">{incomplete ? 'No findings were returned for the portion inspected; this does not mean the changes are clean.' : 'No new findings were detected in this change.'}</p> :
                        <div className="mt-2 divide-y divide-border border border-border bg-background">{details.findings.map(finding=><div key={finding.id} className="flex items-start gap-3 p-3"><span className="shrink-0 border border-border px-1.5 py-1 font-mono text-[8px] uppercase">{finding.severity}</span><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold">{finding.title}</p><p className="mt-1 break-all font-mono text-[9px] text-muted-foreground">{finding.check} · {finding.filePath}{finding.line ? ':'+finding.line : ''}</p></div><a href={findingUrl(event,finding)} target="_blank" rel="noreferrer" aria-label={'Open '+finding.filePath+' on GitHub'} className="shrink-0 text-primary hover:underline"><ArrowRight size={13} /></a></div>)}</div>}
                    </div>
                  </> : <p className="text-[11px] text-muted-foreground">This is an older activity record. Detailed event metadata was not saved for this event.</p>}
                </div>}
              </div>;
            })}
            {hasMoreEvents && <button type="button" onClick={() => setVisibleCount((count) => Math.min(count + EVENT_PAGE_SIZE, events.length))} className="vg-button vg-focus flex w-full items-center justify-center gap-2 border-2 border-foreground bg-background px-4 py-3.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground hover:bg-accent"><ChevronDown size={14} /> Load more <span className="text-muted-foreground">({events.length - visibleCount} remaining)</span></button>}
          </div>
        </div>
      </section>
    </>
  );
}
