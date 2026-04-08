# Project Context

## Purpose

Semantic Layer — a tool for managing semantic descriptions of database schemas, tables, columns, and relationships. Provides an admin UI for project and connection management, a DuckDB federation layer for cross-connection queries, and an MCP server that AI agents can query to understand database structure and meaning.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript 5.9, ES2022 target, `moduleResolution: "bundler"`
- **Frontend**: Vite 6, React 19, TanStack Router (file-based), TanStack Query, Tailwind CSS 4 (OKLCH tokens, shadcn-style)
- **API**: Hono 4 on Node.js (`@hono/node-server`), Zod validation
- **MCP**: JSON-RPC endpoint on Hono with bearer token auth, rate limiting
- **Database**: MongoDB via Mongoose 9
- **Query federation**: DuckDB (in-process, per project) via `@duckdb/node-api`
- **UI Kit**: Radix UI primitives + CVA variants in `@semlayer/ui`
- **Fonts**: Geist Sans / Geist Mono
- **Deployment**: Docker (multi-stage) with nginx reverse proxy on port 8080

## Project Conventions

### Code Style

- Strict TypeScript everywhere (`strict: true` in all tsconfig files)
- ESM-only (`"type": "module"` in all packages)
- Functional React components (no classes)
- CVA (class-variance-authority) for component variants
- `cn()` utility (clsx + tailwind-merge) for class composition
- `data-slot` attributes on all UI primitives for styling hooks
- Rounded-full for buttons/inputs, rounded-xl for cards/containers
- No comments that just narrate what code does

### UI Surface Hierarchy

- **Popup backgrounds must match `--background`** (the page-level light grey): `--popover` is set to the same value as `--background` in both light and dark themes. This ensures all overlay surfaces — popovers, dropdown menus, selects, dialogs, sheets, toasts — share a consistent grey backdrop so that white card-level elements (`--card`) placed inside them have visible contrast. Never override popup backgrounds to white/card color; use `bg-popover` or `surface-overlay` which both resolve to the page grey.
- **Input fields use white (`bg-card`) backgrounds**: Text inputs, textareas, and select triggers use `bg-card` (white in light theme) so they stand out against the grey overlay/page surface. In dark mode they use `dark:bg-input/30` for subtle contrast. This gives form fields a clear "recessed field" look on any surface.

### Filter Controls

- **Filter selectors use ghost styling, not form-input styling**: Inline filter dropdowns (e.g., "All agents", "All models" above a table) must use the `.filter-trigger` class on `SelectTrigger` — transparent background, no border, no shadow, `text-xs`, compact `h-7`. They should look like subtle toolbar controls, not data-entry fields. Never apply the default `bg-card` / `border-input` / `shadow-xs` form styling to filters.
- **Placement**: Filter bar sits directly above its associated table/list, as the first element in the content area. Use `flex items-center gap-1.5` for the row of filters.
- **Clear button**: When any filter is active, show a ghost icon button (`variant="ghost" size="icon"`, `h-7 w-7`) with an `X` icon to reset all filters. Use `title="Clear filters"` for accessibility.
- **No icons in filter triggers**: The built-in chevron from `SelectTrigger` is sufficient. Do not add extra `Filter` icons inside the trigger — it adds visual noise without information.

### Tables

- **No card padding around tables**: When a `<Table>` is placed directly inside a `<Card>`, the card's vertical padding is automatically stripped (via `:has()` on `data-slot`). Tables should sit flush within their container — no extra wrapper padding at top or bottom.
- **Hover must be distinct from background**: Table rows use `hover:bg-table-row-hover`, a dedicated token (`--table-row-hover`) that is slightly lighter than `--muted` in both light and dark themes. Never use `hover:bg-foreground/[0.05]` for table rows — the contrast is too low on muted backgrounds.
- **Tables on muted backgrounds**: Content-area tables (data browser, connections list) sit on `bg-muted`. The hover token is tuned for this case. Tables inside cards (on `bg-card`) also work because the token is between `--muted` and `--card`.
- **Header rows don't hover**: `TableHeader` sets `[&_tr]:hover:bg-transparent` to prevent header hover states.
- **Server-side pagination**: Paginated list endpoints return `{ items, total, page, limit }`. The frontend uses `page` state, a `PAGE_SIZE` constant, and computes `totalPages`. Pagination controls appear below the table only when `totalPages > 1`: a left-aligned `"N total entries"` label (`text-xs text-muted-foreground`) and right-aligned `ChevronLeft` / `page / totalPages` (`tabular-nums`) / `ChevronRight` buttons (`variant="outline" size="sm"`). When client-side filters exist, reset `page` to 1 on filter change.

### Page Layout

- **Page-level actions live in the header**: Primary action buttons (e.g., "Create Agent", "New Connection") MUST be placed to the right of the page's `h1` headline inside the `<header>`, not beside per-section `h2` sub-headings. Use a `flex items-center justify-between` wrapper around the `h1` group and the action buttons.
- **No redundant section sub-headings**: If a page has a single content section below the header (one list or table), do not add an `h2` that restates the page title. The `h1` in the header already provides sufficient context.
- **Multiple content sections may use sub-headings**: When a page contains genuinely distinct groups (e.g., MCP Access shows endpoint cards and a token list), lightweight sub-headings are acceptable to separate them — but primary actions still belong in the page header.

### Architecture Patterns

- **Shared packages**: `@semlayer/core` for models/DB/config/services, `@semlayer/ui` for React components
- **Mongoose models**: Interface → Schema → hot-reload-safe export (`mongoose.models.X || mongoose.model()`) — used for Project and Connection
- **Soft delete**: Mongoose models use a shared plugin (`softDeletePlugin`) that adds `deleted`/`deletedAt` fields and auto-filters deleted records
- **Semantic model file service**: `SemanticModelFileService` in `@semlayer/core/services/semantic-model-files` handles all YAML file I/O (list, read, write, delete) with atomic writes (temp file + rename)
- **Env config**: Zod schema validation via `getEnv()` singleton in `@semlayer/core/config/env`
- **DB connection**: Singleton `connectDB()` with global mongoose cache in `@semlayer/core/infra/db`
- **DuckDB service**: Lazy per-project DuckDB instances in `@semlayer/core/services/duckdb` — connections attached as named schemas via postgres/mysql/mssql extensions
- **API structure**: Hono app exports `AppType` for typed RPC client in frontend
- **Frontend API client**: `hc<AppType>` from `hono/client` — fully typed end-to-end
- **Error handling**: `AppError` class with static factory methods (badRequest, notFound, etc.)
- **MCP tools**: Function returning tool map `Record<string, { description, handler }>`, separate schema/required helpers
- **Auth**: Better Auth with session-based admin login

### Testing Strategy

- Vitest for unit/integration tests
- Tests colocated with source or in `__tests__/` directories

### Git Workflow

- `main` branch for stable releases
- Feature branches for changes

## Domain Context

### Projects

The top-level organizational unit. A project groups related database connections and their semantic models.

### Connections

A connection represents a database connection (Postgres, MySQL, MSSQL, SQLite, DuckDB, MotherDuck) within a project. Each active connection is attached to the project's DuckDB instance for federated querying. Connection config stores structured parameters (host, port, database, user, password) or a raw URI.

### Semantic Models (DuckDB-native, file-based)

Semantic models are stored as YAML files on disk, one file per model, in a per-project directory (`<SEMLAYER_DATA_DIR>/<projectId>/`). Semantic models are project-scoped (not connection-scoped) and follow the [OSI (Open Semantic Interchange)](https://github.com/open-semantic-interchange/OSI) spec with snake_case naming. Each YAML file is self-contained:

- **Datasets** — logical representations of tables/views with source references (`<connection>.<schema>.<table>`), `primary_key`, `unique_keys`, and inline fields
- **Fields** — row-level attributes within a dataset, with an OSI `expression` object (`{ dialects: [{ dialect: ANSI_SQL, expression: "..." }] }`), optional `dimension` (`{ is_time: true }` for temporal fields), and `custom_extensions` for project-specific metadata (`data_type`, `example_data`, `distinct_values` under `vendor_name: COMMON`)
- **Relationships** — foreign-key relationships between datasets with `from_columns`/`to_columns` mappings
- **Metrics** — quantitative measures with OSI expression objects spanning datasets

All entities support `ai_context` (string or object with instructions, synonyms, examples) and `custom_extensions` for vendor-specific data. Each project directory also contains an auto-generated `AGENTS.md` summarizing its semantic models for AI assistants.

A global agent system prompt at `packages/core/prompts/semantic-model-agent.md` guides AI agents through the semantic model assembly workflow (schema discovery, field mapping, enum detection, relationship inference, metric definition).

### MCP Server

Exposes semantic metadata as MCP tools for AI agent consumption:
- `list_connections` — list active database connections for the project
- `list_semantic_models` — list semantic models the token has access to (reads YAML files from disk)
- `get_semantic_model` — get a markdown overview of a semantic model with datasets, relationships, and metrics; supports scoped pagination (`scope`: `"datasets"` | `"relationships"` | `"metrics"`, `page`)
- `get_datasets` — get one or more datasets (up to 10) with all their fields as compact markdown lists; single dataset supports field pagination, multiple datasets return page 1 of each

## Important Constraints

- Single-user system — no multi-tenancy
- MongoDB stores projects and connections; semantic models are stored as YAML files on disk
- `SEMLAYER_DATA_DIR` env var configures the base directory for project folders (defaults to `./data/projects`)
- DuckDB is used for federated querying across connections (in-process, per project)
- MCP bearer token auth is the only security boundary for AI agents
- Better Auth session-based login for admin UI

## External Dependencies

- MongoDB — document store for projects and connections
- DuckDB — in-process analytical query engine for federation
- External databases (Postgres, MySQL, MSSQL, SQLite) — attached via DuckDB extensions for querying
- js-yaml — YAML parsing/serialization for semantic model files
