#!/bin/sh
set -e

export ARCHMAX_DATA_DIR="${ARCHMAX_DATA_DIR:-${ARCHSEM_DATA_DIR:-${SEMLAYER_DATA_DIR:-/app/data/projects}}}"

if [ -z "$MONGODB_URI" ]; then
  echo "[entrypoint] ERROR: MONGODB_URI is required. Set it to a MongoDB connection string."
  echo "[entrypoint] Tip: use docker compose up with the provided docker-compose.yml for a ready-to-go setup."
  exit 1
fi

# --- Embedded Redis (when REDIS_URL is not provided) ---
if [ -z "$REDIS_URL" ]; then
  mkdir -p /tmp/redis
  echo "[entrypoint] Starting embedded Redis..."
  redis-server --daemonize yes --dir /tmp/redis --bind 127.0.0.1 --loglevel warning
  export REDIS_URL="redis://127.0.0.1:6379"
  echo "[entrypoint] Embedded Redis ready"
fi

# Start the BullMQ agent worker in the background.
cd /app/apps/worker && node worker.mjs &

cd /app/apps/api && PORT=3000 node server.mjs &

exec nginx -g 'daemon off;'
