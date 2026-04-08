## Context

Archsem is preparing for open-source release and needs a documentation site that integrates with the existing monorepo workflow (pnpm workspaces, Turborepo, OpenSpec). The docs must be easy for contributors to maintain (markdown authoring) and cheap to deploy (static output).

## Goals / Non-Goals

- Goals:
  - Documentation lives in the monorepo as a first-class workspace
  - Turborepo orchestrates doc builds alongside API, frontend, and worker
  - Content is authored in Markdown/MDX — no custom CMS
  - OpenSpec specs can be surfaced in the docs automatically
  - Static output deployable to GitHub Pages or Cloudflare Pages
  - OpenSpec workflow includes a convention for keeping docs in sync with feature changes

- Non-Goals:
  - Serving docs from the Docker image (keeps image lean; docs are a separate static site)
  - Full API reference auto-generation from code (can be added later with Starlight plugins)
  - Versioned docs (single version initially; add versioning when there are breaking releases)
  - i18n / translations (English-only for launch)

## Decisions

### Framework: Astro Starlight

- **Decision**: Use Astro Starlight for the documentation site.
- **Alternatives considered**:
  - *Docusaurus* — React-based, heavier bundle, ships JS to the client for static content. More config overhead.
  - *VitePress* — Vue-based, creates contributor friction in a React project.
  - *MkDocs Material* — Python toolchain, doesn't integrate with pnpm/Turborepo.
  - *Nextra / Fumadocs* — Next.js-based, adds a second meta-framework to a Vite project.
- **Rationale**: Starlight ships zero JS by default, has built-in search (Pagefind), sidebar generation, dark mode, and is widely adopted for OSS docs (Astro, Biome, Cloudflare). Astro supports React islands if interactive components are needed later.

### Workspace placement: `apps/docs`

- **Decision**: Place docs under `apps/docs` as a workspace package `@archsem/docs`.
- **Rationale**: `apps/*` is already in `pnpm-workspace.yaml`. Turborepo picks up the `build` and `dev` scripts automatically. No config changes beyond adding the workspace.

### OpenSpec-to-docs sync

- **Decision**: A build-time Node script (`apps/docs/scripts/sync-specs.mjs`) copies relevant spec content from `openspec/specs/` into `apps/docs/src/content/docs/reference/specs/` before the Astro build. This keeps spec content in the docs without symlinks (which break on some CI environments).
- **Rationale**: Specs are the authoritative source of truth for "what is built". Copying at build time avoids manual duplication while keeping the Astro content pipeline standard. The script is idempotent and runs as a `prebuild` hook.

### Deployment: Separate static site

- **Decision**: Docs deploy as a standalone static site (e.g., `docs.semlayer.dev` via GitHub Pages or Cloudflare Pages), not bundled into the Docker image.
- **Rationale**: The Docker image serves the admin UI + API for self-hosted users. Documentation is a public resource that should be indexed by search engines and available without running the application. Keeping it separate also avoids bloating the Docker image.

### Content structure

```
apps/docs/src/content/docs/
├── index.mdx                  # Landing / overview
├── getting-started/
│   ├── installation.mdx       # Docker, local dev
│   └── quickstart.mdx         # First project + connection
├── guides/
│   ├── semantic-models.mdx    # Authoring YAML models
│   ├── mcp-integration.mdx    # Connecting AI agents
│   ├── data-federation.mdx    # DuckDB cross-connection queries
│   └── testing.mdx            # Test agents and cases
├── reference/
│   ├── mcp-tools.mdx          # MCP tool reference
│   ├── configuration.mdx      # Env vars, settings
│   └── specs/                 # Auto-synced from openspec/specs/
└── contributing/
    ├── development.mdx        # Local setup, monorepo guide
    └── openspec.mdx           # How to use OpenSpec for contributions
```

## Risks / Trade-offs

- **Astro adds a new framework** — Astro is build-only tooling (no runtime dependency in production). Contributors only need Astro knowledge for docs, not for the core product. Risk is low.
- **Spec sync could drift** — Mitigated by running the sync script in CI and failing the build if specs are missing or malformed.
- **Maintenance burden** — Starlight's defaults handle sidebar, search, and theming with minimal config. Content is just markdown files.

## Open Questions

- Exact domain for the docs site (`docs.semlayer.dev`? subdirectory of main site?)
- Whether to include a changelog page auto-generated from OpenSpec archives
- Whether to add an interactive MCP playground component (React island) in a later iteration
