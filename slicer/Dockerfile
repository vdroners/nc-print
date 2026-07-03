# nc-print-slicer — self-contained slicing engine sidecar
#
# Bakes the 3DPrintForge Slicer (an OrcaSlicer fork) CLI + its resources tree
# and runs the binary's built-in headless REST server (`--rest-only`) behind a
# thin FastAPI reverse-proxy on :8080. nc-print's PHP backend talks to this
# container by DNS name over the shared `nc-print-net` network, so nc-print no
# longer depends on the external forge-slicer Node service.
#
# BASE IMAGE: must be Ubuntu 24.04 (noble). The engine binary requires
# GLIBC_2.38 / GLIBCXX_3.4.32, which are not present on 22.04 (glibc 2.35).
#
# HEADLESS: the engine links GTK3 + webkit2gtk + Wayland (not Qt), so it needs a
# virtual X display (Xvfb) and software GL (Mesa llvmpipe) — NOT
# QT_QPA_PLATFORM=offscreen. See entrypoint.sh.
#
# The engine binary (~145 MB) and its resources/ tree (~237 MB) are NOT stored
# in git. Run `make slicer-fetch` first to stage them under
# slicer/3dprintforge-slicer/ from a local install or release artifact.
FROM ubuntu:24.04

# Runtime libraries the engine needs (resolved from `ldd` on the binary).
# libwebkit2gtk-4.1-0 transitively pulls the bulk of the GTK/webkit/gstreamer
# stack; the rest are the direct dependencies apt does not drag in for us.
# Xvfb + mesa provide the headless display and software GL.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      tini \
      xvfb \
      dbus-x11 \
      fonts-dejavu-core \
      libwebkit2gtk-4.1-0 \
      libgtk-3-0 \
      libgdk-pixbuf-2.0-0 \
      libglib2.0-0 \
      libsecret-1-0 \
      libsoup-3.0-0 \
      libgstreamer1.0-0 \
      libgstreamer-plugins-base1.0-0 \
      libgstreamer-gl1.0-0 \
      libegl1 \
      libgl1 \
      libopengl0 \
      libglx0 \
      libglx-mesa0 \
      libgl1-mesa-dri \
      libgbm1 \
      libdrm2 \
      libosmesa6 \
      libwebpdemux2 \
      libwebpmux3 \
      libatomic1 \
      libmanette-0.2-0 \
      python3 \
      python3-pip \
      python3-venv \
  && rm -rf /var/lib/apt/lists/*

# Python adapter deps in an isolated venv (Ubuntu 24.04 marks the system env
# externally-managed, so pip-into-system is refused).
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
COPY adapter/requirements.txt /opt/adapter/requirements.txt
RUN pip install --no-cache-dir -r /opt/adapter/requirements.txt

# Bake the engine + its resources (staged by `make slicer-fetch`).
# 3dprintforge-slicer/ layout: the ELF binary, resources/, LICENSE.txt.
COPY 3dprintforge-slicer/3dprintforge-slicer /opt/orca/3dprintforge-slicer
COPY 3dprintforge-slicer/resources /opt/orca/resources
# LICENSE.txt is required for AGPL compliance when this image is distributed.
COPY 3dprintforge-slicer/LICENSE.txt /opt/orca/LICENSE.txt
# Seed data_dir template: AppConfig (.conf) + system/ + user/ that enable the
# vendor PresetBundle. Without this the headless engine loads only the bare
# 1/1/1 default presets. entrypoint.sh copies this into the writable data_dir on
# boot (the rootfs is read-only; data_dir lives on a tmpfs).
COPY 3dprintforge-slicer/datadir-seed /opt/orca/datadir-seed

COPY adapter/ /opt/adapter/
RUN chmod +x /opt/adapter/entrypoint.sh

# The engine resolves resources relative to data_dir(). We point data_dir at the
# baked resources root; a writable user-profile volume is mounted at
# /data/user-profiles by docker-compose.slicer.yml for operator presets.
ENV ORCA_BIN=/opt/orca/3dprintforge-slicer \
    ORCA_RESOURCES=/opt/orca/resources \
    ORCA_DATADIR=/data/3DPrintForgeSlicer \
    XDG_CONFIG_HOME=/data \
    HOME=/data \
    ENGINE_REST_PORT=8765 \
    ADAPTER_PORT=8080 \
    SLICE_JOB_ROOT=/tmp/slice \
    DISPLAY=:99 \
    GDK_BACKEND=x11 \
    LIBGL_ALWAYS_SOFTWARE=1 \
    GALLIUM_DRIVER=llvmpipe \
    XDG_RUNTIME_DIR=/tmp/xdgrt

WORKDIR /opt/adapter
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD python3 /opt/adapter/healthcheck.py || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/opt/adapter/entrypoint.sh"]
