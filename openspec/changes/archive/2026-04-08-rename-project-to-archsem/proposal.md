# Change: Rename project to Archsem

## Why

The project identity is inconsistent — the sidebar says "archmax", the login and HTML title say "Semantic Layer", the docs and packages use "Semlayer", and the MongoDB database defaults to "archmax". Unifying under a single name **Archsem** establishes a clear, memorable brand and eliminates confusion in documentation, MCP client configs, Docker images, and developer onboarding.

## What Changes

- **BREAKING**: npm scope changes from `@semlayer/*` to `@archsem/*` across all packages
- **BREAKING**: Environment variable `SEMLAYER_DATA_DIR` renamed to `ARCHSEM_DATA_DIR` (with backward-compat fallback)
- **BREAKING**: MCP server name changes from `"semlayer"` to `"archsem"` (affects client configs)
- **BREAKING**: Default MongoDB database name changes from `archmax` to `archsem`
- **BREAKING**: Admin seed email changes from `admin@semlayer.local` to `admin@archsem.local`
- **BREAKING**: Docker image/container/volume names change from `semlayer` to `archsem`
- GitHub URLs updated from `semlayer/semlayer` to `archmaxai/archsem` (repo rename deferred)
- UI product name unified to "Archsem" in sidebar, login page, browser tab title
- Documentation site title, all content pages, and README updated
- localStorage keys change prefix from `semlayer-` to `archsem-`
- MCP source files renamed from `semlayer-*` to `archsem-*`
- `openspec/project.md` updated to reflect new project name

## Impact

- Affected specs: `frontend-shell`, `mcp-server`, `auth`
- Affected code: All `package.json` files, ~67 TypeScript files with `@semlayer/` imports, `Dockerfile`, CI workflows, `README.md`, `CONTRIBUTING.md`, all documentation pages in `apps/docs/`, `openspec/project.md`, `entrypoint.sh`, `.env.example`, MCP route/server files
- External impact: Users must update MCP client configs (`mcpServers.semlayer` → `mcpServers.archsem`), Docker commands, and environment variables
- Note: GitHub org is `archmax`; a full repo rename is planned separately
