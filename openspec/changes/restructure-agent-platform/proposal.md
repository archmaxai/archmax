# Change: Restructure archmax as a Semantic Process Layer (Agent Platform)

## Why

archmax is repositioning from "a tool that manages semantic descriptions of databases" to a **semantic process layer**: each project produces an **agent scaffold** — a plugin-style filesystem (skills, subagents, commands, hooks, MCP definition) plus data models — that is consumed by an agent harness. The current UI taxonomy (Data Federation / Semantic Models / Testing with multiple ad-hoc test agents) does not communicate this. The product has *one* builder (authors the scaffold) and *one* agent per project (the deliverable, exercised in the playground and by the test harness). Navigation, settings, and the testing area must be restructured around that mental model.

## What Changes

### Navigation & shell

- Rename the **Data Federation** sidebar group to **Connections**, containing **Data Sources** and a greyed-out, inactive **APIs** entry with a "soon" tag. Browser and Console leave the sidebar.
- Rename the **Semantic Models** main-menu item to **Builder** (route `/$projectId/models` unchanged).
- Add a new top-level **Agent** menu item at `/$projectId/agent` hosting the playground (moved from `/$projectId/testing/playground`).
- **Testing** group shrinks to **Test Cases** and **Test Runs** (Test Agents page removed, Playground moved).
- **Settings** becomes a collapsible group: **General** (`/settings`), **Builder** (`/settings/builder`), **Agent** (`/settings/agent`).

### Data Sources page (headline tools)

- The Data Sources page header gains: a **Browser** button (icon + text), a **Console** icon-only button, and an icon-only **Re-initialize schemas** button. Browser and Console open as full-width/full-height overlay dialogs with shadow; reinit executes directly (current behavior, icon-only). Old routes (`/connections/data`, `/connections/console`, legacy `/data`) redirect to `/connections?tool=browser|console`.

### Builder side panel

- The left panel's "Semantic Models" section becomes **Agent Scaffold** with sub-entries **Data Models** (the current model list) and **API Models** (greyed out, "soon" tag).
- The "Chat" section is renamed **Build**.
- "Improvement Requests" is renamed **Improvements & Testing** and additionally lists the project's currently failing test cases (latest run result `failed`/`error`), each linking to the failing run and offering a Refine-style prefill into the Build chat.

### Single project agent (**BREAKING**)

- Multiple test agents are no longer supported; each project has exactly **one** agent. The `TestAgent` model, its CRUD API (`/api/projects/:projectId/test-agents`), and the Test Agents page are removed.
- The agent's configuration (OpenAI-compatible base URL, API key, model name, system prompt) moves to **Settings → Agent** with a test-connection button. **Migration: all existing TestAgent documents are dropped; the user reconfigures the agent manually in Settings.** `TestCase.testAgent` is removed; historical `TestRun` documents stay readable.
- Playground and test runs always execute with the project agent; both are blocked with a clear pointer to Settings → Agent while it is unconfigured.

### Per-project builder LLM settings

- **Settings → Builder** stores per-project overrides for the builder LLM (base URL, API key, model) with a test-connection button. Resolution is per-field: project value → env (`AGENT_API_BASE_URL` / `AGENT_API_KEY` / `AGENT_MODEL`). The "agent not configured" banner becomes project-aware and points at the settings pages.

### Agent scaffold (new capability)

- The project directory is formalized as a plugin-style **agent filesystem** authored directly by the builder agent (no generation pipeline): `commands/`, `agents/`, `skills/<name>/SKILL.md`, `hooks/hooks.json`, `scripts/`, and `.mcp.json`, alongside `AGENTS.md` and a dedicated **`data_models/`** directory for the semantic model YAML files.
- Semantic model files move from the current `src/` directory into `data_models/` (file service, agent backend, and publish assembly updated; a startup migration relocates existing `src/` content). This matches the "Data Models" product label and reserves a future `api_models/` sibling.

### Build step removal (**BREAKING**)

- The disk **build step** (`PublishService.assemble()` → `build/` single-file YAMLs) is removed entirely. MCP tools surface models as **markdown** (`SemanticModelDigest`) and assemble in memory on demand, so the materialized full-YAML artifact is unnecessary.
- Production MCP now reads the **live `data_models/`** (in-memory assembly, the same path the test endpoint already uses) instead of a published `build/` snapshot — models are available via MCP as soon as they are saved.
- **Publish becomes pure Git versioning**: commit `data_models/`+scaffold, record a `PublishEvent`, optionally push. `hasUnpublishedChanges` becomes a "pending version-control changes" signal; publish UI copy is reframed away from "make available via MCP".
- A **startup migration** removes any existing `build/` directory; `.gitignore` no longer excludes `build/`.
- `.mcp.json` is seeded and maintained by the platform, pointing at the project's MCP endpoint with an env-var token placeholder (never a real token).
- The builder's file backend gains JSON syntax validation on write (mirroring the existing YAML validation).
- A scaffold export endpoint (`GET /api/projects/:projectId/scaffold/export`) downloads the scaffold as a zip for use in external Deep-Agents-compatible harnesses; an Export action is available in the Agent Scaffold panel. The existing LangChain Deep Agents playground/test-runner remains the built-in test harness.

### Builder agent tool changes (**BREAKING**)

- `list_test_agents` tool removed; `create_test_case` loses `testAgentId`; `list_test_cases` no longer reports agent assignment.

## Impact

- Affected specs: `frontend-shell`, `connection-management-ui`, `data-browser`, `duckdb-console`, `testing-suite`, `semantic-model-agent`, `semantic-models`, `semantic-model-publishing`, `mcp-server`, `project-git-versioning`, `project-management`, `home-dashboard`, and new capability `agent-scaffold`.
- Affected code:
  - `apps/frontend/src/components/layout/app-sidebar.tsx` (nav restructure)
  - `apps/frontend/src/routes/_auth/$projectId/` — `connections/*`, `models.tsx`, `testing/*`, new `agent.tsx`, `settings*` (route moves, overlay dialogs, panel restructure)
  - `packages/core/src/models/` — remove `TestAgent.ts`, edit `Project.ts`, `TestCase.ts`, `TestRun.ts`, `Conversation.ts`
  - `apps/api/src/routes/` — remove `test-agents.ts`; add `llm-settings.ts`, `scaffold.ts`; edit `test-cases.ts` (latest-results), `test-runs.ts`, `playground.ts`, `projects.ts` (per-project `builder/agentConfigured`; not the global `config` route)
  - `packages/core/src/services/` — `agent.ts`, `playground-agent.ts`, `test-runner.ts`, `agent-tools.ts`, `git.ts` (drop `build/` from `.gitignore`, scaffold ignore rules), `SemanticModelFileService` (`src/` → `data_models/`), `publish.ts` (remove `assemble()`/`cleanStaleFiles()`, keep `computeSourceHash()` over source), filesystem backend validation
  - `apps/api/src/mcp/archmax-route.ts` (read live `data_models/` in both prod and test routes; drop `build/` read and temp-assembly), `apps/api/src/utils/publish-flow.ts` (no assemble before commit)
  - `apps/api/src/scripts/` — replace `migrate-src-layout.ts` with `migrate-data-models-layout.ts` (`src/` → `data_models/`); startup `build/` cleanup
  - `apps/worker/src/processor.ts` (playground branching without testAgentId)
  - Schema migration (backfill `TestRun.testAgentName`, then drop TestAgents, unset `TestCase.testAgent`)
  - `apps/docs` (navigation, testing, settings, new agent-scaffold guide)
- Coordination: the active change `add-llm-prompt-caching` also edits `packages/core/src/services/agent.ts` and `playground-agent.ts`. No spec-requirement overlap, but implementation should be sequenced (caching first or rebase this change on it).
