## MODIFIED Requirements

### Requirement: Project Model

The system SHALL store projects in MongoDB with the following fields: `title` (string, required), `slug` (string, required, matching `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`), `description` (string, default empty), `mcpPageSize` (number, default 50, min 10, max 200), `github` (optional subdocument: `url` (string, required — full HTTPS URL of the GitHub repository, e.g. `https://github.com/owner/repo.git`), `branch` (string, default `"main"`), `encryptedToken` (string, required — AES-256-GCM encrypted GitHub PAT using `ENCRYPTION_KEY`)), `builderLlm` (optional subdocument: `baseUrl` (string, optional), `encryptedApiKey` (string, optional — AES-256-GCM encrypted when `ENCRYPTION_KEY` is set, plaintext otherwise), `model` (string, optional)), `agentLlm` (optional subdocument: `baseUrl` (string, required), `encryptedApiKey` (string, required — same encryption rules), `model` (string, required), `systemPrompt` (string, required)), `_schemaVersion` (number, default 0), `createdAt` (Date, auto), `updatedAt` (Date, auto). Slugs SHALL be unique among non-deleted projects and auto-generated from the title on creation.

The `baseUrl` fields of `builderLlm` and `agentLlm` SHALL be validated with the same SSRF rules previously applied to test agents: `https://` required, no private/loopback/link-local IP targets (RFC 1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fe80::/10`); `http://` accepted only for `localhost`/`127.0.0.1`.

#### Scenario: Create a project

- **WHEN** a project is created with title "Sales Analytics"
- **THEN** a slug is generated as "sales-analytics"
- **AND** the project is stored with default `mcpPageSize: 50`, no `github`, no `builderLlm`, and no `agentLlm`

#### Scenario: Project with GitHub configured

- **WHEN** a project has `github` set with `url: "https://github.com/myorg/semlayer-models.git"`, `branch: "main"`, and an encrypted PAT
- **THEN** publish operations push to that repository
- **AND** sync operations pull from that repository

#### Scenario: Project with agent configured

- **WHEN** a project's `agentLlm` is set with `baseUrl: "https://api.openai.com/v1"`, an encrypted API key, `model: "gpt-4o"`, and a system prompt
- **THEN** the playground and test runs execute with this configuration

#### Scenario: SSRF-unsafe base URL rejected

- **WHEN** `builderLlm.baseUrl` or `agentLlm.baseUrl` is set to a private address (e.g. `http://169.254.169.254/`, `http://10.0.0.1/v1`)
- **THEN** a 400 error is returned indicating the URL targets a restricted address

### Requirement: Project Settings UI

Project settings SHALL be presented as a settings group with three pages reachable from the sidebar Settings group: **General** (`/$projectId/settings`), **Builder** (`/$projectId/settings/builder`), and **Agent** (`/$projectId/settings/agent`).

The **General** page SHALL display: a "Project Identity" card with title and slug fields, an "MCP Page Size" input (10–200, no spinner arrows), a "GitHub" card for upstream configuration, a "Publish History" card showing recent commits, and a "Danger Zone" card for project deletion.

The "GitHub" card SHALL contain: a text input for the repository URL (placeholder: `https://github.com/owner/repo.git`), a password input for the Personal Access Token (masked, placeholder: `ghp_...`), a text input for the branch name (default: `main`), a "Save" button to persist the configuration, a "Remove" button to clear the GitHub configuration (shown only when configured), and a "Sync Now" button (shown only when configured) that triggers a pull/merge from the remote. The PAT SHALL be encrypted using `ENCRYPTION_KEY` before storage. The PAT input SHALL show a masked placeholder when a token is already stored (never expose the actual token).

When the project does not yet have Git initialized (determined by `GET /api/projects/:projectId/git/status` returning `initialized: false`), the General page SHALL display a "Version Control" card with an informational message explaining that this project has not been migrated to Git versioning yet, and a "Initialize Git" button. Clicking the button SHALL call `POST /api/projects/:projectId/git/init`, show a success toast on completion, and replace the migration card with the normal GitHub and Publish History cards. While Git is not initialized, the GitHub card and Publish History card SHALL be hidden (they require a Git repo to function).

The "Publish History" card SHALL display a list of recent commits from the local Git repository (fetched from `GET /api/projects/:projectId/git/log`). Each entry SHALL show the commit message and a human-readable relative timestamp (e.g. "2 hours ago"). The list SHALL show the most recent 10 commits. If the project has no commits yet, the card SHALL display a placeholder message such as "No publish history yet."

#### Scenario: Configure GitHub

- **WHEN** the user enters a repository URL, PAT, and branch in the GitHub card and clicks "Save"
- **THEN** the PAT is encrypted and stored in `github.encryptedToken`
- **AND** the URL and branch are stored in `github.url` and `github.branch`
- **AND** a success toast is shown

#### Scenario: Sync from settings

- **WHEN** the user clicks "Sync Now" in the GitHub card
- **THEN** the system pulls and merges upstream changes
- **AND** on success, a toast shows the sync result
- **AND** on conflict, a toast shows the conflicted file paths

#### Scenario: Remove GitHub configuration

- **WHEN** the user clicks "Remove" in the GitHub card
- **THEN** the `github` subdocument is removed from the project
- **AND** subsequent publishes only create local commits without pushing

#### Scenario: Sync button disabled during operation

- **WHEN** a sync operation is in progress
- **THEN** the "Sync Now" button shows a loading state and is not clickable

#### Scenario: View publish history

- **WHEN** the user views the General settings page for a project with 5 commits
- **THEN** the "Publish History" card lists all 5 commits with messages and relative timestamps
- **AND** the most recent commit appears first

#### Scenario: Empty publish history

- **WHEN** the user views General settings for a project with no commits
- **THEN** the "Publish History" card shows "No publish history yet."

#### Scenario: Existing project without Git shows migration prompt

- **WHEN** the user views General settings for a project that has not been migrated to Git
- **THEN** a "Version Control" card is shown with an explanation and an "Initialize Git" button
- **AND** the GitHub card and Publish History card are hidden

#### Scenario: User migrates project to Git

- **WHEN** the user clicks "Initialize Git" on the migration card
- **THEN** the system initializes a Git repository with all existing files
- **AND** a success toast is shown ("Git repository initialized")
- **AND** the migration card is replaced by the GitHub and Publish History cards

#### Scenario: Migration button shows loading state

- **WHEN** the Git initialization is in progress
- **THEN** the "Initialize Git" button shows a loading state and is not clickable

#### Scenario: Navigate between settings pages

- **WHEN** the user clicks the Builder or Agent sub-item in the sidebar Settings group
- **THEN** the corresponding settings page (`/$projectId/settings/builder` or `/$projectId/settings/agent`) is rendered

## ADDED Requirements

### Requirement: LLM Settings API

The API SHALL expose project-scoped LLM settings endpoints under `/api/projects/:projectId/llm-settings`:

- `GET /builder` — returns the builder LLM settings as **non-secret metadata only**: `baseUrl`, `model`, a `configured` boolean (the effective config is usable), and, per field, `apiKeySet` (boolean) plus `apiKeySource` (`project` | `env` | `unset`). It SHALL NOT return any API key string, masked or otherwise.
- `PUT /builder` — updates `builderLlm` (accepts `baseUrl`, `apiKey`, `model`, each optional; when `apiKey` is provided it is encrypted and replaces the stored key; clearing a field removes the project override)
- `POST /builder/test-connection` — verifies connectivity against the **effective** builder configuration (project override merged with env fallback) by issuing a lightweight request to the configured endpoint
- `GET /agent` — returns the agent settings as **non-secret metadata only**: `baseUrl`, `model`, `systemPrompt`, a `configured` boolean, `apiKeySet`, and `apiKeySource`, or an unconfigured indicator. It SHALL NOT return any API key string, masked or otherwise.
- `PUT /agent` — creates/updates `agentLlm` (requires `baseUrl`, `model`, `systemPrompt`; `apiKey` required on first save, optional afterwards — omitting it preserves the stored key)
- `POST /agent/test-connection` — verifies connectivity against the agent configuration

API keys (whether sourced from a project override or from an environment secret such as `AGENT_API_KEY`) SHALL NEVER be returned in any form — not in plaintext, not masked, and not as a placeholder that reuses any characters of the key. Responses, UI placeholders, server logs, and test-connection error messages SHALL NOT contain key-derived material. Key presence and origin SHALL be communicated only via `apiKeySet`/`apiKeySource`, and any UI hint SHALL be a fixed, non-derived string (e.g. "Using AGENT_API_KEY" for env, "Project key stored" for an override). Base URLs SHALL be re-validated against the SSRF rules on every PUT and before every outbound test-connection request. All endpoints SHALL require admin session auth.

Per-project configuration state SHALL be exposed only on project-scoped, authenticated surfaces: the `GET /builder` and `GET /agent` responses carry the `configured` boolean, and `GET /api/projects/:projectId` MAY also include `builderConfigured` and `agentConfigured` for convenience. The global, unauthenticated `/api/config` route SHALL NOT carry per-project gating flags (it has no `projectId` and would be incorrect in a multi-project deployment). The frontend SHALL gate chat inputs and run buttons from the project-scoped flags.

#### Scenario: Save agent settings

- **WHEN** a PUT request to `/agent` provides `baseUrl`, `apiKey`, `model`, and `systemPrompt`
- **THEN** the API key is encrypted and stored in `agentLlm.encryptedApiKey`
- **AND** subsequent GETs return `apiKeySet: true` and `apiKeySource: "project"` with no key characters in the response

#### Scenario: Env-sourced key is never echoed

- **WHEN** a `GET /builder` is made for a project with no key override but with `AGENT_API_KEY` set in the environment
- **THEN** the response includes `apiKeySet: true` and `apiKeySource: "env"`
- **AND** the response body, and any UI placeholder derived from it, contain no characters of `AGENT_API_KEY`

#### Scenario: Update agent settings without changing the key

- **WHEN** a PUT request to `/agent` updates `systemPrompt` without providing `apiKey`
- **THEN** the existing encrypted API key is preserved

#### Scenario: Builder test connection uses effective config

- **WHEN** a POST request is made to `/builder/test-connection` for a project whose `builderLlm` sets only the model
- **THEN** the connectivity test runs against the env base URL and API key with the project's model
- **AND** a success or error result is returned

#### Scenario: Test connection blocked for SSRF-unsafe URL

- **WHEN** a test-connection request resolves a base URL to a private IP address
- **THEN** a 400 error is returned without making the outbound HTTP request

### Requirement: Builder LLM Settings Page

The frontend SHALL provide a Builder settings page at `/$projectId/settings/builder` with a card containing inline label–input rows for: OpenAI-compatible base URL, API key (password input), and model name. The base URL and model fields SHALL show their env-default value as placeholder text when no project override is set. The API key field SHALL NOT display any env or stored key material; instead it SHALL show a fixed, non-derived hint based on `apiKeySet`/`apiKeySource` (e.g. "Using AGENT_API_KEY" or "Project key stored"). The page SHALL provide a "Save" button and a "Test Connection" button. Test Connection SHALL first persist unsaved changes, then call `POST /api/projects/:projectId/llm-settings/builder/test-connection`, showing a success or error toast. Buttons SHALL be disabled with a loading indicator while operations are in flight. A "Reset to defaults" action SHALL clear the project overrides so the env configuration applies again.

#### Scenario: Override the builder model

- **WHEN** the user enters a model name and clicks "Save"
- **THEN** the project's `builderLlm.model` is persisted
- **AND** subsequent builder conversations in this project use the overridden model

#### Scenario: Test the builder connection

- **WHEN** the user clicks "Test Connection"
- **THEN** unsaved changes are persisted first
- **AND** the connectivity test runs against the effective configuration
- **AND** a success toast ("Connection is healthy") or error toast with the server message is shown

#### Scenario: Reset to env defaults

- **WHEN** the user activates "Reset to defaults"
- **THEN** the `builderLlm` overrides are cleared
- **AND** the fields show the env defaults as placeholders again

### Requirement: Agent Settings Page

The frontend SHALL provide an Agent settings page at `/$projectId/settings/agent` configuring the project's single agent. The page SHALL contain a card with inline label–input rows for: OpenAI-compatible base URL, API key (password input, showing a fixed non-derived hint based on `apiKeySet`/`apiKeySource` — never any key characters), and model name; and a card with the agent's system prompt (textarea). The page SHALL provide "Save" and "Test Connection" buttons with the same save-then-test behavior, disabled states, and loading indicators as the Builder settings page. While the agent is unconfigured, the page SHALL display an informational note that the Agent playground and test runs are unavailable until configuration is saved.

#### Scenario: Configure the agent for the first time

- **WHEN** the user fills in base URL, API key, model, and system prompt and clicks "Save"
- **THEN** the agent configuration is persisted with the key encrypted
- **AND** the Agent playground and test-run controls become available

#### Scenario: Test the agent connection

- **WHEN** the user clicks "Test Connection" with valid saved or unsaved settings
- **THEN** the settings are saved first and the connectivity test executes
- **AND** a success or error indicator is shown

#### Scenario: Editing preserves the stored key

- **WHEN** the user edits the system prompt and saves without entering a new API key
- **THEN** the existing encrypted key is preserved
