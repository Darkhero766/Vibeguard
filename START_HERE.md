# VibeSane / AgentShield — start here

**Last maintained:** 26 November 2026  
**Repository:** `Darkhero766/Vibeguard`  
**Active Foxy MCP candidates:** [PR #69](https://github.com/Darkhero766/Vibeguard/pull/69) beta.3 and [PR #70](https://github.com/Darkhero766/Vibeguard/pull/70) beta.5 — both draft and unmerged.  
**SaaS hardening:** [PR #61](https://github.com/Darkhero766/Vibeguard/pull/61) — draft and unmerged.  
**Durable live checkpoint:** read [docs/VIBESANE_ENGINEERING_STATE.md](docs/VIBESANE_ENGINEERING_STATE.md) first; it records exact heads, workflow evidence, blockers and next tasks.  
**27 November 2026 checkpoint:** beta.5's latest implementation candidate is `a1d9865a32f9cd0840513086533d92c8e5d1ae3d`; its new SQLite regressions and theme changes have no source-matched Windows/macOS run yet. The beta.4 run #75 is historical only. Keep PR #70 draft/unmerged.  

**Production:** do not merge, migrate, publish or deploy without separate explicit approval.

## Read this before doing work

1. Read [the live engineering state](docs/VIBESANE_ENGINEERING_STATE.md), then [the master roadmap](docs/MASTER_PRODUCT_ROADMAP_2026.md).
2. Read [the Phase 1–2 completion gate](docs/PHASE12_COMPLETION_GATE_2026_11_21.md), [release evidence](docs/PHASE12_RELEASE_EVIDENCE_2026_11_21.md), [solo-founder beta protocol](docs/PHASE12_SOLO_FOUNDER_BETA_PROTOCOL_2026_11_21.md), and [November 30 go/no-go checklist](artifacts/api-server/NOVEMBER_2026_RELEASE_GATES.md).
3. Read the specific Week 1–6 AgentShield document only when working on the **local developer tool**. Do not confuse AgentShield's Week 1–6 with SaaS Phase 1–2.
4. Recheck the actual GitHub branch, PR, deployment and current quota before assuming any historical status is still true.

## Product definition

VibeSane has two connected but distinct product surfaces:

- **VibeSane web/GitHub security SaaS:** a developer connects GitHub, selects a repository, receives a baseline security analysis, and can receive later push/pull-request checks, reports, findings and plan/usage controls. It is a remote repository-analysis service. Its GitHub OAuth login and GitHub App installation are different integrations.
- **Foxy / AgentShield local developer preview:** a local scanner/CLI and read-only stdio MCP server for coding-agent hosts, with optional host lifecycle hooks as a separate feature. The beta.4 connector has Windows/macOS CI evidence, but real-host acceptance and independent review remain pending. Local source processing does not prove SaaS release readiness.

The shared scanning engine does **not** make these two products identical. Clearly label which path a feature or benchmark covers.

## Current engineering state — revalidate before relying on it

- PR #61 is the active draft hardening branch. It is not the production branch and its base is `feat/agentshield-week5-launch-readiness`, not `main`.
- GitHub Actions usage was reported by the owner as **100% used on 22 Nov 2026**. Do not trigger Actions workflows until the quota is available or the owner explicitly chooses another CI provider. Existing green Actions runs are historical evidence tied to their exact SHAs; they do not prove the latest commit.
- Render staging services are separate from production. Previous work deployed a staging API, but the staging GitHub App install/link callback was not yet proven end-to-end. The owner reports GitHub integration and Dodo test payments work on the main website; keep that as owner-reported evidence unless freshly verified. Do not alter the main website or production App configuration while fixing staging.
- Phase 1 has real staging Dodo test-payment evidence (processed signed events and a bounded Pro entitlement) and synthetic lifecycle tests. Cancellation/failure recovery, multi-account isolation, quota/month-boundary behavior, production migration compatibility and production least-privilege rollout remain separate gates.
- The latest 30-repository and 22-repository public source collections are **unreviewed source-analysis evidence**, not independent precision/recall. The 22-app set was used during tuning; do not call it untouched. Findings must not be counted as confirmed vulnerabilities without source review.
- The local solo-founder protocol exists because two qualified external reviewers are not currently available. It permits an evidence-based internal-beta decision only; it cannot certify independent accuracy or authorize production.
- No customer source has been sent to hosted model providers by the model benchmark harness. It is synthetic-only and network calls require explicit `--live`. Optional local model integration is a separate Ollama-compatible path and has not been validated with a real installed model in an authenticated session.
- The current UI heuristic score is a severity-weighted indicator, not a security probability or certification. The number of rules run must be shown separately.

## Safe work rules

- Work on the existing reviewed feature branch or a new feature branch; keep PR #61 draft until its documented gates are met.
- Do not merge, deploy production, run production SQL, change production Auth/grants, create real charges, cancel the owner's active Dodo test subscription, or use paid model APIs without explicit approval.
- Never ask for secrets in chat. Provider keys and private keys belong only in the relevant private provider/Render environment.
- Never let an LLM override deterministic scanner findings, suppress a finding, grant a PASS, or claim a vulnerability is verified. AI outputs are advisory hypotheses until evidence is checked.
- For each task, record: exact SHA, scope, tests run, tests not run, staging deploy SHA if any, production changes (must remain none unless approved), benchmark provenance and remaining blockers.
- When Actions quota is exhausted, do not claim CI green. Use local Linux/WSL tests/builds or other owner-approved compute, and label the verification method accurately.

## Immediate priority

1. Protect this roadmap/source-of-truth.
2. Finish honest MVP metrics and model-evaluation tooling (model IDs/pricing are pinned to official docs and must be refreshed).
3. Improve scanner quality using negative controls and real-source context without contaminating frozen evaluation sets.
4. Make one narrow, safe internal beta path; measure activation, scan completion, actionable findings, repeat use and willingness to pay.
5. Do not expand languages or launch a broad feature set until Phase 1 and 2 release gates are genuinely satisfied.
