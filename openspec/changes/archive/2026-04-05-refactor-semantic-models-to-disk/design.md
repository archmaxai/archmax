## Context

The `add-project-structure` change implemented semantic models as separate Mongoose collections (SemanticModel, Dataset, Field, Relationship, Metric) with OSI-aligned schemas. The new direction moves semantic models out of MongoDB entirely, storing them as self-contained YAML files on disk — one file per semantic model, organized in folders per project. Semantic models also become project-scoped rather than connection-scoped.

## Goals / Non-Goals

**Goals:**

- Store semantic models as YAML files in a per-project directory on disk
- Each project folder: `AGENTS.md` (auto-generated) + `<model-name>.yaml` files
- Configurable data directory via `SEMLAYER_DATA_DIR` env var (defaults to `./data/projects`)
- API reads/writes YAML files for semantic model CRUD
- MCP tools read semantic models from YAML files
- Semantic models become project-scoped (decoupled from connections)

**Non-Goals:**

- File watching / hot-reload when files change externally
- Git integration (auto-commit on change)
- Full OSI JSON Schema validation (deferred; Zod validation covers structural correctness)
- UI for semantic model editing (deferred)

## Decisions

### 1. Self-contained YAML per semantic model

**Decision:** Each `.yaml` file contains the full model: metadata, datasets (with inline fields), relationships, and metrics.

**Rationale:** Keeps each model atomic — easy to copy, move, version, or share. No cross-file references to manage. Mirrors how dbt and other semantic layer tools organize model definitions.

**Alternatives considered:**
- Separate files per dataset/metric (more granular but harder to reason about as a unit)
- Single large YAML per project (loses per-model granularity)

### 2. Project folder named by MongoDB `_id`

**Decision:** Each project folder is named by the project's MongoDB `_id` string.

**Rationale:** The `_id` is immutable and unique. Avoids folder renaming when the project title changes.

**Alternatives considered:**
- Slug-based naming (requires uniqueness enforcement and rename handling)
- UUID-based (less readable but equally immutable — `_id` is already available)

### 3. AGENTS.md auto-generation

**Decision:** The `AGENTS.md` file is auto-generated whenever semantic models change via the API. It summarizes the project's semantic models for AI assistants.

**Rationale:** Keeps the AI context file in sync with actual models without manual effort. AI assistants (via MCP) can read this file for a quick project overview.

### 4. Atomic writes via temp-file + rename

**Decision:** YAML files are written to a temporary file first, then renamed to the target path.

**Rationale:** Prevents partial writes from corrupting files if the process crashes mid-write. `rename()` is atomic on the same filesystem.

### 5. Zod schemas for YAML validation

**Decision:** Reuse the TypeScript interfaces from `shared.ts` and define corresponding Zod schemas for parsing/validating YAML content.

**Rationale:** Single source of truth for the shape of semantic model data. Zod provides runtime validation with descriptive errors.

### 6. SemanticModelFileService in `@semlayer/core`

**Decision:** A new service class in `packages/core/src/services/` handles all file I/O: list, read, write, delete YAML files, and AGENTS.md generation.

**Rationale:** Centralizes file operations so both API routes and MCP tools use the same logic. Keeps the service testable in isolation.

## YAML Structure

```yaml
name: "sales_model"
description: "Sales data semantic model"
aiContext:
  instructions: "Main model for retail sales analytics"
  synonyms: ["sales", "revenue"]
  examples: ["What are total sales by region?"]
datasets:
  - name: "store_sales"
    source: "tpcds.public.store_sales"
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

- **No transactional guarantees** for multi-file operations — mitigated by atomic single-file writes (temp + rename) and single-user system assumption
- **File I/O latency** vs MongoDB queries — acceptable since semantic models are written rarely and read infrequently; the dataset is small
- **No soft-delete** — files are deleted permanently; undo requires git history or backups. Acceptable for a single-user tool with git-based workflows
- **Concurrent writes** — not a concern for single-user system; could add file locking later if needed

## Migration Plan

1. Create `SemanticModelFileService` and Zod schemas
2. Rewrite API routes to use file service
3. Update MCP tools to read from files
4. Remove Mongoose models (SemanticModel, Dataset, Field, Relationship, Metric)
5. Remove cascade soft-delete of semantic models from connection delete route
6. Update `project.md` and `.env.example`

## Open Questions

None — resolved during proposal discussion.
