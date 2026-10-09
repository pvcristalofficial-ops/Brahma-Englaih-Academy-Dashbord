#!/usr/bin/env bash
# Builds an upload-ready package:  release/dashboard/  (+ release/brahma-dashboard.zip)
#   release/dashboard/index.html, assets/...   <- React app
#   release/dashboard/api/...                  <- PHP backend
# Usage: ./scripts/build-release.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/release/dashboard"

rm -rf "$ROOT/release"
mkdir -p "$OUT/api"

echo "==> Building React app"
cd "$ROOT/frontend"
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
npm run build
cp -R dist/. "$OUT/"

echo "==> Copying PHP backend (without tests, dev files, secrets, runtime data)"
tar -C "$ROOT/backend" \
  --exclude='./config.php' --exclude='./tests' --exclude='./dev-router.php' \
  --exclude='./storage/sessions/*' --exclude='./storage/logs/*' --exclude='./storage/backups' --exclude='./storage/setup.lock' \
  -cf - . | tar -C "$OUT/api" -xf -
mkdir -p "$OUT/api/storage/sessions" "$OUT/api/storage/logs"
touch "$OUT/api/storage/sessions/.gitkeep" "$OUT/api/storage/logs/.gitkeep"

cat > "$OUT/api/storage/README.txt" <<'TXT'
Runtime data (sessions, logs, backups). Must be writable by PHP (chmod 755/775). Blocked from the web by .htaccess.
TXT

echo "==> Zipping"
cd "$ROOT/release"
if command -v zip >/dev/null 2>&1; then zip -qr brahma-dashboard.zip dashboard; else tar -czf brahma-dashboard.tar.gz dashboard; fi
echo "Done: $ROOT/release"
ls -la "$ROOT/release"
