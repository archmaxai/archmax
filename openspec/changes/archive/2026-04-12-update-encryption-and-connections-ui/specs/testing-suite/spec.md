## MODIFIED Requirements

### Requirement: Test Agent Model

The system SHALL provide a `TestAgent` Mongoose model with the following fields: `name` (string, required), `project` (ObjectId ref to Project, required, indexed), `semanticModels` (array of strings -- semantic model names the agent can access), `systemPrompt` (string, required), `llmBaseUrl` (string, required -- OpenAI-compatible base URL), `encryptedApiKey` (string, required -- AES-256-GCM encrypted API key when `ENCRYPTION_KEY` is set, plaintext otherwise), `llmModel` (string, required -- model identifier), `deleted` (boolean, default false), `deletedAt` (Date, optional), `createdAt` (Date), `updatedAt` (Date). The model SHALL use the shared soft-delete plugin.

The `llmBaseUrl` field SHALL be validated to ensure it uses the `https://` protocol and does not resolve to a private, loopback, or link-local IP address (RFC 1918, `127.0.0.0/8`, `169.254.0.0/16`, `::1`, `fe80::/10`). URLs targeting `http://` SHALL only be accepted when the host is `localhost` or `127.0.0.1` (for local development). When `ENCRYPTION_KEY` is configured, the API key SHALL be encrypted with AES-256-GCM before storage. When `ENCRYPTION_KEY` is not configured, the API key SHALL be stored in plaintext to allow the feature to work without additional setup.

#### Scenario: Create a test agent with ENCRYPTION_KEY set

- **WHEN** a TestAgent is created with `name: "GPT-4o Agent"`, `project: "<projectId>"`, `semanticModels: ["ecommerce"]`, `systemPrompt: "You are a data analyst..."`, `llmBaseUrl: "https://api.openai.com/v1"`, API key `"sk-abc123"`, and `llmModel: "gpt-4o"`
- **AND** `ENCRYPTION_KEY` is configured
- **THEN** the API key is encrypted with AES-256-GCM using `ENCRYPTION_KEY` and stored as `encryptedApiKey`
- **AND** the agent is persisted in MongoDB

#### Scenario: Create a test agent without ENCRYPTION_KEY

- **WHEN** a TestAgent is created with an `apiKey` field
- **AND** the `ENCRYPTION_KEY` environment variable is not set
- **THEN** the API key is stored as plaintext in `encryptedApiKey`
- **AND** the agent is persisted in MongoDB

#### Scenario: Soft-delete a test agent

- **WHEN** a TestAgent is soft-deleted
- **THEN** the agent's `deleted` flag is set to true

#### Scenario: SSRF-unsafe llmBaseUrl rejected

- **WHEN** a TestAgent is created or updated with `llmBaseUrl` pointing to a private IP address (e.g., `http://169.254.169.254/`, `http://10.0.0.1/v1`, `http://192.168.1.1/v1`)
- **THEN** a 400 error is returned indicating that the URL targets a restricted address
