## 1. Backend — Model-Level Extensions API

- [x] 1.1 Add `updateModelExtensions(projectId, modelName, extensions)` method to `SemanticModelFileService` in `packages/core/src/services/semantic-model-files.ts` — reads root YAML, replaces `custom_extensions`, atomic write
- [x] 1.2 Add `PATCH /:name/extensions` route in `apps/api/src/routes/semantic-models.ts` — validates with `z.object({ custom_extensions: z.array(customExtensionSchema) })`, calls `updateModelExtensions`
- [x] 1.3 Write unit test for `updateModelExtensions` covering: success, model-not-found, preserving other root fields
- [x] 1.4 Write integration test for the PATCH endpoint

## 2. Frontend — Type Definitions and Group Utilities

- [x] 2.1 Add `DatasetGroup` interface to `apps/frontend/src/components/model-visualization/types.ts` — `{ id, name, datasets, color? }`
- [x] 2.2 Add `parseDatasetGroups(extensions?: CustomExtension[]): DatasetGroup[]` utility to extract groups from model-level extensions
- [x] 2.3 Add `serializeDatasetGroups(groups: DatasetGroup[], existingExtensions?: CustomExtension[]): CustomExtension[]` utility to merge groups back into extensions array
- [x] 2.4 Define color palette constant (8 OKLCH-based colors) for group bounding boxes

## 3. Frontend — Group Bounding Box Rendering

- [x] 3.1 Create `group-box-node.tsx` custom React Flow node type for rendering group bounding boxes — rounded-xl rectangle, semi-transparent fill, 1px border, group name label
- [x] 3.2 Compute group bounding box positions from member node positions in `model-graph-view.tsx` — add padding (24px each side), recompute on node changes
- [x] 3.3 Insert group-box nodes into React Flow with `zIndex: -1` and `selectable: false`, `draggable: false`
- [x] 3.4 Support double-click on group label for inline rename

## 4. Frontend — Context Menu

- [x] 4.1 Add right-click context menu on dataset nodes in `model-graph-view.tsx`
- [x] 4.2 Implement "Create group" action — inline input for name, create group with single dataset, save via PATCH
- [x] 4.3 Implement "Add to group → [submenu]" action — list existing groups, move dataset to selected group
- [x] 4.4 Implement "Remove from group" action — conditionally shown, remove dataset, prune empty groups
- [x] 4.5 Add context menu on group bounding box with "Rename group" and "Delete group" actions
- [x] 4.6 Wire all actions to persist changes via the model-level extensions PATCH endpoint

## 5. Frontend — Dagre Layout Group Awareness

- [x] 5.1 Update `autoLayout` to consider groups — uses Dagre compound graph with `setParent` to keep group members spatially adjacent

## 6. Agent Prompt — Auto-Grouping Instructions

- [x] 6.1 Add a section between "Graph Layout Positioning" and "Generate Validated Queries" in `packages/core/prompts/semantic-model-agent.md` instructing the agent to create `dataset_groups`
- [x] 6.2 Add a rule to the "Absolute Rules" section: "Always create dataset groups for models with 4+ datasets"
- [x] 6.3 Include an example YAML snippet showing `dataset_groups` in the model root `custom_extensions`

## 7. Documentation

- [x] 7.1 Update the documentation site with a section on dataset groups in the semantic model visualization guide
