## 1. Load optional AGENTS.md into the authoring agent

- [x] 1.1 In `packages/core/src/services/agent.ts` (`createSemlayerAgent`), pass `memory: ["AGENTS.md"]` to `createDeepAgent` so the project-root file is loaded via the Deep Agents `memory` feature (path relative to the project-scoped backend).
- [x] 1.2 In the agent base prompt (`packages/core/prompts/semantic-model-agent.md`), add a "Project Instructions" section describing the optional project-root `AGENTS.md` and instructing the agent to follow any project-specific instructions found there.
- [x] 1.3 Add a unit test (`packages/core/src/services/agent.create.test.ts`) asserting the agent is configured with the `AGENTS.md` memory source.

## 2. Stop auto-generating the summary

- [x] 2.1 Remove `regenerateAgentsMd` from `packages/core/src/services/semantic-model-files.ts` and its calls in `write()` and `delete()`.
- [x] 2.2 Confirm no tests assert the auto-generated `AGENTS.md` is written (none existed).

## 3. Legacy file cleanup on startup

- [x] 3.1 Implement `SemanticModelFileService.cleanupLegacyAgentsMd()` that deletes project-root `AGENTS.md` files whose content begins with `# Semantic Models`, preserving user-authored files; idempotent. Call it on startup from `apps/api/src/index.ts`.
- [x] 3.2 Add tests covering: auto-generated file removed, user-authored file preserved, idempotent / missing-dir tolerance.

## 4. Documentation & conventions

- [x] 4.1 Update `apps/docs` (`guides/semantic-models.mdx`) to document the optional project-root `AGENTS.md` as user-authored agent instructions and that it is no longer auto-generated.
- [x] 4.2 Update `openspec/project.md` domain note that previously stated each project directory contains an auto-generated `AGENTS.md`.

## 5. Verification

- [x] 5.1 Run `pnpm typecheck` and `pnpm lint` (both exit 0).
- [x] 5.2 Run `npx vitest run` (982 tests pass).
- [x] 5.3 `openspec validate add-project-agents-md-instructions --strict` passes.
