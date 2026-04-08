## 1. Data Model

- [x] 1.1 Create `Improvement` Mongoose model in `packages/core/src/models/Improvement.ts` with fields: `project` (ObjectId ref), `modelName` (string), `title` (string), `description` (string), `status` (enum: pending/implemented), `implementedAt` (Date, optional), `createdVia` (string — token name), soft delete plugin, timestamps
- [x] 1.2 Export from `packages/core/src/models/index.ts`

## 2. API Endpoints

- [x] 2.1 Create `apps/api/src/routes/improvements.ts` with Hono routes nested under `/api/projects/:projectId/improvements`
- [x] 2.2 `GET /` — list improvements for a project, optional `modelName` and `status` query filters, sorted by `createdAt` desc
- [x] 2.3 `GET /:id` — get single improvement by id
- [x] 2.4 `PATCH /:id/implement` — set status to `implemented` and `implementedAt` to now
- [x] 2.5 Register the improvements router in the main API app

## 3. MCP Tool

- [x] 3.1 Add `suggest_improvement` tool registration in `semlayer-server.ts` — inputs: `modelName` (string, required), `title` (string, required), `description` (string, required); validates model exists in scope, rejects read-only tokens, creates `Improvement` document, returns success text
- [x] 3.2 Log the call via `McpCallLog` (consistent with other tools)

## 4. Frontend — Sidebar

- [x] 4.1 Add "Improvements" `AccordionSection` in `models.tsx` sidebar below History, with a count badge showing pending improvements
- [x] 4.2 Fetch improvements via TanStack Query (`GET /improvements?status=pending` + implemented)
- [x] 4.3 Render each improvement as a sidebar link with lightbulb icon, truncated title, and checkmark icon if implemented

## 5. Frontend — Detail View

- [x] 5.1 Create route `apps/frontend/src/routes/_auth/$projectId/models/improvement/$improvementId.tsx`
- [x] 5.2 Fetch and display improvement title, description, model name, creation date, and `createdVia` token name
- [x] 5.3 Add "Implement" button at top — calls `PATCH /implement`, marks improvement as implemented, then navigates to new chat with description pre-filled
- [x] 5.4 Support `prefill` query param in the chat route to pre-fill the message input textarea
