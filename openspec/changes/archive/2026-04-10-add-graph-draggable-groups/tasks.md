## 1. Draggable Group Nodes

- [x] 1.1 Enable `draggable: true` on group-box nodes in `computeGroupBoxNodes` and set `selectable: true`
- [x] 1.2 Add an `onNodeDrag` handler in `ModelGraphView` that detects when a group-box node is being dragged, computes the delta from the previous position, and translates all member dataset node positions by that delta
- [x] 1.3 On `onNodeDragStop` for group-box nodes, persist the updated member dataset positions via the existing `saveNodePositions` function
- [x] 1.4 Add a grab/move cursor to the `GroupBoxNode` component to indicate it is draggable

## 2. Viewport State Persistence

- [x] 2.1 Create a `localStorage` helper to read/write viewport state keyed by `projectId:modelName`
- [x] 2.2 Use React Flow's `onMoveEnd` callback to save the current viewport (x, y, zoom) to `localStorage` on every pan/zoom end
- [x] 2.3 On mount, read the saved viewport from `localStorage` and pass it as `defaultViewport` instead of using `fitView`; fall back to `fitView` when no saved viewport exists
- [x] 2.4 Provide a "Reset view" button (or integrate with the existing Controls) to clear saved viewport and call `fitView`

## 3. Tab Preference Persistence

- [x] 3.1 Replace the in-memory `tabPreferences` Map in `model-visualization.tsx` with `localStorage` read/write keyed by model name

## 4. Validation

- [x] 4.1 Verify group drag moves all member datasets and persists their positions
- [x] 4.2 Verify viewport zoom/pan is restored on re-mount and page reload
- [x] 4.3 Verify tab preference survives page reload
- [x] 4.4 Verify first-time models still get `fitView` auto-layout
