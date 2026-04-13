## Context

Archmax federates queries across database connections using DuckDB extensions. Iceberg REST Catalogs differ from traditional RDBMS connections in their attach flow: they require a two-step process (create a DuckDB secret, then attach with that secret) and rely on object storage (S3/GCS) for data files. This design covers the attach mechanism, auth model, and CI test infrastructure.

## Goals / Non-Goals

- Goals:
  - Enable read-only querying of Iceberg tables via REST Catalog connections
  - Bearer token authentication for immediate use
  - Design the config schema to accommodate OAuth2 without breaking changes
  - Automated CI testing with a real Iceberg catalog + object storage

- Non-Goals:
  - Write operations (INSERT, UPDATE, DELETE) on Iceberg tables
  - OAuth2 token exchange implementation (future change)
  - Vended credentials / access delegation
  - Support for non-REST Iceberg catalogs (e.g., Hive Metastore, Glue/S3 Tables)

## Decisions

### 1. DuckDB Attach Flow for Iceberg

**Decision:** Use a two-step process — `CREATE SECRET` then `ATTACH` — rather than trying to fit iceberg into the existing single-`ATTACH` path.

**Rationale:** DuckDB's iceberg extension requires a secret for auth credentials and a separate `ATTACH` with `TYPE iceberg, ENDPOINT, SECRET` options. This is fundamentally different from the `ATTACH 'connection_string' AS slug (TYPE ext)` pattern used for postgres/mysql/mssql/sqlite.

**Implementation:**
```sql
-- 1. Load required extensions
INSTALL iceberg; LOAD iceberg;
INSTALL httpfs;  LOAD httpfs;

-- 2. Create a DuckDB secret scoped to this connection
CREATE SECRET <slug>_secret (
    TYPE iceberg,
    TOKEN '<bearer_token>'
);

-- 3. Attach the catalog
ATTACH '<warehouse>' AS <slug> (
    TYPE iceberg,
    ENDPOINT '<endpoint>',
    SECRET '<slug>_secret'
);
```

The `attachConnection` function in `duckdb.ts` will branch on `conn.type === "iceberg"` before the generic extension-attach path.

### 2. Connection Config Schema

**Decision:** Add iceberg-specific fields to the existing flat `connectionConfig` object.

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string (URL) | Yes (iceberg) | REST Catalog URL (validated as URL) |
| `warehouse` | string | Yes (iceberg) | Warehouse identifier passed to ATTACH |
| `token` | string | Yes (iceberg, bearer) | Bearer token (sensitive, encrypted at rest) |
| `authorizationType` | enum | No | `bearer` (default), `oauth2` |
| `clientId` | string | No | OAuth2 client ID (future) |
| `clientSecret` | string | No | OAuth2 client secret (future, sensitive) |
| `oauth2ServerUri` | string | No | OAuth2 token endpoint (future) |

The `token` field gets the same encryption-at-rest and redaction treatment as `password`. OAuth2 fields are accepted by the schema but unused in Phase 1; the backend ignores them until OAuth2 is implemented.

**Alternatives considered:**
- Nested `icebergConfig` sub-object: Would require discriminated union validation and break the flat config pattern. Rejected for complexity.
- Reuse `uri` field for endpoint: Semantically confusing since iceberg needs both an endpoint URL and a warehouse name. Rejected.

### 3. Extension Installation

**Decision:** Pre-install `iceberg` and `httpfs` in the Docker image alongside the existing extensions.

**Rationale:** The Dockerfile already pre-installs postgres, mysql, sqlite, and mssql extensions in a build step and copies them to `/duckdb-extensions/`. Adding iceberg + httpfs to this list keeps startup fast and avoids runtime downloads. `httpfs` is required by iceberg for fetching data from object storage.

### 4. CI Test Stack: Lakekeeper + MinIO

**Decision:** Use [Lakekeeper](https://github.com/lakekeeper/lakekeeper) as the Iceberg REST Catalog and [MinIO](https://min.io) as S3-compatible object storage for CI E2E tests.

**Rationale:**
- **Lakekeeper** is a lightweight, open-source Iceberg REST Catalog server with a Docker image. It implements the Iceberg REST Catalog spec and works well with MinIO as its storage backend. No external authentication provider is required in development mode.
- **MinIO** is the standard S3-compatible object storage for CI/testing. It's fast to start, needs no cloud credentials, and is widely used in CI pipelines for Iceberg/lakehouse testing.

**Alternatives considered:**
- Polaris (Apache): Heavier, requires more setup, Lakekeeper is simpler for CI.
- Real S3: Requires cloud credentials in CI, adds cost and flakiness. Rejected.
- LocalStack: Overkill for just S3, MinIO is more focused.

**CI Services:**
```yaml
minio:
  image: minio/minio
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  healthcheck:
    test: ["CMD", "mc", "ready", "local"]

lakekeeper:
  image: vakamo/lakekeeper:latest
  depends_on:
    minio: { condition: service_healthy }
  environment:
    LAKEKEEPER__LISTEN_PORT: 8181
    LAKEKEEPER__BASE_URI: http://lakekeeper:8181
  healthcheck:
    test: ["CMD", "curl", "-sf", "http://localhost:8181/health"]

iceberg-init:
  image: debian:bookworm-slim
  depends_on:
    lakekeeper: { condition: service_healthy }
    minio: { condition: service_healthy }
  volumes:
    - ./apps/e2e/fixtures/iceberg:/seed:ro
  entrypoint: ["/bin/bash", "/seed/init.sh"]
```

The `iceberg-init` container mirrors the existing `mssql-init` pattern. It runs `init.sh` which:
1. Creates the MinIO bucket via `mc` CLI
2. Creates the Lakekeeper warehouse via the management REST API
3. Installs DuckDB CLI and runs `seed.sql` to create the `e2e_test` namespace and `e2e_shipments` table

**Seed data (e2e_shipments):**

| id | product_name | shipped_date | destination |
|----|-------------|-------------|-------------|
| 1  | Widget A    | 2024-01-15  | New York    |
| 2  | Widget B    | 2024-01-16  | London      |
| 3  | Widget C    | 2024-01-17  | Berlin      |

This dataset follows the existing fixture conventions (`e2e_` prefix, 3 rows, Widget A/B/C names for cross-engine joins) and enables cross-catalog join tests between Iceberg and the RDBMS connections.

### 5. Auth Extensibility

**Decision:** Accept OAuth2 fields in the schema now but only implement bearer token auth. The `authorizationType` field defaults to `bearer`.

When OAuth2 is implemented (future change), the DuckDB secret creation switches from `TOKEN` to `CLIENT_ID`, `CLIENT_SECRET`, `OAUTH2_SERVER_URI`:
```sql
CREATE SECRET <slug>_secret (
    TYPE iceberg,
    CLIENT_ID '<clientId>',
    CLIENT_SECRET '<clientSecret>',
    OAUTH2_SERVER_URI '<oauth2ServerUri>'
);
```

No schema migration needed — the fields already exist.

## Risks / Trade-offs

- **Lakekeeper stability:** Lakekeeper is relatively new. If its Docker image has issues, CI could become flaky. Mitigation: pin to a specific tag, not `:latest`.
- **DuckDB iceberg extension maturity:** The iceberg extension is actively developed and API may change across DuckDB versions. Mitigation: pin DuckDB version, test in CI.
- **MinIO adds ~100MB to CI:** Acceptable given it enables real S3-compatible testing.
- **Bearer token expiry:** Bearer tokens can expire. The current design stores a static token. Users must manually rotate. Future OAuth2 support will automate token refresh.

## Resolved Questions

- **Frontend grouping:** Iceberg appears in the normal connection type list alongside postgres, mysql, etc. No separate "Data Lake" category.
- **`authorizationType: "none"`:** Not supported. Bearer token is required; OAuth2 will be added later. This simplifies validation and avoids an insecure default.
- **`endpoint` URL validation:** Yes — the `endpoint` field SHALL be validated as a URL (scheme + host at minimum) in the Zod schema.
