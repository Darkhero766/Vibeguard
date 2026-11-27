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
  { name: 'GitHub Copilot', id: 'copilot', detail: 'Workspace-root .mcp.json; VS Code guided setup may require chat.mcp.workspaceRootConfig.enabled' },
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
    meta?.setAttribute('content', 'Connect supported AI coding-agent hosts to VibeSane Foxy with a workspace-scoped, read-only MCP integration. The current beta.5 SQLite queue candidate still needs exact-source Windows/macOS CI and real-host acceptance; independent security review is also pending.');
    return () => {
      document.title = previousTitle;
      if (meta && prior != null) meta.setAttribute('content', prior);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f1ea] text-[#101111]">
      <Nav />
      <main id="main-content">
        <section className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_76%_22%,rgba(227,74,59,.11),transparent_30%),radial-gradient(circle_at_12%_8%,rgba(244,200,66,.19),transparent_24%)]" />
          <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.08fr_.92fr] lg:gap-16">
            <div className="vg-rise">
              <p className="inline-flex items-center gap-2 border border-[#d5d0c5] bg-[#fbf9f3] px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[.16em] text-[#545951]">
                <Bot size={14} aria-hidden="true" /> Foxy / MCP security integration
              </p>
              <h1 className="mt-8 max-w-[760px] font-sans text-[clamp(3.15rem,7.2vw,6.4rem)] font-extrabold leading-[.98] tracking-[-.075em]">
                Security context for your AI agent.
                <span className="mt-2 block text-[#d94739]">Not extra authority.</span>
              </h1>
              <p className="mt-7 max-w-[630px] text-[15px] leading-8 text-[#535750] sm:text-lg">
                Foxy connects supported coding agents to VibeSane’s local security engine through MCP STDIO. Inspect supported changes, understand findings, and verify remediation while access stays scoped to the selected repository.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#connect" className="vg-button vg-focus inline-flex items-center gap-2 border-2 border-[#101111] bg-[#101111] px-5 py-3.5 text-sm font-bold text-[#f4f1ea] shadow-[4px_4px_0_#e34a3b]">
                  Explore integrations <ArrowRight size={16} aria-hidden="true" />
                </a>
                <a href="#qualification" className="vg-button vg-focus inline-flex items-center gap-2 border-2 border-[#101111] bg-transparent px-5 py-3.5 text-sm font-bold text-[#101111]">
                  View qualification <PackageCheck size={16} aria-hidden="true" />
                </a>
              </div>
              <p className="mt-7 max-w-[650px] font-mono text-[10px] uppercase leading-6 tracking-[.13em] text-[#777b72]">
                Private beta · Node.js 24.15+ · beta.5 exact-source CI pending · Windows + macOS matrix
              </p>
            </div>

            <div className="vg-rise border border-[#303632] bg-[#111613] p-5 text-[#f4f1ea] shadow-[9px_9px_0_#e34a3b] sm:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-2" aria-label="Terminal window">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#d94739]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f4c842]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#7e9d83]" />
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[.18em] text-[#aeb5ac]">Workspace connection</span>
              </div>
              <div className="mt-7 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-[#f4c842]"><Terminal size={14} aria-hidden="true" /> Local terminal</div>
              <pre className="mt-4 overflow-x-auto border border-white/10 bg-[#191f1b] p-5 font-mono text-[12px] leading-7 text-[#f4f1ea] sm:text-[13px]"><code><span className="text-[#83bd91]">$</span> vibesane connect --agent auto{"\n"}<span className="text-[#83bd91]">$</span> vibesane doctor{"\n"}<span className="text-[#83bd91]">$</span> vibesane disconnect --agent all</code></pre>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="border border-white/10 bg-white/[.03] p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#aeb5ac]">Access model</p>
                  <p className="mt-2 text-lg font-bold tracking-tight text-[#f4c842]">Read-only</p>
                </div>
                <div className="border border-white/10 bg-white/[.03] p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#aeb5ac]">Workspace scope</p>
                  <p className="mt-2 text-lg font-bold tracking-tight text-[#f4c842]">One Git root</p>
                </div>
              </div>
              <p className="mt-6 text-[11px] leading-6 text-[#b8beb6]">The CLI is not published. Commands shown are for authorized local builds; this page does not install software or change your agent configuration.</p>
            </div>
          </div>
        </section>

        <section className="border-y border-[#d9d5cc] bg-[#ebe7de]">
          <div className="mx-auto grid max-w-[1180px] gap-6 px-5 py-8 sm:grid-cols-3 sm:px-8">
            <div className="flex items-start gap-3"><ShieldCheck size={21} className="mt-0.5 shrink-0 text-[#d94739]" aria-hidden="true" /><div><h2 className="font-sans text-sm font-bold tracking-tight">Local-first by design</h2><p className="mt-1 text-xs leading-6 text-[#62665e]">The connector runs locally over MCP STDIO.</p></div></div>
            <div className="flex items-start gap-3"><Fingerprint size={21} className="mt-0.5 shrink-0 text-[#d94739]" aria-hidden="true" /><div><h2 className="font-sans text-sm font-bold tracking-tight">Explicit workspace scope</h2><p className="mt-1 text-xs leading-6 text-[#62665e]">Canonical Git-root authorization is enforced by the local server.</p></div></div>
            <div className="flex items-start gap-3"><Monitor size={21} className="mt-0.5 shrink-0 text-[#d94739]" aria-hidden="true" /><div><h2 className="font-sans text-sm font-bold tracking-tight">Cross-platform engineering</h2><p className="mt-1 text-xs leading-6 text-[#62665e]">The connector targets Windows and macOS. The previous green matrix covered an earlier connector-only revision; beta.5's SQLite queue changes still need exact-source CI and live host acceptance.</p></div></div>
          </div>
        </section>

        <section id="connect" className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#d94739]">01 / Host configuration</p>
              <h2 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-4xl">One connector. Six integration targets.</h2>
            </div>
            <p className="max-w-[580px] text-sm leading-7 text-[#62665e] lg:justify-self-end">
              The setup command detects supported host markers and writes project-scoped MCP configuration. You can choose a host explicitly when automatic detection is not appropriate.
            </p>
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hosts.map((host, index) => (
              <article key={host.id} className="group border border-[#d5d1c8] bg-[#fbf9f3] p-5 transition-all duration-200 hover:-translate-y-1 hover:border-[#101111] hover:shadow-[4px_4px_0_#f4c842] sm:p-6">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] tracking-[.16em] text-[#d94739]">0{index + 1}</span>
                  <CircleDot size={15} className="text-[#a1a59d] transition-colors group-hover:text-[#d94739]" aria-hidden="true" />
                </div>
                <h3 className="mt-5 font-sans text-lg font-bold tracking-tight">{host.name}</h3>
                <p className="mt-2 min-h-[44px] text-xs leading-6 text-[#666a62]">{host.detail}</p>
                <p className="mt-5 border-t border-[#e4e0d7] pt-3 font-mono text-[10px] uppercase tracking-[.12em] text-[#777b72]">--agent {host.id}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 grid gap-4 border border-[#d8d3c9] bg-[#ebe7de] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
            <div><h3 className="font-sans text-sm font-bold">Connecting another MCP-compatible client?</h3><p className="mt-1 text-xs leading-6 text-[#62665e]">Use <code className="bg-[#f4f1ea] px-1.5 py-1 font-mono text-[#101111]">vibesane connect --agent mcp</code> to print a generic STDIO entry. Non-MCP agents need their own integration surface.</p></div>
            <a href="https://github.com/Darkhero766/Vibeguard/blob/feat/agentshield-cross-platform-autoconnect/docs/AGENTSHIELD_CODING_AGENT_BETA_INSTALL.md" target="_blank" rel="noreferrer" className="vg-focus inline-flex items-center gap-2 text-sm font-bold text-[#d94739] hover:underline">Setup notes <ArrowRight size={15} aria-hidden="true" /></a>
          </div>
        </section>

        <section id="security-model" className="border-y border-[#252b27] bg-[#111613] text-[#f4f1ea]">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#f4c842]">02 / Security boundaries</p>
              <h2 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-4xl">Useful context. No extra authority.</h2>
              <p className="mt-6 text-sm leading-8 text-[#b8beb6]">
                Foxy exposes security analysis through a local MCP server. The selected repository root is passed as an explicit allowlist, and requested workspace paths are checked against that scope. The connector does not replace the coding agent’s permission controls.
              </p>
              <div className="mt-8 flex items-start gap-3 border border-white/15 bg-white/[.03] p-5">
                <KeyRound className="mt-0.5 shrink-0 text-[#f4c842]" size={20} aria-hidden="true" />
                <p className="text-xs leading-6 text-[#d3d8d0]">Registration is not approval. Restart the host and approve the MCP server using the host’s own trust and permission controls.</p>
              </div>
            </div>
            <div className="space-y-4">
              {boundaries.map((item, index) => (
                <div key={item} className="flex gap-3 border-b border-white/10 pb-4">
                  <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#f4c842]" aria-hidden="true" />
                  <p className="text-sm leading-6 text-[#d3d8d0]">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="qualification" className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
          <div className="max-w-[760px]">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#d94739]">03 / Qualification evidence</p>
            <h2 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-4xl">Verified on the build. Honest about what remains.</h2>
            <p className="mt-5 text-sm leading-7 text-[#62665e]">The previous beta.4 connector revision passed its Windows/macOS matrix. The current beta.5 candidate adds a transactional SQLite queue and new multi-process tests; its exact-source CI result is still pending. The earlier run is not evidence for these queue changes.</p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <article className="border border-[#b8c4b5] bg-[#f9faf5] p-6 sm:p-8">
              <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.14em] text-[#6c7068]"><PackageCheck size={16} aria-hidden="true" /> Historical · prior revision</div>
              <h3 className="mt-5 font-sans text-2xl font-extrabold tracking-tight">Beta.4 connector matrix</h3>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="border border-[#dce3d8] bg-white p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#70796f]">Regression suite</p><p className="mt-2 text-2xl font-extrabold tracking-tight">429 / 429</p><p className="mt-1 text-[11px] text-[#62665e]">per platform</p></div>
                <div className="border border-[#dce3d8] bg-white p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#70796f]">Connector regressions</p><p className="mt-2 text-2xl font-extrabold tracking-tight">12 / 12</p><p className="mt-1 text-[11px] text-[#62665e]">per platform</p></div>
              </div>
              <p className="mt-5 text-xs leading-6 text-[#62665e]">Run #75 passed 429/429 regression tests and 12/12 connector checks per platform on the earlier beta.4 connector SHA. It did not include beta.5's SQLite queue, cross-process cancellation or crash-recovery changes.</p>
              <a href="https://github.com/Darkhero766/Vibeguard/actions/workflows/agentshield-cross-platform.yml?query=branch%3Afeat%2Fagentshield-cross-platform-autoconnect" target="_blank" rel="noreferrer" className="vg-focus mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#d94739] hover:underline">Open qualification workflow history <ArrowRight size={15} aria-hidden="true" /></a>
            </article>
            <article className="border border-[#d5d1c8] bg-[#ebe7de] p-6 sm:p-8">
              <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.14em] text-[#6c7068]"><MonitorCog size={16} aria-hidden="true" /> Separate release gates</div>
              <h3 className="mt-5 font-sans text-2xl font-extrabold tracking-tight">Human validation still required</h3>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-[#62665e]">
                <li>Live, authenticated acceptance with supported host applications and their real version combinations.</li>
                <li>Independent security review of configuration mutation, path authorization, MCP tools and package provenance.</li>
                <li>Manual Windows and macOS installation, restart, approval and disconnect exercises on real machines.</li>
              </ul>
              <a href="https://github.com/Darkhero766/Vibeguard/pull/70" target="_blank" rel="noreferrer" className="vg-focus mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#d94739] hover:underline">Review engineering PR <ArrowRight size={15} aria-hidden="true" /></a>
            </article>
          </div>
          <div className="mt-8 border-l-2 border-[#e1b52c] bg-[#ebe7de] px-5 py-4">
            <p className="text-xs leading-6 text-[#555b53]">Release status: private beta / reviewer preview. The package is unpublished. Automated tests do not establish security certification, full real-world precision, exploit resistance, or compatibility with every host release. Do not use this preview as the sole control for a production system.</p>
          </div>
        </section>

        <section className="border-t border-[#d9d5cc] bg-[#f4c842]">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-7 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.16em]">VibeSane / Foxy</p>
              <h2 className="mt-3 max-w-[680px] font-sans text-2xl font-extrabold leading-tight tracking-[-.05em] sm:text-3xl">Bring security context into the tools where you build.</h2>
              <p className="mt-3 max-w-[600px] text-sm leading-7 text-[#393b35]">Explore the repository scanner, follow the qualification evidence, or review the setup notes before trying a local build.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/scan-public" className="vg-button vg-focus inline-flex items-center gap-2 border-2 border-[#101111] bg-[#101111] px-5 py-3.5 text-sm font-bold text-[#f4f1ea]">Open web scanner <ArrowRight size={15} aria-hidden="true" /></Link>
              <a href="https://github.com/Darkhero766/Vibeguard/pull/70" target="_blank" rel="noreferrer" className="vg-button vg-focus inline-flex items-center gap-2 border-2 border-[#101111] bg-transparent px-5 py-3.5 text-sm font-bold text-[#101111]"><Github size={15} aria-hidden="true" /> Engineering PR</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
