## Context

The semantic model YAML schema was originally aligned with the OSI Core Metadata Spec, which supports multi-dialect SQL expressions (ANSI_SQL, Snowflake, MDX, etc.). In practice, all queries in this system are federated through DuckDB — there is no need for dialect-specific expressions. The schema also lacks fields that agents need when building models: concrete data types, example values, and enumeration states. The `dimension.is_time` boolean is redundant when `data_type` conveys temporal semantics (TIMESTAMP, DATE, etc.).

## Goals / Non-Goals

**Goals:**
- Flatten field/metric `expression` from `[{ dialect, expression }]` to a plain string
- Add `data_type`, `example_data`, and `distinct_values` to the field schema
- Remove `dimension` object entirely
- Create a system prompt that agents use when assembling semantic models
- Update Zod validation schemas to match

**Non-Goals:**
- Full OSI spec compliance (we're intentionally diverging for DuckDB-only simplicity)
- Migrating existing YAML files automatically (manual or scripted migration is acceptable)
- Changing the file service, API routes, or MCP tools (they pass through whatever the schema defines)

## Decisions

### 1. Expression as plain string

**Decision:** `expression` becomes `z.string()` instead of `z.array(dialectExpressionSchema)`. The string contains a DuckDB-compatible SQL expression (typically just the column name, e.g. `"customer_id"`).

**Rationale:** Every query goes through DuckDB. Multi-dialect support adds complexity with zero benefit. The OSI spec's dialect array was designed for tools that generate SQL for different backends — we always generate DuckDB SQL.

**Alternatives considered:**
- Keep dialect array with only `DUCKDB` — still over-engineered for a single-dialect system
- Remove expression entirely and use field name — too limiting for computed/derived fields

### 2. New field properties

**Decision:** Three new optional properties on the field schema:

| Property | Type | Purpose |
|---|---|---|
| `data_type` | `string` | DuckDB data type (e.g. `VARCHAR`, `INTEGER`, `TIMESTAMP`, `DECIMAL(10,2)`) |
| `example_data` | `string[]` (1–3 items) | Concrete sample values for the field |
| `distinct_values` | `string[]` | All distinct states for enum/status columns |

All three are optional to allow incremental model building. `data_type` and `example_data` should be populated for every field; `distinct_values` only for low-cardinality categorical columns.

**Rationale:** Agents need this metadata to understand what a column contains. `data_type` replaces the coarse `is_time` boolean with full DuckDB type information. `example_data` gives the agent (and consuming AI tools) concrete examples without querying the database. `distinct_values` is critical for status/enum fields where the set of possible values is important for accurate query generation.

### 3. Drop dimension object

**Decision:** Remove the entire `dimension: { is_time }` object from the field schema.

**Rationale:** The `is_time` flag was the only property in the dimension object. With `data_type` present, temporal fields are identifiable by their type (`DATE`, `TIMESTAMP`, `TIMESTAMP WITH TIME ZONE`, etc.). The dimension object is an empty wrapper.

### 4. System prompt location

**Decision:** Store the prompt at `packages/core/prompts/semantic-model-assembly.md`. The file is a markdown document with structured instructions for agents.

**Rationale:** `packages/core` is the shared package consumed by both the API (agent backend) and potentially other tooling. Markdown is human-readable, version-controlled, and easy for agents to consume. The `prompts/` directory establishes a convention for future prompt files.

**Content outline:**
1. What a semantic model is and its YAML structure
2. Step-by-step assembly workflow (explore schema → identify tables → map fields → detect enums → add relationships → define metrics)
3. How to populate `data_type` (query `DESCRIBE` or `information_schema`)
4. How to populate `example_data` (sample query with `LIMIT 3`)
5. How to detect and populate `distinct_values` (query distinct values for low-cardinality columns)
6. The complete YAML schema reference with examples

## Updated YAML Structure

```yaml
name: "sales_model"
description: "Sales data semantic model"
aiContext:
  instructions: "Main model for retail sales analytics"
  synonyms: ["sales", "revenue"]
  examples: ["What are total sales by region?"]
datasets:
  - name: "store_sales"
    source: "public.store_sales"
    primaryKey: ["ss_item_sk", "ss_ticket_number"]
    uniqueKeys: []
    description: "Store sales fact table"
    aiContext:
      instructions: "Main fact table for retail sales"
    fields:
      - name: "sold_date"
        expression: "ss_sold_date_sk"
        data_type: "INTEGER"
        example_data: ["2451119", "2451120", "2451121"]
        label: "Sale Date Key"
        description: "Foreign key to date dimension"
      - name: "customer_key"
        expression: "ss_customer_sk"
        data_type: "INTEGER"
        example_data: ["12345", "67890"]
        description: "Foreign key to customer"
      - name: "order_status"
        expression: "ss_order_status"
        data_type: "VARCHAR"
        example_data: ["shipped", "pending", "cancelled"]
        distinct_values: ["shipped", "pending", "cancelled", "returned", "processing"]
        description: "Current status of the order"
relationships:
  - name: "sales_to_customer"
    from: "store_sales"
    to: "customer"
    fromColumns: ["ss_customer_sk"]
    toColumns: ["c_customer_sk"]
metrics:
  - name: "total_sales"
    expression: "SUM(store_sales.ss_ext_sales_price)"
    description: "Total sales revenue"
```

## Risks / Trade-offs

- **Breaking change** — existing YAML files (if any) must be migrated. Acceptable since the system is pre-production and single-user.
- **Divergence from OSI spec** — intentional. The OSI dialect array is designed for multi-engine portability which we don't need. We can always re-add dialect support later if needed.
- **`distinct_values` staleness** — enum states could change in the source database after the semantic model is built. Agents should re-explore when instructed. Not a runtime concern since semantic models are metadata, not query-time config.

## Open Questions

None.
