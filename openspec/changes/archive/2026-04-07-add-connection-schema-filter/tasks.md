## 1. Data Browser API — Schema-Aware Table Listing
- [x] 1.1 In `data-browser.ts`, look up the Connection by slug when listing tables and read its `connectionConfig.schema`
- [x] 1.2 When `schema` is set, add `AND table_schema = '<schema>'` to the `information_schema.tables` query
- [x] 1.3 When `schema` is not set, keep current behavior (return all schemas)

## 2. MCP Tool — Expose Schema in Connection Info
- [x] 2.1 In `get_project_connections` handler, add `slug` and `schema` (from `connectionConfig.schema`) to the selected fields
- [x] 2.2 Update the MCP tool description to mention the schema field

## 3. Semantic Model Agent — Scoped Schema Discovery
- [x] 3.1 In `semantic-model-agent.md`, add guidance that when a connection has a configured schema the agent should include `AND table_schema = '<schema>'` in discovery queries

## 4. Frontend — Clarify Schema Field
- [x] 4.1 Update the schema field helper text in the connection form to explain it filters the data browser and agent queries

## 5. Validation
- [ ] 5.1 Manually test: create a Postgres connection with schema "public", verify the data browser only shows public tables
- [ ] 5.2 Manually test: create a Postgres connection without a schema, verify all schemas are visible
