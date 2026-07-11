#!/usr/bin/env bash
# nc-print-slicer entrypoint.
#
#   1. Start a virtual X display (the engine links GTK/webkit and refuses to
#      start without one, even in --rest-only mode).
#   2. Seed a writable data_dir from the baked resources so the headless
#      PresetBundle loads the shipped vendor profiles.
#   3. Launch the engine's built-in REST server (--rest-only, dash-form flag).
#   4. Launch the FastAPI adapter, which reverse-proxies the engine on
#      ADAPTER_PORT (8080) and is the only surface exposed to nc-print.
set -euo pipefail

ENGINE_REST_PORT="${ENGINE_REST_PORT:-8765}"
ADAPTER_PORT="${ADAPTER_PORT:-8080}"
DISPLAY="${DISPLAY:-:99}"
ORCA_BIN="${ORCA_BIN:-/opt/orca/3dprintforge-slicer}"
ORCA_RESOURCES="${ORCA_RESOURCES:-/opt/orca/resources}"
ORCA_DATADIR="${ORCA_DATADIR:-/data/3DPrintForgeSlicer}"

log() { echo "[entrypoint] $*" >&2; }

mkdir -p "${XDG_RUNTIME_DIR:-/tmp/xdgrt}" 2>/dev/null || true
chmod 700 "${XDG_RUNTIME_DIR:-/tmp/xdgrt}" 2>/dev/null || true

# --- 1. Virtual X display -------------------------------------------------
log "starting Xvfb on ${DISPLAY}"
Xvfb "${DISPLAY}" -screen 0 1280x1024x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!

# Wait for the X socket to appear (best-effort, ~5s cap).
disp_num="${DISPLAY#:}"
for _ in $(seq 1 50); do
  [ -S "/tmp/.X11-unix/X${disp_num}" ] && break
  sleep 0.1
done

# --- 2. Seed writable data_dir --------------------------------------------
# The headless PresetBundle loads only the bare 1/1/1 default presets unless the
# data_dir contains the AppConfig (3DPrintForgeSlicer.conf) + system/ that mark
# the vendor profiles as enabled. The rootfs is read-only and data_dir lives on
# a tmpfs, so copy the baked seed template into data_dir on every boot.
ORCA_SEED="${ORCA_SEED:-/opt/orca/datadir-seed}"
mkdir -p "${ORCA_DATADIR}"
if [ -f "${ORCA_SEED}/3DPrintForgeSlicer.conf" ]; then
  cp -f "${ORCA_SEED}/3DPrintForgeSlicer.conf" "${ORCA_DATADIR}/3DPrintForgeSlicer.conf"
  [ -d "${ORCA_SEED}/system" ] && cp -a "${ORCA_SEED}/system" "${ORCA_DATADIR}/system"
  [ -d "${ORCA_SEED}/user" ] && cp -a "${ORCA_SEED}/user" "${ORCA_DATADIR}/user"
  log "seeded data_dir from ${ORCA_SEED}"
else
  log "WARNING: no data_dir seed at ${ORCA_SEED} — engine will load only default 1/1/1 profiles"
fi
# The engine resolves its resources tree relative to data_dir; symlink the baked
# read-only resources in.
if [ ! -e "${ORCA_DATADIR}/resources" ]; then
  ln -s "${ORCA_RESOURCES}" "${ORCA_DATADIR}/resources" 2>/dev/null || true
fi
# Layer operator-authored presets (persistent mounted volume) into the engine's
# user/default preset store so they're loaded + served in the dropdowns. The
# data_dir is tmpfs re-seeded each boot, so this copy must run every start.
# Presets are written to /data/user-profiles/{filament,process,machine}/*.json
# by import_creality_profiles.py (rebased onto engine bases).
if [ -d /data/user-profiles ]; then
  for _kind in filament process machine; do
    if [ -d "/data/user-profiles/${_kind}" ]; then
      mkdir -p "${ORCA_DATADIR}/user/default/${_kind}" 2>/dev/null || true
      cp -f "/data/user-profiles/${_kind}/"*.json \
            "${ORCA_DATADIR}/user/default/${_kind}/" 2>/dev/null || true
    fi
  done
  log "layered operator presets from /data/user-profiles into user/default"
fi

# --- 3. Engine REST server ------------------------------------------------
# Dash-form flags per REST_README verified section (--rest_port is NOT accepted).
log "launching engine REST server on 127.0.0.1:${ENGINE_REST_PORT}"
"${ORCA_BIN}" \
  --rest-only \
  --rest-port "${ENGINE_REST_PORT}" \
  --rest-bind 127.0.0.1 \
  --datadir "${ORCA_DATADIR}" >/tmp/engine.log 2>&1 &
ENGINE_PID=$!

cleanup() {
  log "shutting down"
  kill "${ENGINE_PID}" 2>/dev/null || true
  kill "${XVFB_PID}" 2>/dev/null || true
}
trap cleanup TERM INT EXIT

# --- 4. Adapter (foreground) ----------------------------------------------
export ENGINE_BASE="http://127.0.0.1:${ENGINE_REST_PORT}"
export ENGINE_PID
log "launching adapter on 0.0.0.0:${ADAPTER_PORT} → ${ENGINE_BASE}"
exec uvicorn main:app \
  --app-dir /opt/adapter \
  --host 0.0.0.0 \
  --port "${ADAPTER_PORT}" \
  --no-access-log
