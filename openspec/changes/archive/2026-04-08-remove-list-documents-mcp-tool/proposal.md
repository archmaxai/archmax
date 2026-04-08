# Change: Remove `list_documents` and `read_document` MCP tools

## Why

Document tools (`list_documents`, `read_document`) on the MCP server are not part of the core semantic-layer concern. Document access is handled by the deep agent internally; exposing these tools to external MCP clients adds surface area without clear value. Removing both simplifies the MCP tool listing to focus on semantic model discovery and querying.

## What Changes

- **BREAKING**: Remove the `list_documents` tool registration from the MCP server
- **BREAKING**: Remove the `read_document` tool registration from the MCP server
- Remove `DocumentFileService` import and `getDocService` helper (no longer needed in MCP server)

## Impact

- Affected specs: `document-uploads` (Agent read_document Tool requirement)
- Affected code: `apps/api/src/mcp/semlayer-server.ts`
- MCP clients lose the ability to list and read uploaded documents — these remain accessible via the admin UI and the deep agent's internal tooling
