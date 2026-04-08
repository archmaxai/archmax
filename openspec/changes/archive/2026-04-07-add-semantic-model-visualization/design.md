## Context
The Semantic Models page currently has a sidebar (conversation history + expandable model tree) and a chat content area. This change introduces a visualization view that replaces the chat content area when a model is selected, while keeping the chat input always visible at the bottom. This is a cross-cutting frontend change (new UI patterns, new components, new dependency) that also touches the YAML schema for position persistence.

## Goals / Non-Goals
- Goals:
  - Provide three complementary views of a semantic model (YAML source, tree, graph)
  - Persist graph node positions in the YAML without schema pollution (custom_extensions)
  - Highlight changes made by the agent so the user can see diffs at a glance
  - Keep the chat input always accessible for seamless model iteration
- Non-Goals:
  - Editing semantic models directly from the visualization (read-only views for now)
  - Full YAML editor with in-place editing (just a viewer with syntax highlighting)
  - Supporting custom_extensions beyond graph positions in this change (schema is generic, but only positions are written)

## Decisions

### Layout: Visualization replaces chat content, input remains
- **Decision**: When a model is selected in the sidebar, the main content area switches from the chat message list to the visualization tabs. The chat input bar stays fixed at the bottom.
- **Alternatives considered**: (a) Side-by-side split — rejected because it halves the space for both chat and visualization. (b) Modal/dialog — rejected because it breaks flow and hides context. (c) Separate route — rejected because it separates the "iterate" workflow (chat + view).
- **Implementation**: The `models.tsx` layout tracks a `selectedModel: string | null` state. When set, the Outlet (chat messages) is hidden and the visualization component is shown. When cleared (via close button or clicking the same model again), the chat reappears. The chat input component is lifted out of the chat component and rendered independently at the bottom.

### Sidebar: Flat model list (no expand)
- **Decision**: Remove the expand/collapse tree from the sidebar. Models are shown as a flat list with name only. Clicking selects and opens the visualization.
- **Rationale**: The expandable tree duplicates what the Tree tab does better, and expanding in a narrow sidebar is cluttered. The sidebar's role becomes navigation (select model or conversation), not exploration.

### Graph library: @xyflow/react (React Flow)
- **Decision**: Use `@xyflow/react` (v12+) for the dataset relationship graph.
- **Alternatives considered**: (a) D3 — powerful but low-level, significant boilerplate for interactive node graphs. (b) Cytoscape — heavier bundle, less React-native. (c) Custom SVG — too much effort for drag, zoom, pan.
- **Rationale**: React Flow is React-native, has built-in drag/zoom/pan, lightweight, widely adopted, and supports custom node rendering. Good fit for a relatively simple entity-relationship diagram.

### Position persistence: custom_extensions on datasets
- **Decision**: Store graph x/y positions as `custom_extensions` entries on each dataset:
  ```yaml
  datasets:
    - name: orders
      source: sales.public.orders
      primary_key: [order_id]
      custom_extensions:
        - vendor_name: archmax
          data: '{"graph_x": 250, "graph_y": 100}'
  ```
- **Rationale**: `custom_extensions` is a generic vendor-extension mechanism (inspired by OSI/dbt). Using a `vendor_name: "archmax"` entry with JSON `data` keeps the core schema clean and allows other vendors (e.g., dbt metadata) in the same array.
- **Read/write**: The file service already passes unknown top-level keys through (Zod `.passthrough()`). We add `custom_extensions` to the Zod dataset schema as an optional array so it is explicitly validated and not silently dropped.

### Change highlighting
- **Decision**: Track the previous model state in React state/ref. After an agent response that triggers a `semantic-models` query invalidation, diff the old and new model JSON. Mark changed datasets, fields, metrics, and relationships with a CSS highlight class that fades after a few seconds.
- **Scope**: Highlighting applies to all three tabs — YAML shows changed lines, Tree highlights changed nodes, Graph highlights changed dataset nodes.

### YAML syntax highlighting
- **Decision**: Use a lightweight approach — either `shiki` (already popular in the ecosystem) or a simple regex-based YAML highlighter to avoid heavy bundle. Since we only render YAML (not arbitrary languages), a purpose-built highlighter is acceptable.
- **Fallback**: If bundle size is a concern, render in a `<pre>` with CSS class-based highlighting for YAML keys, strings, and comments.

## Risks / Trade-offs
- **New dependency** (`@xyflow/react`) adds ~40-60 KB gzipped to the frontend bundle → acceptable for the value provided; tree-shakeable.
- **Position drift** — if a dataset is renamed, its custom_extension position is lost → acceptable; the graph auto-layouts on first open and positions are saved on drag.
- **Conflict with pending changes** — `add-streaming-chat` and `update-chat-tool-rendering` also touch `agent-chat.tsx` and the models layout → coordinate merge order; this change should go after those land since it restructures the layout further.

## Open Questions
- Should the tree tab show a "diff mode" toggle that persists the highlight, or should highlights always auto-fade?
- Should the graph support grouping datasets by connection/schema (colored regions)?
