#!/bin/sh
set -e

cd /app/apps/api && PORT=3000 node server.mjs &

exec nginx -g 'daemon off;'
