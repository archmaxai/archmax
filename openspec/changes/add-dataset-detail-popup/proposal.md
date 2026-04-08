# Change: Add dataset detail popup in graph view

## Why
When viewing a semantic model's graph, dataset nodes only show a compact preview (name, source, field count, truncated description, and up to 5 field previews). There is no way to inspect the full dataset details — AI context, validated queries, primary keys, field list, or connected relationships — without switching to the Tree or YAML tab. A click-to-inspect popup on graph nodes gives users full detail without leaving the graph.

## What Changes
- Add a slide-out sheet (right panel) that opens when a user clicks a dataset node in the graph view
- The sheet displays: dataset name, source, AI context (instructions, synonyms, examples), primary key, validated queries (description + SQL), full field list with types, and relationships connected to this dataset
- Extend the frontend `DatasetFull` type to explicitly include `primary_key`, `unique_keys`, and `ai_context` fields returned by the API
- Add a `parseValidatedQueries` helper in the frontend (mirroring the existing backend utility) to extract validated queries from `custom_extensions`
- Note: the graph tab is already the default view — no change needed there

## Impact
- Affected specs: semantic-model-agent
- Affected code:
  - `apps/frontend/src/components/model-visualization/types.ts` — extend `DatasetFull` with `primary_key`, `unique_keys`, `ai_context`
  - `apps/frontend/src/components/model-visualization/dataset-detail-sheet.tsx` (new) — sheet component with all dataset detail sections
  - `apps/frontend/src/components/model-visualization/model-graph-view.tsx` — add `onNodeClick` handler, pass model context to sheet
