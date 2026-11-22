#!/usr/bin/env bash
set -Eeuo pipefail

# Manual validation for VibeSane when GitHub Actions minutes are exhausted.
# Run from the repository root. This script does not deploy, publish, access
# production services, or execute live benchmarks.

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_DIR="${VIBESANE_VALIDATION_LOG_DIR:-validation-logs}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/manual-validation-$STAMP.log"

exec > >(tee -a "$LOG") 2>&1

echo "VibeSane manual validation"
echo "UTC: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Commit: $(git rev-parse HEAD)"
echo "Branch: $(git branch --show-current)"
echo "Node: $(node --version)"
echo "pnpm: $(pnpm --version)"
echo "Log: $LOG"
echo

run() {
  echo
  echo ">>> $*"
  "$@"
}

# Installation is lockfile-frozen; the repository's pnpm preinstall guard
# rejects non-pnpm package managers.
run pnpm install --frozen-lockfile

# Workspace-level build/typecheck and package builds (API build includes SUE tests).
run pnpm build

# Phase 1/2 security regression suite; deterministic mock/local tests only.
run pnpm --filter @workspace/api-server test:agentshield:phase12

# Core AgentShield safety/reliability suites.
run pnpm --filter @workspace/api-server test:agentshield
run pnpm --filter @workspace/api-server test:agentshield:week2
run pnpm --filter @workspace/api-server test:agentshield:week3
run pnpm --filter @workspace/api-server test:agentshield:week4
run pnpm --filter @workspace/api-server test:agentshield:week5
run pnpm --filter @workspace/api-server test:agentshield:hybrid
run pnpm --filter @workspace/api-server test:agentshield:ast
run pnpm --filter @workspace/api-server test:agentshield:taint
run pnpm --filter @workspace/api-server test:agentshield:release

# Additional output contract and scoring regressions.
run pnpm --filter @workspace/api-server test:vibesane:check-output
run pnpm --filter @workspace/api-server test:scan-score

echo
echo "VALIDATION PASS: all commands completed."
echo "This is local evidence for commit $(git rev-parse HEAD), not CI and not a release approval."
echo "Log saved at: $LOG"
