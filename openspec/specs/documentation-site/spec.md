# documentation-site Specification

## Purpose
TBD - created by archiving change add-documentation-site. Update Purpose after archive.
## Requirements
### Requirement: Documentation Workspace

The system SHALL include a documentation site as the `apps/docs` workspace package (`@archsem/docs`) built with Astro Starlight.

The workspace MUST integrate with Turborepo so that `pnpm build` builds the docs and `pnpm dev` starts the docs dev server alongside other apps.

#### Scenario: Build includes docs

- **WHEN** a developer runs `pnpm build` from the monorepo root
- **THEN** Turborepo builds the docs workspace along with all other workspaces
- **AND** the build output is a static site in `apps/docs/dist/`

#### Scenario: Dev server starts

- **WHEN** a developer runs `pnpm dev` from the monorepo root
- **THEN** the Starlight dev server starts with hot reload for content changes

### Requirement: Content Authoring

The documentation site SHALL support content authored in Markdown and MDX files under `apps/docs/src/content/docs/`.

The sidebar navigation MUST be auto-generated from the file structure with optional manual overrides in `astro.config.mjs`.

#### Scenario: Adding a new docs page

- **WHEN** a contributor creates a new `.mdx` file in `apps/docs/src/content/docs/guides/`
- **THEN** the page appears in the sidebar under the Guides section
- **AND** the page is indexed by the built-in Pagefind search

### Requirement: OpenSpec Spec Sync

The documentation site SHALL include a build-time script that copies relevant spec content from `openspec/specs/` into the docs content tree under `reference/specs/`.

The sync script MUST run automatically before the Astro build via a `prebuild` hook.

#### Scenario: Specs are current in published docs

- **WHEN** the docs site is built
- **THEN** the reference/specs section contains content derived from the latest `openspec/specs/` files
- **AND** the generated spec pages are gitignored to avoid duplication

#### Scenario: Missing specs fail the build

- **WHEN** the `openspec/specs/` directory is empty or inaccessible
- **THEN** the sync script exits with a non-zero code
- **AND** the Astro build does not proceed

### Requirement: Static Deployment

The documentation site SHALL produce a fully static output (HTML, CSS, JS) deployable to any static hosting provider (GitHub Pages, Cloudflare Pages, Netlify).

The docs site MUST NOT be bundled into the application Docker image.

#### Scenario: GitHub Pages deployment

- **WHEN** a commit is pushed to `main`
- **THEN** a GitHub Actions workflow builds the docs and deploys the static output to GitHub Pages

### Requirement: Content Structure

The documentation site SHALL organise content into the following top-level sections:

- **Getting Started** — installation and quickstart guides
- **Guides** — in-depth usage guides (semantic models, MCP integration, data federation, testing)
- **Reference** — MCP tool reference, configuration, and auto-synced spec pages
- **Contributing** — local development setup and OpenSpec workflow for contributors

#### Scenario: New user finds installation instructions

- **WHEN** a new user visits the documentation site
- **THEN** the Getting Started section is prominently linked from the landing page
- **AND** it contains step-by-step installation and quickstart instructions

### Requirement: Documentation Sync Convention

The OpenSpec workflow SHALL require that any change proposal affecting user-facing behaviour includes a documentation update task in its `tasks.md`.

#### Scenario: Change proposal includes docs task

- **WHEN** a contributor creates a change proposal that adds or modifies user-facing functionality
- **THEN** the `tasks.md` checklist includes a task to update the relevant documentation pages

#### Scenario: Docs-only changes skip the convention

- **WHEN** a change proposal only affects internal implementation (no user-facing impact)
- **THEN** a documentation update task is not required

