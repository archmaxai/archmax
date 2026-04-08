# Change: Add Semantic Model Digest for Token-Efficient AI Consumption

## Why

The MCP server currently returns semantic models as raw JSON (serialized from YAML). A real-world model like the Shopify example has ~1,800 lines of YAML across its files, which serializes to ~3,500 tokens of JSON. Most of this is structural boilerplate (`expression.dialects[0].dialect: ANSI_SQL`, `custom_extensions[0].vendor_name: COMMON`, repeated nesting). AI agents consuming these models waste context window on structure rather than semantics. A compact markdown digest preserving all information (types, examples, enums, synonyms, instructions) achieves a ~3x token reduction while being more scannable for LLMs.

## What Changes

- **New `SemanticModelDigest` service** in `@semlayer/core` that compiles `SemanticModel` objects into two layers of compact markdown:
  - **Overview**: model description, dataset summary table, relationships as join paths, metrics table
  - **Dataset**: all fields as a compact list with inline types, enums, examples, synonyms, and instructions — paginated for large datasets
- **Modified MCP tools**: replace `get_semantic_model` (raw JSON) with `get_semantic_model_overview` (markdown overview) and replace `describe_dataset` with `get_dataset_fields` (markdown field list, paginated)
- **BREAKING**: MCP tool names and response format change from JSON to markdown text

## Impact

- Affected specs: `mcp-server`, `semantic-models`
- Affected code:
  - `packages/core/src/services/semantic-model-digest.ts` (new)
  - `apps/api/src/mcp/semlayer-server.ts` (tool definitions)
