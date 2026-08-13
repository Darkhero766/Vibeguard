import { ArrowLeft, ExternalLink, ShieldAlert } from 'lucide-react';

type Finding = {
  severity: 'Critical' | 'High' | 'Medium';
  title: string;
  description?: string;
  filePath: string;
  line: number;
  check?: string;
};

type Props = {
  finding: Finding;
  repoUrl: string;
  onBack: () => void;
};

function severityClass(severity: Finding['severity']) {
  if (severity === 'Critical') return 'border-[#e5c8c1] bg-[#f6e9e5] text-[#963f34]';
  if (severity === 'High') return 'border-[#e7d3b3] bg-[#f8efe1] text-[#a06427]';
  return 'border-[#d2dbc1] bg-[#eef1e4] text-[#66763e]';
}

export function FindingDetail({ finding, repoUrl, onBack }: Props) {
  const fileUrl = `${repoUrl.replace(/\/$/, '')}/blob/HEAD/${finding.filePath}#L${finding.line}`;

  return (
    <section className="mt-10 pb-20 sm:mt-14">
      <button type="button" onClick={onBack} className="vg-focus inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">
        <ArrowLeft size={13} /> Back to findings
      </button>

      <div className="mt-8 max-w-[820px]">
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          <ShieldAlert size={14} /> Security finding
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className={`border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] ${severityClass(finding.severity)}`}>{finding.severity}</span>
          {finding.check && <span className="border border-border bg-card px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{finding.check}</span>}
        </div>
        <h1 className="mt-5 text-[34px] font-extrabold leading-tight tracking-[-0.05em] sm:text-[48px]">{finding.title}</h1>
        <p className="mt-5 max-w-[700px] text-[15px] leading-7 text-muted-foreground">{finding.description || 'VibeSane detected a security issue that deserves attention.'}</p>

        <div className="mt-8 border-2 border-foreground bg-foreground p-5 text-background sm:p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Location</p>
          <p className="mt-3 break-all font-mono text-[12px]">{finding.filePath}:{finding.line}</p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="border border-border bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Why it matters</p>
            <p className="mt-4 text-[13px] leading-6 text-muted-foreground">This issue can expose application data or create an attack path if it reaches production. Review the affected code and address the finding before shipping.</p>
          </div>
          <div className="border border-border bg-card p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">Recommended action</p>
            <p className="mt-4 text-[13px] leading-6 text-muted-foreground">Open the affected source, remove or harden the vulnerable behavior, then run VibeSane again to verify the fix.</p>
          </div>
        </div>

        <a href={fileUrl} target="_blank" rel="noreferrer" className="vg-button vg-focus mt-6 inline-flex items-center gap-2 border-2 border-foreground bg-primary px-5 py-3 text-[12px] font-bold text-primary-foreground shadow-[3px_3px_0_hsl(var(--foreground))] transition-transform hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none">
          Open file on GitHub <ExternalLink size={14} />
        </a>
      </div>
    </section>
  );
}
