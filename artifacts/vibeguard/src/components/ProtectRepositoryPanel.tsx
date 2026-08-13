import { FormEvent, useMemo, useState } from 'react';
import { ArrowRight, Github, Loader2, X } from 'lucide-react';
import { useCreateScan } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { RepoPicker } from './RepoPicker';

type ScanReport = {
  repo: string;
  repoUrl: string;
  findings: Array<{ severity: 'Critical' | 'High' | 'Medium'; title: string; description: string; filePath: string; line: number; check: string; id: string }>;
  filesScanned: number;
  scannedAt: string;
};

const githubUrlPattern = /^https:\/\/github\.com\/[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+\/?$/;
const LAST_SCAN_KEY = (uid: string) => `vs_last_scan_${uid}`;

function saveLastScan(uid: string, report: ScanReport) {
  try { localStorage.setItem(LAST_SCAN_KEY(uid), JSON.stringify(report)); } catch { /* storage is optional */ }
}

export function ProtectRepositoryPanel({ onClose }: { onClose: () => void }) {
  const { user, session, usage, usageLoading, refreshUsage } = useAuth();
  const scanMutation = useCreateScan();
  const [mode, setMode] = useState<'url' | 'picker'>('picker');
  const [repoUrl, setRepoUrl] = useState('');
  const [error, setError] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [scanStarted, setScanStarted] = useState(false);
  const isUnlimited = user?.email === 'nightowlclub72@gmail.com';
  const isAtLimit = !isUnlimited && !usageLoading && usage != null && usage.scans_used >= usage.scans_limit;
  const canScan = useMemo(() => githubUrlPattern.test(repoUrl.trim()), [repoUrl]);

  const runScan = async (url: string) => {
    const normalizedUrl = url.trim().replace(/\/$/, '');
    if (!githubUrlPattern.test(normalizedUrl)) {
      setError('Enter a valid GitHub repository URL.');
      return;
    }

    setError('');
    setSelectedRepo(normalizedUrl.replace('https://github.com/', ''));
    setScanStarted(true);

    let freshUsage: { scans_used: number; scans_limit: number; owner: string } | null = null;
    if (!isUnlimited) {
      await refreshUsage();
      const { data } = await supabase
        .from('usage')
        .select('scans_used, scans_limit, owner')
        .maybeSingle();
      freshUsage = data;
      if (freshUsage && freshUsage.scans_used >= freshUsage.scans_limit) {
        setScanStarted(false);
        setError('You have reached your scan limit for this month.');
        return;
      }
    }

    scanMutation.mutate(
      { data: { repoUrl: normalizedUrl } },
      {
        onSuccess: async (rawData: unknown) => {
          const report = rawData as ScanReport;
          if (user?.id) saveLastScan(user.id, report);
          if (!isUnlimited && freshUsage) {
            await supabase
              .from('usage')
              .update({ scans_used: freshUsage.scans_used + 1 })
              .eq('owner', freshUsage.owner);
          }
          await refreshUsage();
          onClose();
          window.location.reload();
        },
        onError: (scanError: unknown) => {
          const message = scanError instanceof Error ? scanError.message : 'The repository could not be scanned.';
          setScanStarted(false);
          setError(message);
        },
      },
    );
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runScan(repoUrl);
  };

  const busy = scanStarted || scanMutation.isPending;

  return (
    <div className="mt-6 border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_hsl(var(--foreground))] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Protect a repository</p>
          <h2 className="mt-2 text-[22px] font-bold tracking-[-0.03em]">{busy ? 'Securing repository' : 'Choose a repository to scan'}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {busy ? 'VibeSane is running the full baseline security scan. Keep this page open.' : 'Run the existing VibeSane scan and keep the result in your dashboard.'}
          </p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} className="vg-focus p-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" aria-label="Close"><X size={18} /></button>
      </div>

      {!busy && (
        <div className="mt-6 flex w-full max-w-[360px] border-2 border-foreground bg-card p-0.5">
          <button type="button" onClick={() => setMode('url')} className={`vg-button flex-1 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${mode === 'url' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Paste URL</button>
          <button type="button" onClick={() => setMode('picker')} className={`vg-button flex-1 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${mode === 'picker' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>My repos</button>
        </div>
      )}

      {busy ? (
        <div className="mt-6 border-2 border-foreground bg-foreground p-6 text-background shadow-[4px_4px_0_hsl(var(--primary))]">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-primary/40 bg-primary/10 text-primary"><Loader2 size={19} className="animate-spin" /></div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Baseline scan in progress</p>
              <p className="mt-2 truncate text-[17px] font-bold">{selectedRepo}</p>
              <p className="mt-2 text-[12px] leading-5 text-background/65">Cloning repository → running security checks → building your baseline. Large repositories can take a little longer.</p>
            </div>
          </div>
          <div className="mt-6 h-1.5 overflow-hidden bg-background/10"><div className="h-full w-1/2 animate-pulse bg-primary" /></div>
          <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-background/45">Do not refresh — your scan is still running.</p>
        </div>
      ) : mode === 'picker' ? (
        <div className="mt-5"><RepoPicker session={session} onSelect={runScan} disabled={isAtLimit} /></div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1"><Github className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input value={repoUrl} onChange={(event) => { setRepoUrl(event.target.value); setError(''); }} placeholder="https://github.com/owner/repository" className="vg-focus h-14 w-full border-2 border-foreground bg-card pl-11 pr-4 text-[14px] outline-none focus:border-primary" /></div>
          <button type="submit" disabled={isAtLimit || !canScan} className="vg-button vg-focus inline-flex h-14 items-center justify-center gap-2 border-2 border-foreground bg-primary px-5 text-[13px] font-bold text-primary-foreground shadow-[3px_3px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-[160px]">Scan repository <ArrowRight size={15} /></button>
        </form>
      )}

      {!busy && isAtLimit && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#963f34]">Monthly scan limit reached.</p>}
      {!busy && error && <p className="mt-3 text-[12px] text-[#963f34]">{error}</p>}
    </div>
  );
}
