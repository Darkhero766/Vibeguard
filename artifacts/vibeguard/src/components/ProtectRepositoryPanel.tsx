import { useState } from 'react';
import { ArrowRight, Loader2, X } from 'lucide-react';
import { Link } from 'wouter';
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

const PROTECTED_REPOS_KEY = 'vs_protected_repos';
const SELECTED_REPO_KEY = 'vs_selected_repo';
const PROTECTION_CACHE_KEY = 'vs_protected_repos_cached_at';
const LAST_SCAN_KEY = (uid: string) => `vs_last_scan_${uid}`;

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
  const [error, setError] = useState('');
  const [selectedRepo, setSelectedRepo] = useState('');
  const [scanStarted, setScanStarted] = useState(false);
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

  const runProtection = async (url: string) => {
    const normalizedUrl = url.trim().replace(/\/$/, '');
    if (!/^https:\/\/github\.com\/[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(normalizedUrl)) { setError('Choose a repository from My repos.'); return; }
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
      cacheProtectedRepository(repository);
      setScanStarted(false);
      onClose();
      window.location.reload();
    } catch (scanError) {
      setScanStarted(false);
      setError(scanError instanceof Error ? scanError.message : 'The repository could not be protected.');
    }
  };

  const busy = scanStarted;

  return (
    <div className="mt-6 border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_hsl(var(--foreground))] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Protect a repository</p>
          <h2 className="mt-2 text-[22px] font-bold tracking-[-0.03em]">{busy ? 'Securing repository' : 'Choose a repository to protect'}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">{busy ? 'Running the full baseline scan and saving the commit that protection starts from.' : 'Select one of your GitHub repositories, run the baseline once, then let GitHub events trigger delta scans.'}</p>
        </div>
        <button type="button" onClick={onClose} disabled={busy} className="vg-focus p-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40" aria-label="Close"><X size={18} /></button>
      </div>

      {!busy && <div className="mt-6 border border-border bg-background p-4 sm:p-5">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-primary">Different job, different quota</p>
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">Want to inspect a public repository without protecting it? Use the separate one-time public scanner. It will not consume a protected repository slot.</p>
        <Link href="/scan-public" onClick={onClose} className="vg-focus mt-4 inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-primary hover:underline underline-offset-4">Scan public repository <ArrowRight size={13} /></Link>
      </div>}

      {busy ? <div className="mt-6 border-2 border-foreground bg-foreground p-6 text-background shadow-[4px_4px_0_hsl(var(--primary))]">
        <div className="flex items-start gap-4"><div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-primary/40 bg-primary/10 text-primary"><Loader2 size={19} className="animate-spin" /></div><div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Baseline scan in progress</p><p className="mt-2 truncate text-[17px] font-bold">{selectedRepo}</p><p className="mt-2 text-[12px] leading-5 text-background/65">Cloning repository → running 50 security checks → saving baseline → enabling protection.</p></div></div>
        <div className="mt-6 h-1.5 overflow-hidden bg-background/10"><div className="h-full w-1/2 animate-pulse bg-primary" /></div>
        <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-background/45">Do not refresh — the baseline is being created.</p>
      </div> : <div className="mt-5"><RepoPicker session={session} onSelect={runProtection} /></div>}

      {!busy && error && <p className="mt-3 text-[12px] text-[#963f34]">{error}</p>}
    </div>
  );
}
