# Change: Batch get_dataset into get_datasets

## Why
An AI agent exploring a semantic model typically needs to inspect 2–5 datasets before composing a query. Today each dataset requires a separate `get_dataset` tool call, meaning 2–5 full LLM round-trips (prompt → response → tool execution → next prompt). Batching these into a single `get_datasets` call that accepts an array of dataset names cuts the round-trips to one, saving significant latency and token overhead during the most common MCP interaction pattern.

## What Changes
- **BREAKING**: Rename `get_dataset` → `get_datasets` and change `datasetName: string` to `datasetNames: string[]` (min 1, max 10)
- When multiple datasets are requested, return page 1 of each dataset digest concatenated with clear delimiters
- When a single dataset is requested, preserve the existing `page` parameter for deep field pagination
- Add a `SemanticModelDigest.datasets()` batch method that concatenates individual dataset digests
- Update `openspec/project.md` MCP tool list to reflect the new name

## Impact
- Affected specs: `mcp-server`
- Affected code:
  - `apps/api/src/mcp/semlayer-server.ts` — rename tool, update input schema and handler
  - `packages/core/src/services/semantic-model-digest.ts` — add batch `datasets()` method
  - `packages/core/src/services/semantic-model-digest.test.ts` — add batch tests
  - `openspec/project.md` — update tool list
