# Change: Add full frontend UI with sidebar, project selector, and agent-powered semantic model editor

## Why

The application currently has a bare-bones dashboard listing projects. Users need a proper admin UI with navigation between sections (connections, semantic models, monitoring, settings), a project selector for context switching, and a chat-based semantic model editor powered by LangChain Deep Agents. The design should align with the archmax product family (archmax_chat) — sidebar layout, OKLCH tokens, Geist fonts, Radix/CVA components.

## What Changes

- **App shell**: Replace the flat dashboard with a sidebar-based layout. Left sidebar with archmax logo at top, project selector with "+" button, icon-based navigation, and user profile menu at bottom. Design mirrors archmax_chat's sidebar pattern.
- **UI component library**: Copy missing base components from archmax_chat's `@archmax/ui` into `@semlayer/ui` — specifically `dropdown-menu`, `dialog`, `select`, `popover`, `scroll-area`, `sheet`, `avatar`, `skeleton`, `collapsible`.
- **CSS tokens**: Add sidebar-specific OKLCH tokens to `globals.css` to match archmax_chat's sidebar theming.
- **Routing**: Restructure TanStack Router file-based routes into project-scoped sections: `/connections`, `/semantic-models`, `/monitoring`, `/settings`.
- **Data Connections page**: CRUD interface to manage database connections within the selected project (list, create, edit, delete).
- **Semantic Models page**: Chat interface backed by a LangChain Deep Agent (`deepagents` JS/TS SDK) with `FilesystemBackend` (virtual mode). The agent manipulates YAML semantic model files via filesystem tools and queries database connections via a custom `executeQuery` DuckDB tool.
- **Monitoring page**: Empty placeholder.
- **Settings page**: Empty placeholder.
- **Backend**: New Hono route for the deep agent chat endpoint; new `executeQuery` tool for DuckDB queries within the agent.

## Impact

- Affected specs: `spa-architecture` (MODIFIED — layout, routing), `data-sources` (MODIFIED — rename to connection-management-ui), `semantic-models` (related — agent interface)
- New specs: `frontend-shell`, `connection-management-ui`, `semantic-model-agent`
- Affected code:
  - `packages/ui/` — add ~9 missing Radix components
  - `apps/frontend/src/` — new layout, sidebar, project selector, routing, pages
  - `apps/frontend/src/globals.css` — sidebar tokens
  - `apps/api/src/` — new deep agent endpoint, executeQuery tool
  - `packages/core/` — potential agent service module
- New dependencies: `deepagents` (LangChain Deep Agents JS), `@langchain/openai` (for OpenAI-compatible endpoints including OpenRouter), `@duckdb/node-api` (already present)
- New model: `Conversation` (MongoDB) for persisted agent chat history per project
- New env vars: `AGENT_API_BASE_URL` (defaults to OpenRouter), `AGENT_API_KEY`, `AGENT_MODEL`
