# Change: Add Validated Queries Custom Extension for Datasets and Semantic Models

## Why

Semantic models describe structure (fields, types, relationships) but lack concrete query examples that demonstrate how to use the model effectively. AI agents consuming models via MCP must infer query patterns from field metadata alone, leading to incorrect joins, wrong aggregations, or missed filters. Storing pre-validated queries — each with a natural-language description and a DuckDB SQL query that has been executed successfully — provides a "cookbook" of proven patterns that downstream agents can reference or adapt.

## What Changes

- **New `validated_queries` convention** within the COMMON custom extension on both `Dataset` and `SemanticModel` entities. Each validated query is an object with `description` (what the query answers in business terms) and `query` (DuckDB SQL that has been tested against the data).
- **Dataset-level queries** demonstrate single-table patterns: filters, aggregations, and field usage for that specific dataset.
- **Model-level queries** demonstrate cross-dataset patterns: joins via declared relationships and metrics usage.
- **Semantic model agent** updated to generate and validate queries during model building — the agent runs each query via `executeQuery` before persisting it.
- **Digest service** updated to surface validated queries in the MCP markdown output so downstream agents can see them.

## Impact

- Affected specs: `semantic-models`, `semantic-model-agent`
- Affected code:
  - `packages/core/prompts/semantic-model-agent.md` (agent prompt — new workflow step)
  - `packages/core/src/services/semantic-model-digest.ts` (surface queries in digest)
  - `packages/core/src/services/semantic-model-files.ts` (no schema changes — uses existing custom_extensions)
