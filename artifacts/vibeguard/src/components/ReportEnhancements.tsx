import { useMemo, useState } from 'react';
import { Check, Clipboard, ShieldCheck, Wrench, ArrowRight } from 'lucide-react';

type Severity = 'Critical' | 'High' | 'Medium';
type Finding = {
  severity: Severity;
  title: string;
  description: string;
  filePath: string;
  line: number;
  check: string;
};

type ReportLike = { findings: Finding[]; filesScanned: number };

const TOTAL_CHECKS = 50;

function getScore(findings: Finding[]) {
  const unique = new Map<string, Finding>();
  for (const finding of findings) unique.set(`${finding.check}:${finding.filePath}:${finding.line}`, finding);

  let penalty = 0;
  for (const finding of unique.values()) {
    penalty += finding.severity === 'Critical' ? 18 : finding.severity === 'High' ? 10 : 4;
  }
  return Math.max(0, Math.min(100, 100 - penalty));
}

function remediation(finding: Finding) {
  const key = finding.check.toLowerCase();
  if (key.includes('rls')) return 'Enable Row Level Security and add least-privilege policies for each exposed table.';
  if (key.includes('service_role')) return 'Remove the service_role key from client code. Keep it server-side and rotate it if it was exposed.';
  if (key.includes('secret') || key.includes('credential') || key.includes('token') || key.includes('password')) return 'Move the credential to environment/secret storage, remove it from source control, and rotate it if it is real.';
  if (key.includes('cors')) return 'Replace wildcard origins with an explicit allowlist and only enable credentials for trusted origins.';
  if (key.includes('cookie')) return 'Review cookie flags and use Secure, HttpOnly, and an appropriate SameSite policy for sensitive sessions.';
  if (key.includes('eval') || key.includes('html') || key.includes('xss')) return 'Avoid dynamic HTML/code execution. Use safe DOM APIs or sanitize untrusted content before rendering.';
  if (key.includes('command') || key.includes('child_process')) return 'Avoid shell interpretation of user input. Validate arguments and use safe process APIs with strict allowlists.';
  if (key.includes('path')) return 'Resolve paths against a fixed directory and reject traversal outside the intended root.';
  if (key.includes('dependency')) return 'Pin the dependency to a reviewed version or immutable commit and update it deliberately.';
  if (key.includes('docker')) return 'Remove privileged host mounts such as the Docker socket unless strictly required and isolated.';
  if (key.includes('hash') || key.includes('random')) return 'Use a modern cryptographic primitive or CSPRNG designed for the security-sensitive operation.';
  return 'Review the highlighted code, remove the risky pattern, and verify the fix with a fresh VibeSane scan.';
}

export function ReportEnhancements({ report }: { report: ReportLike }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [allFixesCreated, setAllFixesCreated] = useState(false);
  const critical = report.findings.filter((f) => f.severity === 'Critical').length;
  const high = report.findings.filter((f) => f.severity === 'High').length;
  const medium = report.findings.filter((f) => f.severity === 'Medium').length;
  const score = useMemo(() => getScore(report.findings), [report.findings]);
  const passed = Math.max(0, TOTAL_CHECKS - new Set(report.findings.map((f) => f.check)).size);

  const scoreLabel = score >= 90 ? 'Strong' : score >= 70 ? 'Needs attention' : score >= 40 ? 'At risk' : 'Critical risk';

  const copyFix = async (finding: Finding) => {
    try {
      await navigator.clipboard.writeText(remediation(finding));
      setCopied(finding.title);
      window.setTimeout(() => setCopied(null), 2200);
    } catch {}
  };

  const createAllFixes = async () => {
    if (!report.findings.length) return;
    const plan = report.findings
      .map((finding, index) => `${index + 1}. ${finding.title}\n   ${finding.filePath}:${finding.line}\n   Fix: ${remediation(finding)}`)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(`VibeSane remediation plan\n\n${plan}`);
      setAllFixesCreated(true);
      window.setTimeout(() => setAllFixesCreated(false), 3000);
    } catch {}
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="border border-border bg-card p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Security score</p>
          <div className="mt-4 flex items-end gap-2"><span className="text-[54px] font-black leading-none tracking-[-0.07em]">{score}</span><span className="mb-1 font-mono text-[11px] text-muted-foreground">/100</span></div>
          <p className="mt-2 text-[12px] font-semibold text-foreground">{scoreLabel}</p>
          <div className="mt-5 h-2 overflow-hidden bg-muted"><div className="h-full bg-primary transition-all duration-700" style={{ width: `${score}%` }} /></div>
        </div>

        <div className="border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Security checks</p><p className="mt-1 text-[18px] font-bold tracking-[-0.025em]">{TOTAL_CHECKS} checks active</p></div><span className="font-mono text-[11px] text-muted-foreground">{report.filesScanned} files analyzed</span></div>
          <div className="mt-5 h-2 bg-muted"><div className="h-full bg-foreground transition-all duration-700" style={{ width: '100%' }} /></div>
          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.08em]"><span className="border border-[#e5c8c1] bg-[#f6e9e5] px-2 py-1 text-[#963f34]">{critical} critical</span><span className="border border-[#e7d3b3] bg-[#f8efe1] px-2 py-1 text-[#a06427]">{high} high</span><span className="border border-[#d2dbc1] bg-[#eef1e4] px-2 py-1 text-[#66763e]">{medium} medium</span><span className="border border-border bg-muted px-2 py-1 text-muted-foreground">{passed} no finding</span></div>
          <p className="mt-3 text-[12px] leading-5 text-muted-foreground">Every check is evaluated independently; a passed check means no matching evidence was found.</p>
        </div>
      </div>

      {report.findings.length > 0 && (
        <div className="border-2 border-foreground bg-[#f3efe4] p-6 shadow-[5px_5px_0_hsl(var(--foreground))] sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-foreground bg-primary text-primary-foreground shadow-[3px_3px_0_hsl(var(--foreground))]"><Wrench size={18} /></div>
              <div><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Remediation workspace</p><h2 className="mt-1.5 text-[21px] font-extrabold tracking-[-0.03em]">Fix everything in this scan.</h2><p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">Create one complete remediation plan for all {report.findings.length} findings, then review before applying.</p></div>
            </div>
            <button type="button" onClick={createAllFixes} className="vg-button vg-focus inline-flex min-h-12 shrink-0 items-center justify-center gap-2 border-2 border-foreground bg-primary px-5 py-3 text-[12px] font-bold text-primary-foreground shadow-[4px_4px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none">
              {allFixesCreated ? <Check size={15} /> : <Wrench size={15} />}
              {allFixesCreated ? 'Fix plan created' : 'Create all fixes'}
              {!allFixesCreated && <ArrowRight size={14} />}
            </button>
          </div>
          <p className="mt-4 border-t border-foreground/15 pt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Creates a reviewable remediation plan. Code changes are never applied silently.</p>
        </div>
      )}

      {report.findings.length > 0 && (
        <div className="border border-border bg-card p-6 sm:p-7">
          <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-primary" /><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Actionable remediation</p></div>
          <p className="mt-2 text-[14px] text-muted-foreground">Each finding below gets a concrete next step instead of a generic warning.</p>
          <div className="mt-5 divide-y divide-border border-t border-border">
            {report.findings.slice(0, 8).map((finding) => (
              <div key={`${finding.check}:${finding.filePath}:${finding.line}`} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-[13px] font-bold">{finding.title}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{finding.filePath}:{finding.line}</p></div><button type="button" onClick={() => copyFix(finding)} className="vg-button vg-focus inline-flex shrink-0 items-center gap-1.5 border border-border bg-background px-2.5 py-1.5 text-[10px] font-semibold hover:border-primary/50 hover:text-primary">{copied === finding.title ? <Check size={11} /> : <Clipboard size={11} />}{copied === finding.title ? 'Copied' : 'Copy fix'}</button></div>
                <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{remediation(finding)}</p>
              </div>
            ))}
          </div>
          {report.findings.length > 8 && <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">+ {report.findings.length - 8} more remediation steps below</p>}
        </div>
      )}
    </div>
  );
}
