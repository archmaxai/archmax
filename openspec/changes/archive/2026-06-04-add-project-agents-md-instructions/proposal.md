# Change: Optional project-root AGENTS.md as agent instructions

## Why

Project owners have no way to give the semantic-model authoring agent durable, project-specific guidance (domain glossary, naming conventions, "always do X"). Meanwhile the project root already writes an auto-generated `AGENTS.md` that summarizes the models — but nothing in the app ever reads it, so the slot is wasted. We can repurpose that slot: stop auto-generating the summary and instead let an optional, user-authored `AGENTS.md` at the project root be loaded into the agent via the Deep Agents library's built-in `memory` feature.

## What Changes

- **BREAKING (internal):** Stop auto-generating the project-root `AGENTS.md` summary. Remove `regenerateAgentsMd` and its calls in `SemanticModelFileService.write()` / `delete()`.
- Load an optional `AGENTS.md` at the project root into the authoring agent using Deep Agents' native `memory: ["AGENTS.md"]` option (path relative to the agent's project-scoped filesystem backend) — no custom file-reading code. When the file is absent the agent starts normally (the library tolerates a missing source).
- Add guidance to the agent's base system prompt describing the optional `AGENTS.md` and instructing the agent to follow any project-specific instructions found there.
- On startup, remove pre-existing auto-generated `AGENTS.md` files (identified by their generated header signature) so the slot is genuinely free for user authorship and the stale summary is not injected as instructions. User-authored files are preserved.
- Update the documentation site and `openspec/project.md` to reflect that the project-root `AGENTS.md` is now an optional user-authored instructions file (not auto-generated).

## Impact

- Affected specs: `semantic-model-agent` (ADDED), `semantic-models` (REMOVED + ADDED cleanup)
- Affected code:
  - `packages/core/src/services/semantic-model-files.ts` (remove `regenerateAgentsMd` + call sites)
  - `packages/core/src/services/agent.ts` (`createSemlayerAgent` — add `memory: ["AGENTS.md"]`)
  - `packages/core/src/services/agent-tools.ts` (`buildSystemPrompt` / agent prompt — add AGENTS.md guidance)
  - Startup migration (alongside `migrate-src-layout`) for legacy file cleanup
  - `apps/docs` configuration/usage pages and `openspec/project.md`
- Scope decision: only the main authoring agent (`createSemlayerAgent`) loads the file; the playground/test agent (`createPlaygroundAgent`) is out of scope (it has its own per-agent system prompt and a consumer-style role).
