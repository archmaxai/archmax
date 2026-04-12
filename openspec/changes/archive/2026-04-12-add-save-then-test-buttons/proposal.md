# Change: Add save-then-test buttons to all entity dialogs

## Why
Currently the "Test Connection" button on data connections and test agents only appears when editing an existing entity, not when creating one. Test cases have no inline test action at all. Users must save first, reopen the dialog, and only then can test. This disrupts the debugging workflow and forces unnecessary round-trips.

## What Changes
- **Data connection dialog**: Show the "Test Connection" button in both create and edit mode. When clicked during creation, the connection is saved first, the dialog transitions to edit mode, then the test runs. If save fails, the test is aborted and validation errors are shown.
- **Test agent dialog**: Same pattern. Show "Test Connection" in both create and edit mode. Save first when creating, then test the LLM endpoint.
- **Test case dialog**: Add a new "Run Test" button. When clicked, the test case is saved first (create or update), then a single-case test run is initiated via the existing test-runs API. The user is navigated to the test run detail page to see live results.

## Impact
- Affected specs: `testing-suite`, `connection-management-ui`
- Affected code:
  - `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx` (ConnectionFormDialog)
  - `apps/frontend/src/routes/_auth/$projectId/testing/agents.tsx` (AgentFormDialog)
  - `apps/frontend/src/components/testing/case-form-dialog.tsx` (CaseFormDialog)
  - No API changes required (all endpoints already exist)
