# Competitive gaps and practical roadmap

## Comparison

| Capability | VibeSane AgentShield MCP now | Existing alternatives | Gap / opportunity |
|---|---|---|---|
| MCP safety | Five bounded, read-only tools; authorized roots; cancellation; bounded stdio; coverage-aware results. | Official SDKs and conformance harness provide wire schemas and protocol scenario coverage. | Add official conformance runs for 2025-11-25 and 2026-07-28. Keep current wire compatibility until equivalence is demonstrated. |
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

1. **Now:** retain read-only contract; resolve the stdio output limitation in the managed execution context or clearly qualify it; record 2026-07-28 and legacy MCP conformance outcomes; add a current Codex host session where available.
2. **Next:** expand the changed-file inventory to agent and security configuration files, especially Markdown instruction files, with purpose-built checks and fixture pairs. Do not classify ordinary security guidance as malicious based on keywords.
3. **Then:** add optional Semgrep and Gitleaks/OSV adapters behind explicit availability and timeout contracts. Validate each adapter using synthetic fixtures and bounded outputs before advertising it.
4. **Later:** assess Trivy/CodeQL only for use cases where the runtime/setup cost is acceptable. Keep remote APIs, repository uploads, and server execution out of the default local flow.
5. **Measure:** use OWASP Benchmark for compatible languages and small labeled application fixtures for JS/TS, SQL/RLS, MCP configuration and agent instructions. Publish scope, version, coverage, latency and confusion matrix together.
