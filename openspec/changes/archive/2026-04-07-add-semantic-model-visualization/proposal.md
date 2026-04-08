# Change: Add Semantic Model Visualization

## Why
When the AI agent creates or modifies a semantic model, users have no immediate visual feedback of the result. The current sidebar explorer only shows a collapsible tree for navigation — there is no way to see the YAML source, a structural overview, or dataset relationships at a glance. Users need a rich, multi-perspective visualization to understand, validate, and iterate on semantic models quickly.

## What Changes
- **New three-tab visualization view** replaces the chat content area when a semantic model or any of its items is clicked in the sidebar:
  1. **YAML Code tab** — syntax-highlighted YAML source of the selected model
  2. **Tree tab** — hierarchical tree of the full semantic model (datasets → fields, metrics, relationships) with hover tooltips showing individual property details
  3. **Graph tab** — interactive dataset-relationship diagram with draggable nodes; node positions are persisted as `custom_extensions` in the model YAML
- **Sidebar model list simplified** — models are no longer expandable in the side panel; clicking a model name opens the visualization view instead of expanding a subtree
- **Chat input retained** — the chat text input remains at the bottom of the page, continuing the active conversation (or starting a new one if none is selected), so users can iterate on models without navigating away
- **Change highlighting** — when the agent modifies a model, items that changed since the last version are visually highlighted in all three visualization tabs
- **`custom_extensions` schema addition** — datasets gain an optional `custom_extensions` array to store vendor-specific metadata (e.g. graph node positions) without polluting the core schema

## Impact
- Affected specs: `semantic-models` (custom_extensions schema), `semantic-model-agent` (chat interface and model interaction)
- Affected code:
  - `apps/frontend/src/components/semantic-model-explorer.tsx` — simplified to flat list with click-to-select
  - `apps/frontend/src/routes/_auth/$projectId/models.tsx` — layout changes: visualization view replaces chat outlet conditionally
  - New frontend components: YAML viewer, tree visualization, graph visualization, tab container
  - `packages/core/src/services/semantic-model-files.ts` — read/write `custom_extensions` passthrough
  - New dependency: graph rendering library (e.g. `@xyflow/react` for the dataset relationship diagram)
