## 1. Schema & Backend

- [x] 1.1 Add `custom_extensions` to the Zod dataset schema in `packages/core` (optional array of `{ vendor_name: string, data: string }`)
- [x] 1.2 Verify `SemanticModelFileService` read/write preserves `custom_extensions` (write a test)
- [x] 1.3 Add API endpoint `PATCH /api/projects/:projectId/semantic-models/:modelName/datasets/:datasetName/extensions` to update custom_extensions for a single dataset
- [x] 1.4 Add API endpoint `GET /api/projects/:projectId/semantic-models/:modelName/yaml` that returns the assembled YAML source as a string

## 2. Frontend — Layout & Sidebar

- [x] 2.1 Add `selectedModel` state to `models.tsx` layout
- [x] 2.2 Simplify `SemanticModelExplorer` to flat list with click-to-select behavior (remove expand/collapse tree)
- [x] 2.3 Update `models.tsx` layout to conditionally show visualization or chat messages based on `selectedModel`
- [x] 2.4 Lift chat input out of `AgentChat` into the models layout so it renders independently of the content area

## 3. Frontend — YAML Code Tab

- [x] 3.1 Create `ModelYamlView` component that fetches and displays syntax-highlighted YAML
- [x] 3.2 Add YAML syntax highlighting (lightweight approach: shiki or regex-based)

## 4. Frontend — Tree Tab

- [x] 4.1 Create `ModelTreeView` component with full hierarchical tree (model → datasets → fields, metrics, relationships)
- [x] 4.2 Add hover tooltips/popovers on leaf items showing all properties (expression, data_type, example_data, description, aiContext)

## 5. Frontend — Graph Tab

- [x] 5.1 Install `@xyflow/react` dependency
- [x] 5.2 Create `ModelGraphView` component with dataset nodes and relationship edges
- [x] 5.3 Design custom dataset node component (shows dataset name, field count, source)
- [x] 5.4 Implement auto-layout for models without saved positions (e.g. dagre or elkjs)
- [x] 5.5 Implement drag-to-reposition with position save to custom_extensions via API
- [x] 5.6 Restore saved positions from custom_extensions on graph open

## 6. Frontend — Tab Container & Integration

- [x] 6.1 Create `ModelVisualization` tab container component (YAML Code / Tree / Graph)
- [x] 6.2 Wire tab selection persistence (session-level, e.g. React state)
- [x] 6.3 Integrate `ModelVisualization` into `models.tsx` layout

## 7. Change Highlighting

- [x] 7.1 Track previous model state in a ref (snapshot before agent response triggers refetch)
- [x] 7.2 Compute diff between old and new model JSON (added/modified/removed items)
- [x] 7.3 Apply highlight CSS classes in Tree tab for changed nodes
- [x] 7.4 Apply highlight markers in YAML Code tab for changed lines
- [x] 7.5 Apply highlight styling in Graph tab for changed dataset nodes
- [x] 7.6 Implement fade-out animation (5s timeout + CSS transition)
