# Manual validation when GitHub Actions quota is exhausted

This procedure replaces CI execution temporarily; it does not replace independent review or release gates.

## Preconditions
- Use a clean checkout and record the commit SHA.
- Do not run this on a production server.
- Do not provide production credentials to the test process.
- Ensure the Node and pnpm versions match the repository's documented/runtime requirements.
- Never run live SUE/model benchmarks or staging/production integration scripts as part of this offline validation sequence.

## Run
From repository root:

```bash
chmod +x scripts/validate-vibesane-local.sh
./scripts/validate-vibesane-local.sh
```

The script uses frozen dependency installation and runs the workspace build/typecheck, SUE tests bundled in the API build, Phase 1/2 regression suite, AgentShield suites, output-contract checks and scoring tests. It writes a timestamped log under `validation-logs/` (override with `VIBESANE_VALIDATION_LOG_DIR`).

## Record evidence
For each run, record:
- commit SHA and branch
- Node and pnpm versions
- machine/OS
- each command's exit status
- log path
- any skipped command and why
- whether tests are deterministic/local, synthetic, staging, or live

## Limitations
- This script has not been executed by the authoring assistant against a real checkout/runtime. Treat it as a proposed reproducible harness until a developer runs it.
- Passing local tests does not prove scanner accuracy, exploitability, security, staging compatibility, or production readiness.
- This script intentionally does not deploy, modify Supabase privileges, change Auth settings, publish packages, create PRs, or invoke live model/benchmark APIs.
- Keep GitHub Actions disabled/unused while the owner’s Actions quota remains exhausted. Do not trigger workflow runs to validate this script.
