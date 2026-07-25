---
name: Repository scanning boundary
description: Safety and resilience rules for stateless public repository scanners.
---

Repository scanners should use a bounded, shallow Git fetch with no checkout, read only allowlisted source extensions, enforce per-file and total byte limits, and delete temporary data in a `finally` block. Do not install dependencies, run hooks, or execute repository files.

**Why:** Untrusted repositories can contain arbitrary build scripts, hooks, oversized files, or dependency behavior. The GitHub unauthenticated REST API can also be rate-limited in shared environments.

**How to apply:** Keep fetching and parsing separate from execution. Prefer Git object reads (`ls-tree`/`show`) or an equivalent read-only transport, and convert upstream failures into explicit user-facing errors.