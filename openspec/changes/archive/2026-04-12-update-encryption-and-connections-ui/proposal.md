# Change: Encrypt connection credentials at rest and improve connections list UI

## Why

Database connection passwords and URIs are stored as plaintext in MongoDB, relying only on API-level redaction for security. If the database is compromised, all credentials are exposed. Additionally, the connections overview table shows a "Host / URI" column that leaks infrastructure details at a glance; replacing it with a description teaser gives users more useful context while reducing visual noise. The `ENCRYPTION_KEY` env var also needs documentation so operators know how to configure it.

## What Changes

- Encrypt `connectionConfig.password` and `connectionConfig.uri` at rest using the existing `encrypt()`/`decrypt()` helpers when `ENCRYPTION_KEY` is set; store plaintext when the key is absent (matching the test-agent behavior we just landed)
- Decrypt credentials on the fly before passing them to DuckDB attach, data browser queries, and test-connection flows
- Replace the "Host / URI" column in the connections list table with a "Description" column showing a truncated `description` teaser (or a muted placeholder if empty)
- Update the testing-suite spec to reflect the current behavior where `ENCRYPTION_KEY` is optional (stores plaintext when absent) rather than required
- Document `ENCRYPTION_KEY` in the self-hosting guide and `.env.example`
- Add/update tests covering encryption round-trips for connections and the updated spec behavior

## Impact

- Affected specs: `data-connections`, `connection-management-ui`, `testing-suite`
- Affected code:
  - `apps/api/src/routes/connections.ts` (encrypt on create/update, decrypt for attach/test)
  - `packages/core/src/services/duckdb.ts` (decrypt before DuckDB attach)
  - `packages/core/src/models/Connection.ts` (no schema change needed; password field stays a string)
  - `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx` (swap Host/URI column for Description)
  - `apps/api/src/routes/connections.test.ts` (encryption tests)
  - `apps/docs/src/content/docs/guides/self-hosting.mdx` (document ENCRYPTION_KEY)
  - `.env.example` files
