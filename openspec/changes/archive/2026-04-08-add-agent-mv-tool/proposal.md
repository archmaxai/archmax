# Change: Add mv tool to the semantic model agent

## Why
The agent can create, read, edit, and delete files but has no way to move them. When reorganizing semantic models — e.g. moving a model from `sales.yaml` to `retail/sales.yaml`, or renaming a dataset file — the agent must delete and re-create the file, losing atomicity and risking data loss on partial failure. A dedicated `mv` tool fills this gap.

## What Changes
- Add a `mv()` method to `ValidatingFilesystemBackend` in `@semlayer/core/services/agent` that performs a safe move within the project sandbox (path traversal checks, symlink rejection)
- Register a new `mv` LangChain tool (following the same pattern as the `rm` tool) with the deep agent
- Add a frontend tool-call card visualization for the `mv` tool (filesystem-style card with source → destination label)
- Update the semantic-model-agent spec to include the `mv` tool in the filesystem tool list

## Impact
- Affected specs: semantic-model-agent
- Affected code: `packages/core/src/services/agent.ts`, `apps/frontend/src/components/chat/tool-call-card.tsx`
