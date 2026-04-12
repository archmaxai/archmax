# testing-suite Specification

## Purpose
TBD - created by archiving change add-testing-suite. Update Purpose after archive.
## Requirements
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

### Requirement: Test Case Model

The system SHALL provide a `TestCase` Mongoose model with the following fields: `title` (string, required), `project` (ObjectId ref to Project, required, indexed), `testAgent` (ObjectId ref to TestAgent, optional), `semanticModel` (string, required), `inputMessage` (string, required), `expectedFacts` (array of strings, required, min 1), `tags` (array of strings, default empty, normalized to lowercase, trimmed), `maxToolCalls` (number, optional), `deleted` (boolean, default false), `deletedAt` (Date, optional), `createdAt` (Date), `updatedAt` (Date). The model SHALL use the shared soft-delete plugin.

#### Scenario: Create a test case

- **WHEN** a TestCase is created with `title: "Revenue 2025"`, `semanticModel: "ecommerce"`, `inputMessage: "What's the revenue for 2025?"`, `expectedFacts: ["Revenue is 1.65 MEUR"]`
- **THEN** the test case is persisted in MongoDB

#### Scenario: Create a test case with multiple expected facts

- **WHEN** a TestCase is created with `expectedFacts: ["Revenue is 1.65 MEUR", "Growth rate is 12%", "Top market is Germany"]`
- **THEN** all three facts are stored and each will be individually evaluated during a test run

#### Scenario: Create a test case without a test agent

- **WHEN** a TestCase is created without a `testAgent` (e.g. auto-generated by the semantic model agent when no agents exist)
- **THEN** the test case is persisted with `testAgent` set to null
- **AND** the test case appears in list queries but cannot be included in a batch run until a test agent is assigned

#### Scenario: Create a test case with a test agent via the builder

- **WHEN** a TestCase is created by the semantic model agent's `create_test_case` tool with a valid `testAgentId`
- **THEN** the test case is persisted with `testAgent` set to the referenced agent
- **AND** the test case is immediately eligible for inclusion in a batch run

### Requirement: Test Case CRUD API

The API SHALL expose CRUD endpoints for test cases at `/api/projects/:projectId/test-cases`:

- `GET /` — List all non-deleted test cases for the project (supports filtering by `agentId`, `semanticModel`, and `tags` query parameters)
- `POST /` — Create a new test case (accepts title, semanticModel, inputMessage, expectedFacts, tags, maxToolCalls; `testAgentId` is optional — when provided, validates the agent exists in the project)
- `PUT /:caseId` — Update an existing test case
- `DELETE /:caseId` — Soft-delete a test case

All endpoints SHALL require admin session auth.

#### Scenario: List test cases for a project

- **WHEN** a GET request is made to `/api/projects/:projectId/test-cases`
- **THEN** all non-deleted test cases are returned with title, semanticModel, inputMessage, expectedFacts, tags, and timestamps

#### Scenario: Create a test case without a test agent

- **WHEN** a POST request creates a test case without `testAgentId`
- **THEN** the test case is created with `testAgent` set to null
- **AND** the response includes all test case fields

#### Scenario: Create a test case with a test agent

- **WHEN** a POST request creates a test case with a valid `testAgentId`
- **THEN** the test agent existence is validated
- **AND** the test case is created with the `testAgent` reference set

#### Scenario: Delete a test case

- **WHEN** a DELETE request is made for a test case
- **THEN** the test case is soft-deleted and no longer appears in list queries

### Requirement: Playground Chat

The system SHALL provide an interactive playground chat where the user selects a test agent and converses with it. The playground agent SHALL be configured with the test agent's LLM settings (decrypted API key, base URL, model) and system prompt, and SHALL have access to MCP-style tools scoped to the test agent's selected semantic models:

- `list_semantic_models` — list available semantic models (filtered to agent's selected models)
- `get_semantic_model_overview` — get model overview (datasets, relationships, metrics)
- `get_dataset_fields` — get dataset fields with types, examples, and AI context
- `execute_query` — run read-only SQL queries via scoped DuckDB VIEWs

The tools SHALL read from the current development state of semantic models (YAML files on disk), not from any published snapshot. Playground conversations SHALL be persisted in the existing `Conversation` model with a `testAgent` reference field. Playground interactions SHALL NOT be logged to `McpCallLog`.

#### Scenario: Start a playground conversation

- **WHEN** the user selects a test agent and sends a message in the playground
- **THEN** a new Conversation is created with the `testAgent` field set to the agent's ID
- **AND** the agent is initialized with the test agent's LLM config and MCP-style tools
- **AND** the response streams via SSE using the same protocol as the semantic model builder

#### Scenario: Playground agent queries a semantic model

- **WHEN** the playground agent invokes `execute_query` with a model name and SQL
- **THEN** scoped VIEWs are created for the model's datasets (same pattern as MCP server)
- **AND** the query executes against the project's DuckDB instance
- **AND** results are returned to the agent

#### Scenario: Playground conversations excluded from access log

- **WHEN** the playground agent executes MCP-style tools
- **THEN** no entries are created in `McpCallLog`

#### Scenario: Resume a playground conversation

- **WHEN** the user selects a past playground conversation from the history
- **THEN** the conversation is loaded with full message and tool call history
- **AND** subsequent messages continue in the same conversation context

#### Scenario: Playground reuses chat UI components

- **WHEN** the playground renders a conversation
- **THEN** messages, tool call cards, markdown rendering, and streaming indicators use the same components as the semantic model builder chat (`agent-chat`, `tool-call-card`, `chat-input`, `markdown-components`)

### Requirement: Test Run Model

The system SHALL provide a `TestRun` Mongoose model representing a batch execution of test cases. Fields: `project` (ObjectId ref to Project, required), `testAgent` (ObjectId ref to TestAgent, required), `status` (enum: `pending`, `running`, `completed`, `failed`, required), `cases` (array of embedded results), `startedAt` (Date), `completedAt` (Date), `createdAt` (Date), `updatedAt` (Date). Each embedded case result SHALL contain: `testCase` (ObjectId ref to TestCase), `title` (string — snapshot of test case title), `semanticModel` (string), `inputMessage` (string), `expectedFacts` (array of strings), `maxToolCalls` (number, optional — snapshot of the limit at execution time), `status` (enum: `pending`, `running`, `passed`, `failed`, `error`), `agentResponse` (string — the agent's final text response), `toolCalls` (array of tool call records), `factResults` (array of `{ fact: string, passed: boolean, reasoning: string }`), `durationMs` (number), `errorMessage` (string, optional).

#### Scenario: Create a test run

- **WHEN** a batch run is initiated with a test agent and a set of test cases
- **THEN** a TestRun document is created with `status: "pending"` and each case embedded with `status: "pending"`
- **AND** `maxToolCalls` is snapshotted from each test case into the embedded result

#### Scenario: Test run completes successfully

- **WHEN** all test cases in a run finish processing
- **THEN** the TestRun status is set to `completed`
- **AND** `completedAt` is set

#### Scenario: Individual test case passes

- **WHEN** the judge evaluates the agent's response against the expected facts
- **AND** all facts are satisfied
- **THEN** the case result status is `passed` and each factResult has `passed: true`

#### Scenario: Individual test case fails

- **WHEN** the judge evaluates the agent's response and one or more expected facts are not satisfied
- **THEN** the case result status is `failed`
- **AND** the `factResults` array shows which facts passed and which did not, with reasoning

### Requirement: Test Run Batch Execution

The system SHALL execute test runs via a dedicated `test-runs` BullMQ queue processed by the worker (`apps/worker/`). When a batch run is initiated:

1. The API creates a `TestRun` document and enqueues one job per test case on the `test-runs` queue
2. Each job creates a playground-style agent with the test agent's LLM config, scoped to the test case's semantic model
3. The agent processes the input message and produces a response with tool calls
4. If `maxToolCalls` is set and the agent exceeds the limit, the runner aborts the agent loop and marks the case as `error` with message "Exceeded max tool calls (N)"
5. A judge LLM call evaluates each expected fact against the agent's response
6. The case result (status, response, tool calls, fact results, duration) is written to the `TestRun` document
7. When all cases complete, the `TestRun` status is updated to `completed`

The batch execution SHALL integrate with the existing worker infrastructure: same Redis connection, same graceful shutdown handling, same stalled job detection. When Redis is not configured, the API SHALL fall back to in-process execution (sequential).

#### Scenario: Batch run enqueues jobs via worker

- **GIVEN** Redis is configured and the worker is running
- **WHEN** a batch run is initiated with 5 test cases
- **THEN** 5 jobs are enqueued on the `test-runs` queue
- **AND** the worker processes them concurrently (up to `WORKER_CONCURRENCY`)

#### Scenario: Batch run without Redis falls back to in-process

- **GIVEN** `REDIS_URL` is not set
- **WHEN** a batch run is initiated
- **THEN** test cases are executed sequentially in the API process

#### Scenario: Test case execution error

- **WHEN** the agent pipeline fails for a test case (LLM error, timeout, etc.)
- **THEN** the case result status is set to `error` with the error message
- **AND** remaining test cases continue processing

#### Scenario: Fact evaluation via LLM judge

- **GIVEN** a test case with `expectedFacts: ["Revenue is 1.65 MEUR", "Growth rate is 12%"]`
- **WHEN** the agent responds with "The total revenue for 2025 was approximately 1.65 million EUR, representing a year-over-year growth of 12%."
- **THEN** the judge returns `[{ fact: "Revenue is 1.65 MEUR", passed: true, reasoning: "..." }, { fact: "Growth rate is 12%", passed: true, reasoning: "..." }]`

#### Scenario: Max tool calls exceeded

- **GIVEN** a test case with `maxToolCalls: 3`
- **WHEN** the agent invokes a 4th tool call during execution
- **THEN** the runner aborts the agent loop
- **AND** the case result status is set to `error` with errorMessage "Exceeded max tool calls (3)"
- **AND** the partial agent response and tool calls up to that point are preserved

### Requirement: Test Run API

The API SHALL expose endpoints for managing test runs at `/api/projects/:projectId/test-runs`:

- `GET /` — List all test runs for the project with server-side pagination (`page`, `limit` query params returning `{ items, total, page, limit }`); each item is a summary: id, testAgent name, case count, passed/failed/error counts, status, timestamps
- `GET /:runId` — Get a single test run with full case results (the full embedded cases array)
- `POST /` — Initiate a batch run (accepts `testCaseIds` array); returns the new TestRun ID
- `DELETE /:runId` — Delete a test run

All endpoints SHALL require admin session auth.

#### Scenario: List test runs with pagination

- **WHEN** a GET request is made to `/api/projects/:projectId/test-runs?page=1&limit=25`
- **THEN** up to 25 test run summaries are returned along with `total`, `page`, and `limit` fields

#### Scenario: Initiate a batch run

- **WHEN** a POST request is made with an array of `testCaseIds`
- **THEN** a TestRun is created and jobs are enqueued
- **AND** the response returns the TestRun ID and status `running`

#### Scenario: Poll test run progress

- **WHEN** a GET request is made for a running test run
- **THEN** the response includes the current status of each case (pending, running, passed, failed, error)
- **AND** completed cases include their full results

### Requirement: Testing UI — Test Agents Page

The frontend SHALL provide a Test Agents page at `/$projectId/testing/agents` displaying a table of all test agents with columns: name, semantic models (as badges), LLM model, base URL, and actions (edit, delete). A "Create Test Agent" button SHALL open a form dialog with fields: name, semantic model multi-select (from available project models), system prompt (textarea), OpenAI base URL, API key (password input), and model name. After creation, the API key is no longer visible. Editing a test agent allows changing all fields; the API key field shows a placeholder and only updates if a new value is entered. The "Test Connection" button SHALL be available in both create and edit mode. When triggered during creation, the dialog SHALL first save the agent via POST; on success it SHALL transition to edit mode with the returned entity and then execute the LLM connectivity test. If the save fails, the test is aborted and validation errors are displayed. The button SHALL be disabled while a save or test operation is in progress and SHALL display a loading indicator.

#### Scenario: Create a test agent via UI

- **WHEN** the user fills in the create form and submits
- **THEN** the test agent is created via the API
- **AND** the table refreshes to include the new agent
- **AND** the API key field is cleared and no longer retrievable

#### Scenario: Edit a test agent

- **WHEN** the user clicks edit on a test agent row
- **THEN** a form dialog opens with current values pre-filled (API key shows placeholder)
- **AND** submitting updates the agent via PUT

#### Scenario: Delete a test agent

- **WHEN** the user clicks delete and confirms
- **THEN** the agent is soft-deleted via the API and removed from the table

#### Scenario: Test connection during agent creation

- **WHEN** the user clicks "Test Connection" while creating a new test agent and all required fields are filled
- **THEN** the agent is saved via POST first
- **AND** the dialog transitions to edit mode with the newly created agent
- **AND** the LLM connectivity test executes against the saved agent
- **AND** a success or error indicator is shown

#### Scenario: Test connection during agent creation with validation error

- **WHEN** the user clicks "Test Connection" while creating a new agent with missing or invalid fields
- **THEN** the save fails with validation errors
- **AND** the connectivity test is not attempted

### Requirement: Testing UI — Test Cases Page

The frontend SHALL provide a Test Cases page at `/$projectId/testing/cases` displaying a paginated table of all test cases with columns: title, agent (badge), model (badge), input message (truncated), tags (badges), expected facts count, and actions (edit, delete). A "Create Test Case" button SHALL open a form dialog with fields: title, test agent, semantic model, input message, expected facts (dynamic list), tags (chip input), and max tool calls (optional number). A "Run Batch" button SHALL open a dialog with agent/model/tag filter controls and a live count of matching cases; on confirm, a batch run is initiated and the user is navigated to the test run detail page.

Filter controls above the table SHALL allow filtering by agent, semantic model, and tags. Filtering is server-side via query params.

The test case form dialog SHALL include a "Run Test" button in both create and edit mode. When clicked, the dialog SHALL first save the test case (create via POST or update via PUT), then initiate a single-case test run via the existing test-runs API (`POST /api/projects/:projectId/test-runs` with the saved case's ID). On successful run creation, the dialog SHALL close and the user SHALL be navigated to the test run detail page (`/$projectId/testing/runs/:runId`) to view live results. The "Run Test" button SHALL be disabled when no test agent is assigned (agent is required for execution) and while a save or run operation is in progress.

#### Scenario: Create a test case via UI

- **WHEN** the user fills in the create form with title, agent, model, input, at least one expected fact, optional tags, and optional max tool calls
- **THEN** the test case is created and appears in the table

#### Scenario: Filter test cases by tag

- **WHEN** the user selects a tag in the filter bar
- **THEN** only test cases with that tag are shown
- **AND** the page resets to page 1

#### Scenario: Run a batch from the test cases page

- **WHEN** the user clicks "Run Batch", optionally adjusts agent/model/tag filters in the dialog, and confirms
- **THEN** a test run is initiated via the API with the matching case IDs
- **AND** the user is navigated to `/$projectId/testing/runs/:runId` showing live progress

#### Scenario: Run test during test case creation

- **WHEN** the user clicks "Run Test" while creating a new test case with all required fields and a test agent assigned
- **THEN** the test case is saved via POST first
- **AND** a single-case test run is initiated via the test-runs API
- **AND** the dialog closes and the user is navigated to `/$projectId/testing/runs/:runId`

#### Scenario: Run test during test case editing

- **WHEN** the user clicks "Run Test" while editing an existing test case
- **THEN** the test case is updated via PUT first
- **AND** a single-case test run is initiated via the test-runs API
- **AND** the dialog closes and the user is navigated to `/$projectId/testing/runs/:runId`

#### Scenario: Run test disabled without agent

- **WHEN** the test case form has no test agent selected
- **THEN** the "Run Test" button is disabled
- **AND** a tooltip or visual cue indicates that an agent is required

#### Scenario: Run test button disabled during operation

- **WHEN** a save or run operation is in progress
- **THEN** the "Run Test" button is disabled and shows a loading spinner

### Requirement: Testing UI — Playground Page

The frontend SHALL provide a Playground page at `/$projectId/testing/playground` with a test agent selector and a chat interface. The chat interface SHALL reuse the existing chat components (`AgentChat`, `ToolCallCard`, `ChatInput`, `MarkdownContent`) adapted to work with playground conversations. The sidebar SHALL show past playground conversations for the selected test agent. Tool calls (list_semantic_models, get_semantic_model_overview, get_dataset_fields, execute_query) SHALL be rendered with the same card-based visualization as the semantic model builder. The playground conversation list API response SHALL include an `isStreaming` boolean per item. The sidebar SHALL display an animated spinner icon instead of the static message icon for conversations that are actively streaming, matching the behavior of the Semantic Models chat sidebar.

#### Scenario: Select a test agent and start chatting

- **WHEN** the user selects a test agent from the dropdown
- **THEN** past playground conversations for that agent are shown in the sidebar
- **AND** the user can start a new conversation or resume an existing one

#### Scenario: Tool calls displayed in playground

- **WHEN** the playground agent invokes `execute_query`
- **THEN** the tool call card shows the SQL query with syntax highlighting and result table (same as semantic model builder)

#### Scenario: Switch test agent

- **WHEN** the user selects a different test agent from the dropdown
- **THEN** the conversation history updates to show only conversations for the newly selected agent
- **AND** a new chat session is started (no conversation pre-selected)

#### Scenario: Active streaming conversation shown in playground sidebar

- **WHEN** a playground conversation has an active streaming session
- **AND** the user views the playground sidebar
- **THEN** the sidebar entry for that conversation displays an animated spinning icon instead of the static message icon
- **AND** the icon reverts to the static message icon once streaming completes and the next poll cycle refreshes the list

### Requirement: Testing UI — Test Runs List Page

The frontend SHALL provide a Test Runs page at `/$projectId/testing/runs` displaying a server-side-paginated table of all test runs for the project. Columns: status icon, agent name, case count, result summary (passed/failed/errors as badges), date. Each row links to the run detail page at `/$projectId/testing/runs/:runId`. The page auto-refreshes while any run is in `pending` or `running` status.

#### Scenario: View test runs list

- **WHEN** the user navigates to `/$projectId/testing/runs`
- **THEN** a paginated table of test runs is displayed with status, agent, case count, pass/fail/error counts, and timestamps

#### Scenario: Navigate to run detail

- **WHEN** the user clicks a test run row
- **THEN** the browser navigates to `/$projectId/testing/runs/:runId`

#### Scenario: Empty state

- **WHEN** no test runs exist for the project
- **THEN** an empty state message is shown prompting the user to run a test batch from the Test Cases page

### Requirement: Testing UI — Test Run Detail Page

The frontend SHALL provide a Test Run Detail page at `/$projectId/testing/runs/:runId` showing run metadata (agent name, status, started/completed timestamps, overall pass/fail counts) and a client-side-paginated list of case results. Each case result shows: status icon, title, semantic model badge, input message, agent response (expandable), tool calls (expandable), fact results with pass/fail icons and reasoning, duration, and error message if applicable. The page auto-refreshes (polls every 3 seconds) while the run status is `pending` or `running`. A back link returns to the Test Runs list.

When a test case has `failed` or `error` status, the expanded detail view SHALL display a "Fix in Chat" button. Clicking the button SHALL navigate the user to `/$projectId/models/chat/new` with a `prefill` search parameter containing a structured correction prompt. The prompt SHALL include:
- The semantic model name the test targeted
- The original input message (the question that was asked)
- The expected facts, indicating which passed and which failed along with the judge's reasoning
- A summary of the agent's actual response

The button SHALL use a secondary/outline visual style with a message-circle icon to indicate it opens a chat session. The button SHALL appear within the expanded case card, below the tabs section.

Additionally, a "Refine" button SHALL appear for all completed test cases (passed, failed, or error). The "Refine" button SHALL navigate to the same chat route with a different prefill prompt focused on model efficiency: improving ai_context descriptions, simplifying naming, adding missing relationships, or reorganizing structure so the agent can answer with fewer tool calls. The "Refine" button SHALL use a wand icon.

#### Scenario: View completed run detail

- **WHEN** the user navigates to a completed test run detail page
- **THEN** run metadata is shown at the top (agent, status, timestamps, pass/fail summary)
- **AND** case results are listed below with client-side pagination
- **AND** each case shows its full status, response, tool calls, and fact evaluations

#### Scenario: View in-progress run detail

- **WHEN** the user navigates to a running test run detail page
- **THEN** the page polls for updates every 3 seconds
- **AND** case results update in real-time as they complete (pending -> running -> passed/failed/error)
- **AND** the overall status badge updates when the run completes

#### Scenario: Paginate case results

- **WHEN** the run has more than 25 case results
- **THEN** pagination controls are shown below the case list
- **AND** the user can navigate between pages of results

#### Scenario: Navigate back to runs list

- **WHEN** the user clicks the back link on the detail page
- **THEN** the browser navigates to `/$projectId/testing/runs`

#### Scenario: Fix failing test case via chat

- **WHEN** a test case has status `failed` or `error`
- **AND** the user expands the case result card
- **THEN** a "Fix in Chat" button is displayed below the tabs section
- **AND** clicking the button navigates to `/$projectId/models/chat/new?prefill=<prompt>`
- **AND** the prefill prompt includes the semantic model name, input message, failed expected facts with reasoning, and the agent's response summary

#### Scenario: Refine model via chat for any completed case

- **WHEN** a test case has status `passed`, `failed`, or `error`
- **AND** the user expands the case result card
- **THEN** a "Refine" button is displayed below the tabs section
- **AND** clicking the button navigates to `/$projectId/models/chat/new?prefill=<prompt>`
- **AND** the prefill prompt focuses on improving the semantic model's navigability: ai_context, naming, relationships, and structure to reduce tool calls

#### Scenario: Fix button only shown for failing test cases

- **WHEN** a test case has status `failed` or `error`
- **THEN** a "Fix in Chat" button is displayed alongside the "Refine" button

#### Scenario: No action buttons for pending or running cases

- **WHEN** a test case has status `pending` or `running`
- **THEN** no "Fix in Chat" or "Refine" buttons are displayed in the expanded detail view

