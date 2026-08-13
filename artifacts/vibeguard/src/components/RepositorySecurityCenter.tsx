import { ArrowLeft, Check, ExternalLink, GitPullRequest, ShieldCheck } from 'lucide-react';

type Finding = {
  severity: 'Critical' | 'High' | 'Medium';
  title: string;
  filePath: string;
  line: number;
};

type RepositorySecurityCenterProps = {
  repo: string;
  repoUrl: string;
  score: number;
  findings: Finding[];
  filesScanned: number;
  scannedAt: string;
  protected?: boolean;
  onBack: () => void;
};

const categories = [
  { label: 'Secrets & credentials', value: 100 },
  { label: 'Database & RLS', value: 96 },
  { label: 'Authentication', value: 92 },
  { label: 'Authorization', value: 88 },
  { label: 'Injection & browser APIs', value: 88 },
  { label: 'Dependencies & configuration', value: 94 },
];

function severityClass(severity: Finding['severity']) {
  if (severity === 'Critical') return 'border-[#e5c8c1] bg-[#f6e9e5] text-[#963f34]';
  if (severity === 'High') return 'border-[#e7d3b3] bg-[#f8efe1] text-[#a06427]';
  return 'border-[#d2dbc1] bg-[#eef1e4] text-[#66763e]';
}

export function RepositorySecurityCenter({
  repo,
  repoUrl,
  score,
  findings,
  filesScanned,
  scannedAt,
  protected: isProtected = false,
  onBack,
}: RepositorySecurityCenterProps) {
  const critical = findings.filter((finding) => finding.severity === 'Critical').length;
  const high = findings.filter((finding) => finding.severity === 'High').length;
  const medium = findings.filter((finding) => finding.severity === 'Medium').length;

  return (
    <section className="mt-10 pb-20 sm:mt-14">
      <button
        type="button"
        onClick={onBack}
        className="vg-focus inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={13} /> Back to dashboard
      </button>

      <div className="mt-7 flex flex-col gap-6 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Repository security</p>
          <h1 className="mt-3 truncate text-[34px] font-extrabold tracking-[-0.05em] sm:text-[48px]">{repo}</h1>
          <a href={repoUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground hover:text-primary">
            Open on GitHub <ExternalLink size={11} />
          </a>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${isProtected ? 'border-[#aebe8c] bg-[#eef1e4] text-[#66763e]' : 'border-border bg-card text-muted-foreground'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isProtected ? 'bg-[#66763e]' : 'bg-muted-foreground'}`} />
            {isProtected ? 'Protected' : 'Scan only'}
          </span>
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_1fr_1fr]">
        <div className="border-2 border-foreground bg-foreground p-7 text-background">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Security score</p>
          <div className="mt-5 flex items-end gap-2">
            <span className="text-[72px] font-black leading-none tracking-[-0.08em]">{score}</span>
            <span className="mb-2 font-mono text-[11px] text-background/50">/100</span>
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-background/60">{filesScanned} files · last scanned {scannedAt}</p>
        </div>
        <div className="border border-border bg-card p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Findings</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[['Critical', critical], ['High', high], ['Medium', medium]].map(([label, count]) => (
              <div key={label} className="border border-border p-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
                <p className="mt-2 text-[26px] font-black tracking-[-0.05em]">{count}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border border-border bg-card p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Active protection</p>
          <div className="mt-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-[#aebe8c] bg-[#eef1e4] text-[#66763e]"><ShieldCheck size={19} /></div>
            <div><p className="text-[16px] font-bold">{isProtected ? 'Monitoring on' : 'Not enabled'}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Push + pull request checks</p></div>
          </div>
          <div className="mt-6 border-t border-border pt-4 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">50 security checks</div>
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <div className="flex items-center justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Coverage</p><h2 className="mt-2 text-[21px] font-bold tracking-[-0.03em]">Security checks</h2></div><GitPullRequest size={19} className="text-muted-foreground" /></div>
          <div className="mt-5 space-y-3">
            {categories.map((category) => (
              <div key={category.label} className="border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3"><span className="text-[12px] font-semibold">{category.label}</span><span className="font-mono text-[10px] text-muted-foreground">{category.value}%</span></div>
                <div className="mt-3 h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${category.value}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Findings</p><h2 className="mt-2 text-[21px] font-bold tracking-[-0.03em]">What needs attention</h2></div>
          <div className="mt-5 border border-border bg-card">
            {findings.length === 0 ? (
              <div className="p-8"><ShieldCheck className="text-[#66763e]" size={22} /><p className="mt-4 text-[16px] font-bold">No findings in this scan.</p><p className="mt-1 text-[13px] text-muted-foreground">All current checks are clear.</p></div>
            ) : findings.slice(0, 6).map((finding, index) => (
              <div key={`${finding.filePath}-${finding.line}-${index}`} className="border-b border-border p-5 last:border-b-0">
                <div className="flex items-start justify-between gap-4"><div className="min-w-0"><span className={`inline-flex border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${severityClass(finding.severity)}`}>{finding.severity}</span><h3 className="mt-3 text-[14px] font-bold">{finding.title}</h3><p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{finding.filePath}:{finding.line}</p></div><Check size={15} className="shrink-0 text-muted-foreground" /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
