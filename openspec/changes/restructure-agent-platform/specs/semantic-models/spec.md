## RENAMED Requirements

- FROM: `### Requirement: Improvements UI in Semantic Models Sidebar`
- TO: `### Requirement: Improvements & Testing Panel`

## MODIFIED Requirements

### Requirement: Improvements & Testing Panel

The Builder page side panel SHALL include an **Improvements & Testing** accordion section (formerly "Improvement Requests") below the Build section. The section SHALL display two kinds of entries:

1. **Improvement requests** — all improvement suggestions for the project. Each item SHALL show a lightbulb icon, the truncated title, and a checkmark overlay if the improvement has been implemented. Clicking an improvement SHALL navigate to its detail view in the main content area. Each improvement row SHALL show a trash icon on hover that soft-deletes the improvement when clicked, matching the conversation row delete pattern.
2. **Failing tests** — the project's currently failing test cases, sourced from `GET /api/projects/:projectId/test-cases/latest-results` (entries with `latestStatus` of `failed` or `error`). Each item SHALL show a distinct test/alert icon and the truncated test case title. Clicking a failing-test entry SHALL navigate to the latest run's detail page (`/$projectId/testing/runs/:runId`). Each failing-test row SHALL additionally offer a refine affordance (wand icon on hover) that opens `/$projectId/models/chat/new` with a `prefill` prompt referencing the failing test case and its unmet facts so the builder can improve the model.

The section header SHALL display a pending-count badge equal to the number of pending improvements plus the number of failing tests.

#### Scenario: Panel shows pending improvements

- **WHEN** the user views the Builder page and there are 3 pending improvements
- **THEN** the "Improvements & Testing" section shows 3 improvement items with lightbulb icons and no checkmarks

#### Scenario: Panel shows implemented improvements

- **WHEN** an improvement has status `implemented`
- **THEN** it appears in the panel with a checkmark icon overlay

#### Scenario: Panel shows failing tests

- **WHEN** two test cases have a latest run result of `failed` or `error`
- **THEN** the section lists both as failing-test entries with a test/alert icon
- **AND** the section header badge counts them together with pending improvements

#### Scenario: Failing test navigates to run detail

- **WHEN** the user clicks a failing-test entry
- **THEN** the browser navigates to the test run detail page of the latest run containing that case

#### Scenario: Refine a failing test from the panel

- **WHEN** the user activates the refine affordance on a failing-test entry
- **THEN** the Build chat opens at `/$projectId/models/chat/new` with a `prefill` prompt describing the failing test case and its unmet expected facts

#### Scenario: Empty state

- **WHEN** there are no improvements and no failing tests for the project
- **THEN** the section shows a message indicating that improvement requests are submitted by MCP clients and failing tests appear after test runs

#### Scenario: Delete improvement from panel

- **WHEN** the user hovers over an improvement row and clicks the trash icon
- **THEN** the improvement is soft-deleted via the API and removed from the list
- **AND** if the deleted improvement was the active detail view, the user is navigated away
