## 1. Digest Service — Scoped Pagination

- [x] 1.1 Add `ITEMS_PER_PAGE = 50` constant in `semantic-model-digest.ts` (rename `FIELDS_PER_PAGE` to `ITEMS_PER_PAGE` and update value from 25 to 50)
- [x] 1.2 Add `OverviewOptions` type: `{ scope?: "datasets" | "relationships" | "metrics"; page?: number }`
- [x] 1.3 Refactor `SemanticModelDigest.overview()` to accept optional `OverviewOptions` and return `DigestPage` instead of `string`
- [x] 1.4 Implement scoped rendering: when `scope` is set, render only that section with pagination; when omitted, render all sections (truncated at 50 per section with hints)
- [x] 1.5 Update `SemanticModelDigest.dataset()` to use new page size of 50

## 2. Digest Tests

- [x] 2.1 Update existing tests in `semantic-model-digest.test.ts` for new page size (50 instead of 25)
- [x] 2.2 Add tests for scoped overview: datasets scope with pagination, relationships scope, metrics scope
- [x] 2.3 Add test for unscoped overview with truncation hints when sections exceed 50 items
- [x] 2.4 Add test for overview returning `DigestPage` type

## 3. MCP Tool Rename and Wiring

- [x] 3.1 Rename `get_semantic_model_overview` → `get_semantic_model` in `semlayer-server.ts`
- [x] 3.2 Add `scope` and `page` parameters to `get_semantic_model` tool input schema
- [x] 3.3 Wire `scope` and `page` through to `SemanticModelDigest.overview()`
- [x] 3.4 Rename `get_dataset_fields` → `get_dataset` in `semlayer-server.ts`
- [x] 3.5 Update log call names to match new tool names

## 4. Documentation

- [x] 4.1 Update `openspec/project.md` MCP tool list to reflect new names
- [ ] 4.2 Update `openspec/specs/mcp-server/spec.md` to match the final state (via archive)
