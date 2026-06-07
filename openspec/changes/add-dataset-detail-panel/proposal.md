# Change: Dataset Detail Panel in Graph View

## Why

The semantic model graph view lets users see datasets and their relationships, but there is no way to browse the full semantic metadata (AI description / `ai_context`, summary, per-field descriptions) for a dataset, nor to correct it manually. Today the only way to edit this metadata is through the AI chat agent or by hand-editing YAML. Users need an inline, reviewable surface to inspect and lightly edit dataset metadata directly from the graph.

## What Changes

- Clicking a dataset node in the graph view selects it and opens a vertical detail panel on the far right of the graph area.
- The panel slides in from the right and can be collapsed/closed again; its open/collapsed state is preserved while navigating between datasets.
- The panel displays the selected dataset's semantic metadata: name, source, AI description / `ai_context` (instructions, synonyms, examples), summary/description, and a list of fields with their descriptions and `ai_context`.
- The panel includes editable inputs for the dataset description, `ai_context`, and per-field descriptions, plus a **Save** button that persists manual edits.
- A new granular API write path persists dataset metadata edits without rewriting the entire model: `PATCH /api/projects/:projectId/semantic-models/:name/datasets/:datasetName`, backed by a new `SemanticModelFileService.updateDatasetMetadata` method that merges metadata into the dataset's YAML file atomically.
- Frontend `SemanticModelFull` / `DatasetFull` / `FieldFull` types gain an explicitly-typed `ai_context` field so the panel reads metadata without unsafe casts.

## Impact

- Affected specs: `semantic-models`
- Affected code:
  - `apps/frontend/src/components/model-visualization/model-graph-view.tsx` (node click → selection state)
  - `apps/frontend/src/components/model-visualization/model-visualization.tsx` (host the panel inside the Graph tab)
  - new `apps/frontend/src/components/model-visualization/dataset-detail-panel.tsx`
  - `apps/frontend/src/components/model-visualization/types.ts` (typed `ai_context`)
  - `apps/api/src/routes/semantic-models.ts` (new dataset metadata PATCH route)
  - `packages/core/src/services/semantic-model-files.ts` (`updateDatasetMetadata`)
  - `apps/docs` (graph view documentation page)
