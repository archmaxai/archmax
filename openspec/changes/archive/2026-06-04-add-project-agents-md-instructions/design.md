## Context

Each project directory (`<ARCHMAX_DATA_DIR>/projects/<projectId>/`) currently gets an auto-generated `AGENTS.md` summarizing its semantic models, regenerated after every model `write()`/`delete()` by `SemanticModelFileService.regenerateAgentsMd`. A codebase audit shows the file is written but never read by any agent, MCP tool, or API route — it exists only as a discovery convention for external assistants.

Separately, the authoring agent (`createSemlayerAgent`) is a Deep Agents (`deepagents` v1.10.2) agent whose filesystem backend is rooted at the project directory. `createDeepAgent` exposes a native `memory?: string[]` option that loads the listed paths (AGENTS.md files, relative to the backend root) and injects their contents into the system prompt via the built-in `MemoryMiddleware`. The middleware tolerates missing files (returns `null`, logs at debug, injects "(No memory loaded)").

This lets us repurpose the project-root `AGENTS.md` slot for optional user-authored instructions with zero custom file-reading code.

## Goals / Non-Goals

- Goals:
  - Allow an optional, user-authored project-root `AGENTS.md` to steer the authoring agent.
  - Use the library's `memory` option (no bespoke reader, no custom path).
  - Stop auto-generating the (unused) summary and free the slot cleanly.
- Non-Goals:
  - Wiring the file into the playground/test agent (`createPlaygroundAgent`).
  - A UI editor for `AGENTS.md` (it is edited like any other project file).
  - Multiple/nested memory sources or per-user global memory.

## Decisions

- **Decision: Use `createDeepAgent({ memory: ["AGENTS.md"] })`** in `createSemlayerAgent`. The path is relative to the existing `ValidatingFilesystemBackend` rooted at `projectDir`, so it resolves to the project root. No new dependency; `memory` is built in.
  - Alternatives considered: a custom `fs.readFile` + string concat into `buildSystemPrompt`. Rejected — duplicates library behavior, the user explicitly asked to use the library's default mechanism with no custom path.
- **Decision: Remove `regenerateAgentsMd` and its two call sites** rather than redirect it to a different filename. The output is unused, so keeping it under a new name adds dead I/O.
- **Decision: Add base-prompt guidance** in the agent prompt (`agent-tools.ts` / `semantic-model-agent.md`) telling the agent that an optional project-root `AGENTS.md` may contain project-specific instructions it must honor. This complements the library's injected memory block (which carries the content).
- **Decision: One-time startup cleanup of legacy auto-generated files**, identified by the `# Semantic Models` header signature, so existing deployments don't have the old summary loaded as "instructions". Placed alongside the existing `migrate-src-layout` startup migration.

## Risks / Trade-offs

- **Signature collision**: a user-authored file that legitimately begins with `# Semantic Models` would be deleted by cleanup. → Single-user system, low likelihood; cleanup runs only at startup and the header is specific. Documented as a known edge.
- **Untrusted instructions**: `AGENTS.md` content is injected into the system prompt. → This is single-user, owner-authored content (same trust level as the project's YAML files), so no new trust boundary is crossed.
- **Backend read semantics**: `memory` loads through the project backend; the backend must surface the project-root file. → `AGENTS.md` lives at the backend root (`projectDir`), which the backend already exposes; verified the middleware reads via `backend.read`/`downloadFiles`.

## Migration Plan

1. Add `memory: ["AGENTS.md"]` to `createSemlayerAgent` and the prompt guidance.
2. Remove `regenerateAgentsMd` + call sites.
3. Add startup cleanup for signature-matched legacy files (idempotent).
4. Update docs + `openspec/project.md`.
- Rollback: revert the commits; no schema or data-shape changes. Removed `AGENTS.md` files are non-critical (regenerable summaries) and not depended upon.

## Open Questions

- Should the playground/test agent also load the project `AGENTS.md`? Defaulting to no; easy to extend later if desired.
