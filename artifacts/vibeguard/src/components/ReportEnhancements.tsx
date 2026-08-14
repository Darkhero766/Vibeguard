import { useMemo, useState } from 'react';
import { Check, Clipboard, ShieldCheck } from 'lucide-react';

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
  for (const finding of findings) {
    unique.set(`${finding.check}:${finding.filePath}:${finding.line}`, finding);
  }

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

function buildFixPrompt(findings: Finding[]) {
  const items = findings.map((finding, index) => [
    `${index + 1}. [${finding.severity}] ${finding.title}`,
    `   Check: ${finding.check}`,
    `   Location: ${finding.filePath}:${finding.line}`,
    `   Evidence: ${finding.description}`,
    `   Required fix: ${remediation(finding)}`,
  ].join('\n')).join('\n\n');

  return `Fix all security findings identified by VibeSane in this repository.\n\nIMPORTANT:\n- Inspect the actual code before changing anything.\n- Fix every finding listed below, not just the first one.\n- Make the smallest safe changes necessary and do not break existing functionality.\n- Follow least-privilege and secure-by-default practices.\n- Do not expose, hard-code, or commit secrets.\n- If a credential has been exposed, remove it from source and recommend/perform rotation where appropriate.\n- Preserve the application's intended behavior.\n- After making the fixes, run the relevant tests/typechecks/build and resolve any regressions.\n- Summarize exactly what was changed and any remaining risk.\n\nFINDINGS TO FIX:\n\n${items}`;
}

export function ReportEnhancements({ report }: { report: ReportLike }) {
  const [copied, setCopied] = useState(false);
  const critical = report.findings.filter((f) => f.severity === 'Critical').length;
  const high = report.findings.filter((f) => f.severity === 'High').length;
  const medium = report.findings.filter((f) => f.severity === 'Medium').length;
  const score = useMemo(() => getScore(report.findings), [report.findings]);
  const passed = Math.max(0, TOTAL_CHECKS - new Set(report.findings.map((f) => f.check)).size);
  const scoreLabel = score >= 90 ? 'Strong' : score >= 70 ? 'Needs attention' : score >= 40 ? 'At risk' : 'Critical risk';

  const copyFixPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildFixPrompt(report.findings));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {}
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <div className="border border-border bg-card p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Security score</p>
          <div className="mt-4 flex items-end gap-2">
            <span className="text-[54px] font-black leading-none tracking-[-0.07em]">{score}</span>
            <span className="mb-1 font-mono text-[11px] text-muted-foreground">/100</span>
          </div>
          <p className="mt-2 text-[12px] font-semibold text-foreground">{scoreLabel}</p>
          <div className="mt-5 h-2 overflow-hidden bg-muted">
            <div className="h-full bg-primary transition-all duration-700" style={{ width: `${score}%` }} />
          </div>
        </div>

        <div className="border border-border bg-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Security checks</p>
              <p className="mt-1 text-[18px] font-bold tracking-[-0.025em]">{TOTAL_CHECKS} checks active</p>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">{report.filesScanned} files analyzed</span>
          </div>
          <div className="mt-5 h-2 bg-muted">
            <div className="h-full bg-foreground transition-all duration-700" style={{ width: '100%' }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-[0.08em]">
            <span className="border border-[#e5c8c1] bg-[#f6e9e5] px-2 py-1 text-[#963f34]">{critical} critical</span>
            <span className="border border-[#e7d3b3] bg-[#f8efe1] px-2 py-1 text-[#a06427]">{high} high</span>
            <span className="border border-[#d2dbc1] bg-[#eef1e4] px-2 py-1 text-[#66763e]">{medium} medium</span>
            <span className="border border-border bg-muted px-2 py-1 text-muted-foreground">{passed} no finding</span>
          </div>
          <p className="mt-3 text-[12px] leading-5 text-muted-foreground">Every check is evaluated independently; a passed check means no matching evidence was found.</p>
        </div>
      </div>

      {report.findings.length > 0 && (
        <div className="relative overflow-hidden border-2 border-foreground bg-card p-6 shadow-[5px_5px_0_hsl(var(--foreground))] sm:p-8">
          <div className="absolute right-[-30px] top-[-30px] h-28 w-28 rounded-full border border-primary/20" />
          <div className="absolute right-[-10px] top-[-10px] h-16 w-16 rounded-full border border-primary/20" />

          <div className="relative">
            <div className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-primary" />
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Fix all findings</p>
            </div>
            <h3 className="mt-4 text-[24px] font-black tracking-[-0.04em] sm:text-[30px]">One prompt. Every fix.</h3>
            <p className="mt-2 max-w-xl text-[13px] leading-5 text-muted-foreground">
              We bundle all {report.findings.length} findings, exact file locations, evidence, and concrete remediation instructions into one prompt you can paste into your coding agent.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="border border-[#e5c8c1] bg-[#f6e9e5] px-3 py-2.5"><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#963f34]">Critical</p><p className="mt-1 text-lg font-black text-[#963f34]">{critical}</p></div>
              <div className="border border-[#e7d3b3] bg-[#f8efe1] px-3 py-2.5"><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#a06427]">High</p><p className="mt-1 text-lg font-black text-[#a06427]">{high}</p></div>
              <div className="border border-[#d2dbc1] bg-[#eef1e4] px-3 py-2.5"><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#66763e]">Medium</p><p className="mt-1 text-lg font-black text-[#66763e]">{medium}</p></div>
              <div className="border border-border bg-muted px-3 py-2.5"><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Files</p><p className="mt-1 text-lg font-black">{report.filesScanned}</p></div>
            </div>

            <button
              type="button"
              onClick={copyFixPrompt}
              className="vg-button vg-focus mt-7 flex w-full items-center justify-center gap-2 border-2 border-foreground bg-primary px-5 py-4 text-[14px] font-black text-primary-foreground shadow-[5px_5px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 active:translate-x-[5px] active:translate-y-[5px] active:shadow-none"
            >
              {copied ? <Check size={17} /> : <Clipboard size={17} />}
              {copied ? 'Complete fix prompt copied' : 'Copy complete fix prompt'}
            </button>
            <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Includes every finding · file + line · evidence · remediation</p>
          </div>
        </div>
      )}
    </div>
  );
}
