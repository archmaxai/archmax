## 1. Package and import rename

- [x] 1.1 Rename root `package.json` name from `semlayer` to `archsem`
- [x] 1.2 Rename all workspace `package.json` names from `@semlayer/*` to `@archsem/*` (api, frontend, worker, docs, core, ui)
- [x] 1.3 Update all `@semlayer/` import references to `@archsem/` across ~67 TypeScript/TSX files
- [x] 1.4 Update `pnpm-workspace.yaml` if it references package names — N/A (only lists paths)
- [x] 1.5 Run `pnpm install` to regenerate `pnpm-lock.yaml`
- [x] 1.6 Verify `pnpm build` succeeds with no unresolved imports — pre-existing TS errors in playground-agent.ts (langchain types), unrelated to rename

## 2. UI branding

- [x] 2.1 Update sidebar brand text from `archmax` to `archsem` in `app-sidebar.tsx`
- [x] 2.2 Update login page title from `Semantic Layer` to `Archsem` in `login.tsx`
- [x] 2.3 Update HTML `<title>` from `Semantic Layer` to `Archsem` in `index.html`
- [x] 2.4 Update all localStorage key prefixes from `semlayer-` to `archsem-` across frontend files (7 files, 10 replacements)

## 3. MCP server rename

- [x] 3.1 Update MCP server name from `"semlayer"` to `"archsem"` in `archsem-route.ts`
- [x] 3.2 Rename `semlayer-route.ts` → `archsem-route.ts` and `semlayer-server.ts` → `archsem-server.ts`
- [x] 3.3 Update imports in `app.ts` and any other files referencing the old filenames
- [x] 3.4 Update function name `registerSemlayerTools` → `registerArchsemTools`

## 4. Environment and config

- [x] 4.1 Rename `SEMLAYER_DATA_DIR` to `ARCHSEM_DATA_DIR` in env schema with backward-compat fallback in bootstrap.ts
- [x] 4.2 Update `.env.example` with new variable names and `archsem` DB name
- [x] 4.3 Update `entrypoint.sh` to use `ARCHSEM_DATA_DIR` with backward-compat fallback
- [x] 4.4 Update default MongoDB database name from `archmax` to `archsem` in `db.ts`
- [x] 4.5 Update admin seed email from `admin@semlayer.local` to `admin@archsem.local`

## 5. Docker and CI

- [x] 5.1 Update `Dockerfile` filter references from `@semlayer/*` to `@archsem/*` (8 occurrences)
- [x] 5.2 Update CI workflow files (`.github/workflows/`) — `ci.yml` (DB name), `docs.yml` (package filter)
- [x] 5.3 Update `docker-compose.yml` — N/A (does not exist yet)

## 6. Documentation

- [x] 6.1 Update `README.md` — title, all references, Docker commands, clone URLs (`archmaxai/archsem`), MCP config examples
- [x] 6.2 Update `CONTRIBUTING.md` — title and all `@semlayer/` references (9 occurrences)
- [x] 6.3 Update `apps/docs/astro.config.mjs` — site title, GitHub URLs (`archmaxai/archsem`), edit link base
- [x] 6.4 Update all documentation pages in `apps/docs/src/content/docs/` — 10 pages updated
- [x] 6.5 Update `openspec/project.md` — project name, package scope references, env var names

## 7. OpenSpec specs

- [x] 7.1 Update `specs/frontend-shell/spec.md` — archmax → Archsem in logo references
- [x] 7.2 Update `specs/mcp-server/spec.md` — no branding changes needed (references are to domain concepts)
- [x] 7.3 Update `specs/auth/spec.md` — admin email domain (2 occurrences)
- [x] 7.4 Update `specs/semantic-models/spec.md` — `@semlayer/` and `SEMLAYER_DATA_DIR` (18 occurrences)
- [x] 7.5 Update `specs/spa-architecture/spec.md` — `@semlayer/` reference
- [x] 7.6 Update `specs/hono-api/spec.md` — `@semlayer/` reference
- [x] 7.7 Update `specs/semantic-model-agent/spec.md` — `SEMLAYER_DATA_DIR` references
- [x] 7.8 Update `specs/document-uploads/spec.md` — `SEMLAYER_DATA_DIR` references
- [x] 7.9 Update active changes (`add-single-image-deployment`, `add-documentation-site`, `add-comprehensive-test-strategy`)

## 8. Verification

- [x] 8.1 Run `pnpm build` — pre-existing TS errors (langchain types in playground-agent.ts), not from rename
- [x] 8.2 Run `pnpm test` — all 150 tests pass
- [x] 8.3 Grep for remaining `semlayer` or `archmax` references — clean (only build cache and historical migration script)
