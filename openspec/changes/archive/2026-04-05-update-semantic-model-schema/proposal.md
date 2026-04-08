# Change: Simplify semantic model schema for DuckDB-only and add agent assembly prompt

## Why

The current OSI-aligned schema carries multi-dialect expression arrays (`[{ dialect, expression }]`) that are redundant — all queries are DuckDB-abstracted. Fields also lack practical metadata (data types, example values, enum states) that agents need to build accurate semantic models. The `dimension.is_time` flag is redundant when the DuckDB data type already conveys temporality. Finally, there is no system prompt guiding agents on *how* to assemble semantic models from scratch.

## What Changes

- **BREAKING**: Field `expression` changes from `[{ dialect, expression }]` array to a plain `string` (DuckDB SQL expression)
- **BREAKING**: Metric `expression` changes from `[{ dialect, expression }]` array to a plain `string`
- **BREAKING**: Remove `dimension` object (and its `is_time` flag) from fields
- Add `data_type` field (string) to fields — DuckDB-specific data type (e.g. `VARCHAR`, `INTEGER`, `TIMESTAMP`, `BOOLEAN`)
- Add `example_data` field (array of 1–3 values) to fields — concrete sample values for AI context
- Add `distinct_values` field (array of strings) to fields — all distinct states for enum/status-like columns
- Create a global agent system prompt at `packages/core/prompts/semantic-model-assembly.md` that instructs agents on how to explore databases, identify enum fields, populate example data, and assemble well-formed YAML files

## Impact

- Affected specs: `semantic-models` (MODIFIED — YAML schema)
- Affected code:
  - `packages/core/src/services/semantic-model-schema.ts` — Zod schema changes
  - `packages/core/src/models/shared.ts` — remove `DIALECT_TYPES`, `DialectExpression`, `Dimension` types
  - `packages/core/src/models/Field.ts` — remove dialect expression and dimension references
  - `packages/core/src/models/Metric.ts` — remove dialect expression references
  - `packages/core/prompts/semantic-model-assembly.md` — new file
- Existing YAML files will need migration (any existing models must be converted to the new schema)
