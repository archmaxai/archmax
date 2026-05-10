# Project Context

## Purpose

archmax — a tool for managing semantic descriptions of database schemas, tables, columns, and relationships. Provides an admin UI for project and connection management, a DuckDB federation layer for cross-connection queries, and an MCP server that AI agents can query to understand database structure and meaning.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript 5.9, ES2022 target, `moduleResolution: "bundler"`
- **Frontend**: Vite 6, React 19, TanStack Router (file-based), TanStack Query, Tailwind CSS 4 (OKLCH tokens, shadcn-style)
- **API**: Hono 4 on Node.js (`@hono/node-server`), Zod validation
- **MCP**: JSON-RPC endpoint on Hono with bearer token auth, rate limiting
- **Database**: MongoDB via Mongoose 9
- **Query federation**: DuckDB (in-process, per project) via `@duckdb/node-api`
- **UI Kit**: Radix UI primitives + CVA variants in `@archmax/ui`
- **Fonts**: Geist Sans / Geist Mono
- **Deployment**: Docker (multi-stage) with nginx reverse proxy on port 8080

## CI Colors

The project uses a 4-color palette derived from the corporate identity:

| Name | Hex |
|------|---------|
| sage | `#8c987f` |
| rose | `#bca195` |
| blue | `#c2d0e4` |
| purple | `#8878a8` |

These colors are used for dataset group boxes in the graph view (with lightened bg tints and darkened border variants for readability) and should be preferred whenever a categorical color palette is needed.

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

### Toast Messages

- **Only `toast.success()` and `toast.error()`**: Do not use `toast.info()`, `toast.warning()`, `toast.message()`, or bare `toast()`. Two types cover all cases — success confirmations and error feedback.
- **Success messages**: Short past-tense confirmation of what happened, in the pattern `"{Entity} {action}"` — e.g. "Settings saved", "Connection deleted", "Test case created". Do not add "successfully" or other adverbs. For status checks use present tense: "Connection is healthy".
- **Error messages**: Prefer `err.message` from the server response. Use `err instanceof Error ? err.message : "fallback"` when the error type is uncertain. Keep hardcoded fallbacks short and descriptive.
- **Placement**: `position="bottom-center"`, configured once on the `<Toaster>` in `main.tsx`. Do not add position overrides on individual toast calls.
- **Visual treatment**: Toasts use `--popover` background (matching page grey), borderless, `radius-xl`, shadow-popup, custom Lucide icons. All styling is handled by the `<Toaster>` props and CSS overrides in `globals.css` — do not pass custom styling to individual toast calls.

### UI Surface Hierarchy

- **Popup backgrounds must match `--background`** (the page-level light grey): `--popover` is set to the same value as `--background` in both light and dark themes. This ensures all overlay surfaces — popovers, dropdown menus, selects, dialogs, sheets, toasts — share a consistent grey backdrop so that white card-level elements (`--card`) placed inside them have visible contrast. Never override popup backgrounds to white/card color; use `bg-popover` or `surface-overlay` which both resolve to the page grey.
- **Input fields use white (`bg-card`) backgrounds**: Text inputs, textareas, and select triggers use `bg-card` (white in light theme) so they stand out against the grey overlay/page surface. In dark mode they use `dark:bg-input/30` for subtle contrast. This gives form fields a clear "recessed field" look on any surface.

### Filter Controls

- **Filter selectors use ghost styling, not form-input styling**: Inline filter dropdowns (e.g., "All agents", "All models" above a table) must use the `.filter-trigger` class on `SelectTrigger` — transparent background, no border, no shadow, `text-xs`, compact `h-7`. They should look like subtle toolbar controls, not data-entry fields. Never apply the default `bg-card` / `border-input` / `shadow-xs` form styling to filters.
- **Placement**: Filter bar sits directly above its associated table/list, as the first element in the content area. Use `flex items-center gap-1.5` for the row of filters.
- **Clear button**: When any filter is active, show a ghost icon button (`variant="ghost" size="icon"`, `h-7 w-7`) with an `X` icon to reset all filters. Use `title="Clear filters"` for accessibility.
- **No icons in filter triggers**: The built-in chevron from `SelectTrigger` is sufficient. Do not add extra `Filter` icons inside the trigger — it adds visual noise without information.

### Pill Tabs

- **Use for inline section switching**: Pill tabs (`TabsList variant="pill"`) are for toggling between content panels inside a card or detail view — not for top-level page navigation. Examples: switching between Graph/Tree views, toggling Connection Details/URI, cycling through Response/Tools/Facts in test results.
- **Transparent container**: The `TabsList` has no background — pills float directly on the surrounding surface. The active tab gets a `bg-muted` (light grey) fill; inactive tabs are transparent with `text-muted-foreground`. Do not add a background to the list container.
- **Default sizing**: Use the built-in `text-sm` from `TabsTrigger`. Do not override to `text-xs` — the pill padding (`px-3 py-1.5`) is tuned for `text-sm`. Overriding creates cramped, undersized pills.
- **No extra styling on triggers**: The `variant="pill"` on `TabsList` handles all visual treatment (rounded-full triggers, transparent track, `bg-muted` active state). Do not add background, border, or shadow overrides on individual `TabsTrigger` elements.
- **Full-width toggle**: When pill tabs act as a binary toggle inside a dialog or form (e.g., "Details" / "URI"), use `className="w-full"` on `TabsList` and `className="flex-1"` on each `TabsTrigger` so they fill the available width evenly.
- **Gap between list and content**: Use `className="gap-3"` on the `Tabs` root to add spacing between the pill bar and the tab content panel.

### Dialog & Form Selectors

- **Use default `SelectTrigger` styling** (white `bg-card` background, border, `shadow-xs`, `h-9`). Do not apply `.filter-trigger` inside dialogs or forms — that class is reserved for inline toolbar filters.
- **One selector per line with a left-aligned label**: Stack selectors vertically using `grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3`. Place a `<Label>` in the left column and the `<Select>` in the right column. Do not pack multiple selectors into a single row with `grid-cols-3`; the cramped layout reduces readability.
- **Full-width triggers**: Selectors inside dialogs/forms should use the default `w-fit` behavior of `SelectTrigger` (auto-sizing). For form fields that should span, use the grid layout above which naturally stretches them.
- **Font size**: Use the default `text-sm` from `SelectTrigger`. Do not override to `text-xs` — dialog form controls should match standard input sizing.

### Settings Pages

- **Inline label + input layout**: On settings/configuration pages, labels and their corresponding inputs (text fields, selects, number inputs) MUST be placed on the same line using `grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-3`. The label sits in the left column, the input stretches in the right column. Do not stack labels above inputs on settings pages — the inline layout is more compact and scannable.
- **Card sections with description**: Each settings card has a section title (`text-base font-medium`) and a description paragraph, followed by the inline label–input grid. Keep the description above the grid, not interleaved with fields.

### Clickable Cards

- **No shadow on hover**: Cards that act as links (e.g., dashboard metric cards) must NOT use `hover:shadow-*` effects. Shadows are reserved for elevated overlay surfaces (popovers, dialogs). Instead, use a subtle background-color transition: `transition-colors hover:bg-card/80 dark:hover:bg-card/70`.
- **Hover chevron**: Optionally show a `ChevronRight` icon on hover (hidden by default, revealed via `opacity-0 group-hover:opacity-100`) as an affordance that the card is clickable.

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

### Build Verification

After making code changes, run the CI checks locally before committing:

```bash
pnpm typecheck          # turbo typecheck across all packages (tsc --noEmit)
pnpm lint               # turbo lint/build across all packages
```

Both commands must exit 0. If either fails, fix the errors before pushing. These are the same checks the GitHub Actions CI pipeline runs on every PR.

When modifying `apps/api`, also run its build directly to catch declaration/emit issues that `--noEmit` misses:

```bash
pnpm --filter @archmax/api build   # tsc (emits JS to dist/)
```

### Architecture Patterns

- **Shared packages**: `@archmax/core` for models/DB/config/services, `@archmax/ui` for React components
- **Mongoose models**: Interface → Schema → hot-reload-safe export (`mongoose.models.X || mongoose.model()`) — used for Project and Connection
- **Soft delete**: Mongoose models use a shared plugin (`softDeletePlugin`) that adds `deleted`/`deletedAt` fields and auto-filters deleted records
- **Semantic model file service**: `SemanticModelFileService` in `@archmax/core/services/semantic-model-files` handles all YAML file I/O (list, read, write, delete) with atomic writes (temp file + rename)
- **Env config**: Zod schema validation via `getEnv()` singleton in `@archmax/core/config/env`
- **DB connection**: Singleton `connectDB()` with global mongoose cache in `@archmax/core/infra/db`
- **DuckDB service**: Lazy per-project DuckDB instances in `@archmax/core/services/duckdb` — connections attached as named schemas via postgres/mysql/mssql extensions
- **API structure**: Hono app exports `AppType` for typed RPC client in frontend
- **Frontend API client**: `hc<AppType>` from `hono/client` — fully typed end-to-end. **All frontend HTTP calls MUST use the typed `api` client** from `@/lib/api` (e.g. `api.api.projects[":projectId"].git.status.$get(...)`) — never raw `fetch()` to API routes. This ensures compile-time type safety for request params, bodies, and response types. Reusable query/mutation logic should be extracted into custom hooks (e.g. `@/lib/use-git.ts`, `@/lib/use-publish.ts`) that wrap `useQuery`/`useMutation` with the typed client call, error handling, cache invalidation, and toast feedback.
- **Error handling**: `AppError` class with static factory methods (badRequest, notFound, etc.)
- **MCP tools**: Function returning tool map `Record<string, { description, handler }>`, separate schema/required helpers
- **Auth**: Better Auth with session-based admin login

### Testing Strategy

- Vitest 4.x workspace for unit/integration tests across all packages
- `@vitest/coverage-v8` for coverage reporting (text, HTML, JSON summary)
- Tests colocated with source: `my-service.ts` → `my-service.test.ts`; integration tests use `.integration.test.ts`
- Shared test utilities in `packages/core/src/test-utils/` (factories, LLM mocks, model mocks)
- Integration tests for API routes via Hono `app.request()` (see `apps/api/src/test-utils/api-client.ts`)
- GitHub Actions CI pipeline: lint+typecheck → test+coverage on every PR
- Dockerfile includes a test stage between deps and build

### Documentation Sync

When an OpenSpec change adds or modifies user-facing behaviour, the corresponding `tasks.md` MUST include a task to update the documentation site (`apps/docs`). This ensures docs stay current as features land.

- **User-facing changes** (new features, changed API surface, new MCP tools, config changes): add a docs update task referencing the affected pages.
- **Internal-only changes** (refactors, performance, test infrastructure): no docs task required.
- **No spec sync to docs**: specs live in `openspec/specs/` and are not published to the documentation site. Guides and reference pages that describe features need human-authored updates.

### Git Workflow

- `main` branch for stable releases
- Feature branches for changes
- **Every feature PR must include a spec change**: pull requests that introduce or modify user-facing behaviour MUST include an OpenSpec change proposal (`openspec/changes/<change-id>/`) with spec deltas. PRs without spec changes will be rejected. Bug fixes, typos, and non-breaking dependency updates are exempt.

## Domain Context

### Projects

The top-level organizational unit. A project groups related database connections and their semantic models.

### Connections

A connection represents a database connection (Postgres, MySQL, MSSQL, SQLite, DuckDB) within a project. Each active connection is attached to the project's DuckDB instance for federated querying. Connection config stores structured parameters (host, port, database, user, password) or a raw URI.

### Semantic Models (DuckDB-native, file-based)

Semantic models are stored as YAML files on disk, one file per model, in a per-project directory (`<ARCHMAX_DATA_DIR>/projects/<projectId>/`). Semantic models are project-scoped (not connection-scoped) and follow the [OSI (Open Semantic Interchange)](https://github.com/open-semantic-interchange/OSI) spec with snake_case naming. Each YAML file is self-contained:

- **Datasets** — logical representations of tables/views with source references (`<connection>.<schema>.<table>`), `primary_key`, `unique_keys`, an inline field list, and a **`view_query` SELECT body** (stored in the dataset's COMMON `custom_extension`) that the platform wraps as the dataset's per-model DuckDB VIEW. The platform never auto-derives a view from `fields` — `view_query` is the canonical view-definition surface and a dataset without one is unqueryable.
- **Fields** — row-level attributes within a dataset, with an OSI `expression` object (`{ dialects: [{ dialect: ANSI_SQL, expression: "..." }] }`), optional `dimension` (`{ is_time: true }` for temporal fields), and `custom_extensions` for project-specific metadata (`data_type`, `example_data`, `distinct_values` under `vendor_name: COMMON`). `expression` is the documented semantic mapping consumed by downstream MCP clients; the actual view body is `view_query`.
- **Relationships** — foreign-key relationships between datasets with `from_columns`/`to_columns` mappings
- **Metrics** — quantitative measures with OSI expression objects spanning datasets

All entities support `ai_context` (string or object with instructions, synonyms, examples) and `custom_extensions` for vendor-specific data. Each project directory also contains an auto-generated `AGENTS.md` summarizing its semantic models for AI assistants.

A global agent system prompt at `packages/core/prompts/semantic-model-agent.md` guides AI agents through the semantic model assembly workflow (schema discovery, field mapping, enum detection, relationship inference, metric definition).

### MCP Server

Exposes semantic metadata as MCP tools for AI agent consumption:
- `list_semantic_models` — list semantic models the token has access to (reads YAML files from disk)
- `get_semantic_model` — get a markdown overview of a semantic model with datasets, relationships, and metrics; supports scoped pagination (`scope`: `"datasets"` | `"relationships"` | `"metrics"`, `page`)
- `get_datasets` — get one or more datasets (up to 10) with all their fields as compact markdown lists; each dataset entry specifies its own page for independent field pagination
- `execute_query` — run a read-only SQL query scoped to a single semantic model's VIEWs
- `request_improvement` — submit an improvement request for a semantic model

## Important Constraints

- Single-user system — no multi-tenancy
- MongoDB stores projects and connections; semantic models are stored as YAML files on disk
- `ARCHMAX_DATA_DIR` env var configures the root data directory (defaults to `./data`); project files live under `$ARCHMAX_DATA_DIR/projects/`
- DuckDB is used for federated querying across connections (in-process, per project)
- MCP bearer token auth is the only security boundary for AI agents
- Better Auth session-based login for admin UI

## External Dependencies

- MongoDB — document store for projects and connections
- DuckDB — in-process analytical query engine for federation
- External databases (Postgres, MySQL, MSSQL, SQLite) — attached via DuckDB extensions for querying
- js-yaml — YAML parsing/serialization for semantic model files
