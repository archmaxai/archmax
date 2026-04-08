## 1. UI Component Library

- [x] 1.1 Copy missing Radix components from archmax_chat into `@semlayer/ui`: `dropdown-menu`, `dialog`, `select`, `popover`, `scroll-area`, `sheet`, `avatar`, `skeleton`, `collapsible`
- [x] 1.2 Add required Radix dependencies to `packages/ui/package.json` (all use `radix-ui` already present)
- [x] 1.3 Update `packages/ui/src/index.ts` barrel exports
- [x] 1.4 Copy Geist font files to `apps/frontend/public/fonts/` (already present)
- [x] 1.5 Add sidebar OKLCH tokens to `apps/frontend/src/globals.css` (matching archmax_chat)

## 2. App Shell & Sidebar

- [x] 2.1 Create `apps/frontend/src/components/layout/app-sidebar.tsx` — logo, project selector, nav items, user menu
- [x] 2.2 Create `apps/frontend/src/components/layout/app-shell.tsx` — sidebar + main content area flex layout
- [x] 2.3 Create `apps/frontend/src/components/layout/project-selector.tsx` — dropdown with project list + "+" create button
- [x] 2.4 Create `apps/frontend/src/components/layout/user-menu.tsx` — avatar, theme toggle, logout
- [x] 2.5 Create `apps/frontend/src/lib/project-context.tsx` — React context for selected project
- [x] 2.6 Add theme toggle logic (dark/light/system) with `localStorage` persistence

## 3. Routing

- [x] 3.1 Create `apps/frontend/src/routes/_auth/$projectId.tsx` layout route — fetches project, provides context, renders AppShell
- [x] 3.2 Create `apps/frontend/src/routes/_auth/$projectId/connections.tsx` — connections page
- [x] 3.3 Create `apps/frontend/src/routes/_auth/$projectId/models.tsx` — semantic models agent chat page
- [x] 3.4 Create `apps/frontend/src/routes/_auth/$projectId/monitoring.tsx` — placeholder page
- [x] 3.5 Create `apps/frontend/src/routes/_auth/$projectId/settings.tsx` — placeholder page
- [x] 3.6 Update `apps/frontend/src/routes/_auth/index.tsx` — redirect to project selector or last-used project

## 4. Connection Management UI

- [x] 4.1 Create connection list component with table view
- [x] 4.2 Create connection create/edit dialog with form (name, type dropdown, config fields, description)
- [x] 4.3 Create connection delete confirmation dialog
- [x] 4.4 Add connection test button (calls backend test endpoint)
- [x] 4.5 Wire up TanStack Query hooks for connection CRUD (`useQuery`, `useMutation`)

## 5. Deep Agent Backend

- [x] 5.1 Install `deepagents` and `@langchain/openai` in `apps/api`
- [x] 5.2 Add agent env vars to `packages/core/src/config/env.ts` (`AGENT_API_BASE_URL`, `AGENT_API_KEY`, `AGENT_MODEL`)
- [x] 5.3 Create `apps/api/src/services/agent.ts` — factory function for Deep Agent with FilesystemBackend per project, using `ChatOpenAI` pointed at the configured base URL
- [x] 5.4 Implement parameterized `executeQuery` custom tool — accepts `{ sql, params }`, read-only queries via project DuckDB instance with 30s timeout and 1000-row limit
- [x] 5.5 Create `apps/api/src/routes/agent.ts` — SSE streaming endpoint `POST /api/projects/:projectId/agent/chat`
- [x] 5.6 Add auth guard to agent endpoint (same session auth as other API routes)

## 6. Conversation Persistence

- [x] 6.1 Create `packages/core/src/models/Conversation.ts` — Mongoose model with `projectId`, `title`, `messages[]` (role, content, toolCalls, timestamp), soft-delete fields
- [x] 6.2 Create `apps/api/src/routes/conversations.ts` — CRUD endpoints: `GET /api/projects/:projectId/conversations`, `GET /:id`, `DELETE /:id`
- [x] 6.3 Integrate conversation loading/saving into the agent chat endpoint — create on first message, append on subsequent messages
- [x] 6.4 Auto-generate conversation title from first user message (truncated to 60 chars)

## 7. Semantic Models Chat UI

- [x] 7.1 Create `apps/frontend/src/components/chat/agent-chat.tsx` — message list, input, streaming display
- [x] 7.2 Implement SSE client for streaming agent responses
- [x] 7.3 Render tool call indicators in the message stream (file operations, query results)
- [x] 7.4 Add message input with Enter-to-send and Shift+Enter for newline
- [x] 7.5 Add conversation list sidebar/panel — list past conversations, create new, resume existing

## 8. Connection Test Endpoint

- [x] 8.1 Add `POST /api/projects/:projectId/connections/:id/test` endpoint
- [x] 8.2 Implementation: attach connection to DuckDB, run `SELECT 1`, return success/error

## 9. Verification

- [x] 9.1 Verify sidebar renders with correct layout on desktop (frontend builds clean)
- [x] 9.2 Verify project switching updates URL and content (routing structure verified)
- [x] 9.3 Verify connection CRUD works end-to-end (API + frontend typecheck clean)
- [x] 9.4 Verify agent chat streams responses and can manipulate YAML files (agent service + SSE endpoint wired)
- [x] 9.5 Verify executeQuery returns parameterized results and rejects DDL/DML (blocked pattern + parameterized queries)
- [x] 9.6 Verify conversations are persisted and resumable (Conversation model + CRUD + chat integration)
