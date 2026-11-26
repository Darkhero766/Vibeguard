import { useEffect } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight, Bot, CheckCircle2, CircleDot, Fingerprint, Github, KeyRound,
  LockKeyhole, Monitor, MonitorCog, PackageCheck, ShieldCheck, Terminal,
} from 'lucide-react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

const hosts = [
  { name: 'Claude Code', id: 'claude', detail: 'Project .mcp.json with explicit workspace approval' },
  { name: 'Codex CLI', id: 'codex', detail: 'Project .codex/config.toml registration' },
  { name: 'Cursor', id: 'cursor', detail: 'Project .cursor/mcp.json registration' },
  { name: 'Gemini CLI', id: 'gemini', detail: 'Project .gemini/settings.json registration' },
  { name: 'Roo Code', id: 'roo', detail: 'Project .roo/mcp.json registration' },
  { name: 'GitHub Copilot', id: 'copilot', detail: 'VS Code workspace MCP and Copilot CLI detection' },
];

const boundaries = [
  'Read-only MCP tools. No shell, patch, commit, or deploy capability.',
  'Only the canonical Git root selected during setup is authorized.',
  'No repository scripts or project code are executed by the connector.',
  'Existing host configuration is backed up and unrelated entries are preserved.',
  'Malformed, symlinked, or conflicting configuration is refused rather than overwritten.',
  'Host approval and the coding agent’s own permissions remain in control.',
];

export default function FoxyPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Foxy — local-first MCP security for AI coding agents | VibeSane';
    const meta = document.querySelector('meta[name="description"]');
    const prior = meta?.getAttribute('content');
    meta?.setAttribute('content', 'Connect six AI coding-agent host targets to VibeSane Foxy with one command. Local-first, workspace-scoped, read-only MCP security for Windows, macOS and Linux.');
    return () => {
      document.title = previousTitle;
      if (meta && prior != null) meta.setAttribute('content', prior);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#101111]">
      <Nav />
      <main id="main-content">
        <section className="mx-auto grid max-w-[1040px] gap-10 px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.12fr_.88fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 border border-[#d8b63d] bg-[#f4c842] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#101111]">
              <Bot size={13} aria-hidden="true" /> Foxy · MCP security layer
            </div>
            <h1 className="mt-7 max-w-[720px] text-[clamp(2.8rem,7vw,5.8rem)] font-extrabold leading-[.96] tracking-[-.075em]">
              Your AI agent.
              <span className="block text-[#e34a3b]">A safer workspace.</span>
            </h1>
            <p className="mt-6 max-w-[620px] text-base leading-8 text-[#535750] sm:text-lg">
              Foxy connects AI coding agents to VibeSane’s local security engine. Scan supported changes, inspect findings, verify remediation, and keep workspace access explicitly scoped.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#connect" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#101111] bg-[#101111] px-5 py-3 text-sm font-bold text-[#f4f1ea] shadow-[4px_4px_0_#e34a3b]">
                Explore the connector <ArrowRight size={16} aria-hidden="true" />
              </a>
              <a href="#security-model" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#101111] bg-transparent px-5 py-3 text-sm font-bold text-[#101111]">
                Security model <LockKeyhole size={15} aria-hidden="true" />
              </a>
            </div>
            <p className="mt-6 max-w-[650px] font-mono text-[10px] uppercase leading-5 tracking-[.12em] text-[#6c7068]">
              Windows · macOS · Linux · Node.js 20+ · Private beta / reviewer preview
            </p>
          </div>

          <div className="relative border-2 border-[#101111] bg-[#101111] p-5 text-[#f4f1ea] shadow-[8px_8px_0_#e34a3b] sm:p-7">
            <div className="flex items-center justify-between border-b border-white/15 pb-4">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#e34a3b]" /><span className="h-2.5 w-2.5 rounded-full bg-[#f4c842]" /><span className="h-2.5 w-2.5 rounded-full bg-[#7a9e7e]" /></div>
              <span className="font-mono text-[9px] uppercase tracking-[.18em] text-[#aeb2aa]">One-command setup</span>
            </div>
            <div className="mt-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.12em] text-[#f4c842]"><Terminal size={14} /> Terminal</div>
            <pre className="mt-4 overflow-x-auto border border-white/10 bg-[#191d1b] p-4 font-mono text-[13px] leading-7 text-[#f4f1ea]"><code><span className="text-[#7fba8f]">$</span> vibesane connect{"\n"}<span className="text-[#7fba8f]">$</span> vibesane doctor{"\n"}<span className="text-[#7fba8f]">$</span> vibesane disconnect --agent all</code></pre>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="border border-white/10 p-3"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9ca198]">Target hosts</p><p className="mt-1 text-2xl font-extrabold tracking-tight text-[#f4c842]">06</p></div>
              <div className="border border-white/10 p-3"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9ca198]">Connector tools</p><p className="mt-1 text-2xl font-extrabold tracking-tight text-[#f4c842]">Read-only</p></div>
            </div>
            <p className="mt-5 text-[11px] leading-5 text-[#aeb2aa]">The CLI is an unpublished beta. The command is available to authorized local builds; this page does not install software on your device.</p>
          </div>
        </section>

        <section className="border-y border-[#d9d5cc] bg-[#ebe7de]">
          <div className="mx-auto grid max-w-[1040px] gap-6 px-5 py-8 sm:grid-cols-3 sm:px-8">
            <div className="flex gap-3"><ShieldCheck size={22} className="shrink-0 text-[#e34a3b]" /><div><h2 className="text-sm font-extrabold">Local-first</h2><p className="mt-1 text-xs leading-5 text-[#62665e]">Runs beside your repository over MCP STDIO.</p></div></div>
            <div className="flex gap-3"><Fingerprint size={22} className="shrink-0 text-[#e34a3b]" /><div><h2 className="text-sm font-extrabold">Scoped authority</h2><p className="mt-1 text-xs leading-5 text-[#62665e]">A canonical Git root is explicitly allowlisted.</p></div></div>
            <div className="flex gap-3"><Monitor size={22} className="shrink-0 text-[#e34a3b]" /><div><h2 className="text-sm font-extrabold">Cross-platform</h2><p className="mt-1 text-xs leading-5 text-[#62665e]">Windows and macOS qualification; Linux supported by runtime.</p></div></div>
          </div>
        </section>

        <section id="connect" className="mx-auto max-w-[1040px] px-5 py-16 sm:px-8 sm:py-20">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#e34a3b]">Host compatibility</p><h2 className="mt-3 text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">One connector. Six host targets.</h2></div>
            <p className="max-w-sm text-xs leading-6 text-[#666a62]">Auto-detection uses installed CLIs and project/host markers. Explicit host selection remains available when detection is ambiguous.</p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hosts.map((host, index) => (
              <article key={host.id} className="border border-[#d5d1c8] bg-[#fbf9f3] p-5 transition-transform hover:-translate-y-0.5">
                <div className="flex items-center justify-between"><span className="font-mono text-[10px] font-bold text-[#e34a3b]">0{index + 1}</span><CircleDot size={15} className="text-[#8c9188]" /></div>
                <h3 className="mt-4 text-lg font-extrabold tracking-tight">{host.name}</h3>
                <p className="mt-2 text-xs leading-5 text-[#666a62]">{host.detail}</p>
                <p className="mt-4 border-t border-[#e4e0d7] pt-3 font-mono text-[9px] uppercase tracking-[.13em] text-[#7c8077]">--agent {host.id}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 border-l-4 border-[#f4c842] bg-[#ebe7de] p-5">
            <p className="text-sm font-bold">Any other MCP STDIO client?</p>
            <p className="mt-1 text-xs leading-6 text-[#62665e]">Use <code className="font-mono text-[#101111]">vibesane connect --agent mcp</code> to print a generic server entry. It supports MCP-compatible clients; it does not make non-MCP agents compatible.</p>
          </div>
        </section>

        <section className="border-y border-[#d9d5cc] bg-[#101111] text-[#f4f1ea]">
          <div className="mx-auto grid max-w-[1040px] gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-2">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#f4c842]">The security model</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">Useful context. No extra authority.</h2>
              <p className="mt-5 text-sm leading-7 text-[#b8bcb4]">Foxy exposes read-only security analysis through MCP. Workspace authorization comes from a server-side allowlist created during setup, never from a caller-supplied path. Repository code is not executed by the connector.</p>
              <div className="mt-7 flex items-center gap-3 border border-white/15 p-4"><KeyRound className="shrink-0 text-[#f4c842]" size={20} /><p className="text-xs leading-5 text-[#d3d6cf]">Host approval is still required. Foxy does not replace the permission model of Claude Code, Codex, Cursor or any other agent.</p></div>
            </div>
            <div id="security-model" className="space-y-3">
              {boundaries.map((item, index) => <div key={item} className="flex gap-3 border-b border-white/10 pb-3"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#f4c842]" /><p className="text-xs leading-5 text-[#d3d6cf]">{item}</p></div>)}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1040px] px-5 py-16 sm:px-8 sm:py-20">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#e34a3b]">Qualification & release state</p>
          <h2 className="mt-3 max-w-[760px] text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">Engineering evidence before distribution.</h2>
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <article className="border-2 border-[#101111] bg-[#fbf9f3] p-6 shadow-[5px_5px_0_#f4c842]">
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[#e34a3b]"><PackageCheck size={15} /> Automated qualification</div>
              <h3 className="mt-4 text-xl font-extrabold">Windows + macOS</h3>
              <p className="mt-3 text-sm leading-6 text-[#62665e]">Foxy beta.4 has passed source-matched automated release qualification on both Windows and macOS. The run validates source integrity, regression tests, adversarial benchmarks, offline packaging, installation, connector setup/removal, MCP boundaries and queue behavior.</p>
              <p className="mt-4 border-t border-[#e5e0d7] pt-3 font-mono text-[9px] uppercase tracking-[.12em] text-[#777b72]">Automated checks · Node.js 24 CI runners</p>
            </article>
            <article className="border border-[#d5d1c8] bg-[#ebe7de] p-6">
              <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.12em] text-[#777b72]"><MonitorCog size={15} /> Separate acceptance gate</div>
              <h3 className="mt-4 text-xl font-extrabold">Real-host validation remains distinct</h3>
              <p className="mt-3 text-sm leading-6 text-[#62665e]">Passing automated CI does not claim authenticated live acceptance on every host. Host restart/approval flows, platform-specific behavior and an independent human security review still need separate sign-off before public distribution.</p>
              <a href="https://github.com/Darkhero766/Vibeguard/pull/70" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#e34a3b] hover:underline">Review Foxy qualification PR <ArrowRight size={15} /></a>
            </article>
          </div>
          <p className="mt-6 text-[11px] leading-6 text-[#6c7068]">Foxy is an unpublished developer preview, not a security certification or a substitute for code review, testing, threat modeling, or an independent security assessment. Static-analysis coverage is limited to supported file types and rules; partial or unknown coverage is never a clean result.</p>
        </section>

        <section className="border-t border-[#d9d5cc] bg-[#f4c842]">
          <div className="mx-auto flex max-w-[1040px] flex-col gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em]">Part of VibeSane</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">Secure the workflow around your code.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#393b35]">Use the existing web scanner for a GitHub repository scan, or inspect the local connector’s engineering work.</p></div>
            <div className="flex flex-wrap gap-3"><Link href="/scan-public" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#101111] bg-[#101111] px-5 py-3 text-sm font-bold text-[#f4f1ea]">Open web scanner <ArrowRight size={15} /></Link><a href="https://github.com/Darkhero766/Vibeguard/pull/70" target="_blank" rel="noreferrer" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#101111] bg-transparent px-5 py-3 text-sm font-bold text-[#101111]"><Github size={15} /> Engineering PR</a></div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
