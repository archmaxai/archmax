## 1. Schema

- [x] 1.1 Add `semanticModelRootSchema` to `packages/core/src/services/semantic-model-schema.ts` — same as `semanticModelSchema` but without `datasets` (used for parsing root YAML files)
- [x] 1.2 Export `datasetSchema` as `datasetFileSchema` alias (or reuse directly) for parsing individual dataset YAML files

## 2. File Service

- [x] 2.1 Update `SemanticModelFileService.get()` to detect split layout: if `<name>/` directory exists, read root file + assemble datasets from directory; otherwise fall back to legacy single-file read
- [x] 2.2 Update `SemanticModelFileService.write()` to split: write root `<name>.yaml` (model minus datasets), write each dataset to `<name>/<dataset.name>.yaml`, remove stale dataset files no longer in the model
- [x] 2.3 Update `SemanticModelFileService.list()` to work with split layout (read root files, detect dataset subdirectories for count)
- [x] 2.4 Update `SemanticModelFileService.delete()` to remove both the root file and the `<name>/` dataset directory
- [x] 2.5 Update `SemanticModelFileService.exists()` to check root file existence
- [x] 2.6 Add `SemanticModelFileService.getDataset(projectId, modelName, datasetName)` that reads a single dataset file from `<name>/<dataset>.yaml`

## 3. MCP Optimization

- [x] 3.1 Update `describe_dataset` in `apps/api/src/mcp/semlayer-server.ts` to call `svc.getDataset()` instead of loading the full model

## 4. Validation

- [x] 4.1 Run `tsc --noEmit` across the monorepo to verify no type errors
- [ ] 4.2 Manually test round-trip: create model via API, verify split file layout on disk, read back via API and MCP tools
