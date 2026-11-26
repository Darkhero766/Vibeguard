import { useState } from 'react';
import { ArrowLeft, ExternalLink, FileCode2, ListChecks, ShieldCheck } from 'lucide-react';
import { FindingDetail } from './FindingDetail';

type Finding = {
  severity: 'Critical' | 'High' | 'Medium';
  title: string;
  description?: string;
  filePath: string;
  line: number | null;
  check?: string;
};

type RepositorySecurityCenterProps = {
  repo: string;
  repoUrl: string;
  score: number;
  findings: Finding[];
  filesScanned: number;
  checksRun?: number;
  coverageComplete?: boolean;
  scannedAt: string;
  protected?: boolean;
  onBack: () => void;
};

function severityClass(severity: Finding['severity']) {
  if (severity === 'Critical') return 'border-[#e5c8c1] bg-[#f6e9e5] text-[#963f34]';
  if (severity === 'High') return 'border-[#e7d3b3] bg-[#f8efe1] text-[#a06427]';
  return 'border-[#d2dbc1] bg-[#eef1e4] text-[#66763e]';
}

export function RepositorySecurityCenter({ repo, repoUrl, score, findings, filesScanned, checksRun, coverageComplete, scannedAt, protected: isProtected = false, onBack }: RepositorySecurityCenterProps) {
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const critical = findings.filter((finding) => finding.severity === 'Critical').length;
  const high = findings.filter((finding) => finding.severity === 'High').length;
  const medium = findings.filter((finding) => finding.severity === 'Medium').length;
  const coverageLabel = coverageComplete === true
    ? 'Complete for supported file types'
    : coverageComplete === false
      ? 'Partial coverage — not a clean result'
      : 'Coverage details not recorded for this scan';

  if (selectedFinding) {
    return <FindingDetail finding={selectedFinding} repoUrl={repoUrl} onBack={() => setSelectedFinding(null)} />;
  }

  return (
    <section className="mt-10 pb-20 sm:mt-14">
      <button type="button" onClick={onBack} className="vg-focus inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"><ArrowLeft size={13} /> Back to dashboard</button>
      <div className="mt-7 flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Repository security</p><h1 className="mt-3 truncate text-[34px] font-extrabold tracking-[-0.05em] sm:text-[48px]">{repo}</h1><a href={repoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground hover:text-primary">Open on GitHub <ExternalLink size={11} /></a></div>
        <span className={`inline-flex items-center gap-2 border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${isProtected ? 'border-[#aebe8c] bg-[#eef1e4] text-[#66763e]' : 'border-border bg-card text-muted-foreground'}`}><span className={`h-1.5 w-1.5 rounded-full ${isProtected ? 'bg-[#66763e]' : 'bg-muted-foreground'}`} />{isProtected ? 'Protected' : 'Scan only'}</span>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
        <div className="border-2 border-foreground bg-foreground p-7 text-background"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Heuristic risk score</p><div className="mt-5 flex items-end gap-2"><span className="text-[72px] font-black leading-none tracking-[-0.08em]">{score}</span><span className="mb-2 font-mono text-[11px] text-background/50">/100</span></div><p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-background/60">{filesScanned} files scanned{checksRun ? ' · ' + checksRun + ' checks' : ''} · {scannedAt}</p><p className="mt-3 max-w-[340px] text-[11px] leading-5 text-background/60">A heuristic score derived from findings in this scan. It is not a security certification.</p></div>
        <div className="border border-border bg-card p-7"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Findings</p><div className="mt-6 grid grid-cols-3 gap-3">{[['Critical', critical], ['High', high], ['Medium', medium]].map(([label, count]) => <div key={label} className="border border-border p-3"><p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-[26px] font-black tracking-[-0.05em]">{count}</p></div>)}</div></div>
        <div className="border border-border bg-card p-7"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Active protection</p><div className="mt-6 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center border border-[#aebe8c] bg-[#eef1e4] text-[#66763e]"><ShieldCheck size={19} /></div><div><p className="text-[16px] font-bold">{isProtected ? 'Monitoring on' : 'Not enabled'}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Push + pull request checks</p></div></div><div className="mt-6 border-t border-border pt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{checksRun ? checksRun + ' checks executed' : 'Check count not recorded'}</div></div>
      </div>
      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Coverage</p>
          <h2 className="mt-2 text-[21px] font-bold tracking-[-0.03em]">What this scan inspected</h2>
          <div className="mt-5 divide-y divide-border border border-border bg-card">
            <div className="flex items-center gap-3 p-4"><FileCode2 size={17} className="text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold">Files scanned</p><p className="mt-1 text-[11px] text-muted-foreground">Supported files read from the pinned repository snapshot</p></div><span className="font-mono text-[13px] font-bold">{filesScanned}</span></div>
            <div className="flex items-center gap-3 p-4"><ListChecks size={17} className="text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-[12px] font-semibold">Security checks executed</p><p className="mt-1 text-[11px] text-muted-foreground">Rules from the active VibeSane catalog</p></div><span className="font-mono text-[13px] font-bold">{checksRun ?? '—'}</span></div>
            <div className="p-4"><p className="text-[12px] font-semibold">Coverage status</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{coverageLabel}</p></div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Static analysis only. Unsupported file types, runtime behavior, reachable execution paths and infrastructure outside the scanned repository are not proven safe by this result.</p>
        </div>
        <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Findings</p><h2 className="mt-2 text-[21px] font-bold tracking-[-0.03em]">What needs attention</h2><div className="mt-5 border border-border bg-card">{findings.length === 0 ? <div className="p-8"><ShieldCheck className="text-[#66763e]" size={22} /><p className="mt-4 text-[16px] font-bold">No findings detected in the files inspected.</p><p className="mt-1 text-[13px] leading-5 text-muted-foreground">This does not prove the repository is secure. Results are limited to the supported file types and rules shown in the scan details.</p></div> : findings.slice(0, 6).map((finding, index) => <button type="button" key={`${finding.filePath}-${finding.line}-${index}`} onClick={() => setSelectedFinding(finding)} className="block w-full border-b border-border p-5 text-left transition-colors last:border-b-0 hover:bg-muted/40"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><span className={`inline-flex border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${severityClass(finding.severity)}`}>{finding.severity}</span><h3 className="mt-3 text-[14px] font-bold">{finding.title}</h3><p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{finding.filePath}{finding.line ? ':' + finding.line : ''}</p></div><ExternalLink size={14} className="shrink-0 text-muted-foreground" /></div></button>)}</div></div>
      </div>
    </section>
  );
}
