## Context

The `execute_query` MCP tool currently creates DuckDB VIEWs in a shared `_scope` schema on every call. This has two problems:

1. **Race condition** — Concurrent `execute_query` calls for different models within the same project share one `_scope` schema. If two calls overlap and both have a dataset named `orders`, the second call's `CREATE OR REPLACE VIEW` silently replaces the first call's view.
2. **Redundant work** — Views are recreated from scratch on every call even when the model hasn't changed. While DuckDB views are lightweight DDL, this is unnecessary overhead for repeated queries against the same model.

## Goals / Non-Goals

- **Goals:**
  - Eliminate cross-model interference by isolating each model's views in its own schema
  - Create views once and reuse them until the model changes
  - Validate SQL to prevent queries from reaching into other models' scoped schemas
  - Keep the change backward-compatible within the existing `execute_query` API contract (parameter shape unchanged)

- **Non-Goals:**
  - Materializing data into DuckDB (views remain zero-copy)
  - Pre-creating views at publish time (lazy creation on first access is sufficient and avoids coupling with the publish pipeline)
  - Per-session DuckDB instances (heavyweight, unnecessary with per-model schemas)

## Decisions

### Decision: Per-model schema naming convention

**What:** Each semantic model gets its own DuckDB schema named `_scope_<modelName>`. The model name is used directly — no additional encoding or hashing.

**Example:** Model "ecommerce" → schema `_scope_ecommerce`, views at `_scope_ecommerce."orders"`, `_scope_ecommerce."customers"`.

**Why:** The model name is already validated and unique within a project. Using it directly in the schema name makes the mapping transparent and debuggable. The `_scope_` prefix ensures no collision with attached catalog schemas.

**Agent SQL becomes:**
```sql
SELECT * FROM _scope_ecommerce."orders" WHERE status = $1
```

The agent already passes `modelName` as a parameter to `execute_query`, so referencing it in SQL is consistent and unsurprising. The `execute_query` tool description tells agents the convention.

**Alternatives considered:**
- *Hashed schema names* (`_scope_<sha256(modelName)[:8]>`): Avoids special character issues but is opaque. Model names are already safe identifiers in this system.
- *Session-scoped schemas* (`_scope_<sessionId>`): Solves concurrency but loses caching across sessions. Requires cleanup logic.

### Decision: Lazy creation with content-hash cache invalidation

**What:** Views are created lazily on the first `execute_query` call for a given model. A content hash of the model's YAML is stored alongside the schema metadata. On subsequent calls, the hash is compared — if unchanged, view creation is skipped entirely. If the model was re-published (hash changed), views are recreated.

**How it works:**
1. `execute_query` is called with `modelName`
2. System checks if schema `_scope_<modelName>` exists and its cached content hash matches the current model file
3. If match → skip view creation, proceed to query
4. If mismatch or missing → `CREATE SCHEMA IF NOT EXISTS`, then `CREATE OR REPLACE VIEW` for each dataset, store new hash

**Cache storage:** An in-memory `Map<string, { hash: string }>` keyed by `<projectId>:<modelName>`, colocated with the existing `projectInstances` map in `duckdb.ts`.

**Why not pre-create at publish time:** The DuckDB instance is in-memory and per-process — views don't survive restarts. Pre-creating at publish time would still need a lazy fallback for the first request after restart. Lazy-only is simpler with no additional coupling to the publish pipeline.

**Alternatives considered:**
- *Always recreate (current behavior in new schema)*: Solves concurrency but not redundant work. Minimal change but leaves performance on the table.
- *File watcher*: Overengineered for a single-user system. Polling the hash on each call is near-zero cost.

### Decision: SQL validation restricts to requested model's scope

**What:** `validateScopedSQL` gains a new parameter for the model name. In addition to blocking raw catalog references, it ensures that only `_scope_<modelName>.*` references are present — no other `_scope_*` schemas are accessible.

**Pattern:** The regex checks for any `_scope_` prefix that doesn't match the expected model name.

**Why:** Without this, a crafty agent or injected SQL could `SELECT * FROM _scope_analytics."revenue"` while claiming to query the "ecommerce" model. Per-model schemas only provide isolation if the validation layer enforces it.

## Risks / Trade-offs

- **Agent SQL change** — Existing agent prompts/examples that use `_scope."dataset"` need updating to `_scope_<modelName>."dataset"`. Mitigation: the tool description drives agent behavior, and `get_semantic_model` output annotates the correct VIEW names.
- **Model name characters** — Model names with characters that are invalid in DuckDB identifiers (spaces, dots) would break schema creation. Mitigation: model names in this system are already filesystem-safe slugs (snake_case). Add a sanitization step as a safety net.
- **Cache memory** — The hash map grows with `projects × models`. Mitigation: entries are trivially small (one short hash string per model per project). The existing `projectInstances` map already tracks per-project state.

## Open Questions

None at this time.
