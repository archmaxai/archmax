## Context

AI agents using the MCP server can read semantic models but cannot report issues or suggest changes. This creates a feedback gap — users talking to agents discover problems ("this column isn't available" / "this is defined differently") but there's no structured channel back to the admin. This change adds a minimal write-path via MCP and a corresponding review UI.

## Goals / Non-Goals

- Goals:
  - Allow MCP clients to submit structured improvement suggestions scoped to a model
  - Show improvements in the admin UI alongside the model they target
  - Enable one-click transition from improvement to chat-based implementation
  - Track which improvements have been addressed

- Non-Goals:
  - Auto-applying improvements (always human-in-the-loop)
  - Rich editing or commenting on improvements
  - Priority/severity classification (keep it simple — just title + description)
  - Notifications or email alerts for new improvements

## Decisions

- **Storage**: MongoDB `Improvement` model (consistent with existing Project, Connection, McpToken patterns). Fields: `project`, `modelName`, `title`, `description`, `status` (pending/implemented), `implementedAt`, `createdVia` (token name for audit), timestamps. Soft delete via the shared plugin.
- **MCP tool**: `suggest_improvement` — requires write permission on the token (rejects read-only tokens). Validates `modelName` exists in the project's published/assembled models before persisting.
- **API routes**: Nested under `/api/projects/:projectId/improvements`. Endpoints: `GET /` (list, filterable by modelName/status), `GET /:id`, `PATCH /:id/implement` (sets status to implemented).
- **Frontend**: New `AccordionSection` titled "Improvements" in the models sidebar below History. Each item shows a lightbulb icon, title (truncated), and a checkmark if implemented. Clicking navigates to `/$projectId/models/improvement/$improvementId`. The detail route renders title, description, model name, created date, and an "Implement" button at the top. Clicking "Implement" calls `PATCH /implement`, then navigates to a new chat with the description pre-filled in the message input.
- **Pre-filling chat**: Navigate to `/$projectId/models/chat/new?prefill=<encoded description>`. The chat page reads the `prefill` query param and sets it as the initial textarea value (user still submits manually).

## Risks / Trade-offs

- **Spam via MCP**: Mitigated by existing rate limiting and token auth. The tool also rejects read-only tokens.
- **Model validation**: The tool validates `modelName` exists before saving. If a model is later deleted, orphaned improvements remain visible but harmless (the sidebar filters by model).
- **Simple status model**: Only `pending` → `implemented`. If richer workflows are needed later, a state machine can be introduced without schema changes (just add more enum values).

## Open Questions

None — the scope is deliberately minimal.
