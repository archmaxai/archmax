# Change: Draggable graph groups and browser view state persistence

## Why

Group bounding boxes in the graph viewer are currently static overlays that cannot be dragged as a unit. Users must individually reposition each dataset node to rearrange a group, which is tedious for large models. Additionally, zoom/pan viewport state and the active tab preference are lost on page reload, forcing users to re-navigate to their previous view every time.

## What Changes

- Make group bounding-box nodes draggable so that dragging a group translates all member dataset nodes together, then persists their positions
- Save the React Flow viewport (zoom level and pan offset) to `localStorage` per model, restoring it on re-mount instead of always calling `fitView`
- Persist the Graph/Tree/YAML tab preference to `localStorage` per model so it survives page reloads

## Impact

- Affected specs: `semantic-models` (graph view group rendering, new view state persistence)
- Affected code:
  - `apps/frontend/src/components/model-visualization/model-graph-view.tsx` (group drag logic, viewport persistence)
  - `apps/frontend/src/components/model-visualization/group-box-node.tsx` (make draggable, add drag cursor)
  - `apps/frontend/src/components/model-visualization/model-visualization.tsx` (localStorage tab preference)
