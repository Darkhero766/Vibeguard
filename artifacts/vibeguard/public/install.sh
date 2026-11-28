#!/usr/bin/env bash
set -Eeuo pipefail

# Official VibeSane Foxy bootstrap. This script installs only a published beta
# from the official npm registry, then invokes Foxy's consent-first installer.
readonly PACKAGE='@vibesane/foxy'
readonly REGISTRY='https://registry.npmjs.org'
readonly CHANNEL='beta'
agent='auto'
forward_args=()

usage() {
  cat <<'EOF'
VibeSane Foxy installer

Usage:
  curl -fsSL https://vibesane.app/install.sh | bash
  curl -fsSL https://vibesane.app/install.sh | bash -s -- --agent codex
  curl -fsSL https://vibesane.app/install.sh | bash -s -- --cwd /path/to/project --dry-run

Options:
  --agent auto|claude|codex|cursor|gemini|roo|copilot
  --cwd PATH
  --dry-run
  --json
  --yes       Skip the installer's confirmation only when explicitly supplied
  --help
EOF
}

fail() { printf 'Foxy installer: %s\n' "$1" >&2; exit 2; }

while (($#)); do
  case "$1" in
    --agent)
      (($# >= 2)) || fail 'Missing value for --agent.'
      agent="$2"; shift 2
      ;;
    --cwd)
      (($# >= 2)) || fail 'Missing value for --cwd.'
      forward_args+=('--cwd' "$2"); shift 2
      ;;
    --dry-run|--json|--yes)
      forward_args+=("$1"); shift
      ;;
    --help|-h)
      usage; exit 0
      ;;
    *)
      fail "Unsupported option: $1. Run with --help for supported options."
      ;;
  esac
done

case "$agent" in
  auto|claude|codex|cursor|gemini|roo|copilot) ;;
  *) fail "Unsupported agent '$agent'." ;;
esac

for command_name in node npm git; do
  command -v "$command_name" >/dev/null 2>&1 || fail "Required command '$command_name' was not found. Install Node.js 24.15+ (including npm) and Git, then retry."
done

node --input-type=module -e '
const [major, minor, patch] = process.versions.node.split(".").map(Number);
if (major < 24 || (major === 24 && minor < 15)) {
  console.error("Foxy requires Node.js 24.15.0 or newer. Current: " + process.version);
  process.exit(2);
}
' || exit $?

# Never install a guessed, unregistered, or shadowed package. Pin the registry.
if ! npm view "${PACKAGE}@${CHANNEL}" version --registry="$REGISTRY" --json >/dev/null 2>&1; then
  fail "${PACKAGE}@${CHANNEL} is not available on the official npm registry yet. Foxy's beta is not published; no package was installed."
fi

printf 'Installing ${PACKAGE}@${CHANNEL} from the official npm registry…\n'
npm install --global --ignore-scripts --no-audit --no-fund --registry="$REGISTRY" "${PACKAGE}@${CHANNEL}"

if command -v foxy >/dev/null 2>&1; then
  foxy_command="$(command -v foxy)"
else
  global_prefix="$(npm prefix --global)"
  candidate="$global_prefix/bin/foxy"
  [[ -x "$candidate" ]] || fail "Foxy was installed, but '$candidate' is not executable. Check your npm global PATH."
  foxy_command="$candidate"
fi

printf 'Starting the project-scoped, consent-first Foxy installer…\n'
"$foxy_command" install --agent "$agent" "${forward_args[@]}"
