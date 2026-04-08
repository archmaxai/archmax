## ADDED Requirements

### Requirement: Connection Schema Filter

When `connectionConfig.schema` is set on a connection, all schema-discovery surfaces (data browser table listing, MCP connection info, semantic model agent) SHALL use it to scope visible tables to that schema only. When `connectionConfig.schema` is not set, all schemas from the attached database remain visible (current behavior). The `get_project_connections` MCP tool SHALL include the connection's `slug` and `schema` (from `connectionConfig.schema`, if set) in its response so that AI agents can scope their `information_schema` queries accordingly.

#### Scenario: Postgres connection with schema set to "public"
- **WHEN** a Postgres connection has `connectionConfig.schema` set to `"public"`
- **THEN** the data browser List Tables endpoint only returns tables where `table_schema = 'public'`
- **AND** the MCP `get_project_connections` response includes `schema: "public"` for that connection

#### Scenario: Connection with no schema configured
- **WHEN** a connection has no `connectionConfig.schema` value (empty or absent)
- **THEN** the data browser List Tables endpoint returns tables from all schemas
- **AND** the MCP `get_project_connections` response omits the `schema` field for that connection

#### Scenario: MCP tool returns slug and schema
- **WHEN** an AI agent calls `get_project_connections` for a project
- **THEN** each connection in the response includes `slug` and, if configured, `schema`
