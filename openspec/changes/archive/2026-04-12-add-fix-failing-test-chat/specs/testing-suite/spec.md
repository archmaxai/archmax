## MODIFIED Requirements
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
