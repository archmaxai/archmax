## Context

MCP tools serve as the interface for AI agents to discover and query semantic model metadata. The current `get_semantic_model_overview` tool returns a monolithic markdown block containing all datasets, relationships, and metrics. For small models this is fine, but large models (50+ datasets, 100+ relationships) produce responses that consume excessive context window tokens. The current `get_dataset_fields` tool paginates at 25 fields per page, which forces extra round-trips for typical datasets.

Separately, the tool names don't follow a clean `verb_entity` convention — `get_dataset_fields` implies it returns only fields, when it actually returns a full dataset digest including metadata and validated queries.

## Goals / Non-Goals

- Goals:
  - Clean tool names that describe what they return
  - Independent pagination for each section (datasets, relationships, metrics) so agents can drill into large sections without re-fetching everything
  - Sensible default page size that balances context usage and round-trip count
  - Backwards-compatible scoping: the default (no scope) call returns a useful overview without requiring the caller to know about scopes

- Non-Goals:
  - Adding new data to the digest output (content stays the same)
  - Making the digest machine-parseable (it remains LLM-optimized markdown)
  - Paginating validated queries (they're typically small)

## Decisions

### Tool naming

- `get_semantic_model_overview` → `get_semantic_model`: the overview nature is implicit — this is the primary way to inspect a model. Adding `scope` makes it flexible enough to return both overviews and section drilldowns.
- `get_dataset_fields` → `get_dataset`: the tool already returns dataset metadata, description, AI context, validated queries — not just fields. The name `get_dataset` accurately reflects this.

### Scoped pagination on `get_semantic_model`

- New parameter: `scope` (optional, enum: `"datasets"`, `"relationships"`, `"metrics"`)
- New parameter: `page` (optional, default 1)
- **No scope (default)**: returns the complete overview — model header, first page of datasets, first page of relationships, first page of metrics. Any section that exceeds 50 items includes a truncation hint directing the agent to use scoped pagination for more.
- **With scope**: returns only the specified section with pagination at 50 items per page. The model header (name, description, ai_context) is always included for context.

Alternatives considered:
- **Separate tools per section** (e.g. `get_model_datasets`, `get_model_relationships`): rejected because it fragments the tool surface area and makes discovery harder for agents. A single tool with a scope parameter is more discoverable.
- **Single flat page across all sections**: rejected because sections have different sizes and importance. Paginating relationships independently from datasets is more useful.
- **Cursor-based pagination**: rejected as over-engineering. The data is static during a session and page numbers are simpler for agents to reason about.

### Page sizes

| Context | Current | Proposed |
|---------|---------|----------|
| `get_dataset` fields | 25 | 50 |
| `get_semantic_model` datasets | ∞ (no pagination) | 50 |
| `get_semantic_model` relationships | ∞ (no pagination) | 50 |
| `get_semantic_model` metrics | ∞ (no pagination) | 50 |

50 items per page is the sweet spot: most models have <50 items per section (so the default call returns everything), but the mechanism exists for larger models.

### Digest service changes

- `SemanticModelDigest.overview(model, options?)` gains an optional options object: `{ scope?: "datasets" | "relationships" | "metrics"; page?: number }`. Returns `DigestPage` instead of `string` to include pagination metadata.
- `FIELDS_PER_PAGE` constant increases from 25 to 50.
- When scope is set, only that section is rendered. When omitted, all sections render (truncated at 50 each).

## Risks / Trade-offs

- **Breaking change for MCP consumers**: agents using the old tool names will get "unknown tool" errors. Acceptable because the only consumers are AI agents, tool discovery via `tools/list` handles the transition, and the new names are strictly better.
- **Larger default response**: increasing page size from 25 to 50 means a single page carries more tokens. The trade-off is fewer round-trips, which is usually better for agent workflows.
- **Scope parameter complexity**: adds a parameter to a tool. Mitigated by making it optional — the default call works without knowing about scopes.

## Open Questions

- None currently.
