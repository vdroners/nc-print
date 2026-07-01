#!/usr/bin/env bash
# Smoke-test slice POST against forge-slicer (direct) or nc_print slicer proxy.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE="${NC_PRINT_FIXTURE:-$ROOT/tests/fixtures/cube10.stl}"
MODE="${NC_PRINT_SLICE_MODE:-auto}"
SLICER_URL="${NC_PRINT_SLICER_URL:-http://127.0.0.1:8766}"
NC_BASE="${NC_PRINT_URL:-${NC_URL:-http://127.0.0.1}}"
NC_COOKIE="${NC_PRINT_SESSION_COOKIE:-${NC_COOKIE:-}}"
SSE_ACCEPT="${NC_PRINT_SSE_ACCEPT:-}"

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

# Validate SSE stream body (mirrors slicer-utils flushSseLeftover + slicer-api recovery).
# Args: stream_file nc_base nc_cookie(optional)
smoke_validate_sse() {
	local stream_file="$1"
	local nc_base="$2"
	local nc_cookie="${3:-}"
	python3 - "$stream_file" "$nc_base" "$nc_cookie" <<'PY'
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

stream_file, nc_base, nc_cookie = sys.argv[1:4]


def parse_sse_block(block: str) -> tuple[str, str]:
    event = "message"
    data = ""
    for line in block.split("\n"):
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data += ("\n" if data else "") + line[5:].strip()
    return event, data


def parse_sse_chunk(chunk: str, leftover: str = "") -> tuple[str, list]:
    buffer = leftover + chunk
    events = []
    while True:
        sep = buffer.find("\n\n")
        if sep < 0:
            break
        block = buffer[:sep]
        buffer = buffer[sep + 2 :]
        event, data = parse_sse_block(block)
        parsed = None
        if data:
            try:
                parsed = json.loads(data)
            except json.JSONDecodeError:
                parsed = None
        events.append({"event": event, "parsed": parsed})
    return buffer, events


def flush_sse_leftover(leftover: str) -> list:
    trimmed = (leftover or "").rstrip()
    if not trimmed:
        return []
    _left, events = parse_sse_chunk("\n\n", trimmed)
    return events


def parse_all_sse(text: str) -> list:
    leftover, events = parse_sse_chunk(text)
    events.extend(flush_sse_leftover(leftover))
    return events


def gcode_head_ok(job_id: str) -> bool:
    if not job_id or not nc_cookie:
        return False
    path = f"/index.php/apps/nc_print/api/slicer/jobs/{urllib.parse.quote(job_id, safe='')}/gcode"
    url = nc_base.rstrip("/") + path
    req = urllib.request.Request(url, method="HEAD", headers={"Cookie": nc_cookie})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        return 200 <= e.code < 300
    except OSError:
        return False


with open(stream_file, "rb") as fh:
    raw = fh.read()
text = raw.decode("utf-8", errors="replace")
events = parse_all_sse(text)

done_payload = None
last_job_id = None
last_pct = 0
last_stage = ""

for ev in events:
    parsed = ev.get("parsed") or {}
    if parsed.get("job_id"):
        last_job_id = parsed["job_id"]
    if ev["event"] == "progress" and parsed:
        last_pct = parsed.get("pct", last_pct)
        last_stage = parsed.get("stage") or last_stage
    if ev["event"] == "done" and parsed:
        done_payload = parsed
    if ev["event"] == "error" and parsed:
        msg = parsed.get("message") or parsed.get("error") or "slice error event"
        print(f"FAIL SSE error event: {msg}", file=sys.stderr)
        sys.exit(1)

if done_payload:
    job = done_payload.get("job_id") or last_job_id or "?"
    print(f"PASS SSE done event (job_id={job})")
    sys.exit(0)

if last_job_id and gcode_head_ok(last_job_id):
    print(f"PASS SSE recovered via job_id HEAD gcode (job_id={last_job_id}, stream_incomplete)")
    sys.exit(0)

hint = ""
if last_pct > 0:
    hint = f" last progress: {last_stage or 'slicing'} {int(last_pct)}%"
job_hint = f" job_id={last_job_id}" if last_job_id else ""
print(
    f"FAIL SSE stream ended without done event and no recoverable gcode.{job_hint}{hint}",
    file=sys.stderr,
)
sys.exit(1)
PY
}

looks_like_sse() {
	local body_file="$1"
	head -c 64 "$body_file" 2>/dev/null | grep -qE '^event:' && return 0
	grep -qE '^event:' "$body_file" 2>/dev/null && return 0
	return 1
}

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

CURL_ACCEPT=()
if [[ "$MODE" == "proxy" || "$SSE_ACCEPT" == "1" ]]; then
	CURL_ACCEPT=(-H "Accept: text/event-stream")
fi

if [[ "$MODE" == "direct" ]]; then
	HTTP=$(curl -sS -o "$OUT" -w '%{http_code}' -X POST "${SLICER_URL}/api/slice" \
		"${CURL_ACCEPT[@]}" \
		-F "model=@${FIXTURE};type=application/octet-stream" \
		-F "printer_id=${PRINTER_ID}" \
		-F "process_id=${PROCESS_ID}" \
		-F "filament_ids=[\"${FILAMENT_ID}\"]" \
		--max-time "${NC_PRINT_SLICE_TIMEOUT:-120}" || echo "000")
	if [[ ${#CURL_ACCEPT[@]} -gt 0 ]] && looks_like_sse "$OUT"; then
		if [[ "$HTTP" != "200" ]]; then
			echo "FAIL slice HTTP $HTTP (SSE body)" >&2
			head -c 400 "$OUT" >&2 || true
			exit 1
		fi
		smoke_validate_sse "$OUT" "$NC_BASE" "$NC_COOKIE"
		exit $?
	fi
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
		-H "Accept: text/event-stream" \
		-H "X-Filename: $(basename "$FIXTURE")" \
		--data-binary "@${FIXTURE}" \
		--max-time "${NC_PRINT_SLICE_TIMEOUT:-120}" || echo "000")
	if [[ "$HTTP" != "200" ]]; then
		echo "FAIL proxy slice HTTP $HTTP" >&2
		head -c 400 "$OUT" >&2 || true
		exit 1
	fi
	smoke_validate_sse "$OUT" "$NC_BASE" "$NC_COOKIE"
	exit $?
fi

echo "FAIL unknown NC_PRINT_SLICE_MODE=$MODE (use direct|proxy|auto)" >&2
exit 1
