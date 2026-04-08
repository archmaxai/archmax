## 1. Projects polling
- [x] 1.1 Add `refetchInterval: 30_000` to the `["projects"]` query in `_auth/index.tsx`
- [x] 1.2 Add `refetchInterval: 30_000` to the `["projects"]` query in `project-selector.tsx`
- [x] 1.3 Add `refetchInterval: 30_000` to the `["project", projectId]` query in `_auth/$projectId.tsx`

## 2. Connections polling
- [x] 2.1 Add `refetchInterval: 30_000` to the `["connections", projectId]` query in `connections.tsx`

## 3. Semantic models polling
- [x] 3.1 Verify existing `refetchInterval: 10_000` in `semantic-model-explorer.tsx` (already correct, no change needed)

## 4. Conversations polling
- [x] 4.1 Add `refetchInterval: 10_000` to the `["conversations", projectId]` query in `models.tsx`
- [x] 4.2 Add `refetchInterval: 10_000` to the `["conversation", conversationId]` query in `chat/$conversationId.tsx` (picks up async title generation and any messages appended by background processes)
