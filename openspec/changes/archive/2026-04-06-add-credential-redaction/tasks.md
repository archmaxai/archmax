## 1. API — redact all responses
- [x] 1.1 Apply `redactConnection()` to POST response in `connections.ts`
- [x] 1.2 Apply `redactConnection()` to PUT response in `connections.ts`
- [x] 1.3 Add credential-merge logic to PUT handler: if incoming `password` equals sentinel or is empty/absent, preserve the stored value from the database instead of overwriting
- [x] 1.4 Same merge logic for URI credentials: if incoming `uri` contains the sentinel password, preserve the stored URI

## 2. Frontend — write-only password field
- [x] 2.1 Remove `password` from the `Connection` response interface (it is never returned in cleartext)
- [x] 2.2 Ensure edit form continues to send password only when user explicitly types a new value (already the case — verified no regression)

## 3. Tests
- [x] 3.1 Add/update tests in `connections.test.ts` for credential-merge logic (sentinel preservation)
- [x] 3.2 Verify existing `redactConnectionConfig` tests still pass
