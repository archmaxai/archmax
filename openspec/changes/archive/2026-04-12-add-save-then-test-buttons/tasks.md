## 1. Connection dialog: save-then-test on create
- [x] 1.1 Refactor `ConnectionFormDialog` to show "Test Connection" button in both create and edit mode
- [x] 1.2 Implement save-then-test flow: on click during create, save via POST first, transition to edit mode with the returned entity, then fire the test mutation
- [x] 1.3 Disable "Test Connection" while save or test is in progress (show spinner)
- [x] 1.4 Verify existing edit-mode test behavior is unchanged

## 2. Test agent dialog: save-then-test on create
- [x] 2.1 Refactor `AgentFormDialog` to show "Test Connection" button in both create and edit mode
- [x] 2.2 Implement save-then-test flow: save via POST first, transition to edit mode, then fire the test-connection mutation
- [x] 2.3 Disable "Test Connection" while save or test is in progress (show spinner)
- [x] 2.4 Verify existing edit-mode test behavior is unchanged

## 3. Test case dialog: add "Run Test" button
- [x] 3.1 Add a "Run Test" button to `CaseFormDialog` (both create and edit mode)
- [x] 3.2 Implement save-then-run flow: save the test case (create or update), then POST to test-runs with the single case ID
- [x] 3.3 On successful run creation, close the dialog and navigate to the test run detail page (`/$projectId/testing/runs/:runId`)
- [x] 3.4 Disable "Run Test" when test case has no agent assigned (agent is required for execution)
- [x] 3.5 Show spinner state while saving and initiating the run
