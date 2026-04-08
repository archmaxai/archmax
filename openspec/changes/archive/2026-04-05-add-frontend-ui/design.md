## Context

The semantic layer tool needs a full admin UI. Currently there's only a flat project list page. The target is a sidebar-based SPA with project context, connection management, and an AI-powered semantic model editor. The design must visually align with archmax_chat (same product family), and the semantic model editor uses LangChain Deep Agents for agentic file manipulation + database exploration.

Stakeholders: single admin user (no multi-tenancy).

## Goals / Non-Goals

**Goals:**
- Sidebar-based app shell matching archmax product family aesthetics
- Project selector as the top-level context boundary
- Connection CRUD within the selected project
- Chat-based semantic model editor powered by LangChain Deep Agent with FilesystemBackend
- Agent can explore database schemas via DuckDB `executeQuery` tool
- Copy and reuse UI primitives from archmax_chat's component library

**Non-Goals:**
- Multi-user collaboration or real-time sync
- Full monitoring dashboards (placeholder only)
- Settings functionality (placeholder only)
- Mobile-first design (desktop-primary, basic responsive)
- Internationalization (English only for now)

## Decisions

### 1. Sidebar layout — icon strip with labels

**Decision:** A fixed left sidebar (~56px collapsed / ~240px expanded) with icon navigation items. The sidebar has three zones: (1) archmax logo at top, (2) project selector dropdown with "+" button, (3) navigation items below, (4) user profile menu at bottom.

**Rationale:** Mirrors the archmax_chat sidebar pattern (logo → content → user menu at bottom). For semlayer, the nav is simpler (4 items) so an always-visible icon sidebar works well. The project selector sits above the nav because it scopes all content below.

**Alternatives considered:**
- Top navbar — breaks alignment with archmax_chat
- Expandable sidebar like chat — unnecessary for only 4 nav items; icon + label always shown is simpler

### 2. Project selector UX

**Decision:** A dropdown/popover at the top of the sidebar showing the current project name. A "+" button next to it opens a dialog to create a new project. Selecting a different project updates the URL and reloads context (connections, models). Project context is stored in the URL path: `/:projectId/connections`, etc.

**Rationale:** URL-based project scoping enables deep linking, browser back/forward, and bookmarking. The selector is always visible so the user knows which project they're working in.

**Alternatives considered:**
- Query parameter (`?project=...`) — less clean URLs, harder to enforce
- Global state only — loses deep linking and sharability

### 3. LangChain Deep Agent for semantic model editing

**Decision:** The semantic models section is a chat interface. The backend runs a LangChain Deep Agent (`deepagents` JS/TS SDK) with `FilesystemBackend({ rootDir: "<SEMLAYER_DATA_DIR>/<projectId>", virtualMode: true })`. The agent gets filesystem tools (`ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep`) scoped to the project's YAML directory, plus a custom `executeQuery` tool for running read-only DuckDB queries against the project's attached connections.

**Rationale:** The `FilesystemBackend` with `virtualMode: true` provides sandboxed access to the project's YAML files — perfect for an AI agent that creates/edits semantic models. The agent can introspect database schemas via DuckDB and then write YAML definitions. This is the core UX: the user describes what they want in natural language, the agent explores the database and builds the semantic model.

**Security:** `virtualMode: true` prevents path traversal outside `rootDir`. The `executeQuery` tool runs read-only queries only (no DDL/DML) scoped to the project's DuckDB instance.

**Alternatives considered:**
- Custom API calls from agent instead of filesystem — loses the natural file manipulation that Deep Agents are designed for
- Direct YAML editing UI — poor UX for complex model authoring; the agent approach is the key differentiator

### 4. executeQuery DuckDB tool (parameterized)

**Decision:** A custom Deep Agent tool named `executeQuery` that accepts a SQL template with `$1`, `$2`, ... placeholders and a separate `params` array. The tool runs the parameterized query against the project's DuckDB instance (which has all project connections attached) and returns the result as JSON (rows + column metadata). Limited to SELECT statements; a 30-second timeout and 1000-row result cap prevents runaway queries.

**Rationale:** The agent needs to explore database schemas (INFORMATION_SCHEMA, sample data) to build accurate semantic models. DuckDB is already set up per-project with connections attached. Read-only access is sufficient and safe. Parameterized queries prevent SQL injection — the agent should never interpolate user-provided or discovered values directly into SQL strings.

### 5. Copy UI components from archmax_chat

**Decision:** Copy the following Radix/shadcn components from `archmax_chat/packages/ui/src/components/` into `semlayer/packages/ui/src/components/`: `dropdown-menu`, `dialog`, `select`, `popover`, `scroll-area`, `sheet`, `avatar`, `skeleton`, `collapsible`. Update `@semlayer/ui` package.json with required Radix dependencies and re-export from index.ts.

**Rationale:** Both projects use the same stack (Radix + CVA + tailwind-merge). Copying keeps the packages independent (no cross-repo dependency) while ensuring visual consistency. The components are generic primitives with no app-specific logic.

**Alternatives considered:**
- Shared npm package — premature; the projects are in separate repos
- Rebuild from scratch — wasteful duplication of effort for identical components

### 6. LLM provider — OpenRouter (OpenAI-compatible)

**Decision:** The deep agent uses an OpenAI-compatible API endpoint, defaulting to OpenRouter. Configured via env vars: `AGENT_API_BASE_URL` (defaults to `https://openrouter.ai/api/v1`), `AGENT_API_KEY`, and `AGENT_MODEL` (e.g. `anthropic/claude-sonnet-4`). The agent is instantiated with `@langchain/openai`'s `ChatOpenAI` pointing at the configured base URL.

**Rationale:** OpenRouter provides access to multiple model providers (OpenAI, Anthropic, Google, etc.) through a single OpenAI-compatible API. This makes the model choice a config-time decision without code changes. Any OpenAI-compatible endpoint (local Ollama, Azure OpenAI, direct OpenAI) works by changing the base URL.

### 7. Conversation history — persisted in MongoDB

**Decision:** Agent conversation history is persisted in MongoDB. A `Conversation` model stores messages per project with `projectId`, `messages[]` (role + content + tool calls + timestamps), and standard date/soft-delete fields. The chat endpoint accepts an optional `conversationId`; if omitted, a new conversation is created. The frontend shows a conversation list in the semantic models section.

**Rationale:** Persisted history lets users resume work across sessions, review past agent actions, and understand how semantic models were built. MongoDB is already the app's document store and handles flexible message schemas well.

**Alternatives considered:**
- File-based history (alongside YAML files) — mixes concerns; conversation data isn't a semantic model artifact
- Ephemeral only — loses context, forces users to repeat instructions

### 8. Chat streaming via SSE

**Decision:** The deep agent chat endpoint uses Server-Sent Events (SSE) for streaming agent responses to the frontend. The frontend renders a standard chat UI with message bubbles, a text input, and real-time streaming of agent output.

**Rationale:** SSE is well-supported by Hono and aligns with LangChain's streaming patterns. It provides a good UX for long-running agent operations (database exploration, file editing) where the user sees incremental progress.

### 9. Routing structure

**Decision:** Routes are project-scoped:
```
/_auth/                          → redirect to project selector or last project
/_auth/$projectId/connections    → connection management
/_auth/$projectId/models         → semantic model agent chat
/_auth/$projectId/monitoring     → placeholder
/_auth/$projectId/settings       → placeholder
```

A `_auth/$projectId` layout route fetches the project and provides it via context, plus renders the sidebar shell.

**Rationale:** Project ID in the URL ensures proper deep linking and makes the project scope explicit in every route.

## Risks / Trade-offs

- **Deep Agent dependency**: LangChain Deep Agents is relatively new. Mitigated by: keeping the agent integration behind a clean service interface that can be swapped.
- **Agent cost/latency**: LLM calls for semantic model editing can be slow and costly. Mitigated by: streaming responses, clear progress indicators, and the 30-second DuckDB timeout.
- **Component drift**: Copied UI components may diverge from archmax_chat over time. Mitigated by: both projects use the same shadcn-style pattern; updates are manual but infrequent for stable primitives.
- **File locking**: Multiple agent sessions editing the same project's YAML files could conflict. Mitigated by: single-user system (no multi-tenancy), sequential agent execution per project.

## Open Questions

None — all resolved.
