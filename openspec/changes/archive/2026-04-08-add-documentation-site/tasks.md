## 1. Workspace Setup

- [x] 1.1 Scaffold `apps/docs` with Astro Starlight (manual setup with `pnpm add`)
- [x] 1.2 Configure `package.json` with `name: "@archsem/docs"`, `build`, `dev` scripts
- [x] 1.3 Verify `pnpm-workspace.yaml` picks up `apps/docs` (already covers `apps/*`)
- [x] 1.4 Confirm `pnpm build` and `pnpm dev` include docs via Turborepo

## 2. Starlight Configuration

- [x] 2.1 Configure `astro.config.mjs` with site metadata, sidebar structure, and social links
- [x] 2.2 Set up dark mode (Starlight default) and customise brand colors to match Archsem
- [x] 2.3 Configure Pagefind search (enabled by default in Starlight)

## 3. Content Structure

- [x] 3.1 Create landing page (`index.mdx`) with project overview
- [x] 3.2 Create getting-started section: installation, quickstart
- [x] 3.3 Create guides section: semantic models, MCP integration, data federation, testing
- [x] 3.4 Create reference section: MCP tools, configuration / env vars
- [x] 3.5 Create contributing section: local development, OpenSpec workflow

## 4. OpenSpec Spec Sync

- [x] 4.1 Write `apps/docs/scripts/sync-specs.mjs` to copy spec content from `openspec/specs/` into docs content tree
- [x] 4.2 Add `prebuild` step in `apps/docs/package.json` `build` script that runs the sync
- [x] 4.3 Add generated spec pages to `.gitignore` in `apps/docs`

## 5. Deployment

- [x] 5.1 Add GitHub Actions workflow for building and deploying docs to GitHub Pages
- [x] 5.2 Configure `astro.config.mjs` `site` and `base` for the target URL (left as defaults — set when domain is decided)

## 6. Project Conventions

- [x] 6.1 Update `openspec/project.md` with documentation-sync convention
