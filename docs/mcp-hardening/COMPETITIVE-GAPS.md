# Competitive gaps and practical roadmap

## Comparison

| Capability | VibeSane AgentShield MCP now | Existing alternatives | Gap / opportunity |
|---|---|---|---|
| MCP safety | Ten bounded tools: five synchronous repository-scan/information tools plus five asynchronous SQLite-queue tools; canonical authorized roots; cancellation; bounded stdio; coverage-aware results; accurate annotations for Foxy-local state mutations. | Official SDKs and conformance harness provide wire schemas and protocol scenario coverage. | Confirm source-matched conformance for the beta.5 ten-tool package and supported protocol versions. Do not infer full conformance from a package STDIO smoke or transfer evidence from a different PR/SHA. |
| Agent lifecycle | Codex/Claude hooks are separate and configurable; MCP tools themselves do not block completion. | Semgrep Guardian bundles MCP, hooks and skills and prompts regeneration on findings. | Make lifecycle invocation and completion policy evidence auditable; keep opt-in and avoid claiming universal blocking. |
| SAST / data flow | Native deterministic heuristics plus experimental/opt-in AST and cross-file analysis outside the MCP scan's default path. | Semgrep and CodeQL provide semantic rules, taint/data-flow and path evidence. | Optional adapters with source/sink locations, engine version, timeout and independent availability reporting. |
| Dependencies / secrets / config | Native source heuristics; no MCP-integrated specialist engine currently. | Trivy, OSV-Scanner and Gitleaks target these domains. | Support opt-in lockfile, secret and configuration engine adapters; redact credential values and expose incomplete engine state. |
| Agent ecosystem inspection | MCP server scans changed project files; it does not inventory/execute installed MCP servers. | Snyk Agent Scan audits MCP configs, server tools and skills; warns execution/network may occur. | Safe static inspection of MCP config, AGENTS.md, SKILL.md and hook files without launching servers or following remote URLs. |
| Findings | Bounded normalized metadata, no source excerpts, static-only verification status. | CodeQL and SARIF can represent locations and path data; Snyk Agent Scan documents evidence per risk. | Add stable location identity, rule/CWE metadata, evidence tier, explicit reachability only when modeled, and SARIF round-trip validation. |
| Coverage | Changed-file scope, unsupported/ignored path reporting, before/after race check, fail-closed malformed results. | Most full scanners offer broader repo and language/config coverage. | Add transparent Markdown/agent/config handling and later a configurable repository mode; never call changed-only coverage repository-wide. |
| Evaluation | Extensive tests and some labeled internal benchmarks; current targeted results are 62+163 passing. | OWASP Benchmark supplies labeled Java/Python cases; Juice Shop/NodeGoat are controlled vulnerable apps. | Create a checked-in small labeled fixture set and report TP/FP/FN/TN only from labels; no broad accuracy claims without corpus runs. |

## Defensible advantage

Competing on rule count is not realistic. VibeSane can stand out by making results safe to consume inside coding agents: exact scan scope, durable fingerprints, explicit evidence strength, no raw secrets, no policy influence from repository text, no false clean state when analysis is incomplete, and lifecycle behavior that can be verified independently of an LLM's claims.

## Realistic sequence

1. **Now (launch window):** preserve the repository-read-only contract; finish exact-source Windows/macOS qualification; complete real installed-host smoke for only the hosts that will be advertised; close independent review or keep the release private/restricted.
2. **Next:** expand changed-file coverage to agent and security configuration files, especially Markdown instruction files, using purpose-built fixtures. Do not classify ordinary security guidance as malicious based on keywords.
3. **Then:** add optional Semgrep and Gitleaks/OSV adapters behind explicit availability and timeout contracts. Validate each adapter using synthetic fixtures and bounded outputs before advertising it.
4. **Later:** assess Trivy/CodeQL only for use cases where the runtime/setup cost is acceptable. Keep remote APIs, repository uploads, and server execution out of the default local flow.
5. **Measure:** use OWASP Benchmark for compatible languages and small labeled application fixtures for JS/TS, SQL/RLS, MCP configuration and agent instructions. Publish scope, version, coverage, latency and confusion matrix together.


## 28 November 2026 — launch-window update

Foxy beta.5 source `8ff17de5c5f9ce788e3447ae47263c77136cc3db` passed exact-source Windows/macOS qualification in run #46109758971: 454/454 regression tests per OS, MCP STDIO and offline package smoke, and all synthetic benchmark validators. Both 29-file package manifests match exactly. This moves automated cross-platform qualification from open to passed; it does not establish independent certification or real host compatibility.

Two targeted hardening changes made during this launch window:
1. Persisted remediation baselines are bound to the installed bundled MCP STDIO executable and supporting MCP/queue runtime modules, in addition to scanner/ruleset/schema provenance.
2. Shared SQLite WAL initialization retries transient BUSY/LOCKED conditions only for a bounded period and fails closed without weaker journal fallback.

For the remaining two days, do not widen scanner extensions or add integrations. Prioritize independent review of the authorization and queue invariants, real host acceptance for the support matrix, PR stack reconciliation, operational recovery, and public-claim accuracy. Keep unsupported Markdown instruction files clearly labeled as partial coverage.
