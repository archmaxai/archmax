## ADDED Requirements

### Requirement: Agent Scaffold Filesystem Layout

Each project's data directory (`<ARCHMAX_DATA_DIR>/projects/<projectId>/`) SHALL constitute the project's **agent scaffold**: a plugin-style filesystem intended for consumption by an agent harness. The semantic model YAML files SHALL live under a dedicated `data_models/` subdirectory (see the `semantic-models` capability for the exact file layout). Alongside `data_models/` and the optional `AGENTS.md`, the scaffold SHALL support the following conventional entries:

```
<project-dir>/
├── data_models/         # data models (semantic model YAML files)
│   ├── <model>.yaml
│   └── <model>/<dataset>.yaml
├── AGENTS.md            # agent instructions / memory (existing)
├── commands/            # slash commands (.md) — legacy, prefer skills/
├── agents/              # subagent definitions (.md)
├── skills/
│   └── <skill-name>/
│       └── SKILL.md
├── hooks/
│   └── hooks.json       # event handlers
├── .mcp.json            # MCP server definitions
└── scripts/             # helper scripts
```

Scaffold files SHALL be authored **directly by the builder agent** through its existing Deep Agents filesystem tools (no separate generation pipeline). The builder's system prompt SHALL document the scaffold layout and conventions, including that semantic models live under `data_models/` and that `skills/` is preferred over `commands/` for new capabilities. Scaffold directories and files SHALL be included in the project's Git versioning (they are source, not build output).

#### Scenario: Builder authors a skill

- **WHEN** the user asks the builder to add a "monthly revenue report" capability
- **THEN** the builder uses `write_file` to create `skills/monthly-revenue-report/SKILL.md` inside the project directory
- **AND** the file participates in publish/Git versioning like any other project file

#### Scenario: Scaffold coexists with data models

- **WHEN** a project contains scaffold directories (`skills/`, `agents/`, `hooks/`) alongside the `data_models/` directory
- **THEN** semantic-model listing and MCP tools continue to operate on the YAML files under `data_models/` unchanged
- **AND** the scaffold entries do not interfere with model parsing

#### Scenario: System prompt documents the layout

- **WHEN** the builder agent's system prompt is composed
- **THEN** it describes the scaffold layout (`data_models/`, `commands/`, `agents/`, `skills/<name>/SKILL.md`, `hooks/hooks.json`, `.mcp.json`, `scripts/`), that semantic models live under `data_models/`, and the skills-over-commands preference

### Requirement: Seeded MCP Server Definition

The platform SHALL seed and maintain a `.mcp.json` file at the project root containing an `archmax` MCP server entry pointing at the project's MCP endpoint (derived from the configured application base URL and the project slug). The entry SHALL reference the bearer token via an environment-variable placeholder (e.g. `${ARCHMAX_MCP_TOKEN}`); real token values MUST NOT be written to the file. The file SHALL be created on project creation, recreated if missing when the builder agent starts, and updated when the project slug changes. The builder agent MAY extend the file with additional servers; the platform SHALL preserve unknown entries when updating its own.

#### Scenario: New project gets a seeded .mcp.json

- **WHEN** a project with slug `ecommerce` is created
- **THEN** `.mcp.json` exists at the project root with an `archmax` server entry whose URL targets the project's MCP endpoint for `ecommerce`
- **AND** authorization references `${ARCHMAX_MCP_TOKEN}` rather than a literal token

#### Scenario: Slug change updates the endpoint

- **WHEN** the project slug is changed in settings
- **THEN** the `archmax` entry's URL in `.mcp.json` is updated to the new slug
- **AND** any additional user/agent-added server entries are preserved

#### Scenario: No secrets in the file

- **WHEN** `.mcp.json` is written or updated by the platform
- **THEN** the file contains no literal bearer tokens, API keys, or other secret material

### Requirement: JSON Syntax Validation on Write

The builder agent's filesystem backend SHALL validate JSON syntax before persisting any file whose path ends in `.json` (including `.mcp.json` and `hooks/hooks.json`). When the content is not valid JSON, the `write_file` tool MUST return an error describing the syntax issue instead of writing the file. When an `edit_file` operation on a JSON file produces syntactically invalid content, the tool MUST return an error so the agent can self-correct. This mirrors the existing YAML validation for `.yaml`/`.yml` files.

#### Scenario: Invalid JSON rejected

- **WHEN** the builder invokes `write_file` for `hooks/hooks.json` with malformed JSON
- **THEN** the tool returns an error describing the syntax problem
- **AND** the file is not written to disk

#### Scenario: Valid JSON written

- **WHEN** the builder writes syntactically valid JSON to `.mcp.json`
- **THEN** the file is persisted normally

### Requirement: Scaffold Export API

The API SHALL expose an authenticated `GET /api/projects/:projectId/scaffold/export` endpoint that streams a zip archive of the project's agent scaffold, named `<project-slug>-scaffold.zip`. The archive SHALL contain the project directory contents **excluding** internal entries: `.git/`, `large_tool_results/`, `uploads/`, `duckdb.db` and its side files (`*.wal`, `*.tmp`), and any dotfile temp artifacts. The archive MUST NOT contain secret material; `.mcp.json` is included as seeded (placeholder token only). The endpoint SHALL require admin session auth and return 404 for unknown projects.

#### Scenario: Export a scaffold

- **WHEN** an authenticated GET request is made to `/api/projects/:projectId/scaffold/export` for a project with models, `AGENTS.md`, and a skill
- **THEN** the response is a zip download named `<slug>-scaffold.zip`
- **AND** it contains the `data_models/` directory, `AGENTS.md`, `skills/`, and `.mcp.json`
- **AND** it contains no `.git/`, `large_tool_results/`, `uploads/`, or DuckDB files

#### Scenario: No secrets in the export

- **WHEN** an exported archive is inspected
- **THEN** it contains no bearer tokens, API keys, or encrypted credential material

#### Scenario: Unauthenticated export rejected

- **WHEN** the request lacks a valid admin session
- **THEN** a 401 error is returned

### Requirement: Scaffold Export UI

The Builder side panel's **Agent Scaffold** section header SHALL provide an icon-only Export action (download icon with accessible name "Export scaffold"). Activating it SHALL download the scaffold archive via the export endpoint. While the export is being prepared the control SHALL be disabled; on failure an error toast with the server message SHALL be shown.

#### Scenario: Export from the panel

- **WHEN** the user clicks the Export action in the Agent Scaffold section header
- **THEN** the browser downloads `<slug>-scaffold.zip` from the export endpoint

#### Scenario: Export failure surfaces an error

- **WHEN** the export endpoint responds with an error
- **THEN** an error toast displays the server-provided message
