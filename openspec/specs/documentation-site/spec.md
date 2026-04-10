# documentation-site Specification

## Purpose
TBD - created by archiving change add-documentation-site. Update Purpose after archive.
## Requirements
### Requirement: Documentation Workspace

The system SHALL include a documentation site as the `apps/docs` workspace package (`@archmax/docs`) built with Astro Starlight.

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

- **Getting Started** - installation and quickstart guides
- **Guides** - in-depth usage guides (semantic models, MCP integration, data federation, testing)
- **Reference** - MCP tool reference, configuration, and auto-synced spec pages
- **Contributing** - local development setup and OpenSpec workflow for contributors

The **quickstart guide** SHALL walk users through the product from a first-person perspective, accurately describing the UI as it exists. Specifically:

- The guide MUST NOT reference UI elements that do not exist (e.g., a "New Model" button).
- Building a semantic model MUST be described as a chat-based workflow: the user navigates to Semantic Models, starts a new conversation, and describes in natural language what kind of model they want to build. The AI agent then discovers schemas, maps fields, and assembles the model.
- Each major UI section (Dashboard/Projects, Semantic Models, Data Federation, Data Browser, MCP Access, Testing) MUST be briefly introduced so users understand what they can do before they start.

The **README.md** in the repository root MUST be kept aligned with the docs site. When the quickstart, installation, or configuration docs change, the corresponding README sections MUST be updated to match. Discrepancies between the README and the docs (e.g., different required vs. optional parameters, different docker commands, different default values) are treated as bugs.

#### Scenario: New user finds installation instructions

- **WHEN** a new user visits the documentation site
- **THEN** the Getting Started section is prominently linked from the landing page
- **AND** it contains step-by-step installation and quickstart instructions

#### Scenario: Quickstart describes actual UI workflow

- **WHEN** a new user follows the quickstart guide
- **THEN** the steps match the actual UI (no references to non-existent buttons or pages)
- **AND** building a semantic model is described as a chat-based interaction with the AI agent

#### Scenario: README matches docs site

- **WHEN** a contributor reads the README Quick Start section
- **THEN** the docker commands, environment variables, and parameter descriptions match the installation docs
- **AND** no parameter is marked as required in one place but optional in another

### Requirement: Documentation Sync Convention

The OpenSpec workflow SHALL require that any change proposal affecting user-facing behaviour includes a documentation update task in its `tasks.md`.

#### Scenario: Change proposal includes docs task

- **WHEN** a contributor creates a change proposal that adds or modifies user-facing functionality
- **THEN** the `tasks.md` checklist includes a task to update the relevant documentation pages

#### Scenario: Docs-only changes skip the convention

- **WHEN** a change proposal only affects internal implementation (no user-facing impact)
- **THEN** a documentation update task is not required

### Requirement: Brand-Consistent Theming

The documentation site SHALL use color tokens, typography, and visual treatments consistent with the archmax marketing website.

The accent palette MUST use hue 257° purple tones for interactive elements (links, highlights), with separate values for light and dark modes.

The gray scale MUST be pure neutral (hue 0°) with no color tint, matching the website's black/white/gray backgrounds and text.

#### Scenario: Neutral grays in light mode

- **WHEN** a user views the documentation site in light mode
- **THEN** backgrounds are pure white (`#ffffff`), text is near-black (`#141414`), and surface grays carry no color tint

#### Scenario: Neutral grays in dark mode

- **WHEN** a user views the documentation site in dark mode
- **THEN** backgrounds are near-black (`#121212`), text is near-white (`#f2f2f2`), and surface grays carry no color tint

#### Scenario: Purple accent on interactive elements only

- **WHEN** a user views any page
- **THEN** the 257° purple accent appears only on links, active highlights, and focus rings
- **AND** backgrounds, borders, and text use pure neutral grays

### Requirement: Geist Font Loading

The documentation site SHALL load Geist Sans and Geist Mono variable font files self-hosted in the static assets.

#### Scenario: Geist fonts render on page load

- **WHEN** a user visits any documentation page
- **THEN** body text renders in Geist Sans and code blocks render in Geist Mono
- **AND** no external font requests are made

### Requirement: Borderless Cards and Code Blocks

Cards and code blocks SHALL have no visible border, matching the website's borderless card pattern with white background in light mode.

Code blocks MUST use rounded corners (`border-radius: 0.75rem`).

#### Scenario: Cards are borderless with white background

- **WHEN** a user views a page with card components in light mode
- **THEN** cards have no border and a white background

#### Scenario: Code blocks are borderless with rounded corners

- **WHEN** a user views a page with code blocks
- **THEN** code blocks have no border and `border-radius: 0.75rem`

### Requirement: Sidebar Active State

The active sidebar item SHALL use a gray background with fully rounded (pill-shaped) corners, matching the website's navigation active state pattern.

#### Scenario: Active sidebar item has pill shape

- **WHEN** a user is on a documentation page
- **THEN** the corresponding sidebar link has a gray background (`--sl-color-gray-6`) and `border-radius: 9999px`

### Requirement: Site Title Styling

The site title in the navigation bar SHALL use the foreground color (white in dark mode, black in light mode) with semi-bold weight, matching the website's logo treatment.

#### Scenario: Site title uses foreground color

- **WHEN** a user views the documentation navigation
- **THEN** the site title text uses the foreground color, not the accent color

### Requirement: Typographic Consistency

All user-facing documentation (README.md and all `.mdx` files under `apps/docs/src/content/docs/`) SHALL NOT use em-dash characters. Dashes in prose MUST use commas, colons, semicolons, parentheses, or sentence restructuring instead. Table cells that represent "no default" or "not applicable" MUST use a plain hyphen-minus (`-`) instead of an em-dash.

The `.env.example` file MUST also avoid em-dashes in its comments.

#### Scenario: No em-dashes in README

- **WHEN** a contributor searches README.md for the em-dash character
- **THEN** zero occurrences are found

#### Scenario: No em-dashes in docs

- **WHEN** a contributor searches all `.mdx` files under `apps/docs/src/content/docs/` for the em-dash character
- **THEN** zero occurrences are found

### Requirement: Auth Secret Persistence Warning

The documentation (quickstart, installation, self-hosting, Docker reference, and configuration pages) SHALL include a prominent warning that `BETTER_AUTH_SECRET` must be saved and reused across container restarts and upgrades. The warning MUST explain that changing or losing this value invalidates all existing sessions and Better Auth data, effectively locking users out until they re-authenticate.

The README Quick Start MUST include a note advising users to save the generated secret.

#### Scenario: User reads standalone Docker instructions

- **WHEN** a user reads the standalone Docker section on the installation page
- **THEN** they find a warning to save the `BETTER_AUTH_SECRET` value for future use
- **AND** the warning explains the consequence of losing the secret

#### Scenario: User reads upgrade instructions

- **WHEN** a user reads the self-hosting upgrade section
- **THEN** they find guidance to reuse the same `BETTER_AUTH_SECRET` from the original deployment

### Requirement: Login Credentials Documentation

The quickstart guide, installation page, and README Quick Start MUST document how to log in after deployment. Each MUST state the default username (`admin`, configurable via `UI_USERNAME`) and the password set via `UI_PASSWORD`. The `UI_USERNAME` variable MUST appear in the Docker examples and configuration tables so users know both credentials before they reach the login screen.

#### Scenario: User knows how to log in

- **WHEN** a user finishes the Docker deployment steps
- **THEN** the documentation tells them to open the URL and log in with the username and password they configured
- **AND** `UI_USERNAME` is listed alongside `UI_PASSWORD` in the docker run/compose examples

### Requirement: Solution Overview in Docs

The documentation landing page or quickstart MUST include a section describing what archmax provides from a user's perspective, including:

- What the main UI sections are and what users do in each one
- That the "AI-Assisted Model Builder" is a chat interface, not a form-based wizard
- That MCP tokens are how external AI agents connect to the semantic layer
- That the Testing suite validates whether agents can use the models correctly

This overview MUST be written for a non-technical audience that has never seen the product.

#### Scenario: New user understands the product

- **WHEN** a new user reads the documentation landing page
- **THEN** they understand the high-level workflow (create project, connect database, build model via chat, publish, create MCP token, connect agent)
- **AND** they can identify what each UI section does before navigating to it

