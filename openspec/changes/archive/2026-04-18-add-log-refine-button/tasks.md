## 1. Implementation
- [x] 1.1 Add `buildLogRefinePrompt(log: McpLogEntry): string` helper to `monitoring.tsx` — extracts semantic model name from `inputArgs.model_name`, includes tool name, input args summary, output/error content, and a closing instruction similar to the test-run Refine prompt
- [x] 1.2 Add `useNavigate` import and `Wand2` icon import to `monitoring.tsx`
- [x] 1.3 Add "Refine" button to the log detail `Sheet`, placed below the existing output/error sections inside the `ScrollArea`, with `variant="outline"`, `size="sm"`, `Wand2` icon, navigating to `/$projectId/models/chat/new` with the prefill search param
- [x] 1.4 Only show the Refine button when the log entry is a `tools/call` entry (not for `tools/list`) and when a semantic model name can be extracted from `inputArgs`
- [x] 1.5 Verify the flow works end-to-end: click log row → sheet opens → click Refine → navigates to model builder chat with prefilled prompt
