#!/bin/sh
set -e

export ARCHMAX_DATA_DIR="${ARCHMAX_DATA_DIR:-${ARCHSEM_DATA_DIR:-${SEMLAYER_DATA_DIR:-/app/data/projects}}}"

# --- Embedded MongoDB (when MONGODB_URI is not provided) ---
if [ -z "$MONGODB_URI" ]; then
  mkdir -p /app/data/mongodb
  echo "[entrypoint] Starting embedded MongoDB..."
  mongod --bind_ip 127.0.0.1 --dbpath /app/data/mongodb --logpath /var/log/mongod.log --fork

  TRIES=0
  until mongosh --quiet --eval 'db.runCommand({ping:1})' > /dev/null 2>&1; do
    TRIES=$((TRIES + 1))
    if [ "$TRIES" -ge 20 ]; then
      echo "[entrypoint] ERROR: Embedded MongoDB failed to start within 10 seconds."
      cat /var/log/mongod.log
      exit 1
    fi
    sleep 0.5
  done

  export MONGODB_URI="mongodb://127.0.0.1:27017/archmax"
  echo "[entrypoint] Embedded MongoDB ready"
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
