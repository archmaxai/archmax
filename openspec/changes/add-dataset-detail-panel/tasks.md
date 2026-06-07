## 1. Core file service

- [x] 1.1 Add `updateDatasetMetadata(projectId, modelName, datasetName, metadata)` to `SemanticModelFileService` in `packages/core/src/services/semantic-model-files.ts` — read the dataset YAML, merge `description`/`ai_context`/per-field metadata (matched by field name), preserve all other content, write atomically (temp file + rename); throw on unknown field names and on missing dataset/model
- [x] 1.2 Add unit tests for `updateDatasetMetadata` (merge, field matching by name, unknown-field rejection, preservation of `source`/`expression`/`custom_extensions`/`view_query`, missing dataset error)

## 2. API route

- [x] 2.1 Add `PATCH /:name/datasets/:datasetName` to `apps/api/src/routes/semantic-models.ts` with a Zod body schema for the partial metadata payload; wire to `updateDatasetMetadata`; return 404 for missing model/dataset; keep session auth consistent with sibling routes
- [x] 2.2 Add integration tests for the new route (success, partial field update, unknown field rejection, 404 cases)

## 3. Frontend types

- [x] 3.1 Add explicitly-typed optional `ai_context` to `SemanticModelFull`, `DatasetFull`, and `FieldFull` in `apps/frontend/src/components/model-visualization/types.ts`
- [x] 3.2 Update `model-graph-view.tsx` to read `ai_context` via the typed field (remove the cast in `getDescription`)

## 4. Graph selection wiring

- [x] 4.1 Lift selected-dataset state into `ModelVisualization` (`model-visualization.tsx`) and pass an `onSelectDataset` callback + selected name to `ModelGraphView`
- [x] 4.2 In `model-graph-view.tsx`, wire `onNodeClick` to select a dataset and `onPaneClick` to clear selection (preserving existing context-menu/pane-dismiss behavior)

## 5. Detail panel component

- [x] 5.1 Create `apps/frontend/src/components/model-visualization/dataset-detail-panel.tsx` rendering dataset name, source, AI description/`ai_context`, description/summary, and a scrollable field list (name, data type, description, ai_context)
- [x] 5.2 Make the panel an inline resizable/collapsible right column scoped to the Graph tab (reuse `useResizablePanel` + `PanelResizeHandle`); slide in on selection, collapse/close via header control
- [x] 5.3 Add editable inputs for dataset description, `ai_context` instructions, and per-field descriptions with dirty-state tracking
- [x] 5.4 Add a `useUpdateDatasetMetadata` mutation hook (typed `api` client) with cache invalidation of `["semantic-model", projectId, modelName]` and success/error toasts; wire the Save button (disabled when clean, pending state in flight)

## 6. Documentation

- [x] 6.1 Update the graph view documentation in `apps/docs` to describe the dataset detail panel: opening via node click, collapsing, viewing AI/field metadata, and manual editing + Save

## 7. Verification

- [x] 7.1 Run `pnpm typecheck` and `pnpm lint` (and `pnpm --filter @archmax/api build`) — all exit 0
- [x] 7.2 Run `npx vitest run` for affected packages
