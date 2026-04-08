# Change: Add YAML syntax validation on agent write_file and edit_file

## Why
The semantic model agent uses Deep Agent filesystem tools (`write_file`, `edit_file`) to create and modify YAML files. If the LLM produces syntactically invalid YAML (bad indentation, unmatched quotes, invalid characters), the content is silently persisted to disk. Downstream reads then skip the file or fail, with no feedback to the agent about what went wrong. Validating YAML syntax before writing lets the agent see the parse error and self-correct.

## What Changes
- Subclass `FilesystemBackend` as `ValidatingFilesystemBackend` in `packages/core/src/services/agent.ts` (or a new file)
- Override `write()` to parse content through `js-yaml` when the file path ends in `.yaml` / `.yml`; return a `WriteResult` with an error message if parsing fails
- Override `edit()` to read-back the resulting content after the parent edit succeeds and validate it the same way; if invalid, return an `EditResult` with an error (the edit will already have been applied in-memory for virtual mode, but the error signals the agent to fix it)
- Use the new subclass in `createSemlayerAgent` instead of the base `FilesystemBackend`

## Impact
- Affected specs: `semantic-model-agent`
- Affected code: `packages/core/src/services/agent.ts`
