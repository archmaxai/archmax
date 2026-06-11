# Tasks — restructure-agent-platform

> Sequencing note: coordinate with the active `add-llm-prompt-caching` change — both edit `packages/core/src/services/agent.ts` and `playground-agent.ts`. Land one before starting the other's section 3/4 work.

## 1. Data model & migration

- [ ] 1.1 Extend `Project` model with `builderLlm` and `agentLlm` subdocuments (encryption via `ENCRYPTION_KEY`, SSRF base-URL validation lifted from `TestAgent`); unit tests for validation and encryption
- [ ] 1.2 Remove `testAgent` from `TestCase`; make `testAgent` optional/legacy on `TestRun`, add `llmModel` snapshot field and optional `testAgentName` snapshot; add `playground` flag to `Conversation`
- [ ] 1.3 Schema migration `00X-drop-test-agents`: **backfill `TestRun.testAgentName` from each run's `testAgent.name` first**, then soft-delete all `TestAgent` docs, `$unset TestCase.testAgent`, set `playground: true` on conversations that have a `testAgent` reference; migration test asserting legacy run names survive
- [ ] 1.4 Delete `packages/core/src/models/TestAgent.ts` and its exports/usages

## 2. LLM settings API & resolution

- [ ] 2.1 New `apps/api/src/routes/llm-settings.ts`: GET/PUT `/builder`, GET/PUT `/agent`, POST `/{builder,agent}/test-connection`. GET responses return **non-secret metadata only** (`apiKeySet`/`apiKeySource`, never a key string — masked or otherwise); re-encrypt on new key; SSRF re-validation. Add `zValidator` gates: `projectId` ObjectId param, bounded `baseUrl`/`model`/`systemPrompt`/`apiKey` body fields, clear-field semantics for builder overrides, no-body validation for test-connection. Integration tests including one asserting `AGENT_API_KEY` never appears (even partially) in any response/placeholder/log/error
- [ ] 2.2 Builder LLM resolution helper in core: per-field `Project.builderLlm` → env (`AGENT_API_BASE_URL`/`AGENT_API_KEY`/`AGENT_MODEL`); wire into `createSemlayerAgent(projectId)` and title agent base config
- [ ] 2.3 Expose per-project `builderConfigured` / `agentConfigured` on **project-scoped, authenticated** surfaces (the llm-settings GETs' `configured` flag and/or `GET /api/projects/:projectId`); do **not** add per-project flags to the global `/api/config` route
- [ ] 2.4 Remove `apps/api/src/routes/test-agents.ts` and its app mount

## 3. Single project agent (playground & test harness)

- [ ] 3.1 Rework `createPlaygroundAgent` to take `projectId` and read `Project.agentLlm` (config, system prompt, all-models scope); 400 path when unconfigured
- [ ] 3.2 Update playground routes (`chat`, `cancel`, `subscribe`, conversation list) to drop `testAgentId`; persist conversations with `playground: true`. Partition histories: Agent endpoints filter `playground: true`, Builder endpoints filter `playground: { $ne: true }` (replace the old `testAgent: null` filter), and cross-surface loads return 404; add tests asserting playground chats do not leak into Builder history
- [ ] 3.3 Update `apps/worker/src/processor.ts` branching (playground flag instead of `testAgentId`) and `test-runner.ts` to use the project agent; snapshot `llmModel` onto new runs
- [ ] 3.4 Test-runs API: reject `POST /` with 400 when `agentLlm` is unconfigured; list/detail payloads expose `llmModel` for new runs and the `testAgentName` snapshot (falling back to "Legacy agent") for pre-migration runs **without populating the soft-deleted `testAgent`**; update tests
- [ ] 3.5 Builder agent tools: remove `list_test_agents`, drop `testAgentId` from `create_test_case`, drop `testAgent` from `list_test_cases` output; update `semantic-model-agent.md` prompt accordingly

## 4. Agent scaffold

- [ ] 4.0 Rename model storage `src/` → `data_models/`: update `SemanticModelFileService` (path constant + legacy `src/`/root fallbacks) and the agent `FilesystemBackend` prompt guidance; replace `migrate-src-layout.ts` with `migrate-data-models-layout.ts` (idempotent startup move from `src/` or root, preserving `uploads/` and scaffold dirs); update/extend tests
- [ ] 4.0a Remove the build step: delete `PublishService.assemble()`/`cleanStaleFiles()`; point both production and testing MCP routes (`archmax-route.ts`) at the live `data_models/` via in-memory `SemanticModelFileService.get()` (drop the `build/` read and temp-assembly); update `archmax-route`/`mcp-tools` empty-state message; remove the `build/` read path; update MCP tests
- [ ] 4.0b Publish = Git versioning only: remove `assemble()` from `finalizePublish` (`publish-flow.ts`) and the revert path (`git.ts`); keep/retarget `computeSourceHash()` to hash `data_models/` + scaffold source (exclude derived/internal); drop `build/` from `DEFAULT_GITIGNORE`; reframe publish dialog copy (version/share, not "make available via MCP"); update publish + git tests
- [ ] 4.0c Startup `build/` cleanup: idempotently remove any `build/` directory under each project dir on startup (mirror the existing `AGENTS.md` cleanup); test
- [ ] 4.1 `.mcp.json` seeding service: create on project creation, recreate-if-missing on builder start, update on slug change; preserve foreign entries **only when credential-safe** (warn + refuse to re-persist secret-looking entries); placeholder token only; unit tests
- [ ] 4.2 Credential-safe JSON validation on `write_file`/`edit_file` for `.json` paths in the builder filesystem backend: syntax check (mirroring YAML validation) **plus** rejection of literal credential values in `.mcp.json` headers/env/URLs (allow only `${VAR}` placeholders); tests including the literal-Bearer-token rejection case
- [ ] 4.3 Extend the builder system prompt with the scaffold layout and skills-over-commands guidance
- [ ] 4.4 `GET /api/projects/:projectId/scaffold/export` zip endpoint with `projectId` param validation; runtime denylist (`.git/`, `large_tool_results/`, `uploads/`, `duckdb.db*`, temp files) **plus** secret-file exclusions (`.env*`, `.npmrc`, `.pypirc`, `.netrc`, `.git-credentials`, `id_*`, `*.pem`/`*.key`/`*.p12`/`*.pfx`, `credentials*`) and a content scan that **fails the export closed** on secret patterns; integration tests asserting exclusions, the fail-closed path, and absence of secret material
- [ ] 4.5 Ensure scaffold directories are covered by Git versioning (review `git.ts` ignore rules) and publish flow

## 5. Navigation & settings UI

- [ ] 5.1 Restructure `app-sidebar.tsx`: Connections group (Data Sources + disabled APIs w/ "soon" tag), Builder leaf, Agent leaf, Testing group (Cases, Runs), Settings group (General, Builder, Agent)
- [ ] 5.2 New routes `settings/builder.tsx` and `settings/agent.tsx` (inline label–input grids; API-key fields show a fixed non-derived hint from `apiKeySet`/`apiKeySource`, never key material; env-default placeholders for builder baseUrl/model only; save-then-test connection buttons; reset-to-defaults for builder); move existing settings page to General
- [ ] 5.3 Route moves & redirects: `testing/playground → /agent`, `testing/agents → /settings/agent`, `connections/data` + legacy `/data` → `/connections?tool=browser`, `connections/console → /connections?tool=console`; delete the Test Agents page and `testing/agents.tsx`

## 6. Data Sources header tools

- [ ] 6.1 Header controls on `connections/index.tsx`: Browser (icon+text), Console (icon-only), Re-initialize schemas (icon-only with tooltip); `tool` search param handling
- [ ] 6.2 Full-width/full-height overlay dialogs (shadow, `bg-popover`) hosting the existing data-browser and console components; deep-link open on `?tool=`, param cleared on close

## 7. Builder page restructure

- [ ] 7.1 Side panel sections: Agent Scaffold (Data Models list + Publish + Export action; disabled API Models w/ "soon" tag), Build (renamed Chat), Improvements & Testing
- [ ] 7.2 `GET /api/projects/:projectId/test-cases/latest-results` endpoint (`projectId` param validation) returning per-case `inputMessage` and `unmetFacts` (unmet expected facts from the latest result) so the panel can build the refine prefill without a second request; tests
- [ ] 7.3 Improvements & Testing panel: failing-test entries (icon, link to latest run, refine prefill affordance built from `inputMessage` + `unmetFacts`), combined pending-count badge, updated empty state
- [ ] 7.4 Agent page (`agent.tsx`): playground chat without agent selector, history panel, unconfigured empty state linking to Settings → Agent
- [ ] 7.5 Update the configuration-missing banner to be project-aware and link to the settings pages

## 8. Testing pages cleanup

- [ ] 8.1 Test Cases page: remove agent column/filter/selector; gate Run Test / Run Batch on `agentConfigured` with pointer to Settings → Agent
- [ ] 8.2 Test Runs list/detail: show model snapshot (legacy agent name fallback); verify Refine flow against renamed Build chat
- [ ] 8.3 Dashboard: rename model card to "Data Models"

## 9. Verification

- [ ] 9.1 Update/extend unit & integration tests across touched routes and services; `npx vitest run` green
- [ ] 9.2 Update e2e tests for new navigation, dialogs, settings pages, and single-agent flows
- [ ] 9.3 `pnpm typecheck` and `pnpm lint` exit 0; `pnpm --filter @archmax/api build` passes

## 10. Documentation

- [ ] 10.1 Update `apps/docs`: navigation/screens in getting-started and guides, testing guide (single agent, Settings → Agent), configuration reference (per-project LLM settings, env fallback), data-federation guide (console/browser as dialogs)
- [ ] 10.2 New docs guide: "Agent Scaffold" (layout, `.mcp.json`, export, harness usage with LangChain Deep Agents)
- [ ] 10.3 Update `.env.example` comments to mention per-project overrides
