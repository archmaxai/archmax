# Change: Align Semantic Model Schema with OSI Specification

## Why

The project's YAML schema for semantic models deviates from the [OSI (Open Semantic Interchange) core spec](https://github.com/open-semantic-interchange/OSI/blob/main/core-spec/osi-schema.json) in naming conventions, expression format, non-standard field properties, and missing OSI features. Aligning with OSI ensures interoperability with other tools that consume or produce OSI-compliant models, and moves project-specific enrichments (`data_type`, `example_data`, `distinct_values`) into the standard `custom_extensions` mechanism.

## What Changes

- **BREAKING** — Rename camelCase YAML keys to snake_case: `aiContext` → `ai_context`, `primaryKey` → `primary_key`, `uniqueKeys` → `unique_keys`, `fromColumns` → `from_columns`, `toColumns` → `to_columns`
- **BREAKING** — Change `expression` from plain string to OSI `Expression` object: `{ dialects: [{ dialect: "ANSI_SQL", expression: "..." }] }`
- **BREAKING** — Move `data_type`, `example_data`, `distinct_values` from top-level field properties into `custom_extensions` with `vendor_name: "COMMON"`
- Add `dimension` (with `is_time` boolean) support on fields per OSI spec
- Add `custom_extensions` support on all entities (Field, Dataset, Relationship, Metric, SemanticModel)
- Allow `ai_context` to be either a string or a structured object (OSI `AIContext` oneOf)
- Migrate all existing YAML data files to the new format
- Update Zod schemas, file service, agent prompts, frontend types, and Mongoose models

## Impact

- Affected specs: `semantic-models`, `semantic-model-agent`
- Affected code:
  - `packages/core/src/services/semantic-model-schema.ts` (Zod schemas)
  - `packages/core/src/services/semantic-model-files.ts` (file service read/write)
  - `packages/core/prompts/semantic-model-agent.md` (agent prompt)
  - `packages/core/prompts/semantic-model-assembly.md` (assembly prompt)
  - `apps/frontend/src/components/semantic-model-explorer.tsx` (frontend TS types)
  - `packages/core/src/models/Field.ts`, `Dataset.ts`, `Relationship.ts`, `Metric.ts` (Mongoose models)
  - `apps/api/data/projects/` (existing YAML data files — migration)
  - `apps/api/src/mcp/semlayer-server.ts` (MCP response shapes)
- Overlap: The pending `add-semantic-model-visualization` change adds `custom_extensions` on datasets only; this change generalises it to all entities.
