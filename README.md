# archsem

A semantic layer for your databases — describe your data once, let AI agents query it intelligently.

archsem helps you create semantic descriptions of your database schemas (tables, columns, relationships, metrics) and expose them to AI agents through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). Instead of giving AI agents raw database access, you give them a curated, documented view of your data.

## Features

- **Semantic Models** — describe tables as datasets with typed fields, relationships, and metrics using YAML ([OSI spec](https://github.com/open-semantic-interchange/OSI))
- **MCP Server** — expose your semantic layer to AI agents via MCP tools for discovery and scoped SQL queries
- **Data Federation** — query across Postgres, MySQL, MSSQL, SQLite, and DuckDB from a single project using DuckDB
- **AI-Assisted Model Builder** — an agent discovers schemas, maps fields, detects enums, and infers relationships
- **Scoped Query Execution** — AI agents run read-only SQL against sandboxed VIEWs, not raw tables
- **Token-Based Access Control** — MCP tokens with configurable model scopes and expiry
- **Testing Suite** — test agents and cases to validate that AI agents can use your semantic models correctly
- **Self-Hosted** — deploy with Docker in minutes

## Quick Start

### Docker

```bash
docker run -d \
  --name archsem \
  -p 8080:8080 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/archsem \
  -e BETTER_AUTH_SECRET=$(openssl rand -base64 32) \
  -e UI_USERNAME=admin \
  -e UI_PASSWORD=changeme \
  -v archsem-data:/app/data/projects \
  archsem/archsem:latest
```

Open `http://localhost:8080` and log in with the admin credentials.

### Local Development

```bash
git clone https://github.com/archmaxai/archsem.git
cd archsem
cp .env.example .env.local   # Edit with your settings
pnpm install
pnpm dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API | http://localhost:3000 |
| Docs | http://localhost:4321 |
| MCP | `POST http://localhost:3000/mcp/<project-slug>/mcp` |

## Architecture

```
archsem/
├── apps/
│   ├── api/          # Hono API server
│   ├── frontend/     # Vite + React SPA (TanStack Router)
│   ├── worker/       # BullMQ worker for agent jobs
│   └── docs/         # Documentation site (Astro Starlight)
├── packages/
│   ├── core/         # Shared models, services, config (@archsem/core)
│   └── ui/           # React UI components (@archsem/ui)
└── openspec/         # Specifications and change proposals
```

**Tech stack:** TypeScript, Hono, React 19, Vite 6, MongoDB, DuckDB, Tailwind CSS 4, Turborepo

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_connections` | List active database connections for the project |
| `list_semantic_models` | List semantic models the token has access to |
| `get_semantic_model_overview` | Compact overview of a model with datasets, relationships, and metrics |
| `get_dataset_fields` | Fields for one or more datasets with types and expressions |
| `execute_query` | Run a read-only SQL query scoped to a semantic model's VIEWs |

### Connecting an AI Agent

Configure your MCP client with:

- **Endpoint:** `https://your-server/mcp/<project-slug>/mcp`
- **Auth:** `Bearer <your-mcp-token>`

```json
{
  "mcpServers": {
    "archsem": {
      "url": "https://your-server/mcp/your-project/mcp",
      "headers": {
        "Authorization": "Bearer sk-your-token"
      }
    }
  }
}
```

## Configuration

Key environment variables (see `.env.example` for the full list):

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `BETTER_AUTH_SECRET` | Session encryption secret (min 32 chars) |
| `UI_USERNAME` / `UI_PASSWORD` | Initial admin credentials |
| `AGENT_API_BASE_URL` | OpenAI-compatible API endpoint for the AI agent |
| `AGENT_API_KEY` | API key for the agent endpoint |
| `AGENT_MODEL` | LLM model identifier (e.g., `anthropic/claude-sonnet-4`) |
| `REDIS_URL` | Optional — enables BullMQ worker queue |

## Contributing

archsem uses [OpenSpec](https://github.com/nicholasgriffintn/openspec) for spec-driven development. **Every feature PR must include a corresponding spec change.**

1. Install the CLI: `npm install -g openspec-cli`
2. Create a proposal under `openspec/changes/<change-id>/` with spec deltas
3. Validate: `openspec validate <change-id> --strict`
4. Implement after approval
5. Include a docs update task if the change affects user-facing behavior

See the [Contributing guide](apps/docs/src/content/docs/contributing/openspec.mdx) for details.

## License

[MIT](LICENSE)
