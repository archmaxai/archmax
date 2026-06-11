## REMOVED Requirements

### Requirement: Test Agent Model

**Reason**: The platform no longer supports multiple test agents — each project has exactly one agent, configured as the `agentLlm` subdocument on the Project (see `project-management` deltas).
**Migration**: A schema migration soft-deletes all existing `TestAgent` documents. The user reconfigures the single project agent manually under Settings → Agent. The SSRF validation and AES-256-GCM encryption rules carry over to the `agentLlm`/`builderLlm` subdocuments.

### Requirement: Test Agent CRUD API

**Reason**: The `/api/projects/:projectId/test-agents` endpoints are removed along with the model. Agent configuration is managed via the LLM Settings API (see `project-management` deltas).
**Migration**: Frontend callers move to `GET/PUT /api/projects/:projectId/llm-settings/agent` and its test-connection endpoint.

### Requirement: Testing UI — Test Agents Page

**Reason**: With a single project agent there is no agent list to manage. The page is removed from the Testing group.
**Migration**: `/$projectId/testing/agents` redirects to `/$projectId/settings/agent`, where the agent's LLM credentials, model, and system prompt are configured.

## RENAMED Requirements

- FROM: `### Requirement: Testing UI — Playground Page`
- TO: `### Requirement: Agent Playground Page`

## MODIFIED Requirements

### Requirement: Agent Playground Page

The frontend SHALL provide the Agent page at `/$projectId/agent` with a chat interface for conversing with the project agent. There SHALL be no agent selector — the page always uses the single project agent. The chat interface SHALL reuse the existing chat components (`AgentChat`, `ToolCallCard`, `ChatInput`, `MarkdownContent`) adapted to work with playground conversations. A history panel SHALL show past playground conversations for the project. Tool calls (list_semantic_models, get_semantic_model_overview, get_dataset_fields, execute_query) SHALL be rendered with the same card-based visualization as the semantic model builder. The playground conversation list API response SHALL include an `isStreaming` boolean per item. The history panel SHALL display an animated spinner icon instead of the static message icon for conversations that are actively streaming, matching the behavior of the Builder chat sidebar.

When the project agent is not configured, the page SHALL display an empty state explaining that the agent must be configured first, with a link/button to `/$projectId/settings/agent`, and the chat input SHALL be disabled.

The former route `/$projectId/testing/playground` SHALL redirect to `/$projectId/agent`.

#### Scenario: Chat with the project agent

- **WHEN** the user opens `/$projectId/agent` with a configured agent
- **THEN** past playground conversations are shown in the history panel
- **AND** the user can start a new conversation or resume an existing one

#### Scenario: Tool calls displayed in playground

- **WHEN** the playground agent invokes `execute_query`
- **THEN** the tool call card shows the SQL query with syntax highlighting and result table (same as semantic model builder)

#### Scenario: Unconfigured agent empty state

- **WHEN** the user opens `/$projectId/agent` and the project agent is not configured
- **THEN** an empty state explains that the agent needs LLM credentials
- **AND** a link navigates to `/$projectId/settings/agent`
- **AND** the chat input is disabled

#### Scenario: Active streaming conversation shown in history panel

- **WHEN** a playground conversation has an active streaming session
- **AND** the user views the history panel
- **THEN** the entry for that conversation displays an animated spinning icon instead of the static message icon
- **AND** the icon reverts to the static message icon once streaming completes and the next poll cycle refreshes the list

### Requirement: Playground Chat

The system SHALL provide an interactive playground chat where the user converses with **the project agent**. The playground agent SHALL be configured from the project's `agentLlm` settings (decrypted API key, base URL, model) and the configured system prompt, and SHALL have access to MCP-style tools scoped to **all of the project's semantic models**:

- `list_semantic_models` — list available semantic models
- `get_semantic_model_overview` — get model overview (datasets, relationships, metrics)
- `get_dataset_fields` — get dataset fields with types, examples, and AI context
- `execute_query` — run read-only SQL queries via scoped DuckDB VIEWs

The tools SHALL read from the current development state of semantic models (YAML files on disk), not from any published snapshot. Playground conversations SHALL be persisted in the existing `Conversation` model and identified by a `playground: true` flag; legacy conversations referencing a deleted `testAgent` SHALL remain readable. Playground interactions SHALL NOT be logged to `McpCallLog`.

Conversation histories SHALL be partitioned by the `playground` flag so that playground chats never leak into the Builder (Build) history and vice versa. The Agent page history list and load endpoints SHALL return only conversations where `playground: true`. The Builder (Build) conversation list and load endpoints SHALL return only conversations where `playground` is absent or `false` (i.e. `playground: { $ne: true }`); the prior `testAgent: null` filter is insufficient because playground conversations also have no `testAgent`. A conversation loaded through the wrong surface (e.g. a playground conversation id requested by the Builder load endpoint) SHALL return 404.

When the project agent is not configured (no `agentLlm` settings), the playground chat endpoint SHALL reject messages with a 400 error indicating that the agent must be configured under Settings → Agent.

#### Scenario: Playground conversations excluded from Builder history

- **WHEN** a project has both Builder conversations and playground conversations (`playground: true`)
- **THEN** the Builder conversation list returns only the non-playground conversations
- **AND** the Agent page history returns only the `playground: true` conversations

#### Scenario: Cross-surface load is rejected

- **WHEN** the Builder load endpoint is called with the id of a `playground: true` conversation
- **THEN** the endpoint responds 404 (and the same applies to the Agent endpoint loading a non-playground conversation)

#### Scenario: Start a playground conversation

- **WHEN** the user sends a message in the playground and the project agent is configured
- **THEN** a new Conversation is created with `playground: true`
- **AND** the agent is initialized with the project agent's LLM config and MCP-style tools
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

#### Scenario: Playground blocked while agent unconfigured

- **WHEN** the user sends a playground message and the project has no `agentLlm` configuration
- **THEN** the API responds with a 400 error stating the agent must be configured under Settings → Agent

### Requirement: Test Case Model

The system SHALL provide a `TestCase` Mongoose model with the following fields: `title` (string, required), `project` (ObjectId ref to Project, required, indexed), `semanticModel` (string, required), `inputMessage` (string, required), `expectedFacts` (array of strings, required, min 1), `tags` (array of strings, default empty, normalized to lowercase, trimmed), `maxToolCalls` (number, optional), `deleted` (boolean, default false), `deletedAt` (Date, optional), `createdAt` (Date), `updatedAt` (Date). The model SHALL use the shared soft-delete plugin. The model SHALL NOT have a `testAgent` reference — test cases always execute with the single project agent.

#### Scenario: Create a test case

- **WHEN** a TestCase is created with `title: "Revenue 2025"`, `semanticModel: "ecommerce"`, `inputMessage: "What's the revenue for 2025?"`, `expectedFacts: ["Revenue is 1.65 MEUR"]`
- **THEN** the test case is persisted in MongoDB

#### Scenario: Create a test case with multiple expected facts

- **WHEN** a TestCase is created with `expectedFacts: ["Revenue is 1.65 MEUR", "Growth rate is 12%", "Top market is Germany"]`
- **THEN** all three facts are stored and each will be individually evaluated during a test run

#### Scenario: Legacy testAgent reference removed by migration

- **WHEN** the drop-test-agents schema migration runs against a database containing test cases with a `testAgent` reference
- **THEN** the `testAgent` field is unset on all test cases
- **AND** the test cases remain otherwise unchanged and eligible for runs with the project agent

### Requirement: Test Case CRUD API

The API SHALL expose CRUD endpoints for test cases at `/api/projects/:projectId/test-cases`:

- `GET /` — List all non-deleted test cases for the project (supports filtering by `semanticModel` and `tags` query parameters)
- `POST /` — Create a new test case (accepts title, semanticModel, inputMessage, expectedFacts, tags, maxToolCalls)
- `PUT /:caseId` — Update an existing test case
- `DELETE /:caseId` — Soft-delete a test case

The endpoints SHALL NOT accept or filter by a test agent reference. All endpoints SHALL require admin session auth.

#### Scenario: List test cases for a project

- **WHEN** a GET request is made to `/api/projects/:projectId/test-cases`
- **THEN** all non-deleted test cases are returned with title, semanticModel, inputMessage, expectedFacts, tags, and timestamps

#### Scenario: Create a test case

- **WHEN** a POST request creates a test case with valid fields
- **THEN** the test case is created and the response includes all test case fields

#### Scenario: Delete a test case

- **WHEN** a DELETE request is made for a test case
- **THEN** the test case is soft-deleted and no longer appears in list queries

### Requirement: Test Run Model

The system SHALL provide a `TestRun` Mongoose model representing a batch execution of test cases. Fields: `project` (ObjectId ref to Project, required), `llmModel` (string — snapshot of the project agent's model identifier at run start), `testAgent` (ObjectId, optional — legacy field retained so historical runs remain readable; not set on new runs), `testAgentName` (string, optional — denormalized snapshot of the legacy agent's name, backfilled by the single-agent migration before the `TestAgent` documents are soft-deleted so run lists never depend on populating a deleted reference; not set on new runs), `status` (enum: `pending`, `running`, `completed`, `failed`, `cancelled`, required), `cases` (array of embedded results), `startedAt` (Date), `completedAt` (Date), `createdAt` (Date), `updatedAt` (Date). Each embedded case result SHALL contain: `testCase` (ObjectId ref to TestCase), `title` (string — snapshot of test case title), `semanticModel` (string), `inputMessage` (string), `expectedFacts` (array of strings), `maxToolCalls` (number, optional — snapshot of the limit at execution time), `status` (enum: `pending`, `running`, `passed`, `failed`, `error`, `cancelled`), `agentResponse` (string — the agent's final text response), `toolCalls` (array of tool call records), `factResults` (array of `{ fact: string, passed: boolean, reasoning: string }`), `durationMs` (number), `errorMessage` (string, optional).

#### Scenario: Create a test run

- **WHEN** a batch run is initiated with a set of test cases and the project agent is configured
- **THEN** a TestRun document is created with `status: "pending"`, `llmModel` snapshotted from the project agent config, and each case embedded with `status: "pending"`
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

#### Scenario: Test run is cancelled

- **WHEN** the user cancels a running or pending test run
- **THEN** the TestRun status is set to `cancelled` and `completedAt` is set
- **AND** all cases still in `pending` status are marked as `cancelled`
- **AND** any in-flight cases (`running` status) are aborted and marked as `cancelled` with partial results preserved

#### Scenario: Historical run with legacy agent reference remains readable

- **WHEN** a TestRun created before the single-agent migration is fetched
- **THEN** the run and its embedded case results are returned unchanged
- **AND** the legacy `testAgent` reference does not block reading or deleting the run

### Requirement: Test Run Batch Execution

The system SHALL execute test runs via a dedicated `test-runs` BullMQ queue processed by the worker (`apps/worker/`). When a batch run is initiated:

1. The API verifies the project agent is configured (`agentLlm` present); otherwise it rejects with 400
2. The API creates a `TestRun` document and enqueues one job per test case on the `test-runs` queue
3. Each job creates a playground-style agent with the project agent's LLM config, scoped to the test case's semantic model
4. The agent processes the input message and produces a response with tool calls
5. If `maxToolCalls` is set and the agent exceeds the limit, the runner aborts the agent loop and marks the case as `error` with message "Exceeded max tool calls (N)"
6. A judge LLM call evaluates each expected fact against the agent's response
7. The case result (status, response, tool calls, fact results, duration) is written to the `TestRun` document
8. When all cases complete, the `TestRun` status is updated to `completed`

The batch execution SHALL integrate with the existing worker infrastructure: same Redis connection, same graceful shutdown handling, same stalled job detection. When Redis is not configured, the API SHALL fall back to in-process execution (sequential).

When a test run is cancelled, the system SHALL cooperatively abort in-flight test cases. In the Redis/worker path, the worker SHALL subscribe to a per-test-run cancel channel and abort the agent stream via `AbortController`. Queued BullMQ jobs that have not started SHALL be removed from the queue. In the in-process (no Redis) path, the sequential loop SHALL check a cancellation flag between cases and skip remaining ones.

#### Scenario: Batch run enqueues jobs via worker

- **GIVEN** Redis is configured, the worker is running, and the project agent is configured
- **WHEN** a batch run is initiated with 5 test cases
- **THEN** 5 jobs are enqueued on the `test-runs` queue
- **AND** the worker processes them concurrently (up to `WORKER_CONCURRENCY`)

#### Scenario: Batch run rejected while agent unconfigured

- **WHEN** a batch run is initiated for a project without `agentLlm` configuration
- **THEN** the API responds with 400 and an error directing the user to configure the agent under Settings → Agent
- **AND** no TestRun document is created

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

#### Scenario: Cancel aborts in-flight worker jobs

- **GIVEN** a test run with 10 cases, 3 currently running in the worker, 5 still queued
- **WHEN** the cancel endpoint is called
- **THEN** the 5 queued BullMQ jobs are removed from the queue
- **AND** the 3 running cases receive an abort signal and terminate their LLM streams
- **AND** all 8 non-completed cases are marked as `cancelled`
- **AND** the 2 already-completed cases retain their original status

#### Scenario: Cancel stops in-process sequential execution

- **GIVEN** `REDIS_URL` is not set and a test run is executing in-process
- **WHEN** the cancel endpoint is called while case 3 of 10 is running
- **THEN** cases 4 through 10 are skipped
- **AND** case 3 completes (or is marked `cancelled` if still in the agent stream)
- **AND** the run status is set to `cancelled`

### Requirement: Test Run API

The API SHALL expose endpoints for managing test runs at `/api/projects/:projectId/test-runs`:

- `GET /` -- List all test runs for the project with server-side pagination (`page`, `limit` query params returning `{ items, total, page, limit }`); each item is a summary: id, `llmModel` snapshot for new runs, case count, passed/failed/error counts, status, timestamps. For legacy runs lacking `llmModel`, the summary SHALL surface the denormalized `testAgentName` snapshot, falling back to a neutral `"Legacy agent"` label when neither is present. The endpoint SHALL NOT populate the soft-deleted `testAgent` reference.
- `GET /:runId` -- Get a single test run with full case results (the full embedded cases array)
- `POST /` -- Initiate a batch run (accepts `testCaseIds` array); rejects with 400 when the project agent is not configured; returns the new TestRun ID
- `POST /:runId/cancel` -- Cancel a running or pending test run; marks remaining cases as `cancelled`, aborts in-flight executions, and sets the run status to `cancelled`
- `DELETE /:runId` -- Delete a test run

All endpoints SHALL require admin session auth.

#### Scenario: List test runs with pagination

- **WHEN** a GET request is made to `/api/projects/:projectId/test-runs?page=1&limit=25`
- **THEN** up to 25 test run summaries are returned along with `total`, `page`, and `limit` fields

#### Scenario: Initiate a batch run

- **WHEN** a POST request is made with an array of `testCaseIds` and the project agent is configured
- **THEN** a TestRun is created and jobs are enqueued
- **AND** the response returns the TestRun ID and status `running`

#### Scenario: Initiate rejected while agent unconfigured

- **WHEN** a POST request is made with `testCaseIds` for a project without agent configuration
- **THEN** a 400 error is returned directing the user to Settings → Agent

#### Scenario: Poll test run progress

- **WHEN** a GET request is made for a running test run
- **THEN** the response includes the current status of each case (pending, running, passed, failed, error)
- **AND** completed cases include their full results

#### Scenario: Cancel a running test run

- **WHEN** a POST request is made to `/:runId/cancel` for a run with status `running`
- **THEN** the run status is set to `cancelled` and `completedAt` is set
- **AND** all `pending` cases are marked as `cancelled`
- **AND** in-flight cases are signaled for abort
- **AND** the response returns `{ ok: true }`

#### Scenario: Cancel a non-active test run

- **WHEN** a POST request is made to `/:runId/cancel` for a run with status `completed`, `failed`, or `cancelled`
- **THEN** a 400 error is returned indicating the run is not active

### Requirement: Testing UI — Test Cases Page

The frontend SHALL provide a Test Cases page at `/$projectId/testing/cases` displaying a paginated table of all test cases with columns: title, model (badge), input message (truncated), tags (badges), expected facts count, and actions (edit, delete). A "Create Test Case" button SHALL open a form dialog with fields: title, semantic model, input message, expected facts (dynamic list), tags (chip input), and max tool calls (optional number). A "Run Batch" button SHALL open a dialog with model/tag filter controls and a live count of matching cases; on confirm, a batch run is initiated and the user is navigated to the test run detail page.

There SHALL be no test-agent column, selector, or filter anywhere on the page — all executions use the project agent. Filter controls above the table SHALL allow filtering by semantic model and tags. Filtering is server-side via query params.

The test case form dialog SHALL include a "Run Test" button in both create and edit mode. When clicked, the dialog SHALL first save the test case (create via POST or update via PUT), then initiate a single-case test run via the existing test-runs API (`POST /api/projects/:projectId/test-runs` with the saved case's ID). On successful run creation, the dialog SHALL close and the user SHALL be navigated to the test run detail page (`/$projectId/testing/runs/:runId`) to view live results. The "Run Test" and "Run Batch" buttons SHALL be disabled when the project agent is not configured (with a cue pointing to Settings → Agent) and while a save or run operation is in progress.

#### Scenario: Create a test case via UI

- **WHEN** the user fills in the create form with title, model, input, at least one expected fact, optional tags, and optional max tool calls
- **THEN** the test case is created and appears in the table

#### Scenario: Filter test cases by tag

- **WHEN** the user selects a tag in the filter bar
- **THEN** only test cases with that tag are shown
- **AND** the page resets to page 1

#### Scenario: Run a batch from the test cases page

- **WHEN** the user clicks "Run Batch", optionally adjusts model/tag filters in the dialog, and confirms
- **THEN** a test run is initiated via the API with the matching case IDs
- **AND** the user is navigated to `/$projectId/testing/runs/:runId` showing live progress

#### Scenario: Run test during test case creation

- **WHEN** the user clicks "Run Test" while creating a new test case with all required fields and the project agent is configured
- **THEN** the test case is saved via POST first
- **AND** a single-case test run is initiated via the test-runs API
- **AND** the dialog closes and the user is navigated to `/$projectId/testing/runs/:runId`

#### Scenario: Run test during test case editing

- **WHEN** the user clicks "Run Test" while editing an existing test case
- **THEN** the test case is updated via PUT first
- **AND** a single-case test run is initiated via the test-runs API
- **AND** the dialog closes and the user is navigated to `/$projectId/testing/runs/:runId`

#### Scenario: Run controls disabled while agent unconfigured

- **WHEN** the project agent is not configured
- **THEN** the "Run Test" and "Run Batch" buttons are disabled
- **AND** a tooltip or visual cue directs the user to Settings → Agent

#### Scenario: Run test button disabled during operation

- **WHEN** a save or run operation is in progress
- **THEN** the "Run Test" button is disabled and shows a loading spinner

### Requirement: Testing UI — Test Runs List Page

The frontend SHALL provide a Test Runs page at `/$projectId/testing/runs` displaying a server-side-paginated table of all test runs for the project. Columns: status icon, model (the run's `llmModel` snapshot, or the `testAgentName` snapshot for pre-migration runs, falling back to a `"Legacy agent"` label), case count, result summary (passed/failed/errors as badges), date. Each row links to the run detail page at `/$projectId/testing/runs/:runId`. The page auto-refreshes while any run is in `pending` or `running` status.

The `cancelled` status SHALL be displayed with a neutral grey icon (ban/slash) consistent with the detail page styling.

#### Scenario: View test runs list

- **WHEN** the user navigates to `/$projectId/testing/runs`
- **THEN** a paginated table of test runs is displayed with status, model, case count, pass/fail/error counts, and timestamps

#### Scenario: Navigate to run detail

- **WHEN** the user clicks a test run row
- **THEN** the browser navigates to `/$projectId/testing/runs/:runId`

#### Scenario: Empty state

- **WHEN** no test runs exist for the project
- **THEN** an empty state message is shown prompting the user to run a test batch from the Test Cases page

#### Scenario: Cancelled run displayed in list

- **WHEN** a cancelled test run exists
- **THEN** it is displayed with a neutral grey ban icon and the status text "Cancelled"

### Requirement: Testing UI — Test Run Detail Page

The frontend SHALL provide a Test Run Detail page at `/$projectId/testing/runs/:runId` showing run metadata (model — the `llmModel` snapshot, or the `testAgentName` snapshot for pre-migration runs, falling back to a `"Legacy agent"` label — status, started/completed timestamps, overall pass/fail counts) and a client-side-paginated list of case results. Each case result shows: status icon, title, semantic model badge, input message, agent response (expandable), tool calls (expandable), fact results with pass/fail icons and reasoning, duration, and error message if applicable. The page auto-refreshes (polls every 3 seconds) while the run status is `pending` or `running`. A back link returns to the Test Runs list.

A "Cancel Run" button SHALL be displayed in the page header next to the status badge when the run status is `pending` or `running`. Clicking the button SHALL call `POST /api/projects/:projectId/test-runs/:runId/cancel`. On success, the button SHALL disappear and the status badge SHALL update to `cancelled`. The button SHALL be disabled while the cancel request is in progress and SHALL display a loading indicator.

The `cancelled` run status SHALL be rendered as a grey/neutral badge with text "Cancelled". Individual cases with `cancelled` status SHALL display a ban/slash icon in neutral grey.

A "Refine" button SHALL appear for all completed test cases (passed, failed, or error). The "Refine" button SHALL navigate to `/$projectId/models/chat/new` with a `prefill` search parameter containing a prompt focused on model efficiency: improving ai_context descriptions, simplifying naming, adding missing relationships, or reorganizing structure so the agent can answer with fewer tool calls. The "Refine" button SHALL use a wand icon and an outline visual style. The button SHALL appear within the expanded case card, below the tabs section.

#### Scenario: View completed run detail

- **WHEN** the user navigates to a completed test run detail page
- **THEN** run metadata is shown at the top (model, status, timestamps, pass/fail summary)
- **AND** case results are listed below with client-side pagination
- **AND** each case shows its full status, response, tool calls, and fact evaluations

#### Scenario: View in-progress run detail

- **WHEN** the user navigates to a running test run detail page
- **THEN** the page polls for updates every 3 seconds
- **AND** case results update in real-time as they complete (pending -> running -> passed/failed/error)
- **AND** the overall status badge updates when the run completes

#### Scenario: Cancel a running test run from the UI

- **WHEN** the user clicks the "Cancel Run" button on the detail page while the run is `running`
- **THEN** a POST request is sent to `/:runId/cancel`
- **AND** the button shows a loading state during the request
- **AND** on success, the status badge updates to "Cancelled" and the cancel button disappears
- **AND** the page stops polling

#### Scenario: Cancel button not shown for terminal states

- **WHEN** the user views a test run with status `completed`, `failed`, or `cancelled`
- **THEN** the "Cancel Run" button is not displayed

#### Scenario: Cancelled cases displayed correctly

- **WHEN** a cancelled test run is viewed
- **THEN** cases that were completed before cancellation show their original status (passed/failed/error)
- **AND** cases that were cancelled show a neutral ban icon and "cancelled" status
- **AND** the summary counts reflect the actual distribution

#### Scenario: Paginate case results

- **WHEN** the run has more than 25 case results
- **THEN** pagination controls are shown below the case list
- **AND** the user can navigate between pages of results

#### Scenario: Navigate back to runs list

- **WHEN** the user clicks the back link on the detail page
- **THEN** the browser navigates to `/$projectId/testing/runs`

#### Scenario: Refine model via chat for any completed case

- **WHEN** a test case has status `passed`, `failed`, or `error`
- **AND** the user expands the case result card
- **THEN** a "Refine" button is displayed below the tabs section
- **AND** clicking the button navigates to `/$projectId/models/chat/new?prefill=<prompt>`
- **AND** the prefill prompt focuses on improving the semantic model's navigability: ai_context, naming, relationships, and structure to reduce tool calls

#### Scenario: No action buttons for pending, running, or cancelled cases

- **WHEN** a test case has status `pending`, `running`, or `cancelled`
- **THEN** no "Refine" button is displayed in the expanded detail view

## ADDED Requirements

### Requirement: Latest Test Case Results API

The API SHALL expose `GET /api/projects/:projectId/test-cases/latest-results` returning, for every non-deleted test case of the project, the most recent embedded run result (if any). Each item SHALL include: `testCaseId`, `title`, `semanticModel`, `inputMessage` (snapshot of the case input), `latestStatus` (`passed` | `failed` | `error` | `cancelled` | `running` | `pending` | `never_run`), `runId` (the TestRun containing the latest result, when present), `finishedAt` (when present), and `unmetFacts` (array of strings — the expected facts whose latest `factResult.passed` was `false`; empty for non-failing cases). The latest result SHALL be determined by the most recent TestRun (by `createdAt`) that contains the test case. The endpoint SHALL require admin session auth.

A test case SHALL be considered **failing** when its `latestStatus` is `failed` or `error`. This endpoint powers the failing-tests section of the Builder's "Improvements & Testing" panel, including the refine flow: `unmetFacts` and `inputMessage` provide everything the panel needs to build the prefill prompt without a second request. (For `error`-status cases with no recorded `factResults`, `unmetFacts` SHALL be empty and the prefill SHALL fall back to the case `inputMessage` plus the error message.)

#### Scenario: Latest results across runs

- **GIVEN** test case A passed in run 1 and failed in run 2 (run 2 is newer) with one unmet expected fact, and test case B has never been run
- **WHEN** a GET request is made to `/api/projects/:projectId/test-cases/latest-results`
- **THEN** the response lists A with `latestStatus: "failed"`, the `runId` of run 2, and `unmetFacts` containing the unmet expected fact
- **AND** B with `latestStatus: "never_run"`, no `runId`, and empty `unmetFacts`

#### Scenario: Unauthenticated request

- **WHEN** the request lacks a valid admin session
- **THEN** a 401 error is returned
