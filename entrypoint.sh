#!/bin/sh
set -e

export SEMLAYER_DATA_DIR="${SEMLAYER_DATA_DIR:-/app/data/projects}"

# Start the BullMQ agent worker in the background.
# This can be moved to a separate service later for independent scaling.
cd /app/apps/worker && node worker.mjs &

cd /app/apps/api && PORT=3000 node server.mjs &

exec nginx -g 'daemon off;'
