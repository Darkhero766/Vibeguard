# AgentShield Week 6 — Hybrid security preview (developer-only)

**Engineering status:** experimental feature branch, not approved for public beta or production. 
**No Supabase mutations, merges, deployments, npm releases, remote AI model requests or customer source uploads were performed.**

## Supabase read-only reconciliation (November 19, 2026)

Connected healthy project: Vibeguard. The nine public application tables inspected have RLS enabled. The current schema includes the expected usage, audit_runs, api_rate_limits, protected_repositories, protection_events, github_tokens, github_app_installations and other support tables. Audit-run and API-rate-limit columns and protections are present.

**Migration history is not synchronized with GitHub filenames.** The live project records these versions:
- 20260914133603 harden_server_side_rls_and_owner_foreign_keys
- 20260914133634 optimize_rls_and_lock_signup_trigger
- 20260914133649 revoke_public_signup_trigger_execute
- 20261006131921 add_audit_scan_usage
- 20261008060445 harden_audit_rls_retention
- 20261008060541 add_api_rate_limits

The GitHub source branch has timestamped migrations:
- 20261006131921_add_audit_scan_usage.sql (matches recorded version)
- 20261008100000_create_audit_runs.sql (different from the live migration history)
- 20261008123000_add_api_rate_limits.sql (different from the live migration history)
- usage_table.sql (non-timestamped baseline)

The actual protected tables are present: this is NOT evidence of missing database structures. The older scripts/migrate-supabase.mjs uses a github_tokens table definition that differs from the currently deployed owner-primary-key layout. **Do not run the legacy script against production**.

Supabase security advisor reports **Leaked Password Protection Disabled**. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Recommend a reviewed Auth configuration change after deployment review; it was not enabled here.

Supabase CLI v3 released in November 2026: local is now the default target; changing hosted state requires explicit remote intent. Before running migrations, check current syntax, create a reviewed schema diff and migration-baseline reconciliation plan, and obtain owner approval.

This read-only comparison establishes apparent major-table parity, not byte-for-byte migration history, deployed environment match, function-body equality, or end-to-end auth correctness. No user rows, tokens or credentials were queried.

## Actual scanner language coverage

Local AgentShield file selection: JavaScript/TypeScript (including common JSX, TSX, module variants), SQL, JSON, YAML/YML, and .env variants. The strongest custom rules target JavaScript/TypeScript API logic, secrets and Supabase SQL/RLS. Config files receive narrower pattern-based checks.

GitHub repository reader also ingests Markdown/MDX, TOML, INI, CONF, XML, HTML, CSS, SCSS, shell, Python, Ruby, Go, Rust, Java, PHP and Dockerfile-related text, but **reading a file is not equivalent to comprehensive security analysis for that language**. Current product must not advertise deep Python/Go/Java/Rust SAST coverage.

## Hybrid preview: deterministic static + optional localhost model advice

1. Run the existing AgentShield static scanner unchanged. Scanner coverage, severity and exit codes remain authoritative.
2. By default the hybrid mode is STATIC ONLY. There are no model calls.
3. The user can explicitly pass --enable-local-ai to request advisory explanation from an Ollama-compatible process at 127.0.0.1:11434 (port configurable for disposable tests via VIBESANE_LOCAL_AI_PORT).
4. **Only bounded rule IDs and severity levels** of up to five findings are provided to the local model. No customer source files, source snippets, filenames, directory paths, raw findings, transcripts or credentials are sent in this mode.
5. The model must respond with structured JSON. Results are validated, bounded, labeled ai_advisory_unverified and never modify source or the scanner's verdict. Obvious unsafe remediation suggestions are withheld for review.
6. Model timeout, absence, malformed output or refusal become ai_unavailable; static findings and original exit codes remain intact.
7. This is NOT independent AI vulnerability detection, production model inference evidence, a fine-tuned proprietary model, or security verification. It is a safe integration milestone for later reviewed AI reasoning.

### Developer-only usage from an authorized source checkout

Prerequisites: Node 20+, Git, built AgentShield scanner, and (only for the optional mode) a separately installed local model server and a user-selected model.

~~~bash
pnpm --filter @workspace/api-server run build:agentshield
node artifacts/api-server/scripts/vibesane.mjs hybrid --changed --cwd /absolute/path/to/disposable-repo --format json
# Optional localhost model call; source code is not shared in this mode:
node artifacts/api-server/scripts/vibesane.mjs hybrid --changed --cwd /absolute/path/to/disposable-repo --enable-local-ai --model qwen2.5-coder:7b --format json
~~~

The specified model is an example identifier and is not automatically installed or downloaded. Do not enable public model APIs, remote endpoints or cloud uploads. No model was installed or queried in a real authenticated local model session as part of this implementation; test suites use a disposable stub HTTP server on loopback and explicitly label that as simulated protocol integration.

## Why hybrid instead of AI-only?

Leading tools use multiple techniques:
- Semgrep: source parsers, AST-like structural matching, taint analysis; enterprise interfile capabilities.
- CodeQL: extracted semantic databases, control/data-flow queries.
- Aikido: rules and multi-file traces, reachability-first triage, optional AI SAST/AutoFix.
- Snyk DeepCode: proprietary combination of symbolic analysis and generative/ML models.

Do not copy proprietary rule packs, datasets, AI model weights or closed-source systems. Semgrep CE engine is LGPL 2.1 but the licensing of its maintained rules for competing/SaaS products is restricted and requires separate legal review before reusing or distributing rules. Prefer original security rules and carefully tested, compatible open-source components.

### Proposed implementation stages after initial preview

- Stage 1: validate hybrid privacy, bounded metadata inputs, parsing, static verdict preservation and fail-safe behavior (this branch).
- Stage 2: AST-based JS/TS checks with the TypeScript compiler API; source/sanitizer/sink modeling for SQL injection, server actions, auth middleware, Supabase service roles.
- Stage 3: a separate optional parser/taint engine adapter benchmarked for added true positives and false positives. No untrusted repository scripts or third-party rules without licensing review.
- Stage 4: explicit local-model opt-in context triage or consented provider adapter with redaction, schema validation, budgets, model identifiers, no auto-suppression and no unapproved code upload.
- Stage 5: human-approved patch proposals, rescan and separately approved independent regression verification.
- Stage 6: real-world benchmark, CI packaging, live Claude Code acceptance, source/privacy review, target-platform pilots and release decision.

## Security, privacy and known limitations

- No remote model endpoint can be specified; preview uses loopback only. No model call happens unless --enable-local-ai is present.
- A local model process can have its own logging/telemetry behavior: verify its deployment before treating the environment as fully private.
- A malicious model response is untrusted data. Validation and obvious unsafe suggestion rejection are useful controls but not a safety guarantee.
- No source code is sent to the model in this preview; this limits the AI's ability to judge context or discover new security issues.
- Ollama-compatible response shape and model availability must be tested against a real installed runtime, not only a stub.
- Scanner may miss deeply nested, cross-file or logic vulnerabilities; false positives remain possible.
- Future output from AI will never be allowed to unilaterally clear a Critical/High static finding or claim verification passed.

## Production release gates

1. Supabase migration ledger reconciled to a canonical set of files and a reviewed no-op schema diff, without rewriting production history.
2. Auth leaked-password protection warning reviewed and resolved by explicit approval.
3. Full application frontend/backend builds/typechecks + scanner regression, strict CI and relevant runtime checks.
4. Known Next.js/Supabase auth, RLS and SQL risks benchmarked on untouched realistic examples; empirical false-positive and miss rates disclosed.
5. Real authenticated Claude Code install/edit/repair/Stop/Bash integration tested on supported macOS/Linux.
6. Local model is actually installed and tested (unless optional AI intentionally disabled); no dependency on hosted credentials.
7. License/commercial usage review for added open-source parsers and rules.
8. Private pilot from consenting users, no automatic telemetry, installer verified, clear privacy consent.
9. Human security review and explicit owner approval before publishing, merging into main or deploying.

No production Supabase schema, keys, Auth settings, customer data, public API, live website, or deployment was modified by these checks.
