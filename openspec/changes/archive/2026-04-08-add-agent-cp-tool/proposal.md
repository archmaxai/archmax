# Change: Add cp tool to the semantic model agent

## Why
The agent can move files (`mv`) but has no way to copy them. Duplicating a semantic model or dataset currently requires reading the file content and writing it to a new path — two tool calls instead of one. A dedicated `cp` tool provides an atomic copy within the project sandbox, following the same safety pattern (path traversal checks, symlink rejection, overwrite guard) as `mv` and `rm`.

## What Changes
- Add a `copy()` method to `ValidatingFilesystemBackend` in `@archsem/core/services/agent-filesystem` that copies a file or directory within the project sandbox
- Register a new `cp` LangChain tool (following the same pattern as `mv` and `rm`) with the deep agent
- Add a frontend tool-call card visualization for the `cp` tool (filesystem-style card with "Copied x → y" label)
- Update the semantic-model-agent spec to include `cp` in the filesystem tool list

## Impact
- Affected specs: semantic-model-agent
- Affected code: `packages/core/src/services/agent-filesystem.ts`, `packages/core/src/services/agent-tools.ts`, `packages/core/src/services/agent.ts`, `apps/frontend/src/components/chat/tool-metadata.ts`, `apps/frontend/src/components/chat/tool-expanded.tsx`
