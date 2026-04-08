# Change: Add MCP Token Management

## Why
The current MCP server uses a single global bearer token (`MCP_BEARER_TOKEN`) with no scoping, no expiry, and no per-project isolation. As multi-project deployments grow, each project needs its own MCP endpoint with individually managed tokens that control which semantic models an AI agent can access and whether it can execute write operations.

## What Changes
- **BREAKING**: MCP endpoint moves from `/mcp/semlayer` to `/mcp/:projectSlug/mcp` (project-scoped)
- Add `slug` field to the Project model for human-readable MCP URLs
- Add `McpToken` Mongoose model with scoped permissions (per-model access, read/read-write, expiry)
- Add CRUD API routes for token management at `/api/projects/:projectId/mcp-tokens`
- Add MCP Access UI page in the frontend under `/:projectId/mcp-access`
- Replace global `MCP_BEARER_TOKEN` env var auth with per-project token lookup
- MCP tools filter results based on token scope (only allowed semantic models are visible)
- Add field-level enforcement: queries can only reference fields defined in accessible semantic models

## Impact
- Affected specs: `mcp-server`, `project-management`, `frontend-shell`, new `mcp-token-management`
- Affected code: `apps/api/src/mcp/`, `apps/api/src/routes/`, `apps/api/src/app.ts`, `packages/core/src/models/`, `apps/frontend/src/routes/_auth/$projectId/`
- Breaking: Existing MCP clients using `/mcp/semlayer` must update their endpoint URL and use a project-scoped token
- Migration: The `MCP_BEARER_TOKEN` env var is removed; tokens are managed via the UI
