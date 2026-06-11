# Design — restructure-agent-platform

## Context

archmax currently presents itself as a database-semantics manager: connections are federated through DuckDB, semantic models are authored by a Deep Agents builder, and an arbitrary number of "test agents" (each with its own LLM credentials) can be exercised in a playground and batch test runs. The product vision is a **semantic process layer**: a project's output is an **agent scaffold** — a plugin-style filesystem consumed by an agent harness — and the project has exactly one agent whose quality is measured by the test suite. This change is mostly an information-architecture and configuration-model restructure; the existing LangChain Deep Agents playground/test-runner already provides the required test harness.

Constraints:

- Single-user system, MongoDB + YAML-files-on-disk storage, typed Hono RPC client (no raw fetch in frontend).
- The active change `add-llm-prompt-caching` touches `agent.ts` / `playground-agent.ts`; implementation must be sequenced against it.
- Spec conventions: settings pages use inline label+input grids; popups use `--popover` (page-grey) backgrounds; filters use ghost styling.

## Goals / Non-Goals

- **Goals**
  - Navigation that mirrors the process: Connections → Builder → Agent → Testing → MCP Access → Settings.
  - One agent per project, configured in Settings, used by playground and test runs.
  - Per-project LLM configuration for the builder with env fallback.
  - Formalize the project directory as an exportable, agent-authored plugin scaffold.
  - Surface failing tests where improvement work happens (Builder panel).
- **Non-Goals**
  - APIs connections and API Models (both ship as visible-but-disabled "soon" placeholders only).
  - A scaffold *generation pipeline* — the builder agent authors scaffold files directly with its existing filesystem tools.
  - Hosting or executing external harnesses; the export is a downloadable artifact.
  - Multi-agent support of any kind.

## Decisions

### D1 — Agent and builder LLM config live on the `Project` document

Two optional subdocuments: `builderLlm { baseUrl?, encryptedApiKey?, model? }` and `agentLlm { baseUrl, encryptedApiKey, model, systemPrompt }`. API keys reuse the AES-256-GCM encryption already used by `TestAgent`/`github.encryptedToken`, with the same SSRF validation rules for base URLs. A dedicated `llm-settings` route family handles GET (masked) / PUT (re-encrypt on new key) / test-connection, rather than overloading `PUT /api/projects/:id`, so key masking and partial updates stay isolated.

- *Alternative considered:* a singleton `ProjectAgent` collection — rejected; it resurrects the TestAgent shape and adds a join for no benefit in a single-user system.

### D2 — Builder resolution is per-field project → env; the agent requires explicit config

The builder keeps working out of the box via `AGENT_*` env vars; project values override field-by-field. The **agent** has no env fallback: it is the project's deliverable and its credentials are an explicit choice. Playground input and run-creation are blocked with a pointer to Settings → Agent until configured. This also makes the migration story honest (see D6).

### D3 — Scaffold lives at the project-directory root; data models move to `data_models/`

The existing project dir (`<ARCHMAX_DATA_DIR>/projects/<projectId>/`) *is* the agent filesystem and remains the `FilesystemBackend` root, so the builder can author scaffold files with no new tooling. The scaffold entries (`commands/`, `agents/`, `skills/`, `hooks/`, `scripts/`, `.mcp.json`) and `AGENTS.md` live at the root. The semantic model YAML files move out of the current `src/` directory into a dedicated **`data_models/`** subdirectory, matching the new "Data Models" product vocabulary and reserving room for a future `api_models/` sibling. Export excludes internal entries (`.git/`, `large_tool_results/`, `uploads/`, `duckdb.db*`, temp files) and includes `data_models/` plus the scaffold dirs.

- *Why rename `src/` → `data_models/`:* "src" is opaque and conflicts with the scaffold's plugin vocabulary; "Data Models" is the user-facing label in both the sidebar (Agent Scaffold → Data Models) and the dashboard card, so the on-disk directory should match. A sibling `api_models/` slot can later hold the "API Models (soon)" content without overloading `src/`.
- *Alternative considered:* keeping `src/` on disk and only relabeling it "Data Models" in the UI — rejected; the path leaks into the agent prompt, exports, and docs, so a mismatch between the on-disk name and the product term is a lasting source of confusion.
- *Alternative considered:* a single `scaffold/` subdirectory holding everything — rejected; it splits the agent filesystem from the project root and complicates the Git story which already versions the whole project dir.

### D4 — `.mcp.json` is platform-seeded with a token placeholder

Seeded on project creation and refreshed on slug change: an `archmax` MCP server entry pointing at the project's MCP endpoint, with `Authorization: Bearer ${ARCHMAX_MCP_TOKEN}`. Real tokens never reach the file (it is Git-versioned and exported). The builder may edit the file to add further servers; JSON validation on write protects `hooks/hooks.json` and `.mcp.json` the same way YAML validation protects models.

### D5 — Browser and Console become full-size overlay dialogs with `?tool=` deep links

The sidebar loses both entries; the Data Sources header hosts Browser (icon+text), Console (icon-only), Re-initialize schemas (icon-only). The dialogs are near-viewport-size with shadow, reusing the existing page components. A `tool=browser|console` search param on `/connections` opens the corresponding dialog so old routes can redirect losslessly and the dialogs stay deep-linkable.

### D6 — Migration drops all TestAgents (user decision: manual reconfiguration)

A schema migration **first backfills `TestRun.testAgentName`** from each run's `testAgent.name`, then soft-deletes every `TestAgent` document and unsets `TestCase.testAgent`. `TestRun.testAgent` becomes optional and is never populated afterwards (the soft-deleted ref would return nothing); run lists/detail render the `llmModel` snapshot for new runs and the `testAgentName` snapshot for legacy runs, falling back to a neutral "Legacy agent" label. Conversations: playground conversations are identified by a `playground: true` flag going forward; legacy `testAgent` references remain readable. Builder and Agent conversation histories are partitioned by the `playground` flag (Builder filters `playground: { $ne: true }`, replacing the old `testAgent: null` filter, so playground chats cannot leak into Build history).

Per-project agent/builder *configured* state is exposed on project-scoped, authenticated endpoints (the llm-settings GETs and the project payload), **not** on the global unauthenticated `/api/config` route, which has no `projectId` and would be wrong under multiple projects. API key material (including env secrets like `AGENT_API_KEY`) is never returned in any form — masked or otherwise; the UI shows only presence/source via `apiKeySet`/`apiKeySource`.

### D7 — "Failing tests" = latest result per test case

A test case is *failing* when the most recent `TestRun` embedded result for it has status `failed` or `error`. A new endpoint aggregates this (`latest-results`), powering the **Improvements & Testing** panel. No new persistent state is introduced — the registry is derived from existing `TestRun` data, so it can never drift.

## Risks / Trade-offs

- **Large rename surface** (routes, labels, docs, e2e selectors) → mitigated by keeping all backend route prefixes except `test-agents` stable, and adding redirects for moved frontend routes.
- **Removing TestAgent breaks the builder's `list_test_agents` tool and prompt flow** → tool removed and prompt updated in the same change; `create_test_case` is simplified rather than left referencing dead concepts.
- **Concurrent edit conflict with `add-llm-prompt-caching`** → no overlapping spec requirements; sequence implementation (rebase whichever lands second).
- **Export could leak secrets** → export uses a runtime denylist *and* secret-file exclusions (`.env*`, key/credential files) *and* a content scan that fails the export closed on secret patterns; `.mcp.json` is placeholder-only by construction, and `.mcp.json` writes reject literal credential values (only `${VAR}` placeholders allowed). Tests assert the fail-closed path and absence of `encryptedApiKey`/token material.
- **Blocking playground/test-runs until the agent is configured adds first-run friction** → mitigated by prominent empty states deep-linking to Settings → Agent.

## Migration Plan

1. Ship schema migration `00X-drop-test-agents`: backfill `TestRun.testAgentName` from each run's `testAgent.name`, then soft-delete all `TestAgent` docs and `$unset` `TestCase.testAgent`; otherwise leave `TestRun` documents intact.
2. Ship filesystem migration `migrate-data-models-layout.ts` (replaces `migrate-src-layout.ts`): on startup, for any project dir lacking `data_models/`, move model YAMLs into `data_models/` from the legacy `src/` directory (or, for very old projects, from the project root). `uploads/` and scaffold dirs are left in place. Idempotent and safe to re-run.
3. Seed `.mcp.json` for existing projects lazily (on first builder-agent start or settings save) and for new projects on creation.
4. Frontend redirects: `/testing/playground → /agent`, `/testing/agents → /settings/agent`, `/connections/data → /connections?tool=browser`, `/connections/console → /connections?tool=console`, `/data → /connections?tool=browser`.
5. Rollback: the TestAgent migration is destructive by user decision; the `data_models/` move is reversible by moving files back to `src/`. Rollback otherwise restores routes/UI only.

## Open Questions

- Should the scaffold export embed a generated `README.md` describing harness setup? (Lean yes, deferred to implementation detail of the export task.)
- Whether `uploads/` should optionally be includable in the export for harnesses that want source documents — excluded for now.
