#!/bin/sh
set -e

export ARCHMAX_DATA_DIR="${ARCHMAX_DATA_DIR:-/data}"
export HOME="$ARCHMAX_DATA_DIR"
mkdir -p "$ARCHMAX_DATA_DIR/projects"

# When running as root (default), fix ownership on volume mounts and re-exec as archmax.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$ARCHMAX_DATA_DIR/projects" "$ARCHMAX_DATA_DIR/mongodb" "$ARCHMAX_DATA_DIR/.duckdb" /tmp/redis
  chown archmax:archmax "$ARCHMAX_DATA_DIR" "$ARCHMAX_DATA_DIR/projects" "$ARCHMAX_DATA_DIR/mongodb" /tmp/redis /var/log
  # The DuckDB extension cache lives on the persistent volume. Reclaim it for
  # archmax (older images created it as root) so the app can create the
  # version-specific extension dir (e.g. extensions/v1.5.3) after a DuckDB
  # upgrade instead of failing with "Permission denied".
  chown -R archmax:archmax "$ARCHMAX_DATA_DIR/.duckdb"
  exec gosu archmax "$0" "$@"
fi

# Seed pre-installed DuckDB extensions into the runtime home so INSTALL/LOAD is a
# no-op and DuckDB never has to create a (possibly unwritable) version dir at
# query time. Runs after the privilege drop so the copies are archmax-owned, and
# overlays unconditionally: an image upgrade ships a new DuckDB version with a
# new versioned subdir (e.g. extensions/v1.5.3) that must be seeded even when an
# older version's dir already exists on the persistent volume.
if [ -d /duckdb-extensions ]; then
  mkdir -p "$HOME/.duckdb/extensions"
  cp -rf /duckdb-extensions/* "$HOME/.duckdb/extensions/"
fi

# --- Embedded MongoDB (when MONGODB_URI is not provided) ---
if [ -z "$MONGODB_URI" ]; then
  mkdir -p "$ARCHMAX_DATA_DIR/mongodb"
  echo "[entrypoint] Starting embedded MongoDB..."
  mongod --bind_ip 127.0.0.1 --dbpath "$ARCHMAX_DATA_DIR/mongodb" --logpath /var/log/mongod.log --fork

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

# --- Pre-flight: required environment variables ---
MISSING=""
if [ -z "$BETTER_AUTH_SECRET" ]; then
  MISSING="${MISSING}\n  BETTER_AUTH_SECRET  (min 32 chars, generate with: openssl rand -base64 32)"
fi
if [ -z "$UI_PASSWORD" ]; then
  MISSING="${MISSING}\n  UI_PASSWORD         (min 8 chars, used to log in to the admin UI)"
fi
if [ -n "$MISSING" ]; then
  echo ""
  echo "========================================================"
  echo "  CONFIGURATION ERROR"
  echo "========================================================"
  echo ""
  echo "  The following required environment variables are not set:"
  printf "%b\n" "$MISSING"
  echo ""
  echo "  See .env.example or the documentation for details."
  echo "  The container will stay running so you can inspect this message."
  echo "========================================================"
  echo ""
  exec sleep infinity
fi

# Supervise a long-running process: restart it whenever it exits.
#
# The BullMQ worker runs DuckDB (and its mysql/postgres/mssql scanner
# extensions) in-process. A native assertion/segfault inside an extension
# calls abort() and takes the whole Node process down — JS try/catch cannot
# intercept it. Without supervision the worker would die permanently and new
# chat messages would queue forever with nothing to process them. The 2s
# backoff keeps a hard crash-loop from spinning the CPU.
supervise() {
  name="$1"
  shift
  while true; do
    "$@" || echo "[entrypoint] $name exited (code $?); restarting in 2s" >&2
    sleep 2
  done
}

# Start the BullMQ agent worker under supervision, in the background.
( cd /app/apps/worker && supervise worker node worker.mjs ) &

( cd /app/apps/api && supervise api env PORT=3000 node server.mjs ) &

exec nginx -g 'daemon off;'
