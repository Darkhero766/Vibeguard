import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateScan } from '@workspace/api-client-react';
import {
  AlertCircle, ArrowRight, Check, Clipboard, ExternalLink,
  FileSearch, Github, KeyRound, Lock, RefreshCw,
  ShieldCheck, ShieldOff, Wifi, Zap,
} from 'lucide-react';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { Link, Route, Router as WouterRouter, Switch } from 'wouter';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { ScanProgress } from '@/components/ScanProgress';
import AuthPage from '@/pages/AuthPage';
import PricingPage from '@/pages/PricingPage';
import TermsPage from '@/pages/TermsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const githubUrlPattern = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/;

type FindingSeverity = 'Critical' | 'High' | 'Medium';
type Finding = {
  id: string; severity: FindingSeverity; title: string;
  description: string; filePath: string; line: number; check: string;
};
type ScanReport = {
  repo: string; repoUrl: string; findings: Finding[];
  filesScanned: number; scannedAt: string;
};

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(parsed);
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const r = error as { error?: string; message?: string; data?: { error?: string }; response?: { data?: { error?: string } } };
    return r.data?.error ?? r.response?.data?.error ?? r.error ?? r.message;
  }
  return undefined;
}

function severityStyles(severity: FindingSeverity) {
  if (severity === 'Critical') return { label: 'text-[#963f34]', dot: 'bg-[#963f34]', wash: 'bg-[#f6e9e5]', border: 'border-[#e5c8c1]' };
  if (severity === 'High') return { label: 'text-[#a06427]', dot: 'bg-[#a06427]', wash: 'bg-[#f8efe1]', border: 'border-[#e7d3b3]' };
  return { label: 'text-[#66763e]', dot: 'bg-[#66763e]', wash: 'bg-[#eef1e4]', border: 'border-[#d2dbc1]' };
}

// ─── Severity summary bar ───────────────────────────────────────────────────

function SeverityBadge({ count, severity }: { count: number; severity: FindingSeverity }) {
  if (count === 0) return null;
  const s = severityStyles(severity);
  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${s.wash} ${s.border} ${s.label}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {count} {severity}
    </span>
  );
}

function SummaryBar({ report }: { report: ScanReport }) {
  const critical = report.findings.filter(f => f.severity === 'Critical').length;
  const high = report.findings.filter(f => f.severity === 'High').length;
  const medium = report.findings.filter(f => f.severity === 'Medium').length;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-none border border-border bg-card px-5 py-3.5">
      <span className="font-mono text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">{report.filesScanned}</span> files scanned
        {' · '}
        <span className="font-semibold text-foreground">{report.findings.length}</span>{' '}
        {report.findings.length === 1 ? 'finding' : 'findings'}
      </span>
      {(critical > 0 || high > 0 || medium > 0) && (
        <span className="h-3 w-px bg-border" />
      )}
      <div className="flex flex-wrap gap-1.5">
        <SeverityBadge count={critical} severity="Critical" />
        <SeverityBadge count={high} severity="High" />
        <SeverityBadge count={medium} severity="Medium" />
      </div>
    </div>
  );
}

// ─── Scan skeleton ──────────────────────────────────────────────────────────

function ScanSkeleton() {
  return (
    <section className="vg-rise mt-10" aria-label="Scanning repository">
      <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        reading public repository
      </div>
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div className="border border-border bg-card p-6" key={i}>
            <div className="vg-skeleton h-3 w-20" />
            <div className="vg-skeleton mt-5 h-6 w-3/5" />
            <div className="vg-skeleton mt-3 h-4 w-full" />
            <div className="vg-skeleton mt-2 h-4 w-4/5" />
            <div className="mt-7 flex gap-5">
              <div className="vg-skeleton h-3 w-36" />
              <div className="vg-skeleton h-3 w-14" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Finding card ────────────────────────────────────────────────────────────

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const s = severityStyles(finding.severity);
  return (
    <article
      className="vg-rise border border-border bg-card p-5 transition-colors hover:border-primary/40 sm:p-7"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.13em] ${s.wash} ${s.border} ${s.label}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {finding.severity}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {finding.check.replaceAll('_', ' ')}
        </span>
      </div>
      <h3 className="mt-5 max-w-2xl text-[18px] font-bold leading-snug tracking-[-0.025em] sm:text-[20px]">
        {finding.title}
      </h3>
      <p className="mt-2.5 max-w-2xl text-[14px] leading-6 text-muted-foreground">
        {finding.description}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/75 pt-4 font-mono text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="text-primary">file</span>
          <span className="break-all text-foreground/75">{finding.filePath}</span>
        </span>
        <span><span className="text-primary">line</span> {finding.line}</span>
      </div>
    </article>
  );
}

// ─── Clean result ────────────────────────────────────────────────────────────

function CleanResult({ report }: { report: ScanReport }) {
  return (
    <div className="vg-rise border border-[#d2dbc1] bg-[#f1f4e9] p-8 sm:p-10">
      <div className="flex h-10 w-10 items-center justify-center border border-[#aebe8c] text-[#66763e]">
        <ShieldCheck size={21} strokeWidth={1.6} />
      </div>
      <h2 className="mt-6 text-[24px] font-bold tracking-[-0.035em]">No high-signal issues found.</h2>
      <p className="mt-2.5 max-w-xl text-[14px] leading-6 text-muted-foreground">
        VibeGuard checked all {report.filesScanned} files and did not find any of the security patterns it looks for.
      </p>
      <div className="mt-6 flex flex-wrap gap-5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#66763e]">
        <span>{report.filesScanned} files scanned</span>
        <span>•</span>
        <span>clear result</span>
      </div>
    </div>
  );
}

// ─── Upgrade wall ────────────────────────────────────────────────────────────

function UpgradeWall() {
  return (
    <div className="vg-rise mt-10 border border-[#e7d3b3] bg-[#f8efe1] p-8 sm:p-10">
      <div className="flex h-10 w-10 items-center justify-center border border-[#d4a96a] text-[#a06427]">
        <ShieldOff size={20} strokeWidth={1.6} />
      </div>
      <h2 className="mt-6 text-[22px] font-bold tracking-[-0.03em] text-foreground">
        You've used your free scan.
      </h2>
      <p className="mt-2.5 max-w-lg text-[14px] leading-6 text-muted-foreground">
        Upgrade for unlimited scans, scan history, and team sharing.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/pricing"
          className="vg-button vg-focus inline-flex items-center gap-2 border border-primary bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Zap size={14} />
          View pricing
        </Link>
        <button
          disabled
          className="inline-flex cursor-not-allowed items-center gap-2 border border-border bg-card px-4 py-2.5 text-[13px] font-semibold text-muted-foreground opacity-60"
        >
          Upgrade — Coming soon
        </button>
      </div>
    </div>
  );
}

// ─── Report view ─────────────────────────────────────────────────────────────

function Report({ report, onRescan, onCopy, copied }: {
  report: ScanReport; onRescan: () => void; onCopy: () => void; copied: boolean;
}) {
  return (
    <section className="vg-rise mt-10 pb-20">
      <div className="border-b border-border pb-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-[#66763e]" />
              scan complete
            </div>
            <h1 className="mt-4 break-all text-[26px] font-bold leading-tight tracking-[-0.04em] sm:text-[34px]">
              {report.repo}
            </h1>
            <a
              className="vg-focus mt-1.5 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-primary"
              href={report.repoUrl} rel="noreferrer" target="_blank"
            >
              {report.repoUrl.replace(/^https:\/\/github\.com\//, '')}
              <ExternalLink size={12} />
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="vg-button vg-focus inline-flex items-center gap-2 border border-border bg-card px-3.5 py-2.5 text-[12px] font-semibold text-foreground hover:border-primary/50 hover:text-primary"
              onClick={onCopy} type="button"
            >
              {copied ? <Check size={14} /> : <Clipboard size={14} />}
              {copied ? 'Copied' : 'Copy report as text'}
            </button>
            <button
              className="vg-button vg-focus inline-flex items-center gap-2 border border-primary bg-primary px-3.5 py-2.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={onRescan} type="button"
            >
              <RefreshCw size={14} /> Re-scan
            </button>
          </div>
        </div>
        <div className="mt-5">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            checked {formatDate(report.scannedAt)}
          </p>
          <SummaryBar report={report} />
        </div>
      </div>

      {report.findings.length > 0 ? (
        <div className="mt-6 space-y-3">
          {report.findings.map((f, i) => <FindingCard finding={f} index={i} key={f.id} />)}
        </div>
      ) : (
        <div className="mt-6"><CleanResult report={report} /></div>
      )}

      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        scope: public source files · five high-signal checks
      </p>
    </section>
  );
}

// ─── How it works section ────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      icon: <Github size={22} strokeWidth={1.6} />,
      num: '01',
      title: 'Paste your public repo URL',
      desc: 'Drop in any public GitHub repository URL. No installation, no tokens, no permissions needed.',
    },
    {
      icon: <FileSearch size={22} strokeWidth={1.6} />,
      num: '02',
      title: 'We scan for five security patterns',
      desc: 'VibeGuard checks for RLS gaps, unauthenticated database writes, client-side service_role keys, unprotected SECURITY DEFINER functions, and committed .env files.',
    },
    {
      icon: <Lock size={22} strokeWidth={1.6} />,
      num: '03',
      title: 'Get a plain-English report',
      desc: 'Every finding includes a clear explanation, the exact file path, and the line number so you know exactly what to fix.',
    },
  ];

  return (
    <section id="how-it-works" className="mt-24 border-t border-border pt-16 pb-20">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
        <span className="inline-block h-px w-8 bg-primary" />
        How it works
      </div>
      <h2 className="mt-5 max-w-lg text-[28px] font-extrabold tracking-[-0.04em] sm:text-[36px]">
        Security checks in seconds, not sprints.
      </h2>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {steps.map((step) => (
          <div key={step.num} className="border border-border bg-card p-6">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center border border-primary/40 text-primary">
                {step.icon}
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/60">
                {step.num}
              </span>
            </div>
            <h3 className="mt-5 text-[16px] font-bold tracking-[-0.02em]">{step.title}</h3>
            <p className="mt-2 text-[13px] leading-5.5 text-muted-foreground">{step.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Home page ───────────────────────────────────────────────────────────────

function Home() {
  const { user, usage, usageLoading, refreshUsage } = useAuth();
  const [repoUrl, setRepoUrl] = useState('');
  const [validationError, setValidationError] = useState('');
  const [copied, setCopied] = useState(false);
  const [scanBlocked, setScanBlocked] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanMutation = useCreateScan();
  const report = scanMutation.data as ScanReport | undefined;
  const isScanning = scanMutation.isPending;
  const apiError = getErrorMessage(scanMutation.error);
  const canScan = useMemo(() => githubUrlPattern.test(repoUrl.trim()), [repoUrl]);

  const isUnlimited = user?.email === 'nightowlclub72@gmail.com';
  const isAtLimit = !isUnlimited && !usageLoading && usage != null && usage.scans_used >= usage.scans_limit;

  const runScan = async (url: string) => {
    const normalizedUrl = url.trim().replace(/\/$/, '');
    setValidationError('');
    setScanBlocked(false);
    setCopied(false);
    scanMutation.reset();

    // Re-fetch usage to get a fresh count before every scan
    await refreshUsage();

    // Re-check limit with latest data
    const { data: freshUsage } = await supabase
      .from('usage')
      .select('scans_used, scans_limit')
      .maybeSingle();

    if (!isUnlimited && freshUsage && freshUsage.scans_used >= freshUsage.scans_limit) {
      setScanBlocked(true);
      return;
    }

    scanMutation.mutate(
      { data: { repoUrl: normalizedUrl } },
      {
        onSuccess: async () => {
          // Increment scans_used after a successful scan
          if (usage) {
            await supabase
              .from('usage')
              .update({ scans_used: usage.scans_used + 1 })
              .eq('owner', usage.owner);
            await refreshUsage();
          }
        },
      }
    );
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!githubUrlPattern.test(repoUrl.trim())) {
      setValidationError('Enter a public GitHub URL, for example https://github.com/owner/repository');
      return;
    }
    runScan(repoUrl);
  };

  const handleRescan = () => runScan(report?.repoUrl ?? repoUrl);

  const handleCopy = async () => {
    if (!report) return;
    const text = [
      `VibeGuard report — ${report.repo}`,
      `Repository: ${report.repoUrl}`,
      `Scanned: ${formatDate(report.scannedAt)}`,
      `Files scanned: ${report.filesScanned}`,
      '',
      report.findings.length ? 'Findings:' : 'No high-signal issues found.',
      ...report.findings.map((f, i) =>
        `${i + 1}. [${f.severity}] ${f.title}\n   ${f.description}\n   ${f.filePath}:${f.line}`
      ),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch { setCopied(false); }
  };

  const showLanding = !report && !isScanning && !scanBlocked;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav />
      <main className="flex-1">
        <div className="vg-grid pointer-events-none absolute inset-x-0 top-0 h-[340px] opacity-50" />
        <div className="relative mx-auto w-full max-w-[1040px] px-5 sm:px-8">

          {/* ── Landing hero ── */}
          {showLanding && (
            <section className="vg-rise pb-4 pt-20 sm:pt-28">
              <div className="max-w-[760px]">
                <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                  <span className="inline-block h-px w-8 bg-primary" />
                  Next.js · Supabase · Security
                </div>
                <h1 className="mt-6 max-w-[720px] text-[42px] font-extrabold leading-[1.04] tracking-[-0.055em] sm:text-[64px]">
                  Catch the security bugs<br className="hidden sm:block" /> vibecoding tools miss —<br className="hidden sm:block" />
                  <span className="text-primary">before you ship.</span>
                </h1>
                <p className="mt-6 max-w-[560px] text-[16px] leading-7 text-muted-foreground sm:text-[17px]">
                  Five high-signal checks: missing RLS policies, unauthenticated database writes, client-side service keys, unprotected SECURITY DEFINER functions, and committed secrets — all in seconds.
                </p>

                {/* CTA: gated by auth */}
                {!user ? (
                  <div className="mt-10 flex flex-wrap items-center gap-3">
                    <Link
                      href="/auth?mode=signup"
                      className="vg-button vg-focus inline-flex items-center gap-3 border border-primary bg-primary px-5 py-3.5 text-[13px] font-bold text-primary-foreground hover:bg-primary/90"
                    >
                      <KeyRound size={16} strokeWidth={2} />
                      Sign up to scan — it's free
                      <ArrowRight size={15} />
                    </Link>
                    <Link
                      href="/auth?mode=signin"
                      className="vg-button vg-focus border border-border bg-card px-5 py-3.5 text-[13px] font-semibold text-foreground hover:border-primary/50"
                    >
                      Sign in
                    </Link>
                  </div>
                ) : isAtLimit ? (
                  <UpgradeWall />
                ) : (
                  <form className="mt-10 max-w-[680px]" onSubmit={handleSubmit}>
                    <label className="mb-2.5 block font-mono text-[10px] font-medium uppercase tracking-[0.14em]" htmlFor="repo-url">
                      Public GitHub URL
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className="relative min-w-0 flex-1">
                        <Github className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                          ref={inputRef}
                          id="repo-url"
                          type="url"
                          value={repoUrl}
                          onChange={(e) => { setRepoUrl(e.target.value); setValidationError(''); }}
                          placeholder="https://github.com/owner/repository"
                          className={`vg-focus h-12 w-full border bg-card pl-10 pr-4 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/60 ${validationError ? 'border-[#b56b5c]' : 'border-input focus:border-primary'}`}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isScanning || (!canScan && repoUrl.length > 0)}
                        className="vg-button vg-focus inline-flex h-12 items-center justify-center gap-2 bg-primary px-5 text-[13px] font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Scan repository <ArrowRight size={15} />
                      </button>
                    </div>
                    {validationError ? (
                      <p className="mt-2.5 flex items-center gap-2 text-[12px] text-[#963f34]">
                        <AlertCircle size={13} /> {validationError}
                      </p>
                    ) : (
                      <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        Public repositories only · read-only scan
                        {usage && (
                          <> · <span className="text-primary">{Math.max(0, usage.scans_limit - usage.scans_used)} scan{usage.scans_limit - usage.scans_used !== 1 ? 's' : ''} remaining</span></>
                        )}
                      </p>
                    )}
                  </form>
                )}

                {apiError && (
                  <div className="mt-5 flex max-w-[680px] items-start gap-3 border border-[#e5c8c1] bg-[#f6e9e5] p-4 text-[13px] leading-5 text-[#7f3a31]">
                    <AlertCircle className="mt-0.5 shrink-0" size={16} />
                    <div>
                      <p className="font-semibold">The scan could not be completed.</p>
                      <p className="mt-1 text-[#963f34]/80">{apiError || 'Check the repository URL and try again.'}</p>
                      <button className="vg-focus mt-3 font-semibold underline underline-offset-4 hover:text-[#602820]" onClick={() => runScan(repoUrl)} type="button">
                        Try again
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <HowItWorks />
            </section>
          )}

          {/* ── Scanning progress ── */}
          {isScanning && <ScanProgress />}

          {/* ── Upgrade wall after scan attempt ── */}
          {scanBlocked && !isScanning && (
            <section className="vg-rise pb-20 pt-10">
              <UpgradeWall />
            </section>
          )}

          {/* ── Results ── */}
          {report && !isScanning && (
            <Report copied={copied} onCopy={handleCopy} onRescan={handleRescan} report={report} />
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AuthProvider>
          <Router />
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}
