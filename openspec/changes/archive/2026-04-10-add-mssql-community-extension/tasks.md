## 1. DuckDB Service — Community Extension Install

- [x] 1.1 Add a `communityExtensions` set (or equivalent flag) in `duckdb.ts` so MSSQL uses `INSTALL mssql FROM community` instead of `INSTALL mssql`
- [x] 1.2 Ensure `LOAD mssql` still works the same way after community install

## 2. DuckDB Service — MSSQL Attach String

- [x] 2.1 Update `buildAttachString` for the `mssql` case to produce an ADO.NET connection string: `Server=host,port;Database=db;User Id=user;Password=pass;Encrypt=yes/no`
- [x] 2.2 When `connectionConfig.uri` is set, pass through as-is (already works, URI and ADO.NET formats both accepted by the extension)
- [x] 2.3 Read `connectionConfig.encrypt` (default `true`) and append `Encrypt=yes/no` to the ADO.NET string
- [x] 2.4 Default port to `1433` for MSSQL (already done, verify)

## 3. Connection Model & API

- [x] 3.1 Add `encrypt` as an optional boolean to the Zod `connectionConfigSchema` in `connections.ts`
- [x] 3.2 Add `encrypt` to `IConnectionConfig` interface in `Connection.ts`
- [x] 3.3 Add `encrypt` to the Mongoose `ConnectionConfigSchema` fields

## 4. Frontend — MSSQL Connection Form

- [x] 4.1 Add an "Encrypt connection (TLS)" checkbox/switch that appears when `type === "mssql"`, defaulting to checked
- [x] 4.2 Wire the `encrypt` value into the connection config payload on create/update
- [x] 4.3 Populate the `encrypt` field from existing connection data when editing

## 5. Testing

- [x] 5.1 Add unit tests for the MSSQL branch of `buildAttachString` — verify correct ADO.NET format with and without `encrypt`
- [x] 5.2 Add unit test for community extension install path (verify `FROM community` is used for `mssql`)

## 6. Documentation

- [x] 6.1 Update the MSSQL section in the docs to mention the community extension, TLS toggle, and supported connection string formats
