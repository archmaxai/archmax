# Change: Add Connection Schema Filter

## Why
When a Postgres (or MySQL/MSSQL) database has many schemas, the data browser and agent tools show every table from every schema, making the UI bloated and the AI agent less focused. Connections already store an optional `schema` field in `connectionConfig`, but nothing reads it. Wiring this field into the data browser and agent prompt will let users scope a connection to one schema.

## What Changes
- Data browser List Tables API filters by `connectionConfig.schema` when set on the connection
- Data browser frontend only sees tables from the configured schema (automatically follows from API filtering)
- `get_project_connections` MCP tool returns the connection's configured schema so AI agents can focus queries
- Semantic model agent system prompt references the per-connection schema to scope `information_schema` queries
- Connection form helper text updated to clarify the filtering behavior

## Impact
- Affected specs: `data-connections`, `data-browser`
- Affected code: `apps/api/src/routes/data-browser.ts`, `apps/api/src/mcp/semlayer-server.ts`, `packages/core/prompts/semantic-model-agent.md`, `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx`
