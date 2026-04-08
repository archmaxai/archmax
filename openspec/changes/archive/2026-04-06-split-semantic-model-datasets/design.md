## Context

Semantic model YAML files are self-contained documents that embed all datasets, fields, relationships, and metrics. As models grow (many datasets, many fields with rich metadata), files become unwieldy. The `describe_dataset` MCP tool and future per-dataset editing in the UI both suffer because the entire model must be parsed to access a single dataset.

## Goals / Non-Goals

- **Goals:**
  - Split datasets into individual YAML files within a model subdirectory
  - Assembly into full `SemanticModel` objects happens transparently in the file service
  - Targeted single-dataset reads without loading the full model
  - Backward-compatible reading of legacy single-file models
- **Non-Goals:**
  - Splitting relationships or metrics into separate files (they remain small)
  - Changing the API contract or Zod schema types — callers still see `SemanticModel`
  - Changing the MCP tool signatures

## Decisions

### File layout

```
<SEMLAYER_DATA_DIR>/<projectId>/
  sales.yaml                  # root: name, description, aiContext, relationships, metrics
  sales/
    orders.yaml               # dataset with inline fields
    customers.yaml
    products.yaml
```

- **Root file** (`<name>.yaml`): Contains all model-level fields *except* `datasets`. The `datasets` key is omitted (or empty) — the service knows to look in the subdirectory.
- **Dataset files** (`<name>/<dataset>.yaml`): Each is a standalone dataset object (name, source, primaryKey, uniqueKeys, description, aiContext, fields).
- **Rationale**: Datasets are the largest sub-entity and the natural unit of independent editing. Relationships and metrics are small and cross-reference datasets, so keeping them in the root avoids cross-file lookups.

### Backward compatibility

When reading, if `<name>/` directory does not exist but `<name>.yaml` contains a non-empty `datasets` array, the service treats it as a legacy single-file model and returns it as-is. This avoids a mandatory migration step.

### Write behavior

On write, the service always writes the split layout:
1. Write root `<name>.yaml` (model minus datasets)
2. Ensure `<name>/` directory exists
3. Write each dataset to `<name>/<dataset.name>.yaml`
4. Remove any dataset files in the directory that are no longer in the model (handles renames/deletions)

This means a legacy model is automatically migrated to the split layout on the next write.

### Schema additions

- `semanticModelRootSchema` — like `semanticModelSchema` but with `datasets` omitted (used for parsing root files)
- `datasetFileSchema` — reuses existing `datasetSchema` (no wrapper needed, dataset files are bare dataset objects)

### Targeted dataset reads

New `getDataset(projectId, modelName, datasetName)` method reads only `<name>/<dataset>.yaml`. The MCP `describe_dataset` tool can call this directly instead of loading the full model and filtering.

## Risks / Trade-offs

- **More filesystem operations** — listing a model now requires reading the root file plus `readdir` on the subdirectory. Mitigated by the fact that this is local disk I/O and models are small in count.
- **Atomic writes across multiple files** — a crash mid-write could leave the root and dataset files inconsistent. Mitigated by writing temp files first and renaming, same as current approach, but now per file. Acceptable for a single-user system.
- **Directory cleanup on delete** — must remove both the root file and the dataset directory. A `rm -rf` equivalent is needed.

## Migration Plan

No explicit migration required. Legacy single-file models are read transparently. On the next write (edit via API or UI), the model is automatically split. The `AGENTS.md` regeneration is unaffected since it only uses model-level summaries.

## Open Questions

None — the design is straightforward given the single-user, local-disk constraints.
