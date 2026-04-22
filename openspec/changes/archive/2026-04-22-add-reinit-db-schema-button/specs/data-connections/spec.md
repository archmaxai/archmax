## ADDED Requirements

### Requirement: Project DuckDB Instance Disposal

The DuckDB service SHALL expose `disposeProjectInstance(projectId)` that removes the project's cached `ProjectDuckDB` entry from the in-memory instance map and closes the underlying `DuckDBInstance` on a best-effort basis. A subsequent call to `getProjectInstance(projectId, connections)` for the same project MUST return a newly constructed instance with all active connections re-attached (no stale `attachedSlugs` or `loadedExtensions` carried over).

#### Scenario: Dispose clears the cached instance

- **WHEN** `disposeProjectInstance("p1")` is called after `getProjectInstance("p1", conns)` previously cached an instance
- **THEN** the `projectInstances` map no longer contains an entry for `"p1"`
- **AND** the next call to `getProjectInstance("p1", conns)` returns a freshly constructed instance whose reference differs from the disposed one
- **AND** every connection in `conns` is re-attached on the new instance

#### Scenario: Dispose is safe when no instance is cached

- **WHEN** `disposeProjectInstance("p2")` is called and no cached instance exists for `"p2"`
- **THEN** the call completes without error and the map remains unchanged

### Requirement: Connections Reinit Endpoint

The API SHALL expose `POST /api/projects/:projectId/connections/reinit` that disposes the project's cached DuckDB instance, rebuilds it by attaching every active connection, runs a schema probe, and returns the visible table count. The endpoint SHALL:

- Return `404` if the project does not exist.
- On success, respond with HTTP `200` and body `{ ok: true, tableCount: <number> }` where `tableCount` is the number of rows returned by `SHOW ALL TABLES` against the rebuilt instance.
- On any failure during dispose, re-attach, or probe, respond with HTTP `400` and body `{ ok: false, error: <string> }` where `error` is the underlying error message.
- Apply the standard query timeout via `withQueryTimeout` to the schema probe.

#### Scenario: Successful re-init returns table count

- **WHEN** a client sends `POST /api/projects/:projectId/connections/reinit` for a project with one active postgres connection exposing 12 tables
- **THEN** the server disposes the cached DuckDB instance, rebuilds it, re-attaches the connection, and runs `SHOW ALL TABLES`
- **AND** the response is HTTP `200` with body `{ ok: true, tableCount: 12 }`

#### Scenario: Upstream schema changes are picked up

- **WHEN** a table is added to the upstream database AFTER the project DuckDB instance was first created
- **AND** the client calls `POST /api/projects/:projectId/connections/reinit`
- **THEN** the response `tableCount` includes the newly added table
- **AND** subsequent data-browser requests for the same project see the new table

#### Scenario: Unreachable connection returns an error

- **WHEN** a client calls `POST /api/projects/:projectId/connections/reinit` and one of the active connections fails to attach (e.g. host unreachable)
- **THEN** the response is HTTP `400` with body `{ ok: false, error: <message> }`
- **AND** the cached instance MAY be left in a disposed state so the next successful attach rebuilds cleanly

#### Scenario: Unknown project returns 404

- **WHEN** a client calls `POST /api/projects/:projectId/connections/reinit` with a `projectId` that does not exist
- **THEN** the response is HTTP `404`
