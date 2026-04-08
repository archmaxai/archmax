# Change: Add chat history pagination with "Load More"

## Why
The conversation history sidebar currently fetches and renders all conversations at once. As usage grows, this becomes unwieldy — long lists are slow to load and hard to scan. The history list should show only the 10 most recent conversations initially, with a "Load More" button to incrementally fetch older ones. Semantic models in the sidebar should continue to always display all entries without pagination.

## What Changes
- API: Add `limit` and `skip` query parameters to the conversations list endpoint, plus return a `total` count so the frontend knows whether more exist
- Frontend: Fetch only the first 10 conversations on page load; render a "Load More" button below the list when more conversations exist; clicking it appends the next batch
- The sidebar "Models" section remains unchanged — all semantic models always show

## Impact
- Affected specs: semantic-model-agent (Conversation Persistence requirement)
- Affected code: `apps/api/src/routes/conversations.ts`, `apps/frontend/src/routes/_auth/$projectId/models.tsx`, `apps/frontend/src/lib/chat-types.ts`
