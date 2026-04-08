## Context

The MCP server exposes tools to AI agents authenticated via bearer tokens. Each token is scoped to specific semantic models. Today, the server only exposes metadata tools (list models, get fields). Adding an `execute_query` tool lets agents run SQL against the project's federated DuckDB instance, but this introduces a significant security surface: agents must only access data described in a single semantic model per query.

DuckDB has **no built-in RBAC** (no role/grant/revoke, no table-level permissions). This means we cannot rely on DuckDB itself to restrict which tables or columns a query touches. We need an application-level security architecture.

## Goals / Non-Goals

- **Goals:**
  - MCP `execute_query` tool that runs SQL against the project's DuckDB
  - Scoping: each call is scoped to a single semantic model via the required `modelName` parameter
  - VIEWs created per-model with simple `_scope."<datasetName>"` naming
  - Defense-in-depth security (no single layer relied upon)
  - Semantic model agent explicitly informed about read-only constraints

- **Non-Goals:**
  - Full SQL parser or query rewriter
  - DuckDB RBAC extension (doesn't exist yet)
  - Per-row security / row-level access control
  - Cross-model queries in a single `execute_query` call

## Decisions

### Decision: Per-model scoped DuckDB VIEWs

**What:** `execute_query` requires a `modelName` parameter. For each call, VIEWs are created in a `_scope` schema for the datasets of that single model. VIEW names follow the convention `_scope."<datasetName>"` — the dataset name alone, directly matching what agents see in `get_semantic_model` and `get_dataset` output.

**Why:** Scoping to a single model per call:
1. Simplifies VIEW names — no model prefix needed, since there's no cross-model ambiguity within one call
2. Makes VIEW names directly derivable from dataset names in the semantic model documentation
3. Aligns with the agent workflow: explore a model → query that model
4. Eliminates the dataset name collision problem across models (VIEWs are rebuilt per call for the selected model)

**How it works:**
1. Token authenticates → scopes resolve to a list of semantic model names
2. Agent calls `execute_query` with `modelName` and `sql`
3. Server validates `modelName` is in the token's scopes
4. Server reads the semantic model from disk and creates `CREATE OR REPLACE VIEW _scope."<datasetName>"` for each dataset with fields
5. The field expressions come from the OSI `expression.dialects[0].expression` values
6. SQL validation ensures queries only reference `_scope.*` tables (see next decision)

**VIEW lifecycle:** VIEWs are created using `CREATE OR REPLACE VIEW` on each `execute_query` call. Since the `_scope` schema is shared at the DuckDB instance level, switching models between calls replaces previous VIEWs with the same dataset names. This is correct: each call is self-contained for one model.

**Alternatives considered:**
- *Materialized tables (CTAS)*: Would copy data into DuckDB, consuming memory and adding latency. Views are zero-copy.
- *Multi-model scoping (previous design)*: Required `_scope.<modelName>__<datasetName>` naming, a dynamically generated tool description listing all VIEWs (redundant with model tools), and handling of cross-model dataset name collisions. Per-model scoping is simpler.
- *Caching VIEWs per model*: Could avoid re-creating VIEWs if the model hasn't changed. Deferred as an optimization — `CREATE OR REPLACE VIEW` is lightweight DDL.

### Decision: No VIEW listing in tool description

**What:** The `execute_query` tool description explains the `_scope."<datasetName>"` naming convention and how to use it, but does not enumerate all available VIEWs. Agents discover available datasets through `get_semantic_model` and `get_dataset`, which annotate each dataset with its VIEW name.

**Why:** Listing all VIEWs in the tool description was redundant with the information already provided by the semantic model tools. Since `execute_query` now scopes to a single model, the agent already knows which model it's querying and can derive VIEW names from dataset names shown in the model overview. This reduces tool description bloat and token cost.

### Decision: SQL validation as defense-in-depth

**What:** Before executing any MCP query, validate:
1. Only `SELECT`, `WITH`, `EXPLAIN`, `DESCRIBE` are allowed (always enforced)
2. No multi-statement queries (reject `;` followed by non-whitespace)
3. Reject queries that reference any raw attached catalog name (e.g., `shopify.public.orders`) — only `_scope.*` references are allowed

**Why:** VIEWs alone don't prevent a knowledgeable user from querying `catalog.schema.table` directly, since DuckDB exposes all attached catalogs. The catalog-name validation catches this. Together with VIEWs, this forms a two-layer defense.

**How the catalog validation works:**
- Get the list of attached catalog names from the project's connections (their slugs)
- Check if the SQL text contains any `<catalog_name>.` pattern (case-insensitive, word-boundary aware)
- Also reject `information_schema` references to prevent schema discovery of raw catalogs
- This is a heuristic (not a full parser), but combined with the read-only constraint and VIEWs, it is sufficient for the threat model

### Decision: DuckDB instance hardening

**What:** After attaching databases and creating VIEWs, apply:
- `SET enable_external_access = false` — prevents file reads, network access, COPY
- `SET lock_configuration = true` — prevents changing any settings after setup
- Resource limits: `SET threads = 2`, `SET memory_limit = '512MB'`

**Why:** Prevents side-channel attacks (reading `/etc/passwd` via `read_csv`, exfiltrating data via network). `lock_configuration` ensures these cannot be undone by injected SQL.

**Note:** These settings apply to the DuckDB connection, not the instance. Since MCP uses the shared project DuckDB instance (also used by data browser and agent), hardening must be applied **per-connection** for MCP queries, not at instance level. Each `execute_query` call opens a connection, applies hardening, runs the query, and closes the connection.

### Decision: Shared project DuckDB instance (no separate MCP instance)

**What:** Reuse the existing per-project DuckDB instance rather than creating a separate one for MCP.

**Why:** The project instance already has all connections attached. Creating a separate instance would require re-attaching databases (slow, duplicates credentials in memory). The security boundaries (VIEWs, SQL validation, per-connection hardening) provide adequate isolation without a separate instance.

### Decision: Read-only enforcement for all MCP queries

**What:** All `execute_query` calls are read-only:
- Databases are always attached with `READ_ONLY` flag
- `validateReadOnlySQL` is always applied (keyword allowlist: SELECT, WITH, EXPLAIN, DESCRIBE)
- The tool description explicitly states the read-only constraint

**Why:** DuckDB VIEWs are not writable (INSERT/UPDATE/DELETE on a VIEW fails), so even if write SQL were allowed past validation, it couldn't target `_scope.*` VIEWs. Meanwhile, catalog validation blocks direct references to raw tables. Enforcing read-only globally is simpler and more secure.

### Decision: Semantic model agent read-only reinforcement

**What:** Add explicit read-only instructions to the semantic model agent's system prompt and the dynamic connection context, so the agent knows it must only issue read queries.

**Why:** The agent already has `validateReadOnlySQL` enforcement (always applied), but the system prompt should explicitly state this constraint so the LLM doesn't attempt write operations (which would just fail and waste tokens).

## Risks / Trade-offs

- **Catalog name validation is heuristic**: A sufficiently crafted query might reference a catalog in a way the regex doesn't catch. Mitigation: `enable_external_access = false` and `lock_configuration = true` prevent the worst outcomes.
- **VIEW creation per call adds latency**: Creating VIEWs on each `execute_query` call adds overhead. Mitigation: VIEWs are lightweight DDL (no data copy), and semantic model files are small YAML. Can be cached per model hash in a future optimization.
- **Single-model scoping prevents cross-model joins**: Agents cannot join datasets from different models in one query. This is intentional — cross-model queries would require a different authorization model. Agents can make multiple `execute_query` calls for different models.
- **Per-connection hardening vs instance-level**: Hardening applies per DuckDB connection, not instance-wide. If DuckDB ever changes connection-vs-instance scoping of settings, this needs revisiting.
- **Read-only globally simplifies but limits**: Enforcing read-only for all MCP queries means tokens cannot create temp tables or staging data via DuckDB. Acceptable for analytical AI agents.

## Open Questions

- Should `execute_query` results be logged via `McpCallLog` (like other MCP tools)? **Yes**, including the SQL query and row count but not the full result data.
- Should the `_scope` schema VIEWs persist across calls or be created/dropped per call? **Created per call** using `CREATE OR REPLACE VIEW`. Since scoping is now per-model, VIEWs are rebuilt for the selected model each time. Future optimization: cache based on model file hash.
