#!/usr/bin/env bash
# Install the Alfred forge integration into ~/.openclaw (idempotent).
# Requires openclaw-alfred to be installed first (shared helpers + install lib).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
FORCE=0
[[ "${1:-}" == "--force" ]] && FORCE=1
export OPENCLAW_DIR FORCE

LIB="${OPENCLAW_DIR}/scripts/openclaw-install-lib.sh"
if [[ ! -f "$LIB" ]]; then
  echo "install: $LIB missing — install openclaw-alfred first" >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$LIB"

link_script_dir "${ROOT}/scripts"
sync_skill "${ROOT}/skills/forge-print" "${OPENCLAW_DIR}/workspace/skills/forge-print"
patch_skill_mentions "${OPENCLAW_DIR}/workspace/skills/forge-print"
check_skills_i3 forge-print

echo "Gate I1: nc-print forge integration install ok — ROOT=$ROOT"
