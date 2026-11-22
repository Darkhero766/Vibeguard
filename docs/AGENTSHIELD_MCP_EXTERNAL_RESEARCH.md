# AgentShield MCP: external security engineering notes

Research reviewed on 2026-11-22. This document summarizes independently derived engineering practices; it does not copy source text, code, test cases, or checklists.

## Strategy adopted for our own validation

- Validate request schemas in implementation, not only advertise schemas to MCP clients.
- Treat workspace paths and repository files as untrusted; verify Git root and path boundaries.
- Apply least privilege: read-only v0, no arbitrary shell, patch, commit, deploy or script-execution tool.
- Treat scan result text as data, not instructions.
- Bound input/output, files, time, concurrency and result count.
- Distinguish UNKNOWN / incomplete from a clean assessment.
- Bind cached evidence to repository state; invalidate when worktree state changes.
- Test protocol framing and real process behavior in addition to handler unit tests.
- Build test fixtures in a disposable local repository, include adversarial path and resource cases, and record exact seeds/inputs for replay.
- Use independent human review for any future write-capable feature; don't let the agent approve or merge its own work.

## Reference sources (links only; no source code copied)

- OWASP MCP Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html
  - Reviewed guidance on least privilege, schema/tool integrity, untrusted tool returns, consent and supply-chain hygiene. The Cheat Sheet Series content is CC BY-SA 4.0; this project does not reproduce its text.
- OWASP MCP Security Testing Guide: https://github.com/OWASP/MCP-Security-Testing-Guide
  - Consulted for threat categories and test ideas. Its repository identifies its license as GPL-3.0. No code, test fixtures, prose, or checklist content from it is copied into this project. Reuse would require license review.
- Microsoft MCP security best practices: https://github.com/microsoft/mcp-for-beginners/blob/main/02-Security/mcp-security-best-practices.md
  - Consulted as a reference only; no code or prose copied.
- MCP official security best practices: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
  - Consulted for host/process isolation and transport-related considerations; no content copied.
- Google SRE book, Testing Reliability: https://sre.google/sre-book/testing-reliability/
  - Consulted for hermetic testing, statistical/replayable testing and rollout/configuration test principles; no content copied.

## Follow-up validation backlog

1. Local process-level test of Content-Length framing, stdout purity, notification behavior, invalid/duplicate headers, malformed JSON and byte-length correctness (multibyte Unicode).
2. Sandbox tests for workspace symlink, Git-root mismatch, path race and untrusted PATH/HOME.
3. Synthetic repo integration test for scanner invocation, exit code 1 with valid complete JSON, error code 2, timeout, malformed JSON, empty coverage and max-buffer exhaustion.
4. Cache invalidation tests: staged, unstaged, untracked, and file change during scan; include a clean baseline.
5. Queue/concurrency stress: bounded waiting queue, response IDs, no response for notifications, and rejection behavior.
6. Repeated randomized malformed frames with replayable seed; avoid fuzzing any production or third-party target.
7. License audit of dependencies and all borrowed references before future distribution.

## Verification status

This is a research note and test backlog, not evidence that those tests have been executed. Runtime test execution is still blocked by the current container's inability to resolve GitHub for a repository checkout. GitHub Actions is intentionally not used.
