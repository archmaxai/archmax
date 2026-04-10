# Change: Add dataset groups to graph view

## Why

Large semantic models with many datasets become hard to navigate in the graph view. Users need a way to visually organize datasets into logical groups (e.g. "Sales", "HR", "Inventory") with bounding-box rectangles. The AI agent should also auto-create sensible groups when assembling a model, so the graph is immediately readable.

## What Changes

- Store group definitions in the model root file's `custom_extensions` under vendor `COMMON` with a `dataset_groups` key
- Render groups as rounded-edge bounding-box rectangles behind their member datasets in the React Flow graph
- Add a right-click context menu on dataset nodes with actions: "Create group", "Add to group → [submenu]", "Remove from group"
- Support renaming groups via double-click on the group label or through the context menu
- Add a new API endpoint `PATCH /:name/extensions` for updating model-level custom extensions
- Add `updateModelExtensions` method to `SemanticModelFileService`
- Update the semantic model agent prompt to instruct AI agents to auto-create groups and include them in the YAML output

## Impact

- Affected specs: `semantic-models`, `semantic-model-agent`
- Affected code:
  - `apps/frontend/src/components/model-visualization/model-graph-view.tsx` — group rendering, context menu, group CRUD
  - `apps/frontend/src/components/model-visualization/dataset-node.tsx` — context menu trigger
  - `apps/frontend/src/components/model-visualization/types.ts` — group type definitions
  - `packages/core/src/services/semantic-model-files.ts` — `updateModelExtensions` method
  - `apps/api/src/routes/semantic-models.ts` — new PATCH endpoint for model extensions
  - `packages/core/prompts/semantic-model-agent.md` — agent instructions for auto-grouping
