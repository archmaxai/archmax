---
name: /large-refactor
id: large-refactor
category: Quality
description: Scan the codebase for structural improvements and execute them safely.
---

**When to use**

Use after a burst of feature work when you suspect accumulated cruft: dead code, duplicated logic, oversized files, or misplaced responsibilities. For changes that alter behaviour, add capabilities, or break APIs, use `/openspec-proposal` instead.

**Guardrails**

- Do not change observable behaviour. Every refactoring must be a pure structural improvement.
- Commit or stash any uncommitted work before starting so you can revert if needed.
- Work in small, independently verifiable steps — one concern per pass.

**Steps**

1. **Identify candidates.** Scan across `packages/core/src/`, `apps/api/src/`, `apps/frontend/src/`, and `apps/worker/src/` for:
   - **Dead code** — unused exports, unreferenced files, stale imports. Use TypeScript's `--noUnusedLocals` diagnostics and search for exports with zero consumers.
   - **Large files** — any file over ~300 lines that mixes multiple concerns (e.g., route definitions + business logic + type definitions). Split along responsibility boundaries.
   - **Duplication** — near-identical logic in multiple places that should be a shared utility in `@archmax/core` or `@archmax/ui`.
   - **Misplaced logic** — business rules in route handlers (move to `@archmax/core/services`), UI logic in API code, shared types duplicated across packages.
   - **Inconsistent patterns** — places that deviate from project conventions (see `openspec/project.md`): raw `throw` instead of `AppError`, class components, missing Zod validation, `require()` in ESM code.
2. **Prioritize.** List findings by impact (most duplicated / most confusing / most fragile first). Present the list and confirm scope before proceeding.
3. **Execute.** For each approved refactoring:
   - Make the change.
   - Update all import paths (ESM, file extensions).
   - Update or create colocated tests.
   - Run verification:
     ```bash
     pnpm typecheck && pnpm lint && pnpm test
     ```
     If you touched `apps/api`:
     ```bash
     pnpm --filter @archmax/api build
     ```
4. **Summarize.** After all changes, provide a before/after summary: what moved, what was deleted, what was consolidated, and the verification results.
