import { FormEvent, useMemo, useState } from 'react';
import { ArrowRight, Github, Loader2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { RepoPicker } from './RepoPicker';

type ScanReport = {
  repo: string;
  repoUrl: string;
  findings: Array<{ severity: 'Critical' | 'High' | 'Medium'; title: string; description: string; filePath: string; line: number; check: string; id: string }>;
  filesScanned: number;
  scannedAt: string;
};

type ProtectedRepository = {
  repo: string;
  repoUrl: string;
  baselineSha: string;
  lastSha: string;
  status: string;
  lastScore: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
};

const githubUrlPattern = /^https:\/\/github\.com\/[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+\/?$/;
const LAST_SCAN_KEY = (uid: string) => `vs_last_scan_${uid}`;
const PROTECTED_REPOS_KEY = 'vs_protected_repos';
const SELECTED_REPO_KEY = 'vs_selected_repo';
const PROTECTION_CACHE_KEY = 'vs_protected_repos_cached_at';

function saveLastScan(uid: string, report: ScanReport) {
  try { localStorage.setItem(LAST_SCAN_KEY(uid), JSON.stringify(report)); } catch { /* storage is optional */ }
}

function cacheProtectedRepository(repository: ProtectedRepository) {
  try {
    const raw = sessionStorage.getItem(PROTECTED_REPOS_KEY);
    const existing = raw ? JSON.parse(raw) as ProtectedRepository[] : [];
    const list = Array.isArray(existing) ? existing : [];
    const withoutDuplicate = list.filter((item) => item.repo !== repository.repo);
    const next = [...withoutDuplicate, repository];
    sessionStorage.setItem(PROTECTED_REPOS_KEY, JSON.stringify(next));
    sessionStorage.removeItem('vs_protected_repo');
    sessionStorage.setItem(SELECTED_REPO_KEY, repository.repo);
    sessionStorage.setItem(PROTECTION_CACHE_KEY, String(Date.now()));
  } catch { /* storage is optional */ }
}

export function ProtectRepositoryPanel({ onClose }: { onClose: () => void }) {
  const { user, session } = useAuth();
  const [mode, setMode] = useState<'url' | 'picker'>('picker');
  const [repoUrl, setRepoUrl] = useState('');
  const [error, setError] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [scanStarted, setScanStarted] = useState(false);
  const canScan = useMemo(() => githubUrlPattern.test(repoUrl.trim()), [repoUrl]);
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

  const runProtection = async (url: string) => {
    const normalizedUrl = url.trim().replace(/\/$/, '');
    if (!githubUrlPattern.test(normalizedUrl)) { setError('Enter a valid GitHub repository URL.'); return; }
    if (!session?.access_token) { setError('Your session expired. Sign in again and retry.'); return; }

    setError('');
    setSelectedRepo(normalizedUrl.replace('https://github.com/', ''));
    setScanStarted(true);

    try {
      const response = await fetch(`${apiBase}/api/protection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ repoUrl: normalizedUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'The repository could not be protected.');

      const report = payload?.baseline;
      const repository = payload?.repository as ProtectedRepository | undefined;
      if (!report || !repository?.repo) throw new Error('The baseline scan completed without a saved protection record.');

      const savedReport: ScanReport = {
        repo: normalizedUrl.replace('https://github.com/', ''),
        repoUrl: normalizedUrl,
        findings: Array.isArray(report.findings) ? report.findings : [],
        filesScanned: Number(report.filesScanned ?? 0),
        scannedAt: new Date().toISOString(),
      };
      if (user?.id) saveLastScan(user.id, savedReport);

      // Keep the dashboard's multi-repository cache in sync before any navigation.
      // Previously the page reloaded without updating this cache, so the newly
      // protected repository could appear to vanish until the next API refresh.
      cacheProtectedRepository(repository);

      setScanStarted(false);
      onClose();
      window.location.reload();
    } catch (scanError) {
      setScanStarted(false);
      setError(scanError instanceof Error ? scanError.message : 'The repository could not be protected.');
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void runProtection(repoUrl); };
  const busy = scanStarted;

  return (
    <div className="mt-6 border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_hsl(var(--foreground))] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Protect a repository</p>
          <h2 className="mt-2 text-[22px] font-bold tracking-[-0.03em]">{busy ? 'Securing repository' : 'Choose a repository to protect'}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{busy ? 'Running the full baseline scan and saving the commit that protection starts from.' : 'Run the baseline once, save the repository, then let GitHub events trigger delta scans.'}</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} className="vg-focus p-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" aria-label="Close"><X size={18} /></button>
      </div>

      {!busy && <div className="mt-6 flex w-full max-w-[360px] border-2 border-foreground bg-card p-0.5">
        <button type="button" onClick={() => setMode('url')} className={`vg-button flex-1 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${mode === 'url' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>Paste URL</button>
        <button type="button" onClick={() => setMode('picker')} className={`vg-button flex-1 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${mode === 'picker' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>My repos</button>
      </div>}

      {busy ? <div className="mt-6 border-2 border-foreground bg-foreground p-6 text-background shadow-[4px_4px_0_hsl(var(--primary))]">
        <div className="flex items-start gap-4"><div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-primary/40 bg-primary/10 text-primary"><Loader2 size={19} className="animate-spin" /></div><div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Baseline scan in progress</p><p className="mt-2 truncate text-[17px] font-bold">{selectedRepo}</p><p className="mt-2 text-[12px] leading-5 text-background/65">Cloning repository → running 50 security checks → saving baseline → enabling protection.</p></div></div>
        <div className="mt-6 h-1.5 overflow-hidden bg-background/10"><div className="h-full w-1/2 animate-pulse bg-primary" /></div>
        <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-background/45">Do not refresh — the baseline is being created.</p>
      </div> : mode === 'picker' ? <div className="mt-5"><RepoPicker session={session} onSelect={runProtection} /></div> : <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1"><Github className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} /><input value={repoUrl} onChange={(event) => { setRepoUrl(event.target.value); setError(''); }} placeholder="https://github.com/owner/repository" className="vg-focus h-14 w-full border-2 border-foreground bg-card pl-11 pr-4 text-[14px] outline-none focus:border-primary" /></div>
        <button type="submit" disabled={!canScan} className="vg-button vg-focus inline-flex h-14 items-center justify-center gap-2 border-2 border-foreground bg-primary px-5 text-[13px] font-bold text-primary-foreground shadow-[3px_3px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-[160px]">Protect repository <ArrowRight size={15} /></button>
      </form>}

      {!busy && error && <p className="mt-3 text-[12px] text-[#963f34]">{error}</p>}
    </div>
  );
}
