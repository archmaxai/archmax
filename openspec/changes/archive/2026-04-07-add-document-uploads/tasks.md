## 1. Core Document Service
- [x] 1.1 Add `markitdown-ts` dependency to `packages/core/package.json`
- [x] 1.2 Create `packages/core/src/services/document-files.ts` — `DocumentFileService` class with `upload`, `list`, `get`, `delete`, and `readAsMarkdown` methods
- [x] 1.3 Write unit tests for `DocumentFileService` (upload, list, delete, read-as-markdown for PDF/XLSX/DOCX/TXT)

## 2. API Routes
- [x] 2.1 Create `apps/api/src/routes/documents.ts` — Hono routes for `POST /upload` (multipart), `GET /` (list), `GET /:filename` (download), `DELETE /:filename`
- [x] 2.2 Mount document routes at `/api/projects/:projectId/documents` in `apps/api/src/app.ts`
- [x] 2.3 Add 20 MB upload size limit validation
- [x] 2.4 Write integration tests for document API endpoints

## 3. Agent Tool
- [x] 3.1 Add `read_document` tool to `createSemlayerAgent()` in `packages/core/src/services/agent.ts` — accepts optional `filename` param; returns markdown conversion or lists available documents
- [x] 3.2 Update agent system prompt to mention uploaded documents and the `read_document` tool
- [x] 3.3 Test agent tool integration (mock filesystem, verify markdown output)

## 4. MCP Tool
- [x] 4.1 Add `read_document` tool to the MCP server in `apps/api/src/mcp/semlayer-server.ts` — same logic as agent tool, scoped to the project
- [x] 4.2 Add `list_documents` tool to MCP server for listing uploaded files

## 5. Frontend
- [x] 5.1 Add file upload button (paperclip) and drag-and-drop support to the chat input area
- [x] 5.2 Show uploaded files as chips in the chat input with remove action
- [x] 5.3 Wire upload to documents API, show toast feedback, include filenames in sent message
- [x] 5.4 Integrate document upload into the agent chat component (not a standalone page)
