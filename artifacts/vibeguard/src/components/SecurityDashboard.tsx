import { useState } from 'react';
import { ArrowRight, Check, GitPullRequest, ShieldCheck, Wrench } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { RepositorySecurityCenter } from './RepositorySecurityCenter';
import { ProtectRepositoryPanel } from './ProtectRepositoryPanel';
import { ProtectionActivity } from './ProtectionActivity';

type Finding = {
  severity: 'Critical' | 'High' | 'Medium';
  title: string;
  filePath: string;
  line: number;
};

type Scan = {
  repo: string;
  repoUrl: string;
  findings: Finding[];
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
  const penalty = scan.findings.reduce(
    (total, finding) => total + (finding.severity === 'Critical' ? 18 : finding.severity === 'High' ? 10 : 4),
    0,
  );
  return Math.max(0, 100 - penalty);
}

function fixLabel(findings: Finding[]) {
  if (!findings.length) return 'No fixes needed';
  return findings.length === 1 ? '1 fix available' : `${findings.length} fixes available`;
}

export function SecurityDashboard({ firstName, lastScan, usage, isAtLimit, onViewLastScan, onProtect }: Props) {
  const { session } = useAuth();
  const [showRepository, setShowRepository] = useState(false);
  const [showProtectPanel, setShowProtectPanel] = useState(false);
  const [showFixPrompt, setShowFixPrompt] = useState(false);
  const securityScore = score(lastScan);
  const critical = lastScan?.findings.filter((f) => f.severity === 'Critical').length ?? 0;
  const high = lastScan?.findings.filter((f) => f.severity === 'High').length ?? 0;
  const medium = lastScan?.findings.filter((f) => f.severity === 'Medium').length ?? 0;
  const remaining = usage ? Math.max(0, usage.scans_limit - usage.scans_used) : null;
  const hasFindings = Boolean(lastScan?.findings.length);

  if (showRepository && lastScan) {
    return (
      <RepositorySecurityCenter
        repo={lastScan.repo}
        repoUrl={lastScan.repoUrl}
        score={securityScore ?? 0}
        findings={lastScan.findings}
        filesScanned={lastScan.filesScanned}
        scannedAt={lastScan.scannedAt}
        protected
        onBack={() => setShowRepository(false)}
      />
    );
  }

  return (
    <section className="mt-12 sm:mt-16">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Security command center</p>
          <h1 className="mt-4 text-[42px] font-extrabold leading-[0.98] tracking-[-0.055em] sm:text-[58px]">Good to see you, {firstName}.</h1>
          <p className="mt-4 max-w-[510px] text-[15px] leading-6 text-muted-foreground">Protect your code once, then let VibeSane watch every push and pull request.</p>
        </div>
        <button
          type="button"
          onClick={() => { onProtect(); setShowProtectPanel(true); }}
          disabled={isAtLimit}
          className="vg-button vg-focus inline-flex min-h-12 items-center justify-center gap-2 border-2 border-foreground bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground shadow-[4px_4px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Protect repository <ArrowRight size={15} />
        </button>
      </div>

      {showProtectPanel && <ProtectRepositoryPanel onClose={() => setShowProtectPanel(false)} />}

      <div className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="relative min-h-[245px] overflow-hidden border-2 border-foreground bg-foreground p-6 text-background sm:p-8">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full border border-primary/30" />
          <div className="absolute -right-2 top-0 h-32 w-32 rounded-full border border-primary/25" />
          <div className="absolute right-12 top-12 h-2 w-2 animate-pulse rounded-full bg-primary" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Security health</p>
                {lastScan && (
                  <span className="inline-flex items-center gap-1.5 border border-[#66763e]/40 bg-[#66763e]/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#d7dfbd]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#aebe8c]" /> Monitoring active
                  </span>
                )}
              </div>
              <div className="mt-8 flex items-end gap-2">
                <span className="text-[72px] font-black leading-none tracking-[-0.07em]">{securityScore ?? '—'}</span>
                <span className="mb-2.5 font-mono text-[11px] text-background/50">/100</span>
              </div>
              <p className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-background/65">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                {lastScan ? `Last scan · ${lastScan.repo}` : 'No repository scanned yet'}
              </p>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-background/10 pt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-background/55">
              <span>50 checks</span>
              <span>Push + PR protection</span>
              <span>{lastScan ? `${lastScan.filesScanned} files analyzed` : 'Ready to scan'}</span>
            </div>
          </div>
        </div>

        <div className="border border-border bg-card p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Latest scan</p>
              <p className="mt-6 truncate text-[20px] font-bold tracking-[-0.025em]">{lastScan?.repo ?? 'No repository yet'}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-primary/25 bg-primary/[0.06] text-primary">
              <ShieldCheck size={19} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.1em]">
            {critical > 0 && <span className="border border-[#e5c8c1] bg-[#f6e9e5] px-2 py-1 text-[#963f34]">{critical} critical</span>}
            {high > 0 && <span className="border border-[#e7d3b3] bg-[#f8efe1] px-2 py-1 text-[#a06427]">{high} high</span>}
            {medium > 0 && <span className="border border-[#d2dbc1] bg-[#eef1e4] px-2 py-1 text-[#66763e]">{medium} medium</span>}
            {!critical && !high && !medium && lastScan && <span className="border border-[#d2dbc1] bg-[#eef1e4] px-2 py-1 text-[#66763e]">clear</span>}
          </div>

          <div className="mt-7 border-t border-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Result</span>
              <span className="text-[13px] font-semibold">{hasFindings ? fixLabel(lastScan!.findings) : lastScan ? 'All clear' : 'Waiting for scan'}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { onViewLastScan(); setShowRepository(true); }}
                disabled={!lastScan}
                className="vg-focus inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary disabled:opacity-40"
              >
                View security center <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {hasFindings && (
        <div className="mt-4 border-2 border-foreground bg-[#f3efe4] p-5 shadow-[5px_5px_0_hsl(var(--foreground))] sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-foreground bg-primary text-primary-foreground shadow-[3px_3px_0_hsl(var(--foreground))]">
                <Wrench size={19} />
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">Recommended next step</p>
                <h2 className="mt-1.5 text-[20px] font-extrabold tracking-[-0.03em]">Fix the findings before the next push.</h2>
                <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">VibeSane can prepare a remediation plan for every finding detected in this scan.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowFixPrompt(true)}
              className="vg-button vg-focus inline-flex min-h-12 shrink-0 items-center justify-center gap-2 border-2 border-foreground bg-primary px-5 py-3 text-[12px] font-bold text-primary-foreground shadow-[4px_4px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              <Wrench size={15} />
              Create all fixes <ArrowRight size={14} />
            </button>
          </div>
          {showFixPrompt && (
            <div className="mt-5 border-t border-foreground/15 pt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {lastScan!.findings.length} remediation {lastScan!.findings.length === 1 ? 'step' : 'steps'} ready in the Security Center. Review each change before applying it.
            </div>
          )}
        </div>
      )}

      <ProtectionActivity session={session} />

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
