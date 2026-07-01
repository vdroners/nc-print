#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== nc_print preflight ==="
command -v node >/dev/null
command -v npm >/dev/null
test -f package.json
test -f appinfo/info.xml
test -f lib/Service/ConfigService.php

lint_php() {
  local f="$1"
  if command -v php >/dev/null 2>&1; then
    php -l "$f" >/dev/null
  else
    docker run --rm -v "$ROOT:/app" -w /app php:8.2-cli php -l "$f" >/dev/null
  fi
}
for f in lib/Service/MultipartBuilder.php lib/Controller/PrinterController.php lib/Controller/SlicerProxyController.php; do
  lint_php "$f"
done

# G17 — viewport module + three chunk artifact
test -f src/three/viewport.js
grep -q 'export async function createViewport' src/three/viewport.js
ls js/nc_print-nc-print-three.js* >/dev/null 2>&1 || npm run build >/dev/null
ls js/nc_print-nc-print-three.js* >/dev/null

echo "OK preflight static checks (G17 viewport bundle)"
