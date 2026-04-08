# Change: Add Document Uploads for Agent Consumption

## Why
Agents currently only access YAML semantic model files and database connections. Users often have supplementary documentation — data dictionaries, ERDs, business glossaries, mapping spreadsheets — in formats like PDF, XLSX, and DOCX. Giving agents the ability to read these documents would improve model quality and reduce manual transcription.

## What Changes
- Add a per-project `uploads/` directory under `<SEMLAYER_DATA_DIR>/<projectId>/uploads/` for storing uploaded documents
- Add an API endpoint for uploading, listing, and deleting documents
- Add a `read_document` tool to the deep agent that converts uploaded files to markdown using `markitdown-ts` (TypeScript port of Microsoft's markitdown)
- Add a frontend UI for uploading documents within a project

## Impact
- Affected specs: `semantic-model-agent` (new tool), `document-uploads` (new capability)
- Affected code:
  - `packages/core/services/document-files.ts` (new — file storage service)
  - `packages/core/services/agent.ts` (add `read_document` tool)
  - `apps/api/src/routes/documents.ts` (new — upload/list/delete API)
  - `apps/api/src/app.ts` (mount new route)
  - `apps/frontend/` (upload UI component)
  - `packages/core/package.json` (add `markitdown-ts` dependency)
