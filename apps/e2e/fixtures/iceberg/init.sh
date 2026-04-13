#!/usr/bin/env bash
set -euo pipefail

LAKEKEEPER_URL="${LAKEKEEPER_URL:-http://lakekeeper:8181}"
MINIO_URL="${MINIO_URL:-http://minio:9000}"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"

echo "==> Installing dependencies..."
apt-get update -qq && apt-get install -y -qq --no-install-recommends curl ca-certificates unzip > /dev/null

echo "==> Waiting for Lakekeeper to be ready..."
for i in $(seq 1 30); do
  if curl -sf "${LAKEKEEPER_URL}/health" > /dev/null 2>&1; then
    echo "    Lakekeeper is ready."
    break
  fi
  [ "$i" -eq 30 ] && { echo "ERROR: Lakekeeper not ready after 30s"; exit 1; }
  sleep 1
done

echo "==> Bootstrapping Lakekeeper..."
HTTP_CODE=$(curl -s -o /tmp/bootstrap-response.txt -w "%{http_code}" \
  -X POST "${LAKEKEEPER_URL}/management/v1/bootstrap" \
  -H "Content-Type: application/json" \
  -d '{"accept-terms-of-use": true}')
echo "    Bootstrap response: $HTTP_CODE"

echo "==> Installing MinIO client..."
curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
chmod +x /usr/local/bin/mc

echo "==> Creating MinIO bucket 'warehouse'..."
mc alias set local "${MINIO_URL}" "${MINIO_USER}" "${MINIO_PASS}"
mc mb --ignore-existing local/warehouse

echo "==> Creating Lakekeeper warehouse 'e2e_warehouse'..."
HTTP_CODE=$(curl -s -o /tmp/lk-response.txt -w "%{http_code}" \
  -X POST "${LAKEKEEPER_URL}/management/v1/warehouse" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouse-name": "e2e_warehouse",
    "storage-profile": {
      "type": "s3",
      "bucket": "warehouse",
      "endpoint": "'"${MINIO_URL}"'",
      "region": "us-east-1",
      "path-style-access": true,
      "flavor": "minio",
      "sts-enabled": true
    },
    "storage-credential": {
      "type": "s3",
      "credential-type": "access-key",
      "aws-access-key-id": "'"${MINIO_USER}"'",
      "aws-secret-access-key": "'"${MINIO_PASS}"'"
    }
  }')
if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "    Warehouse created (HTTP $HTTP_CODE)."
elif [ "$HTTP_CODE" -eq 409 ]; then
  echo "    Warehouse already exists, continuing."
else
  echo "    ERROR: Failed to create warehouse (HTTP $HTTP_CODE):"
  cat /tmp/lk-response.txt
  echo ""
  exit 1
fi

echo "==> Installing DuckDB CLI..."
curl -fsSL https://install.duckdb.org | sh
export PATH="$HOME/.duckdb/cli/latest:$PATH"

echo "==> Seeding Iceberg tables via DuckDB..."
duckdb -c "
INSTALL iceberg;
LOAD iceberg;
INSTALL httpfs;
LOAD httpfs;
$(cat /seed/seed.sql)
SELECT * FROM lake.e2e_test.e2e_shipments;
"

echo "==> Iceberg seed complete."
