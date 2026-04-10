## Context

The graph view renders semantic model datasets as React Flow nodes with Dagre auto-layout. There is no concept of grouping datasets visually. Users with 10+ datasets need to organize the graph into logical clusters. The AI agent already clusters by relationship during layout, but there is no persistent, named grouping.

This change spans the data layer (YAML model file + API), the frontend (React Flow rendering + context menu), and the agent prompt.

## Goals / Non-Goals

- **Goals:**
  - Persistent named groups stored in the model root YAML file
  - Visual bounding-box rectangles in the graph view
  - Right-click context menu for group CRUD operations
  - Agent auto-creates groups during model assembly
  - Groups survive model edits and re-layouts

- **Non-Goals:**
  - Nested groups (groups within groups)
  - Group-level permissions or access control
  - Collapsible/expandable groups (defer to future)
  - Drag-to-resize groups (bounding box auto-fits member datasets)

## Decisions

### Storage format

Groups are stored as a JSON array in a `COMMON` vendor extension on the **model root** file (not on individual datasets). This keeps group definitions centralized and avoids duplication across dataset files.

```yaml
# in <modelName>.yaml root file
custom_extensions:
  - vendor_name: COMMON
    data: '{"dataset_groups":[{"id":"grp_abc","name":"Sales","datasets":["orders","order_items","customers"],"color":"blue"},{"id":"grp_def","name":"Inventory","datasets":["products","warehouses"],"color":"purple"}]}'
```

Schema of a single group:
```typescript
interface DatasetGroup {
  id: string;        // stable unique ID, e.g. "grp_" + nanoid(8)
  name: string;      // user-visible label
  datasets: string[]; // dataset names belonging to this group
  color?: string;     // optional color hint from a fixed palette
}
```

**Alternatives considered:**
- Storing group membership on each dataset's `custom_extensions` — rejected because it scatters group info across files and makes rename/delete of a group require touching every member dataset file.
- Using React Flow's built-in parent-child grouping — rejected because it forces datasets into a parent node's coordinate space, which breaks the current independent positioning and Dagre layout. Instead, we render group rectangles as a non-interactive background layer computed from member positions.

### Rendering approach

Render groups as **background rectangles** computed from the bounding box of their member nodes, with padding. This is implemented as a custom React Flow node type `"group-box"` with `zIndex: -1` and `selectable: false`. The box position and dimensions are recomputed on every node position change.

- Rectangle style: `rounded-xl` border (matching design guide), semi-transparent fill, 1px border in group color
- Label: group name shown top-left inside the rectangle, `text-xs font-medium`
- Color palette: 8 predefined OKLCH colors from the Tailwind config, assigned round-robin or by user choice

**Alternatives considered:**
- SVG overlay outside React Flow — rejected because it doesn't pan/zoom with the canvas.
- React Flow `useViewport` + absolute positioned divs — fragile with zoom transforms. Background nodes are simpler and integrate naturally.

### Context menu

Use Radix `ContextMenu` (already available via `@archmax/ui`) triggered on right-click of dataset nodes. Menu items:

1. **Create group** — opens inline input for group name, creates group with the right-clicked dataset
2. **Add to group →** — submenu listing existing groups; clicking adds the dataset to that group
3. **Remove from group** — shown only when dataset belongs to a group; removes it (removes group if empty)
4. **Rename group** — shown only when dataset belongs to a group; opens inline rename input

The context menu also appears on the group background rectangle itself:
1. **Rename group** — inline rename
2. **Delete group** — removes group (datasets remain)

### API endpoint

New endpoint: `PATCH /api/projects/:projectId/semantic-models/:name/extensions`

Request body: `{ custom_extensions: Array<{ vendor_name: string; data: string }> }`

This mirrors the existing dataset-level `PATCH .../datasets/:datasetName/extensions` but operates on the model root file. The `SemanticModelFileService` gets a new `updateModelExtensions` method that reads the root YAML, patches `custom_extensions`, and atomically writes it back.

### Agent auto-grouping

The agent prompt gets a new section (step 9.5, between graph layout and validated queries) instructing the AI agent to:
1. Identify logical groups from schema prefixes, business domains, or star-schema topology
2. Write a `dataset_groups` array into the model root's COMMON extension
3. Assign colors from the palette
4. Keep groups to 2–6 datasets each (split if larger)

## Risks / Trade-offs

- **Group box flicker on drag** — recomputing bounding boxes during drag could cause visual jitter → Mitigation: debounce recalc to `requestAnimationFrame`, or only recompute on drag-stop.
- **Group persistence race** — saving group changes and dataset positions happen independently → Mitigation: group changes use the model-level PATCH, positions use dataset-level PATCH; no conflict.
- **Backward compatibility** — models without groups render identically to today; groups are purely additive.

## Open Questions

- Should groups have a max dataset count or warn when a group grows too large? (Suggest: advisory limit of 10, no hard enforcement)
