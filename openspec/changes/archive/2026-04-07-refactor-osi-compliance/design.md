## Context

The project stores semantic models as YAML files validated by Zod schemas. The current schema diverges from the [OSI core spec v0.1.1](https://github.com/open-semantic-interchange/OSI/blob/main/core-spec/osi-schema.json) in several ways: camelCase vs snake_case naming, plain-string expressions vs multi-dialect Expression objects, non-standard field properties (`data_type`, `example_data`, `distinct_values`), and missing OSI constructs (`dimension`, `custom_extensions`). This change brings the on-disk YAML format into full OSI compliance.

## Goals / Non-Goals

- Goals:
  - Produce YAML that validates against the OSI JSON Schema (modulo YAML-vs-JSON serialisation)
  - Preserve all project-specific enrichments (`data_type`, `example_data`, `distinct_values`) via `custom_extensions`
  - Migrate existing YAML data files in-place
  - Keep Zod schemas as the single source of truth for validation
- Non-Goals:
  - Adding multi-dialect support beyond `ANSI_SQL` (single-dialect is sufficient for DuckDB-first usage)
  - Implementing the top-level OSI document envelope (`version`, `semantic_model` array) — the project stores one model per file, not an interchange document
  - Changing the split-file storage layout (root + per-dataset files)

## Decisions

### 1. Dialect for expressions

- **Decision**: Use `ANSI_SQL` as the sole dialect for all expressions. DuckDB is highly ANSI SQL-compliant, and there is no `DUCKDB` entry in the OSI `Dialect` enum.
- **Alternatives**: Request OSI to add `DUCKDB` dialect (upstream dependency, deferred); use `DATABRICKS` (misleading).

### 2. Vendor name for project-specific extensions

- **Decision**: Use `COMMON` as the `vendor_name` for `data_type`, `example_data`, and `distinct_values`. The `COMMON` vendor in OSI is intended for generic, non-vendor-specific extensions.
- **Format**: `data` field contains a JSON string:
  ```yaml
  custom_extensions:
    - vendor_name: COMMON
      data: '{"data_type":"VARCHAR","example_data":["Active","Inactive"],"distinct_values":["Active","Inactive","Pending"]}'
  ```
- **Alternatives**: Use a custom vendor name like `"ARCHMAX"` (would fail OSI validation since it's not in the Vendor enum).

### 3. Expression shorthand in Zod

- **Decision**: The Zod schema accepts **only** the full OSI Expression object form. A one-time migration script converts all existing plain-string expressions.
- **Rationale**: Keeping a dual-form (string + object) would mean the on-disk files diverge from OSI again. Simplicity of "one format everywhere" outweighs the verbosity cost.
- **On-disk YAML example**:
  ```yaml
  fields:
    - name: total_price
      expression:
        dialects:
          - dialect: ANSI_SQL
            expression: "total_price"
  ```

### 4. `ai_context` — string or object

- **Decision**: The Zod schema uses a `z.union([z.string(), z.object({...})])` to accept both forms, matching OSI's `oneOf` definition.
- **Rationale**: OSI explicitly allows a plain string as a shorthand. Existing YAML files use the structured form, so no migration is needed — but the schema should accept strings for future simplicity.

### 5. `dimension` on fields

- **Decision**: Add optional `dimension: { is_time: boolean }` to the field schema. The agent prompts will instruct the AI to set `is_time: true` on timestamp/date fields.
- **Migration**: Existing fields with `data_type` containing `TIMESTAMP` or `DATE` will have `dimension: { is_time: true }` added during migration.

### 6. Mongoose models

- **Decision**: Update the Mongoose model interfaces and schemas to match the new naming (`from_columns`, `to_columns`, `primary_key`, `unique_keys`, `ai_context`). These models appear to be vestigial (semantic models are file-based), but keeping them in sync avoids confusion.

### 7. Migration strategy

- **Decision**: Write a one-time TypeScript migration script (`apps/api/src/scripts/migrate-osi.ts`) that:
  1. Reads all existing YAML files via `js-yaml`
  2. Renames camelCase keys to snake_case
  3. Wraps plain-string expressions in `{ dialects: [{ dialect: "ANSI_SQL", expression: "..." }] }`
  4. Moves `data_type`, `example_data`, `distinct_values` into `custom_extensions` with `vendor_name: COMMON`
  5. Adds `dimension: { is_time: true }` to timestamp/date fields (detected from `data_type` before moving it)
  6. Writes the transformed files back atomically
- **Rollback**: Keep a backup of the original files before migration (script creates `*.yaml.bak`).

## Risks / Trade-offs

- **Verbosity**: The Expression object form adds ~3 lines per field/metric in YAML. This is the cost of OSI compliance.
  → Mitigation: Agent prompts will generate the correct format; humans rarely hand-edit YAML.
- **Breaking change for pending proposals**: The `add-semantic-model-visualization` change uses `custom_extensions` with `vendor_name: "archmax"`. After this change, it must use `COMMON` (or another OSI-valid vendor).
  → Mitigation: Update that change's spec delta after this one lands.
- **MCP output format change**: Consumers of the MCP server will receive snake_case keys and Expression objects instead of plain strings.
  → Mitigation: MCP consumers are internal AI agents that adapt to the schema they receive.

## Open Questions

- Should the migration script also handle the (currently unused) Mongoose documents in MongoDB, or only the on-disk YAML files?
