# AgentShield Phase 2 — Verified Private Beta Mission
Date: 2026-11-19
Owner-facing goal: launch a trustworthy, explicitly approved private beta for JavaScript/TypeScript, Next.js and Supabase security work. Do not advertise unverified language coverage or train a new model yet.

## Verified baseline — always recheck before using
- PR #60 merged into feat/agentshield-week5-launch-readiness, NOT assumed on main.
- Final PR #60 production-hardening CI: 169/169 tests, web and API typechecks/builds, disposable PostgreSQL test: https://github.com/Darkhero766/Vibeguard/actions/runs/44565173662
- VibeSane check on the corrected PR: 100/100 for **zero new detected findings** (not proof of complete security).
- Hybrid beta 0.7.0-beta.1 install tested offline in Linux CI, unpublished; AST/taint opt-in; local LLM advice mocked only.
- Staging/live Supabase usage entitlement grants still need reviewed mitigation; a proposed SQL file exists at supabase/review-only/PROPOSED_USAGE_ENTITLEMENT_LOCKDOWN.sql but was not applied.
- GitHub check annotations are coded and tested but not necessarily deployed on the web service.
- Detailed baseline: artifacts/api-server/AGENTSHIELD_PRODUCTION_HARDENING.md

## Priorities with realistic single-developer planning ranges
P0 — 3–5 working days: read-only live Supabase migration/schema/role diff; staging-only entitlement-grant fix; test billing/signup/plan/quota behavior and rollback before owner-approved live migration. Review github_tokens permissions, leak-password-protection Auth warning.
P0 — 3–5 working days: REAL authenticated Claude Code acceptance for PostToolUse/Stop/Bash edits, install/disable/uninstall, permission prompts and failure handling; REAL user-installed Ollama model eval, local-only privacy, prompt injection and bad-advice tests.
P1 — 4–7 working days: independent security review (GitHub webhook signature/delta completeness, CI outputs, path/symlink races, PR injection, package safety, billing, RLS, GitHub token handling). Test the new taint rules on untouched, representative projects. Record per-rule TP/FP/TN/FN, sample sizes, runtime and misses; never tune the benchmark and still call it heldout.
P1 — 3–6 working days: Linux + macOS fresh install/upgrade/uninstall, reproducible offline beta with license notices, signed/provenance-ready release and recovery scenarios. Verify website/GitHub Check outputs against a staging backend (not production). Ensure deployed versions match source. Hardening: lock or immutable-pin GitHub Actions dependencies; owner-approved release steps only.
P2 — 5–10 working days: consenting 3–5 developer private pilot AFTER P0/P1 pass. Measure install success, scan latency, actionable finding rate, missed bugs, false positives, fix approval and developer feedback. Fix blockers and re-run all tests before expanding.

**Forecast:** ~3–6 calendar weeks for a credible private beta if access, approvals, development capacity, testing hardware and pilot participation are available. These are estimates, not commitments. Wider language support and cross-file taint are follow-on projects, not prerequisites to the narrow private beta.

## Technical decisions
- Deterministic scanner and AST/taint rules produce warnings; AI remains OPTIONAL local explanation/advice. No AI suppression/downgrade of findings and no autonomous patch or code upload without explicit permission.
- Build concise, reviewable suggested fixes only after source handling/consent is designed, and verify with tests + rescans.
- Keep local CLI source processing and remote GitHub web scanning clearly differentiated; do not imply that local code is synced.
- For future language expansion, introduce one well-evaluated parser+ruleset at a time (Python first is a candidate; choose by pilot demand).
- Benchmark on realistic untouched code and positive/negative controls, not solely tuned synthetic cases.
- Use official Claude Code hooks reference, Supabase privileges/RLS docs, Semgrep taint model, OWASP ASVS and GitHub Actions security guidelines.

## Agent execution workflow — user can just say "Continue Phase 2"
1. Inspect current GitHub main/Week5/PR state, CI run SHA and deployment state. Compare to this dated baseline; do not falsely claim merged or published.
2. Inspect Supabase read-only first. Prepare separate staging-tested migration plan, never execute hosted migration, modify auth settings, or change secrets without explicit approval.
3. Implement the highest-risk unblocked P0 task on a *new* feature branch, not main. Add fail-closed checks, real regression tests and adversarial negatives.
4. Validate actual Claude Code and local model only if authenticated binaries/hardware exist. Otherwise generate precise runnable acceptance scripts and report the missing prerequisite; simulated success is not live acceptance.
5. Run strict frontend/backend types + builds; all AgentShield regressions, SQL privilege tests, web GitHub checks, SUE, package install/uninstall and the independent benchmark. Provide test totals and failure details.
6. Evaluate privacy, provenance, dependencies, licenses, webhook behavior, data access, permissions and deployment rollback before requesting review.
7. Save evidence in docs, open a **draft** PR, attach passing SHA-matched CI, list blockers and clear acceptance criteria. Never merge, publish to npm, deploy to production, apply live Supabase changes, invite users or enable cloud AI without explicit owner approval.
8. Final report: implemented vs tested vs simulated vs blocked; feature branch/PR/CI links; actual scan coverage; measured FP/FN/latency; real vs mock Claude/LLM; Supabase changes (if any); proposed next release decision.

## Exit gates — all mandatory for owner-approved private beta
- Critical Supabase entitlement and any comparable access-control vulnerabilities fixed and independently reverified after explicit approval.
- No unresolved critical/high exploitable launch blockers; human security review completed.
- Live authenticated Claude Code hook acceptance and real local-model fallback behavior validated on supported platforms.
- Safe installation/uninstallation, packaging/provenance and privacy permissions demonstrated.
- At least one untouched independent application evaluation with reviewed finding labels and clear limitations.
- End-to-end staging flows for signup, OAuth, GitHub checks, quotas, billing, webhook, auth and failure paths pass.
- User explicitly approves distribution and pilot outreach. Until then, the product is **development candidate**, not released.

References:
https://code.claude.com/docs/en/hooks
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/database/postgres/column-level-security
https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/overview
https://asvs.owasp.org/
https://docs.github.com/en/actions/reference/security/secure-use
