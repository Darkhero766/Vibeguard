import { useEffect, useState } from 'react';
import { ArrowRight, Check, Crown, GitPullRequest, ShieldCheck, Wrench } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { RepositorySecurityCenter } from './RepositorySecurityCenter';
import { ProtectRepositoryPanel } from './ProtectRepositoryPanel';
import { ProtectionActivity } from './ProtectionActivity';

type Finding = { severity: 'Critical' | 'High' | 'Medium'; title: string; filePath: string; line: number };
type Scan = { repo: string; repoUrl: string; findings: Finding[]; filesScanned: number; scannedAt: string };
type ProtectedRepository = { repo: string; repoUrl: string; baselineSha: string; lastSha: string; status: string; lastScore: number; criticalCount: number; highCount: number; mediumCount: number; };
type Props = { firstName: string; lastScan: Scan | null; usage: { scans_used: number; scans_limit: number; plan?: string | null } | null; isAtLimit: boolean; onViewLastScan: () => void; onProtect: () => void };
const TOTAL_CHECKS = 50;
const ADMIN_EMAIL = 'nightowlclub72@gmail.com';
const PRO_SCAN_LIMIT = 10;

function score(scan: Scan | null) {
  if (!scan) return null;
  const critical = scan.findings.filter((f) => f.severity === 'Critical').length;
  const high = scan.findings.filter((f) => f.severity === 'High').length;
  const medium = scan.findings.filter((f) => f.severity === 'Medium').length;
  return Math.max(1, Math.min(100, Math.round(100 - ((critical + high * 0.55 + medium * 0.2) / TOTAL_CHECKS) * 100)));
}

export function SecurityDashboard({ firstName, lastScan, usage, isAtLimit, onViewLastScan, onProtect }: Props) {
  const { session, user } = useAuth();
  const isPro = user?.email?.trim().toLowerCase() === ADMIN_EMAIL || usage?.plan === 'pro';
  const [showRepository, setShowRepository] = useState(false);
  const [showProtectPanel, setShowProtectPanel] = useState(false);
  const [protectedRepos, setProtectedRepos] = useState<ProtectedRepository[]>(() => {
    try {
      const raw = sessionStorage.getItem('vs_protected_repos');
      if (raw) return JSON.parse(raw) as ProtectedRepository[];
      const legacy = sessionStorage.getItem('vs_protected_repo');
      return legacy ? [JSON.parse(legacy) as ProtectedRepository] : [];
    } catch { return []; }
  });
  const [protectionLoading, setProtectionLoading] = useState(false);
  const protectedRepo = protectedRepos.find((repo) => repo.repo === lastScan?.repo) ?? protectedRepos[0] ?? null;
  const securityScore = score(lastScan) ?? (protectedRepo?.lastScore ?? null);
  const critical = lastScan?.findings.filter((f) => f.severity === 'Critical').length ?? protectedRepo?.criticalCount ?? 0;
  const high = lastScan?.findings.filter((f) => f.severity === 'High').length ?? protectedRepo?.highCount ?? 0;
  const medium = lastScan?.findings.filter((f) => f.severity === 'Medium').length ?? protectedRepo?.mediumCount ?? 0;
  const totalFindings = lastScan?.findings.length ?? (critical + high + medium);
  const isClear = Boolean((lastScan && totalFindings === 0) || (protectedRepo && !lastScan && protectedRepo.lastScore >= 100 && totalFindings === 0));
  const remaining = usage ? Math.max(0, (isPro ? PRO_SCAN_LIMIT : usage.scans_limit) - usage.scans_used) : null;
  const hasProtection = protectedRepos.length > 0;
  const repoName = protectedRepo?.repo ?? lastScan?.repo ?? null;
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

  useEffect(() => {
    if (!session?.access_token) { setProtectionLoading(false); return; }
    let cancelled = false;
    const loadProtection = async () => {
      if (!cancelled) setProtectionLoading(true);
      try {
        const response = await fetch(`${apiBase}/api/protection`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' });
        if (!response.ok) throw new Error('Could not load protection state');
        const data = await response.json() as { repositories?: ProtectedRepository[] };
        if (!cancelled) {
          const next = Array.isArray(data.repositories) ? data.repositories : [];
          setProtectedRepos(next);
          try {
            if (next.length) sessionStorage.setItem('vs_protected_repos', JSON.stringify(next));
            else sessionStorage.removeItem('vs_protected_repos');
            sessionStorage.removeItem('vs_protected_repo');
          } catch { /* storage is optional */ }
        }
      } catch {
        // Keep the last known state instead of flashing an incorrect empty state.
      } finally {
        if (!cancelled) setProtectionLoading(false);
      }
    };
    void loadProtection();
    const interval = window.setInterval(() => { void loadProtection(); }, 5000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [session?.access_token, apiBase]);

  if (showRepository && lastScan) return <RepositorySecurityCenter repo={lastScan.repo} repoUrl={lastScan.repoUrl} score={securityScore ?? 0} findings={lastScan.findings} filesScanned={lastScan.filesScanned} scannedAt={lastScan.scannedAt} protected onBack={() => setShowRepository(false)} />;
  const openSecurityCenter = () => { if (!lastScan) return; onViewLastScan(); setShowRepository(true); };

  return (
    <section className="mt-12 sm:mt-16">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Security command center</p>
            <span className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${isPro ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground'}`}>
              {isPro && <Crown size={11} />} {isPro ? 'Pro' : 'Free'}
            </span>
          </div>
          <h1 className="mt-4 text-[42px] font-extrabold leading-[0.98] tracking-[-0.055em] sm:text-[58px]">Good to see you, {firstName}.</h1>
          <p className="mt-4 max-w-[510px] text-[15px] leading-6 text-muted-foreground">Protect your code once, then let VibeGuard watch every push and pull request.</p>
        </div>
        <button type="button" onClick={() => { onProtect(); setShowProtectPanel(true); }} disabled={isAtLimit} className="vg-button vg-focus inline-flex min-h-12 items-center justify-center gap-2 border-2 border-foreground bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground shadow-[4px_4px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50">+ Protect repository <ArrowRight size={15} /></button>
      </div>

      {showProtectPanel && <ProtectRepositoryPanel onClose={() => setShowProtectPanel(false)} />}

      <div className="mt-10 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className={`relative min-h-[270px] overflow-hidden border-2 p-6 shadow-[5px_5px_0_hsl(var(--primary))] sm:p-8 ${isClear ? 'border-[#8fa66b] bg-[#182015] text-background shadow-[5px_5px_0_#8fa66b]' : 'border-foreground bg-foreground text-background'}`}>
          <div className={`absolute -right-14 -top-14 h-52 w-52 rounded-full border ${isClear ? 'border-[#8fa66b]/35' : 'border-primary/30'}`} />
          <div className={`absolute right-2 top-2 h-36 w-36 rounded-full border ${isClear ? 'border-[#8fa66b]/30' : 'border-primary/25'}`} />
          <div className={`absolute right-16 top-16 h-2.5 w-2.5 animate-pulse rounded-full ${isClear ? 'bg-[#b7ca83]' : 'bg-primary'}`} />
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className={`font-mono text-[10px] uppercase tracking-[0.16em] ${isClear ? 'text-[#b7ca83]' : 'text-primary'}`}>Security health</p>
              <div className="mt-7 flex items-end gap-2"><span className="text-[68px] font-black leading-none tracking-[-0.07em] sm:text-[76px]">{securityScore ?? '—'}</span><span className="mb-2 font-mono text-[11px] text-background/50">/100</span></div>
              {isClear && <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#d8e2bd]">No security findings detected</p>}
            </div>
            <div className="flex flex-col items-end gap-2 text-right">
              <span className={`inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${isClear ? 'border-[#aebe8c]/80 bg-[#eef1e4]/15 text-[#d8e2bd]' : 'border-[#aebe8c]/70 bg-[#eef1e4]/10 text-[#d8e2bd]'}`}><span className="h-1.5 w-1.5 rounded-full bg-[#b7ca83]" />{protectionLoading && !hasProtection ? 'Checking…' : hasProtection ? (isClear ? 'Protected · Clean' : 'Protected') : 'Ready to protect'}</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-background/45">{hasProtection ? `${protectedRepos.length} repo${protectedRepos.length === 1 ? '' : 's'} protected · push + PR checks active` : protectionLoading ? 'Checking protection state…' : 'GitHub App connection required'}</span>
            </div>
          </div>
          <div className="relative mt-8 flex flex-wrap items-end justify-between gap-5 border-t border-background/15 pt-5">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.1em] text-background/60"><span>{hasProtection ? `Protected · ${repoName ?? 'repository'}` : 'No repository protected yet'}</span><span>{lastScan?.filesScanned ?? 0} files scanned</span><span>50 checks</span></div>
            {totalFindings > 0 && lastScan ? <button type="button" onClick={openSecurityCenter} className="vg-button vg-focus inline-flex items-center gap-2 border-2 border-background bg-primary px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[4px_4px_0_hsl(var(--background))]"><Wrench size={14} />Review &amp; fix findings<ArrowRight size={13} /></button> : lastScan ? <span className="inline-flex items-center gap-2 border border-[#aebe8c]/70 bg-[#eef1e4]/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#d8e2bd]"><ShieldCheck size={13} />All clear</span> : hasProtection ? <span className="inline-flex items-center gap-2 border border-[#aebe8c]/70 bg-[#eef1e4]/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#d8e2bd]"><ShieldCheck size={13} />Protection active</span> : <button type="button" onClick={() => { onProtect(); setShowProtectPanel(true); }} disabled={isAtLimit} className="inline-flex items-center gap-2 border-2 border-background bg-primary px-4 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[4px_4px_0_hsl(var(--background))] disabled:opacity-50">Connect GitHub &amp; protect <ArrowRight size={13} /></button>}
          </div>
        </div>

        <div className={`border p-6 shadow-[3px_3px_0_hsl(var(--foreground)/0.08)] sm:p-7 ${isClear ? 'border-[#b7ca83] bg-[#f1f4e9]' : 'border-border bg-card'}`}>
          <div className="flex items-start justify-between gap-4"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Latest scan</p><ShieldCheck size={18} className={isClear ? 'text-[#66763e]' : 'text-muted-foreground'} /></div>
          <p className="mt-7 truncate text-[18px] font-bold">{lastScan?.repo ?? protectedRepo?.repo ?? 'No scan yet'}</p>
          {protectedRepo && !lastScan && <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Protected · waiting for scan data</p>}
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.1em]">{critical > 0 && <span className="border border-[#e5c8c1] bg-[#f6e9e5] px-2 py-1 text-[#963f34]">{critical} critical</span>}{high > 0 && <span className="border border-[#e7d3b3] bg-[#f8efe1] px-2 py-1 text-[#a06427]">{high} high</span>}{medium > 0 && <span className="border border-[#d2dbc1] bg-[#eef1e4] px-2 py-1 text-[#66763e]">{medium} medium</span>}{isClear && <span className="border border-[#b7ca83] bg-[#e4ead8] px-2 py-1 text-[#66763e]">0 findings · clear</span>}</div>
          <button type="button" onClick={openSecurityCenter} disabled={!lastScan} className="vg-focus mt-8 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary disabled:opacity-40">View security center <ArrowRight size={12} /></button>
        </div>
      </div>

      {hasProtection && <div className="mt-4 border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Protected repositories</p><p className="mt-1 text-[12px] text-muted-foreground">All repositories stay protected independently.</p></div><span className="font-mono text-[11px] font-bold uppercase tracking-[0.1em]">{protectedRepos.length} / {isPro ? 5 : 1}</span></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{protectedRepos.map((repo) => <div key={repo.repo} className="flex items-center justify-between gap-3 border border-border px-4 py-3"><div className="min-w-0"><p className="truncate text-[12px] font-semibold">{repo.repo}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">Protected · baseline {repo.baselineSha.slice(0, 7)}</p></div><span className="shrink-0 inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[#66763e]"><span className="h-1.5 w-1.5 rounded-full bg-[#8fa66b]" />Active</span></div>)}</div>
      </div>}

      <ProtectionActivity session={session} />
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="border border-border bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Repositories</p><p className="mt-3 text-[30px] font-black tracking-[-0.05em]">{protectedRepos.length}</p><p className="mt-1 text-[12px] text-muted-foreground">currently protected</p></div>
        <div className={`border p-5 ${isClear ? 'border-[#b7ca83] bg-[#f1f4e9]' : 'border-border bg-card'}`}><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Findings</p><p className={`mt-3 text-[30px] font-black tracking-[-0.05em] ${isClear ? 'text-[#66763e]' : ''}`}>{totalFindings}</p><p className="mt-1 text-[12px] text-muted-foreground">{isClear ? 'all checks passed' : lastScan ? 'from latest scan' : hasProtection ? 'waiting for first scan' : 'from latest scan'}</p></div>
        <div className="border border-border bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Scans remaining</p><p className="mt-3 text-[30px] font-black tracking-[-0.05em]">{remaining ?? '—'}</p><p className="mt-1 text-[12px] text-muted-foreground">this month · {isPro ? 'Pro' : 'Free'}</p></div>
      </div>

      <div className="mt-10 border-t border-border pt-8"><div className="flex items-center justify-between gap-4"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Security coverage</p><h2 className="mt-2 text-[22px] font-bold tracking-[-0.03em]">50 checks, one clear signal.</h2></div><GitPullRequest size={20} className="hidden text-muted-foreground sm:block" /></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{['Secrets & credentials', 'Database & RLS', 'Authentication', 'Injection & browser APIs'].map((label, index) => <div key={label} className="flex items-center gap-4 border border-border bg-card px-4 py-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center border border-primary/30 bg-primary/[0.06] text-primary"><Check size={13} /></span><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold">{label}</p><div className="mt-2 h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${[100, 96, 92, 88][index]}%` }} /></div></div><span className="font-mono text-[10px] text-muted-foreground">{[100, 96, 92, 88][index]}%</span></div>)}</div></div>
    </section>
  );
}
