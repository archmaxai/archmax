## MODIFIED Requirements

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
