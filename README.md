# archmax

A semantic layer for your databases. Describe your data once, let AI agents query it intelligently.

### **[Read the docs &rarr;](https://docs.archmax.ai)**

> **Heads up: archmax is experimental.** The core ideas are stable, but APIs, file formats, and configuration may change between releases. We try to avoid breaking changes, but can't guarantee stability yet. Pin your version and check the changelog before upgrading.

Built on the **[Open Semantic Interchange (OSI)](https://github.com/open-semantic-interchange/OSI)** spec, an open standard for describing datasets, relationships, and metrics in a vendor-neutral way. archmax is the runtime that turns OSI models into a live, queryable semantic layer for AI agents.

## The Problem

Connecting AI agents to databases today is a gamble. You either hand over raw SQL access and hope the LLM doesn't hallucinate column names, run destructive queries, or leak sensitive data, or you spend weeks writing bespoke tool integrations that break the moment your schema changes.

Even when agents *can* query your database, they have no idea what the data actually means. A column called `amt_01` could be revenue, tax, or a refund. A table called `dim_cust` is meaningless without business context. Without that context, agents guess, and guessing on real data has real consequences.

The gap between "AI can write SQL" and "AI understands our data" is where most agent-database projects stall.

## How archmax Solves This

archmax puts a **semantic layer** between your databases and AI agents. You describe your data once (what tables mean, how they relate, what metrics matter) and archmax exposes that knowledge through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

Instead of raw database access, agents get:

- **Business context**: field descriptions, synonyms, examples, and enum values so the agent knows `amt_01` is "gross revenue in EUR"
- **Guardrails**: read-only queries scoped to sandboxed VIEWs, not raw tables; token-based access with model-level permissions
- **Federation**: a single query interface across Postgres, MySQL, MSSQL, SQLite, and DuckDB, powered by DuckDB's in-process engine
- **Structure**: typed datasets, explicit relationships, and reusable metric definitions grounded in the OSI spec

The result: AI agents that query your data reliably, safely, and with understanding, not guesswork.

## Features

- **Semantic Models**: describe tables as datasets with typed fields, relationships, and metrics in YAML
- **MCP Server**: expose your semantic layer to any MCP-compatible AI agent (Claude, Cursor, custom agents)
- **Data Federation**: query across Postgres, MySQL, MSSQL, SQLite, and DuckDB from a single project
- **AI-Assisted Model Builder**: a chat-based agent discovers schemas, maps fields, detects enums, and infers relationships
- **Scoped Query Execution**: agents run read-only SQL against sandboxed VIEWs, never raw tables
- **Token-Based Access Control**: MCP tokens with configurable model scopes and expiry
- **Testing Suite**: test cases that validate whether agents can use your semantic models correctly
- **Self-Hosted**: deploy with Docker in minutes, keep your data on your infrastructure

## Quick Start

### Docker (Standalone)

Run archmax as a single container with embedded MongoDB and Redis:

```bash
docker run -d \
  --name archmax \
  -p 8080:8080 \
  -e BETTER_AUTH_SECRET=$(openssl rand -base64 32) \
  -e UI_USERNAME=admin \
  -e UI_PASSWORD=changeme \
  -v archmax-data:/app/data \
  archmaxai/archmax:latest
```

> **Save your `BETTER_AUTH_SECRET`.** If you lose this value or change it on a restart, all sessions and authentication data become invalid. Generate it beforehand and store it in a safe place.

Open `http://localhost:8080` and log in with username `admin` (or your `UI_USERNAME`) and the password you set in `UI_PASSWORD`.

For production deployments, use **Docker Compose** (separate containers for MongoDB and Redis). See the [Installation guide](apps/docs/src/content/docs/getting-started/installation.mdx) for details.

### Local Development

```bash
git clone https://github.com/archmaxai/archmax.git
cd archmax
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
archmax/
├── apps/
│   ├── api/          # Hono API server
│   ├── frontend/     # Vite + React SPA (TanStack Router)
│   ├── worker/       # BullMQ worker for agent jobs
│   └── docs/         # Documentation site (Astro Starlight)
├── packages/
│   ├── core/         # Shared models, services, config (@archmax/core)
│   └── ui/           # React UI components (@archmax/ui)
└── openspec/         # Specifications and change proposals
```

**Tech stack:** TypeScript, Hono, React 19, Vite 6, MongoDB, DuckDB, Tailwind CSS 4, Turborepo

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_semantic_models` | List semantic models the token has access to |
| `get_semantic_model` | Overview of a model with datasets, relationships, and metrics |
| `get_datasets` | Fields for one or more datasets with types, examples, enums, and instructions |
| `execute_query` | Run a read-only SQL query scoped to a semantic model's VIEWs |
| `request_improvement` | Submit an improvement request for a semantic model |

### Connecting an AI Agent

Configure your MCP client with:

- **Endpoint:** `https://your-server/mcp/<project-slug>/mcp`
- **Auth:** `Bearer <your-mcp-token>`

```json
{
  "mcpServers": {
    "archmax": {
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
| `BETTER_AUTH_SECRET` | Session encryption secret (min 32 chars). Save and reuse across restarts. |
| `UI_USERNAME` / `UI_PASSWORD` | Initial admin credentials (default username: `admin`) |
| `MONGODB_URI` | MongoDB connection string (optional in Docker; embedded when omitted) |
| `AGENT_API_BASE_URL` | OpenAI-compatible API endpoint for the AI agent |
| `AGENT_API_KEY` | API key for the agent endpoint |
| `AGENT_MODEL` | LLM model identifier (e.g., `anthropic/claude-sonnet-4`) |
| `REDIS_URL` | Optional. Enables BullMQ worker queue (embedded in Docker when omitted) |

## Contributing

archmax uses [OpenSpec](https://github.com/nicholasgriffintn/openspec) for spec-driven development. **Every feature PR must include a corresponding spec change.**

1. Install the CLI: `npm install -g openspec-cli`
2. Create a proposal under `openspec/changes/<change-id>/` with spec deltas
3. Validate: `openspec validate <change-id> --strict`
4. Implement after approval
5. Include a docs update task if the change affects user-facing behavior

See the [Contributing guide](apps/docs/src/content/docs/contributing/openspec.mdx) for details.

## License

[AGPL-3.0](LICENSE)
