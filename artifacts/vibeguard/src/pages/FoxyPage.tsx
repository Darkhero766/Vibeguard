import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight, Bot, CheckCircle2, CircleDot, Copy, Fingerprint, Github, KeyRound,
  Monitor, MonitorCog, PackageCheck, ShieldCheck, Terminal,
} from 'lucide-react';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

const FOXY_UNIX_INSTALL_COMMAND = 'curl -fsSL https://vibesane.app/install.sh | bash';
const FOXY_WINDOWS_INSTALL_COMMAND = (agent: InstallAgent) => "$env:FOXY_INSTALL_AGENT='" + agent + "'; irm https://vibesane.app/install.ps1 | iex";
type InstallPlatform = 'unix' | 'windows';
type InstallAgent = 'auto' | 'claude' | 'codex' | 'cursor' | 'gemini' | 'roo' | 'copilot';
const installAgentOptions: Array<{ id: InstallAgent; label: string }> = [
  { id: 'auto', label: 'Auto-detect installed agents (recommended)' },
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex CLI' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'gemini', label: 'Gemini CLI' },
  { id: 'roo', label: 'Roo Code' },
  { id: 'copilot', label: 'GitHub Copilot' },
];
// Enable only in a release build after npm publication and package provenance are verified.
const FOXY_BETA_INSTALL_ENABLED = import.meta.env.VITE_FOXY_BETA_INSTALL_ENABLED === 'true';

const hosts = [
  { name: 'Claude Code', id: 'claude', detail: 'Project-level .mcp.json registration' },
  { name: 'Codex CLI', id: 'codex', detail: 'Project-level .codex/config.toml registration' },
  { name: 'Cursor', id: 'cursor', detail: 'Project-level .cursor/mcp.json registration' },
  { name: 'Gemini CLI', id: 'gemini', detail: 'Project-level .gemini/settings.json registration' },
  { name: 'Roo Code', id: 'roo', detail: 'Project-level .roo/mcp.json registration' },
  { name: 'GitHub Copilot', id: 'copilot', detail: 'Workspace-root .mcp.json; VS Code may require chat.mcp.workspaceRootConfig.enabled' },
];

const boundaries = [
  'Repository files are never modified. Foxy maintains only its own local scan, baseline and queue state.',
  'No shell, patch, commit, or deploy tools are exposed.',
  'Only the canonical Git root selected during setup is authorized.',
  'The connector does not execute repository scripts or project code.',
  'Existing host configuration is backed up and unrelated entries are preserved.',
  'Malformed, symlinked, oversized, or conflicting configuration is refused.',
  'Host approval and each coding agent’s own permission model remain in control.',
];

export default function FoxyPage() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [selectedAgent, setSelectedAgent] = useState<InstallAgent>('auto');
  const [selectedPlatform, setSelectedPlatform] = useState<InstallPlatform>('unix');
  const installCommand = selectedPlatform === 'windows'
    ? FOXY_WINDOWS_INSTALL_COMMAND(selectedAgent)
    : FOXY_UNIX_INSTALL_COMMAND + (selectedAgent === 'auto' ? '' : ' -s -- --agent ' + selectedAgent);

  const copyInstallCommand = async () => {
    if (!FOXY_BETA_INSTALL_ENABLED) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.');
      await navigator.clipboard.writeText(installCommand);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Foxy — Local-first MCP security for AI coding agents | VibeSane';
    const meta = document.querySelector('meta[name="description"]');
    const prior = meta?.getAttribute('content');
    meta?.setAttribute('content', 'Foxy is a local-first, workspace-scoped MCP security integration for Claude Code, Codex, Cursor, Gemini CLI, Roo Code and GitHub Copilot. It never modifies repository files or executes project code; scan, baseline and queue operations update only Foxy-managed local state. Beta.6 passed automated Windows, macOS and Linux qualification; live host acceptance and independent security review remain open.');
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
                <a href="#install" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#c7f36a] bg-[#c7f36a] px-5 py-3.5 text-sm font-bold text-[#0b1112] shadow-[0_6px_22px_rgba(199,243,106,.12)]">
                  Install MCP <ArrowRight size={16} aria-hidden="true" />
                </a>
                <a href="#qualification" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#35433a] bg-[#111b18] px-5 py-3.5 text-sm font-semibold text-[#f4f6f0] hover:border-[#c7f36a]">
                  View release evidence <PackageCheck size={16} aria-hidden="true" />
                </a>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] uppercase leading-5 tracking-[.14em] text-[#87958b]">
                <span>Beta 0.7.0-beta.6</span><span>Node.js 24.15+</span><span>Windows · macOS · Linux</span><span>No repository writes</span>
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
              <div className="mt-7 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-[#c7f36a]"><Terminal size={14} aria-hidden="true" /> Local reviewer build</div>
              <pre className="mt-4 overflow-x-auto border border-white/10 bg-[#0b1112] p-5 font-mono text-[12px] leading-7 text-[#e8eee7] sm:text-[13px]"><code><span className="text-[#c7f36a]">$</span> foxy install --agent auto{'\\n'}<span className="text-[#c7f36a]">$</span> foxy doctor{'\\n'}<span className="text-[#c7f36a]">$</span> foxy disconnect --agent all</code></pre>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="border border-white/10 bg-white/[.03] p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#9eaaa1]">Access model</p>
                  <p className="mt-2 text-lg font-bold tracking-tight text-[#c7f36a]">No repo writes</p>
                </div>
                <div className="border border-white/10 bg-white/[.03] p-4">
                  <p className="font-mono text-[9px] uppercase tracking-[.14em] text-[#9eaaa1]">Workspace scope</p>
                  <p className="mt-2 text-lg font-bold tracking-tight text-[#c7f36a]">One Git root</p>
                </div>
              </div>
              <p className="mt-6 border-t border-white/10 pt-4 text-[11px] leading-6 text-[#aab5ad]">The npm package remains unpublished. The website cannot write to your computer or approve an AI host. In a local session, Foxy may update its own scan, baseline and queue state, but it never modifies repository files.</p>
            </aside>
          </div>
        </section>

        <section className="border-y border-[#dce3da] bg-[#f4f6f0] text-[#0b1112]" aria-label="Foxy operating principles">
          <div className="mx-auto grid max-w-[1180px] gap-7 px-5 py-9 sm:grid-cols-3 sm:px-8">
            <div className="flex items-start gap-3"><ShieldCheck size={22} className="mt-0.5 shrink-0 text-[#536a46]" aria-hidden="true" /><div><h2 className="font-sans text-sm font-extrabold tracking-tight">Local-first by design</h2><p className="mt-1 text-xs leading-6 text-[#59665d]">The connector runs on the developer’s machine over MCP STDIO.</p></div></div>
            <div className="flex items-start gap-3"><Fingerprint size={22} className="mt-0.5 shrink-0 text-[#536a46]" aria-hidden="true" /><div><h2 className="font-sans text-sm font-extrabold tracking-tight">Explicit workspace scope</h2><p className="mt-1 text-xs leading-6 text-[#59665d]">Canonical Git-root authorization is enforced by the local server.</p></div></div>
            <div className="flex items-start gap-3"><Monitor size={22} className="mt-0.5 shrink-0 text-[#536a46]" aria-hidden="true" /><div><h2 className="font-sans text-sm font-extrabold tracking-tight">Cross-platform engineering</h2><p className="mt-1 text-xs leading-6 text-[#59665d]">Beta.6 passed automated qualification on Windows, macOS and Ubuntu/Linux; real host acceptance remains separate.</p></div></div>
          </div>
        </section>

        <section id="install" className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#c7f36a]">01 / Install MCP</p>
              <h2 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-4xl">One command. Your repository. Your approval.</h2>
              <p className="mt-5 text-sm leading-7 text-[#aab5ad]">Run Foxy from the root of a Git repository. It detects supported coding agents, previews the exact project-level MCP configuration files, asks for consent, writes only the selected MCP entries, and reopens them to verify the result.</p>
              <ol className="mt-7 space-y-4 text-sm leading-6 text-[#d7dfd6]">
                <li className="flex gap-3"><span className="font-mono text-[#c7f36a]">01</span><span>Open your project in a terminal and run the installer.</span></li>
                <li className="flex gap-3"><span className="font-mono text-[#c7f36a]">02</span><span>Review detected agents and the exact configuration targets; confirm only when the plan is correct.</span></li>
                <li className="flex gap-3"><span className="font-mono text-[#c7f36a]">03</span><span>Restart the selected coding agent and approve its project MCP server using that host’s trust controls.</span></li>
              </ol>
            </div>
            <div className="border border-[#344139] bg-[#111b18] p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[10px] uppercase tracking-[.15em] text-[#9eaaa1]">Beta channel · one-line installer</p>
                <span className="border border-[#6b5733] bg-[#211b12] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[.12em] text-[#e4c58f]">Private beta</span>
              </div>
              <label htmlFor="foxy-install-platform" className="mt-5 block font-mono text-[10px] uppercase tracking-[.13em] text-[#9eaaa1]">
                Operating system
              </label>
              <select
                id="foxy-install-platform"
                value={selectedPlatform}
                onChange={(event) => {
                  setSelectedPlatform(event.target.value as InstallPlatform);
                  setCopyState('idle');
                }}
                className="vg-focus mt-2 w-full border border-white/15 bg-[#0b1112] px-3 py-3 text-sm text-[#f4f6f0]"
              >
                <option value="unix">macOS / Linux (curl)</option>
                <option value="windows">Windows PowerShell</option>
              </select>
              <label htmlFor="foxy-install-agent" className="mt-5 block font-mono text-[10px] uppercase tracking-[.13em] text-[#9eaaa1]">
                Configure for
              </label>
              <select
                id="foxy-install-agent"
                value={selectedAgent}
                onChange={(event) => {
                  setSelectedAgent(event.target.value as InstallAgent);
                  setCopyState('idle');
                }}
                aria-describedby="foxy-install-agent-help"
                className="vg-focus mt-2 w-full border border-white/15 bg-[#0b1112] px-3 py-3 text-sm text-[#f4f6f0]"
              >
                {installAgentOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
              <p id="foxy-install-agent-help" className="mt-2 text-[11px] leading-5 text-[#9eaaa1]">
                Auto-detect configures supported agents found in this project. Select one host to target it explicitly. The installer checks the official npm registry and stops safely while the beta remains unpublished.
              </p>
              <pre className="mt-4 overflow-x-auto border border-white/10 bg-[#0b1112] p-4 font-mono text-[12px] leading-7 text-[#e8eee7] sm:text-[13px]"><code>{installCommand}</code></pre>
              <button
                type="button"
                onClick={copyInstallCommand}
                disabled={!FOXY_BETA_INSTALL_ENABLED}
                className="vg-button vg-focus mt-4 inline-flex w-full items-center justify-center gap-2 border border-[#c7f36a] bg-[#c7f36a] px-5 py-3 text-sm font-bold text-[#0b1112] disabled:cursor-not-allowed disabled:border-white/15 disabled:bg-white/10 disabled:text-[#87958b]"
                aria-describedby="foxy-install-status"
              >
                {FOXY_BETA_INSTALL_ENABLED ? <><Copy size={15} aria-hidden="true" /> Copy install command</> : <><PackageCheck size={15} aria-hidden="true" /> Available after beta publication</>}
              </button>
              <p className="mt-2 break-all font-mono text-[10px] leading-5 text-[#9eaaa1]">
                Windows PowerShell: $env:FOXY_INSTALL_AGENT='auto'; irm https://vibesane.app/install.ps1 | iex
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs">
                <a href="/install.sh" target="_blank" rel="noreferrer" className="text-[#c7f36a] underline underline-offset-4">Inspect POSIX installer</a>
                <a href="/install.ps1" target="_blank" rel="noreferrer" className="text-[#c7f36a] underline underline-offset-4">Inspect PowerShell installer</a>
              </div>
              <p id="foxy-install-status" role="status" aria-live="polite" className="mt-3 min-h-6 text-xs leading-6 text-[#aab5ad]">
                {!FOXY_BETA_INSTALL_ENABLED
                  ? 'The npm package is not published yet. The command is shown for transparency and cannot install until the release owner publishes the verified package.'
                  : copyState === 'copied'
                    ? 'Command copied. Paste it in the terminal opened at your project root.'
                    : copyState === 'error'
                      ? 'Clipboard access failed. Select and copy the command manually.'
                      : 'Copy the command, open your project terminal, and run it there.'}
              </p>
              <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:flex-wrap">
                <a href="https://github.com/Darkhero766/Vibeguard/blob/feat/agentshield-cross-platform-autoconnect/docs/FOXY_UNIVERSAL_INSTALLER_PILOT.md" target="_blank" rel="noreferrer" className="vg-focus inline-flex items-center gap-2 text-sm font-semibold text-[#c7f36a] hover:underline">Local reviewer install guide <ArrowRight size={15} aria-hidden="true" /></a>
                <a href="https://github.com/Darkhero766/Vibeguard/actions/runs/46140045503" target="_blank" rel="noreferrer" className="vg-focus inline-flex items-center gap-2 text-sm font-semibold text-[#c7f36a] hover:underline">Cross-platform evidence <ArrowRight size={15} aria-hidden="true" /></a>
              </div>
            </div>
          </div>
          <p className="mt-6 border-l-2 border-[#c7f36a] bg-[#111b18] px-5 py-4 text-xs leading-6 text-[#aab5ad]">MCP registration only. Foxy does not install lifecycle hooks, grant host trust, execute project code or enable completion enforcement. A website cannot modify local host configuration: the installer runs in your terminal and you approve the exact plan.</p>
        </section>

        <section id="connect" className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#c7f36a]">02 / Host configuration</p>
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
              <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#536a46]">03 / Security boundaries</p>
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
          <div className="max-w-[780px]">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#c7f36a]">04 / Qualification evidence</p>
            <h2 className="mt-4 font-sans text-3xl font-extrabold leading-tight tracking-[-.05em] sm:text-4xl">Beta.6 passed the three-platform automated matrix.</h2>
            <p className="mt-5 text-sm leading-7 text-[#aab5ad]">The exact Beta.6 code revision passed the complete release validator on Windows, macOS and Ubuntu/Linux. The evidence is tied to one source commit and a reproducible 30-file package manifest; it does not replace independent review or real coding-agent host acceptance.</p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
            <article className="border border-[#33413b] bg-[#111b18] p-6 sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[.14em] text-[#a3ada5]">Exact-source CI · 28 November 2026</p>
                <span className="font-mono text-[10px] uppercase tracking-[.12em] text-[#c7f36a]">3 / 3 operating systems passed</span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="border border-white/10 bg-[#0b1112] p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9eaaa1]">Windows</p><p className="mt-2 text-2xl font-extrabold tracking-tight">472 / 472</p><p className="mt-1 text-[11px] text-[#9eaaa1]">regression tests</p></div>
                <div className="border border-white/10 bg-[#0b1112] p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9eaaa1]">macOS</p><p className="mt-2 text-2xl font-extrabold tracking-tight">472 / 472</p><p className="mt-1 text-[11px] text-[#9eaaa1]">regression tests</p></div>
                <div className="border border-white/10 bg-[#0b1112] p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9eaaa1]">Ubuntu / Linux</p><p className="mt-2 text-2xl font-extrabold tracking-tight">472 / 472</p><p className="mt-1 text-[11px] text-[#9eaaa1]">regression tests</p></div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="border border-white/10 bg-white/[.03] p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9eaaa1]">MCP smoke</p><p className="mt-2 text-xl font-bold">10 tools</p><p className="mt-1 text-[11px] text-[#9eaaa1]">protocol + queue</p></div>
                <div className="border border-white/10 bg-white/[.03] p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9eaaa1]">Package</p><p className="mt-2 text-xl font-bold">30 files</p><p className="mt-1 text-[11px] text-[#9eaaa1]">same content hash</p></div>
                <div className="border border-white/10 bg-white/[.03] p-4"><p className="font-mono text-[9px] uppercase tracking-[.12em] text-[#9eaaa1]">Failure count</p><p className="mt-2 text-xl font-bold">0</p><p className="mt-1 text-[11px] text-[#9eaaa1]">qualification steps</p></div>
              </div>
              <p className="mt-6 break-all font-mono text-[10px] leading-6 text-[#87958b]">Package SHA-256 · edf7851ec847dce63f24c66b59b396bae770d69e9e4e52843709df1778a816b8</p>
              <div className="mt-6 flex flex-wrap gap-4">
                <a href="https://github.com/Darkhero766/Vibeguard/actions/runs/46140045503" target="_blank" rel="noreferrer" className="vg-focus inline-flex items-center gap-2 text-sm font-bold text-[#c7f36a] hover:underline">Open exact-source run <ArrowRight size={15} aria-hidden="true" /></a>
                <a href="https://github.com/Darkhero766/Vibeguard/pull/70" target="_blank" rel="noreferrer" className="vg-focus inline-flex items-center gap-2 text-sm font-bold text-[#c7f36a] hover:underline">Review engineering PR <ArrowRight size={15} aria-hidden="true" /></a>
              </div>
            </article>
            <article className="border border-[#33413b] bg-[#111b18] p-6 sm:p-8">
              <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.14em] text-[#a3ada5]"><MonitorCog size={16} aria-hidden="true" /> Separate release gates</div>
              <h3 className="mt-5 font-sans text-2xl font-extrabold tracking-tight">What CI cannot prove</h3>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-[#aab5ad]">
                <li>Real MCP discovery, host approval, lifecycle behavior and uninstall in each supported coding-agent application.</li>
                <li>Independent security review of authorization, configuration mutation, queue integrity and package supply chain.</li>
                <li>npm scope ownership, package provenance/signing, support and rollback procedures, and explicit publication approval.</li>
              </ul>
              <a href="https://github.com/Darkhero766/Vibeguard/blob/feat/agentshield-cross-platform-autoconnect/docs/FOXY_REAL_HOST_ACCEPTANCE_RUNBOOK.md" target="_blank" rel="noreferrer" className="vg-focus mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#c7f36a] hover:underline">Open host acceptance runbook <ArrowRight size={15} aria-hidden="true" /></a>
            </article>
          </div>
          <div className="mt-8 border-l-2 border-[#c7f36a] bg-[#111b18] px-5 py-4">
            <p className="text-xs leading-6 text-[#aab5ad]">Release status: private beta / reviewer preview. The npm package is not published. The regression and benchmark suites use controlled fixtures; they are not a security certification or a claim of real-world detection accuracy. Do not use Foxy as the sole security control for production code.</p>
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
              <a href="#install" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#0b1112] bg-transparent px-5 py-3.5 text-sm font-semibold text-[#0b1112]">Install MCP <ArrowRight size={15} aria-hidden="true" /></a>
              <a href="https://github.com/Darkhero766/Vibeguard/pull/70" target="_blank" rel="noreferrer" className="vg-button vg-focus inline-flex items-center gap-2 border border-[#0b1112]/35 bg-transparent px-5 py-3.5 text-sm font-semibold text-[#0b1112]"><Github size={15} aria-hidden="true" /> Engineering PR</a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
