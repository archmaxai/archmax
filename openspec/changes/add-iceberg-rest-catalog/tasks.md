## 1. Core Model & Schema

- [x] 1.1 Add `iceberg` to `CONNECTION_TYPES` in `packages/core/src/models/Connection.ts`
- [x] 1.2 Add iceberg-specific fields (`endpoint`, `warehouse`, `token`, `authorizationType`, `clientId`, `clientSecret`, `oauth2ServerUri`) to the Zod `connectionConfigSchema` in `apps/api/src/routes/connections.ts`
- [x] 1.3 Apply encryption-at-rest to `token` field (same treatment as `password`) in connection create/update handlers
- [x] 1.4 Apply redaction to `token` field in API responses (same `••••••••` sentinel as `password`)
- [x] 1.5 Apply credential-preservation logic for `token` on update (same sentinel/empty handling as `password`)

## 2. DuckDB Attach Flow

- [x] 2.1 Add `iceberg` branch to `extensionForType()` or handle separately in `attachConnection()` in `packages/core/src/services/duckdb.ts`
- [x] 2.2 Implement `attachIcebergCatalog()`: load iceberg + httpfs extensions, CREATE SECRET, ATTACH with TYPE iceberg
- [x] 2.3 Implement `detachIcebergCatalog()`: DROP SECRET and DETACH on connection delete/deactivate
- [x] 2.4 Handle iceberg in `testSingleConnection()` for the Test Connection button
- [x] 2.5 Add `iceberg` and `httpfs` to the DuckDB extension pre-install in `Dockerfile`
- [x] 2.6 Write unit tests for the iceberg attach/detach flow

## 3. Frontend

- [x] 3.1 Add `iceberg` option to the connection type selector
- [x] 3.2 Create iceberg-specific form fields (endpoint, warehouse, token, auth type) in the connection form
- [x] 3.3 Add `endpoint` URL validation feedback to the form

## 4. CI Test Infrastructure

- [x] 4.1 Add MinIO service to `docker-compose.ci.yml` with healthcheck
- [x] 4.2 Add Lakekeeper service to `docker-compose.ci.yml` with healthcheck, connected to MinIO
- [x] 4.3 Add `iceberg-init` one-shot service using `apps/e2e/fixtures/iceberg/init.sh`: creates MinIO bucket, Lakekeeper warehouse `e2e_warehouse`, namespace `e2e_test`, and seeds `e2e_shipments` table via DuckDB CLI
- [x] 4.4 Refine `apps/e2e/fixtures/iceberg/init.sh` and `seed.sql` (already drafted) for the chosen base image
- [x] 4.5 Wire `app` service to depend on `iceberg-init` (service_completed_successfully)
- [x] 4.6 Expose Lakekeeper endpoint to app via environment or rely on Docker networking (hostname `lakekeeper:8181`)

## 5. E2E Tests

- [x] 5.1 Add iceberg connection to `CONNECTIONS` array in `data-federation.spec.ts` and `mcp.spec.ts` with `type: "iceberg"`, `endpoint: "http://lakekeeper:8181/catalog"`, `warehouse: "e2e_warehouse"`
- [x] 5.2 Add `createConnection` branch for iceberg type (fills endpoint, warehouse fields instead of host/port)
- [x] 5.3 Add E2E test: test iceberg connection succeeds against Lakekeeper
- [x] 5.4 Add `shipments` dataset to `buildSemanticModel()` mapped to `{icebergSlug}.e2e_test.e2e_shipments` with fields `id`, `product_name`, `shipped_date`, `destination`
- [x] 5.5 Add E2E test: `execute_query` returns Iceberg data (`SELECT * FROM "shipments"` → contains `Widget A`)
- [x] 5.6 Add E2E test: cross-catalog join Postgres + Iceberg (`products JOIN shipments ON name = product_name` → contains `New York`)

## 6. Documentation

- [x] 6.1 Update docs site with Iceberg REST Catalog connection guide (setup, auth options, limitations)
