import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Bot, CheckCircle2, Code2, Github, LockKeyhole, ShieldCheck, Terminal, TriangleAlert } from 'lucide-react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

const capabilities = [
  { icon: ShieldCheck, title: 'Scan changed code', body: 'Bounded static checks against supported files in an explicitly authorized local repository.' },
  { icon: Code2, title: 'Explain findings', body: 'Rule-specific context and mitigation guidance without trusting repository text as instructions.' },
  { icon: CheckCircle2, title: 'Verify remediation', body: 'Rescan after edits. Stale baselines and incomplete coverage are never represented as a pass.' },
  { icon: LockKeyhole, title: 'Respect local boundaries', body: 'A local STDIO process, explicit repository-root allowlist and read-only scanner operations.' },
];
const steps = [
  ['01', 'Authorize a repository', 'Choose the exact workspace root the MCP process may inspect. Avoid broad roots such as your home directory or filesystem root.'],
  ['02', 'Request a scan', 'The host asks Foxy to inspect supported changed files or start a bounded asynchronous scan.'],
  ['03', 'Review findings', 'Foxy returns findings and guidance. Any edits are performed by the coding agent under the host application’s permissions.'],
  ['04', 'Verify the result', 'Foxy checks workspace state and scanner provenance. Scanner drift or incomplete coverage makes verification unknown.'],
];

export default function FoxyPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Foxy MCP Security for AI Coding Agents | VibeSane';
    const meta = document.querySelector('meta[name="description"]');
    const prior = meta?.getAttribute('content');
    meta?.setAttribute('content', 'Foxy is VibeSane’s local-first MCP security integration for AI coding agents. Private beta; public install is not available yet.');
    return () => {
      document.title = previousTitle;
      if (meta && prior != null) meta.setAttribute('content', prior);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main id="main-content">
        <section className="mx-auto max-w-[1040px] px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-20">
          <div className="inline-flex items-center gap-2 border border-[#d9b64c] bg-[#f9f1cc] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#413a1f]">
            <Bot size={13} aria-hidden="true" /> Private-beta developer preview
          </div>
          <h1 className="mt-7 max-w-[850px] text-[clamp(2.5rem,6.5vw,5.5rem)] font-extrabold leading-[1.02] tracking-[-0.065em]">
            Meet Foxy. <span className="text-primary">Security for the AI coding loop.</span>
          </h1>
          <p className="mt-6 max-w-[710px] text-base leading-8 text-muted-foreground sm:text-lg">
            Foxy is VibeSane’s local-first MCP security integration for AI coding agents. Scan supported changes, understand findings and verify fixes without turning your coding workspace into a remote upload workflow.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#how-it-works" className="vg-button vg-focus inline-flex items-center gap-2 border border-foreground bg-foreground px-5 py-3 text-sm font-bold text-background">
              Explore the workflow <ArrowRight size={16} aria-hidden="true" />
            </a>
            <Link href="/agentshield" className="vg-focus inline-flex items-center gap-2 border border-border bg-card px-5 py-3 text-sm font-semibold hover:border-primary">
              AgentShield preview <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a href="https://github.com/Darkhero766/Vibeguard/pull/69" target="_blank" rel="noreferrer" className="vg-focus inline-flex items-center gap-2 border border-border bg-card px-5 py-3 text-sm font-semibold hover:border-primary">
              Beta engineering notes <Github size={15} aria-hidden="true" />
            </a>
          </div>
          <p className="mt-5 max-w-[730px] text-[12px] leading-6 text-muted-foreground">
            The npm package is still private and unpublished. No public install command or one-click installer is enabled. Real-host acceptance and independent security review remain release gates.
          </p>
        </section>

        <section className="border-y border-border bg-card" aria-label="Foxy capabilities">
          <div className="mx-auto grid max-w-[1040px] gap-5 px-5 py-9 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
            {capabilities.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <Icon size={22} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-[12px] leading-5 text-muted-foreground">{body}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1040px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Local workflow</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">A controlled security feedback loop.</h2>
          <p className="mt-4 max-w-[650px] text-sm leading-7 text-muted-foreground">Foxy sits beside the coding agent. It does not replace the host’s permission system or claim that static analysis proves an application is secure.</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {steps.map(([number, title, body]) => (
              <article key={number} className="border border-border bg-card p-5 sm:p-6">
                <p className="font-mono text-[11px] font-bold tracking-[0.14em] text-primary">{number} / FOXY FLOW</p>
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-[1040px] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Architecture &amp; data</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.045em]">Local by design. Scoped by you.</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">The MCP server runs locally over standard input/output (STDIO). It reads only roots listed in <code>VIBESANE_ALLOWED_ROOTS_JSON</code>. The scanner is read-only and never executes repository code.</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">Foxy does not automatically upload repository source to VibeSane. Your coding-agent provider may separately process prompts or code context under that provider’s own privacy settings and policies.</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">The local queue stores bounded scan metadata and recoverable baselines. Baselines are tied to the scanner artifact, ruleset identity and report schema; version drift makes them unusable for verification.</p>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3 border border-border bg-background p-4"><Terminal size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="font-semibold">Local process</h3><p className="mt-1 text-[12px] leading-5 text-muted-foreground">Requests arrive through the coding agent’s local MCP STDIO connection.</p></div></div>
              <div className="flex gap-3 border border-border bg-background p-4"><LockKeyhole size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="font-semibold">Authorized workspace</h3><p className="mt-1 text-[12px] leading-5 text-muted-foreground">Access is scoped to configured roots and canonical paths.</p></div></div>
              <div className="flex gap-3 border border-border bg-background p-4"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" /><div><h3 className="font-semibold">Static analysis</h3><p className="mt-1 text-[12px] leading-5 text-muted-foreground">Foxy inspects supported source and configuration files; it does not run project scripts or apply patches.</p></div></div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1040px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Compatibility status</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">What is qualified today?</h2>
          <p className="mt-4 max-w-[680px] text-sm leading-7 text-muted-foreground">Protocol and offline package checks are useful evidence. They are not the same as validating a real installation inside each host application.</p>
          <div className="mt-8 overflow-hidden border border-border">
            <div className="grid grid-cols-[1fr_1.2fr] border-b border-border bg-card px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground"><span>Area</span><span>Current status</span></div>
            {[
              ['MCP STDIO protocol', 'Offline SDK smoke and protocol regression checks have passed.'],
              ['Claude Code', 'Live authenticated host acceptance is pending.'],
              ['Codex CLI', 'Live host acceptance is pending; integration is still a private beta candidate.'],
              ['Cursor', 'Stop-hook/MCP configuration is in preview; live host acceptance is pending.'],
              ['Operating systems', 'Current beta target: Node.js 20+ on macOS and Linux. Windows is not qualified.'],
            ].map(([label, status]) => <div key={label} className="grid grid-cols-[1fr_1.2fr] gap-4 border-b border-border px-4 py-4 last:border-b-0"><span className="text-[12px] font-semibold">{label}</span><span className="text-[12px] leading-5 text-muted-foreground">{status}</span></div>)}
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-[1040px] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Install &amp; update</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.045em]">Why there is no install button yet.</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">The beta package remains private and unpublished. A public <code>npx</code> command, Cursor deep link or download button would be misleading until package publication, integrity verification and host acceptance are complete.</p>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">The planned setup flow will select a host and repository root, back up existing configuration, preserve unrelated settings, run diagnostics and support uninstall/rollback. Host deep links must show their own approval prompt. A website cannot silently write to your machine.</p>
            </div>
            <div className="border border-border bg-background p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-bold"><TriangleAlert size={18} className="text-primary" aria-hidden="true" /> Public installation is not enabled</div>
              <p className="mt-3 text-[13px] leading-6 text-muted-foreground">Do not run unverified install commands or an unpinned <code>@latest</code> package. Approved preview participants should use the exact locally supplied archive and its release notes.</p>
              <a href="https://github.com/Darkhero766/Vibeguard/pull/69" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-[12px] font-semibold text-primary hover:underline">Review beta release gates <ArrowRight size={14} aria-hidden="true" /></a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1040px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Use with care</p>
              <h2 className="mt-3 max-w-[700px] text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">A developer signal, not a security guarantee.</h2>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-muted-foreground">
                <li>• Only supported file types and rules are analyzed; coverage can be partial.</li>
                <li>• A finding disappearing after an edit is not proof that a vulnerability is fully remediated.</li>
                <li>• Scanner drift invalidates a saved baseline; a fresh scan is required.</li>
                <li>• Foxy does not replace threat modeling, testing, human review or an independent assessment.</li>
              </ul>
            </div>
            <Link href="/agentshield" className="vg-button vg-focus inline-flex items-center justify-center gap-2 border border-foreground bg-foreground px-5 py-3 text-sm font-bold text-background">Explore AgentShield <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
