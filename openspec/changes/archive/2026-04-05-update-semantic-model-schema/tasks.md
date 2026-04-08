## 1. Schema Changes

- [x] 1.1 Update `packages/core/src/services/semantic-model-schema.ts`: change field `expression` from `z.array(dialectExpressionSchema)` to `z.string()`, add `data_type` (optional string), `example_data` (optional string array, max 3), `distinct_values` (optional string array), remove `dimension` import and usage
- [x] 1.2 Update `packages/core/src/services/semantic-model-schema.ts`: change metric `expression` from `z.array(dialectExpressionSchema)` to `z.string()`
- [x] 1.3 Remove `dialectExpressionSchema` and `dimensionSchema` from `semantic-model-schema.ts` (dead code after 1.1/1.2)
- [x] 1.4 Clean up `packages/core/src/models/shared.ts`: remove `DIALECT_TYPES`, `DialectType`, `IDialectExpression`, `DialectExpressionSchema`, `IDimension`, `DimensionSchema` (only keep `IAIContext` and `AIContextSchema` if still used)
- [x] 1.5 Update Mongoose models `Field.ts` and `Metric.ts` to remove dialect expression and dimension references (or delete if fully superseded by file-based approach)

## 2. System Prompt

- [x] 2.1 Create `packages/core/prompts/semantic-model-assembly.md` with complete agent instructions: YAML schema reference, assembly workflow (explore → identify → map → detect enums → relationships → metrics), data type discovery via DuckDB, example data sampling, enum detection heuristics
- [x] 2.2 Export the prompt path or content from `@semlayer/core` so the agent backend can import it

## 3. Spec & Documentation Updates

- [x] 3.1 Update `openspec/project.md` to reflect the simplified schema (expression as string, new fields, no dimension)
- [x] 3.2 Update the YAML example in `openspec/changes/refactor-semantic-models-to-disk/design.md` if it hasn't been archived yet

## 4. Validation

- [x] 4.1 Run `tsc --noEmit` across the monorepo to verify no type errors
- [x] 4.2 Verify any existing YAML test fixtures conform to the new schema (or update them)
