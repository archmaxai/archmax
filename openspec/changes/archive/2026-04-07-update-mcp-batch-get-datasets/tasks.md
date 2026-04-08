## 1. Digest Service — Batch Method
- [x] 1.1 Add `SemanticModelDigest.datasets(datasets: Dataset[], page: number, itemsPerPage: number): DigestPage` that concatenates individual `dataset()` digests separated by `---` delimiters; when a single dataset is provided, delegate to `dataset()` with the given page; when multiple datasets are provided, always use page 1 for each
- [x] 1.2 Add unit tests for the batch method: single dataset delegates correctly with page param, multiple datasets return page 1 of each with delimiters, mixed valid datasets produce concatenated output, empty array returns an error message

## 2. MCP Tool — Rename and Batch
- [x] 2.1 Rename `get_dataset` → `get_datasets` in `semlayer-server.ts`: update tool name, description, and input schema (`datasetNames: z.array(z.string()).min(1).max(10)`)
- [x] 2.2 Update handler logic: resolve all requested datasets, call `SemanticModelDigest.datasets()` for the batch, collect per-dataset errors inline (skip missing datasets with an error line rather than failing the whole call)
- [x] 2.3 Update `get_semantic_model` description hint to reference `get_datasets` instead of `get_dataset`
- [x] 2.4 Update log call name to `get_datasets`

## 3. Documentation
- [x] 3.1 Update `openspec/project.md` MCP tool list to reflect `get_datasets` name and batch semantics
