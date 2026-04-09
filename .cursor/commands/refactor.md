---
name: /refactor
id: refactor
category: Quality
description: Clean up and improve code written in the current session.
---

**Scope**

Review only the files changed during this session. Do not expand to unrelated areas.

**Steps**

1. Re-read every file you edited in this session. For each file, check:
   - **Dead code** — unused imports, unreachable branches, commented-out blocks. Remove them.
   - **Duplication** — repeated logic that could be extracted to a shared helper in `@archmax/core` or a local utility.
   - **Naming** — variables, functions, and types should be self-documenting. Rename anything ambiguous.
   - **Type safety** — eliminate `any`, `as` casts, and non-null assertions (`!`) where a proper type or guard is feasible. This project uses `strict: true` everywhere.
   - **Error handling** — use `AppError` factory methods (`badRequest`, `notFound`, etc.) in API/service code instead of raw `throw new Error`.
   - **Comments** — remove comments that just narrate what the code does. Keep only comments that explain non-obvious intent or constraints.
2. Check that shared logic is in the right package:
   - Business logic, models, services → `@archmax/core`
   - UI components, variants → `@archmax/ui`
   - Route-specific logic → the app that owns it (`apps/api`, `apps/frontend`, etc.)
3. If you split or moved files, update all import paths. This is ESM-only — ensure file extensions are correct where required.
4. Verify the changes compile and lint cleanly:
   ```bash
   pnpm typecheck && pnpm lint
   ```
   If you touched `apps/api`, also run its emitting build:
   ```bash
   pnpm --filter @archmax/api build
   ```
5. Run tests for affected projects to confirm nothing broke:
   ```bash
   pnpm vitest run --project <core|api|frontend|worker>
   ```
