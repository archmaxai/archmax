## Context

The DuckDB federation layer already attaches each active connection as a named schema. DuckDB exposes `information_schema` metadata for all attached databases, which can be queried to enumerate schemas and tables without custom bookkeeping. The data browser adds read-only API endpoints on top of the existing `getProjectInstance` service and a new frontend page.

## Goals / Non-Goals

- Goals: Browse attached databases, list tables, preview data with pagination
- Non-Goals: Data editing, DDL operations, custom SQL queries, export, filtering/sorting beyond pagination

## Decisions

- **DuckDB metadata queries**: Use `SHOW DATABASES` to list attached schemas, `information_schema.tables` scoped to a database to list tables, and `SELECT * FROM <db>.<schema>.<table> LIMIT/OFFSET` for paginated data with `COUNT(*)` for total rows.
- **No new DuckDB service methods**: The existing `getProjectInstance` returns a `DuckDBInstance` that can `connect()` and run arbitrary SQL. The API route will use this directly — no need to add service-layer abstractions for a read-only browser.
- **Pagination**: Server-side using LIMIT/OFFSET. Default page size of 50 rows, configurable via query parameter up to a max of 500.
- **SQL injection prevention**: Database and table names will be validated against `information_schema` metadata before interpolation into queries. Only identifiers that exist in the DuckDB catalog will be used.
- **Frontend layout**: Left panel lists databases as expandable sections with their tables; selecting a table shows data in a paginated table on the right. Simple flat layout, no nested schemas (DuckDB attached databases surface as top-level schemas).

## Risks / Trade-offs

- Large tables: `COUNT(*)` can be slow on very large remote tables → accept this for MVP; can add estimated counts or lazy total later
- Schema names come from connection slugs, so naming is consistent with the rest of the system

## Open Questions

- None currently
