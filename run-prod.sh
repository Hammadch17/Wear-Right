#!/bin/bash
# Production-style local demo: builds the frontend, migrates and seeds the database,
# then serves Next.js on :3000 and Django on :8000.
#
#   ./run-prod.sh              build, migrate, seed, start
#   ./run-prod.sh --skip-build reuse the existing .next build
#   ./run-prod.sh --no-seed    start without seeding demo products
set -euo pipefail
cd "$(dirname "$0")"

SKIP_BUILD=0
SEED=1
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-seed) SEED=0 ;;
    -h|--help)
      echo "Usage: ./run-prod.sh [--skip-build] [--no-seed]"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

SERVER_PY="apps/server/venv/bin/python"
if [ ! -x "$SERVER_PY" ]; then
  echo "ERROR: Python environment missing at $SERVER_PY" >&2
  echo "Run: node scripts/wearright.mjs install" >&2
  exit 1
fi

free_port_3000() {
  local pids=""
  pids=$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)
  if [ -z "$pids" ]; then
    pids=$(fuser 3000/tcp 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true)
  fi
  if [ -n "$pids" ]; then
    echo "Stopping process(es) on port 3000: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
  if lsof -tiTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "ERROR: port 3000 is still in use." >&2
    exit 1
  fi
}

free_port_3000

# Django reads apps/server/.env; load it here too so the whole script shares it.
if [ -f apps/server/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . apps/server/.env
  set +a
fi
export DEBUG=False
export ALLOWED_HOSTS="${ALLOWED_HOSTS:-*}"
export SERVE_MEDIA="${SERVE_MEDIA:-True}"
export CSRF_TRUSTED_ORIGINS="${CSRF_TRUSTED_ORIGINS:-http://localhost:3000,http://127.0.0.1:3000}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
export BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}"

if [ "$SKIP_BUILD" -eq 1 ]; then
  echo "1/3  Starting PostgreSQL and Mailpit..."
  docker compose up -d --wait
  echo "2/3  Applying database migrations..."
  (cd apps/server && venv/bin/python manage.py migrate --noinput)
else
  echo "1/3  Migrating and building..."
  ./run-build.sh
fi

if [ "$SEED" -eq 1 ]; then
  echo "3/3  Seeding demo catalogue (idempotent)..."
  (cd apps/server && venv/bin/python manage.py seed_products)
else
  echo "3/3  Skipping demo seed."
fi

API_PID=""
WEB_PID=""
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping demo..."
  if [ -n "$WEB_PID" ] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
  fi
  for pid in "$WEB_PID" "$API_PID"; do
    [ -n "$pid" ] && wait "$pid" 2>/dev/null || true
  done
  docker compose stop >/dev/null 2>&1 || true
}
trap cleanup INT TERM EXIT

echo
echo "Starting Django API on http://127.0.0.1:8000 ..."
# --insecure keeps Django's own static files (admin CSS) available with DEBUG=False.
(cd apps/server && exec venv/bin/python manage.py runserver 8000 --noreload --insecure) &
API_PID=$!

echo "Starting Next.js on http://localhost:3000 ..."
npm --prefix apps/web run start &
WEB_PID=$!

sleep 2
if ! kill -0 "$API_PID" 2>/dev/null; then
  echo "ERROR: Django failed to start." >&2
  exit 1
fi
if ! kill -0 "$WEB_PID" 2>/dev/null; then
  echo "ERROR: Next.js failed to start." >&2
  exit 1
fi

echo
echo "Demo ready:"
echo "  Storefront  http://localhost:3000"
echo "  Admin       http://localhost:3000/admin/login"
echo "  API         http://127.0.0.1:8000/api/"
echo "Admin password: ${DEMO_ADMIN_PASSWORD:-set DEMO_ADMIN_PASSWORD in apps/server/.env}"
echo "Press Ctrl+C to stop both servers and the containers."
echo

wait
