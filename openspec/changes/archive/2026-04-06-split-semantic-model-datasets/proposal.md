# Change: Split semantic model files by dataset

## Why

Semantic model YAML files grow large as datasets accumulate fields with metadata (data types, example data, distinct values, AI context). A single model with 10+ datasets and 50+ fields per dataset produces multi-thousand-line files that are slow to parse, painful to diff, and wasteful when only one dataset is needed (e.g. `describe_dataset` MCP tool).

## What Changes

- **BREAKING**: Semantic model file layout changes from a single `<name>.yaml` to a root file plus a per-dataset directory:
  ```
  <projectId>/
    <modelName>.yaml              # model-level: name, description, aiContext, relationships, metrics
    <modelName>/
      <datasetName>.yaml          # one file per dataset (fields inline)
  ```
- `SemanticModelFileService` is updated to read/write the split layout:
  - **list** — reads root files, counts dataset files from subdirectories
  - **get** — assembles the full model by reading root + all dataset files
  - **write** — splits the incoming model: root file for model-level data, one dataset file per dataset
  - **delete** — removes root file and dataset directory
  - **getDataset** — new method, reads a single dataset file without loading the full model
- API and MCP consumers remain unchanged — assembly happens inside the file service
- Existing single-file models are read transparently (if no `<name>/` directory exists, fall back to reading datasets from the root file) to support migration

## Impact

- Affected specs: `semantic-models` (MODIFIED — file storage layout and assembly)
- Affected code:
  - `packages/core/src/services/semantic-model-files.ts` — split read/write logic, new `getDataset` method
  - `packages/core/src/services/semantic-model-schema.ts` — add a root-file schema (model without datasets) and a dataset-file schema
  - `apps/api/src/mcp/semlayer-server.ts` — `describe_dataset` can use the new `getDataset` method for targeted reads
  - `apps/api/src/routes/semantic-models.ts` — no structural changes (service still returns assembled models)
