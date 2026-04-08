## MODIFIED Requirements

### Requirement: Test Case Model

The system SHALL provide a `TestCase` Mongoose model with the following fields: `title` (string, required), `project` (ObjectId ref to Project, required, indexed), `testAgent` (ObjectId ref to TestAgent, required), `semanticModel` (string, required — the semantic model name to test against), `inputMessage` (string, required — the natural language question to send to the agent), `expectedFacts` (array of strings, required, min 1 — factual assertions that the agent's response must satisfy), `tags` (array of strings, default `[]` — free-form labels for organizing and filtering test cases; values are lowercase-trimmed on write), `maxToolCalls` (number, optional — maximum number of tool call invocations allowed during test execution; when set, the test runner aborts and marks the case as error if exceeded), `deleted` (boolean, default false), `deletedAt` (Date, optional), `createdAt` (Date), `updatedAt` (Date). The model SHALL use the shared soft-delete plugin.

#### Scenario: Create a test case

- **WHEN** a TestCase is created with `title: "Revenue 2025"`, `semanticModel: "ecommerce"`, `inputMessage: "What's the revenue for 2025?"`, `expectedFacts: ["Revenue is 1.65 MEUR"]`
- **THEN** the test case is persisted in MongoDB

#### Scenario: Create a test case with multiple expected facts

- **WHEN** a TestCase is created with `expectedFacts: ["Revenue is 1.65 MEUR", "Growth rate is 12%", "Top market is Germany"]`
- **THEN** all three facts are stored and each will be individually evaluated during a test run

#### Scenario: Create a test case with tags

- **WHEN** a TestCase is created with `tags: ["Revenue", "Q1 "]`
- **THEN** the tags are stored as `["revenue", "q1"]` (lowercase-trimmed)
- **AND** the test case can be filtered by any of those tags

#### Scenario: Create a test case with max tool calls limit

- **WHEN** a TestCase is created with `maxToolCalls: 5`
- **THEN** the limit is stored on the test case
- **AND** during execution, the test runner will abort the agent after 5 tool call invocations

### Requirement: Test Case CRUD API

The API SHALL expose CRUD endpoints for test cases at `/api/projects/:projectId/test-cases`:

- `GET /` — List all non-deleted test cases for the project, with server-side pagination (`page`, `limit` query params returning `{ items, total, page, limit }`) and optional filtering by `agentId`, `semanticModel`, and `tags` (comma-separated) query params
- `POST /` — Create a new test case (accepts title, testAgentId, semanticModel, inputMessage, expectedFacts, tags, maxToolCalls)
- `PUT /:caseId` — Update an existing test case (all fields are updatable)
- `DELETE /:caseId` — Soft-delete a test case

All endpoints SHALL require admin session auth.

#### Scenario: List test cases for a project

- **WHEN** a GET request is made to `/api/projects/:projectId/test-cases`
- **THEN** all non-deleted test cases are returned with title, testAgent, semanticModel, inputMessage, expectedFacts, tags, maxToolCalls, and timestamps
- **AND** results are paginated

#### Scenario: Filter test cases by tag

- **WHEN** a GET request is made with query `?tags=revenue,q1`
- **THEN** only test cases having at least one of the specified tags are returned

#### Scenario: Filter test cases by agent and model

- **WHEN** a GET request is made with query `?agentId=abc123&semanticModel=ecommerce`
- **THEN** only test cases matching both the agent and semantic model are returned

#### Scenario: Delete a test case

- **WHEN** a DELETE request is made for a test case
- **THEN** the test case is soft-deleted and no longer appears in list queries

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

### Requirement: Testing UI — Test Cases Page

The frontend SHALL provide a Test Cases page at `/$projectId/testing/cases` displaying a paginated table of all test cases with columns: title, agent (badge), model (badge), input message (truncated), tags (badges), expected facts count, and actions (edit, delete). A "Create Test Case" button SHALL open a form dialog with fields: title, test agent, semantic model, input message, expected facts (dynamic list), tags (chip input), and max tool calls (optional number). A "Run Batch" button SHALL open a dialog with agent/model/tag filter controls and a live count of matching cases; on confirm, a batch run is initiated and the user is navigated to the test run detail page.

Filter controls above the table SHALL allow filtering by agent, semantic model, and tags. Filtering is server-side via query params.

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

## ADDED Requirements

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

#### Scenario: View completed run detail

- **WHEN** the user navigates to a completed test run detail page
- **THEN** run metadata is shown at the top (agent, status, timestamps, pass/fail summary)
- **AND** case results are listed below with client-side pagination
- **AND** each case shows its full status, response, tool calls, and fact evaluations

#### Scenario: View in-progress run detail

- **WHEN** the user navigates to a running test run detail page
- **THEN** the page polls for updates every 3 seconds
- **AND** case results update in real-time as they complete (pending → running → passed/failed/error)
- **AND** the overall status badge updates when the run completes

#### Scenario: Paginate case results

- **WHEN** the run has more than 25 case results
- **THEN** pagination controls are shown below the case list
- **AND** the user can navigate between pages of results

#### Scenario: Navigate back to runs list

- **WHEN** the user clicks the back link on the detail page
- **THEN** the browser navigates to `/$projectId/testing/runs`
