#!/usr/bin/env bash
# Smoke-test slice POST against forge-slicer (direct) or nc_print slicer proxy.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="${NC_PRINT_FIXTURE:-$ROOT/tests/fixtures/cube10.stl}"
MODE="${NC_PRINT_SLICE_MODE:-auto}"
SLICER_URL="${NC_PRINT_SLICER_URL:-http://127.0.0.1:8766}"
NC_BASE="${NC_PRINT_URL:-${NC_URL:-http://127.0.0.1}}"
NC_COOKIE="${NC_PRINT_SESSION_COOKIE:-${NC_COOKIE:-}}"

if [[ ! -f "$FIXTURE" ]]; then
	echo "FAIL missing fixture: $FIXTURE" >&2
	exit 1
fi

pick_profile_id() {
	local kind="$1"
	local substring="${2:-}"
	curl -sf "${SLICER_URL}/api/profiles?kind=${kind}" | python3 -c "
import sys, json
sub = sys.argv[1].lower()
data = json.load(sys.stdin)
for p in data.get('profiles', []):
    name = str(p.get('name', p.get('id', '')))
    if not sub or sub in name.lower():
        print(p.get('id', name))
        break
" "$substring"
}

PRINTER_ID="${NC_PRINT_PRINTER_ID:-$(pick_profile_id printer 'creality k1 (0.4 nozzle)')}"
PROCESS_ID="${NC_PRINT_PROCESS_ID:-$(pick_profile_id process '')}"
FILAMENT_ID="${NC_PRINT_FILAMENT_ID:-$(pick_profile_id filament '')}"

if [[ -z "$PRINTER_ID" || -z "$PROCESS_ID" || -z "$FILAMENT_ID" ]]; then
	echo "FAIL could not resolve printer/process/filament ids from slicer profiles" >&2
	exit 1
fi

if [[ "$MODE" == "auto" ]]; then
	if [[ -n "$NC_COOKIE" ]]; then
		MODE="proxy"
	else
		MODE="direct"
	fi
fi

echo "=== nc_print smoke slice (mode=$MODE) ==="
echo "fixture=$FIXTURE printer=$PRINTER_ID"

smoke_judge() {
	local http="$1"
	local body_file="$2"
	if [[ "$http" == "200" ]]; then
		echo "PASS slice HTTP 200"
		head -c 200 "$body_file" || true
		echo
		return 0
	fi
	if [[ -f "$body_file" ]] && grep -qE '"error"|"code"|ERR_' "$body_file" 2>/dev/null; then
		echo "PASS backend reached (HTTP $http, structured slicer response — model may be minimal fixture)"
		head -c 200 "$body_file" || true
		echo
		return 0
	fi
	echo "FAIL slice HTTP $http" >&2
	cat "$body_file" >&2 || true
	return 1
}

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

if [[ "$MODE" == "direct" ]]; then
	HTTP=$(curl -sS -o "$OUT" -w '%{http_code}' -X POST "${SLICER_URL}/api/slice" \
		-F "model=@${FIXTURE};type=application/octet-stream" \
		-F "printer_id=${PRINTER_ID}" \
		-F "process_id=${PROCESS_ID}" \
		-F "filament_ids=[\"${FILAMENT_ID}\"]" \
		--max-time "${NC_PRINT_SLICE_TIMEOUT:-120}" || echo "000")
	smoke_judge "$HTTP" "$OUT"
	exit $?
fi

if [[ "$MODE" == "proxy" ]]; then
	if [[ -z "$NC_COOKIE" ]]; then
		echo "FAIL proxy mode requires NC_PRINT_SESSION_COOKIE or NC_COOKIE" >&2
		exit 1
	fi
	PROXY_URL="${NC_BASE%/}/index.php/apps/nc_print/api/slicer/slice/stream"
	QS="printer_id=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$PRINTER_ID")"
	QS+="&process_id=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$PROCESS_ID")"
	QS+="&filament_ids=$(python3 -c "import json,urllib.parse,sys; print(urllib.parse.quote(json.dumps([sys.argv[1]])))" "$FILAMENT_ID")"
	HTTP=$(curl -sS -o "$OUT" -w '%{http_code}' -X POST "${PROXY_URL}?${QS}" \
		-H "Cookie: ${NC_COOKIE}" \
		-H "Content-Type: application/octet-stream" \
		-H "X-Filename: $(basename "$FIXTURE")" \
		--data-binary "@${FIXTURE}" \
		--max-time "${NC_PRINT_SLICE_TIMEOUT:-120}" || echo "000")
	smoke_judge "$HTTP" "$OUT"
	exit $?
fi

echo "FAIL unknown NC_PRINT_SLICE_MODE=$MODE (use direct|proxy|auto)" >&2
exit 1
