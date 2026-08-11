import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateScan, setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, Clipboard, Code2, Database,
  ExternalLink, Eye, FileSearch, FileWarning, Github, KeyRound, Lock,
  RefreshCw, ShieldCheck, ShieldOff, Terminal, Wifi, Zap, Heart
} from 'lucide-react';
import { motion } from 'framer-motion';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { ScanProgress } from '@/components/ScanProgress';
import { RepoPicker } from '@/components/RepoPicker';
import { ReportEnhancements } from '@/components/ReportEnhancements';

// Point the generated API client at the correct API server.
// On Replit dev the Vite proxy handles /api → localhost:8080 so this is empty.
// On Render set VITE_API_BASE_URL to the API service's origin.
const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
setBaseUrl(apiBase || null);

// Wire the Supabase session JWT into all generated API calls so the server
// can look up the user's GitHub token for private repository scanning.
setAuthTokenGetter(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
});
import AuthPage from '@/pages/AuthPage';
import PricingPage from '@/pages/PricingPage';
import TermsPage from '@/pages/TermsPage';
import PrivacyPage from '@/pages/PrivacyPage';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const githubUrlPattern = /^https:\/\/github\.com\/[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+\/?$/;

type FindingSeverity = 'Critical' | 'High' | 'Medium';
type Finding = {
  id: string; severity: FindingSeverity; title: string;
  description: string; filePath: string; line: number; check: string;
};
type ScanReport = {
  repo: string; repoUrl: string; findings: Finding[];
  filesScanned: number; scannedAt: string;
};

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('en', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(parsed);
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(dateStr);
}

const LAST_SCAN_KEY = (uid: string) => `vs_last_scan_${uid}`;

function saveLastScan(uid: string, report: ScanReport): void {
  try { localStorage.setItem(LAST_SCAN_KEY(uid), JSON.stringify(report)); } catch {}
}

function loadLastScan(uid: string): ScanReport | null {
  try {
    const raw = localStorage.getItem(LAST_SCAN_KEY(uid));
    return raw ? (JSON.parse(raw) as ScanReport) : null;
  } catch { return null; }
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
  const [liked, setLiked] = useState(false);
  const s = severityStyles(finding.severity);
  return (
    <article
      className="vg-rise border-b border-border p-5 transition-colors sm:p-7"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.13em] ${s.wash} ${s.border} ${s.label}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {finding.severity}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {finding.check.replaceAll('_', ' ')}
          </span>
          <button
            onClick={() => setLiked(!liked)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            type="button"
            aria-label="Like this finding"
          >
            <Heart size={14} className={liked ? 'fill-[#e85577] text-[#e85577]' : ''} />
          </button>
        </div>
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
      <div className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-[#aebe8c] bg-[#66763e]/[0.06] text-[#66763e]">
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
      <div className="flex h-10 w-10 items-center justify-center rounded-[9px] border border-[#d4a96a] bg-[#a06427]/[0.06] text-[#a06427]">
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

function BadgeSnippet({ report }: { report: ScanReport }) {
  const [copied, setCopied] = useState(false);
  const badgeUrl = `${window.location.origin}/api/badge/${report.repo}`;
  const markdown = `![VibeGuard](${badgeUrl})`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch { /* ignore */ }
  };

  return (
    <div className="mt-8 border border-border bg-card p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        README badge
      </p>
      <p className="mt-1.5 text-[13px] text-muted-foreground">
        Paste this into your README to show live scan status.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-none border border-border bg-muted px-3 py-2 font-mono text-[11px] text-foreground whitespace-nowrap">
          {markdown}
        </code>
        <button
          onClick={copy}
          type="button"
          className="vg-button vg-focus shrink-0 inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-[11px] font-semibold text-foreground hover:border-primary/50 hover:text-primary"
        >
          {copied ? <Check size={12} /> : <Clipboard size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <a
        href={badgeUrl}
        target="_blank"
        rel="noreferrer"
        className="vg-focus mt-2.5 inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground underline decoration-border underline-offset-4 hover:text-primary"
      >
        Preview badge image <ExternalLink size={10} />
      </a>
    </div>
  );
}

function Report({ report, onRescan, onCopy, copied, onBack }: {
  report: ScanReport; onRescan: () => void; onCopy: () => void; copied: boolean; onBack: () => void;
}) {
  return (
    <section className="vg-rise mt-10 pb-20">
      <div className="border-b border-border pb-6">
        <button
          onClick={onBack}
          className="vg-button vg-focus mb-6 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          type="button"
        >
          <ArrowLeft size={12} /> Back to home
        </button>
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
          <ReportEnhancements report={report} />
        </div>
      </div>

      {report.findings.length > 0 ? (
        <div className="mt-6 space-y-3">
          {report.findings.map((f, i) => <FindingCard finding={f} index={i} key={f.id} />)}
        </div>
      ) : (
        <div className="mt-6"><CleanResult report={report} /></div>
      )}

      <BadgeSnippet report={report} />

      <p className="mt-8 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        scope: public source files · 50 security checks
      </p>
    </section>
  );
}

// ─── Welcome shield (animated, plays once on mount) ──────────────────────────

function WelcomeShield() {
  return (
    <motion.div
      initial={{ scale: 0.55, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 20 }}
      className="inline-flex h-12 w-12 items-center justify-center rounded-[10px] border border-primary/40 bg-primary/[0.08] text-primary"
    >
      <ShieldCheck size={24} strokeWidth={1.7} />
    </motion.div>
  );
}

// ─── Last scan card ───────────────────────────────────────────────────────────

function LastScanCard({ scan, onView }: { scan: ScanReport; onView: () => void }) {
  const critical = scan.findings.filter(f => f.severity === 'Critical').length;
  const high     = scan.findings.filter(f => f.severity === 'High').length;
  const medium   = scan.findings.filter(f => f.severity === 'Medium').length;
  const total    = scan.findings.length;

  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (high > 0)     parts.push(`${high} high`);
  if (medium > 0)   parts.push(`${medium} medium`);

  return (
    <div className="mt-6 flex items-start justify-between gap-4 rounded-none border-b border-border pb-5">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Last scan · {formatRelativeTime(scan.scannedAt)}
        </p>
        <p className="mt-1 truncate text-[15px] font-bold tracking-[-0.02em] text-foreground">
          {scan.repo}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {total === 0
            ? 'No issues found'
            : `${total} ${total === 1 ? 'finding' : 'findings'}${parts.length > 0 ? ' — ' + parts.join(', ') : ''}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onView}
        className="vg-button vg-focus mt-1 shrink-0 inline-flex items-center gap-1.5 border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground hover:border-primary/50 hover:text-primary"
      >
        View report <ExternalLink size={10} />
      </button>
    </div>
  );
}

// ─── Trust bar ───────────────────────────────────────────────────────────────

function TrustBar() {
  const items = [
    { icon: <Lock size={12} strokeWidth={2} />, label: 'Read-only clone' },
    { icon: <ShieldCheck size={12} strokeWidth={2} />, label: 'No code stored' },
    { icon: <Eye size={12} strokeWidth={2} />, label: '50 security checks' },
    { icon: <Wifi size={12} strokeWidth={2} />, label: 'Results in seconds' },
  ];
  return (
    <div className="mt-10 flex flex-wrap items-center gap-y-3 border-t border-border pt-7">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center">
          {i > 0 && (
            <span className="mx-4 h-3.5 w-px bg-border/80" aria-hidden="true" />
          )}
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span className="text-primary">{item.icon}</span>
            {item.label}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─── Checks grid ─────────────────────────────────────────────────────────────

function ChecksGrid() {
  const checks = [
    {
      icon: <Database size={18} strokeWidth={1.6} />,
      severity: 'Critical',
      title: 'Missing RLS policies',
      desc: 'Tables without Row Level Security let any authenticated user read or write every row. A single missing policy exposes your entire dataset.',
    },
    {
      icon: <Wifi size={18} strokeWidth={1.6} />,
      severity: 'Critical',
      title: 'Unauthenticated database writes',
      desc: 'Supabase client calls made outside any auth guard allow anonymous users to insert or delete records freely.',
    },
    {
      icon: <KeyRound size={18} strokeWidth={1.6} />,
      severity: 'Critical',
      title: 'Client-side service_role key',
      desc: 'The service_role key bypasses all RLS policies. Shipping it in browser code hands every visitor full admin access to your database.',
    },
    {
      icon: <Terminal size={18} strokeWidth={1.6} />,
      severity: 'High',
      title: 'Unprotected SECURITY DEFINER',
      desc: 'Postgres functions marked SECURITY DEFINER run as their owner. Without an explicit search_path they are vulnerable to privilege escalation.',
    },
    {
      icon: <FileSearch size={18} strokeWidth={1.6} />,
      severity: 'High',
      title: 'Committed .env secrets',
      desc: 'Environment files checked into source control broadcast API keys, database passwords, and service tokens to anyone who can read the repo.',
    },
    {
      icon: <FileWarning size={18} strokeWidth={1.6} />,
      severity: 'High',
      title: 'Real credentials in .env.example',
      desc: '.env.example is meant to hold placeholders. When it contains real JWTs, live Stripe keys, or AWS credentials it silently leaks production secrets.',
    },
  ];

  const badgeColor: Record<string, string> = {
    Critical: 'text-[#963f34] bg-[#f6e9e5] border-[#e5c8c1]',
    High: 'text-[#a06427] bg-[#f8efe1] border-[#e7d3b3]',
  };

  return (
    <section className="relative -mx-5 mt-20 bg-[#0d0d0d] px-5 pb-14 pt-16 text-[#f4f1ea] sm:-mx-8 sm:px-8">
      <div className="mx-auto max-w-[1040px]">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#f4c842]">
        <span className="inline-block h-1.5 w-1.5 bg-[#f4c842]" />
        What VibeGuard catches
      </div>
      <h2 className="vg-display mt-5 max-w-lg text-[42px] leading-[.86] tracking-[0.01em] sm:text-[64px]">
        50 checks. The signals that actually matter.
      </h2>
      <p className="mt-4 max-w-[520px] text-[14px] leading-6 text-[#a4aaa3]">
        Fifty focused signals across database access, secrets, injection, dependencies, containers, browser APIs, and infrastructure patterns commonly introduced by AI-assisted development.
      </p>
      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {checks.map((check) => (
          <div key={check.title} className={`group border border-[#30302b] bg-[#121212] p-7 transition hover:border-[#f4c842]/70 hover:bg-[#181817] ${check.severity === 'Critical' ? 'border-t-2 border-t-[#e34a3b]' : 'border-t-2 border-t-[#f4c842]'}`}>
            <div className="flex items-start justify-between gap-2">
               <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#f4c842]/50 bg-[#f4c842]/10 text-[#f4c842] transition-colors group-hover:border-[#f4c842]">
                {check.icon}
              </div>
              <span className={`inline-flex items-center border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.12em] ${badgeColor[check.severity]}`}>
                {check.severity}
              </span>
            </div>
             <h3 className="mt-6 text-[15px] font-bold tracking-[-0.03em] leading-snug">{check.title}</h3>
             <p className="mt-2 text-[12px] leading-5 text-[#a4aaa3]">{check.desc}</p>
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}

// ─── Bottom CTA ──────────────────────────────────────────────────────────────

function BottomCTA() {
  return (
    <section className="relative mt-6 mb-20 overflow-hidden border-2 border-foreground bg-accent p-8 shadow-[6px_6px_0_hsl(var(--foreground))] sm:p-14">
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
        <span className="inline-block h-px w-8 bg-primary" />
        Free to start
      </div>
      <div className="mt-5 flex h-11 w-11 items-center justify-center rounded-[10px] border border-primary/40 bg-primary/[0.08] text-primary">
        <ShieldCheck size={22} strokeWidth={1.6} />
      </div>
      <h2 className="vg-display mt-4 max-w-xl text-[42px] leading-[.86] tracking-[0.01em] sm:text-[64px]">
        Ship with confidence.<br className="hidden sm:block" /> Catch the bugs before your users do.
      </h2>
      <p className="mt-3 max-w-lg text-[14px] leading-6 text-muted-foreground">
        No installation. No tokens. Paste a GitHub URL and get a security report in under 30 seconds. Free for your first scan.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href="/auth?mode=signup"
          className="vg-button vg-focus inline-flex items-center gap-2 border border-primary bg-primary px-5 py-3 text-[13px] font-bold text-primary-foreground hover:bg-primary/90"
        >
          <KeyRound size={15} strokeWidth={2} />
          Start scanning — it's free
          <ArrowRight size={14} />
        </a>
        <a
          href="/pricing"
          className="vg-button vg-focus border border-border bg-card px-5 py-3 text-[13px] font-semibold text-foreground hover:border-primary/50"
        >
          See pricing
        </a>
      </div>
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
      title: 'We scan for six security patterns',
      desc: 'VibeGuard checks for RLS gaps, unauthenticated database writes, client-side service_role keys, unprotected SECURITY DEFINER functions, committed .env secrets, and real credentials hidden in .env.example files.',
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
          <div key={step.num} className="border border-border bg-card p-7 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]">
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-[9px] border border-primary/40 bg-primary/[0.06] text-primary">
                {step.icon}
              </div>
              <span className="text-[32px] font-black text-primary/20 tracking-tighter leading-none">
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

// ─── Scan form (shared between logged-in states) ──────────────────────────────

function ScanForm({
  scanMode, setScanMode, hasGithubToken, session, isScanning,
  repoUrl, setRepoUrl, validationError, setValidationError,
  canScan, usage, inputRef, handleSubmit, runScan,
}: {
  scanMode: 'url' | 'picker';
  setScanMode: (m: 'url' | 'picker') => void;
  hasGithubToken: boolean | null;
  session: import('@supabase/supabase-js').Session | null;
  isScanning: boolean;
  repoUrl: string;
  setRepoUrl: (v: string) => void;
  validationError: string;
  setValidationError: (v: string) => void;
  canScan: boolean;
  usage: import('@/lib/supabase').UsageRow | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  runScan: (url: string) => void;
}) {
  const remaining = usage ? Math.max(0, usage.scans_limit - usage.scans_used) : null;

  return (
    <div className="mt-8 max-w-[720px]">
      {/* Scans remaining — visible right where user is about to act */}
      {remaining !== null && (
        <p className="mb-4 font-mono text-[11px] text-muted-foreground">
          <span className={`font-semibold ${remaining === 0 ? 'text-[#963f34]' : 'text-primary'}`}>
            {remaining}
          </span>{' '}
          scan{remaining !== 1 ? 's' : ''} remaining this month
        </p>
      )}

      {/* Mode toggle: paste URL or pick from connected repos */}
      <div className="flex w-full max-w-[360px] border-2 border-foreground bg-card p-0.5">
        <button
          type="button"
          onClick={() => setScanMode('url')}
          className={`vg-button vg-focus vg-tab flex-1 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${scanMode === 'url' ? 'bg-primary text-primary-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Paste URL
        </button>
        <button
          type="button"
          onClick={() => setScanMode('picker')}
          className={`vg-button vg-focus vg-tab flex-1 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${scanMode === 'picker' ? 'bg-primary text-primary-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          My repos
        </button>
      </div>

      {scanMode === 'url' ? (
        <form className="mt-4" onSubmit={handleSubmit}>
          <label className="mb-2.5 block font-mono text-[10px] font-medium uppercase tracking-[0.14em]" htmlFor="repo-url">
            GitHub repository URL
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
                className={`vg-focus vg-block-input h-14 w-full bg-card pl-11 pr-4 text-[14px] outline-none transition-colors placeholder:text-muted-foreground/60 ${validationError ? 'border-[#b56b5c]' : 'border-foreground focus:border-primary'}`}
              />
            </div>
            <button
              type="submit"
              disabled={isScanning || (!canScan && repoUrl.length > 0)}
              className="vg-button vg-focus vg-block-button inline-flex h-14 items-center justify-center gap-2 bg-primary px-5 text-[13px] font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-[172px]"
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
              Public &amp; private repositories · read-only scan
            </p>
          )}
        </form>
      ) : (
        <RepoPicker
          session={session}
          onSelect={(url) => runScan(url)}
          disabled={isScanning}
        />
      )}
    </div>
  );
}

// ─── Home page ───────────────────────────────────────────────────────────────

function Home() {
  const { user, session, usage, usageLoading, refreshUsage, hasGithubToken } = useAuth();
  const [, setLocation] = useLocation();
  const [repoUrl, setRepoUrl] = useState('');
  const [validationError, setValidationError] = useState('');
  const [copied, setCopied] = useState(false);
  const [scanBlocked, setScanBlocked] = useState(false);
  const [scanMode, setScanMode] = useState<'url' | 'picker'>('url');

  // Persisted last-scan card: loaded from localStorage, updated after each scan.
  const [lastScan, setLastScan] = useState<ScanReport | null>(null);
  // Allows restoring a saved scan into the report view without re-running the scan.
  const [restoredReport, setRestoredReport] = useState<ScanReport | null>(null);

  // Refs for one-time side-effects that shouldn't trigger re-renders.
  const didAutoPickerRef = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scanMutation = useCreateScan();
  const scanResult = scanMutation.data as ScanReport | undefined;
  // Unified display report: fresh scan takes priority, then restored from history.
  const displayReport = scanResult ?? restoredReport ?? undefined;
  const isScanning = scanMutation.isPending;
  const apiError = getErrorMessage(scanMutation.error);
  const canScan = useMemo(() => githubUrlPattern.test(repoUrl.trim()), [repoUrl]);

  const isUnlimited = user?.email === 'nightowlclub72@gmail.com';
  const isAtLimit = !isUnlimited && !usageLoading && usage != null && usage.scans_used >= usage.scans_limit;

  // Load last scan from localStorage when user changes.
  useEffect(() => {
    if (user?.id !== prevUserIdRef.current) {
      prevUserIdRef.current = user?.id ?? null;
      didAutoPickerRef.current = false; // reset tab auto-select on user change
    }
    if (user?.id) {
      setLastScan(loadLastScan(user.id));
    } else {
      setLastScan(null);
    }
  }, [user?.id]);

  // Default to "My Repos" tab if GitHub is connected (once per login).
  useEffect(() => {
    if (hasGithubToken === true && !didAutoPickerRef.current) {
      didAutoPickerRef.current = true;
      setScanMode('picker');
    }
    if (hasGithubToken === false && scanMode === 'picker') {
      setScanMode('url');
    }
  }, [hasGithubToken, scanMode]);

  const runScan = async (url: string) => {
    const normalizedUrl = url.trim().replace(/\/$/, '');
    setValidationError('');
    setScanBlocked(false);
    setCopied(false);
    setRestoredReport(null);
    scanMutation.reset();

    // Re-fetch usage to get a fresh count before every scan.
    await refreshUsage();

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
        onSuccess: async (rawData: unknown) => {
          // Save this scan to localStorage for the next-session last-scan card.
          const scanned = rawData as unknown as ScanReport;
          if (user?.id) {
            saveLastScan(user.id, scanned);
            setLastScan(scanned);
          }
          // Increment scans_used.
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

  const handleRescan = () => runScan(displayReport?.repoUrl ?? repoUrl);

  const handleReset = () => {
    scanMutation.reset();
    setRestoredReport(null);
    setRepoUrl('');
    setValidationError('');
    setScanBlocked(false);
    setCopied(false);
  };

  const handleViewLastScan = () => {
    if (lastScan) setRestoredReport(lastScan);
  };

  const handleCopy = async () => {
    if (!displayReport) return;
    const text = [
      `VibeGuard report — ${displayReport.repo}`,
      `Repository: ${displayReport.repoUrl}`,
      `Scanned: ${formatDate(displayReport.scannedAt)}`,
      `Files scanned: ${displayReport.filesScanned}`,
      '',
      displayReport.findings.length ? 'Findings:' : 'No high-signal issues found.',
      ...displayReport.findings.map((f, i) =>
        `${i + 1}. [${f.severity}] ${f.title}\n   ${f.description}\n   ${f.filePath}:${f.line}`
      ),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch { setCopied(false); }
  };

  // Derive first name from Supabase user metadata.
  const firstName = (
    user?.user_metadata?.full_name?.split(' ')[0] ||
    user?.user_metadata?.name?.split(' ')[0] ||
    user?.email?.split('@')[0] ||
    'there'
  ) as string;

  const showLanding = !displayReport && !isScanning && !scanBlocked;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Nav onReset={handleReset} />
      <main className="flex-1">
        <div className="vg-grid pointer-events-none absolute inset-x-0 top-0 h-[340px] opacity-50" />
        <div className="relative mx-auto w-full max-w-[1040px] px-5 sm:px-8">

          {/* ── Landing ── */}
          {showLanding && (
            <section className="vg-rise pb-4 pt-20 sm:pt-28">
              <div className="relative max-w-[820px]">

                {/* ── LOGGED-OUT: full marketing hero (unchanged) ── */}
                {!user && (
                  <>
                    <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                      <span className="inline-block h-1.5 w-1.5 bg-primary" />
                      GitHub · source security
                    </div>
                    <div className="pointer-events-none absolute -right-28 -top-24 hidden h-[270px] w-[480px] -rotate-[17deg] sm:block" aria-hidden="true">
                      <div className="absolute right-0 top-8 h-5 w-[430px] bg-primary" />
                      <div className="absolute right-[-18px] top-24 h-5 w-[430px] bg-accent" />
                      <div className="absolute right-[-36px] top-40 h-5 w-[430px] bg-foreground" />
                    </div>
                    <h1 className="vg-display relative mt-6 max-w-[790px] text-[58px] leading-[.84] tracking-[0.005em] sm:text-[104px]">
                      Catch the security bugs<br className="hidden sm:block" /> vibecoding tools miss —<br className="hidden sm:block" />
                      <span className="text-primary">before you ship.</span>
                    </h1>
                    <p className="mt-6 max-w-[560px] text-[16px] leading-7 text-muted-foreground sm:text-[17px]">
                      Six high-signal checks: missing RLS policies, unauthenticated database writes, client-side service keys, unprotected SECURITY DEFINER functions, committed secrets, and exposed credentials in <code className="font-mono text-[15px] text-foreground">.env.example</code> files — all in seconds.
                    </p>
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = new FormData(e.currentTarget).get('demo-url')?.toString();
                        if (val) setLocation(`/auth?mode=signup&url=${encodeURIComponent(val)}`);
                        else setLocation(`/auth?mode=signup`);
                      }}
                      className="mt-10 max-w-[640px]"
                    >
                      <div className="vg-block-input flex h-14 w-full items-center bg-card pl-4">
                        <Github size={20} className="text-foreground/60" />
                        <input
                          name="demo-url"
                          type="url"
                          placeholder="https://github.com/owner/repository"
                          className="h-full flex-1 bg-transparent px-3 text-[15px] text-foreground placeholder:text-foreground/40 focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="vg-button h-full border-l-2 border-foreground bg-primary px-8 text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                        >
                          Scan
                        </button>
                      </div>
                      <p className="mt-2 text-[12px] text-muted-foreground">
                        Free for logged-out preview · sign up for full results
                      </p>
                    </form>
                    <div className="mt-8 flex flex-wrap items-center gap-3">
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
                  </>
                )}

                {/* ── LOGGED-IN: personalized hero ── */}
                {user && (
                  <>
                    <WelcomeShield />
                    <h1 className="mt-5 text-[42px] font-extrabold leading-[1.04] tracking-[-0.055em] sm:text-[56px]">
                      Welcome back, {firstName}.
                    </h1>
                    <p className="mt-3 max-w-sm text-[16px] leading-6 text-muted-foreground">
                      Ready for your next scan?
                    </p>

                    {/* Last scan card — only shown if a previous scan exists */}
                    {lastScan && (
                      <LastScanCard scan={lastScan} onView={handleViewLastScan} />
                    )}

                    {isAtLimit ? (
                      <UpgradeWall />
                    ) : (
                      <ScanForm
                        scanMode={scanMode}
                        setScanMode={setScanMode}
                        hasGithubToken={hasGithubToken}
                        session={session}
                        isScanning={isScanning}
                        repoUrl={repoUrl}
                        setRepoUrl={setRepoUrl}
                        validationError={validationError}
                        setValidationError={setValidationError}
                        canScan={canScan}
                        usage={usage}
                        inputRef={inputRef}
                        handleSubmit={handleSubmit}
                        runScan={runScan}
                      />
                    )}
                  </>
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

              <TrustBar />
              <ChecksGrid />
              <HowItWorks />
              {/* BottomCTA only for logged-out visitors */}
              {!user && <BottomCTA />}
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
          {displayReport && !isScanning && (
            <Report copied={copied} onCopy={handleCopy} onRescan={handleRescan} report={displayReport} onBack={handleReset} />
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
