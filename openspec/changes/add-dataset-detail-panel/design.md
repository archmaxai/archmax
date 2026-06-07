## Context

The graph view (`model-visualization/`) is a React Flow canvas that loads the full `SemanticModelFull` via a single GET and refetches every 10s. Dataset nodes currently support only React Flow's built-in selection ring; there is no detail/inspector surface and no frontend write path for semantic metadata. Existing writes are extensions-only PATCH routes (graph positions, groups) and a full `PUT /:name` that replaces the entire model (used by the agent/tests, never by the UI).

This change adds a right-side detail panel for viewing and lightly editing dataset metadata. Two decisions carry real trade-offs: the panel mechanism (overlay Sheet vs inline resizable column) and the save write path (full PUT-with-merge vs a new granular PATCH).

## Goals / Non-Goals

- **Goals**
  - View a dataset's AI description / `ai_context`, summary/description, and per-field descriptions from the graph.
  - Slide-in panel anchored to the far right of the graph area, collapsible/closable.
  - Manual editing of dataset description, `ai_context`, and per-field descriptions with an explicit Save.
  - A surgical, race-safe persistence path that does not rewrite unrelated model content.
- **Non-Goals**
  - Editing fields' `expression` / `view_query` / source mappings (semantic SQL stays agent-owned).
  - Adding/removing datasets, fields, relationships, or metrics from the panel.
  - Editing relationships or metrics (datasets only in this change).
  - Real-time collaborative editing or conflict resolution beyond last-write-wins on a single dataset file.

## Decisions

- **Decision: Panel is an inline resizable right column scoped to the Graph tab, not a global overlay Sheet.**
  - The panel lives inside the Graph `TabsContent` in `ModelVisualization`, mirroring the existing left-sidebar pattern (`useResizablePanel` + `PanelResizeHandle`) already used on the models page. It slides in when a dataset is selected and collapses/closes via a toggle, leaving the graph canvas to reflow into the freed width.
  - Alternatives considered: `Sheet` overlay (used by `monitoring.tsx`). Rejected as the primary because an overlay floats above and obscures the graph, breaking the "click node → see it in context" flow and the graph's pan/zoom. A Sheet is also modal-ish on small screens. The inline column keeps node and details visible together.

- **Decision: Persist edits via a new granular `PATCH /:name/datasets/:datasetName` route, not full PUT-with-merge.**
  - The route accepts a partial dataset metadata payload (`description?`, `ai_context?`, and `fields?: Array<{ name, description?, ai_context? }>` keyed by field name). A new `SemanticModelFileService.updateDatasetMetadata` reads the single dataset YAML file, merges the provided metadata, preserves all other content (`source`, `primary_key`, `fields[].expression`, `custom_extensions`, `view_query`), and writes atomically (temp file + rename), consistent with `updateDatasetExtensions`.
  - Alternatives considered: PUT-with-merge (read cached `SemanticModelFull`, splice the edited dataset, PUT the whole model). Rejected: it races with the 10s refetch and the agent, rewrites every dataset file on each save, and risks clobbering concurrent agent edits to other datasets. The granular PATCH only touches the one dataset file, matching the existing extensions-PATCH precedent.

- **Decision: Selection state lives in `ModelVisualization`, lifted out of React Flow.**
  - `ModelGraphView` gains an `onSelectDataset(name | null)` callback wired to `onNodeClick`; `onPaneClick` clears selection. The selected dataset name and panel open/collapsed state are owned by `ModelVisualization` so the panel persists across node clicks and the panel content re-reads from the already-loaded `SemanticModelFull`.

- **Decision: Add explicit `ai_context` to frontend `DatasetFull` / `FieldFull` types.**
  - Replaces the current `[key: string]: unknown` cast access. The type mirrors `aiContextSchema` (string | `{ instructions?, synonyms?, examples? }`).

## Risks / Trade-offs

- **Stale edits vs 10s refetch / agent writes** → On successful save, invalidate the `["semantic-model", projectId, modelName]` query so the panel reflects the canonical file; last-write-wins per dataset file is acceptable for a single-user system.
- **Editing while the agent is streaming changes** → Save targets only the selected dataset file; other datasets are untouched. Acceptable given non-goals.
- **Field list size** → Datasets can have many fields; the field section is scrollable and field edits send only changed fields keyed by name.

## Migration Plan

Additive only. New API route + file-service method + new frontend component. No schema or data migrations. Existing YAML files remain valid; the PATCH merges into whatever metadata already exists.

## Open Questions

- Should `ai_context` be editable as raw structured fields (instructions/synonyms/examples) or a single instructions textarea in this iteration? Initial implementation edits the `instructions` string and the dataset `description`; full structured editing can follow.
