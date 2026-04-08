## Context

The project has accumulated three different names over its development: "archmax" (original working title, still in sidebar and MongoDB), "Semantic Layer" (descriptive name in the UI), and "Semlayer" (shorthand in packages and docs). This rename unifies everything under "Archsem".

## Goals / Non-Goals

- Goals:
  - Single consistent product name "Archsem" across all surfaces
  - npm scope `@archsem/*` for all packages
  - Clean migration path for existing deployments
  - Updated documentation and branding assets
- Non-Goals:
  - Changing the repository directory name on disk (users can rename at will)
  - Creating a logo graphic (text-only branding is sufficient for now)
  - Renaming internal code identifiers that don't surface to users (e.g. `SemanticModelFileService` stays as-is since "semantic model" is a domain concept, not a brand)

## Decisions

### Naming convention

| Surface | Old | New |
|---------|-----|-----|
| Product name (UI, docs, README) | Semlayer / Semantic Layer / archmax | Archsem |
| npm scope | `@semlayer/*` | `@archsem/*` |
| MCP server name | `semlayer` | `archsem` |
| Env var prefix | `SEMLAYER_` | `ARCHSEM_` |
| Docker image | `semlayer/semlayer` | `archsem/archsem` |
| Default DB name | `archmax` | `archsem` |
| Admin email | `admin@semlayer.local` | `admin@archsem.local` |
| localStorage prefix | `semlayer-` | `archsem-` |
| GitHub org/repo | `semlayer/semlayer` | `archmaxai/archsem` (repo rename later) |

### "Semantic model" as domain term

The term "semantic model" remains unchanged throughout the codebase — it describes a domain concept (a semantic description of database tables), not the product. Class names like `SemanticModelFileService`, route paths like `/models`, and MCP tool names like `list_semantic_models` are not renamed.

### Environment variable backward compatibility

`ARCHSEM_DATA_DIR` becomes the primary variable. The bootstrap code SHALL check `process.env.ARCHSEM_DATA_DIR ?? process.env.SEMLAYER_DATA_DIR` to give existing deployments time to migrate. A deprecation warning is logged when the old variable is used.

### Database migration

Existing MongoDB databases named `archmax` or `semlayer` continue to work — the default changes to `archsem` in `.env.example` and docs, but the actual DB name is configured via `MONGODB_URI`. No data migration script is needed.

## Risks / Trade-offs

- **Import churn**: ~67 files need `@semlayer/` → `@archsem/` import updates. Mitigated by doing a bulk find-and-replace followed by `pnpm install` to verify resolution.
- **External client breakage**: MCP clients configured with `mcpServers.semlayer` will need reconfiguration. Mitigated by documenting the change prominently in release notes.
- **SEO/link breakage**: Docs and README currently reference `semlayer/semlayer` — updating to `archmaxai/archsem` now; a future repo rename will use GitHub's automatic redirect.
