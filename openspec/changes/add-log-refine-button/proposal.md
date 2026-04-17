# Change: Add Refine button to MCP log detail view

## Why
When an MCP tool call fails or returns unexpected results, there is no quick path from the monitoring log to improving the underlying semantic model. The testing suite already offers a "Refine" button on test case results that navigates to the model builder chat with a pre-filled prompt — extending this pattern to the MCP log detail sheet lets users act on real-world agent issues immediately.

## What Changes
- Add a "Refine" button to the MCP log detail sheet (the `Sheet` that opens when clicking a row in the monitoring table)
- Build a `buildLogRefinePrompt` helper that assembles a prefill prompt from the log entry (tool name, input args, output content, error message, semantic model name extracted from `inputArgs`)
- Navigate to `/$projectId/models/chat/new?prefill=<prompt>` on click, matching the existing Refine flow from test runs
- The button uses the same visual style (outline, `Wand2` icon) as the test run Refine button

## Impact
- Affected specs: `mcp-monitoring` (add requirement for Refine action in log detail)
- Affected code: `apps/frontend/src/routes/_auth/$projectId/monitoring.tsx`
