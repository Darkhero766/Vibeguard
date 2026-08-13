import { ArrowRight, Check, GitPullRequest, ShieldCheck } from 'lucide-react';

type Scan = {
  repo: string;
  repoUrl: string;
  findings: Array<{ severity: 'Critical' | 'High' | 'Medium' }>;
  filesScanned: number;
  scannedAt: string;
};

type Props = {
  firstName: string;
  lastScan: Scan | null;
  usage: { scans_used: number; scans_limit: number } | null;
  isAtLimit: boolean;
  onViewLastScan: () => void;
  onProtect: () => void;
};

function score(scan: Scan | null) {
  if (!scan) return null;
  const penalty = scan.findings.reduce((total, finding) => total + (finding.severity === 'Critical' ? 18 : finding.severity === 'High' ? 10 : 4), 0);
  return Math.max(0, 100 - penalty);
}

export function SecurityDashboard({ firstName, lastScan, usage, isAtLimit, onViewLastScan, onProtect }: Props) {
  const securityScore = score(lastScan);
  const critical = lastScan?.findings.filter((f) => f.severity === 'Critical').length ?? 0;
  const high = lastScan?.findings.filter((f) => f.severity === 'High').length ?? 0;
  const remaining = usage ? Math.max(0, usage.scans_limit - usage.scans_used) : null;

  return (
    <section className="mt-12 sm:mt-16">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Security command center</p>
          <h1 className="mt-4 text-[42px] font-extrabold leading-[0.98] tracking-[-0.055em] sm:text-[58px]">
            Good to see you, {firstName}.
          </h1>
          <p className="mt-4 max-w-[510px] text-[15px] leading-6 text-muted-foreground">
            Protect your code once, then let VibeSane watch every push and pull request.
          </p>
        </div>
        <button
          type="button"
          onClick={onProtect}
          disabled={isAtLimit}
          className="vg-button vg-focus inline-flex min-h-12 items-center justify-center gap-2 border-2 border-foreground bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground shadow-[4px_4px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Protect repository <ArrowRight size={15} />
        </button>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_1fr_1fr]">
        <div className="relative min-h-[210px] overflow-hidden border-2 border-foreground bg-foreground p-6 text-background sm:p-7">
          <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full border border-primary/30" />
          <div className="absolute -right-3 top-[-3px] h-28 w-28 rounded-full border border-primary/25" />
          <div className="absolute right-10 top-10 h-2 w-2 animate-pulse rounded-full bg-primary" />
          <p className="relative font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Security health</p>
          <div className="relative mt-7 flex items-end gap-2">
            <span className="text-[68px] font-black leading-none tracking-[-0.07em]">{securityScore ?? '—'}</span>
            <span className="mb-2 font-mono text-[11px] text-background/50">/100</span>
          </div>
          <p className="relative mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-background/65">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {lastScan ? 'Last scan protected' : 'No scan yet'}
          </p>
        </div>

        <div className="border border-border bg-card p-6 sm:p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Protection</p>
          <div className="mt-7 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center border border-[#aebe8c] bg-[#eef1e4] text-[#66763e]"><ShieldCheck size={20} /></div>
            <div><p className="text-[18px] font-bold">{lastScan ? 'Monitoring ready' : 'Not connected'}</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Push + PR checks</p></div>
          </div>
          <div className="mt-8 flex items-end justify-between border-t border-border pt-5">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">50 checks</span>
            <span className="text-[13px] font-semibold">{lastScan ? 'Active' : 'Ready'}</span>
          </div>
        </div>

        <div className="border border-border bg-card p-6 sm:p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Latest scan</p>
          <p className="mt-7 truncate text-[18px] font-bold">{lastScan?.repo ?? 'No repository yet'}</p>
          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.1em]">
            {critical > 0 && <span className="border border-[#e5c8c1] bg-[#f6e9e5] px-2 py-1 text-[#963f34]">{critical} critical</span>}
            {high > 0 && <span className="border border-[#e7d3b3] bg-[#f8efe1] px-2 py-1 text-[#a06427]">{high} high</span>}
            {!critical && !high && lastScan && <span className="border border-[#d2dbc1] bg-[#eef1e4] px-2 py-1 text-[#66763e]">clear</span>}
          </div>
          <button type="button" onClick={onViewLastScan} disabled={!lastScan} className="vg-focus mt-8 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary disabled:opacity-40">
            View report <ArrowRight size={12} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="border border-border bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Repositories</p><p className="mt-3 text-[30px] font-black tracking-[-0.05em]">{lastScan ? '1' : '0'}</p><p className="mt-1 text-[12px] text-muted-foreground">currently protected</p></div>
        <div className="border border-border bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Findings</p><p className="mt-3 text-[30px] font-black tracking-[-0.05em]">{lastScan?.findings.length ?? 0}</p><p className="mt-1 text-[12px] text-muted-foreground">from latest scan</p></div>
        <div className="border border-border bg-card p-5"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Scans remaining</p><p className="mt-3 text-[30px] font-black tracking-[-0.05em]">{remaining ?? '—'}</p><p className="mt-1 text-[12px] text-muted-foreground">this month</p></div>
      </div>

      <div className="mt-10 border-t border-border pt-8">
        <div className="flex items-center justify-between gap-4">
          <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Security coverage</p><h2 className="mt-2 text-[22px] font-bold tracking-[-0.03em]">50 checks, one clear signal.</h2></div>
          <GitPullRequest size={20} className="hidden text-muted-foreground sm:block" />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {['Secrets & credentials', 'Database & RLS', 'Authentication', 'Injection & browser APIs'].map((label, index) => (
            <div key={label} className="flex items-center gap-4 border border-border bg-card px-4 py-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-primary/30 bg-primary/[0.06] text-primary"><Check size={13} /></span>
              <div className="min-w-0 flex-1"><p className="text-[12px] font-semibold">{label}</p><div className="mt-2 h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${[100, 96, 92, 88][index]}%` }} /></div></div>
              <span className="font-mono text-[10px] text-muted-foreground">{[100, 96, 92, 88][index]}%</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
