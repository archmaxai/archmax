## 1. Zod Schema Updates

- [x] 1.1 Add `expressionSchema` — `z.object({ dialects: z.array(z.object({ dialect: z.enum(["ANSI_SQL", "SNOWFLAKE", "MDX", "TABLEAU", "DATABRICKS"]), expression: z.string().min(1) })).min(1) })`
- [x] 1.2 Add `customExtensionSchema` — `z.object({ vendor_name: z.enum(["COMMON", "SNOWFLAKE", "SALESFORCE", "DBT", "DATABRICKS"]), data: z.string() })`
- [x] 1.3 Add `dimensionSchema` — `z.object({ is_time: z.boolean() }).optional()`
- [x] 1.4 Update `aiContextSchema` — `z.union([z.string(), z.object({ instructions, synonyms, examples })])`
- [x] 1.5 Update `fieldSchema` — use `expressionSchema`, remove top-level `data_type`/`example_data`/`distinct_values`, add `dimension`, `custom_extensions`, rename `aiContext` → `ai_context`
- [x] 1.6 Update `datasetSchema` — rename `primaryKey` → `primary_key`, `uniqueKeys` → `unique_keys`, `aiContext` → `ai_context`, add `custom_extensions`
- [x] 1.7 Update `relationshipSchema` — rename `fromColumns` → `from_columns`, `toColumns` → `to_columns`, `aiContext` → `ai_context`, add `custom_extensions`
- [x] 1.8 Update `metricSchema` — use `expressionSchema`, rename `aiContext` → `ai_context`, add `custom_extensions`
- [x] 1.9 Update `semanticModelSchema` / `semanticModelRootSchema` — rename `aiContext` → `ai_context`, add `custom_extensions`
- [x] 1.10 Update exported TypeScript types (`SemanticModel`, `Dataset`, `Field`, `Relationship`, `Metric`)

## 2. File Service Updates

- [x] 2.1 Update `SemanticModelFileService` read/write to handle new snake_case keys and Expression objects
- [x] 2.2 Ensure `custom_extensions` is preserved on all entities during read/write
- [x] 2.3 Ensure empty `custom_extensions` arrays are omitted from YAML output
- [x] 2.4 Update AGENTS.md generation to reflect new field structure

## 3. Migration Script

- [x] 3.1 Create `apps/api/src/scripts/migrate-osi.ts` that transforms all existing YAML files
- [x] 3.2 Rename camelCase keys → snake_case (`aiContext`, `primaryKey`, `uniqueKeys`, `fromColumns`, `toColumns`)
- [x] 3.3 Wrap plain-string `expression` values in `{ dialects: [{ dialect: "ANSI_SQL", expression: "..." }] }`
- [x] 3.4 Move `data_type`, `example_data`, `distinct_values` into `custom_extensions` with `vendor_name: COMMON`
- [x] 3.5 Add `dimension: { is_time: true }` to fields whose data_type contains TIMESTAMP or DATE
- [x] 3.6 Create `.yaml.bak` backups before overwriting
- [x] 3.7 Make migration idempotent (skip files already in OSI format)
- [x] 3.8 Run migration on existing data in `apps/api/data/projects/`

## 4. Agent Prompts

- [x] 4.1 Update `packages/core/prompts/semantic-model-agent.md` — YAML examples, field properties table, schema reference
- [x] 4.2 Update `packages/core/prompts/semantic-model-assembly.md` — YAML schema section, field properties table, complete example

## 5. Mongoose Models (sync)

- [x] 5.1 Update `packages/core/src/models/Field.ts` — rename `aiContext` → `ai_context`, remove direct `data_type`/`example_data`/`distinct_values`, add `custom_extensions`, `dimension`
- [x] 5.2 Update `packages/core/src/models/Dataset.ts` — rename `primaryKey` → `primary_key`, `uniqueKeys` → `unique_keys`, `aiContext` → `ai_context`, add `custom_extensions`
- [x] 5.3 Update `packages/core/src/models/Relationship.ts` — rename `fromColumns` → `from_columns`, `toColumns` → `to_columns`, `aiContext` → `ai_context`, add `custom_extensions`
- [x] 5.4 Update `packages/core/src/models/Metric.ts` — rename `aiContext` → `ai_context`, add `custom_extensions`
- [x] 5.5 Update `packages/core/src/models/shared.ts` — update `IAIContext` type and `AIContextSchema`

## 6. Frontend

- [x] 6.1 Update `apps/frontend/src/components/semantic-model-explorer.tsx` — update TS interfaces to snake_case, handle Expression objects for display

## 7. MCP Server

- [x] 7.1 Verify `apps/api/src/mcp/semlayer-server.ts` returns OSI-compliant shapes (follows naturally from file service changes)

## 8. Validation

- [x] 8.1 Verify migrated YAML files parse correctly through the updated Zod schemas
- [x] 8.2 Run existing tests and fix any breakage from the naming/structure changes
- [x] 8.3 Test the agent prompt produces valid OSI-compliant YAML (manual smoke test)
