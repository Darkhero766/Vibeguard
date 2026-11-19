import { useEffect } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Bot, CheckCircle2, Code2, Github, LockKeyhole, ShieldCheck, Terminal, TriangleAlert } from 'lucide-react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

const modes = [
  { name: 'Monitor', detail: 'Report supported risky patterns after edits. Never initiate repairs or block completion.' },
  { name: 'Assist', detail: 'Provide focused remediation guidance. Developer permissions still control changes.' },
  { name: 'Auto-fix', detail: 'Ask Claude Code to attempt bounded repairs when explicitly enabled. Never bypass edit permissions.' },
];
const steps = [
  { title: 'Install locally', description: 'The developer installs the AgentShield CLI and configures Claude Code hooks in a disposable Git project.' },
  { title: 'Scan supported changes', description: 'PostToolUse analyzes supported edited files. A final Git worktree gate checks staged, unstaged and untracked supported changes.' },
  { title: 'Review and repair', description: 'Findings include relevant rule identifiers and guidance. Claude may attempt a permitted repair in an enabled mode.' },
  { title: 'Rescan and report', description: 'AgentShield distinguishes active risks, static resolution, independent verification and incomplete scan coverage.' },
];

export default function AgentShieldPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'AgentShield for Claude Code | VibeSane';
    const meta = document.querySelector('meta[name="description"]');
    const prior = meta?.getAttribute('content');
    meta?.setAttribute('content', 'VibeSane AgentShield checks supported code security patterns while working with Claude Code. Private-beta developer preview; independent security review is still required.');
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
          <h1 className="mt-7 max-w-[840px] text-[clamp(2.4rem,6vw,5.4rem)] font-extrabold leading-[1.03] tracking-[-0.065em]">
            Build with AI. <span className="text-primary">Check security as you code.</span>
          </h1>
          <p className="mt-6 max-w-[670px] text-base leading-8 text-muted-foreground sm:text-lg">
            AgentShield checks supported security patterns in code created or modified during Claude Code sessions, offers remediation guidance, and rescans Git-visible changes before completion.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/scan-public" className="vg-button vg-focus inline-flex items-center gap-2 border border-foreground bg-foreground px-5 py-3 text-sm font-bold text-background">
              Scan a GitHub repository <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="vg-focus inline-flex items-center gap-2 border border-border bg-card px-5 py-3 text-sm font-semibold hover:border-primary">
              How AgentShield works <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <p className="mt-5 max-w-[680px] text-[12px] leading-6 text-muted-foreground">
            AgentShield's authenticated Claude Code acceptance test and external distribution approval are still pending. No public installer is available. Web scanning and local AgentShield are separate workflows.
          </p>
        </section>

        <section className="border-y border-border bg-card" aria-label="AgentShield capabilities">
          <div className="mx-auto grid max-w-[1040px] gap-4 px-5 py-8 sm:grid-cols-3 sm:px-8">
            <div className="flex gap-3"><ShieldCheck size={22} className="shrink-0 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Detect while coding</h2><p className="mt-1 text-[12px] leading-5 text-muted-foreground">Find supported code, credential and configuration risks.</p></div></div>
            <div className="flex gap-3"><Code2 size={22} className="shrink-0 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Repair with permission</h2><p className="mt-1 text-[12px] leading-5 text-muted-foreground">Get guidance and bounded repair requests inside Claude Code.</p></div></div>
            <div className="flex gap-3"><LockKeyhole size={22} className="shrink-0 text-primary" aria-hidden="true" /><div><h2 className="font-semibold">Local by design</h2><p className="mt-1 text-[12px] leading-5 text-muted-foreground">Local scans do not upload customer source to VibeSane.</p></div></div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1040px] px-5 py-16 sm:px-8">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Development workflow</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">Four steps, one feedback loop.</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {steps.map((step, index) => (
              <div key={step.title} className="border border-border bg-card p-6">
                <span className="font-mono text-[11px] font-semibold text-primary">0{index + 1}</span>
                <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-[1040px] px-5 py-14 sm:px-8">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Choose your mode</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.045em]">Control how the agent responds.</h2>
            <div className="mt-7 grid gap-3 md:grid-cols-3">
              {modes.map(mode => <div key={mode.name} className="border border-border bg-background p-5">
                <CheckCircle2 size={18} className="text-primary" aria-hidden="true" />
                <h3 className="mt-3 text-lg font-bold">{mode.name}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode.detail}</p>
              </div>)}
            </div>
            <p className="mt-5 text-xs text-muted-foreground">Monitor is the default. Auto-fix is opt-in and cannot guarantee Claude will fix a finding.</p>
          </div>
        </section>

        <section id="getting-started" className="mx-auto max-w-[1040px] px-5 py-16 sm:px-8">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-primary"><Terminal size={15} aria-hidden="true" /> Local developer setup</div>
              <h2 className="mt-4 text-3xl font-bold tracking-[-0.045em]">Installation is currently restricted to development testing.</h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                The unpublished prototype requires Node.js 20+, Git, macOS or Linux, and an authenticated Claude Code installation for the full experience. The local CLI does not require VibeSane API credentials.
              </p>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Authorized reviewers can build the scanner from the project source, run <code className="font-mono">doctor</code> on a disposable repository, and verify hook installation and removal using the technical guide. No public download or npm command is provided while release validation remains open.
              </p>
              <a href="https://github.com/Darkhero766/Vibeguard/blob/feat/agentshield-week4-private-beta/artifacts/api-server/AGENTSHIELD_WEEK4.md"
                 target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
                Read developer preview documentation <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>
            <div className="border border-border bg-card p-6">
              <h3 className="text-lg font-bold">Important distinctions</h3>
              <div className="mt-5 space-y-5">
                <div className="flex items-start gap-3"><Github className="mt-0.5 shrink-0 text-primary" size={20} aria-hidden="true" /><div><h4 className="text-sm font-semibold">VibeSane Web Scanner</h4><p className="mt-1 text-xs leading-6 text-muted-foreground">Submits a GitHub repository URL to the website backend for an on-demand code scan. This is a separate web experience.</p></div></div>
                <div className="flex items-start gap-3"><Bot className="mt-0.5 shrink-0 text-primary" size={20} aria-hidden="true" /><div><h4 className="text-sm font-semibold">AgentShield Local</h4><p className="mt-1 text-xs leading-6 text-muted-foreground">Runs in a developer's Git project and passes findings to Claude Code via hooks. No automatic cloud sync or web-based AI repair is included.</p></div></div>
                <div className="flex items-start gap-3"><TriangleAlert className="mt-0.5 shrink-0 text-primary" size={20} aria-hidden="true" /><div><h4 className="text-sm font-semibold">Verification has limits</h4><p className="mt-1 text-xs leading-6 text-muted-foreground">Static resolution only means a detected pattern disappeared. It does not prove that authentication, RLS or the entire app is secure. Unsupported files and scan failures require review.</p></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-card px-5 py-12 sm:px-8">
          <div className="mx-auto max-w-[1040px]">
            <h2 className="text-2xl font-bold tracking-[-0.04em]">Start with a GitHub security scan.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">The existing web scanner is available separately. AgentShield's local developer preview remains under validation.</p>
            <Link href="/scan-public" className="vg-button vg-focus mt-5 inline-flex items-center gap-2 border border-primary bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">
              Open web scanner <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
