## MODIFIED Requirements
### Requirement: Test Run Model

The system SHALL provide a `TestRun` Mongoose model representing a batch execution of test cases. Fields: `project` (ObjectId ref to Project, required), `testAgent` (ObjectId ref to TestAgent, required), `status` (enum: `pending`, `running`, `completed`, `failed`, `cancelled`, required), `cases` (array of embedded results), `startedAt` (Date), `completedAt` (Date), `createdAt` (Date), `updatedAt` (Date). Each embedded case result SHALL contain: `testCase` (ObjectId ref to TestCase), `title` (string -- snapshot of test case title), `semanticModel` (string), `inputMessage` (string), `expectedFacts` (array of strings), `maxToolCalls` (number, optional -- snapshot of the limit at execution time), `status` (enum: `pending`, `running`, `passed`, `failed`, `error`, `cancelled`), `agentResponse` (string -- the agent's final text response), `toolCalls` (array of tool call records), `factResults` (array of `{ fact: string, passed: boolean, reasoning: string }`), `durationMs` (number), `errorMessage` (string, optional).

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

#### Scenario: Test run is cancelled

- **WHEN** the user cancels a running or pending test run
- **THEN** the TestRun status is set to `cancelled` and `completedAt` is set
- **AND** all cases still in `pending` status are marked as `cancelled`
- **AND** any in-flight cases (`running` status) are aborted and marked as `cancelled` with partial results preserved

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

When a test run is cancelled, the system SHALL cooperatively abort in-flight test cases. In the Redis/worker path, the worker SHALL subscribe to a per-test-run cancel channel and abort the agent stream via `AbortController`. Queued BullMQ jobs that have not started SHALL be removed from the queue. In the in-process (no Redis) path, the sequential loop SHALL check a cancellation flag between cases and skip remaining ones.

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

- `GET /` -- List all test runs for the project with server-side pagination (`page`, `limit` query params returning `{ items, total, page, limit }`); each item is a summary: id, testAgent name, case count, passed/failed/error counts, status, timestamps
- `GET /:runId` -- Get a single test run with full case results (the full embedded cases array)
- `POST /` -- Initiate a batch run (accepts `testCaseIds` array); returns the new TestRun ID
- `POST /:runId/cancel` -- Cancel a running or pending test run; marks remaining cases as `cancelled`, aborts in-flight executions, and sets the run status to `cancelled`
- `DELETE /:runId` -- Delete a test run

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

#### Scenario: Cancel a running test run

- **WHEN** a POST request is made to `/:runId/cancel` for a run with status `running`
- **THEN** the run status is set to `cancelled` and `completedAt` is set
- **AND** all `pending` cases are marked as `cancelled`
- **AND** in-flight cases are signaled for abort
- **AND** the response returns `{ ok: true }`

#### Scenario: Cancel a non-active test run

- **WHEN** a POST request is made to `/:runId/cancel` for a run with status `completed`, `failed`, or `cancelled`
- **THEN** a 400 error is returned indicating the run is not active

### Requirement: Testing UI — Test Run Detail Page

The frontend SHALL provide a Test Run Detail page at `/$projectId/testing/runs/:runId` showing run metadata (agent name, status, started/completed timestamps, overall pass/fail counts) and a client-side-paginated list of case results. Each case result shows: status icon, title, semantic model badge, input message, agent response (expandable), tool calls (expandable), fact results with pass/fail icons and reasoning, duration, and error message if applicable. The page auto-refreshes (polls every 3 seconds) while the run status is `pending` or `running`. A back link returns to the Test Runs list.

A "Cancel Run" button SHALL be displayed in the page header next to the status badge when the run status is `pending` or `running`. Clicking the button SHALL call `POST /api/projects/:projectId/test-runs/:runId/cancel`. On success, the button SHALL disappear and the status badge SHALL update to `cancelled`. The button SHALL be disabled while the cancel request is in progress and SHALL display a loading indicator.

The `cancelled` run status SHALL be rendered as a grey/neutral badge with text "Cancelled". Individual cases with `cancelled` status SHALL display a ban/slash icon in neutral grey.

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

#### Scenario: No action buttons for pending, running, or cancelled cases

- **WHEN** a test case has status `pending`, `running`, or `cancelled`
- **THEN** no "Fix in Chat" or "Refine" buttons are displayed in the expanded detail view

### Requirement: Testing UI — Test Runs List Page

The frontend SHALL provide a Test Runs page at `/$projectId/testing/runs` displaying a server-side-paginated table of all test runs for the project. Columns: status icon, agent name, case count, result summary (passed/failed/errors as badges), date. Each row links to the run detail page at `/$projectId/testing/runs/:runId`. The page auto-refreshes while any run is in `pending` or `running` status.

The `cancelled` status SHALL be displayed with a neutral grey icon (ban/slash) consistent with the detail page styling.

#### Scenario: View test runs list

- **WHEN** the user navigates to `/$projectId/testing/runs`
- **THEN** a paginated table of test runs is displayed with status, agent, case count, pass/fail/error counts, and timestamps

#### Scenario: Navigate to run detail

- **WHEN** the user clicks a test run row
- **THEN** the browser navigates to `/$projectId/testing/runs/:runId`

#### Scenario: Empty state

- **WHEN** no test runs exist for the project
- **THEN** an empty state message is shown prompting the user to run a test batch from the Test Cases page

#### Scenario: Cancelled run displayed in list

- **WHEN** a cancelled test run exists
- **THEN** it is displayed with a neutral grey ban icon and the status text "Cancelled"
