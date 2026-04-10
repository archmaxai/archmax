## MODIFIED Requirements

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

## ADDED Requirements

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
