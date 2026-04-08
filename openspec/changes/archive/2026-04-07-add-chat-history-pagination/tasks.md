## 1. API: Paginated conversation list
- [x] 1.1 Add `limit` (default 10) and `skip` (default 0) query params to `GET /projects/:projectId/conversations`
- [x] 1.2 Return `{ items: ConversationSummary[], total: number }` instead of a bare array
- [x] 1.3 Verify existing tests/consumers handle the new response shape

## 2. Frontend: Paginated history sidebar
- [x] 2.1 Update `ConversationListResponse` type in `chat-types.ts` to match new API shape (`{ items, total }`)
- [x] 2.2 Update the conversations query in `models.tsx` to pass `limit=10&skip=0` and parse the new shape
- [x] 2.3 Add state tracking for loaded conversations and current offset
- [x] 2.4 Render a "Load More" button below the conversation list when `loaded < total`
- [x] 2.5 On "Load More" click, fetch the next page (`skip += 10`), append results to the existing list
- [x] 2.6 Ensure newly created conversations still appear at the top after query invalidation
- [x] 2.7 Verify the Models section continues to show all models without pagination
