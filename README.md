# Semantic Layer

A semantic layer for database access — admin UI and MCP server for managing semantic descriptions of database schemas.

## Quick Start

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Frontend: http://localhost:5173  
API: http://localhost:3000  
MCP: POST http://localhost:3000/mcp/semlayer

## Architecture

```
├── apps/
│   ├── api/          # Hono API server
│   └── frontend/     # Vite + React SPA
├── packages/
│   ├── core/         # Mongoose models, DB, config
│   └── ui/           # Shared Radix/shadcn components
└── openspec/         # Project specs
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_data_sources` | List all registered data sources |
| `get_data_source` | Get data source details by name |
| `list_semantic_models` | List all semantic models |
| `get_semantic_model` | Get semantic model by name |
| `describe_table` | Get column-level semantics for a table |
