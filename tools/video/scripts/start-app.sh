#!/usr/bin/env bash
# Starts the LOCAL app for filming: PostgreSQL, API (production module on) and the built web app on :3000.
# Logs: out/api.log, out/web.log. Local container only.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT="$ROOT/tools/video/out"; mkdir -p "$OUT"
sudo service postgresql start >/dev/null
cd "$ROOT/backend"
if ! curl -sf -o /dev/null http://127.0.0.1:8000/api/v1/health/ready; then
  CMMS_OPERATIONS_MODULE=true CMMS_COOKIE_SECURE=false CMMS_RATE_LIMIT_PER_MINUTE=5000 CMMS_LOGIN_RATE_LIMIT_PER_MINUTE=1000 \
    nohup .venv/bin/uvicorn app.main:app --port 8000 >"$OUT/api.log" 2>&1 &
fi
cd "$ROOT/frontend"
if ! curl -sf -o /dev/null http://127.0.0.1:3000/login; then
  BACKEND_URL=http://127.0.0.1:8000 nohup npx next start -p 3000 >"$OUT/web.log" 2>&1 &
fi
for _ in $(seq 1 60); do curl -sf -o /dev/null http://127.0.0.1:3000/login && curl -sf -o /dev/null http://127.0.0.1:8000/api/v1/health/ready && { echo "app ready"; exit 0; }; sleep 1; done
echo "app did not start; see $OUT/api.log and $OUT/web.log"; exit 1
