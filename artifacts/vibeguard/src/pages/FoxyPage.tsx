import { useEffect } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight, Bot, CheckCircle2, CircleDot, Fingerprint, Github, KeyRound,
  LockKeyhole, Monitor, MonitorCog, PackageCheck, ShieldCheck, Terminal,
} from 'lucide-react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

const hosts = [
  { name: 'Claude Code', id: 'claude', detail: 'Project-level .mcp.json registration' },
  { name: 'Codex CLI', id: 'codex', detail: 'Project-level .codex/config.toml registration' },
  { name: 'Cursor', id: 'cursor', detail: 'Project-level .cursor/mcp.json registration' },
  { name: 'Gemini CLI', id: 'gemini', detail: 'Project-level .gemini/settings.json registration' },
  { name: 'Roo Code', id: 'roo', detail: 'Project-level .roo/mcp.json registration' },
  { name: 'GitHub Copilot', id: 'copilot', detail: 'Workspace-root .mcp.json; VS Code may require chat.mcp.workspaceRootConfig.enabled' },
];

const boundaries = [
  'Read-only MCP tools. No shell, patch, commit, or deploy capability.',
  'Only the canonical Git root selected during setup is authorized.',
  'The connector does not execute repository scripts or project code.',
  'Existing host configuration is backed up and unrelated entries are preserved.',
  'Malformed, symlinked, oversized, or conflicting configuration is refused.',
  'Host approval and each coding agent’s own permission model remain in control.',
];

export default function FoxyPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Foxy — Local-first MCP security for AI coding agents | VibeSane';
    const meta = document.querySelector('meta[name="description"]');
    const prior = meta?.getAttribute('content');
    meta?.setAttribute('content', 'Foxy is a local, workspace-scoped, read-only MCP security integration for supported coding agents. The beta.5 SQLite queue still requires exact-source Windows/macOS qualification, live host acceptance, and independent security review.');
    return () => {
      document.title = previousTitle;
      if (meta && prior != null) meta.setAttribute('content', prior);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0b1112] text-[#f4f6f0]">
      <Nav />
      <main id="main-content">
        <section className="relative isolate overflow-hidden bg-[#0b1112]">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="vg-grid absolute inset-0 opacity-35" />
            <div className="absolute -right-28 top-0 h-[420px] w-[620px] bg-[radial-gradient(circle_at_center,rgba(199,243,106,.12),transparent_62%)]" />
          </div>
          <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
            <div className="vg-rise">
              <p className="inline-flex items-center gap-2 border border-[#35433a] bg-[#111b18] px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[.16em] text-[#c7f36a]">
                <Bot size={14} aria-hidden="true" /> Foxy / local MCP security
              </p>
              <h1 className="mt-8 max-w-[760px] font-sans text-[clamp(3.15rem,7.2vw,6.25rem)] font-extrabold leading-[.98] tracking-[-.075em]">
                Security context for your AI agent.
                <span className="mt-2 block text-[#c7f36a]">Not extra authority.</span>
              </h1>
              <p className="mt-7 max-w-[630px] text-[15px] leading-8 text-[#aab5ad] sm:text-lg">
                Foxy connects supported coding agents to VibeSane’s local security engine through MCP STDIO. Inspect supported changes, understand findings, and verify remediation while access stays scoped to the selected repository.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#connect" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#c7f36a] bg-[#c7f36a] px-5 py-3.5 text-sm font-bold text-[#0b1112] shadow-[0_6px_22px_rgba(199,243,106,.12)]">
                  Explore integrations <ArrowRight size={16} aria-hidden="true" />
                </a>
                <a href="#qualification" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#35433a] bg-[#111b18] px-5 py-3.5 text-sm font-semibold text-[#f4f6f0] hover:border-[#c7f36a]">
                  Review qualification <PackageCheck size={16} aria-hidden="true" />
                </a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] uppercase leading-5 tracking-[.14em] text-[#87958b]">
                <span>Private beta</span><span>Node.js 24.15+</span><span>Windows + macOS</span><span>Read-only MCP</span>
              </div>
            </div>

            <aside className="vg-rise border border-[#344139] bg-[#111b18] p-5 shadow-[0_24px_70px_rgba(0,0,0,.28)] sm:p-7" aria-label="Foxy local connection preview">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2" aria-label="Terminal window">
                  <span className="h-2 w-2 rounded-full bg-[#65746b]" />
                  <span className="h-2 w-2 rounded-full bg-[#8b9c8e]" />
                  <span className="h-2 w-2 rounded-full bg-[#c7f36a]" />
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[.18em] text-[#9eaaa1]">Local connection / stdio</span>
              </div>
              <div className="mt-7 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-[#c7f36a]"><Terminal size={14} aria-hidden="true" /> Reviewer build example</div>
              <pre className="mt-4 overflow-x-auto border border-white/10 bg-[#0b1112] p-5 font-mono text-[12px] leading-7 text-[#e8eee7] sm:text-[13px]"><code><span className="text-[#c7f36a]">$</span> vibesane connect --agent auto{'\n'}<span className="text-[#c7f36a]">$</span> vibesane doctor{'\n'}<span className="text-[#c7f36a]">$</span> vibesane disconnect --agent all</code></pre>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="border border-white/10 bg-white/[.03] p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#9eaaa1]">Access model</p>
                  <p className="mt-2 text-lg font-bold tracking-tight text-[#c7f36a]">Read-only</p>
                </div>
                <div className="border border-white/10 bg-white/[.03] p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#9eaaa1]">Workspace scope</p>
                  <p className="mt-2 text-lg font-bold tracking-tight text-[#c7f36a]">One Git root</p>
                </div>
              </div>
              <p className="mt-6 border-t border-white/10 pt-4 text-[11px] leading-6 text-[#aab5ad]">The CLI is unpublished. Commands shown are illustrative for an authorized local reviewer build; this page does not install software or change your agent configuration.</p>
            </aside>
          </div>
        </section>

        <section className="border-y border-[#dce3da] bg-[#f4f6f0] text-[#0b1112]" aria-label="Foxy operating principles">
          <div className="mx-auto grid max-w-[1180px] gap-7 px-5 py-9 sm:grid-cols-3 sm:px-8">
            <div className="flex items-start gap-3"><ShieldCheck size={22} className="mt-0.5 shrink-0 text-[#536a46]" aria-hidden="true" /><div><h2 className="font-sans text-sm font-extrabold tracking-tight">Local-first by design</h2><p className="mt-1 text-xs leading-6 text-[#59665d]">The connector runs on the developer’s machine over MCP STDIO.</p></div></div>
            <div className="flex items-start gap-3"><Fingerprint size={22} className="mt-0.5 shrink-0 text-[#536a46]" aria-hidden="true" /><div><h2 className="font-sans text-sm font-extrabold tracking-tight">Explicit workspace scope</h2><p className="mt-1 text-xs leading-6 text-[#59665d]">Canonical Git-root authorization is enforced by the local server.</p></div></div>
            <div className="flex items-start gap-3"><Monitor size={22} className="mt-0.5 shrink-0 text-[#536a46]" aria-hidden="true" /><div><h2 className="font-sans text-sm font-extrabold tracking-tight">Cross-platform engineering</h2><p className="mt-1 text-xs leading-6 text-[#59665d]">The current beta.5 queue candidate still needs source-matched CI and live host acceptance.</p></div></div>
          </div>
        </section>

        <section id="connect" className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#c7f36a]">01 / Host configuration</p>
              <h2 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-4xl">One connector. Six integration targets.</h2>
            </div>
            <p className="max-w-[580px] text-sm leading-7 text-[#aab5ad] lg:justify-self-end">
              The setup command detects supported host markers and writes project-scoped MCP configuration. Choose a host explicitly when automatic detection is not appropriate.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hosts.map((host, index) => (
              <article key={host.id} className="group border border-[#2b3832] bg-[#111b18] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c7f36a]/70 hover:bg-[#15211b] sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[.16em] text-[#c7f36a]">0{index + 1}</span>
                  <CircleDot size={15} className="text-[#728077] transition-colors group-hover:text-[#c7f36a]" aria-hidden="true" />
                </div>
                <h3 className="mt-5 font-sans text-lg font-extrabold tracking-tight">{host.name}</h3>
                <p className="mt-2 min-h-[44px] text-xs leading-6 text-[#aab5ad]">{host.detail}</p>
                <p className="mt-5 border-t border-white/10 pt-3 font-mono text-[10px] uppercase tracking-[.12em] text-[#87958b]">--agent {host.id}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-4 border border-[#33413b] bg-[#111b18] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
            <div><h3 className="font-sans text-sm font-extrabold">Connecting another MCP-compatible client?</h3><p className="mt-1 text-xs leading-6 text-[#aab5ad]">Use <code className="border border-white/10 bg-[#0b1112] px-1.5 py-1 font-mono text-[#c7f36a]">vibesane connect --agent mcp</code> to print a generic STDIO entry. Non-MCP agents need their own integration surface.</p></div>
            <a href="https://github.com/Darkhero766/Vibeguard/blob/feat/agentshield-cross-platform-autoconnect/docs/AGENTSHIELD_CODING_AGENT_BETA_INSTALL.md" target="_blank" rel="noreferrer" className="vg-focus inline-flex items-center gap-2 text-sm font-bold text-[#c7f36a] hover:underline">Setup notes <ArrowRight size={15} aria-hidden="true" /></a>
          </div>
        </section>

        <section id="security-model" className="border-y border-[#dce3da] bg-[#f4f6f0] text-[#0b1112]">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#536a46]">02 / Security boundaries</p>
              <h2 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-4xl">Useful context. No extra authority.</h2>
              <p className="mt-6 text-sm leading-8 text-[#59665d]">
                Foxy exposes security analysis through a local MCP server. The selected repository root is passed as an explicit allowlist, and requested workspace paths are checked against that scope. Registration is not host approval and does not replace the coding agent’s own permission controls.
              </p>
              <div className="mt-8 flex items-start gap-3 border border-[#d1dbcf] bg-white/70 p-5">
                <KeyRound className="mt-0.5 shrink-0 text-[#536a46]" size={20} aria-hidden="true" />
                <p className="text-xs leading-6 text-[#435147]">Connect registers MCP only. It does not install lifecycle hooks, approve the host, or grant the agent additional permissions.</p>
              </div>
            </div>
            <div className="space-y-4">
              {boundaries.map((item) => (
                <div key={item} className="flex gap-3 border-b border-[#dce3da] pb-4">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#536a46]" aria-hidden="true" />
                  <p className="text-sm leading-6 text-[#435147]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="qualification" className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
          <div className="max-w-[760px]">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#c7f36a]">03 / Qualification evidence</p>
            <h2 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-4xl">Evidence first. Release claims second.</h2>
            <p className="mt-5 text-sm leading-7 text-[#aab5ad]">The previous beta.4 connector revision passed its Windows/macOS matrix. The current beta.5 candidate adds a transactional SQLite queue and additional multi-process regressions; its exact-source CI result is still pending. The earlier run does not qualify these new changes.</p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <article className="border border-[#33413b] bg-[#111b18] p-6 sm:p-8">
              <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.14em] text-[#a3ada5]"><PackageCheck size={16} aria-hidden="true" /> Historical · prior revision</div>
              <h3 className="mt-5 font-sans text-2xl font-extrabold tracking-tight">Beta.4 connector matrix</h3>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="border border-white/10 bg-[#0b1112] p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9eaaa1]">Regression suite</p><p className="mt-2 text-2xl font-extrabold tracking-tight">429 / 429</p><p className="mt-1 text-[11px] text-[#9eaaa1]">per platform</p></div>
                <div className="border border-white/10 bg-[#0b1112] p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9eaaa1]">Connector regressions</p><p className="mt-2 text-2xl font-extrabold tracking-tight">12 / 12</p><p className="mt-1 text-[11px] text-[#9eaaa1]">per platform</p></div>
              </div>
              <p className="mt-5 text-xs leading-6 text-[#aab5ad]">Run #75 passed 429/429 regression tests and 12/12 connector checks per platform on the earlier beta.4 connector SHA. It did not include beta.5’s SQLite queue, cross-process cancellation or crash-recovery changes.</p>
              <a href="https://github.com/Darkhero766/Vibeguard/actions/workflows/agentshield-cross-platform.yml?query=branch%3Afeat%2Fagentshield-cross-platform-autoconnect" target="_blank" rel="noreferrer" className="vg-focus mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#c7f36a] hover:underline">Open qualification workflow history <ArrowRight size={15} aria-hidden="true" /></a>
            </article>
            <article className="border border-[#33413b] bg-[#111b18] p-6 sm:p-8">
              <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.14em] text-[#a3ada5]"><MonitorCog size={16} aria-hidden="true" /> Separate release gates</div>
              <h3 className="mt-5 font-sans text-2xl font-extrabold tracking-tight">Human validation still required</h3>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-[#aab5ad]">
                <li>Live authenticated acceptance with supported host applications and real version combinations.</li>
                <li>Independent security review of configuration mutation, path authorization, MCP tools and package provenance.</li>
                <li>Manual Windows and macOS installation, restart, approval, tool-call and disconnect exercises.</li>
              </ul>
              <a href="https://github.com/Darkhero766/Vibeguard/pull/70" target="_blank" rel="noreferrer" className="vg-focus mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#c7f36a] hover:underline">Review engineering PR <ArrowRight size={15} aria-hidden="true" /></a>
            </article>
          </div>
          <div className="mt-8 border-l-2 border-[#c7f36a] bg-[#111b18] px-5 py-4">
            <p className="text-xs leading-6 text-[#aab5ad]">Release status: private beta / reviewer preview. The package is unpublished. Automated tests do not establish security certification, full real-world precision, exploit resistance, or compatibility with every host release. Do not use this preview as the sole control for a production system.</p>
          </div>
        </section>

        <section className="border-t border-[#28352f] bg-[#c7f36a] text-[#0b1112]">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-7 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.16em]">VibeSane / Foxy</p>
              <h2 className="mt-3 max-w-[680px] font-sans text-2xl font-extrabold leading-tight tracking-[-.05em] sm:text-3xl">Bring security context into the tools where you build.</h2>
              <p className="mt-3 max-w-[600px] text-sm leading-7 text-[#26362a]">Explore the repository scanner, inspect qualification evidence, or review the setup notes before trying a local reviewer build.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/scan-public" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#0b1112] bg-[#0b1112] px-5 py-3.5 text-sm font-bold text-[#f4f6f0]">Open web scanner <ArrowRight size={15} aria-hidden="true" /></Link>
              <a href="https://github.com/Darkhero766/Vibeguard/pull/70" target="_blank" rel="noreferrer" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#0b1112]/35 bg-transparent px-5 py-3.5 text-sm font-semibold text-[#0b1112]"><Github size={15} aria-hidden="true" /> Engineering PR</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
