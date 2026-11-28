# Week 5 — Web-to-local AgentShield demonstration

**All sample material is synthetic. No real secrets, user data, deployed applications, external telemetry or automated customer invitations.**

## Product surfaces

**Web scanner:** The existing VibeSane website accepts a supported GitHub repository URL through /scan-public and uses the API /api/scans. It does not use Claude Code or repair local files.

**Local AgentShield:** Run the CLI in a developer Git repository and let its PostToolUse and Stop hooks provide findings and bounded guidance to Claude Code. No automatic results sync to the website exists.

## Sample source

The established pilot-kit demo already provides:
- agentshield-beta/demo/vulnerable/src/auth.js — synthetic hardcoded JWT signing key
- agentshield-beta/demo/vulnerable/migrations/001.sql — missing RLS
- agentshield-beta/demo/secure/src/auth.js — environment-backed key
- agentshield-beta/demo/secure/migrations/001.sql — RLS enabled and a sample policy

Do not run the SQL migration against any database. Copy one synthetic variant into a disposable Git project; do not create a production application from these fixtures.

## Local simulated acceptance

1. Build the local scanner from the Week 5 GitHub branch using pnpm --filter @workspace/api-server run build:agentshield.
2. Run the Week 1, 2, 3, 4 and 5 tests in the same checkout. These simulate Claude-compatible hook inputs and test detection, bounded repair guidance, rescanning, final Git changed-file coverage, failure behavior, privacy and offline packaging.
3. In the disposable Git project run git init and copy the vulnerable synthetic files. Run the local scanner in JSON mode with --changed.
4. Confirm rule hardcoded_jwt_secret for the hardcoded signing key and rule rls for missing row-level security (severity may vary by implementation).
5. Replace the JS signing key with a runtime environment reference. Rescan; confirm the previous JWT pattern is absent, but independent security correctness is NOT established.
6. Run final gate via verify --changed and inspect incomplete, unverified and active findings separately.
7. Remove AgentShield hooks via uninstall and confirm unrelated project settings remain.

No simulated test should be described as an authenticated Claude Code session.

## Authenticated Claude Code acceptance (separate, pending)

Open a real Claude Code session in a disposable test Git project. Inspect /hooks. In Monitor, have Claude write a synthetic unsafe signing-key literal. Observe PostToolUse. Explicitly opt into Auto-fix under normal permissions, let Claude attempt an authorized fix, and observe the rescan. Ask Claude to use Bash to introduce another synthetic risk; observe the Stop worktree gate. Test retry/recursion limits, incomplete scans, and uninstall without disclosing source or credentials.

Record actual Claude Code version, OS, hook recognition, permission prompts and sanitized rule IDs. Do not claim success until independently observed.

## Web scanner follow-through (not a live CI test)

Use a **public, explicitly authorized** GitHub test repository containing only these synthetic examples, then submit its URL to /scan-public on a staging deployment where the API is reachable. Compare detected rule IDs and file paths. The on-demand web scan will not trigger Claude repairs, and the feature-branch AgentShield landing page at /agentshield is not yet production deployed.

Do not upload or publish the test project, merge any branch, or use production credentials without explicit owner approval.

## Expected outcome

- Synthetic local JWT issue: detectable.
- Synthetic missing RLS issue: detectable by supported rules.
- After a static patch: disappearing pattern, not proof of secure authorization.
- Staged/unstaged/untracked supported files: included in final Git worktree scan.
- No files, scan failure or unsupported files: not reported as verified.
- Real Claude Code / web deployment / pilot: pending owner-approved acceptance.
