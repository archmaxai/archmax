## 1. Connection credential encryption (API layer)

- [x] 1.1 In `connections.ts` POST handler, encrypt `connectionConfig.password` and `connectionConfig.uri` before persisting when `ENCRYPTION_KEY` is set; store plaintext when absent
- [x] 1.2 In `connections.ts` PUT handler, encrypt new password/URI values through `mergeConnectionConfig` before persisting (preserve existing encrypted value when sentinel/empty is sent)
- [x] 1.3 Update `redactConnectionConfig` to first decrypt credentials before redacting (so responses still return the `********` sentinel, not encrypted blobs)
- [x] 1.4 Update `mergeConnectionConfig` to handle the encrypted-at-rest flow: decrypt stored value for comparison, re-encrypt new value if changed

## 2. Decrypt for downstream consumers

- [x] 2.1 In `duckdb.ts` (`buildAttachString`), decrypt `connectionConfig.password` and `connectionConfig.uri` before building DuckDB ATTACH strings
- [x] 2.2 In the test-connection handler (`connections.ts` POST `/:id/test`), decrypt credentials before testing connectivity (covered by 2.1 since test-connection calls `getProjectInstance` -> `buildAttachString`)
- [x] 2.3 In data browser routes, ensure decryption occurs before use (covered by 2.1 since data browser calls `getProjectInstance` -> `buildAttachString`)

## 3. Frontend: replace Host/URI column with Description teaser

- [x] 3.1 In `connections/index.tsx`, replace the "Host / URI" `TableHead`/`TableCell` with "Description" showing `conn.description` truncated, or a muted "No description" placeholder

## 4. Update testing-suite spec (ENCRYPTION_KEY optional)

- [x] 4.1 Modify the `Test Agent Model` requirement to reflect that `ENCRYPTION_KEY` is optional: when absent, API keys are stored in plaintext; when present, they are encrypted with AES-256-GCM

## 5. Documentation

- [x] 5.1 Add `ENCRYPTION_KEY` to `.env.example` with a generation command comment
- [x] 5.2 Document `ENCRYPTION_KEY` in `apps/docs/src/content/docs/guides/self-hosting.mdx` explaining that it encrypts stored credentials and API keys at rest, with a generation command

## 6. Tests

- [x] 6.1 Add unit tests for connection credential encryption round-trip (encrypt on create, decrypt on read, redact on API response)
- [x] 6.2 Add unit tests for the no-encryption-key fallback (plaintext storage)
- [x] 6.3 Update existing `duckdb.test.ts` to mock `getEnv` since `buildAttachString` now reads `ENCRYPTION_KEY`
- [x] 6.4 All 487 tests pass, typecheck passes across all packages
