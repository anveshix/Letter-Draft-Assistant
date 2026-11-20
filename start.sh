#!/bin/sh
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>=18) is not installed. Install from https://nodejs.org"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "First-time setup: Installing packages..."
  npm install --no-fund --no-audit
fi

(sleep 2; xdg-open http://localhost:${PORT:-3000} >/dev/null 2>&1 || open http://localhost:${PORT:-3000} >/dev/null 2>&1 || true) &
exec node server.js
