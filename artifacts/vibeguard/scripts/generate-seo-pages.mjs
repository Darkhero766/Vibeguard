import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pages = [
  {
    path: '/agentshield',
    title: 'AgentShield for Claude Code | VibeSane',
    description: 'Local security scanning and bounded repair guidance for Claude Code. Requires Node.js 24.15.0+. Beta.6 passed automated Windows, macOS and Ubuntu/Linux qualification; live host acceptance and independent security review remain open.',
    staticBody: `<main><article><h1>AgentShield for Claude Code: build with AI, check security as you code.</h1><p>VibeSane AgentShield is a developer-preview local security scanner for supported code patterns. It uses Claude Code hooks to provide actionable findings, bounded repair guidance, and a final changed-file scan.</p><h2>Monitor, Assist and Auto-fix</h2><p>Monitor reports supported risks; Assist provides repair guidance; Auto-fix can request bounded repairs within Claude Code permissions when explicitly enabled.</p><h2>Current release status</h2><p>Beta.6 passed exact-source automated qualification on Windows, macOS and Ubuntu/Linux. External distribution still requires live authenticated Claude Code validation and independent human security review. The unpublished beta requires Node.js 24.15.0 or newer and Git. The package runtime targets Windows, macOS and Linux; the current automated release matrix covers Windows, macOS and Ubuntu/Linux. No public installer is approved. Static findings and their disappearance are not proof of a vulnerability-free application.</p><p><a href="/scan-public">Use VibeSane's existing GitHub repository web scanner</a>. Web repository scanning and local AgentShield are separate workflows. Local source code is not automatically uploaded to the website.</p></article></main>`,
  },
  {
    path: '/foxy',
    title: 'Foxy — Local-First MCP Security for AI Coding Agents | VibeSane',
    description: 'Install VibeSane Foxy as a local, workspace-scoped, read-only MCP security integration for Claude Code, Codex, Cursor, Gemini CLI, Roo Code and GitHub Copilot. Beta.6 passed automated Windows, macOS and Ubuntu/Linux qualification; live host acceptance and independent security review remain open.',
    staticBody: `<main id="main-content" class="min-h-screen bg-[#0b1112] text-[#f4f6f0]">
<header class="border-b border-[#28352f] bg-[#0b1112]">
  <div class="mx-auto flex max-w-[1180px] items-center justify-between gap-5 px-5 py-5 sm:px-8">
    <a href="/" class="flex items-center gap-3 text-sm font-extrabold tracking-tight"><span class="flex h-7 w-7 items-center justify-center border border-[#c7f36a] font-mono text-[#c7f36a]">V</span>VibeSane</a>
    <nav aria-label="Main navigation" class="flex flex-wrap gap-5 font-mono text-[10px] uppercase tracking-[.12em] text-[#aab5ad]"><a href="/">Scanner</a><a href="/foxy" aria-current="page" class="text-[#c7f36a]">Foxy</a><a href="/pricing">Pricing</a></nav>
  </div>
</header>
<section class="relative isolate overflow-hidden">
  <div aria-hidden="true" class="vg-grid pointer-events-none absolute inset-0 opacity-25"></div>
  <div class="mx-auto grid max-w-[1180px] items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.08fr_.92fr]">
    <div>
      <p class="inline-flex border border-[#35433a] bg-[#111b18] px-3 py-2 font-mono text-[10px] uppercase tracking-[.16em] text-[#c7f36a]">FOXY / LOCAL MCP SECURITY</p>
      <h1 class="mt-8 max-w-[760px] font-sans text-[clamp(3.15rem,7.2vw,6.25rem)] font-extrabold leading-[.98] tracking-[-.075em]">Security context for your AI agent.<span class="mt-2 block text-[#c7f36a]">Not extra authority.</span></h1>
      <p class="mt-7 max-w-[630px] text-[15px] leading-8 text-[#aab5ad] sm:text-lg">Foxy connects supported coding agents to VibeSane’s local security engine through MCP STDIO. Inspect supported changes, understand findings, and verify remediation while access stays scoped to the selected repository.</p>
      <div class="mt-9 flex flex-wrap gap-3"><a href="#install" class="vg-button vg-focus inline-flex items-center gap-2 border border-[#c7f36a] bg-[#c7f36a] px-5 py-3.5 text-sm font-bold text-[#0b1112]">Install MCP →</a><a href="#qualification" class="vg-button vg-focus inline-flex items-center gap-2 border border-[#35433a] bg-[#111b18] px-5 py-3.5 text-sm font-semibold text-[#f4f6f0]">Review qualification</a></div>
      <p class="mt-7 font-mono text-[10px] uppercase leading-6 tracking-[.13em] text-[#87958b]">Private beta · Node.js 24.15+ · Windows + macOS + Ubuntu/Linux · read-only MCP</p>
    </div>
    <aside class="border border-[#344139] bg-[#111b18] p-5 shadow-[0_24px_70px_rgba(0,0,0,.28)] sm:p-7" aria-label="Foxy local connection preview">
      <div class="flex items-center justify-between border-b border-white/10 pb-4"><div class="flex gap-2"><span class="h-2 w-2 rounded-full bg-[#87958b]"></span><span class="h-2 w-2 rounded-full bg-[#87958b]"></span><span class="h-2 w-2 rounded-full bg-[#c7f36a]"></span></div><span class="font-mono text-[9px] uppercase tracking-[.18em] text-[#9eaaa1]">Local connection / STDIO</span></div>
      <p class="mt-7 font-mono text-[10px] uppercase tracking-[.14em] text-[#c7f36a]">Local reviewer build</p>
      <pre class="mt-4 overflow-x-auto border border-white/10 bg-[#0b1112] p-5 font-mono text-[12px] leading-7 text-[#e8eee7]"><code>$ foxy install --agent auto
$ foxy doctor
$ foxy disconnect --agent all</code></pre>
      <div class="mt-6 grid grid-cols-2 gap-3"><div class="border border-white/10 bg-white/[.03] p-4"><p class="font-mono text-[9px] uppercase text-[#9eaaa1]">Access model</p><p class="mt-2 text-lg font-bold text-[#c7f36a]">Read-only</p></div><div class="border border-white/10 bg-white/[.03] p-4"><p class="font-mono text-[9px] uppercase text-[#9eaaa1]">Workspace scope</p><p class="mt-2 text-lg font-bold text-[#c7f36a]">One Git root</p></div></div>
      <p class="mt-6 border-t border-white/10 pt-4 text-[11px] leading-6 text-[#aab5ad]">The npm package remains unpublished. The local reviewer build uses the same consent-first installer; this website cannot write to your computer or approve an AI host.</p>
    </aside>
  </div>
</section>
<section class="border-y border-[#dce3da] bg-[#f4f6f0] text-[#0b1112]" aria-label="Foxy operating principles">
  <div class="mx-auto grid max-w-[1180px] gap-7 px-5 py-9 sm:grid-cols-3 sm:px-8">
    <article><h2 class="font-sans text-sm font-extrabold">Local-first by design</h2><p class="mt-2 text-xs leading-6 text-[#59665d]">The connector runs on the developer’s machine over MCP STDIO.</p></article>
    <article><h2 class="font-sans text-sm font-extrabold">Explicit workspace scope</h2><p class="mt-2 text-xs leading-6 text-[#59665d]">Canonical Git-root authorization is enforced by the local server.</p></article>
    <article><h2 class="font-sans text-sm font-extrabold">Cross-platform engineering</h2><p class="mt-2 text-xs leading-6 text-[#59665d]">Beta.6 passed automated qualification on Windows, macOS and Ubuntu/Linux; real host acceptance remains separate.</p></article>
  </div>
</section>
<section id="install" class="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
  <div class="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
    <div><p class="font-mono text-[10px] uppercase tracking-[.17em] text-[#c7f36a]">01 / Install MCP</p><h2 class="mt-4 font-sans text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">One command. Your repository. Your approval.</h2><p class="mt-5 text-sm leading-7 text-[#aab5ad]">Run Foxy from a Git repository root. It detects supported coding agents, previews exact project-level MCP configuration targets, asks for consent, writes only the selected MCP entries and verifies them.</p><ol class="mt-7 space-y-4 text-sm leading-6 text-[#d7dfd6]"><li>01 — Open your project in a terminal.</li><li>02 — Review detected agents and exact configuration targets, then approve the plan.</li><li>03 — Restart the coding agent and approve its project MCP server in the host.</li></ol></div>
    <div class="border border-[#344139] bg-[#111b18] p-5 sm:p-7"><p class="font-mono text-[10px] uppercase tracking-[.15em] text-[#9eaaa1]">Beta channel · one-line installer</p><pre class="mt-5 overflow-x-auto border border-white/10 bg-[#0b1112] p-4 font-mono text-[12px] leading-7 text-[#e8eee7]"><code>npx -y @vibesane/foxy@beta install</code></pre><p class="mt-3 text-xs leading-6 text-[#aab5ad]">Configure for: auto-detect is recommended. To target one host explicitly, append <code>--agent claude</code>, <code>--agent codex</code>, <code>--agent cursor</code>, <code>--agent gemini</code>, <code>--agent roo</code> or <code>--agent copilot</code>.</p><button type="button" disabled aria-disabled="true" class="vg-button mt-4 w-full cursor-not-allowed border border-white/15 bg-white/10 px-5 py-3 text-sm font-bold text-[#87958b]">Available after beta publication</button><p class="mt-3 text-xs leading-6 text-[#aab5ad]">The npm package is not published yet. This command is shown for transparency and will not install until the release owner publishes the verified package.</p><div class="mt-6 flex flex-wrap gap-4 border-t border-white/10 pt-5"><a href="https://github.com/Darkhero766/Vibeguard/blob/feat/agentshield-cross-platform-autoconnect/docs/FOXY_UNIVERSAL_INSTALLER_PILOT.md" class="text-sm font-semibold text-[#c7f36a]">Local reviewer install guide →</a><a href="https://github.com/Darkhero766/Vibeguard/actions/runs/46137576745" class="text-sm font-semibold text-[#c7f36a]">Cross-platform evidence →</a></div></div>
  </div>
  <p class="mt-6 border-l-2 border-[#c7f36a] bg-[#111b18] px-5 py-4 text-xs leading-6 text-[#aab5ad]">MCP registration only. Foxy does not install lifecycle hooks, grant host trust, execute project code or enable completion enforcement. The installer runs in your terminal; a website cannot write to local host configuration.</p>
</section>
<section id="connect" class="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
  <p class="font-mono text-[10px] uppercase tracking-[.17em] text-[#c7f36a]">02 / Host configuration</p>
  <h2 class="mt-4 font-sans text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">One connector. Six integration targets.</h2>
  <p class="mt-5 max-w-[650px] text-sm leading-7 text-[#aab5ad]">The setup command detects supported host markers and writes project-scoped MCP configuration. Choose a host explicitly when automatic detection is not appropriate.</p>
  <div class="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <article class="border border-[#2b3832] bg-[#111b18] p-5"><p class="font-mono text-[10px] text-[#c7f36a]">01</p><h3 class="mt-4 font-sans text-lg font-extrabold">Claude Code</h3><p class="mt-2 text-xs leading-6 text-[#aab5ad]">Project-level .mcp.json registration</p><p class="mt-4 border-t border-white/10 pt-3 font-mono text-[10px] text-[#87958b]">--agent claude</p></article>
    <article class="border border-[#2b3832] bg-[#111b18] p-5"><p class="font-mono text-[10px] text-[#c7f36a]">02</p><h3 class="mt-4 font-sans text-lg font-extrabold">Codex CLI</h3><p class="mt-2 text-xs leading-6 text-[#aab5ad]">Project-level .codex/config.toml registration</p><p class="mt-4 border-t border-white/10 pt-3 font-mono text-[10px] text-[#87958b]">--agent codex</p></article>
    <article class="border border-[#2b3832] bg-[#111b18] p-5"><p class="font-mono text-[10px] text-[#c7f36a]">03</p><h3 class="mt-4 font-sans text-lg font-extrabold">Cursor</h3><p class="mt-2 text-xs leading-6 text-[#aab5ad]">Project-level .cursor/mcp.json registration</p><p class="mt-4 border-t border-white/10 pt-3 font-mono text-[10px] text-[#87958b]">--agent cursor</p></article>
    <article class="border border-[#2b3832] bg-[#111b18] p-5"><p class="font-mono text-[10px] text-[#c7f36a]">04</p><h3 class="mt-4 font-sans text-lg font-extrabold">Gemini CLI</h3><p class="mt-2 text-xs leading-6 text-[#aab5ad]">Project-level .gemini/settings.json registration</p><p class="mt-4 border-t border-white/10 pt-3 font-mono text-[10px] text-[#87958b]">--agent gemini</p></article>
    <article class="border border-[#2b3832] bg-[#111b18] p-5"><p class="font-mono text-[10px] text-[#c7f36a]">05</p><h3 class="mt-4 font-sans text-lg font-extrabold">Roo Code</h3><p class="mt-2 text-xs leading-6 text-[#aab5ad]">Project-level .roo/mcp.json registration</p><p class="mt-4 border-t border-white/10 pt-3 font-mono text-[10px] text-[#87958b]">--agent roo</p></article>
    <article class="border border-[#2b3832] bg-[#111b18] p-5"><p class="font-mono text-[10px] text-[#c7f36a]">06</p><h3 class="mt-4 font-sans text-lg font-extrabold">GitHub Copilot</h3><p class="mt-2 text-xs leading-6 text-[#aab5ad]">Workspace-root .mcp.json; VS Code guided setup may require chat.mcp.workspaceRootConfig.enabled</p><p class="mt-4 border-t border-white/10 pt-3 font-mono text-[10px] text-[#87958b]">--agent copilot</p></article>
  </div>
  <div class="mt-6 border border-[#344139] bg-[#111b18] p-5"><h3 class="font-sans text-sm font-extrabold">Another MCP-compatible client?</h3><p class="mt-2 text-xs leading-6 text-[#aab5ad]">Use <code class="border border-white/10 bg-[#0b1112] px-1.5 py-1 font-mono text-[#c7f36a]">vibesane connect --agent mcp</code> to print a generic STDIO entry. Non-MCP agents need their own integration surface.</p><a href="https://github.com/Darkhero766/Vibeguard/blob/feat/agentshield-cross-platform-autoconnect/docs/AGENTSHIELD_CODING_AGENT_BETA_INSTALL.md" class="mt-4 inline-flex text-sm font-bold text-[#c7f36a]">Read setup notes →</a></div>
</section>
<section id="security-model" class="border-y border-[#dce3da] bg-[#f4f6f0] text-[#0b1112]">
  <div class="mx-auto grid max-w-[1180px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2">
    <div><p class="font-mono text-[10px] uppercase tracking-[.17em] text-[#536a46]">03 / Security boundaries</p><h2 class="mt-4 font-sans text-3xl font-extrabold tracking-[-.05em]">Useful context. No extra authority.</h2><p class="mt-6 text-sm leading-8 text-[#59665d]">Foxy exposes security analysis through a local MCP server. The selected repository root is passed as an explicit allowlist, and requested workspace paths are checked against that scope. Registration does not replace the coding agent’s own permission controls.</p></div>
    <ul class="space-y-4 text-sm leading-6 text-[#435147]"><li>Read-only MCP tools. No shell, patch, commit, or deploy capability.</li><li>Only the canonical Git root selected during setup is authorized.</li><li>The connector does not execute repository scripts or project code.</li><li>Existing host configuration is backed up and unrelated entries are preserved.</li><li>Malformed, symlinked, oversized, or conflicting configuration is refused.</li><li>Host approval and each coding agent’s own permission model remain in control.</li></ul>
  </div>
</section>
<section id="qualification" class="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-24">
  <p class="font-mono text-[10px] uppercase tracking-[.17em] text-[#c7f36a]">04 / Qualification evidence</p>
  <h2 class="mt-4 font-sans text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">Beta.6 passed the three-platform automated matrix.</h2>
  <p class="mt-5 max-w-[760px] text-sm leading-7 text-[#aab5ad]">Exact code SHA 3ec649c01506ae077639595794fd0b0cc445db04 passed workflow #46137576745 on Windows, macOS and Ubuntu/Linux. Each platform passed 472/472 regression tests, MCP STDIO integration, synthetic benchmark suites and offline package/CLI/MCP smoke. This automated evidence does not replace real-host acceptance or independent security review.</p>
  <div class="mt-10 grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
    <article class="border border-[#33413b] bg-[#111b18] p-6 sm:p-8"><p class="font-mono text-[10px] uppercase tracking-[.14em] text-[#a3ada5]">Exact-source CI · 28 November 2026</p><div class="mt-6 grid gap-3 sm:grid-cols-3"><div class="border border-white/10 bg-[#0b1112] p-4"><p class="font-mono text-[9px] text-[#9eaaa1]">Windows · Regression suite</p><p class="mt-2 text-2xl font-extrabold">472 / 472</p><p class="text-[11px] text-[#9eaaa1]">tests passed</p></div><div class="border border-white/10 bg-[#0b1112] p-4"><p class="font-mono text-[9px] text-[#9eaaa1]">macOS · Regression suite</p><p class="mt-2 text-2xl font-extrabold">472 / 472</p><p class="text-[11px] text-[#9eaaa1]">tests passed</p></div><div class="border border-white/10 bg-[#0b1112] p-4"><p class="font-mono text-[9px] text-[#9eaaa1]">Ubuntu / Linux · Regression suite</p><p class="mt-2 text-2xl font-extrabold">472 / 472</p><p class="text-[11px] text-[#9eaaa1]">tests passed</p></div></div><div class="mt-6 grid gap-3 sm:grid-cols-3"><div class="border border-white/10 bg-white/[.03] p-4"><p class="font-mono text-[9px] text-[#9eaaa1]">MCP smoke</p><p class="mt-2 text-xl font-bold">10 tools</p></div><div class="border border-white/10 bg-white/[.03] p-4"><p class="font-mono text-[9px] text-[#9eaaa1]">Package</p><p class="mt-2 text-xl font-bold">30 files</p></div><div class="border border-white/10 bg-white/[.03] p-4"><p class="font-mono text-[9px] text-[#9eaaa1]">Failed steps</p><p class="mt-2 text-xl font-bold">0</p></div></div><p class="mt-6 break-all font-mono text-[10px] leading-6 text-[#87958b]">Package SHA-256 · f60677328e0c5eb2de94ec4ae44598e973c198e62f15ad4156b061bd6ed42c14</p><a href="https://github.com/Darkhero766/Vibeguard/actions/runs/46137576745" class="mt-6 inline-flex text-sm font-bold text-[#c7f36a]">Open exact-source run →</a></article>
    <article class="border border-[#33413b] bg-[#111b18] p-6 sm:p-8"><p class="font-mono text-[10px] uppercase tracking-[.14em] text-[#a3ada5]">SEPARATE RELEASE GATES</p><h3 class="mt-5 font-sans text-2xl font-extrabold">What CI cannot prove</h3><ul class="mt-5 space-y-3 text-sm leading-6 text-[#aab5ad]"><li>Real MCP discovery, host approval, lifecycle behavior and uninstall in each coding-agent application.</li><li>Independent security review of authorization, configuration mutation, queue integrity and supply chain.</li><li>npm scope ownership, package provenance/signing, support, rollback and owner publication approval.</li></ul><a href="https://github.com/Darkhero766/Vibeguard/blob/feat/agentshield-cross-platform-autoconnect/docs/FOXY_REAL_HOST_ACCEPTANCE_RUNBOOK.md" class="mt-6 inline-flex text-sm font-bold text-[#c7f36a]">Open host acceptance runbook →</a></article>
  </div>
  <div class="mt-8 border-l-2 border-[#c7f36a] bg-[#111b18] px-5 py-4"><p class="text-xs leading-6 text-[#aab5ad]">Release status: private beta / reviewer preview. The npm package is not published. Regression and benchmark suites use controlled fixtures; they are not a security certification or a claim of real-world detection accuracy. Do not use Foxy as the sole security control for production code.</p></div>
</section>
<section class="border-t border-[#28352f] bg-[#c7f36a] text-[#0b1112]">
  <div class="mx-auto flex max-w-[1180px] flex-col gap-7 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between"><div><p class="font-mono text-[10px] uppercase tracking-[.16em]">VibeSane / Foxy</p><h2 class="mt-3 max-w-[680px] font-sans text-2xl font-extrabold tracking-[-.05em] sm:text-3xl">Bring security context into the tools where you build.</h2><p class="mt-3 max-w-[600px] text-sm leading-7 text-[#26362a]">Explore the repository scanner, inspect qualification evidence, or review setup notes before trying a local reviewer build.</p></div><div class="flex flex-wrap gap-3"><a href="/scan-public" class="vg-button vg-focus inline-flex items-center gap-2 border border-[#0b1112] bg-[#0b1112] px-5 py-3.5 text-sm font-bold text-[#f4f6f0]">Open web scanner →</a><a href="#install" class="vg-button vg-focus inline-flex items-center gap-2 border border-[#0b1112] px-5 py-3.5 text-sm font-semibold text-[#0b1112]">Install MCP</a><a href="https://github.com/Darkhero766/Vibeguard/pull/70" class="vg-button vg-focus inline-flex items-center gap-2 border border-[#0b1112]/35 px-5 py-3.5 text-sm font-semibold text-[#0b1112]">Engineering PR</a></div></div>
</section>
<footer class="border-t border-[#28352f] bg-[#0b1112]"><div class="mx-auto flex max-w-[1180px] flex-col gap-3 px-5 py-8 text-xs leading-6 text-[#aab5ad] sm:flex-row sm:justify-between sm:px-8"><p>VibeSane · Local-first security engineering preview.</p><nav class="flex flex-wrap gap-4"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/security-disclosure">Security disclosure</a><a href="/">Home</a></nav></div></footer>
</main>`,

  },
  {
    path: '/github-security-scanner',
    title: 'GitHub Security Scanner | VibeSane',
    description: 'Scan GitHub repositories for vulnerabilities, secrets, and risky code before they ship with VibeSane.',
  },
  {
    path: '/github-protection',
    title: 'GitHub Protection for Every Code Change | VibeSane',
    description: 'Protect GitHub repositories by scanning code changes for newly introduced security issues with VibeSane.',
  },
  {
    path: '/vibe-coding-security',
    title: 'Vibe Coding Security | VibeSane',
    description: 'Security scanning for AI-assisted and vibe-coded applications. Catch secrets and risky code before you ship.',
  },
  {
    path: '/supabase-security',
    title: 'Supabase Security Scanner | VibeSane',
    description: 'Check Supabase-powered applications for security risks, exposed secrets, and unsafe code patterns with VibeSane.',
  },
  {
    path: '/nextjs-security',
    title: 'Next.js Security Scanner | VibeSane',
    description: 'Scan Next.js applications for security issues, exposed secrets, and risky code patterns before deployment.',
  },
  {
    path: '/settings',
    title: 'Settings | VibeSane',
    description: 'Manage your VibeSane account, security, billing, notifications, repository data, appearance, and account controls.',
  },
  {
    path: '/terms',
    title: 'Terms & Conditions | VibeSane',
    description: 'VibeSane Terms & Conditions covering use of the security analysis service, paid plans, acceptable use, disclaimers, and liability.',
    staticBody: `<main><article><h1>Terms &amp; Conditions</h1><p>Last updated: October 6, 2026.</p><section><h2>Agreement</h2><p>These Terms &amp; Conditions govern your access to and use of VibeSane, including the website, security-scanning features, repository-protection features, reports, APIs and paid plans. By creating an account, using the Service, or purchasing a paid plan, you agree to these Terms.</p></section><section><h2>What VibeSane does</h2><p>VibeSane provides automated, heuristic security analysis of supported publicly accessible GitHub repositories and related security signals. A scan is not a certification, guarantee, penetration test, legal opinion, or professional security audit. Results may be incomplete or inaccurate and require human verification.</p></section><section><h2>Plans, refunds and cancellation</h2><p>Plan features and usage limits are shown on the pricing or account pages. Subscriptions are non-refundable by default. You may cancel using available billing controls or by contacting support. Statutory rights that cannot lawfully be excluded remain unaffected.</p></section><section><h2>Governing Law &amp; Mandatory Rights</h2><p>These Terms are intended to be interpreted under applicable law. Mandatory consumer or statutory rights that cannot legally be waived remain unaffected. A specific governing-law or dispute-resolution provision has not been identified in this public text and should be completed and reviewed by qualified local counsel before reliance.</p></section><section><h2>Contact</h2><p>For questions about these Terms or the Service, use the VibeSane <a href="/contact">Contact and Support</a> page.</p></section><p>This crawlable page presents key public terms; the full Terms page is rendered by the application when JavaScript is available.</p></article></main>`,
  },
  {
    path: '/privacy',
    title: 'Privacy Policy | VibeSane',
    description: 'VibeSane Privacy Policy explaining account data, scan usage, retention, security, and privacy-rights requests.',
    staticBody: `<main><article><h1>Privacy Policy</h1><p>Last updated: October 12, 2026.</p><section><h2>What we collect</h2><p>We collect your email address when you create an account, your scan usage count to enforce account limits, and the repository URL you submit to perform a repository scan. The submitted repository URL is not stored after that scan completes. VibeSane does not store scanned repository source code. SUE website-audit reports are saved to your account history and may include the audited public URL, timestamp, score, check statuses, product-context signals, and short evidence excerpts from public pages.</p></section><section><h2>Use and retention</h2><p>Account data and saved SUE audit reports are retained while your account exists. You may request account-data deletion through the Contact and Support route; we aim to process a verified request within 30 days. Authentication is handled by Supabase Auth. Data in transit is encrypted via HTTPS.</p></section><section><h2>Privacy rights</h2><p>Depending on your location and applicable law, you may have the right to request access to, correction of, or deletion of personal data, and to raise questions about its processing. To exercise a right or ask a privacy question, use the <a href="/contact">Contact and Support</a> page. Do not include passwords, tokens, or sensitive personal details in a public issue.</p></section><section><h2>Contact</h2><p>For privacy questions and data requests, use the official VibeSane support route listed on the <a href="/contact">Contact and Support</a> page.</p></section><p>This crawlable policy summary is consistent with the full Privacy Policy rendered by the application when JavaScript is available.</p></article></main>`,
  },
  {
    path: '/contact',
    title: 'Contact & Support | VibeSane',
    description: 'Contact VibeSane for product support, account questions, and privacy requests.',
    staticBody: `<main><article><h1>Contact and Support</h1><p>For VibeSane product support, account questions, or privacy requests, contact the project through its <a href="https://github.com/Darkhero766/Vibeguard">official GitHub repository</a>. Do not post passwords, access tokens, private repository contents, or sensitive personal information in a public issue. If a request contains sensitive details, ask the maintainer for a private channel.</p><h2>Privacy requests</h2><p>You may request access to, correction of, or deletion of personal data through the support route. Applicable rights depend on your location and the law that applies.</p></article></main>`,
  },
  {
    path: '/security-disclosure',
    title: 'Security Disclosure | VibeSane',
    description: 'How to report a potential security vulnerability affecting VibeSane.',
    staticBody: `<main><article><h1>Security Disclosure</h1><p>VibeSane welcomes responsible disclosure of suspected security vulnerabilities.</p><h2>How to report a vulnerability</h2><p>Use the repository's <a href="https://github.com/Darkhero766/Vibeguard/security/advisories/new">GitHub private vulnerability reporting form</a> if it is enabled for this repository. Do not publish exploit details, credentials, tokens, or personal data in a public issue. If private reporting is unavailable, contact the maintainer through the <a href="/contact">Contact and Support</a> page and request a private channel before sharing technical details.</p><p>Please include a concise description, affected component, reproduction steps, and impact only in a private channel.</p></article></main>`,
  },
  {
    path: '/accessibility',
    title: 'Accessibility Statement | VibeSane',
    description: 'VibeSane accessibility information and a route for reporting accessibility barriers.',
    staticBody: `<main><article><h1>Accessibility Statement</h1><p>VibeSane aims to make its website usable with keyboard navigation and assistive technologies. This statement is not a claim of WCAG conformance or an accessibility certification. Automated checks cannot establish accessibility conformance on their own; meaningful evaluation also requires manual testing with keyboard navigation and screen readers.</p><h2>Report an accessibility barrier</h2><p>If you encounter an accessibility issue, contact us through the <a href="/contact">Contact and Support</a> page and describe the page and barrier. Please do not include passwords or other sensitive account information.</p></article></main>`,
  },
];

const outputDir = path.resolve('dist/public');
const template = await readFile(path.join(outputDir, 'index.html'), 'utf8');

function replaceMetaTag(html, attribute, value, content) {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = new RegExp(`<meta\\s+${attribute}="${escapedValue}"\\s+content="[^"]*"\\s*/?>`);
  return html.replace(tag, `<meta ${attribute}="${value}" content="${content.replaceAll('"', '&quot;')}" />`);
}

for (const page of pages) {
  const canonicalUrl = `https://vibesane.app${page.path}`;
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonicalUrl}" />`);
  html = replaceMetaTag(html, 'name', 'description', page.description);
  html = replaceMetaTag(html, 'property', 'og:title', page.title);
  html = replaceMetaTag(html, 'property', 'og:description', page.description);
  html = replaceMetaTag(html, 'property', 'og:url', canonicalUrl);
  html = replaceMetaTag(html, 'name', 'twitter:title', page.title);
  html = replaceMetaTag(html, 'name', 'twitter:description', page.description);
  html = html.replace('<div id="root"></div>', `<div id="root">${page.staticBody ?? ''}</div>`);
  if (page.staticBody && !html.includes(page.staticBody)) throw new Error(`Failed to inject crawlable page body for ${page.path}`);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title,
    description: page.description,
    url: canonicalUrl,
    isPartOf: { '@type': 'WebSite', name: 'VibeSane', url: 'https://vibesane.app/' },
  };
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`,
  );

  const routeDir = path.join(outputDir, page.path.slice(1));
  await mkdir(routeDir, { recursive: true });
  const outputFile = path.join(routeDir, 'index.html');
  await writeFile(outputFile, html);

  // Verify the artifact on disk, not just the in-memory template. This catches
  // path/output regressions before the static site is published.
  const writtenHtml = await readFile(outputFile, 'utf8');
  if (!writtenHtml.includes('<title>' + page.title + '</title>')) {
    throw new Error('Generated page title is missing from output for ' + page.path);
  }
  if (page.staticBody && (!writtenHtml.includes(page.staticBody) || !writtenHtml.includes('<h1'))) {
    throw new Error('Generated policy body is missing from output for ' + page.path);
  }
}

console.log(`Generated ${pages.length} static pages with crawlable public content where configured.`);
