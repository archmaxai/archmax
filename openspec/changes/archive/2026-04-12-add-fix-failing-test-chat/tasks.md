## 1. Implementation
- [x] 1.1 Add a `buildFixPrompt(tc: CaseResult)` helper in the test run detail page that constructs a structured correction prompt from the case result (semantic model, input message, fact results with pass/fail + reasoning, agent response summary)
- [x] 1.2 Add a "Fix in Chat" button to the expanded case card for `failed` and `error` status cases, below the tabs section
- [x] 1.3 Wire the button to navigate to `/$projectId/models/chat/new?prefill=<prompt>` using the existing TanStack Router `navigate()` + search params pattern (same as improvement requests)

## 2. Verification
- [x] 2.1 Run `pnpm typecheck` and `pnpm lint` to verify no regressions
- [x] 2.2 Manually verify: failing test case shows button, passing test case does not, clicking navigates to chat with correct prefill
