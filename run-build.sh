#!/bin/bash
# Applies the database schema and creates the production Next.js build.
# Use this before `run-prod.sh` when you only want to build.
set -euo pipefail
cd "$(dirname "$0")"

SERVER_PY="apps/server/venv/bin/python"
if [ ! -x "$SERVER_PY" ]; then
  echo "ERROR: Python environment missing at $SERVER_PY" >&2
  echo "Run: node scripts/wearright.mjs install" >&2
  exit 1
fi

echo "1/3  Starting PostgreSQL and Mailpit..."
docker compose up -d --wait

echo "2/3  Applying database migrations..."
# Run from apps/server so Django loads apps/server/.env.
(cd apps/server && venv/bin/python manage.py migrate --noinput)

echo "3/3  Building the production frontend..."
npm --prefix apps/web run build

echo
echo "Build finished. Start the demo with: ./run-prod.sh --skip-build"
