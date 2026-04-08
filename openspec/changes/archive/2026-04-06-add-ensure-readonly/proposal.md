# Change: Add Ensure Readonly project setting

## Why
The agent's `executeQuery` tool and DuckDB federation layer currently hardcode read-only enforcement. Making this a per-project setting gives admins explicit control and opens the door for future write-capable workflows while keeping the safe default.

## What Changes
- Add `ensureReadonly` boolean field to the Project model (default `true`)
- Expose the field in the Project CRUD API (create / update / read)
- Pass the flag through to `getProjectInstance` so DuckDB connections are attached with or without `READ_ONLY` based on the setting
- Pass the flag through to the agent's `executeQuery` tool so application-level SQL validation is skipped when `ensureReadonly` is `false`
- Surface the toggle in the frontend project Settings page

## Impact
- Affected specs: `project-management`, `data-connections`, `semantic-model-agent`
- Affected code: `packages/core/src/models/Project.ts`, `packages/core/src/services/duckdb.ts`, `apps/api/src/services/agent.ts`, `apps/api/src/routes/projects.ts`, `apps/frontend/src/routes/_auth/$projectId/settings.tsx`
