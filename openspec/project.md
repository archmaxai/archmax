# Project Context

## Purpose

Semantic Layer — a tool for managing semantic descriptions of database schemas, tables, columns, and relationships. Provides an admin UI for data source registration and an MCP server that AI agents can query to understand database structure and meaning.

## Tech Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Language**: TypeScript 5.9, ES2022 target, `moduleResolution: "bundler"`
- **Frontend**: Vite 6, React 19, TanStack Router (file-based), TanStack Query, Tailwind CSS 4 (OKLCH tokens, shadcn-style)
- **API**: Hono 4 on Node.js (`@hono/node-server`), Zod validation
- **MCP**: JSON-RPC endpoint on Hono with bearer token auth, rate limiting
- **Database**: MongoDB via Mongoose 9
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

### Architecture Patterns

- **Shared packages**: `@semlayer/core` for models/DB/config, `@semlayer/ui` for React components
- **Mongoose models**: Interface → Schema → hot-reload-safe export (`mongoose.models.X || mongoose.model()`)
- **Env config**: Zod schema validation via `getEnv()` singleton in `@semlayer/core/config/env`
- **DB connection**: Singleton `connectDB()` with global mongoose cache in `@semlayer/core/infra/db`
- **API structure**: Hono app exports `AppType` for typed RPC client in frontend
- **Frontend API client**: `hc<AppType>` from `hono/client` — fully typed end-to-end
- **Error handling**: `AppError` class with static factory methods (badRequest, notFound, etc.)
- **MCP tools**: Function returning tool map `Record<string, { description, handler }>`, separate schema/required helpers
- **No auth**: Single-user admin tool — no JWT/auth middleware

### Testing Strategy

- Vitest for unit/integration tests
- Tests colocated with source or in `__tests__/` directories

### Git Workflow

- `main` branch for stable releases
- Feature branches for changes

## Domain Context

### Data Sources

A data source represents a database connection (Postgres, MySQL, MSSQL, MongoDB) with:
- Connection details (type, connection string)
- Semantic table descriptions — human-readable descriptions of what tables contain
- Column-level metadata — types, descriptions, primary/foreign key annotations, relationship references

### Semantic Models

Higher-level groupings that span multiple tables within a data source:
- Named relationships between tables with cardinality
- Computed metrics with SQL/aggregation expressions
- Tags for discovery and organization

### MCP Server

Exposes semantic metadata as MCP tools for AI agent consumption:
- `list_data_sources` — enumerate available data sources
- `get_data_source` — get full details for a named data source
- `list_semantic_models` — enumerate semantic models
- `get_semantic_model` — get full semantic model by name
- `describe_table` — get column-level semantics for a specific table

## Important Constraints

- Single-user system — no multi-tenancy or authentication required
- MongoDB is the only data store (semantic descriptions stored here)
- Data source connections are for description only — the system does not query external databases (yet)
- MCP bearer token auth is the only security boundary

## External Dependencies

- MongoDB — document store for all persistent data
- External databases (Postgres, MySQL, MSSQL, MongoDB) — described but not queried
