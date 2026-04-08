## 1. Project Model: Add Slug

- [x] 1.1 Add `slug` field to the Project Mongoose schema (string, required, unique index) with a pre-save hook that auto-generates from `title`
- [x] 1.2 Add slug generation utility (lowercase, replace non-alphanumeric with hyphens, collapse, trim, numeric suffix on collision)
- [x] 1.3 Write a one-time migration script to backfill slugs for existing projects
- [x] 1.4 Update project CRUD API to accept `slug` in update payloads and return it in responses
- [x] 1.5 Add slug validation (pattern: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`, min 2 chars)

## 2. McpToken Model

- [x] 2.1 Create `McpToken` Mongoose model in `packages/core/src/models/McpToken.ts` with fields: name, tokenHash, project (ref), scopes, permission, expiresAt, lastUsedAt; apply soft-delete plugin
- [x] 2.2 Add compound index on `(tokenHash, project)` for efficient lookup
- [x] 2.3 Add token generation utility: `sml_` prefix + 32 random hex bytes, SHA-256 hashing

## 3. Token CRUD API

- [x] 3.1 Create `apps/api/src/routes/mcp-tokens.ts` with routes: GET `/`, POST `/`, DELETE `/:tokenId`
- [x] 3.2 POST handler: validate scopes against existing semantic models, generate token, hash, store, return raw token once
- [x] 3.3 GET handler: list tokens without hash, include name/scopes/permission/expiresAt/lastUsedAt/createdAt
- [x] 3.4 DELETE handler: soft-delete the token
- [x] 3.5 Mount routes at `/api/projects/:projectId/mcp-tokens` in `app.ts`
- [x] 3.6 Add Zod request validation schemas for create payload

## 4. MCP Endpoint: Project-Scoped Routing

- [x] 4.1 Change MCP route mount from `/mcp/semlayer` to `/mcp/:slug/mcp` in `app.ts`
- [x] 4.2 Update `semlayer-route.ts` to resolve project by slug from URL params
- [x] 4.3 Replace global `MCP_BEARER_TOKEN` auth with project-scoped McpToken lookup (hash incoming token, find by hash + project)
- [x] 4.4 Validate token expiry and soft-delete status; update `lastUsedAt` on success
- [x] 4.5 Remove `MCP_BEARER_TOKEN` from env schema and `.env.example`

## 5. MCP Tool Scoping

- [x] 5.1 Refactor `getSemlayerTools()` to accept a context object `{ projectId, scopes, permission }` instead of reading projectId from tool args
- [x] 5.2 Remove `projectId` parameter from all tool schemas (inferred from URL)
- [x] 5.3 Remove `list_projects` tool (no longer needed — endpoint is project-scoped)
- [x] 5.4 Filter `list_semantic_models` results by token scopes
- [x] 5.5 Gate `get_semantic_model_overview` and `get_dataset_fields` with scope check — return error for out-of-scope models
- [x] 5.6 Enforce `permission: "read"` by rejecting write operations (future-ready check)

## 6. Frontend: MCP Access Page

- [x] 6.1 Create route file `apps/frontend/src/routes/_auth/$projectId/mcp-access.tsx`
- [x] 6.2 Build token list table with columns: name, scopes (badges), permission, expiry status, last used, revoke action
- [x] 6.3 Build endpoint URL display with copy-to-clipboard button
- [x] 6.4 Build create token dialog: name input, semantic model multi-select, permission toggle, expiry picker (never / date)
- [x] 6.5 Build token reveal dialog (shown after creation): raw token display with copy button and warning
- [x] 6.6 Wire up TanStack Query hooks for token CRUD (list, create, revoke)
- [x] 6.7 Add MCP Access nav item (Key icon) to the sidebar navigation in `_auth/$projectId.tsx`

## 7. Validation & Testing

- [x] 7.1 Write API tests for token CRUD endpoints (create, list, revoke, expired token rejection)
- [x] 7.2 Write API tests for MCP auth with project-scoped tokens (valid, invalid, expired, wrong project)
- [x] 7.3 Write tests for scope filtering (list_semantic_models filters, access denied for out-of-scope)
- [x] 7.4 Test slug generation (basic, collision, edge cases)
- [x] 7.5 Manual end-to-end test: create project → create token → configure MCP client → verify scoped access
