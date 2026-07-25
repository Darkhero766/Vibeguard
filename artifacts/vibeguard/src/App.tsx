import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateScan } from '@workspace/api-client-react';
import { AlertCircle, ArrowRight, Check, Clipboard, ExternalLink, Github, RefreshCw, ShieldCheck, Wifi } from 'lucide-react';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { Route, Router as WouterRouter, Switch } from 'wouter';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const githubUrlPattern = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/;

type FindingSeverity = 'Critical' | 'High' | 'Medium';

type Finding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  description: string;
  filePath: string;
  line: number;
  check: string;
};

type ScanReport = {
  repo: string;
  repoUrl: string;
  findings: Finding[];
  filesScanned: number;
  scannedAt: string;
};

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const response = error as { error?: string; message?: string; data?: { error?: string }; response?: { data?: { error?: string } } };
    return response.data?.error ?? response.response?.data?.error ?? response.error ?? response.message;
  }
  return undefined;
}

function severityStyles(severity: FindingSeverity) {
  if (severity === 'Critical') {
    return {
      label: 'text-[#963f34]',
      dot: 'bg-[#963f34]',
      wash: 'bg-[#f6e9e5]',
      border: 'border-[#e5c8c1]',
    };
  }
  if (severity === 'High') {
    return {
      label: 'text-[#a06427]',
      dot: 'bg-[#a06427]',
      wash: 'bg-[#f8efe1]',
      border: 'border-[#e7d3b3]',
    };
  }
  return {
    label: 'text-[#66763e]',
    dot: 'bg-[#66763e]',
    wash: 'bg-[#eef1e4]',
    border: 'border-[#d2dbc1]',
  };
}

function Header() {
  return (
    <header className="flex items-center justify-between border-b border-border/80 py-5">
      <div className="flex items-center gap-3" data-testid="brand-vibeguard">
        <span className="relative flex h-7 w-7 items-center justify-center border border-primary/50 text-primary">
          <span className="absolute h-3 w-3 border border-primary" />
          <span className="h-1 w-1 bg-primary" />
        </span>
        <span className="text-[15px] font-extrabold tracking-[-0.03em]">VibeGuard</span>
        <span className="hidden border-l border-border pl-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
          repository audit
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground" data-testid="status-ready">
        <span className="h-1.5 w-1.5 rounded-full bg-[#66763e]" />
        scanner ready
      </div>
    </header>
  );
}

function ScanSkeleton() {
  return (
    <section className="vg-rise mt-16" aria-label="Scanning repository" data-testid="state-scanning">
      <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        reading public repository
      </div>
      <div className="mt-8 space-y-3">
        {[0, 1, 2].map((item) => (
          <div className="border border-border bg-card p-6" key={item} data-testid={`skeleton-finding-${item}`}>
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

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const styles = severityStyles(finding.severity);
  return (
    <article
      className="vg-rise border border-border bg-card p-5 transition-colors duration-200 hover:border-primary/40 sm:p-7"
      style={{ animationDelay: `${index * 70}ms` }}
      data-testid={`card-finding-${finding.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.13em] ${styles.wash} ${styles.border} ${styles.label}`} data-testid={`severity-${finding.id}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
          {finding.severity}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {finding.check.replaceAll('_', ' ')}
        </span>
      </div>
      <h3 className="mt-6 max-w-2xl text-[19px] font-bold leading-[1.25] tracking-[-0.025em] text-foreground sm:text-[21px]" data-testid={`finding-title-${finding.id}`}>
        {finding.title}
      </h3>
      <p className="mt-3 max-w-2xl text-[14px] leading-6 text-muted-foreground" data-testid={`finding-description-${finding.id}`}>
        {finding.description}
      </p>
      <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/75 pt-4 font-mono text-[11px] text-muted-foreground">
        <span className="flex items-center gap-2" data-testid={`finding-file-${finding.id}`}>
          <span className="text-primary">file</span>
          <span className="break-all text-foreground/75">{finding.filePath}</span>
        </span>
        <span data-testid={`finding-line-${finding.id}`}>
          <span className="text-primary">line</span> {finding.line}
        </span>
      </div>
    </article>
  );
}

function CleanResult({ report }: { report: ScanReport }) {
  return (
    <div className="vg-rise border border-[#d2dbc1] bg-[#f1f4e9] p-8 sm:p-10" data-testid="state-clean">
      <div className="flex h-10 w-10 items-center justify-center border border-[#aebe8c] text-[#66763e]">
        <ShieldCheck size={21} strokeWidth={1.6} />
      </div>
      <h2 className="mt-7 text-[25px] font-bold tracking-[-0.035em] text-foreground" data-testid="text-clean-title">
        No high-signal issues found.
      </h2>
      <p className="mt-3 max-w-xl text-[14px] leading-6 text-muted-foreground">
        VibeGuard checked the three security patterns in this repository and did not find anything to report.
      </p>
      <div className="mt-8 flex flex-wrap gap-5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#66763e]" data-testid="text-clean-meta">
        <span>{report.filesScanned} files scanned</span>
        <span>•</span>
        <span>clear result</span>
      </div>
    </div>
  );
}

function Report({ report, onRescan, onCopy, copied }: { report: ScanReport; onRescan: () => void; onCopy: () => void; copied: boolean }) {
  const findingCount = report.findings.length;
  return (
    <section className="vg-rise mt-16 pb-20" data-testid="section-report">
      <div className="border-b border-border pb-8">
        <div className="flex flex-wrap items-start justify-between gap-7">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-[#66763e]" />
              scan complete
            </div>
            <h1 className="mt-5 break-all text-[28px] font-bold leading-tight tracking-[-0.04em] sm:text-[36px]" data-testid="text-report-repo">
              {report.repo}
            </h1>
            <a
              className="vg-focus mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
              href={report.repoUrl}
              rel="noreferrer"
              target="_blank"
              data-testid="link-report-repository"
            >
              {report.repoUrl.replace(/^https:\/\/github\.com\//, '')}
              <ExternalLink size={12} />
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="vg-button vg-focus inline-flex items-center gap-2 border border-border bg-card px-3.5 py-2.5 text-[12px] font-semibold text-foreground hover:border-primary/50 hover:text-primary" onClick={onCopy} type="button" data-testid="button-copy-report">
              {copied ? <Check size={14} /> : <Clipboard size={14} />}
              {copied ? 'Copied' : 'Copy report as text'}
            </button>
            <button className="vg-button vg-focus inline-flex items-center gap-2 border border-primary bg-primary px-3.5 py-2.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90" onClick={onRescan} type="button" data-testid="button-rescan">
              <RefreshCw size={14} />
              Re-scan
            </button>
          </div>
        </div>
        <div className="mt-9 flex flex-wrap gap-x-7 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground" data-testid="text-report-meta">
          <span>{report.filesScanned} files scanned</span>
          <span>{findingCount} {findingCount === 1 ? 'finding' : 'findings'}</span>
          <span>checked {formatDate(report.scannedAt)}</span>
        </div>
      </div>
      {findingCount > 0 ? (
        <div className="mt-7 space-y-3" data-testid="list-findings">
          {report.findings.map((finding, index) => <FindingCard finding={finding} index={index} key={finding.id} />)}
        </div>
      ) : (
        <div className="mt-7">
          <CleanResult report={report} />
        </div>
      )}
      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground" data-testid="text-report-scope">
        scope: public source files · three high-signal checks
      </p>
    </section>
  );
}

function Home() {
  const [repoUrl, setRepoUrl] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scanMutation = useCreateScan();
  const report = scanMutation.data as ScanReport | undefined;
  const isScanning = scanMutation.isPending;
  const apiError = getErrorMessage(scanMutation.error);
  const canScan = useMemo(() => githubUrlPattern.test(repoUrl.trim()), [repoUrl]);

  const revealInput = () => {
    setShowInput(true);
    window.setTimeout(() => inputRef.current?.focus(), 40);
  };

  const runScan = (url: string) => {
    const normalizedUrl = url.trim().replace(/\/$/, '');
    setValidationError('');
    setCopied(false);
    scanMutation.reset();
    scanMutation.mutate({ data: { repoUrl: normalizedUrl } });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      ...report.findings.map((finding, index) => `${index + 1}. [${finding.severity}] ${finding.title}\n   ${finding.description}\n   ${finding.filePath}:${finding.line}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  };

  const showLanding = !report && !isScanning;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div className="vg-grid pointer-events-none absolute inset-x-0 top-0 h-[390px] opacity-60" />
      <div className="relative mx-auto w-full max-w-[1040px] px-5 sm:px-8">
        <Header />
        {showLanding ? (
          <section className="vg-rise pb-24 pt-24 sm:pt-32" data-testid="section-entry">
            <div className="max-w-[760px]">
              <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary" data-testid="text-kicker">
                <span className="inline-block h-px w-8 bg-primary" />
                Next.js + Supabase
              </div>
              <h1 className="mt-7 max-w-[720px] text-[44px] font-extrabold leading-[1.03] tracking-[-0.06em] text-foreground sm:text-[68px]" data-testid="text-headline">
                Find the issues<br className="hidden sm:block" /> that matter first.
              </h1>
              <p className="mt-7 max-w-[570px] text-[16px] leading-7 text-muted-foreground sm:text-[17px]">
                A focused security read for public Next.js and Supabase repositories. No noise, just three high-signal checks in seconds.
              </p>
              {!showInput ? (
                <button className="vg-button vg-focus mt-10 inline-flex items-center gap-3 border border-primary bg-primary px-5 py-3.5 text-[13px] font-bold text-primary-foreground hover:bg-primary/90" onClick={revealInput} type="button" data-testid="button-connect-repo">
                  <Github size={17} strokeWidth={1.8} />
                  Connect GitHub repo
                  <ArrowRight size={15} />
                </button>
              ) : (
                <form className="mt-10 max-w-[690px]" onSubmit={handleSubmit} data-testid="form-scan">
                  <label className="mb-2.5 block font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-foreground" htmlFor="repo-url">
                    Public GitHub URL
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative min-w-0 flex-1">
                      <Github className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
                      <input
                        ref={inputRef}
                        className={`vg-focus h-12 w-full border bg-card pl-11 pr-4 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/65 ${validationError ? 'border-[#b56b5c]' : 'border-input focus:border-primary'}`}
                        id="repo-url"
                        onChange={(event) => { setRepoUrl(event.target.value); setValidationError(''); }}
                        placeholder="https://github.com/owner/repository"
                        type="url"
                        value={repoUrl}
                        data-testid="input-repo-url"
                      />
                    </div>
                    <button className="vg-button vg-focus inline-flex h-12 items-center justify-center gap-2 bg-primary px-5 text-[13px] font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45" disabled={isScanning || (!canScan && repoUrl.length > 0)} type="submit" data-testid="button-submit-scan">
                      Scan repository
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  {validationError ? (
                    <p className="mt-2.5 flex items-center gap-2 text-[12px] text-[#963f34]" data-testid="error-invalid-url">
                      <AlertCircle size={14} />
                      {validationError}
                    </p>
                  ) : (
                    <p className="mt-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground" data-testid="text-url-hint">
                      Public repositories only · read-only scan
                    </p>
                  )}
                </form>
              )}
              {apiError ? (
                <div className="mt-5 flex max-w-[690px] items-start gap-3 border border-[#e5c8c1] bg-[#f6e9e5] p-4 text-[13px] leading-5 text-[#7f3a31]" data-testid="error-api">
                  <AlertCircle className="mt-0.5 shrink-0" size={16} />
                  <div>
                    <p className="font-semibold">The scan could not be completed.</p>
                    <p className="mt-1 text-[#963f34]/80">{apiError || 'Check the repository URL and try again.'}</p>
                    <button className="vg-focus mt-3 font-semibold underline underline-offset-4 hover:text-[#602820]" onClick={() => runScan(repoUrl)} type="button" data-testid="button-retry-scan">
                      Try again
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-28 grid max-w-[760px] grid-cols-1 border-y border-border sm:grid-cols-3" data-testid="text-scan-scope">
              <div className="border-b border-border py-5 sm:border-b-0 sm:border-r sm:pr-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">01 / inspect</div>
                <p className="mt-2 text-[13px] leading-5 text-muted-foreground">Public source, no repository changes.</p>
              </div>
              <div className="border-b border-border py-5 sm:border-b-0 sm:px-6 sm:border-r">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">02 / identify</div>
                <p className="mt-2 text-[13px] leading-5 text-muted-foreground">Three concrete checks, clearly explained.</p>
              </div>
              <div className="py-5 sm:pl-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">03 / act</div>
                <p className="mt-2 text-[13px] leading-5 text-muted-foreground">File paths and lines to guide the fix.</p>
              </div>
            </div>
          </section>
        ) : isScanning ? (
          <ScanSkeleton />
        ) : report ? (
          <Report copied={copied} onCopy={handleCopy} onRescan={handleRescan} report={report} />
        ) : null}
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border py-6 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground" data-testid="footer">
          <span>VibeGuard / focused by design</span>
          <span className="flex items-center gap-2"><Wifi size={12} /> read-only · public source</span>
        </footer>
      </div>
    </main>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
