## MODIFIED Requirements

### Requirement: Test Agent Model

The system SHALL provide a `TestAgent` Mongoose model with the following fields: `name` (string, required), `project` (ObjectId ref to Project, required, indexed), `semanticModels` (array of strings — semantic model names the agent can access), `systemPrompt` (string, required), `llmBaseUrl` (string, required — OpenAI-compatible base URL), `encryptedApiKey` (string, required — AES-256-GCM encrypted API key), `llmModel` (string, required — model identifier), `deleted` (boolean, default false), `deletedAt` (Date, optional), `createdAt` (Date), `updatedAt` (Date). The model SHALL use the shared soft-delete plugin.

The `llmBaseUrl` field SHALL be validated to ensure it uses the `https://` protocol and does not resolve to a private, loopback, or link-local IP address (RFC 1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fe80::/10`). URLs targeting `http://` SHALL only be accepted when the host is `localhost` or `127.0.0.1` (for local development). The API SHALL reject API key storage when `ENCRYPTION_KEY` is not configured, returning a 400 error rather than storing the key in plaintext.

#### Scenario: Create a test agent

- **WHEN** a TestAgent is created with `name: "GPT-4o Agent"`, `project: "<projectId>"`, `semanticModels: ["ecommerce"]`, `systemPrompt: "You are a data analyst..."`, `llmBaseUrl: "https://api.openai.com/v1"`, API key `"sk-abc123"`, and `llmModel: "gpt-4o"`
- **THEN** the API key is encrypted with AES-256-GCM using `ENCRYPTION_KEY` and stored as `encryptedApiKey`
- **AND** the agent is persisted in MongoDB

#### Scenario: Soft-delete a test agent

- **WHEN** a TestAgent is soft-deleted
- **THEN** the agent's `deleted` flag is set to true

#### Scenario: SSRF-unsafe llmBaseUrl rejected

- **WHEN** a TestAgent is created or updated with `llmBaseUrl` pointing to a private IP address (e.g., `http://169.254.169.254/`, `http://10.0.0.1/v1`, `http://192.168.1.1/v1`)
- **THEN** a 400 error is returned indicating that the URL targets a restricted address

#### Scenario: API key rejected without ENCRYPTION_KEY

- **WHEN** a TestAgent is created with an `apiKey` field
- **AND** the `ENCRYPTION_KEY` environment variable is not set
- **THEN** a 400 error is returned indicating that `ENCRYPTION_KEY` is required for API key storage
- **AND** no plaintext key is written to MongoDB

### Requirement: Test Agent CRUD API

The API SHALL expose CRUD endpoints for test agents at `/api/projects/:projectId/test-agents`:

- `GET /` — List all non-deleted test agents for the project (name, semanticModels, systemPrompt, llmBaseUrl, llmModel, createdAt; never the API key)
- `GET /:agentId` — Get a single test agent (same fields as list; API key returned as masked string e.g. `sk-...****`)
- `POST /` — Create a new test agent (accepts name, semanticModels, systemPrompt, llmBaseUrl, apiKey, llmModel; encrypts and stores the API key)
- `PUT /:agentId` — Update a test agent (all fields except apiKey are updatable; if `apiKey` is provided, re-encrypt and replace)
- `POST /:agentId/test-connection` — Test connectivity to the configured LLM endpoint. The endpoint SHALL validate the resolved IP address of `llmBaseUrl` against the same SSRF restrictions before making the outbound request.
- `DELETE /:agentId` — Soft-delete a test agent

All endpoints SHALL require admin session auth.

#### Scenario: Create a test agent and verify API key is hidden

- **WHEN** a POST request creates a test agent with `apiKey: "sk-live-abc123"`
- **THEN** the response includes all agent fields
- **AND** the `apiKey` field is NOT included in the response (shown only in the creation confirmation)
- **AND** subsequent GET requests return the API key as a masked string

#### Scenario: Update a test agent without changing API key

- **WHEN** a PUT request updates the `systemPrompt` without providing `apiKey`
- **THEN** the existing encrypted API key is preserved

#### Scenario: Update a test agent's API key

- **WHEN** a PUT request includes a new `apiKey` value
- **THEN** the old encrypted key is replaced with the newly encrypted value

#### Scenario: List test agents for a project

- **WHEN** a GET request is made to `/api/projects/:projectId/test-agents`
- **THEN** all non-deleted test agents are returned with name, semanticModels, llmBaseUrl, llmModel, and createdAt
- **AND** no API key or encrypted key data is included

#### Scenario: Test connection validates URL before request

- **WHEN** a POST request is made to `/:agentId/test-connection`
- **AND** the agent's `llmBaseUrl` resolves to a private IP address
- **THEN** a 400 error is returned without making the outbound HTTP request
