## 1. Backend — Enrich conversation list responses

- [x] 1.1 In `apps/api/src/routes/conversations.ts` GET `/` handler, check `isStreamActive()` for each conversation in the paginated list via `Promise.all` and include `isStreaming` in each item
- [x] 1.2 In `apps/api/src/routes/playground.ts` GET conversation list handler, apply the same `isStreamActive()` enrichment per conversation item

## 2. Frontend — Types

- [x] 2.1 Add optional `isStreaming?: boolean` to `ConversationSummary` in `apps/frontend/src/lib/chat-types.ts`

## 3. Frontend — Sidebar icon swap

- [x] 3.1 In `apps/frontend/src/routes/_auth/$projectId/models.tsx`, replace the static `MessageSquare` icon with `Loader2` (animated spin) when `c.isStreaming` is true; keep `MessageSquare` for idle conversations
- [x] 3.2 In `apps/frontend/src/routes/_auth/$projectId/testing/playground.tsx`, apply the same conditional icon swap for playground conversation history entries

## 4. Verification

- [ ] 4.1 Manually verify: start a chat, navigate away — the sidebar shows a spinning icon for the active conversation; once the stream completes and the next poll fires, the icon reverts to `MessageSquare`
- [x] 4.2 Run `pnpm typecheck && pnpm lint` to confirm no regressions
