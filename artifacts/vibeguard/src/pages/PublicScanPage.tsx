import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Github, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

const githubUrlPattern = /^https:\/\/github\.com\/[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+\/?$/;

type FindingSeverity = 'Critical' | 'High' | 'Medium';
type Finding = { id: string; severity: FindingSeverity; title: string; description: string; filePath: string; line: number; check: string };
type ScanReport = { repo: string; repoUrl: string; findings: Finding[]; filesScanned: number; scannedAt: string };

function severityClass(severity: FindingSeverity) {
  if (severity === 'Critical') return 'border-[#e5c8c1] bg-[#f6e9e5] text-[#963f34]';
  if (severity === 'High') return 'border-[#e7d3b3] bg-[#f8efe1] text-[#a06427]';
  return 'border-[#d2dbc1] bg-[#eef1e4] text-[#66763e]';
}

export default function PublicScanPage() {
  const { session, usage, usageLoading, refreshUsage } = useAuth();
  const [repoUrl, setRepoUrl] = useState('');
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const startedQueryScan = useRef(false);
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
  const canScan = useMemo(() => githubUrlPattern.test(repoUrl.trim()), [repoUrl]);
  const publicUsed = Number(usage?.public_scans_used ?? 0);
  const publicLimit = Number(usage?.public_scans_limit ?? (usage?.plan === 'pro' ? 5 : 0));
  const publicRemaining = Math.max(0, publicLimit - publicUsed);

  const runScan = async (event?: FormEvent, repoOverride?: string) => {
    event?.preventDefault();
    const normalizedUrl = (repoOverride ?? repoUrl).trim().replace(/\/$/, '');
    if (!githubUrlPattern.test(normalizedUrl)) { setError('Enter a valid public GitHub repository URL.'); return; }
    if (!session?.access_token) { setError('Your session expired. Sign in again and retry.'); return; }

    setError('');
    setReport(null);
    setRepoUrl(normalizedUrl);
    setScanning(true);
    try {
      const response = await fetch(`${apiBase}/api/scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ repoUrl: normalizedUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'The public repository scan could not be completed.');
      setReport(payload as ScanReport);
      // The server consumes the public bucket only after a successful scan.
      // Refresh the authoritative Supabase usage row so the remaining-credit UI
      // changes immediately instead of waiting for a page refresh/navigation.
      await refreshUsage();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'The public repository scan could not be completed.');
    } finally {
      setScanning(false);
    }
  };

  // A Paste URL submission navigates to /scan-public?repo=... . Start the
  // dedicated scan here and remove the query immediately so refreshing this
  // page cannot accidentally trigger another paid/public scan.
  useEffect(() => {
    if (startedQueryScan.current) return;
    const params = new URLSearchParams(window.location.search);
    const queryRepo = params.get('repo')?.trim().replace(/\/$/, '');
    if (!queryRepo || !githubUrlPattern.test(queryRepo)) return;
    if (!session?.access_token) return;

    startedQueryScan.current = true;
    window.history.replaceState(null, '', '/scan-public');
    setRepoUrl(queryRepo);
    void runScan(undefined, queryRepo);
  }, [session?.access_token]);

  const findings = report?.findings ?? [];
  const critical = findings.filter((f) => f.severity === 'Critical').length;
  const high = findings.filter((f) => f.severity === 'High').length;
  const medium = findings.filter((f) => f.severity === 'Medium').length;
  const clean = report != null && findings.length === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="mx-auto max-w-[1040px] px-5 pb-20 pt-12 sm:px-8 sm:pt-16">
        <Link href="/" className="vg-focus inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-primary">
          <ArrowLeft size={13} /> Back to security center
        </Link>

        <header className="mt-8 max-w-3xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Public repository scan</p>
          <h1 className="mt-3 text-[34px] font-bold tracking-[-0.045em] sm:text-[48px]">Scan a repository without protecting it.</h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">Paste a public GitHub URL for a one-time security scan. This result is temporary and is not added to your protected repositories or saved as repository history.</p>
        </header>

        <section className="mt-10 border-2 border-foreground bg-card p-5 shadow-[5px_5px_0_hsl(var(--foreground))] sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">One-time public scan</p>
              <p className="mt-2 text-[14px] text-muted-foreground">{usageLoading ? 'Checking your scan allowance…' : `${publicRemaining} of ${publicLimit} public scans remaining this month`}</p>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Protected repos are unaffected</div>
          </div>

          <form onSubmit={runScan} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Github className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={17} />
              <input value={repoUrl} onChange={(e) => { setRepoUrl(e.target.value); setError(''); }} placeholder="https://github.com/owner/repository" disabled={scanning} className="vg-focus h-14 w-full border-2 border-foreground bg-background pl-11 pr-4 text-[14px] outline-none focus:border-primary disabled:opacity-60" />
            </div>
            <button type="submit" disabled={!canScan || scanning || (!usageLoading && publicRemaining <= 0)} className="vg-button vg-focus inline-flex h-14 items-center justify-center gap-2 border-2 border-foreground bg-primary px-6 text-[13px] font-bold text-primary-foreground shadow-[3px_3px_0_hsl(var(--foreground))] disabled:cursor-not-allowed disabled:opacity-45">
              {scanning ? <><Loader2 size={15} className="animate-spin" /> Scanning…</> : <>Scan public repository <ArrowRight size={15} /></>}
            </button>
          </form>
          {error && <p className="mt-3 text-[12px] text-[#963f34]">{error}</p>}
        </section>

        {scanning && (
          <section className="mt-8 border-2 border-foreground bg-foreground p-7 text-background shadow-[5px_5px_0_hsl(var(--primary))] sm:p-9">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-primary/40 bg-primary/10 text-primary"><Loader2 size={21} className="animate-spin" /></div>
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Live public scan</p>
                <h2 className="mt-2 break-all text-[22px] font-bold">{repoUrl.replace(/^https:\/\/github\.com\//, '')}</h2>
                <p className="mt-3 text-[13px] leading-6 text-background/65">Reading the public repository → running security checks → preparing your temporary report.</p>
              </div>
            </div>
            <div className="mt-7 h-1.5 overflow-hidden bg-background/10"><div className="h-full w-2/3 animate-pulse bg-primary" /></div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[9px] uppercase tracking-[0.12em] text-background/45"><span>URL validated</span><span>Repository read</span><span>Security analysis running</span></div>
          </section>
        )}

        {report && !scanning && (
          <section className="mt-8 border-2 border-foreground bg-card shadow-[5px_5px_0_hsl(var(--foreground))]">
            <div className="border-b border-border p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-primary">Temporary scan result</p>
                  <h2 className="mt-3 break-all text-[26px] font-bold tracking-[-0.035em]">{report.repo}</h2>
                  <a href={report.repoUrl} target="_blank" rel="noreferrer" className="vg-focus mt-2 inline-flex max-w-full items-center gap-1.5 break-all font-mono text-[10px] text-muted-foreground underline underline-offset-4 hover:text-primary">{report.repoUrl}<ExternalLink size={11} /></a>
                </div>
                <div className={`flex h-14 w-14 items-center justify-center border ${clean ? 'border-[#aebe8c] bg-[#eef1e4] text-[#66763e]' : 'border-[#e5c8c1] bg-[#f6e9e5] text-[#963f34]'}`}>{clean ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}</div>
              </div>

              <div className="mt-7 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
                <div className="bg-card p-4"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Files</p><p className="mt-2 text-[22px] font-bold">{report.filesScanned}</p></div>
                <div className="bg-card p-4"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Findings</p><p className="mt-2 text-[22px] font-bold">{findings.length}</p></div>
                <div className="bg-card p-4"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Critical</p><p className="mt-2 text-[22px] font-bold">{critical}</p></div>
                <div className="bg-card p-4"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">High</p><p className="mt-2 text-[22px] font-bold">{high}</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2"><span className="border border-[#e7d3b3] bg-[#f8efe1] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#a06427]">{medium} medium</span><span className="border border-border bg-background px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">not saved to repository history</span></div>
            </div>

            {clean ? <div className="p-7 sm:p-8"><h3 className="text-[22px] font-bold">No high-signal issues found.</h3><p className="mt-2 text-[14px] leading-6 text-muted-foreground">The public repository completed its one-time scan cleanly. This report is temporary and is not turned into a protected repository.</p></div> : <>
              <div className="border-b border-border bg-[#f6e9e5] p-5 sm:p-6"><p className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#963f34]">Security findings</p><p className="mt-2 text-[13px] text-[#7f3a31]">Review these findings now. Nothing from this public scan is added to your protected-repository history.</p></div>
              <div>{findings.map((finding) => <article key={finding.id} className="border-b border-border p-6 last:border-b-0 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><span className={`border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${severityClass(finding.severity)}`}>{finding.severity}</span><span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{finding.check.replaceAll('_', ' ')}</span></div><h3 className="mt-4 text-[18px] font-bold">{finding.title}</h3><p className="mt-2 text-[13px] leading-6 text-muted-foreground">{finding.description}</p><p className="mt-5 font-mono text-[10px] text-muted-foreground"><span className="text-primary">file</span> {finding.filePath} <span className="ml-4 text-primary">line</span> {finding.line}</p></article>)}</div>
              <div className="flex flex-wrap gap-3 border-t border-border p-6 sm:p-7"><Link href="/" className="vg-button inline-flex items-center gap-2 border border-foreground bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground">Back to security center <ArrowRight size={14} /></Link><button type="button" onClick={() => { setReport(null); setRepoUrl(''); window.history.replaceState(null, '', '/scan-public'); }} className="vg-button inline-flex items-center gap-2 border border-border bg-card px-4 py-2.5 text-[12px] font-semibold hover:border-primary/50">Scan another public repo</button></div>
            </>}
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
